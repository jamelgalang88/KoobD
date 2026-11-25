<?php
// A question activity's results, for its teacher: who has submitted, each
// student's score, how the class did on every question (which answers they
// chose or typed), and one student's answers in full (?student=<id>), where
// the teacher grades essays: points and feedback for each.
// For a story activity with questions placed in its story: also how far each
// student has read or played, and where in the story each question is asked.
require_once('teacher_auth.php');
$teacher = koobdTeacherRequireAuth(true);
require_once __DIR__ . '/achievements_lib.php';
$activityId = (int)($_GET['activity'] ?? 0);
$activityRow = koobdTeacherActivity($activityId, (int)$teacher['id']);
if (!$activityRow || !in_array($activityRow['activity_type'] ?? 'story', ['quiz', 'story'], true)) {
    header('Location: classroom.php');
    exit();
}
koobdAchievementRecordEvent($teacher, 'progress_report', 'activity:' . $activityId);
$activity = koobdActivityFromRow($activityRow);
$isStory = $activity['type'] === 'story';
$classroomId = (int)$activity['classroom_id'];
$roomHref = 'teacher_classroom.php?id=' . $classroomId;
$selfHref = 'teacher_quiz_results.php?activity=' . $activityId;

$classStmt = $conn->prepare("SELECT title FROM classrooms WHERE id = ? LIMIT 1");
$classStmt->bind_param('i', $classroomId);
$classStmt->execute();
$classroomTitle = (string)($classStmt->get_result()->fetch_assoc()['title'] ?? 'Classroom');
$classStmt->close();

// The classroom's students and their submissions.
$students = [];
$studentStmt = $conn->prepare(
    "SELECT u.id, u.username, u.selected_reader, u.profile_reader_name, u.profile_badge_label,
            u.profile_top_color, u.profile_bottom_color, u.profile_accent_color, u.profile_card_style,
            u.profile_scale, u.user_role
     FROM classroom_students cs INNER JOIN users u ON u.id = cs.student_user_id
     WHERE cs.classroom_id = ? ORDER BY cs.joined_at ASC"
);
$studentStmt->bind_param('i', $classroomId);
$studentStmt->execute();
foreach ($studentStmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
    $profile = koobdResolvedProfile($row);
    $students[(int)$row['id']] = ['id' => (int)$row['id'], 'name' => $row['username'], 'profile' => $profile['name'], 'asset' => $profile['asset'], 'top' => $profile['top'], 'bottom' => $profile['bottom']];
}
$studentStmt->close();

// Grading an essay: points (0 to what the question is worth) and feedback,
// for a student of this classroom. Back to that student's answers after.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'grade_essay') {
    $studentId = (int)($_POST['student'] ?? 0);
    $questionId = (int)($_POST['question'] ?? 0);
    $feedback = trim((string)($_POST['feedback'] ?? ''));
    $feedback = function_exists('mb_substr') ? mb_substr($feedback, 0, 4000) : substr($feedback, 0, 4000);
    $saved = isset($students[$studentId]) && koobdQuizGradeEssay($activityId, $studentId, $questionId, (int)($_POST['points'] ?? 0), $feedback);
    header('Location: ' . $selfHref . '&student=' . $studentId . ($saved ? '&graded=' . $questionId : '&notgraded=1') . '#question-' . $questionId);
    exit();
}

$submissions = koobdQuizSubmissionMap([$activityId], array_keys($students))[$activityId] ?? [];

