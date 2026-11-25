<?php
// One student's screen time in one of the teacher's classrooms: totals, daily
// use, a day-by-day timeline and session history (js/screen-time-report.js,
// screen_time_api.php). Opened from the classroom's Screen Time tab.
//   teacher_screen_time.php?classroom=<id>&student=<id>[&range=...]
// Only the classroom's teacher, and only for a student in the classroom now.
require_once __DIR__ . '/teacher_auth.php';
require_once __DIR__ . '/screen_time_lib.php';
require_once __DIR__ . '/missions_lib.php';
require_once __DIR__ . '/achievements_lib.php';
$user = koobdTeacherRequireAuth(true);
$profile = koobdResolvedTeacherProfile($user);
$profileEditPath = 'profile.php';
$classroomId = (int)($_GET['classroom'] ?? 0);
$classroom = stTeacherClassroom($user, $classroomId);
$student = $classroom ? stClassroomStudent($classroomId, (int)($_GET['student'] ?? 0)) : null;
if (!$classroom) {
    header('Location: classroom.php');
    exit();
}
$backHref = 'teacher_classroom.php?id=' . $classroomId . '#screen-time';
if (!$student) {
    header('Location: ' . $backHref);
    exit();
}
koobdMissionRecord($user, 'screen_time');
koobdAchievementRecordEvent($user, 'screen_time_student', (string)(int)$student['id']);
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
  <title>KoobD - Screen Time</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/app.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/classroom.css') ?>">
  <link rel="icon" type="image/png" href="assets/images/icons/favicon.png">
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#f3f8ff">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <link rel="apple-touch-icon" href="assets/images/icons/app/apple-touch-icon.png">
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/screen-time.css') ?>">
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
            <a href="create_story.php" class="sidebar-link sidebar-link-add" aria-label="Create story">
              <div class="sidebar-icon-box sidebar-icon-add">+</div>
            </a>
          </nav>
        </div>

        <div class="sidebar-bottom">
          <div class="sidebar-account sidebar-profile-menu">
            <button type="button" class="sidebar-profile-link" aria-haspopup="true" aria-expanded="false" aria-controls="sidebarProfileMenu" aria-label="Profile menu" title="Profile">
              <span class="sidebar-profile-card" style="--profile-top:<?= htmlspecialchars($profile['top']) ?>; --profile-bottom:<?= htmlspecialchars($profile['bottom']) ?>; --profile-accent:<?= htmlspecialchars($profile['accent']) ?>;">
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
        <section class="st-page">
          <header class="st-student-hero">
            <a class="classroom-room-back" href="<?= htmlspecialchars($backHref) ?>"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span translate="no"><?= htmlspecialchars($classroom['title']) ?></span></a>
            <div class="st-student-hero-row">
              <span class="st-avatar is-lg" style="--a:<?= htmlspecialchars($student['top']) ?>;--b:<?= htmlspecialchars($student['bottom']) ?>"><img src="<?= htmlspecialchars($student['asset']) ?>" alt=""></span>
              <div>
                <div class="classroom-room-panel-kicker">Screen time</div>
                <h1 translate="no"><?= htmlspecialchars($student['name']) ?></h1>
                <p><span translate="no"><?= htmlspecialchars($student['character']) ?></span> · in <span translate="no"><?= htmlspecialchars($classroom['title']) ?></span> since <?= htmlspecialchars(date('M j, Y', strtotime($student['joined']))) ?></p>
              </div>
            </div>
          </header>
          <div class="classroom-stream-card st-panel">
            <div data-st-report data-mode="student" data-classroom="<?= (int)$classroomId ?>" data-student="<?= (int)$student['id'] ?>"></div>
          </div>
        </section>
      </div>
    </main>
  </div>
  <script src="<?= koobdAsset('js/screen-time-report.js') ?>"></script>
  <script src="<?= koobdAsset('js/sidebar.js') ?>"></script>
</body>
</html>
