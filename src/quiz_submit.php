<?php
// A student submits their answers to a question activity (quiz_take.php).
// Only a student who has joined the classroom can submit, only to a published
// activity, and only once. The answers are checked here against the answer
// key - never in the browser - and saved with the score and the time.
//
//   POST JSON { activityId, answers: { <questionId>: <choiceId> | "<typed answer>", ... } }
//   (a choice for multiple choice and true/false; text for identification and
//   essay). Identification is checked against its accepted answers; an essay
//   waits for the teacher to grade it.
//     -> { success, alreadySubmitted?, review: { score, total, percent, submittedAt, showsKey, questions } }
require_once('teacher_auth.php');

header('Content-Type: application/json; charset=UTF-8');
$user = koobdRequireStudentAuth(true);
$userId = (int)$user['id'];

function quizSubmitFail(int $code, string $message): void
{
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $message]);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    quizSubmitFail(405, 'Invalid request method.');
}
$input = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($input)) {
    quizSubmitFail(400, 'Your answers could not be read.');
}

$activityRow = koobdStudentActivity((int)($input['activityId'] ?? 0), $userId);
if (!$activityRow || ($activityRow['activity_type'] ?? '') !== 'quiz') {
    quizSubmitFail(404, 'This activity is not available.');
}
$activityId = (int)$activityRow['id'];
$showKey = (int)($activityRow['show_answers'] ?? 1) === 1;
$shuffle = (int)($activityRow['shuffle_questions'] ?? 0) === 1;
// The review lists the questions in the order this student had them.
$order = koobdQuizOrderFor($activityId, $userId, koobdQuizQuestions($activityId), $shuffle);

// Already submitted: nothing changes; their saved result comes back.
$existing = koobdQuizReview($activityId, $userId, $showKey, $order);
if ($existing) {
    echo json_encode(['success' => true, 'alreadySubmitted' => true, 'review' => $existing]);
    exit();
}

// Past its due date the quiz is closed: no new answers are taken.
if (koobdActivityClosed($activityRow)) {
    quizSubmitFail(403, 'This quiz is closed: its due date has passed, so answers can no longer be submitted.');
}

$questions = koobdQuizQuestions($activityId, true);
$types = array_column($questions, 'type', 'id');
$cut = static fn(string $text, int $max): string => function_exists('mb_substr') ? mb_substr($text, 0, $max) : substr($text, 0, $max);
if (!$questions) {
    quizSubmitFail(409, 'This activity has no questions yet.');
}
$answers = [];
foreach ((is_array($input['answers'] ?? null) ? $input['answers'] : []) as $questionId => $value) {
    $type = is_numeric($questionId) ? ($types[(int)$questionId] ?? null) : null;
    if ($type === null) {
        continue;
    }
    if (koobdQuizIsTyped($type)) {
        if (is_string($value) || is_numeric($value)) {
            $answers[(int)$questionId] = $cut(trim((string)$value), $type === 'essay' ? 10000 : 500);
        }
    } elseif (is_numeric($value)) {
        $answers[(int)$questionId] = (int)$value;
    }
}
[$score, $total, $pending, $results] = koobdQuizGrade($questions, $answers);

$conn->begin_transaction();
try {
    $insert = $conn->prepare("INSERT INTO activity_submissions (activity_id, student_user_id, score, total, pending) VALUES (?, ?, ?, ?, ?)");
    $insert->bind_param('iiiii', $activityId, $userId, $score, $total, $pending);
    $insert->execute();
    $submissionId = (int)$insert->insert_id;
    $insert->close();
    koobdQuizStoreAnswers($submissionId, $score, $total, $pending, $results);
    $conn->commit();
} catch (mysqli_sql_exception $error) {
    $conn->rollback();
    // A second submission arriving at the same moment (a double tap) hits the
    // one-per-student rule: the first one stands.
    $existing = koobdQuizReview($activityId, $userId, $showKey, $order);
    if ($existing) {
        echo json_encode(['success' => true, 'alreadySubmitted' => true, 'review' => $existing]);
        exit();
    }
    quizSubmitFail(500, 'Your answers could not be saved. Please try again.');
}

echo json_encode(['success' => true, 'review' => koobdQuizReview($activityId, $userId, $showKey, $order)]);
