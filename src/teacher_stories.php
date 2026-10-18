<?php
require_once('auth.php');
$user = koobdRequireAuth(true);
$isTeacher = koobdIsTeacher($user);
$profile = koobdResolvedProfile($user);
$statusMessage = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'delete_teacher_story') {
    $teacherStoryId = (int)($_POST['teacher_story_id'] ?? 0);

    if ($teacherStoryId > 0) {
        $storyKey = koobdTeacherStoryKey($teacherStoryId);
        $assignmentStmt = $conn->prepare(
            "SELECT COUNT(*) AS classroom_count
             FROM classroom_activities a
             INNER JOIN classrooms c ON c.id = a.classroom_id
             WHERE c.teacher_id = ?
               AND a.story_id = ?
               AND c.status = 'active'"
        );

        if ($assignmentStmt) {
            $assignmentStmt->bind_param("is", $user['id'], $storyKey);
            $assignmentStmt->execute();
            $assignmentResult = $assignmentStmt->get_result();
            $assignmentRow = $assignmentResult ? $assignmentResult->fetch_assoc() : null;
            $assignmentStmt->close();

            $classroomCount = (int)($assignmentRow['classroom_count'] ?? 0);

            if ($classroomCount > 0) {
                $statusMessage = 'This story is still used in a classroom activity. Remove those activities first before deleting it.';
            } else {
                $deleteSharedStmt = $conn->prepare("DELETE FROM stories WHERE teacher_story_id = ? AND creator_user_id = ?");
                if ($deleteSharedStmt) {
                    $deleteSharedStmt->bind_param("ii", $teacherStoryId, $user['id']);
                    $deleteSharedStmt->execute();
                    $deleteSharedStmt->close();
                }

                $deleteProgressStmt = $conn->prepare("DELETE FROM story_progress WHERE story_id = ?");
                if ($deleteProgressStmt) {
                    $deleteProgressStmt->bind_param("s", $storyKey);
                    $deleteProgressStmt->execute();
                    $deleteProgressStmt->close();
                }

                $deleteTeacherStmt = $conn->prepare("DELETE FROM teacher_stories WHERE id = ? AND teacher_id = ?");
                if ($deleteTeacherStmt) {
                    $deleteTeacherStmt->bind_param("ii", $teacherStoryId, $user['id']);
                    $deleteTeacherStmt->execute();
                    $deletedRows = $deleteTeacherStmt->affected_rows;
                    $deleteTeacherStmt->close();
                    $statusMessage = $deletedRows > 0 ? 'Story deleted.' : 'That story could not be deleted.';
                }
            }
        }
    }
}

$stories = koobdTeacherStoriesForUser((int)$user['id'], false);
$profileEditPath = 'profile.php';
$kickerLabel = $isTeacher ? 'Teacher Stories' : 'Story Builder';
$pageCopy = $isTeacher
    ? 'Manage drafts, reopen finished stories, and preview exactly what students will see once a class is assigned.'
    : 'Manage your story drafts, reopen finished stories, and publish them to the main screen when they are ready.';
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
  <title>KoobD - My Stories</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/app.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/teacher-stories.css') ?>">
  <link rel="icon" type="image/png" href="assets/images/icons/favicon.png">
  <?php // Installable as an app (manifest.webmanifest): opens without the address bar. ?>
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#f3f8ff">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="KoobD">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link rel="apple-touch-icon" href="assets/images/icons/app/apple-touch-icon.png">
  <link rel="stylesheet" href="<?= koobdAsset('css/story-shared.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
