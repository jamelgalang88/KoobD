<?php
// One story activity's class progress, for its teacher (opened from the
// activity's card on teacher_classroom.php): every student of the classroom
// with how far they have read or played, whether they finished, when they
// last read, and - when the activity has questions placed in its story -
// their score and any essay waiting for a grade. Only this activity's
// results; a quiz has its own page (teacher_quiz_results.php).
require_once('teacher_auth.php');
$teacher = koobdTeacherRequireAuth(true);
require_once __DIR__ . '/missions_lib.php';
require_once __DIR__ . '/achievements_lib.php';
$activityId = (int)($_GET['activity'] ?? 0);
$activityRow = koobdTeacherActivity($activityId, (int)$teacher['id']);
if (!$activityRow) {
    header('Location: classroom.php');
    exit();
}
koobdMissionRecord($teacher, 'review_progress');
if (($activityRow['activity_type'] ?? 'story') === 'quiz') {
    header('Location: teacher_quiz_results.php?activity=' . $activityId);
    exit();
}
koobdAchievementRecordEvent($teacher, 'progress_report', 'activity:' . $activityId);
$activity = koobdActivityFromRow($activityRow);
$story = $activity['story'];
$classroomId = (int)$activity['classroom_id'];
$roomHref = 'teacher_classroom.php?id=' . $classroomId . '#activity-' . $activityId;

$classStmt = $conn->prepare("SELECT title FROM classrooms WHERE id = ? LIMIT 1");
$classStmt->bind_param('i', $classroomId);
$classStmt->execute();
$classroomTitle = (string)($classStmt->get_result()->fetch_assoc()['title'] ?? 'Classroom');
$classStmt->close();

// The classroom's students (teachers never count), in the order they joined.
$students = [];
$studentStmt = $conn->prepare(
    "SELECT u.id, u.username, u.selected_reader, u.profile_reader_name, u.profile_badge_label,
            u.profile_top_color, u.profile_bottom_color, u.profile_accent_color, u.profile_card_style,
            u.profile_scale, u.user_role
     FROM classroom_students cs INNER JOIN users u ON u.id = cs.student_user_id
     WHERE cs.classroom_id = ? AND u.user_role <> 'teacher'
     ORDER BY cs.joined_at ASC"
);
$studentStmt->bind_param('i', $classroomId);
$studentStmt->execute();
foreach ($studentStmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
    $profile = koobdResolvedProfile($row);
    $students[(int)$row['id']] = ['id' => (int)$row['id'], 'name' => $row['username'], 'profile' => $profile['name'], 'asset' => $profile['asset'], 'top' => $profile['top'], 'bottom' => $profile['bottom']];
}
$studentStmt->close();

// Each student's place in this activity's story, and when they last read.
$progress = [];
if ($students && $story) {
    $context = koobdActivityProgressContext($activityId);
    $storyId = (string)$activity['story_id'];
    $read = $conn->prepare("SELECT user_id, progress, last_read_at FROM story_progress WHERE story_id = ? AND progress_context = ?");
    $read->bind_param('ss', $storyId, $context);
    $read->execute();
    foreach ($read->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        if (isset($students[(int)$row['user_id']])) {
            $progress[(int)$row['user_id']] = ['value' => max(0, min(100, (int)$row['progress'])), 'at' => (string)$row['last_read_at']];
        }
    }
    $read->close();
}

// The questions placed in the story, if any, and each student's score.
$questions = array_values(array_filter(koobdQuizQuestions($activityId, false), static fn($question) => $question['point'] !== null));
$scores = $questions ? (koobdQuizSubmissionMap([$activityId], array_keys($students))[$activityId] ?? []) : [];