$questions = koobdQuizQuestions($activityId, true);
// How every submitted student answered each question: the choices they
// picked, what they typed (identification, grouped by the same answer) and
// how essays stand.
$picks = [];
$rightCounts = [];
$typedAnswers = [];
$essayStats = [];
if ($submissions) {
    $answerResult = $conn->query(
        "SELECT a.question_id, a.choice_id, a.answer_text, a.is_correct, a.points_awarded FROM activity_submission_answers a
         INNER JOIN activity_submissions s ON s.id = a.submission_id
         WHERE s.activity_id = " . (int)$activityId . " AND s.student_user_id IN (" . implode(',', array_map('intval', array_keys($submissions))) . ")"
    );
    while ($answerResult && ($row = $answerResult->fetch_assoc())) {
        $qid = (int)$row['question_id'];
        $rightCounts[$qid] = ($rightCounts[$qid] ?? 0) + ((int)$row['is_correct'] === 1 ? 1 : 0);
        if ($row['answer_text'] !== null) {
            $text = trim((string)$row['answer_text']);
            if ($text === '') {
                $picks[$qid]['none'] = ($picks[$qid]['none'] ?? 0) + 1;
                continue;
            }
            $key = koobdQuizNormalizeAnswer($text);
            $typedAnswers[$qid][$key] = [
                'label' => $typedAnswers[$qid][$key]['label'] ?? $text,
                'count' => ($typedAnswers[$qid][$key]['count'] ?? 0) + 1,
                'correct' => (int)$row['is_correct'] === 1,
            ];
            if ($row['points_awarded'] === null) {
                $essayStats[$qid]['pending'] = ($essayStats[$qid]['pending'] ?? 0) + 1;
            } else {
                $essayStats[$qid]['graded'] = ($essayStats[$qid]['graded'] ?? 0) + 1;
                $essayStats[$qid]['points'] = ($essayStats[$qid]['points'] ?? 0) + (int)$row['points_awarded'];
            }
            continue;
        }
        $key = $row['choice_id'] === null ? 'none' : (int)$row['choice_id'];
        $picks[$qid][$key] = ($picks[$qid][$key] ?? 0) + 1;
    }
}
foreach ($typedAnswers as &$list) {
    uasort($list, static fn($a, $b) => $b['count'] <=> $a['count']);
}
unset($list);

// A story activity: how far each student has read or played (0-100, null if
// not started), how many of its questions each has answered, and the label of
// each question's place in the story.
$reading = $isStory ? (koobdActivityProgressMap([$activity], array_keys($students))[$activityId] ?? []) : [];
$answeredCounts = [];
if ($isStory && $submissions) {
    $countResult = $conn->query(
        "SELECT s.student_user_id, COUNT(a.id) FROM activity_submissions s LEFT JOIN activity_submission_answers a ON a.submission_id = s.id
         WHERE s.activity_id = " . (int)$activityId . " GROUP BY s.student_user_id"
    );
    while ($countResult && ($row = $countResult->fetch_row())) {
        $answeredCounts[(int)$row[0]] = (int)$row[1];
    }
}
$pointLabels = $isStory ? array_column(koobdStoryQuestionPoints($activity['story']), 'label', 'key') : [];
// Where in the story each question is asked (for one student's answers).
$storyPointOf = $isStory ? array_column($questions, 'point', 'id') : [];
$readingText = static function ($value): string {
    if ($value === null) {
        return 'Not started';
    }
    return (int)$value >= 100 ? 'Finished' : 'Reading · ' . (int)$value . '%';
};

$submittedCount = count($submissions);
$studentCount = count($students);
$needGrading = count(array_filter($submissions, static fn($submission) => $submission['pending'] > 0));
$percents = array_column($submissions, 'percent');
$average = $percents ? (int)round(array_sum($percents) / count($percents)) : null;
$highest = $percents ? max($percents) : null;
$lowest = $percents ? min($percents) : null;
$hasEssays = (bool)array_filter($questions, static fn($question) => $question['type'] === 'essay');
$typeLabels = ['speak' => 'Say it', 'multiple_choice' => 'Multiple choice', 'true_false' => 'True or False', 'identification' => 'Identification', 'essay' => 'Essay'];

