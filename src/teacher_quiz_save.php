<?php
// Saves a question activity from the editor (teacher_quiz_editor.php). Only the
// teacher who owns the classroom can create, change, publish or delete it.
//
//   POST JSON { action: 'save', classroomId, activityId?, publish: true|false|null,
//               title, description, instructions, dueDate, showAnswers,
//               questions: [{ id?, type: multiple_choice|true_false, prompt,
//                             choices: [{ id?, label, correct }] }] }
//     -> { success, activityId, status, questions (with their ids), errors? }
//   POST JSON { action: 'delete', activityId } -> { success, redirect }
//
// Questions and choices keep their ids when edited, so submitted answers stay
// attached; every submission is then checked again against the new key.
// A draft may be unfinished; publishing needs a title and, for every question,
// a prompt, at least two filled choices and exactly one correct answer.
require_once('teacher_auth.php');

header('Content-Type: application/json; charset=UTF-8');
$teacher = koobdTeacherRequireAuth(true);
$teacherId = (int)$teacher['id'];

function quizSaveFail(int $code, string $message, array $extra = []): void
{
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $message] + $extra);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    quizSaveFail(405, 'Invalid request method.');
}
$input = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($input)) {
    quizSaveFail(400, 'The activity could not be read.');
}
$action = (string)($input['action'] ?? 'save');
$cut = static fn(string $text, int $max): string => function_exists('mb_substr') ? mb_substr($text, 0, $max) : substr($text, 0, $max);

// --- Delete -------------------------------------------------------------------------------
if ($action === 'delete') {
    $activity = koobdTeacherActivity((int)($input['activityId'] ?? 0), $teacherId);
    if (!$activity || ($activity['activity_type'] ?? '') !== 'quiz') {
        quizSaveFail(404, 'That activity could not be found.');
    }
    $delete = $conn->prepare("DELETE FROM classroom_activities WHERE id = ?");
    $delete->bind_param('i', $activity['id']);
    $delete->execute();
    $delete->close();
    echo json_encode(['success' => true, 'redirect' => 'teacher_classroom.php?id=' . (int)$activity['classroom_id'] . '&done=deleted#activities']);
    exit();
}

if ($action !== 'save') {
    quizSaveFail(400, 'Unknown action.');
}

// --- The classroom and, when editing, the activity ---------------------------------------
$activityId = (int)($input['activityId'] ?? 0);
$activity = $activityId > 0 ? koobdTeacherActivity($activityId, $teacherId) : null;
if ($activityId > 0 && (!$activity || ($activity['activity_type'] ?? '') !== 'quiz')) {
    quizSaveFail(404, 'That activity could not be found.');
}
$classroomId = $activity ? (int)$activity['classroom_id'] : (int)($input['classroomId'] ?? 0);
$owns = $conn->prepare("SELECT id FROM classrooms WHERE id = ? AND teacher_id = ? LIMIT 1");
$owns->bind_param('ii', $classroomId, $teacherId);
$owns->execute();
$ownsClassroom = (bool)$owns->get_result()->fetch_assoc();
$owns->close();
if (!$ownsClassroom) {
    quizSaveFail(404, 'That classroom could not be found.');
}

// --- The activity's details -------------------------------------------------------------
$title = $cut(trim((string)($input['title'] ?? '')), 255);
$description = $cut(trim((string)($input['description'] ?? '')), 4000);
$instructions = $cut(trim((string)($input['instructions'] ?? '')), 4000);
$due = trim((string)($input['dueDate'] ?? ''));
$dueDate = preg_match('/^\d{4}-\d{2}-\d{2}$/', $due) && strtotime($due) ? $due : null;
$showAnswers = !empty($input['showAnswers']) ? 1 : 0;
$currentStatus = $activity ? (($activity['status'] ?? 'published') === 'draft' ? 'draft' : 'published') : 'draft';
$publish = $input['publish'] ?? null;
$status = $publish === true ? 'published' : ($publish === false ? 'draft' : $currentStatus);

