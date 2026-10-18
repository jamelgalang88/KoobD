<?php
// A question activity's results, for its teacher: who has submitted, each
// student's score, how the class did on every question (and which answers
// they chose), and one student's answers in full (?student=<id>).
require_once('teacher_auth.php');
$teacher = koobdTeacherRequireAuth(true);
$activityId = (int)($_GET['activity'] ?? 0);
$activityRow = koobdTeacherActivity($activityId, (int)$teacher['id']);
if (!$activityRow || ($activityRow['activity_type'] ?? '') !== 'quiz') {
    header('Location: classroom.php');
    exit();
}
$activity = koobdActivityFromRow($activityRow);
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
$submissions = koobdQuizSubmissionMap([$activityId], array_keys($students))[$activityId] ?? [];

$questions = koobdQuizQuestions($activityId, true);
// How every submitted student answered each question.
$picks = [];
$rightCounts = [];
if ($submissions) {
    $answerResult = $conn->query(
        "SELECT a.question_id, a.choice_id, a.is_correct FROM activity_submission_answers a
         INNER JOIN activity_submissions s ON s.id = a.submission_id
         WHERE s.activity_id = " . (int)$activityId . " AND s.student_user_id IN (" . implode(',', array_map('intval', array_keys($submissions))) . ")"
    );
    while ($answerResult && ($row = $answerResult->fetch_assoc())) {
        $qid = (int)$row['question_id'];
        $key = $row['choice_id'] === null ? 'none' : (int)$row['choice_id'];
        $picks[$qid][$key] = ($picks[$qid][$key] ?? 0) + 1;
        $rightCounts[$qid] = ($rightCounts[$qid] ?? 0) + ((int)$row['is_correct'] === 1 ? 1 : 0);
    }
}

$submittedCount = count($submissions);
$studentCount = count($students);
$percents = array_column($submissions, 'percent');
$average = $percents ? (int)round(array_sum($percents) / count($percents)) : null;
$highest = $percents ? max($percents) : null;
$lowest = $percents ? min($percents) : null;