$focusStudent = isset($_GET['student'], $students[(int)$_GET['student']]) ? $students[(int)$_GET['student']] : null;
$focusReview = $focusStudent ? koobdQuizReview($activityId, $focusStudent['id'], true) : null;
$gradedQuestion = (int)($_GET['graded'] ?? 0);
// After grading, the next student whose essays are still waiting.
$nextToGrade = null;
if ($focusStudent) {
    foreach ($students as $student) {
        if ($student['id'] !== $focusStudent['id'] && ($submissions[$student['id']]['pending'] ?? 0) > 0) {
            $nextToGrade = $student;
            break;
        }
    }
}
$when = static fn(string $time): string => $time !== '' ? date('M j, Y g:i A', strtotime($time)) : '';
$scoreText = static function (array $submission): string {
    $text = $submission['score'] . '/' . $submission['total'] . ' <span class="quiz-muted">(' . $submission['percent'] . '%)</span>';
    return $submission['pending'] > 0 ? $text . ' <span class="quiz-muted">so far</span>' : $text;
};
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script src="<?= koobdAsset('js/i18n-tl.js') ?>"></script>
  <script src="<?= koobdAsset('js/i18n.js') ?>"></script>
  <script src="<?= koobdAsset('js/performance-mode.js') ?>"></script>
  <link rel="stylesheet" href="<?= koobdAsset('css/scrollbar.css') ?>">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KoobD - Results</title>
  <link rel="icon" type="image/png" href="assets/images/icons/favicon.png">
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#f3f8ff">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="KoobD">
  <link rel="apple-touch-icon" href="assets/images/icons/app/apple-touch-icon.png">
  <link rel="stylesheet" href="<?= koobdAsset('css/quiz.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
