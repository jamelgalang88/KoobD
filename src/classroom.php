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
            if ($ownsClassroom->get_result()->fetch_assoc()) {
                koobdDeleteActivityProgress(array_column(koobdClassroomActivities($classroomId), 'id'));
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
          <h1 class="classroom-page-title">Classroom</h1>

          <?php if ($isTeacher): ?>
            <div class="classroom-teacher-layout">
              <div class="classroom-teacher-hero panel">
                <div>
                  <div class="classroom-room-kicker">Teacher classroom</div>
                  <h2>Manage classrooms from here</h2>
                  <p>Create one classroom for each group of students and share its code. Open a classroom to add as many activities as you need and track every student's progress in each.</p>
                  <?php if ($statusMessage !== ''): ?>
                    <div class="classroom-teacher-status"><?= htmlspecialchars($statusMessage) ?></div>
                  <?php endif; ?>
                  <div class="classroom-teacher-hero-actions">
                    <a class="classroom-teacher-btn classroom-action-create" href="teacher_create_story.php">Create Story</a>
                    <a class="classroom-teacher-btn classroom-action-library" href="teacher_stories.php">My Stories</a>
                  </div>
                </div>

                <div
                  class="sidebar-profile-card classroom-teacher-profile"
                  style="--profile-top:<?= htmlspecialchars($profile['top']) ?>; --profile-bottom:<?= htmlspecialchars($profile['bottom']) ?>; --profile-accent:<?= htmlspecialchars($profile['accent']) ?>;"
                >
                  <div class="sidebar-profile-avatar">
                    <img src="<?= htmlspecialchars($profile['asset']) ?>" alt="<?= htmlspecialchars($profile['name']) ?>">
                  </div>
                  <div class="sidebar-profile-name" translate="no"><?= htmlspecialchars($profile['name']) ?></div>
                </div>
              </div>

              <div class="classroom-teacher-grid">
                <section class="panel classroom-teacher-panel">
                  <div class="classroom-teacher-head">
                    <h2><?= $editingClassroom ? 'Edit classroom' : 'Create a classroom' ?></h2>
                    <p><?= $editingClassroom
                      ? 'Rename the classroom. Its activities are managed inside the classroom.'
                      : 'Every classroom gets a unique code that students use to join. Add its activities inside the classroom.' ?></p>
                  </div>

                  <form method="post" class="classroom-teacher-form">
                    <input type="hidden" name="action" value="<?= $editingClassroom ? 'update_classroom' : 'create_classroom' ?>">
                    <?php if ($editingClassroom): ?>
                      <input type="hidden" name="classroom_id" value="<?= (int)$editingClassroom['id'] ?>">
                    <?php endif; ?>

                    <div class="classroom-teacher-field">
                      <label for="classroom_title">Classroom title</label>
                      <input
                        id="classroom_title"
                        name="classroom_title"
                        type="text"
                        placeholder="Example: Grade 3 Reading Group"
                        value="<?= htmlspecialchars($editingClassroom['title'] ?? '') ?>"
                        required
                      >
                    </div>

                    <?php if (!$editingClassroom): ?>
                      <div class="classroom-teacher-field">
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
                    <?php endif; ?>

                    <button class="classroom-teacher-btn" type="submit">
                      <?= $editingClassroom ? 'Save Changes' : 'Create Classroom' ?>
                    </button>
                    <?php if ($editingClassroom): ?>
                      <a href="classroom.php" class="classroom-teacher-btn classroom-teacher-btn-secondary classroom-teacher-btn-link">Cancel Edit</a>
                    <?php endif; ?>
                  </form>
                </section>

                <section class="panel classroom-teacher-panel">
                  <div class="classroom-teacher-head">
                    <h2>Your classrooms</h2>
                    <p>Open a classroom to manage its activities and see each student's progress in every one.</p>
                  </div>

                  <?php if (empty($classroomCards)): ?>
                    <div class="classroom-empty-state classroom-empty-state-tight">
                      <div class="classroom-empty-card">
                        <div class="classroom-empty-title">No classrooms yet</div>
                        <p class="classroom-empty-copy">Create your first classroom here. It will appear as a class card for students after they join with the code.</p>
                      </div>
                    </div>
                  <?php else: ?>
                    <div class="classroom-card-grid">
                      <?php foreach ($classroomCards as $card): ?>
                        <article
                          class="classroom-story-card"
                          style="--classroom-top:<?= htmlspecialchars($card['color']) ?>;"
                          data-classroom-href="teacher_classroom.php?id=<?= (int)$card['id'] ?>"
                        >
                          <div class="classroom-story-menu-wrap">
                            <button
                              type="button"
                              class="classroom-story-menu-btn"
                              aria-label="Manage <?= htmlspecialchars($card['title']) ?>"
                            >&#8942;</button>
                            <div class="classroom-story-menu-dropdown">
                              <a href="teacher_classroom.php?id=<?= (int)$card['id'] ?>">Manage activities</a>
                              <a href="classroom.php?edit=<?= (int)$card['id'] ?>">Rename</a>
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
                          <div class="classroom-story-avatar-wrap">
                            <div class="classroom-story-avatar">
                              <img src="<?= htmlspecialchars($card['asset']) ?>" alt="<?= htmlspecialchars($card['teacher']) ?>">
                            </div>
                          </div>
                          <div class="classroom-story-copy">
                            <div class="classroom-story-title" translate="no"><?= htmlspecialchars($card['title']) ?></div>
                            <div class="classroom-story-subject"><?= (int)$card['activities'] ?> <?= (int)$card['activities'] === 1 ? 'activity' : 'activities' ?></div>
                            <?php if (!empty($card['code'])): ?>
                              <div class="classroom-story-code">Code: <?= htmlspecialchars($card['code']) ?></div>
                            <?php endif; ?>
                            <div class="classroom-story-teacher"><?= (int)$card['students'] ?> student<?= (int)$card['students'] === 1 ? '' : 's' ?></div>
                          </div>
                        </article>
                      <?php endforeach; ?>
                    </div>
                  <?php endif; ?>
                </section>
              </div>
            </div>
          <?php else: ?>
            <section class="classroom-join-panel">
              <div class="classroom-join-copy">
                <div class="classroom-room-kicker">Join with code</div>
                <h2>Enter your classroom code</h2>
                <p>Ask your teacher for the class code, then join to see all of the classroom's activities.</p>
                <div class="classroom-teacher-hero-actions classroom-student-actions">
                  <a class="classroom-teacher-btn classroom-action-create" href="create_story.php">Create Story</a>
                  <a class="classroom-teacher-btn classroom-action-library" href="teacher_stories.php">My Stories</a>
                </div>
              </div>

              <form method="post" class="classroom-join-form">
                <input type="hidden" name="action" value="join_classroom">
                <input
                  type="text"
                  name="classroom_code"
                  class="classroom-join-input"
                  placeholder="Enter code"
                  maxlength="12"
                  value="<?= htmlspecialchars($joinCode) ?>"
                >
                <button type="submit" class="classroom-join-btn">Join Classroom</button>
                <?php if ($joinError !== ''): ?>
                  <div class="classroom-join-error"><?= htmlspecialchars($joinError) ?></div>
                <?php endif; ?>
              </form>
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
              <div class="classroom-card-grid">
                <?php foreach ($classroomCards as $card): ?>
                  <a
                    href="classroom_room.php?id=<?= (int)$card['id'] ?>"
                    class="classroom-story-card"
                    style="--classroom-top:<?= htmlspecialchars($card['color']) ?>;"
                    aria-label="<?= htmlspecialchars($card['title']) ?>"
                  >
                    <div class="classroom-story-menu" aria-hidden="true">&#8942;</div>
                    <div class="classroom-story-avatar-wrap">
                      <div class="classroom-story-avatar">
                        <img src="<?= htmlspecialchars($card['asset']) ?>" alt="<?= htmlspecialchars($card['teacher']) ?>">
                      </div>
                    </div>
                    <div class="classroom-story-copy">
                      <div class="classroom-story-title" translate="no"><?= htmlspecialchars($card['title']) ?></div>
                      <div class="classroom-story-subject"><?= (int)$card['activities'] ?> <?= (int)$card['activities'] === 1 ? 'activity' : 'activities' ?></div>
                      <?php if (!empty($card['code'])): ?>
                        <div class="classroom-story-code">Code: <?= htmlspecialchars($card['code']) ?></div>
                      <?php endif; ?>
                      <div class="classroom-story-teacher">Teacher: <?= htmlspecialchars($card['teacher']) ?></div>
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
    document.querySelectorAll('.classroom-story-card[data-classroom-href]').forEach((card) => {
      card.addEventListener('click', (event) => {
        if (event.target.closest('.classroom-story-menu-wrap, a, button, form, input, select, textarea, label')) {
          return;
        }
        window.location.href = card.dataset.classroomHref;
      });
    });

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
</body>
</html>
