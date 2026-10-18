<?php
// A student submits their answers to a question activity (quiz_take.php).
// Only a student who has joined the classroom can submit, only to a published
// activity, and only once. The answers are checked here against the answer
// key - never in the browser - and saved with the score and the time.
//
//   POST JSON { activityId, answers: { <questionId>: <choiceId>, ... } }
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

// Already submitted: nothing changes; their saved result comes back.
$existing = koobdQuizReview($activityId, $userId, $showKey);
if ($existing) {
    echo json_encode(['success' => true, 'alreadySubmitted' => true, 'review' => $existing]);
    exit();
}

$questions = koobdQuizQuestions($activityId, true);
if (!$questions) {
    quizSubmitFail(409, 'This activity has no questions yet.');
}
$answers = [];
foreach ((is_array($input['answers'] ?? null) ? $input['answers'] : []) as $questionId => $choiceId) {
    if (is_numeric($questionId) && is_numeric($choiceId)) {
        $answers[(int)$questionId] = (int)$choiceId;
    }
}
[$score, $total, $results] = koobdQuizGrade($questions, $answers);

$conn->begin_transaction();
try {
    $insert = $conn->prepare("INSERT INTO activity_submissions (activity_id, student_user_id, score, total) VALUES (?, ?, ?, ?)");
    $insert->bind_param('iiii', $activityId, $userId, $score, $total);
    $insert->execute();
    $submissionId = (int)$insert->insert_id;
    $insert->close();
    $write = $conn->prepare("INSERT INTO activity_submission_answers (submission_id, question_id, choice_id, is_correct) VALUES (?, ?, ?, ?)");
    foreach ($results as $questionId => $result) {
        $choice = $result['choice'];
        $correct = $result['correct'] ? 1 : 0;
        $write->bind_param('iiii', $submissionId, $questionId, $choice, $correct);
        $write->execute();
    }
    $write->close();
    $conn->commit();
} catch (mysqli_sql_exception $error) {
    $conn->rollback();
    // A second submission arriving at the same moment (a double tap) hits the
    // one-per-student rule: the first one stands.
    $existing = koobdQuizReview($activityId, $userId, $showKey);
    if ($existing) {
        echo json_encode(['success' => true, 'alreadySubmitted' => true, 'review' => $existing]);
        exit();
    }
    quizSubmitFail(500, 'Your answers could not be saved. Please try again.');
}

echo json_encode(['success' => true, 'review' => koobdQuizReview($activityId, $userId, $showKey)]);
