<?php
// A student answers (or skips, when the teacher allowed it) a question placed
// inside a story activity (js/story-questions.js). Only a student of the
// activity's classroom can answer, only that activity's questions, and each
// question only once: the first answer stands, so a retry or a second tab
// never changes a saved answer. Answers are checked here against the key -
// identification without capitals or extra spaces, an essay waits for the
// teacher - and kept in the student's own submission for the activity
// (activity_submissions / activity_submission_answers), with its score.
//
//   POST JSON { activity, question, answer?: <choiceId> | "<text>", skip?: true }
//     -> { success, saved: { correct|null, pending, points, max } }
require_once('teacher_auth.php');

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');
$user = koobdRequireStudentAuth(true);
$userId = (int)$user['id'];

function storyAnswerFail(int $code, string $message): void
{
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $message]);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) {
    storyAnswerFail(405, 'Invalid request.');
}
$input = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($input)) {
    storyAnswerFail(400, 'Your answer could not be read.');
}

$activity = koobdStudentActivity((int)($input['activity'] ?? 0), $userId);
if (!$activity || ($activity['activity_type'] ?? 'story') !== 'story') {
    storyAnswerFail(404, 'This activity is not available.');
}
// Past its due date the activity is closed: no more answers.
if (koobdActivityClosed($activity)) {
    storyAnswerFail(403, 'This activity is closed: its due date has passed.');
}
$activityId = (int)$activity['id'];
$questionId = (int)($input['question'] ?? 0);
$questions = koobdQuizQuestions($activityId, true);
$question = null;
foreach ($questions as $candidate) {
    if ($candidate['id'] === $questionId && $candidate['point'] !== null) {
        $question = $candidate;
    }
}
if (!$question) {
    storyAnswerFail(404, 'That question is not part of this activity.');
}

// The answer, as the question's type expects it.
$skip = !empty($input['skip']);
$value = null;
if ($skip) {
    if (!$question['optional']) {
        storyAnswerFail(422, 'This question needs an answer before the story continues.');
    }
} elseif ($question['type'] === 'speak' && !empty($input['noMic'])) {
    // "Say it" on a device that cannot listen: saved as not spoken (no
    // points), so the story can go on.
    $value = '';
} elseif (koobdQuizIsTyped($question['type'])) {
    $text = is_string($input['answer'] ?? null) || is_numeric($input['answer'] ?? null) ? trim((string)$input['answer']) : '';
    if ($text === '') {
        storyAnswerFail(422, 'Type your answer first.');
    }
    $value = function_exists('mb_substr') ? mb_substr($text, 0, $question['type'] === 'essay' ? 10000 : 500) : substr($text, 0, 10000);
} else {
    $choice = is_numeric($input['answer'] ?? null) ? (int)$input['answer'] : 0;
    if (!in_array($choice, array_column($question['choices'], 'id'), true)) {
        storyAnswerFail(422, 'Choose one of the answers first.');
    }
    $value = $choice;
}

$conn->begin_transaction();
try {
    // The student's submission for this activity (made on their first answer).
    $conn->query("INSERT IGNORE INTO activity_submissions (activity_id, student_user_id, score, total) VALUES ($activityId, $userId, 0, 0)");
    $find = $conn->prepare("SELECT id FROM activity_submissions WHERE activity_id = ? AND student_user_id = ? FOR UPDATE");
    $find->bind_param('ii', $activityId, $userId);
    $find->execute();
    $submissionId = (int)($find->get_result()->fetch_row()[0] ?? 0);
    $find->close();

    $existing = $conn->query("SELECT 1 FROM activity_submission_answers WHERE submission_id = $submissionId AND question_id = $questionId")->fetch_row();
    if (!$existing) {
        [, , , $results] = koobdQuizGrade([$question], $skip ? [] : [$questionId => $value]);
        $result = $results[$questionId];
        $choiceId = $result['choice'];
        $text = $skip ? null : $result['text'];
        $correct = $result['correct'] ? 1 : 0;
        $points = $result['points'];
        $max = (int)$result['max'];
        $insert = $conn->prepare(
            "INSERT IGNORE INTO activity_submission_answers (submission_id, question_id, choice_id, answer_text, is_correct, points_awarded, max_points)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        $insert->bind_param('iiisiii', $submissionId, $questionId, $choiceId, $text, $correct, $points, $max);
        $insert->execute();
        $insert->close();
    }

    // The submission's score: every question of the activity counts toward
    // the total; points come from the questions answered so far.
    $total = array_sum(array_column($questions, 'points'));
    $sums = $conn->query(
        "SELECT COALESCE(SUM(points_awarded), 0), COALESCE(SUM(points_awarded IS NULL), 0)
         FROM activity_submission_answers WHERE submission_id = $submissionId"
    )->fetch_row();
    $score = (int)$sums[0];
    $pending = (int)$sums[1];
    $update = $conn->prepare("UPDATE activity_submissions SET score = ?, total = ?, pending = ?, submitted_at = CURRENT_TIMESTAMP WHERE id = ?");
    $update->bind_param('iiii', $score, $total, $pending, $submissionId);
    $update->execute();
    $update->close();
    $conn->commit();
} catch (Throwable $error) {
    $conn->rollback();
    storyAnswerFail(500, 'Your answer could not be saved. Please try again.');
}

// What was saved (the first answer, if this one came twice).
$saved = $conn->query(
    "SELECT is_correct, points_awarded, max_points, choice_id, answer_text FROM activity_submission_answers
     WHERE submission_id = $submissionId AND question_id = $questionId"
)->fetch_assoc();
$isEssay = $question['type'] === 'essay';
$skipped = $saved && $saved['choice_id'] === null && $saved['answer_text'] === null;
echo json_encode([
    'success' => true,
    'saved' => [
        'skipped' => $skipped,
        'pending' => $isEssay && !$skipped && $saved['points_awarded'] === null,
        // Whether it was right is only told when the activity shows answers.
        'correct' => ($isEssay || $skipped || (int)($activity['show_answers'] ?? 1) !== 1) ? null : (int)$saved['is_correct'] === 1,
        'points' => $saved['points_awarded'] === null ? null : (int)$saved['points_awarded'],
        'max' => (int)$saved['max_points'],
    ],
]);
