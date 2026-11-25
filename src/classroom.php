<?php
require_once('auth.php');
$user = koobdRequireAuth(true);
$username = $user["username"];
$profile = koobdResolvedProfile($user);
$isTeacher = koobdIsTeacher($user);
$profileEditPath = 'profile.php';
$storyCatalog = $isTeacher ? koobdAssignableStoriesForTeacher((int)$user['id']) : koobdStoryCatalog();

ini_set('display_errors', 1);
error_reporting(E_ALL);

$joinError = '';
$joinCode = '';
$statusMessage = '';
$classroomCards = [];
$editingClassroom = null;
$openJourneyClassroom = $isTeacher && (($_GET['journey_action'] ?? '') === 'create_classroom');

if ($isTeacher) {
    // One classroom per group of students; its activities (the stories it
    // assigns) are added and managed inside it (teacher_classroom.php).
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'create_classroom') {
        $title = trim($_POST['classroom_title'] ?? '');
        $storyId = trim($_POST['story_id'] ?? '');

        if ($title !== '') {
            $classroomCode = koobdGenerateClassroomCode($conn);
            $stmt = $conn->prepare(
                "INSERT INTO classrooms (teacher_id, title, lesson, story_id, class_code) VALUES (?, ?, NULL, '', ?)"
            );
            $stmt->bind_param("iss", $user['id'], $title, $classroomCode);
            $stmt->execute();
            $newClassroomId = (int)$stmt->insert_id;
            $stmt->close();

            // The first activity, if a story was chosen.
            if ($newClassroomId > 0 && isset($storyCatalog[$storyId])) {
                $activityStmt = $conn->prepare(
                    "INSERT INTO classroom_activities (classroom_id, title, story_id, position) VALUES (?, '', ?, 1)"
                );
                $activityStmt->bind_param("is", $newClassroomId, $storyId);
                $activityStmt->execute();
                $activityStmt->close();
            }

            header('Location: teacher_classroom.php?id=' . $newClassroomId . '&done=created');
            exit();
        }
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'update_classroom') {
        $classroomId = (int)($_POST['classroom_id'] ?? 0);
        $title = trim($_POST['classroom_title'] ?? '');

        if ($classroomId > 0 && $title !== '') {
            $stmt = $conn->prepare(
                "UPDATE classrooms SET title = ? WHERE id = ? AND teacher_id = ?"
            );
            $stmt->bind_param("sii", $title, $classroomId, $user['id']);
            $stmt->execute();
            $stmt->close();
            $statusMessage = 'Classroom updated.';
        }
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'delete_classroom') {
        $classroomId = (int)($_POST['classroom_id'] ?? 0);

        if ($classroomId > 0) {
            $ownsClassroom = $conn->prepare("SELECT id FROM classrooms WHERE id = ? AND teacher_id = ? LIMIT 1");
            $ownsClassroom->bind_param("ii", $classroomId, $user['id']);
            $ownsClassroom->execute();
            $messageFiles = [];
            if ($ownsClassroom->get_result()->fetch_assoc()) {
                koobdDeleteActivityProgress(array_column(koobdClassroomActivities($classroomId), 'id'));
                // Its private messages go with it; their photos and videos too (below).
                $files = $conn->prepare("SELECT DISTINCT attachment_path FROM classroom_messages WHERE classroom_id = ? AND attachment_path IS NOT NULL");
                $files->bind_param("i", $classroomId);
                $files->execute();
                $messageFiles = array_column($files->get_result()->fetch_all(), 0);
                $files->close();
            }
            $ownsClassroom->close();

            $deleteStudentsStmt = $conn->prepare(
                "DELETE cs FROM classroom_students cs
                 INNER JOIN classrooms c ON c.id = cs.classroom_id
                 WHERE cs.classroom_id = ? AND c.teacher_id = ?"
            );
            $deleteStudentsStmt->bind_param("ii", $classroomId, $user['id']);
            $deleteStudentsStmt->execute();
            $deleteStudentsStmt->close();

            $deleteClassroomStmt = $conn->prepare(
                "DELETE FROM classrooms WHERE id = ? AND teacher_id = ?"
            );
            $deleteClassroomStmt->bind_param("ii", $classroomId, $user['id']);
            $deleteClassroomStmt->execute();
            $deleteClassroomStmt->close();
            koobdForgetMessageFiles($messageFiles);

            $statusMessage = 'Classroom deleted.';
        }
    }

    $editClassroomId = isset($_GET['edit']) ? (int)$_GET['edit'] : 0;
    if ($editClassroomId > 0) {
        $editStmt = $conn->prepare(
            "SELECT id, title FROM classrooms WHERE id = ? AND teacher_id = ? LIMIT 1"
        );
        $editStmt->bind_param("ii", $editClassroomId, $user['id']);
        $editStmt->execute();
        $editResult = $editStmt->get_result();
        $editingClassroom = $editResult ? $editResult->fetch_assoc() : null;
        $editStmt->close();
    }

    $stmt = $conn->prepare(
        "SELECT
            c.*,
            COUNT(cs.student_user_id) AS student_count
         FROM classrooms c
         LEFT JOIN classroom_students cs ON cs.classroom_id = c.id
         WHERE c.teacher_id = ?
         GROUP BY c.id
         ORDER BY c.created_at DESC"
    );
    $stmt->bind_param("i", $user['id']);
    $stmt->execute();
    $result = $stmt->get_result();

    while ($row = $result->fetch_assoc()) {
        $classroomCards[] = [
            'id' => (int)$row['id'],
            'title' => $row['title'],
            'code' => $row['class_code'],
            'students' => (int)$row['student_count'],
            'color' => $profile['top'],
            'asset' => $profile['asset'],
            'teacher' => $profile['name'],
        ];
    }
    $stmt->close();
    $activityCounts = koobdClassroomActivityCounts(array_column($classroomCards, 'id'));
    foreach ($classroomCards as $index => $card) {
        $classroomCards[$index]['activities'] = $activityCounts[$card['id']] ?? 0;
    }
} else {
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'join_classroom') {
        $joinCode = strtoupper(trim($_POST['classroom_code'] ?? ''));
        $joinCode = preg_replace('/[^A-Z0-9]/', '', $joinCode);

        if ($joinCode === '') {
            $joinError = 'Enter a classroom code first.';
        } else {
            $joinStmt = $conn->prepare(
                "SELECT id FROM classrooms WHERE class_code = ? AND status = 'active' LIMIT 1"
            );
            $joinStmt->bind_param("s", $joinCode);
            $joinStmt->execute();
            $joinResult = $joinStmt->get_result();
            $joinRow = $joinResult ? $joinResult->fetch_assoc() : null;
            $joinStmt->close();

            if (!$joinRow) {
                $joinError = 'That classroom code was not found.';
            } else {
                $enrollStmt = $conn->prepare(
                    "INSERT IGNORE INTO classroom_students (classroom_id, student_user_id) VALUES (?, ?)"
                );
                $enrollStmt->bind_param("ii", $joinRow['id'], $user['id']);
                $enrollStmt->execute();
                $enrollStmt->close();

                header("Location: classroom_room.php?id=" . (int)$joinRow['id']);
                exit();
            }
        }
    }

    $classroomQuery = $conn->prepare(
        "SELECT
            c.id,
            c.title,
            c.lesson,
            c.story_id,
            c.class_code,
            t.id AS teacher_id,
            t.username,
            t.selected_reader,
            t.profile_reader_name,
            t.profile_top_color,
            t.profile_bottom_color,
            t.profile_accent_color,
            t.profile_card_style,
            t.profile_scale,
            t.profile_badge_label,
            t.user_role
         FROM classroom_students cs
         INNER JOIN classrooms c ON c.id = cs.classroom_id
         INNER JOIN users t ON t.id = c.teacher_id
         WHERE cs.student_user_id = ?
           AND c.status = 'active'
           AND t.user_role = 'teacher'
         ORDER BY cs.joined_at DESC"
    );
    $classroomQuery->bind_param("i", $user['id']);
    $classroomQuery->execute();
    $classroomResult = $classroomQuery->get_result();

    if ($classroomResult) {
        while ($row = $classroomResult->fetch_assoc()) {
            $teacherProfile = koobdResolvedProfile($row);

            $classroomCards[] = [
                'id' => (int)$row['id'],
                'title' => $row['title'],
                'code' => $row['class_code'],
                'teacher' => $teacherProfile['name'],
                'color' => $teacherProfile['top'],
                'asset' => $teacherProfile['asset'],
            ];
        }
    }

    $classroomQuery->close();
    $activityCounts = koobdClassroomActivityCounts(array_column($classroomCards, 'id'), true);
    foreach ($classroomCards as $index => $card) {
        $classroomCards[$index]['activities'] = $activityCounts[$card['id']] ?? 0;
    }
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
  <link rel="stylesheet" href="<?= koobdAsset('css/social.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/sections.css') ?>">
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
              <span
                class="sidebar-profile-card"
                style="--profile-top:<?= htmlspecialchars($profile['top']) ?>; --profile-bottom:<?= htmlspecialchars($profile['bottom']) ?>; --profile-accent:<?= htmlspecialchars($profile['accent']) ?>;"
              >
                <span class="sidebar-profile-avatar">
                  <img src="<?= htmlspecialchars($profile['asset']) ?>" alt="<?= htmlspecialchars($profile['name']) ?>">
                </span>
                <span class="sidebar-profile-name" translate="no"><?= htmlspecialchars($profile['name']) ?></span>
              </span>
              <span class="sidebar-user-text"><?= htmlspecialchars($username) ?></span>
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
        <section class="classroom-shell" aria-label="Classroom">
          <div class="sc-title-row">
            <h1 class="classroom-page-title">Classroom</h1>
            <button type="button" class="sc-bell" data-social-bell aria-label="Notifications" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15zM10 20a2 2 0 004 0"/></svg></button>
          </div>

          <?php if ($isTeacher): ?>
            <div class="classroom-teacher-layout">
              <?php // One compact header: what this page is for on the left, its three actions in a row on the right (under it on tablets and phones). ?>
              <div class="classroom-teacher-hero panel is-compact">
                <div class="ct-hero-copy">
                  <div class="classroom-room-kicker">Teacher classroom</div>
                  <h2>Manage your classrooms</h2>
                  <p>Create a classroom for each group, share its code, then add activities.</p>
                  <?php if ($statusMessage !== ''): ?>
                    <div class="classroom-teacher-status"><?= htmlspecialchars($statusMessage) ?></div>
                  <?php endif; ?>
                </div>
                <div class="classroom-teacher-hero-actions">
                  <button type="button" class="classroom-teacher-btn classroom-action-new" data-open-classroom-form aria-haspopup="dialog" aria-controls="classroomFormModal">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                    New Classroom
                  </button>
                  <a class="classroom-teacher-btn classroom-action-create" href="teacher_create_story.php">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>
                    Create Story
                  </a>
                  <a class="classroom-teacher-btn classroom-action-library" href="teacher_stories.php">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/></svg>
                    My Stories
                  </a>
                </div>
              </div>

              <div class="classroom-teacher-grid is-single">
                <section class="panel classroom-teacher-panel">
                  <div class="classroom-teacher-head">
                    <h2>Your classrooms</h2>
                    <p>Open a classroom to manage its activities and see each student's progress in every one.</p>
                  </div>

                  <?php if (empty($classroomCards)): ?>
                    <div class="classroom-empty-state classroom-empty-state-tight">
                      <div class="classroom-empty-card">
                        <div class="classroom-empty-title">No classrooms yet</div>
                        <p class="classroom-empty-copy">Create your first classroom, then share its code so students can join.</p>
                        <button type="button" class="classroom-teacher-btn classroom-action-new classroom-empty-action" data-open-classroom-form aria-haspopup="dialog" aria-controls="classroomFormModal">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                          New Classroom
                        </button>
                      </div>
                    </div>
                  <?php else: ?>
                    <?php // A classroom: its colour band and teacher, its name, how many activities and students it has, its code (with Copy), and a menu. ?>
                    <div class="cr-grid">
                      <?php foreach ($classroomCards as $card): ?>
                        <?php
                        $activityCount = (int)$card['activities'];
                        $studentCount = (int)$card['students'];
                        ?>
                        <article
                          class="cr-card"
                          style="--cr-color:<?= htmlspecialchars($card['color']) ?>;"
                          data-classroom-href="teacher_classroom.php?id=<?= (int)$card['id'] ?>"
                        >
                          <div class="cr-card-band">
                            <span class="cr-card-avatar"><img src="<?= htmlspecialchars($card['asset']) ?>" alt="" loading="lazy" decoding="async"></span>
                            <div class="classroom-story-menu-wrap cr-card-menu">
                              <button type="button" class="classroom-story-menu-btn cr-card-menu-btn" aria-label="Options for <?= htmlspecialchars($card['title']) ?>" aria-haspopup="true">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5.5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="18.5" r="1.6"/></svg>
                              </button>
                              <div class="classroom-story-menu-dropdown cr-card-dropdown">
                                <a href="teacher_classroom.php?id=<?= (int)$card['id'] ?>">Manage activities</a>
                                <a href="classroom.php?edit=<?= (int)$card['id'] ?>" data-rename-classroom="<?= (int)$card['id'] ?>" data-rename-title="<?= htmlspecialchars($card['title']) ?>">Rename</a>
                                <button
                                  type="button"
                                  class="is-danger"
                                  data-delete-classroom-id="<?= (int)$card['id'] ?>"
                                  data-confirm-title="Delete this classroom?"
                                  data-confirm-message="Students will lose access to it and all of its activities once it is removed."
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                          <div class="cr-card-body">
                            <a class="cr-card-title" href="teacher_classroom.php?id=<?= (int)$card['id'] ?>" translate="no"><?= htmlspecialchars($card['title']) ?></a>
                            <div class="cr-card-stats">
                              <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/></svg><strong><?= $activityCount ?></strong> <?= $activityCount === 1 ? 'activity' : 'activities' ?></span>
                              <span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14.5a6.5 6.5 0 013.5 5.5"/></svg><strong><?= $studentCount ?></strong> student<?= $studentCount === 1 ? '' : 's' ?></span>
                            </div>
                            <div class="cr-card-foot">
                              <?php if (!empty($card['code'])): ?>
                                <div class="cr-card-code">
                                  <span class="cr-card-code-label">Code</span>
                                  <span class="cr-card-code-value" translate="no"><?= htmlspecialchars($card['code']) ?></span>
                                  <button type="button" class="cr-card-copy" data-copy-code="<?= htmlspecialchars($card['code']) ?>" aria-label="Copy the class code <?= htmlspecialchars($card['code']) ?>" title="Copy code">
                                    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0013.5 4h-7A2.5 2.5 0 004 6.5v7A2.5 2.5 0 006.5 16H8"/></svg>
                                  </button>
                                </div>
                              <?php endif; ?>
                              <span class="cr-card-open" aria-hidden="true">Open <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
                            </div>
                          </div>
                        </article>
                      <?php endforeach; ?>
                    </div>
                  <?php endif; ?>
                </section>
              </div>
            </div>
          <?php else: ?>
            <?php // One compact card, like the teacher's header: what to do on the left; the code field with its Join button, and the story buttons, on the right (stacked on phones). ?>
            <section class="classroom-join-panel is-compact" id="join-classroom">
              <div class="classroom-join-copy">
                <div class="classroom-room-kicker">Join a classroom</div>
                <h2>Enter your class code</h2>
                <p>Ask your teacher for the code, then join to see the activities.</p>
              </div>

              <div class="classroom-join-side">
                <form method="post" class="classroom-join-form">
                  <input type="hidden" name="action" value="join_classroom">
                  <div class="classroom-join-group">
                    <input
                      type="text"
                      name="classroom_code"
                      class="classroom-join-input"
                      placeholder="Class code"
                      aria-label="Class code"
                      maxlength="12"
                      autocomplete="off"
                      autocapitalize="characters"
                      spellcheck="false"
                      value="<?= htmlspecialchars($joinCode) ?>"
                    >
                    <button type="submit" class="classroom-join-btn">Join</button>
                  </div>
                  <?php if ($joinError !== ''): ?>
                    <div class="classroom-join-error" role="alert"><?= htmlspecialchars($joinError) ?></div>
                  <?php endif; ?>
                </form>
                <div class="classroom-teacher-hero-actions classroom-student-actions">
                  <a class="classroom-teacher-btn classroom-action-create" href="create_story.php">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>
                    Create Story
                  </a>
                  <a class="classroom-teacher-btn classroom-action-library" href="teacher_stories.php">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/></svg>
                    My Stories
                  </a>
                </div>
              </div>
            </section>

            <?php if (empty($classroomCards)): ?>
              <div class="classroom-empty-state">
                <div class="classroom-empty-card">
                  <div class="classroom-empty-title">No joined classrooms yet</div>
                  <p class="classroom-empty-copy">
                    After a teacher gives you a classroom code, enter it above to join. Your joined classrooms will appear here.
                  </p>
                </div>
              </div>
            <?php else: ?>
              <div class="cr-grid">
                <?php foreach ($classroomCards as $card): ?>
                  <?php $activityCount = (int)$card['activities']; ?>
                  <a
                    href="classroom_room.php?id=<?= (int)$card['id'] ?>"
                    class="cr-card"
                    style="--cr-color:<?= htmlspecialchars($card['color']) ?>;"
                  >
                    <div class="cr-card-band">
                      <span class="cr-card-avatar"><img src="<?= htmlspecialchars($card['asset']) ?>" alt="" loading="lazy" decoding="async"></span>
                    </div>
                    <div class="cr-card-body">
                      <span class="cr-card-title" translate="no"><?= htmlspecialchars($card['title']) ?></span>
                      <div class="cr-card-stats">
                        <span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg><span translate="no"><?= htmlspecialchars($card['teacher']) ?></span></span>
                        <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/></svg><strong><?= $activityCount ?></strong> <?= $activityCount === 1 ? 'activity' : 'activities' ?></span>
                      </div>
                      <div class="cr-card-foot">
                        <span class="cr-card-open">Open classroom <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
                      </div>
                    </div>
                  </a>
                <?php endforeach; ?>
              </div>
            <?php endif; ?>
          <?php endif; ?>
        </section>
      </div>
    </main>
  </div>

  <?php if ($isTeacher): ?>
    <?php // New Classroom / Rename: one pop-up. It opens by itself when the page is opened to rename a classroom (?edit=). ?>
    <div class="cr-modal<?= ($editingClassroom || $openJourneyClassroom) ? ' is-open' : '' ?>" id="classroomFormModal" aria-hidden="<?= ($editingClassroom || $openJourneyClassroom) ? 'false' : 'true' ?>">
      <form method="post" class="cr-modal-card" role="dialog" aria-modal="true" aria-labelledby="classroomFormTitle" data-mode="<?= $editingClassroom ? 'rename' : 'create' ?>">
        <input type="hidden" name="action" value="<?= $editingClassroom ? 'update_classroom' : 'create_classroom' ?>">
        <input type="hidden" name="classroom_id" value="<?= (int)($editingClassroom['id'] ?? 0) ?>">
        <div class="cr-modal-head">
          <span class="cr-modal-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14.5a6.5 6.5 0 013.5 5.5"/></svg>
          </span>
          <div>
            <h2 class="cr-modal-title" id="classroomFormTitle" data-create="New classroom" data-rename="Rename classroom"><?= $editingClassroom ? 'Rename classroom' : 'New classroom' ?></h2>
            <p class="cr-modal-copy" data-create="Every classroom gets its own code that students use to join. You can add activities inside it." data-rename="Its activities, students and code stay the same."><?= $editingClassroom
              ? 'Its activities, students and code stay the same.'
              : 'Every classroom gets its own code that students use to join. You can add activities inside it.' ?></p>
          </div>
          <button type="button" class="cr-modal-close" data-close-classroom-form aria-label="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        <div class="cr-modal-body">
          <div class="classroom-teacher-field">
            <label for="classroom_title">Classroom name</label>
            <input
              id="classroom_title"
              name="classroom_title"
              type="text"
              maxlength="120"
              placeholder="Example: Grade 3 Reading Group"
              value="<?= htmlspecialchars($editingClassroom['title'] ?? '') ?>"
              autocomplete="off"
              required
            >
          </div>

          <div class="classroom-teacher-field" data-create-only<?= $editingClassroom ? ' hidden' : '' ?>>
            <label for="story_id">First activity <span class="activity-optional">(optional)</span></label>
            <select id="story_id" name="story_id">
              <option value="">Add activities later</option>
              <?php foreach ($storyCatalog as $story): ?>
                <option value="<?= htmlspecialchars($story['id']) ?>">
                  <?= htmlspecialchars($story['title']) ?> (<?= koobdStoryMode($story) === 'platform' ? 'Platform Mode' : 'Story Mode' ?>)
                </option>
              <?php endforeach; ?>
            </select>
          </div>
        </div>

        <div class="cr-modal-actions">
          <button type="button" class="cr-modal-btn" data-close-classroom-form>Cancel</button>
          <button type="submit" class="cr-modal-btn is-primary" data-create="Create Classroom" data-rename="Save Changes"><?= $editingClassroom ? 'Save Changes' : 'Create Classroom' ?></button>
        </div>
      </form>
    </div>
  <?php endif; ?>

  <div class="classroom-confirm-modal hidden" id="classroomConfirmModal" aria-hidden="true">
    <div class="classroom-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="classroomConfirmTitle">
      <div class="classroom-room-kicker">Confirmation</div>
      <h2 id="classroomConfirmTitle">Delete this classroom?</h2>
      <p id="classroomConfirmMessage">Students will lose access to it once it is removed.</p>
      <div class="classroom-confirm-actions">
        <button type="button" class="classroom-confirm-btn secondary" id="classroomConfirmCancel">Cancel</button>
        <button type="button" class="classroom-confirm-btn danger" id="classroomConfirmApprove">Delete</button>
      </div>
    </div>
  </div>

  <form method="post" id="deleteClassroomForm" hidden>
    <input type="hidden" name="action" value="delete_classroom">
    <input type="hidden" name="classroom_id" id="deleteClassroomId" value="">
  </form>

  <script>
    window.KOOBD_SESSION = <?= json_encode([
      'role' => $isTeacher ? 'teacher' : 'student',
    ]) ?>;
  </script>
  <script>
    document.querySelectorAll('.cr-card[data-classroom-href]').forEach((card) => {
      card.addEventListener('click', (event) => {
        if (event.target.closest('.classroom-story-menu-wrap, a, button, form, input, select, textarea, label')) {
          return;
        }
        window.location.href = card.dataset.classroomHref;
      });
    });

    // Copy a class code to share with students; the button says so for a moment.
    document.querySelectorAll('[data-copy-code]').forEach((button) => {
      button.addEventListener('click', async () => {
        const code = button.dataset.copyCode || '';
        try {
          await navigator.clipboard.writeText(code);
        } catch (error) {
          // Older browsers: select it in a temporary field and copy that.
          const field = document.createElement('textarea');
          field.value = code;
          field.setAttribute('readonly', '');
          field.style.position = 'fixed';
          field.style.opacity = '0';
          document.body.appendChild(field);
          field.select();
          try { document.execCommand('copy'); } catch (ignored) { /* nothing more to try */ }
          field.remove();
        }
        button.classList.add('is-copied');
        button.setAttribute('title', 'Copied');
        window.setTimeout(() => {
          button.classList.remove('is-copied');
          button.setAttribute('title', 'Copy code');
        }, 1600);
      });
    });

    // New Classroom / Rename pop-up.
    (() => {
      const modal = document.getElementById('classroomFormModal');
      if (!modal) return;
      const form = modal.querySelector('form');
      const title = form.elements.classroom_title;
      const setText = (mode) => {
        form.dataset.mode = mode;
        form.elements.action.value = mode === 'rename' ? 'update_classroom' : 'create_classroom';
        modal.querySelectorAll('[data-create][data-rename]').forEach((node) => { node.textContent = node.dataset[mode]; });
        modal.querySelectorAll('[data-create-only]').forEach((node) => { node.hidden = mode === 'rename'; });
      };
      let opener = null;
      const open = (trigger) => {
        opener = trigger || null;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.documentElement.classList.add('cr-modal-open');
        window.setTimeout(() => { title.focus(); title.select(); }, 30);
      };
      const close = () => {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.documentElement.classList.remove('cr-modal-open');
        // Opened to rename (?edit=): the address goes back to the plain page.
        if (window.location.search.includes('edit=')) window.history.replaceState(null, '', 'classroom.php');
        opener?.focus();
      };
      document.querySelectorAll('[data-open-classroom-form]').forEach((button) => button.addEventListener('click', () => {
        setText('create');
        form.elements.classroom_id.value = '0';
        title.value = '';
        form.elements.story_id.value = '';
        open(button);
      }));
      document.querySelectorAll('[data-rename-classroom]').forEach((link) => link.addEventListener('click', (event) => {
        event.preventDefault();
        setText('rename');
        form.elements.classroom_id.value = link.dataset.renameClassroom;
        title.value = link.dataset.renameTitle || '';
        link.blur();
        open(link.closest('.cr-card')?.querySelector('.cr-card-menu-btn'));
      }));
      modal.querySelectorAll('[data-close-classroom-form]').forEach((button) => button.addEventListener('click', close));
      modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal.classList.contains('is-open')) close(); });
      form.addEventListener('submit', (event) => {
        title.value = title.value.trim();
        if (!title.value) { event.preventDefault(); title.reportValidity(); return; }
        form.querySelector('[type="submit"]').disabled = true;
      });
      if (modal.classList.contains('is-open')) open(null);
    })();

    const classroomConfirmModal = document.getElementById('classroomConfirmModal');
    const classroomConfirmTitle = document.getElementById('classroomConfirmTitle');
    const classroomConfirmMessage = document.getElementById('classroomConfirmMessage');
    const classroomConfirmCancel = document.getElementById('classroomConfirmCancel');
    const classroomConfirmApprove = document.getElementById('classroomConfirmApprove');
    const deleteClassroomForm = document.getElementById('deleteClassroomForm');
    const deleteClassroomId = document.getElementById('deleteClassroomId');
    let activeDeleteClassroomId = '';

    function closeClassroomConfirm() {
      if (!classroomConfirmModal) return;
      classroomConfirmModal.classList.add('hidden');
      classroomConfirmModal.setAttribute('aria-hidden', 'true');
      activeDeleteClassroomId = '';
    }

    function openClassroomConfirm(deleteId, title, message) {
      if (!classroomConfirmModal) return;
      if (classroomConfirmTitle) {
        classroomConfirmTitle.textContent = title || 'Are you sure?';
      }
      if (classroomConfirmMessage) {
        classroomConfirmMessage.textContent = message || '';
      }
      activeDeleteClassroomId = deleteId || '';
      classroomConfirmModal.classList.remove('hidden');
      classroomConfirmModal.setAttribute('aria-hidden', 'false');
      if (classroomConfirmApprove) {
        classroomConfirmApprove.focus();
      }
    }

    document.querySelectorAll('[data-delete-classroom-id]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        openClassroomConfirm(
          button.dataset.deleteClassroomId || '',
          button.dataset.confirmTitle || 'Delete this classroom?',
          button.dataset.confirmMessage || ''
        );
      });
    });

    if (classroomConfirmCancel) {
      classroomConfirmCancel.addEventListener('click', closeClassroomConfirm);
    }

    if (classroomConfirmApprove) {
      classroomConfirmApprove.addEventListener('click', () => {
        const deleteId = activeDeleteClassroomId;
        closeClassroomConfirm();
        if (deleteClassroomForm && deleteClassroomId && deleteId) {
          deleteClassroomId.value = deleteId;
          deleteClassroomForm.submit();
        }
      });
    }

    if (classroomConfirmModal) {
      classroomConfirmModal.addEventListener('click', (event) => {
        if (event.target === classroomConfirmModal) {
          closeClassroomConfirm();
        }
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && classroomConfirmModal && !classroomConfirmModal.classList.contains('hidden')) {
        closeClassroomConfirm();
      }
    });
  </script>
  <script src="<?= koobdAsset('js/sidebar.js') ?>"></script>
  <script src="<?= koobdAsset('js/classroom-social.js') ?>"></script>
</body>
</html>