</head>
<body class="quiz-page quiz-results-page">
  <header class="quiz-topbar">
    <a class="quiz-back" href="<?= htmlspecialchars($roomHref) ?>#activity-<?= $activityId ?>">
      <span aria-hidden="true">&larr;</span>
      <span class="quiz-back-text" translate="no"><?= htmlspecialchars($classroomTitle) ?></span>
    </a>
    <div class="quiz-topbar-title">
      <span class="quiz-topbar-kicker">Results</span>
      <span class="quiz-status-chip" data-status="<?= htmlspecialchars($activity['status']) ?>"><?= $activity['status'] === 'published' ? 'Published' : 'Draft' ?></span>
    </div>
    <div class="quiz-topbar-actions">
      <a class="quiz-btn quiz-btn-ghost" href="<?= htmlspecialchars($isStory ? koobdStoryStudentHref($activity['story'], $activityId, 0) . '&preview=1' : 'quiz_take.php?activity=' . $activityId . '&preview=1') ?>" target="_blank" rel="noopener">Preview</a>
      <a class="quiz-btn quiz-btn-primary" href="teacher_quiz_editor.php?activity=<?= $activityId ?>"><?= $isStory ? 'Edit questions' : 'Edit' ?></a>
    </div>
  </header>

  <main class="quiz-results">
    <section class="quiz-card quiz-head-card">
      <h1 class="quiz-take-title" translate="no"><?= htmlspecialchars($activity['title']) ?></h1>
      <div class="quiz-take-meta">
        <?php if ($isStory): ?><span translate="no"><?= htmlspecialchars($activity['story']['title'] ?? 'Story') ?></span><?php endif; ?>
        <span><?= count($questions) ?> question<?= count($questions) === 1 ? '' : 's' ?><?= $isStory ? ' in the story' : '' ?></span>
        <?php if ($activity['shuffle']): ?><span>Shuffled for each student</span><?php endif; ?>
        <?php if ($activity['due_date'] !== ''): ?><span>Due <?= htmlspecialchars(date('M j, Y', strtotime($activity['due_date']))) ?></span><?php endif; ?>
      </div>
      <div class="quiz-stats">
        <?php if ($isStory): ?>
          <?php $finished = count(array_filter($reading, static fn($value) => (int)$value >= 100)); $started = count($reading); ?>
          <div class="quiz-stat"><strong><?= $started ?>/<?= $studentCount ?></strong><span>started</span></div>
          <div class="quiz-stat"><strong><?= $finished ?>/<?= $studentCount ?></strong><span>finished</span></div>
        <?php else: ?>
          <div class="quiz-stat"><strong><?= $submittedCount ?>/<?= $studentCount ?></strong><span>submitted</span></div>
        <?php endif; ?>
        <?php if ($hasEssays): ?>
          <div class="quiz-stat<?= $needGrading ? ' is-attention' : '' ?>"><strong><?= $needGrading ?></strong><span>need<?= $needGrading === 1 ? 's' : '' ?> grading</span></div>
        <?php endif; ?>
        <div class="quiz-stat"><strong><?= $average === null ? '—' : $average . '%' ?></strong><span>average score</span></div>
        <div class="quiz-stat"><strong><?= $highest === null ? '—' : $highest . '%' ?></strong><span>highest</span></div>
        <div class="quiz-stat"><strong><?= $lowest === null ? '—' : $lowest . '%' ?></strong><span>lowest</span></div>
      </div>
      <?php if ($activity['status'] === 'draft'): ?>
        <p class="quiz-warning">This activity is a draft. Students cannot see it until you publish it.</p>
      <?php endif; ?>
      <?php if ($isStory && !$questions): ?>
        <p class="quiz-muted">This story activity has no questions. Use Edit questions to add some at points in the story.</p>
      <?php endif; ?>
    </section>

    <?php if ($focusStudent): ?>
      <section class="quiz-card quiz-review" id="student">
        <div class="quiz-review-top">
          <div>
            <div class="quiz-question-kicker">Student answers</div>
            <h2 translate="no"><?= htmlspecialchars($focusStudent['profile']) ?> <span class="quiz-muted">(<?= htmlspecialchars($focusStudent['name']) ?>)</span></h2>
          </div>
          <a class="quiz-btn quiz-btn-ghost" href="<?= htmlspecialchars($selfHref) ?>">Close</a>
        </div>
        <?php if (isset($_GET['notgraded'])): ?>
          <p class="quiz-banner is-error" role="alert">That grade could not be saved. Please try again.</p>
        <?php endif; ?>
        <?php if (!$focusReview): ?>
          <p class="quiz-muted">This student has not submitted yet.</p>
        <?php else: ?>
          <p class="quiz-review-summary">
            <strong><?= $focusReview['score'] ?>/<?= $focusReview['total'] ?></strong> (<?= $focusReview['percent'] ?>%)<?= $focusReview['pending'] ? ' so far' : '' ?> · submitted <?= htmlspecialchars($when($focusReview['submittedAt'])) ?>
            <?php if ($focusReview['pending']): ?>
              <span class="quiz-pill is-pending"><?= $focusReview['pending'] ?> essay<?= $focusReview['pending'] === 1 ? '' : 's' ?> to grade</span>
            <?php endif; ?>
          </p>
          <ol class="quiz-review-list">
            <?php foreach ($focusReview['questions'] as $index => $question): ?>
              <?php
              $isEssay = $question['type'] === 'essay';
              $verdict = !$question['answered'] ? 'is-unreached' : ($isEssay ? ($question['pending'] ? 'is-pending' : 'is-graded') : (!empty($question['isCorrect']) ? 'is-right' : 'is-wrong'));
              $text = trim((string)($question['text'] ?? ''));
              ?>
              <li class="quiz-review-item <?= $verdict ?><?= $gradedQuestion === $question['id'] ? ' is-just-graded' : '' ?>" id="question-<?= $question['id'] ?>">
                <div class="quiz-review-head">
                  <span class="quiz-review-number"><?= $index + 1 ?></span>
                  <span class="quiz-review-prompt"><?= htmlspecialchars($question['prompt']) ?> <span class="quiz-muted">· <?= $typeLabels[$question['type']] ?><?php if ($isStory): ?> · <?= htmlspecialchars($pointLabels[$storyPointOf[$question['id']] ?? ''] ?? 'In the story') ?><?php endif; ?></span></span>
                  <span class="quiz-review-badge"><?= !$question['answered'] ? ($isStory ? 'Not reached yet' : 'Not answered') : ($isEssay ? ($question['pending'] ? 'Needs grading' : (int)$question['points'] . '/' . $question['max'] . ' points') : (!empty($question['isCorrect']) ? 'Correct' : 'Incorrect')) ?></span>
                </div>
                <?php if ($question['type'] === 'multiple_choice' || $question['type'] === 'true_false'): ?>
                  <ul class="quiz-review-choices">
                    <?php foreach ($question['choices'] as $choice): ?>
                      <?php $picked = $choice['id'] === $question['picked']; ?>
                      <li class="<?= $picked ? 'is-picked' : '' ?><?= $choice['correct'] ? ' is-key' : '' ?>">
                        <span class="quiz-review-choice"><?= htmlspecialchars($choice['label']) ?></span>
                        <?php if ($picked): ?><span class="quiz-review-tag">Their answer</span><?php endif; ?>
                        <?php if ($choice['correct'] && !$picked): ?><span class="quiz-review-tag is-key">Correct answer</span><?php endif; ?>
                      </li>
                    <?php endforeach; ?>
                  </ul>
                  <?php if ($question['picked'] === null): ?><p class="quiz-review-note">Not answered</p><?php endif; ?>
                <?php else: ?>
                  <?php if ($text !== ''): ?>
                    <div class="quiz-review-written<?= $isEssay ? ' is-essay' : '' ?>">
                      <span class="quiz-review-tag">Their answer</span>
                      <p><?= nl2br(htmlspecialchars($text)) ?></p>
                    </div>
                  <?php else: ?>
                    <p class="quiz-review-note">Not answered</p>
                  <?php endif; ?>
                  <?php if ($question['type'] === 'identification' && !empty($question['accepted'])): ?>
                    <p class="quiz-review-key-line"><span class="quiz-review-tag is-key">Accepted</span> <span><?= htmlspecialchars(implode(' · ', $question['accepted'])) ?></span></p>
                  <?php elseif ($question['type'] === 'speak' && !empty($question['accepted'])): ?>
                    <p class="quiz-review-key-line"><span class="quiz-review-tag is-key">Asked to say</span> <span><?= htmlspecialchars(implode(' · ', $question['accepted'])) ?></span></p>
                  <?php endif; ?>
                  <?php if ($isEssay && $text !== ''): ?>
                    <form class="quiz-grade-form" method="post" action="<?= htmlspecialchars($selfHref) ?>">
                      <input type="hidden" name="action" value="grade_essay">
                      <input type="hidden" name="student" value="<?= $focusStudent['id'] ?>">
                      <input type="hidden" name="question" value="<?= $question['id'] ?>">
                      <label class="quiz-grade-points">
                        <span>Points</span>
                        <span class="quiz-grade-points-input">
                          <input type="number" name="points" min="0" max="<?= (int)$question['max'] ?>" step="1" inputmode="numeric" required value="<?= $question['pending'] ? '' : (int)$question['points'] ?>" aria-label="Points for question <?= $index + 1 ?>, out of <?= (int)$question['max'] ?>">
                          <span>/ <?= (int)$question['max'] ?></span>
                        </span>
                      </label>
                      <label class="quiz-grade-feedback">
                        <span>Feedback <em>(optional)</em></span>
                        <textarea name="feedback" rows="2" maxlength="4000" placeholder="What was good, and what could be better"><?= htmlspecialchars((string)($question['feedback'] ?? '')) ?></textarea>
                      </label>
                      <div class="quiz-grade-actions">
                        <button type="submit" class="quiz-btn quiz-btn-primary"><?= $question['pending'] ? 'Save grade' : 'Update grade' ?></button>
                        <?php if ($gradedQuestion === $question['id']): ?><span class="quiz-grade-saved" role="status">Grade saved</span><?php endif; ?>
                      </div>
                    </form>
                  <?php elseif ($isEssay): ?>
                    <p class="quiz-muted">Nothing was written, so it earns 0 points.</p>
                  <?php endif; ?>
                <?php endif; ?>
              </li>
            <?php endforeach; ?>
          </ol>
          <?php if ($nextToGrade && !$focusReview['pending']): ?>
            <div class="quiz-nav quiz-nav-center">
              <a class="quiz-btn quiz-btn-primary" href="<?= htmlspecialchars($selfHref) ?>&amp;student=<?= $nextToGrade['id'] ?>#student">Grade next: <span translate="no"><?= htmlspecialchars($nextToGrade['profile']) ?></span></a>
            </div>
          <?php endif; ?>
        <?php endif; ?>
      </section>
    <?php endif; ?>

    <section class="quiz-card">
      <h2>Students</h2>
      <?php if (!$students): ?>
        <p class="quiz-muted">No students have joined this classroom yet.</p>
      <?php else: ?>
        <div class="quiz-table-wrap">
          <table class="quiz-table">
            <thead><tr><th scope="col">Student</th><?php if ($isStory): ?><th scope="col">Reading</th><?php endif; ?><th scope="col">Status</th><th scope="col">Score</th><th scope="col"><?= $isStory ? 'Last answer' : 'Submitted' ?></th><th scope="col"><span class="quiz-sr">Answers</span></th></tr></thead>
            <tbody>
              <?php foreach ($students as $student): ?>
                <?php $submission = $submissions[$student['id']] ?? null; $waiting = $submission && $submission['pending'] > 0; ?>
                <tr class="<?= $focusStudent && $focusStudent['id'] === $student['id'] ? 'is-focused' : '' ?>">
                  <th scope="row">
                    <span class="quiz-student">
                      <span class="quiz-student-avatar" style="--student-top:<?= htmlspecialchars($student['top']) ?>; --student-bottom:<?= htmlspecialchars($student['bottom']) ?>;"><img src="<?= htmlspecialchars($student['asset']) ?>" alt="" loading="lazy"></span>
                      <span translate="no"><?= htmlspecialchars($student['profile']) ?></span>
                    </span>
                  </th>
                  <?php if ($isStory): ?>
                    <?php $read = $reading[$student['id']] ?? null; ?>
                    <td data-label="Reading"><span class="quiz-pill <?= $read === null ? 'is-none' : ((int)$read >= 100 ? 'is-done' : 'is-reading') ?>"><?= htmlspecialchars($readingText($read)) ?></span></td>
                  <?php endif; ?>
                  <td data-label="Status"><span class="quiz-pill <?= $waiting ? 'is-pending' : ($submission ? 'is-done' : 'is-none') ?>"><?= $waiting ? 'Needs grading' : ($submission ? ($isStory ? 'Answered ' . ($answeredCounts[$student['id']] ?? 0) . '/' . count($questions) : 'Submitted') : ($isStory ? 'No answers yet' : 'Not submitted')) ?></span></td>
                  <td data-label="Score"><?= $submission ? $scoreText($submission) : '—' ?></td>
                  <td class="quiz-muted" data-label="Submitted"><?= $submission ? htmlspecialchars($when($submission['submitted_at'])) : '' ?></td>
                  <td class="quiz-table-action"><?php if ($submission): ?><a class="quiz-link" href="<?= htmlspecialchars($selfHref) ?>&amp;student=<?= $student['id'] ?>#student"><?= $waiting ? 'Grade essays' : 'View answers' ?></a><?php endif; ?></td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      <?php endif; ?>
    </section>

    <section class="quiz-card">
      <h2>Questions</h2>
      <?php if (!$questions): ?>
        <p class="quiz-muted">This activity has no questions yet.</p>
      <?php else: ?>
        <ol class="quiz-question-stats">
          <?php foreach ($questions as $index => $question): ?>
            <?php $right = $rightCounts[$question['id']] ?? 0; $rate = $submittedCount ? (int)round($right / $submittedCount * 100) : 0; ?>
            <li class="quiz-question-stat">
              <div class="quiz-review-head">
                <span class="quiz-review-number"><?= $index + 1 ?></span>
                <span class="quiz-review-prompt"><?= htmlspecialchars($question['prompt']) ?> <span class="quiz-muted">· <?= $typeLabels[$question['type']] ?><?= $isStory ? ' · ' . htmlspecialchars($pointLabels[$question['point']] ?? 'a part no longer in the story') . ($question['optional'] ? ' · optional' : '') : '' ?></span></span>
                <?php if ($question['type'] === 'essay'): ?>
                  <?php $stat = $essayStats[$question['id']] ?? []; $graded = $stat['graded'] ?? 0; ?>
                  <span class="quiz-stat-rate"><?= $submittedCount ? ($graded ? 'Average ' . round(($stat['points'] ?? 0) / $graded, 1) . '/' . $question['points'] : 'Not graded yet') : 'No answers yet' ?></span>
                <?php else: ?>
                  <span class="quiz-stat-rate"><?= $submittedCount ? $rate . '% correct' : 'No answers yet' ?></span>
                <?php endif; ?>
              </div>
              <?php if ($question['type'] === 'essay'): ?>
                <?php $stat = $essayStats[$question['id']] ?? []; ?>
                <p class="quiz-essay-stat">
                  Worth <?= (int)$question['points'] ?> point<?= (int)$question['points'] === 1 ? '' : 's' ?> ·
                  <?= (int)($stat['graded'] ?? 0) ?> graded · <?= (int)($stat['pending'] ?? 0) ?> waiting<?= ($picks[$question['id']]['none'] ?? 0) ? ' · ' . (int)$picks[$question['id']]['none'] . ' left blank' : '' ?>
                </p>
              <?php elseif ($question['type'] === 'identification' || $question['type'] === 'speak'): ?>
                <p class="quiz-essay-stat"><?= $question['type'] === 'speak' ? 'Asked to say' : 'Accepted' ?>: <?= htmlspecialchars(implode(' · ', array_column($question['choices'], 'label'))) ?><?= $question['type'] === 'speak' && ($picks[$question['id']]['none'] ?? 0) ? ' · ' . (int)$picks[$question['id']]['none'] . ' could not use a microphone' : '' ?></p>
                <ul class="quiz-distribution">
                  <?php foreach (array_slice($typedAnswers[$question['id']] ?? [], 0, 6) as $typed): ?>
                    <?php $share = $submittedCount ? (int)round($typed['count'] / $submittedCount * 100) : 0; ?>
                    <li class="<?= $typed['correct'] ? 'is-key' : '' ?>">
                      <span class="quiz-dist-label"><?= htmlspecialchars($typed['label']) ?><?= $typed['correct'] ? ' <span class="quiz-review-tag is-key">Correct</span>' : '' ?></span>
                      <span class="quiz-dist-bar"><span style="width: <?= $share ?>%"></span></span>
                      <span class="quiz-dist-count"><?= $typed['count'] ?></span>
                    </li>
                  <?php endforeach; ?>
                  <?php $blank = $picks[$question['id']]['none'] ?? 0; ?>
                  <?php if ($blank): ?>
                    <li class="is-blank"><span class="quiz-dist-label">Not answered</span><span class="quiz-dist-bar"><span style="width: <?= (int)round($blank / max(1, $submittedCount) * 100) ?>%"></span></span><span class="quiz-dist-count"><?= $blank ?></span></li>
                  <?php endif; ?>
                </ul>
              <?php else: ?>
                <ul class="quiz-distribution">
                  <?php foreach ($question['choices'] as $choice): ?>
                    <?php $chosen = $picks[$question['id']][$choice['id']] ?? 0; $share = $submittedCount ? (int)round($chosen / $submittedCount * 100) : 0; ?>
                    <li class="<?= $choice['correct'] ? 'is-key' : '' ?>">
                      <span class="quiz-dist-label"><?= htmlspecialchars($choice['label']) ?><?= $choice['correct'] ? ' <span class="quiz-review-tag is-key">Correct</span>' : '' ?></span>
                      <span class="quiz-dist-bar"><span style="width: <?= $share ?>%"></span></span>
                      <span class="quiz-dist-count"><?= $chosen ?></span>
                    </li>
                  <?php endforeach; ?>
                  <?php $blank = $picks[$question['id']]['none'] ?? 0; ?>
                  <?php if ($blank): ?>
                    <li class="is-blank"><span class="quiz-dist-label">Not answered</span><span class="quiz-dist-bar"><span style="width: <?= (int)round($blank / max(1, $submittedCount) * 100) ?>%"></span></span><span class="quiz-dist-count"><?= $blank ?></span></li>
                  <?php endif; ?>
                </ul>
              <?php endif; ?>
            </li>
          <?php endforeach; ?>
        </ol>
      <?php endif; ?>
    </section>
  </main>
  <script>window.KOOBD_SESSION = { role: 'teacher' };</script>
</body>
</html>
