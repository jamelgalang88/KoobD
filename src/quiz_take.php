<?php
// A question activity, as a student answers it: its instructions, then one
// question at a time, then Submit (quiz_submit.php checks the answers). Once
// submitted it shows their result and their answers instead (js/quiz-take.js).
//   quiz_take.php?activity=<id>            a student in the activity's classroom
//   quiz_take.php?activity=<id>&preview=1  its teacher, previewing (nothing is saved)
require_once('teacher_auth.php');
$activityId = (int)($_GET['activity'] ?? 0);
$isPreview = isset($_GET['preview']);

if ($isPreview) {
    $user = koobdTeacherRequireAuth(true);
    $activityRow = koobdTeacherActivity($activityId, (int)$user['id']);
} else {
    $user = koobdRequireStudentAuth(true);
    // Only published activities of a classroom the student has joined.
    $activityRow = koobdStudentActivity($activityId, (int)$user['id']);
}
if (!$activityRow || ($activityRow['activity_type'] ?? '') !== 'quiz') {
    header('Location: classroom.php');
    exit();
}
$activity = koobdActivityFromRow($activityRow);
$classroomId = (int)$activity['classroom_id'];
$backHref = $isPreview ? 'teacher_quiz_editor.php?activity=' . $activityId : 'classroom_room.php?id=' . $classroomId;

$classroomTitle = $activityRow['classroom_title'] ?? '';
if ($classroomTitle === '') {
    $titleStmt = $conn->prepare("SELECT title FROM classrooms WHERE id = ? LIMIT 1");
    $titleStmt->bind_param('i', $classroomId);
    $titleStmt->execute();
    $classroomTitle = (string)($titleStmt->get_result()->fetch_assoc()['title'] ?? '');
    $titleStmt->close();
}

// A student's browser gets the questions without the answer key; the teacher's
// preview has it, so Submit can show what a student would see.
$questions = koobdQuizQuestions($activityId, $isPreview);
$review = $isPreview ? null : koobdQuizReview($activityId, (int)$user['id'], $activity['show_answers']);
$pageData = [
    'activityId' => $activityId,
    'preview' => $isPreview,
    'userId' => (int)$user['id'],
    'title' => $activity['title'],
    'showAnswers' => $activity['show_answers'],
    'questions' => $questions,
    'review' => $review,
    'backHref' => $backHref,
];
$dueLabel = $activity['due_date'] !== '' ? date('M j, Y', strtotime($activity['due_date'])) : '';
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
  <title>KoobD - <?= htmlspecialchars($activity['title']) ?></title>
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
<body class="quiz-page quiz-take-page">
  <header class="quiz-topbar">
    <a class="quiz-back" href="<?= htmlspecialchars($backHref) ?>" id="quizBack">
      <span aria-hidden="true">&larr;</span>
      <span class="quiz-back-text" translate="no"><?= $isPreview ? 'Back to editor' : htmlspecialchars($classroomTitle) ?></span>
    </a>
    <div class="quiz-topbar-title">
      <span class="quiz-topbar-kicker"><?= $isPreview ? 'Preview' : 'Activity' ?></span>
    </div>
  </header>

  <?php if ($isPreview): ?>
    <div class="quiz-preview-banner" role="note">Preview: this is what your students see. Nothing you answer here is saved.</div>
  <?php endif; ?>

  <main class="quiz-take">
    <section class="quiz-card quiz-head-card quiz-take-head">
      <h1 class="quiz-take-title" translate="no"><?= htmlspecialchars($activity['title']) ?></h1>
      <?php if ($activity['description'] !== ''): ?>
        <p class="quiz-take-desc"><?= nl2br(htmlspecialchars($activity['description'])) ?></p>
      <?php endif; ?>
      <div class="quiz-take-meta">
        <span><?= count($questions) ?> question<?= count($questions) === 1 ? '' : 's' ?></span>
        <?php if ($dueLabel !== ''): ?><span>Due <?= htmlspecialchars($dueLabel) ?></span><?php endif; ?>
      </div>
      <?php if ($activity['instructions'] !== ''): ?>
        <details class="quiz-instructions" id="quizInstructions" open>
          <summary class="quiz-instructions-label">Instructions</summary>
          <p><?= nl2br(htmlspecialchars($activity['instructions'])) ?></p>
        </details>
      <?php endif; ?>
    </section>

    <div id="quizApp" aria-live="polite"></div>
  </main>

  <script>
    window.KOOBD_QUIZ = <?= json_encode($pageData, JSON_HEX_TAG | JSON_HEX_AMP) ?>;
    window.KOOBD_SESSION = { role: <?= json_encode($isPreview ? 'teacher' : 'student') ?> };
  </script>
  <script src="<?= koobdAsset('js/quiz-take.js') ?>"></script>
</body>
</html>