// --- The questions, cleaned up ------------------------------------------------------------
$questions = [];
foreach (array_slice(is_array($input['questions'] ?? null) ? $input['questions'] : [], 0, 200) as $raw) {
    if (!is_array($raw)) {
        continue;
    }
    $type = ($raw['type'] ?? '') === 'true_false' ? 'true_false' : 'multiple_choice';
    $choices = [];
    $rawChoices = is_array($raw['choices'] ?? null) ? $raw['choices'] : [];
    if ($type === 'true_false') {
        // Always exactly True and False; the teacher picks which is right.
        $rightIsTrue = true;
        foreach ($rawChoices as $index => $choice) {
            if (is_array($choice) && !empty($choice['correct'])) {
                $rightIsTrue = strcasecmp(trim((string)($choice['label'] ?? '')), 'False') !== 0 && $index !== 1;
            }
        }
        foreach (['True', 'False'] as $index => $label) {
            $choices[] = [
                'id' => (int)(is_array($rawChoices[$index] ?? null) ? ($rawChoices[$index]['id'] ?? 0) : 0),
                'label' => $label,
                'correct' => $index === 0 ? $rightIsTrue : !$rightIsTrue,
            ];
        }
    } else {
        foreach (array_slice($rawChoices, 0, 12) as $choice) {
            if (!is_array($choice)) {
                continue;
            }
            $choices[] = [
                'id' => (int)($choice['id'] ?? 0),
                'label' => $cut(trim((string)($choice['label'] ?? '')), 500),
                'correct' => !empty($choice['correct']),
            ];
        }
        // At most one correct answer: the first one marked.
        $seen = false;
        foreach ($choices as &$choice) {
            $choice['correct'] = $choice['correct'] && !$seen;
            $seen = $seen || $choice['correct'];
        }
        unset($choice);
    }
    $questions[] = [
        'id' => (int)($raw['id'] ?? 0),
        'type' => $type,
        'prompt' => $cut(trim((string)($raw['prompt'] ?? '')), 2000),
        'choices' => $choices,
    ];
}

// --- Publishing needs a complete activity ----------------------------------------------
if ($status === 'published') {
    $errors = [];
    if ($title === '') {
        $errors[] = ['field' => 'title', 'message' => 'Give the activity a title.'];
    }
    if (!$questions) {
        $errors[] = ['field' => 'questions', 'message' => 'Add at least one question.'];
    }
    foreach ($questions as $index => $question) {
        $number = $index + 1;
        if ($question['prompt'] === '') {
            $errors[] = ['question' => $index, 'message' => "Question {$number} needs a question."];
        }
        $filled = array_filter($question['choices'], static fn($choice) => $choice['label'] !== '');
        if (count($filled) < 2) {
            $errors[] = ['question' => $index, 'message' => "Question {$number} needs at least two answer choices."];
        }
        if (!array_filter($question['choices'], static fn($choice) => $choice['correct'] && $choice['label'] !== '')) {
            $errors[] = ['question' => $index, 'message' => "Choose the correct answer for question {$number}."];
        }
    }
    if ($errors) {
        quizSaveFail(422, $errors[0]['message'], ['errors' => $errors]);
    }
    // Empty choices are dropped from a published question.
    foreach ($questions as &$question) {
        $question['choices'] = array_values(array_filter($question['choices'], static fn($choice) => $choice['label'] !== ''));
    }
    unset($question);
}

