<?php
require_once('teacher_auth.php');
$user = koobdRequireStudentAuth(true);
$profile = koobdResolvedProfile($user);
$classroomId = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$profileEditPath = 'profile.php';
$classroom = null;
$teacherProfile = null;

if ($classroomId <= 0) {
    header("Location: classroom.php");
    exit();
}

$stmt = $conn->prepare(
    "SELECT
        c.id,
        c.title,
        c.lesson,
        c.story_id,
        c.class_code,
        c.created_at,
        t.username,
        t.selected_reader,
        t.profile_reader_name,
        t.profile_top_color,
        t.profile_bottom_color,
        t.profile_accent_color,
        t.profile_card_style,
        t.profile_scale
     FROM classrooms c
     INNER JOIN users t ON t.id = c.teacher_id
     WHERE c.id = ? AND c.status = 'active' AND t.user_role = 'teacher'
     LIMIT 1"
);
$stmt->bind_param("i", $classroomId);
$stmt->execute();
$result = $stmt->get_result();
$classroom = $result ? $result->fetch_assoc() : null;
$stmt->close();

if (!$classroom) {
    header("Location: classroom.php");
    exit();
}

$teacherProfile = koobdResolvedTeacherProfile($classroom);

$membershipStmt = $conn->prepare(
    "SELECT id FROM classroom_students WHERE classroom_id = ? AND student_user_id = ? LIMIT 1"
);
$membershipStmt->bind_param("ii", $classroomId, $user['id']);
$membershipStmt->execute();
$membershipResult = $membershipStmt->get_result();
$membershipRow = $membershipResult ? $membershipResult->fetch_assoc() : null;
$membershipStmt->close();

if (!$membershipRow) {
    header("Location: classroom.php");
    exit();
}

