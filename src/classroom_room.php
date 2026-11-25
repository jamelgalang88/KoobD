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
$today = koobdToday();
$completedCount = 0;
$progressTotal = 0;
// Stories and quizzes are listed (and numbered) separately.
$typeCounts = ['story' => 0, 'quiz' => 0];
foreach ($activities as $index => $activity) {
    if ($activity['type'] === 'quiz') {
        $result = $quizMap[$activity['id']][(int)$user['id']] ?? null;
        $completedCount += $result ? 1 : 0;
        $progressTotal += $result ? 100 : 0;
        if ($result) {
            $status = ['Submitted', 'is-done'];
        } elseif (koobdActivityClosed($activity)) {
            // Past the due date: closed, it can no longer be taken.
            $status = ['Closed', 'is-late'];
        } elseif ($activity['due_date'] === $today) {
            $status = ['Due today', 'is-soon'];
        } else {
            $status = ['Not started', 'is-new'];
        }
        $activities[$index] += [
            'number' => ++$typeCounts['quiz'],
            'progress' => $result ? 100 : 0,
            'result' => $result,
            'questions' => $questionCounts[$activity['id']] ?? 0,
            'href' => 'quiz_take.php?activity=' . (int)$activity['id'],
            'state' => $status,
            'action' => $result ? 'View result' : 'Start',
            // Closed and never submitted: nothing to open.
            'closed' => !$result && koobdActivityClosed($activity),
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
    } elseif (koobdActivityClosed($activity)) {
        $status = ['Closed', 'is-late'];
    } elseif ($activity['due_date'] === $today) {
        $status = ['Due today', 'is-soon'];
    } elseif ($saved !== null) {
        $status = ['In progress', 'is-going'];
    } else {
        $status = ['Not started', 'is-new'];
    }

    $activities[$index] += [
        'number' => ++$typeCounts['story'],
        'progress' => $value,
        'started' => $saved !== null,
        'href' => $href,
        'state' => $status,
        'action' => $saved === null ? 'Start' : ($value >= 100 ? 'Read Again' : 'Continue'),
        'restart' => ($saved !== null && $value < 100) ? koobdStoryStudentHref($story, $activity['id'], 0) : '',
        // Past the due date the story can no longer be opened (finished or not).
        'closed' => koobdActivityClosed($activity),
    ];
}
$activityCount = count($activities);
$overallProgress = $activityCount > 0 ? (int)round($progressTotal / $activityCount) : 0;

// Everyone in this classroom (only its own students), in the order they
// joined: picture and name only. Students never see each other's progress
// (only their own, in "Your progress"), so none is loaded here. The list is
// drawn into the side column and refreshed by the script at the bottom of the
// page, so students who join or leave appear or go without a reload.
$classmates = [];
$classmateStmt = $conn->prepare(
    "SELECT u.id, u.username, u.selected_reader, u.profile_reader_name, u.profile_badge_label,
            u.profile_top_color, u.profile_bottom_color, u.profile_accent_color, u.profile_card_style,
            u.profile_scale, u.user_role
     FROM classroom_students cs
     INNER JOIN users u ON u.id = cs.student_user_id
     WHERE cs.classroom_id = ? AND u.user_role = 'student'
     ORDER BY cs.joined_at ASC, u.id ASC"
);
$classmateStmt->bind_param("i", $classroomId);
$classmateStmt->execute();
$classmateResult = $classmateStmt->get_result();
while ($classmateResult && ($row = $classmateResult->fetch_assoc())) {
    $classmateProfile = koobdResolvedProfile($row);
    $classmates[] = [
        'id' => (int)$row['id'],
        'name' => $row['username'],
        'profile' => $classmateProfile['name'],
        'asset' => $classmateProfile['asset'],
        'top' => $classmateProfile['top'],
        'bottom' => $classmateProfile['bottom'],
    ];
}
$classmateStmt->close();

foreach ($classmates as $index => $classmate) {
    $classmates[$index]['isYou'] = $classmate['id'] === (int)$user['id'];
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <script src="<?= koobdAsset('js/i18n-tl.js') ?>"></script>
  <script src="<?= koobdAsset('js/i18n.js') ?>"></script>
  <script src="<?= koobdAsset('js/performance-mode.js') ?>"></script>
  <link rel="stylesheet" href="<?= koobdAsset('css/scrollbar.css') ?>">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content" />
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
  <link rel="stylesheet" href="<?= koobdAsset('css/social.css') ?>">
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
            <a href="home.php" class="sidebar-link" aria-label="Home">
              <div class="sidebar-icon-box">
                <img src="assets/images/icons/HOME 1.png" alt="">
              </div>
            </a>
            <a href="classroom.php" class="sidebar-link active" aria-label="Classroom">
              <div class="sidebar-icon-box">
                <img src="assets/images/icons/classroom 1.png" alt="">
              </div>
            </a>
            <a href="teacher_stories.php" class="sidebar-link sidebar-link-stories" aria-label="My Stories">
              <div class="sidebar-icon-box">
                <svg class="sidebar-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H19v-5"/><path d="M8.5 7.5h6M8.5 11h4"/></svg>
              </div>
            </a>
            <?php include __DIR__ . '/sidebar_approve_stories.php'; ?>
            <?php include __DIR__ . '/sidebar_last_read.php'; ?>
            <a href="versus.php" class="sidebar-link sidebar-link-versus" aria-label="Versus Mode">
              <div class="sidebar-icon-box">
                <svg class="sidebar-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 6h9A5.5 5.5 0 0 1 22 11.5v1.5a4 4 0 0 1-7.2 2.4L14 14.5h-4l-.8.9A4 4 0 0 1 2 13v-1.5A5.5 5.5 0 0 1 7.5 6z"/><path d="M6 10v4M4 12h4"/><circle cx="16" cy="11" r=".6"/><circle cx="18" cy="13" r=".6"/></svg>
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
            <span class="sidebar-profile-visible-name" translate="no"><?= htmlspecialchars($profile['name']) ?></span>
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
          <?php // One compact header: the class, its code and activity count, Message Teacher and the bell on one row, and the teacher in a slim card beside them. ?>
          <div
            class="classroom-room-hero student-room-hero"
            style="--room-top:<?= htmlspecialchars($teacherProfile['top']) ?>; --room-bottom:<?= htmlspecialchars($teacherProfile['bottom']) ?>;"
          >
            <div class="classroom-room-hero-copy">
              <a href="classroom.php" class="classroom-room-back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Classes</a>
              <div class="classroom-room-kicker">Classroom</div>
              <h1 class="classroom-room-title" translate="no"><?= htmlspecialchars($classroom['title']) ?></h1>
              <div class="tr-hero-meta">
                <?php if (!empty($classroom['class_code'])): ?>
                  <div class="tr-code">
                    <span class="tr-code-label">Class code</span>
                    <span class="tr-code-value" translate="no"><?= htmlspecialchars($classroom['class_code']) ?></span>
                  </div>
                <?php endif; ?>
                <div class="activity-hero-stats">
                  <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/></svg><strong><?= $activityCount ?></strong> <?= $activityCount === 1 ? 'activity' : 'activities' ?></span>
                </div>
                <?php // A private conversation with the teacher, and notifications (js/classroom-social.js). ?>
                <div class="sc-social-actions">
                  <button type="button" class="sc-chat-btn" data-social-chat aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>Message Teacher</button>
                  <button type="button" class="sc-bell" data-social-bell aria-label="Notifications" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15zM10 20a2 2 0 004 0"/></svg></button>
                </div>
              </div>
            </div>
            <div class="classroom-room-teacher">
              <div class="classroom-room-teacher-avatar">
                <img src="<?= htmlspecialchars($teacherProfile['asset']) ?>" alt="<?= htmlspecialchars($teacherProfile['name']) ?>">
              </div>
              <div class="classroom-room-teacher-meta">
                <div class="classroom-room-teacher-label">Teacher</div>
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
                <?php // Phones: the classmates open in a pop-up from here instead of filling the page. ?>
                <button type="button" class="cm-open-btn" data-classmates-open aria-controls="classmatesPanel" aria-expanded="false" aria-haspopup="dialog">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14.5a6.5 6.5 0 013.5 5.5"/></svg>
                  Classmates
                  <span class="cm-count" data-classmates-count><?= count($classmates) ?></span>
                </button>
              </article>

              <?php // Classmates: everyone in this classroom, picture and name only (kept up to date by the script below). ?>
              <div class="cm-backdrop" data-classmates-close hidden></div>
              <article class="classroom-room-panel cm-panel" id="classmatesPanel" aria-labelledby="classmatesTitle" data-classmates>
                <div class="cm-head">
                  <h2 class="cm-title" id="classmatesTitle">Classmates</h2>
                  <span class="cm-count"><?= count($classmates) ?></span>
                  <button type="button" class="cm-close" data-classmates-close aria-label="Close classmates">&times;</button>
                </div>
                <?php if (count($classmates) <= 1): ?>
                  <p class="cm-empty">No classmates yet. Students who join with the class code will show up here.</p>
                <?php endif; ?>
                <ul class="cm-list">
                  <?php foreach ($classmates as $classmate): ?>
                    <li class="cm-item<?= $classmate['isYou'] ? ' is-you' : '' ?>">
                      <span class="cm-avatar" style="--cm-top:<?= htmlspecialchars($classmate['top']) ?>; --cm-bottom:<?= htmlspecialchars($classmate['bottom']) ?>;">
                        <img src="<?= htmlspecialchars($classmate['asset']) ?>" alt="" loading="lazy" decoding="async">
                      </span>
                      <span class="cm-info">
                        <span class="cm-name" translate="no"><?= htmlspecialchars($classmate['profile']) ?><?php if ($classmate['isYou']): ?> <span class="cm-you">You</span><?php endif; ?></span>
                        <span class="cm-user" translate="no"><?= htmlspecialchars($classmate['name']) ?></span>
                      </span>
                    </li>
                  <?php endforeach; ?>
                </ul>
              </article>
            </aside>

            <div class="classroom-room-main">
              <?php
              // Sent back from an activity whose due date has passed.
              $closedNotice = null;
              foreach ($activities as $item) {
                  if ((int)$item['id'] === (int)($_GET['closed'] ?? 0) && koobdActivityClosed($item)) {
                      $closedNotice = $item;
                  }
              }
              ?>
              <?php if ($closedNotice): ?>
                <div class="activity-closed-notice" role="status">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>
                  <p><strong translate="no"><?= htmlspecialchars($closedNotice['title']) ?></strong> is closed. It was due <?= htmlspecialchars(date('M j, Y', strtotime($closedNotice['due_date']))) ?>, so it can no longer be done.</p>
                </div>
              <?php endif; ?>
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
                  <?php
                  $studentGroups = [
                    'story' => array_values(array_filter($activities, static fn($item) => $item['type'] !== 'quiz')),
                    'quiz' => array_values(array_filter($activities, static fn($item) => $item['type'] === 'quiz')),
                  ];
                  ?>
                  <?php // With both kinds: tabs show reading activities or quizzes, one kind at a time. ?>
                  <?php $tabbed = $studentGroups['story'] && $studentGroups['quiz']; ?>
                  <?php if ($tabbed): ?>
                <?php
                // Which kind shows first: the one a link points at (?comments=<id>), else reading
                // activities. js/activity-tabs.js switches them and remembers the last one used.
                $linkedId = (int)($_GET['comments'] ?? 0);
                $activityTab = 'story';
                foreach ($studentGroups['quiz'] as $linkedActivity) {
                    if ((int)$linkedActivity['id'] === $linkedId) {
                        $activityTab = 'quiz';
                    }
                }
                ?>
                <div class="tr-tabs" role="tablist" aria-label="Kind of activity" data-activity-tabs="<?= (int)$classroomId ?>">
                  <?php foreach (['story' => 'Reading', 'quiz' => 'Quiz'] as $tabType => $tabLabel): ?>
                    <button type="button" class="tr-tab is-<?= $tabType ?><?= $activityTab === $tabType ? ' is-active' : '' ?>" role="tab" id="studentTab-<?= $tabType ?>" data-tab="<?= $tabType ?>"
                            aria-controls="studentPanel-<?= $tabType ?>" aria-selected="<?= $activityTab === $tabType ? 'true' : 'false' ?>" tabindex="<?= $activityTab === $tabType ? '0' : '-1' ?>">
                      <span class="tr-tab-icon"><?= $tabType === 'quiz' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h10M9 12h10M9 19h10M4 4.5l1.2 1.2L7.5 3.5M4 11.5l1.2 1.2 2.3-2.2M4.5 18.5h2"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/></svg>' ?></span>
                      <span class="tr-tab-label"><?= $tabLabel ?><span class="tr-tab-more"> Activities</span></span>
                      <span class="tr-tab-count"><?= count($studentGroups[$tabType]) ?></span>
                    </button>
                  <?php endforeach; ?>
                </div>
                  <?php endif; ?>
                  <div class="tr-groups<?= $tabbed ? ' has-tabs' : '' ?>">
                  <?php foreach ($studentGroups as $groupType => $groupActivities): ?>
                    <?php if (!$groupActivities) continue; ?>
                    <?php $isQuizGroup = $groupType === 'quiz'; ?>
                  <?php if ($tabbed): ?>
                  <section class="tr-group is-<?= $groupType ?>" id="studentPanel-<?= $groupType ?>" role="tabpanel" aria-labelledby="studentTab-<?= $groupType ?>"<?= $activityTab === $groupType ? '' : ' hidden' ?>>
                  <?php else: ?>
                  <section class="tr-group is-<?= $groupType ?>" aria-labelledby="studentGroup-<?= $groupType ?>">
                  <?php endif; ?>
                    <div class="tr-group-head">
                      <span class="tr-group-icon"><?= $isQuizGroup ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h10M9 12h10M9 19h10M4 4.5l1.2 1.2L7.5 3.5M4 11.5l1.2 1.2 2.3-2.2M4.5 18.5h2"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/></svg>' ?></span>
                      <h3 class="tr-group-title" id="studentGroup-<?= $groupType ?>"><?= $isQuizGroup ? 'Quizzes' : 'Stories' ?></h3>
                      <span class="tr-group-count"><?= count($groupActivities) ?></span>
                    </div>
                  <ol class="activity-list">
                    <?php foreach ($groupActivities as $activity): ?>
                      <?php $story = $activity['story']; ?>
                      <?php if ($activity['type'] === 'quiz'): ?>
                      <li class="activity-card activity-card-student is-quiz">
                        <div class="activity-card-body">
                          <div class="activity-card-head">
                            <h3 class="activity-card-title" translate="no"><span class="activity-card-index"><?= (int)$activity['number'] ?>.</span> <?= htmlspecialchars($activity['title']) ?></h3>
                            <span class="activity-status <?= $activity['state'][1] ?>"><?= htmlspecialchars($activity['state'][0]) ?></span>
                          </div>
                          <div class="activity-card-meta">
                            <span class="activity-type-badge">Quiz</span>
                            <span class="activity-chip"><?= (int)$activity['questions'] ?> question<?= (int)$activity['questions'] === 1 ? '' : 's' ?></span>
                            <?php if ($activity['due_date'] !== ''): ?>
                              <span class="activity-chip<?= koobdActivityClosed($activity) ? ' is-closed' : '' ?>"><?= koobdActivityClosed($activity) ? 'Closed · was due ' : 'Due ' ?><?= htmlspecialchars(date('M j, Y', strtotime($activity['due_date']))) ?></span>
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
                                <span class="activity-card-progress-label">Score <?= (int)$activity['result']['score'] ?>/<?= (int)$activity['result']['total'] ?><?= !empty($activity['result']['pending']) ? ' · essay being graded' : '' ?></span>
                              <?php else: ?>
                                <span class="activity-card-progress-label is-muted">Answer every question, then submit once.</span>
                              <?php endif; ?>
                            </div>
                            <?php if ($activity['closed']): ?>
                              <span class="classroom-room-book-btn activity-open-btn is-closed" aria-disabled="true" title="The due date has passed"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>Closed</span>
                            <?php else: ?>
                              <a href="<?= htmlspecialchars($activity['href']) ?>" class="classroom-room-book-btn activity-open-btn"><?= htmlspecialchars($activity['action']) ?></a>
                            <?php endif; ?>
                          </div>
                        </div>
                        <?php // Class comments: this activity's public discussion, across the whole card (js/classroom-social.js). ?>
                        <div class="activity-comments" id="activity-<?= (int)$activity['id'] ?>" data-activity-comments="<?= (int)$activity['id'] ?>"></div>
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
                              <span class="activity-chip<?= koobdActivityClosed($activity) ? ' is-closed' : '' ?>"><?= koobdActivityClosed($activity) ? 'Closed · was due ' : 'Due ' ?><?= htmlspecialchars(date('M j, Y', strtotime($activity['due_date']))) ?></span>
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
                            <?php if ($activity['closed']): ?>
                              <span class="classroom-room-book-btn activity-open-btn is-closed" aria-disabled="true" title="The due date has passed"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>Closed</span>
                            <?php else: ?>
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
                            <?php endif; ?>
                          </div>
                        </div>
                        <?php // Class comments: this activity's public discussion, across the whole card (js/classroom-social.js). ?>
                        <div class="activity-comments" id="activity-<?= (int)$activity['id'] ?>" data-activity-comments="<?= (int)$activity['id'] ?>"></div>
                      </li>
                    <?php endforeach; ?>
                  </ol>
                  </section>
                  <?php endforeach; ?>
                  </div>
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
  <script src="<?= koobdAsset('js/activity-tabs.js') ?>"></script>
  <script src="<?= koobdAsset('js/story-details.js') ?>"></script>
  <script src="<?= koobdAsset('js/sidebar.js') ?>"></script>
  <script>
    window.KOOBD_SOCIAL = <?= json_encode([
        'classroom' => $classroomId,
        'role' => 'student',
        'openChat' => isset($_GET['chat']),
        'openComments' => (int)($_GET['comments'] ?? 0),
    ]) ?>;
  </script>
  <script src="<?= koobdAsset('js/classroom-social.js') ?>"></script>
  <script>
    (() => {
      // Keep the classmates list current: every minute while the page is
      // open and in view (and on coming back to it), fetch this page again and
      // swap in its list if it changed - students who joined or left. Nothing
      // is fetched while the tab is hidden.
      const panel = document.querySelector('[data-classmates]');
      if (!panel) return;

      // Phones: the list is a pop-up opened by the Classmates button under
      // Your progress (css/classroom.css shows the button and hides the list
      // below 600px wide). Closed by its X, a tap outside, or Escape.
      const opener = document.querySelector('[data-classmates-open]');
      const backdrop = document.querySelector('.cm-backdrop');
      const phone = window.matchMedia('(max-width: 599px)');
      function setOpen(open) {
        if (!opener || !backdrop) return;
        panel.classList.toggle('is-open', open);
        backdrop.hidden = !open;
        document.body.classList.toggle('has-cm-open', open);
        opener.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
          panel.setAttribute('role', 'dialog');
          panel.setAttribute('aria-modal', 'true');
          const close = panel.querySelector('.cm-close');
          if (close) close.focus();
        } else {
          panel.removeAttribute('role');
          panel.removeAttribute('aria-modal');
        }
      }
      if (opener) opener.addEventListener('click', () => setOpen(true));
      document.addEventListener('click', (event) => {
        if (event.target.closest('[data-classmates-close]') && panel.classList.contains('is-open')) {
          setOpen(false);
          opener.focus();
        }
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && panel.classList.contains('is-open')) {
          setOpen(false);
          opener.focus();
        }
      });
      // Turned or resized past phone size: the list is back in the page.
      const leavePhone = () => { if (!phone.matches && panel.classList.contains('is-open')) setOpen(false); };
      if (phone.addEventListener) phone.addEventListener('change', leavePhone);

      if (!window.fetch || !window.DOMParser) return;
      let busy = false;
      async function refresh() {
        if (busy || document.hidden) return;
        busy = true;
        try {
          const response = await fetch(window.location.href, { credentials: 'same-origin', cache: 'no-store' });
          if (!response.ok || response.redirected) return;
          const page = new DOMParser().parseFromString(await response.text(), 'text/html');
          const fresh = page.querySelector('[data-classmates]');
          if (fresh && fresh.innerHTML.trim() !== panel.innerHTML.trim()) {
            panel.innerHTML = fresh.innerHTML;
            const count = document.querySelector('[data-classmates-count]');
            const freshCount = fresh.querySelector('.cm-count');
            if (count && freshCount) count.textContent = freshCount.textContent;
          }
        } catch (error) {
          // Offline for a moment: the list stays as it is and tries again later.
        } finally {
          busy = false;
        }
      }
      window.setInterval(refresh, 60000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    })();
  </script>
</body>
</html>