// --- Save --------------------------------------------------------------------------------
$conn->begin_transaction();
try {
    if (!$activity) {
        $next = $conn->prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM classroom_activities WHERE classroom_id = ?");
        $next->bind_param('i', $classroomId);
        $next->execute();
        $position = (int)($next->get_result()->fetch_assoc()['next_position'] ?? 1);
        $next->close();
        $insert = $conn->prepare(
            "INSERT INTO classroom_activities (classroom_id, activity_type, status, title, description, instructions, story_id, due_date, show_answers, position)
             VALUES (?, 'quiz', ?, ?, ?, ?, '', ?, ?, ?)"
        );
        $insert->bind_param('isssssii', $classroomId, $status, $title, $description, $instructions, $dueDate, $showAnswers, $position);
        $insert->execute();
        $activityId = (int)$insert->insert_id;
        $insert->close();
    } else {
        $update = $conn->prepare(
            "UPDATE classroom_activities SET status = ?, title = ?, description = ?, instructions = ?, due_date = ?, show_answers = ? WHERE id = ?"
        );
        $update->bind_param('sssssii', $status, $title, $description, $instructions, $dueDate, $showAnswers, $activityId);
        $update->execute();
        $update->close();
    }

    // Existing questions and choices of this activity, so only those ids are reused.
    $known = koobdQuizQuestions($activityId, true);
    $knownQuestions = [];
    $knownChoices = [];
    foreach ($known as $question) {
        $knownQuestions[$question['id']] = true;
        foreach ($question['choices'] as $choice) {
            $knownChoices[$choice['id']] = $question['id'];
        }
    }

    $keptQuestions = [];
    $insertQuestion = $conn->prepare("INSERT INTO activity_questions (activity_id, position, question_type, prompt) VALUES (?, ?, ?, ?)");
    $updateQuestion = $conn->prepare("UPDATE activity_questions SET position = ?, question_type = ?, prompt = ? WHERE id = ? AND activity_id = ?");
    $insertChoice = $conn->prepare("INSERT INTO activity_choices (question_id, position, label, is_correct) VALUES (?, ?, ?, ?)");
    $updateChoice = $conn->prepare("UPDATE activity_choices SET position = ?, label = ?, is_correct = ? WHERE id = ? AND question_id = ?");
    foreach ($questions as $qIndex => &$question) {
        $position = $qIndex + 1;
        if ($question['id'] > 0 && isset($knownQuestions[$question['id']]) && !isset($keptQuestions[$question['id']])) {
            $updateQuestion->bind_param('issii', $position, $question['type'], $question['prompt'], $question['id'], $activityId);
            $updateQuestion->execute();
        } else {
            $insertQuestion->bind_param('iiss', $activityId, $position, $question['type'], $question['prompt']);
            $insertQuestion->execute();
            $question['id'] = (int)$insertQuestion->insert_id;
        }
        $keptQuestions[$question['id']] = true;

        $keptChoices = [];
        foreach ($question['choices'] as $cIndex => &$choice) {
            $choicePosition = $cIndex + 1;
            $correct = $choice['correct'] ? 1 : 0;
            if ($choice['id'] > 0 && ($knownChoices[$choice['id']] ?? 0) === $question['id'] && !isset($keptChoices[$choice['id']])) {
                $updateChoice->bind_param('isiii', $choicePosition, $choice['label'], $correct, $choice['id'], $question['id']);
                $updateChoice->execute();
            } else {
                $insertChoice->bind_param('iisi', $question['id'], $choicePosition, $choice['label'], $correct);
                $insertChoice->execute();
                $choice['id'] = (int)$insertChoice->insert_id;
            }
            $keptChoices[$choice['id']] = true;
        }
        unset($choice);
        // Choices removed from this question.
        $removeChoices = array_diff(array_keys(array_filter($knownChoices, static fn($owner) => $owner === $question['id'])), array_keys($keptChoices));
        if ($removeChoices) {
            $conn->query("DELETE FROM activity_choices WHERE id IN (" . implode(',', array_map('intval', $removeChoices)) . ")");
        }
    }
    unset($question);
    foreach ([$insertQuestion, $updateQuestion, $insertChoice, $updateChoice] as $statement) {
        $statement->close();
    }
    // Questions removed from the activity.
    $removeQuestions = array_diff(array_keys($knownQuestions), array_keys($keptQuestions));
    if ($removeQuestions) {
        $conn->query("DELETE FROM activity_questions WHERE activity_id = " . (int)$activityId . " AND id IN (" . implode(',', array_map('intval', $removeQuestions)) . ")");
    }

    koobdQuizRegrade($activityId);
    $conn->commit();
} catch (Throwable $error) {
    $conn->rollback();
    quizSaveFail(500, 'The activity could not be saved. Please try again.');
}

echo json_encode([
    'success' => true,
    'activityId' => $activityId,
    'status' => $status,
    'questions' => koobdQuizQuestions($activityId, true),
]);