</head>
<body class="app-bg teacher-story-library-page">
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-inner">
        <div class="sidebar-top">
          <div class="sidebar-brand-mark">
            <img src="assets/images/logos/logo.png" alt="KoobD">
          </div>
          <div class="sidebar-divider"></div>
          <nav class="sidebar-nav" aria-label="Main navigation">
            <a href="home.php" class="sidebar-link">
              <div class="sidebar-icon-box">
                <img src="assets/images/icons/HOME 1.png" alt="">
              </div>
            </a>
            <a href="classroom.php" class="sidebar-link">
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
      <div class="main-inner teacher-story-library-main">
        <section class="teacher-story-library-shell">
          <header class="teacher-story-library-head">
            <div>
              <div class="teacher-story-kicker"><?= htmlspecialchars($kickerLabel) ?></div>
              <h1>My stories</h1>
              <p><?= htmlspecialchars($pageCopy) ?></p>
            </div>
            <button type="button" class="teacher-story-primary-btn" onclick="window.location.href='create_story.php'">Create Story</button>
          </header>

          <?php if ($statusMessage !== ''): ?>
            <div class="teacher-story-status-note teacher-story-library-note"><?= htmlspecialchars($statusMessage) ?></div>
          <?php endif; ?>

          <?php if (empty($stories)): ?>
              <div class="teacher-story-empty-card">
                <h2>No stories yet</h2>
                <p><?= $isTeacher ? 'Create your first classroom story and then assign it to a classroom once it is ready.' : 'Create your first story in the visual editor, then publish it to share it on the main screen.' ?></p>
              </div>
          <?php else: ?>
            <div class="teacher-story-library-grid">
              <?php foreach ($stories as $story): ?>
                <article class="teacher-story-card<?= !empty($story['cover']) ? '' : ' no-cover' ?>">
                  <?php if (!empty($story['cover'])): ?>
                    <div class="teacher-story-card-cover" style="background-image:url('<?= htmlspecialchars($story['cover']) ?>');"></div>
                  <?php endif; ?>
                  <div class="teacher-story-card-body">
                    <div class="teacher-story-card-top">
                      <span class="teacher-story-status <?= $story['status'] === 'published' ? 'published' : 'draft' ?>">
                        <?= htmlspecialchars(ucfirst($story['status'])) ?>
                      </span>
                      <span class="teacher-story-page-count"><?= (int)$story['page_count'] ?> page<?= (int)$story['page_count'] === 1 ? '' : 's' ?></span>
                    </div>
                    <h2 translate="no"><?= htmlspecialchars($story['title']) ?></h2>
                    <p><?= htmlspecialchars($story['description'] ?: 'No subtitle added yet.') ?></p>
                    <div class="teacher-story-card-actions">
                      <a class="teacher-story-secondary-btn" href="teacher_story_preview.php?id=<?= (int)$story['teacher_story_id'] ?>">Preview</a>
                      <a class="teacher-story-primary-btn" href="teacher_story_editor.php?id=<?= (int)$story['teacher_story_id'] ?>">Edit Story</a>
                      <button
                        type="button"
                        class="teacher-story-danger-btn teacher-story-delete-trigger"
                        data-story-id="<?= (int)$story['teacher_story_id'] ?>"
                        data-story-title="<?= htmlspecialchars($story['title']) ?>"
                      >
                        Delete Story
                      </button>
                    </div>
                  </div>
                </article>
              <?php endforeach; ?>
            </div>
          <?php endif; ?>
        </section>
      </div>
    </main>
  </div>

  <div class="teacher-story-confirm-modal hidden" id="teacherStoryDeleteModal" aria-hidden="true">
    <div class="teacher-story-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="teacherStoryDeleteTitle">
      <h2 id="teacherStoryDeleteTitle">Delete this story?</h2>
      <p id="teacherStoryDeleteMessage">This will remove the story from your teacher library.</p>
      <div class="teacher-story-confirm-actions">
        <button type="button" class="teacher-story-secondary-btn" id="teacherStoryDeleteCancel">Cancel</button>
        <button type="button" class="teacher-story-danger-btn" id="teacherStoryDeleteApprove">Delete Story</button>
      </div>
    </div>
  </div>

  <form method="post" id="teacherStoryDeleteForm" hidden>
    <input type="hidden" name="action" value="delete_teacher_story">
    <input type="hidden" name="teacher_story_id" id="teacherStoryDeleteId" value="">
  </form>

  <script>
    window.KOOBD_SESSION = <?= json_encode(['role' => $isTeacher ? 'teacher' : 'student']) ?>;
  </script>
  <script>
    (() => {
      const modal = document.getElementById('teacherStoryDeleteModal');
      const message = document.getElementById('teacherStoryDeleteMessage');
      const cancelBtn = document.getElementById('teacherStoryDeleteCancel');
      const approveBtn = document.getElementById('teacherStoryDeleteApprove');
      const form = document.getElementById('teacherStoryDeleteForm');
      const idInput = document.getElementById('teacherStoryDeleteId');
      let closeTimer = null;

      function openModal(storyId, storyTitle) {
        if (!modal || !idInput) return;
        idInput.value = storyId;
        if (message) {
          message.textContent = `Delete "${storyTitle}" from your stories? If it is still assigned to a classroom, we will stop the delete and keep it safe.`;
        }
        window.clearTimeout(closeTimer);
        modal.classList.remove('hidden', 'is-closing');
        modal.setAttribute('aria-hidden', 'false');
      }

      function closeModal() {
        if (!modal || modal.classList.contains('hidden') || modal.classList.contains('is-closing')) return;
        modal.classList.add('is-closing');
        modal.setAttribute('aria-hidden', 'true');
        closeTimer = window.setTimeout(() => {
          modal.classList.add('hidden');
          modal.classList.remove('is-closing');
        }, 180);
      }

      document.querySelectorAll('.teacher-story-delete-trigger').forEach((button) => {
        button.addEventListener('click', () => {
          openModal(button.dataset.storyId || '', button.dataset.storyTitle || 'this story');
        });
      });

      if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
      if (approveBtn) {
        approveBtn.addEventListener('click', () => {
          if (form) form.submit();
        });
      }

      if (modal) {
        modal.addEventListener('click', (event) => {
          if (event.target === modal) closeModal();
        });
      }

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeModal();
      });
    })();
  </script>
  <script src="<?= koobdAsset('js/sidebar.js') ?>"></script>
</body>
</html>
