<?php
// The question activity editor (Google Forms style): a teacher adds multiple
// choice and true/false questions to an activity in one of their classrooms,
// marks each correct answer, previews it, saves it as a draft and publishes it.
//   teacher_quiz_editor.php?classroom=<id>   a new activity in that classroom
//   teacher_quiz_editor.php?activity=<id>    edit one
// Saving goes through teacher_quiz_save.php (js/quiz-editor.js).
require_once('teacher_auth.php');
$teacher = koobdTeacherRequireAuth(true);
$teacherId = (int)$teacher['id'];

$activityRow = isset($_GET['activity']) ? koobdTeacherActivity((int)$_GET['activity'], $teacherId) : null;
if (isset($_GET['activity']) && (!$activityRow || ($activityRow['activity_type'] ?? '') !== 'quiz')) {
    header('Location: classroom.php');
    exit();
}
$classroomId = $activityRow ? (int)$activityRow['classroom_id'] : (int)($_GET['classroom'] ?? 0);
$stmt = $conn->prepare("SELECT id, title FROM classrooms WHERE id = ? AND teacher_id = ? LIMIT 1");
$stmt->bind_param('ii', $classroomId, $teacherId);
$stmt->execute();
$classroom = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$classroom) {
    header('Location: classroom.php');
    exit();
}

$activity = $activityRow ? koobdActivityFromRow($activityRow) : null;
$submissionCount = 0;
if ($activity) {
    $count = $conn->prepare("SELECT COUNT(*) AS total FROM activity_submissions WHERE activity_id = ?");
    $count->bind_param('i', $activity['id']);
    $count->execute();
    $submissionCount = (int)($count->get_result()->fetch_assoc()['total'] ?? 0);
    $count->close();
}
$roomHref = 'teacher_classroom.php?id=' . $classroomId;
$editorData = [
    'classroomId' => $classroomId,
    'classroomTitle' => $classroom['title'],
    'roomHref' => $roomHref,
    'submissions' => $submissionCount,
    'activity' => $activity ? [
        'id' => $activity['id'],
        'status' => $activity['status'],
        'title' => $activity['raw_title'],
        'description' => $activity['description'],
        'instructions' => $activity['instructions'],
        'dueDate' => $activity['due_date'],
        'showAnswers' => $activity['show_answers'],
    ] : null,
    'questions' => $activity ? koobdQuizQuestions($activity['id'], true) : [],
];
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
  <title>KoobD - <?= $activity ? 'Edit Quiz' : 'New Quiz' ?></title>
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
<body class="quiz-page quiz-editor-page">
  <header class="quiz-topbar">
    <a class="quiz-back" href="<?= htmlspecialchars($roomHref) ?>" data-leave>
      <span aria-hidden="true">&larr;</span>
      <span class="quiz-back-text" translate="no"><?= htmlspecialchars($classroom['title']) ?></span>
    </a>
    <div class="quiz-topbar-title">
      <span class="quiz-topbar-kicker">Quiz activity</span>
      <span class="quiz-status-chip" id="quizStatus" data-status="<?= htmlspecialchars($activity['status'] ?? 'draft') ?>"><?= ($activity['status'] ?? 'draft') === 'published' ? 'Published' : 'Draft' ?></span>
      <span class="quiz-save-state" id="quizSaveState" role="status" aria-live="polite"></span>
    </div>
    <div class="quiz-topbar-actions">
      <button type="button" class="quiz-btn quiz-btn-ghost" id="quizPreview">Preview</button>
      <button type="button" class="quiz-btn quiz-btn-ghost" id="quizSaveDraft">Save draft</button>
      <button type="button" class="quiz-btn quiz-btn-primary" id="quizPublish">Publish</button>
      <div class="quiz-more">
        <button type="button" class="quiz-icon-btn" id="quizMoreBtn" aria-haspopup="true" aria-expanded="false" aria-label="More actions" title="More actions">&#8942;</button>
        <div class="quiz-more-menu" id="quizMoreMenu" hidden>
          <button type="button" id="quizUnpublish">Move back to drafts</button>
          <a id="quizResultsLink" href="#">View results</a>
          <button type="button" class="is-danger" id="quizDelete">Delete activity</button>
        </div>
      </div>
    </div>
  </header>

  <main class="quiz-editor" id="quizEditor">
    <div class="quiz-banner" id="quizSubmissionsBanner" hidden></div>
    <div class="quiz-banner is-error" id="quizErrors" role="alert" hidden></div>

    <section class="quiz-card quiz-head-card">
      <label class="quiz-sr" for="quizTitle">Activity title</label>
      <textarea class="quiz-title-input" id="quizTitle" rows="1" maxlength="255" placeholder="Untitled activity"></textarea>
      <label class="quiz-sr" for="quizDescription">Description</label>
      <textarea class="quiz-desc-input" id="quizDescription" rows="1" maxlength="4000" placeholder="Description (what this activity is about)"></textarea>
      <div class="quiz-head-fields">
        <label class="quiz-field">
          <span>Instructions for students</span>
          <textarea id="quizInstructions" rows="2" maxlength="4000" placeholder="Example: Read each question carefully and choose the best answer."></textarea>
        </label>
        <div class="quiz-head-row">
          <label class="quiz-field quiz-field-date">
            <span>Due date <em>(optional)</em></span>
            <input id="quizDue" type="date">
          </label>
          <label class="quiz-switch">
            <input id="quizShowAnswers" type="checkbox">
            <span class="quiz-switch-track" aria-hidden="true"></span>
            <span>Show students the correct answers after they submit</span>
          </label>
        </div>
      </div>
    </section>

    <ol class="quiz-question-list" id="quizQuestions"></ol>

    <div class="quiz-add-row">
      <button type="button" class="quiz-add-btn" id="quizAddMc"><span aria-hidden="true">+</span> Multiple choice</button>
      <button type="button" class="quiz-add-btn" id="quizAddTf"><span aria-hidden="true">+</span> True or False</button>
    </div>
  </main>

  <div class="quiz-dialog" id="quizConfirm" hidden>
    <div class="quiz-dialog-box" role="dialog" aria-modal="true" aria-labelledby="quizConfirmTitle">
      <h2 id="quizConfirmTitle"></h2>
      <p id="quizConfirmText"></p>
      <div class="quiz-dialog-actions">
        <button type="button" class="quiz-btn quiz-btn-ghost" data-answer="no">Cancel</button>
        <button type="button" class="quiz-btn quiz-btn-danger" data-answer="yes">Delete</button>
      </div>
    </div>
  </div>

  <script>
    window.KOOBD_QUIZ_EDITOR = <?= json_encode($editorData, JSON_HEX_TAG | JSON_HEX_AMP) ?>;
    window.KOOBD_SESSION = { role: 'teacher' };
  </script>
  <script src="<?= koobdAsset('js/quiz-editor.js') ?>"></script>
</body>
</html>