$studentCount = count($students);
$started = count($progress);
$finished = count(array_filter($progress, static fn($entry) => $entry['value'] >= 100));
$average = $studentCount ? (int)round(array_sum(array_column($progress, 'value')) / $studentCount) : 0;
$toGrade = count(array_filter($scores, static fn($score) => $score['pending'] > 0));
$when = static fn(string $time): string => $time !== '' ? date('M j, Y g:i A', strtotime($time)) : '';
$status = static function (?array $entry): array {
    if (!$entry) {
        return ['Not started', 'is-none'];
    }
    return $entry['value'] >= 100 ? ['Finished', 'is-done'] : ['In progress', 'is-reading'];
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
  <title>KoobD - Class Progress</title>
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
<body class="quiz-page quiz-results-page progress-page">
  <header class="quiz-topbar">
    <a class="quiz-back" href="<?= htmlspecialchars($roomHref) ?>">
      <span aria-hidden="true">&larr;</span>
      <span class="quiz-back-text" translate="no"><?= htmlspecialchars($classroomTitle) ?></span>
    </a>
    <div class="quiz-topbar-title">
      <span class="quiz-topbar-kicker">Class progress</span>
    </div>
    <div class="quiz-topbar-actions">
      <?php if ($questions): ?>
        <a class="quiz-btn quiz-btn-primary" href="teacher_quiz_results.php?activity=<?= $activityId ?>">Answers</a>
      <?php endif; ?>
    </div>
  </header>

  <main class="quiz-results">
    <section class="quiz-card quiz-head-card">
      <div class="quiz-question-kicker">Story activity<?= $story ? ' · ' . (koobdStoryMode($story) === 'platform' ? 'Platform Mode' : 'Story Mode') : '' ?></div>
      <h1 class="quiz-take-title" translate="no"><?= htmlspecialchars($activity['title']) ?></h1>
      <div class="quiz-take-meta">
        <?php if ($story && $activity['raw_title'] !== ''): ?><span translate="no"><?= htmlspecialchars($story['title']) ?></span><?php endif; ?>
        <span><?= $studentCount ?> student<?= $studentCount === 1 ? '' : 's' ?></span>
        <?php if ($questions): ?><span><?= count($questions) ?> question<?= count($questions) === 1 ? '' : 's' ?> in the story</span><?php endif; ?>
        <?php if ($activity['due_date'] !== ''): ?><span>Due <?= htmlspecialchars(date('M j, Y', strtotime($activity['due_date']))) ?></span><?php endif; ?>
      </div>
      <div class="quiz-stats">
        <div class="quiz-stat"><strong><?= $started ?>/<?= $studentCount ?></strong><span>started</span></div>
        <div class="quiz-stat"><strong><?= $finished ?>/<?= $studentCount ?></strong><span>finished</span></div>
        <div class="quiz-stat"><strong><?= $average ?>%</strong><span>average progress</span></div>
        <?php if ($questions): ?>
          <div class="quiz-stat<?= $toGrade ? ' is-attention' : '' ?>"><strong><?= $toGrade ?></strong><span>need<?= $toGrade === 1 ? 's' : '' ?> grading</span></div>
        <?php endif; ?>
      </div>
    </section>

    <section class="quiz-card">
      <h2>Students</h2>
      <?php if (!$students): ?>
        <p class="quiz-muted">No students have joined this classroom yet. Share the class code so they can join.</p>
      <?php else: ?>
        <ul class="progress-list">
          <?php foreach ($students as $student): ?>
            <?php $entry = $progress[$student['id']] ?? null; [$label, $tone] = $status($entry); $score = $scores[$student['id']] ?? null; ?>
            <li class="progress-row">
              <span class="quiz-student-avatar progress-avatar" style="--student-top:<?= htmlspecialchars($student['top']) ?>; --student-bottom:<?= htmlspecialchars($student['bottom']) ?>;"><img src="<?= htmlspecialchars($student['asset']) ?>" alt="" loading="lazy"></span>
              <span class="progress-who">
                <strong translate="no"><?= htmlspecialchars($student['profile']) ?></strong>
                <span class="quiz-muted" translate="no"><?= htmlspecialchars($student['name']) ?></span>
              </span>
              <span class="progress-meter" aria-label="<?= $entry ? (int)$entry['value'] . '% read' : 'Not started' ?>">
                <span class="progress-meter-bar"><span style="width: <?= $entry ? (int)$entry['value'] : 0 ?>%"></span></span>
                <span class="progress-meter-value"><?= $entry ? (int)$entry['value'] : 0 ?>%</span>
              </span>
              <span class="progress-facts">
                <span class="quiz-pill <?= $tone ?>"><?= $label ?></span>
                <?php if ($questions): ?>
                  <span class="quiz-pill <?= $score && $score['pending'] ? 'is-pending' : ($score ? 'is-reading' : 'is-none') ?>"><?= $score ? 'Score ' . $score['score'] . '/' . $score['total'] . ($score['pending'] ? ' · essay to grade' : '') : 'No answers yet' ?></span>
                <?php endif; ?>
                <span class="quiz-muted progress-when"><?= $entry ? 'Last read ' . htmlspecialchars($when($entry['at'])) : '' ?></span>
              </span>
              <?php if ($questions && $score): ?>
                <a class="quiz-link progress-link" href="teacher_quiz_results.php?activity=<?= $activityId ?>&amp;student=<?= $student['id'] ?>#student">Answers</a>
              <?php endif; ?>
            </li>
          <?php endforeach; ?>
        </ul>
      <?php endif; ?>
    </section>
  </main>
  <script>window.KOOBD_SESSION = { role: 'teacher' };</script>
</body>
</html>