$focusStudent = isset($_GET['student'], $students[(int)$_GET['student']]) ? $students[(int)$_GET['student']] : null;
$focusReview = $focusStudent ? koobdQuizReview($activityId, $focusStudent['id'], true) : null;
$when = static fn(string $time): string => $time !== '' ? date('M j, Y g:i A', strtotime($time)) : '';
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
    <a class="quiz-back" href="<?= htmlspecialchars($roomHref) ?>#progress">
      <span aria-hidden="true">&larr;</span>
      <span class="quiz-back-text" translate="no"><?= htmlspecialchars($classroomTitle) ?></span>
    </a>
    <div class="quiz-topbar-title">
      <span class="quiz-topbar-kicker">Results</span>
      <span class="quiz-status-chip" data-status="<?= htmlspecialchars($activity['status']) ?>"><?= $activity['status'] === 'published' ? 'Published' : 'Draft' ?></span>
    </div>
    <div class="quiz-topbar-actions">
      <a class="quiz-btn quiz-btn-ghost" href="quiz_take.php?activity=<?= $activityId ?>&amp;preview=1" target="_blank" rel="noopener">Preview</a>
      <a class="quiz-btn quiz-btn-primary" href="teacher_quiz_editor.php?activity=<?= $activityId ?>">Edit</a>
    </div>
  </header>

  <main class="quiz-results">
    <section class="quiz-card quiz-head-card">
      <h1 class="quiz-take-title" translate="no"><?= htmlspecialchars($activity['title']) ?></h1>
      <div class="quiz-take-meta">
        <span><?= count($questions) ?> question<?= count($questions) === 1 ? '' : 's' ?></span>
        <?php if ($activity['due_date'] !== ''): ?><span>Due <?= htmlspecialchars(date('M j, Y', strtotime($activity['due_date']))) ?></span><?php endif; ?>
      </div>
      <div class="quiz-stats">
        <div class="quiz-stat"><strong><?= $submittedCount ?>/<?= $studentCount ?></strong><span>submitted</span></div>
        <div class="quiz-stat"><strong><?= $average === null ? '—' : $average . '%' ?></strong><span>average score</span></div>
        <div class="quiz-stat"><strong><?= $highest === null ? '—' : $highest . '%' ?></strong><span>highest</span></div>
        <div class="quiz-stat"><strong><?= $lowest === null ? '—' : $lowest . '%' ?></strong><span>lowest</span></div>
      </div>
      <?php if ($activity['status'] === 'draft'): ?>
        <p class="quiz-warning">This activity is a draft. Students cannot see it until you publish it.</p>
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
        <?php if (!$focusReview): ?>
          <p class="quiz-muted">This student has not submitted yet.</p>
        <?php else: ?>
          <p class="quiz-review-summary"><strong><?= $focusReview['score'] ?>/<?= $focusReview['total'] ?></strong> (<?= $focusReview['percent'] ?>%) · submitted <?= htmlspecialchars($when($focusReview['submittedAt'])) ?></p>
          <ol class="quiz-review-list">
            <?php foreach ($focusReview['questions'] as $index => $question): ?>
              <li class="quiz-review-item <?= $question['isCorrect'] ? 'is-right' : 'is-wrong' ?>">
                <div class="quiz-review-head">
                  <span class="quiz-review-number"><?= $index + 1 ?></span>
                  <span class="quiz-review-prompt"><?= htmlspecialchars($question['prompt']) ?></span>
                  <span class="quiz-review-badge"><?= $question['isCorrect'] ? 'Correct' : 'Incorrect' ?></span>
                </div>
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
              </li>
            <?php endforeach; ?>
          </ol>
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
            <thead><tr><th scope="col">Student</th><th scope="col">Status</th><th scope="col">Score</th><th scope="col">Submitted</th><th scope="col"><span class="quiz-sr">Answers</span></th></tr></thead>
            <tbody>
              <?php foreach ($students as $student): ?>
                <?php $submission = $submissions[$student['id']] ?? null; ?>
                <tr class="<?= $focusStudent && $focusStudent['id'] === $student['id'] ? 'is-focused' : '' ?>">
                  <th scope="row">
                    <span class="quiz-student">
                      <span class="quiz-student-avatar" style="--student-top:<?= htmlspecialchars($student['top']) ?>; --student-bottom:<?= htmlspecialchars($student['bottom']) ?>;"><img src="<?= htmlspecialchars($student['asset']) ?>" alt="" loading="lazy"></span>
                      <span translate="no"><?= htmlspecialchars($student['profile']) ?></span>
                    </span>
                  </th>
                  <td data-label="Status"><span class="quiz-pill <?= $submission ? 'is-done' : 'is-none' ?>"><?= $submission ? 'Submitted' : 'Not submitted' ?></span></td>
                  <td data-label="Score"><?= $submission ? $submission['score'] . '/' . $submission['total'] . ' <span class="quiz-muted">(' . $submission['percent'] . '%)</span>' : '—' ?></td>
                  <td class="quiz-muted" data-label="Submitted"><?= $submission ? htmlspecialchars($when($submission['submitted_at'])) : '' ?></td>
                  <td class="quiz-table-action"><?php if ($submission): ?><a class="quiz-link" href="<?= htmlspecialchars($selfHref) ?>&amp;student=<?= $student['id'] ?>#student">View answers</a><?php endif; ?></td>
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
                <span class="quiz-review-prompt"><?= htmlspecialchars($question['prompt']) ?></span>
                <span class="quiz-stat-rate"><?= $submittedCount ? $rate . '% correct' : 'No answers yet' ?></span>
              </div>
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
            </li>
          <?php endforeach; ?>
        </ol>
      <?php endif; ?>
    </section>
  </main>
  <script>window.KOOBD_SESSION = { role: 'teacher' };</script>
</body>
</html>