// Every published activity in this classroom, with this student's progress:
// a story (Start, Continue / Restart, or Read Again) or a set of questions
// (Start, or their result once submitted). Drafts are the teacher's only.
$activities = array_values(array_filter(
    koobdClassroomActivities($classroomId, true),
    static fn($activity) => $activity['type'] === 'quiz' || $activity['story'] !== null
));
$progressMap = koobdActivityProgressMap(array_filter($activities, static fn($activity) => $activity['type'] === 'story'), [(int)$user['id']]);
$quizIds = array_column(array_filter($activities, static fn($activity) => $activity['type'] === 'quiz'), 'id');
$quizMap = koobdQuizSubmissionMap($quizIds, [(int)$user['id']]);
$questionCounts = [];
if ($quizIds) {
    $countResult = $conn->query(
        "SELECT activity_id, COUNT(*) AS total FROM activity_questions WHERE activity_id IN (" . implode(',', array_map('intval', $quizIds)) . ") GROUP BY activity_id"
    );
    while ($countResult && ($row = $countResult->fetch_assoc())) {
        $questionCounts[(int)$row['activity_id']] = (int)$row['total'];
    }
}
$today = date('Y-m-d');
$completedCount = 0;
$progressTotal = 0;
foreach ($activities as $index => $activity) {
    if ($activity['type'] === 'quiz') {
        $result = $quizMap[$activity['id']][(int)$user['id']] ?? null;
        $completedCount += $result ? 1 : 0;
        $progressTotal += $result ? 100 : 0;
        if ($result) {
            $status = ['Submitted', 'is-done'];
        } elseif ($activity['due_date'] !== '' && $activity['due_date'] < $today) {
            $status = ['Overdue', 'is-late'];
        } elseif ($activity['due_date'] === $today) {
            $status = ['Due today', 'is-soon'];
        } else {
            $status = ['Not started', 'is-new'];
        }
        $activities[$index] += [
            'number' => $index + 1,
            'progress' => $result ? 100 : 0,
            'result' => $result,
            'questions' => $questionCounts[$activity['id']] ?? 0,
            'href' => 'quiz_take.php?activity=' . (int)$activity['id'],
            'state' => $status,
            'action' => $result ? 'View result' : 'Start',
        ];
        continue;
    }
    $saved = $progressMap[$activity['id']][(int)$user['id']] ?? null;
    $value = (int)$saved;
    $story = $activity['story'];
    $href = koobdStoryStudentHref($story, $activity['id'], $value);
    $completedCount += $value >= 100 ? 1 : 0;
    $progressTotal += $value;

    if ($value >= 100) {
        $status = ['Completed', 'is-done'];
    } elseif ($activity['due_date'] !== '' && $activity['due_date'] < $today) {
        $status = ['Overdue', 'is-late'];
    } elseif ($activity['due_date'] === $today) {
        $status = ['Due today', 'is-soon'];
    } elseif ($saved !== null) {
        $status = ['In progress', 'is-going'];
    } else {
        $status = ['Not started', 'is-new'];
    }

    $activities[$index] += [
        'number' => $index + 1,
        'progress' => $value,
        'started' => $saved !== null,
        'href' => $href,
        'state' => $status,
        'action' => $saved === null ? 'Start' : ($value >= 100 ? 'Read Again' : 'Continue'),
        'restart' => ($saved !== null && $value < 100) ? koobdStoryStudentHref($story, $activity['id'], 0) : '',
    ];
}
$activityCount = count($activities);
$overallProgress = $activityCount > 0 ? (int)round($progressTotal / $activityCount) : 0;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <script src="<?= koobdAsset('js/i18n-tl.js') ?>"></script>
  <script src="<?= koobdAsset('js/i18n.js') ?>"></script>
  <script src="<?= koobdAsset('js/performance-mode.js') ?>"></script>
  <link rel="stylesheet" href="<?= koobdAsset('css/scrollbar.css') ?>">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KoobD - Classroom</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/app.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/classroom.css') ?>">
  <link rel="icon" type="image/png" href="assets/images/icons/favicon.png">
  <?php // Installable as an app (manifest.webmanifest): opens without the address bar. ?>
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#f3f8ff">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="KoobD">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link rel="apple-touch-icon" href="assets/images/icons/app/apple-touch-icon.png">
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
</head>
<body class="app-bg classroom-page">
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-inner">
        <div class="sidebar-top">
          <div class="sidebar-brand-mark">
            <img src="assets/images/logos/logo.png" alt="KoobD">
          </div>
          <div class="sidebar-brand-text">KoobD</div>
          <div class="sidebar-divider"></div>

          <nav class="sidebar-nav" aria-label="Main navigation">
            <a href="home.php" class="sidebar-link">
              <div class="sidebar-icon-box">
                <img src="assets/images/icons/HOME 1.png" alt="">
              </div>
            </a>
            <a href="classroom.php" class="sidebar-link active">
              <div class="sidebar-icon-box">
                <img src="assets/images/icons/classroom 1.png" alt="">
              </div>
            </a>
            <a href="teacher_stories.php" class="sidebar-link sidebar-link-stories" aria-label="My Stories" title="My Stories">
              <div class="sidebar-icon-box">
                <svg class="sidebar-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H19v-5"/><path d="M8.5 7.5h6M8.5 11h4"/></svg>
              </div>
            </a>
          </nav>
        </div>

        <div class="sidebar-bottom">
          <div class="sidebar-account sidebar-profile-menu">
            <button type="button" class="sidebar-profile-link" aria-haspopup="true" aria-expanded="false" aria-controls="sidebarProfileMenu" aria-label="Profile menu" title="Profile">
              <span
                class="sidebar-profile-card"
                style="--profile-top:<?= htmlspecialchars($profile['top']) ?>; --profile-bottom:<?= htmlspecialchars($profile['bottom']) ?>; --profile-accent:<?= htmlspecialchars($profile['accent']) ?>;"
              >
                <span class="sidebar-profile-avatar">
                  <img src="<?= htmlspecialchars($profile['asset']) ?>" alt="<?= htmlspecialchars($profile['name']) ?>">
                </span>
                <span class="sidebar-profile-name" translate="no"><?= htmlspecialchars($profile['name']) ?></span>
              </span>
            </button>
            <div class="sidebar-profile-popover" id="sidebarProfileMenu" hidden>
              <a href="<?= htmlspecialchars($profileEditPath) ?>" class="sidebar-profile-menu-item">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
                <span>My Profile</span>
              </a>
              <form action="logout.php" method="post" class="sidebar-menu-logout-form">
                <button type="submit" class="sidebar-profile-menu-item is-logout">
                  <img src="assets/images/icons/LOGOUT 1.png" alt="">
                  <span>Log out</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <main class="main">
      <div class="main-inner">
        <section class="classroom-room-shell">
          <div
            class="classroom-room-hero"
            style="--room-top:<?= htmlspecialchars($teacherProfile['top']) ?>; --room-bottom:<?= htmlspecialchars($teacherProfile['bottom']) ?>;"
          >
            <div class="classroom-room-hero-copy">
              <a href="classroom.php" class="classroom-room-back">Back to classes</a>
              <div class="classroom-room-kicker">Classroom</div>
              <h1 class="classroom-room-title" translate="no"><?= htmlspecialchars($classroom['title']) ?></h1>
              <p class="classroom-room-subtitle">Teacher <?= htmlspecialchars($teacherProfile['name']) ?> has <?= $activityCount === 0 ? 'not added any activities yet' : ($activityCount === 1 ? 'added 1 activity' : 'added ' . $activityCount . ' activities') ?> for this class.</p>
              <?php if (!empty($classroom['class_code'])): ?>
                <div class="classroom-room-code">Class code: <?= htmlspecialchars($classroom['class_code']) ?></div>
              <?php endif; ?>
            </div>
            <div class="classroom-room-teacher">
              <div class="classroom-room-teacher-avatar">
                <img src="<?= htmlspecialchars($teacherProfile['asset']) ?>" alt="<?= htmlspecialchars($teacherProfile['name']) ?>">
              </div>
              <div class="classroom-room-teacher-meta">
                <div class="classroom-room-teacher-label">Teacher profile</div>
                <div class="classroom-room-teacher-name" translate="no"><?= htmlspecialchars($teacherProfile['name']) ?></div>
              </div>
            </div>
          </div>

          <div class="classroom-room-grid">
            <aside class="classroom-room-side">
              <article class="classroom-room-panel classroom-room-progress">
                <div class="classroom-room-panel-kicker">Your progress</div>
                <div class="classroom-room-progress-number"><?= $completedCount ?>/<?= $activityCount ?></div>
                <div class="classroom-room-progress-bar">
                  <span style="width: <?= $overallProgress ?>%;"></span>
                </div>
                <p class="classroom-room-progress-copy">
                  <?= $activityCount === 0
                    ? 'Your activities will appear here when your teacher adds them.'
                    : ($completedCount === $activityCount ? 'All activities completed. Great work!' : 'Activities completed. Your teacher can see the progress you make.') ?>
                </p>
              </article>
            </aside>

            <div class="classroom-room-main">
              <article class="classroom-stream-card">
                <div class="classroom-stream-head">
                  <div>
                    <div class="classroom-room-panel-kicker">Activities</div>
                    <h2>Your activities</h2>
                  </div>
                  <div class="classroom-stream-date"><?= $activityCount ?> <?= $activityCount === 1 ? 'activity' : 'activities' ?></div>
                </div>

                <?php if (empty($activities)): ?>
                  <div class="activity-empty">
                    <div class="classroom-empty-title">No activities yet</div>
                    <p class="classroom-stream-copy">Your teacher has not added an activity to this classroom yet. Check back soon.</p>
                  </div>
                <?php else: ?>
                  <ol class="activity-list">
                    <?php foreach ($activities as $activity): ?>
                      <?php $story = $activity['story']; ?>
                      <?php if ($activity['type'] === 'quiz'): ?>
                      <li class="activity-card activity-card-student is-quiz">
                        <div class="activity-card-cover"><span class="activity-card-quiz-cover" aria-hidden="true">?</span></div>
                        <div class="activity-card-body">
                          <div class="activity-card-head">
                            <h3 class="activity-card-title" translate="no"><span class="activity-card-index"><?= (int)$activity['number'] ?>.</span> <?= htmlspecialchars($activity['title']) ?></h3>
                            <span class="activity-status <?= $activity['state'][1] ?>"><?= htmlspecialchars($activity['state'][0]) ?></span>
                          </div>
                          <div class="activity-card-meta">
                            <span class="activity-type-badge">Quiz</span>
                            <span class="activity-chip"><?= (int)$activity['questions'] ?> question<?= (int)$activity['questions'] === 1 ? '' : 's' ?></span>
                            <?php if ($activity['due_date'] !== ''): ?>
                              <span class="activity-chip">Due <?= htmlspecialchars(date('M j, Y', strtotime($activity['due_date']))) ?></span>
                            <?php endif; ?>
                          </div>
                          <?php $quizText = $activity['description'] !== '' ? $activity['description'] : $activity['instructions']; ?>
                          <?php if ($quizText !== ''): ?>
                            <p class="activity-card-text"><?= nl2br(htmlspecialchars($quizText)) ?></p>
                          <?php endif; ?>
                          <div class="activity-card-stats">
                            <div class="activity-card-progress">
                              <?php if ($activity['result']): ?>
                                <div class="teacher-student-progress-bar"><span style="width: <?= (int)$activity['result']['percent'] ?>%;"></span></div>
                                <span class="activity-card-progress-label">Score <?= (int)$activity['result']['score'] ?>/<?= (int)$activity['result']['total'] ?></span>
                              <?php else: ?>
                                <span class="activity-card-progress-label is-muted">Answer every question, then submit once.</span>
                              <?php endif; ?>
                            </div>
                            <a href="<?= htmlspecialchars($activity['href']) ?>" class="classroom-room-book-btn activity-open-btn"><?= htmlspecialchars($activity['action']) ?></a>
                          </div>
                        </div>
                      </li>
                      <?php continue; endif; ?>
                      <li class="activity-card activity-card-student">
                        <div class="activity-card-cover">
                          <?php if (!empty($story['cover'])): ?>
                            <img src="<?= htmlspecialchars($story['cover']) ?>" loading="lazy" decoding="async" alt="">
                          <?php else: ?>
                            <span aria-hidden="true"><?= (int)$activity['number'] ?></span>
                          <?php endif; ?>
                        </div>
                        <div class="activity-card-body">
                          <div class="activity-card-head">
                            <h3 class="activity-card-title" translate="no"><span class="activity-card-index"><?= (int)$activity['number'] ?>.</span> <?= htmlspecialchars($activity['title']) ?></h3>
                            <span class="activity-status <?= $activity['state'][1] ?>"><?= htmlspecialchars($activity['state'][0]) ?></span>
                          </div>
                          <div class="activity-card-meta">
                            <?php if ($activity['raw_title'] !== '' || !$story): ?>
                              <span class="activity-card-story" translate="no"><?= htmlspecialchars($story['title']) ?></span>
                            <?php endif; ?>
                            <?= koobdStoryModeBadge($activity['mode'], true) ?>
                            <?php if ($activity['due_date'] !== ''): ?>
                              <span class="activity-chip">Due <?= htmlspecialchars(date('M j, Y', strtotime($activity['due_date']))) ?></span>
                            <?php endif; ?>
                          </div>
                          <?php if ($activity['instructions'] !== ''): ?>
                            <p class="activity-card-text"><?= nl2br(htmlspecialchars($activity['instructions'])) ?></p>
                          <?php elseif ($activity['lesson'] !== ''): ?>
                            <p class="activity-card-text" translate="no"><?= htmlspecialchars($activity['lesson']) ?></p>
                          <?php endif; ?>
                          <div class="activity-card-stats">
                            <div class="activity-card-progress">
                              <div class="teacher-student-progress-bar"><span style="width: <?= (int)$activity['progress'] ?>%;"></span></div>
                              <span class="activity-card-progress-label"><?= (int)$activity['progress'] ?>%</span>
                            </div>
                            <a href="<?= htmlspecialchars($activity['href']) ?>" class="classroom-room-book-btn activity-open-btn"<?= koobdStoryDetailsData([
                              'title' => $activity['title'], 'href' => $activity['href'], 'cover' => $story['cover'] ?? '', 'mode' => $activity['mode'],
                              'creator' => 'Assigned by Teacher ' . $teacherProfile['name'],
                              'description' => $activity['instructions'] !== '' ? $activity['instructions'] : ($story['summary'] ?? ($story['description'] ?? '')),
                              'lesson' => $activity['lesson'],
                              'progress' => $activity['started'] ? $activity['progress'] : null,
                              'play' => $activity['action'],
                              'alt-href' => $activity['restart'],
                              'alt-label' => 'Restart',
                              'key' => koobdFavoriteKeyForStory($story),
                            ]) ?>><?= htmlspecialchars($activity['action']) ?></a>
                          </div>
                        </div>
                      </li>
                    <?php endforeach; ?>
                  </ol>
                <?php endif; ?>
              </article>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>

  <script>
    window.KOOBD_SESSION = <?= json_encode([
      'role' => 'student',
    ]) ?>;
  </script>
  <script src="<?= koobdAsset('js/story-details.js') ?>"></script>
  <script src="<?= koobdAsset('js/sidebar.js') ?>"></script>
</body>
</html>
