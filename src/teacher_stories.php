<?php
require_once('auth.php');
require_once __DIR__ . '/missions_lib.php';
$user = koobdRequireAuth(true);
$isTeacher = koobdIsTeacher($user);
$profile = koobdResolvedProfile($user);
$canCreateStory = $isTeacher || !empty(koobdMissionOverview($user)['unlocks']['story_creation']);
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

// Duplicate: a new draft with the same pages, settings, cover and mode, named
// "<title> (Copy)". It is the reader's own copy to change; the original and
// its published version stay exactly as they are.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'duplicate_teacher_story') {
    if (!$isTeacher) {
        koobdMissionRequireFeature($user, 'story_creation');
    }
    $teacherStoryId = (int)($_POST['teacher_story_id'] ?? 0);
    $stmt = $conn->prepare("SELECT title, description, lesson, cover_image, story_mode, pages_json, settings_json FROM teacher_stories WHERE id = ? AND teacher_id = ? LIMIT 1");
    $stmt->bind_param('ii', $teacherStoryId, $user['id']);
    $stmt->execute();
    $original = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$original) {
        $statusMessage = 'That story could not be duplicated.';
    } else {
        $copyTitle = mb_substr(trim((string)$original['title']), 0, 240) . ' (Copy)';
        $insert = $conn->prepare(
            "INSERT INTO teacher_stories (teacher_id, title, description, lesson, cover_image, story_mode, pages_json, settings_json, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')"
        );
        $insert->bind_param('isssssss', $user['id'], $copyTitle, $original['description'], $original['lesson'], $original['cover_image'],
            $original['story_mode'], $original['pages_json'], $original['settings_json']);
        $insert->execute();
        $copyId = (int)$insert->insert_id;
        $insert->close();
        if ($copyId > 0) {
            header('Location: teacher_stories.php?duplicated=' . $copyId);
            exit();
        }
        $statusMessage = 'That story could not be duplicated.';
    }
}
$duplicatedId = isset($_GET['duplicated']) ? (int)$_GET['duplicated'] : 0;

$stories = koobdTeacherStoriesForUser((int)$user['id'], false);
$feedbackByStory = [];
$newFeedbackStoryIds = [];
if (!$isTeacher && !empty($stories)) {
    $feedbackStmt = $conn->prepare(
        "SELECT r.story_id, r.version_number, r.decision, r.feedback, r.reviewed_at,
                reviewer.id AS reviewer_id, reviewer.username AS reviewer_username,
                reviewer.profile_reader_name AS reviewer_name, reviewer.selected_reader,
                reviewer.profile_top_color, reviewer.profile_bottom_color, reviewer.profile_accent_color,
                reviewer.profile_card_style, reviewer.profile_scale, reviewer.user_role,
                EXISTS(
                    SELECT 1 FROM user_notifications n
                    WHERE n.user_id = ts.teacher_id AND n.actor_user_id = r.teacher_id
                      AND n.kind = 'story_feedback' AND n.activity_id = ts.id AND n.read_at IS NULL
                ) AS is_new
         FROM teacher_story_reviews r
         INNER JOIN teacher_stories ts ON ts.id = r.story_id
         INNER JOIN users reviewer ON reviewer.id = r.teacher_id
         WHERE ts.teacher_id = ? AND r.feedback IS NOT NULL AND r.feedback <> ''
         ORDER BY r.story_id, r.id DESC"
    );
    if (!$feedbackStmt) {
        error_log('Unable to prepare student story feedback history.');
    } else {
        $feedbackStmt->bind_param('i', $user['id']);
        if (!$feedbackStmt->execute()) {
            error_log('Unable to load student story feedback history.');
        } else {
            $feedbackResult = $feedbackStmt->get_result();
            while ($feedbackRow = $feedbackResult->fetch_assoc()) {
                $storyId = (int)$feedbackRow['story_id'];
                $feedbackRow['reviewer_name'] = trim((string)($feedbackRow['reviewer_name'] ?? '')) ?: $feedbackRow['reviewer_username'];
                $feedbackRow['reviewer_profile'] = koobdResolvedProfile($feedbackRow);
                $feedbackByStory[$storyId][] = $feedbackRow;
                if (!empty($feedbackRow['is_new'])) {
                    $newFeedbackStoryIds[$storyId] = $storyId;
                }
            }
        }
        $feedbackStmt->close();
    }

    if (!empty($newFeedbackStoryIds)) {
        $storyPlaceholders = implode(',', array_fill(0, count($newFeedbackStoryIds), '?'));
        $readNotifications = $conn->prepare(
            "UPDATE user_notifications
             SET read_at = CURRENT_TIMESTAMP
             WHERE user_id = ? AND kind = 'story_feedback' AND read_at IS NULL
               AND activity_id IN ($storyPlaceholders)"
        );
        if (!$readNotifications) {
            error_log('Unable to prepare story feedback notification acknowledgement.');
        } else {
            $notificationParams = array_merge([(int)$user['id']], array_values($newFeedbackStoryIds));
            $notificationTypes = str_repeat('i', count($notificationParams));
            $readNotifications->bind_param($notificationTypes, ...$notificationParams);
            if (!$readNotifications->execute()) {
                error_log('Unable to acknowledge story feedback notifications.');
            }
            $readNotifications->close();
        }
    }
}
if (isset($_GET['submitted'], $_GET['code'])) {
    $statusMessage = 'Story submitted for teacher approval. Its unique submission code is shown on its story card.';
}
if (isset($_GET['published'])) {
    $statusMessage = 'Story published.';
}
if ($duplicatedId > 0 && $statusMessage === '') {
    foreach ($stories as $story) {
        if ((int)$story['teacher_story_id'] === $duplicatedId) {
            $statusMessage = 'Duplicated: "' . $story['title'] . '" is a new draft you can edit.';
            break;
        }
    }
}
$profileEditPath = 'profile.php';
$kickerLabel = $isTeacher ? 'Teacher Stories' : 'Story Builder';
$pageCopy = $isTeacher
    ? 'Manage drafts, reopen finished stories, and preview exactly what students will see once a class is assigned.'
    : 'Manage your story drafts, submit finished stories for teacher approval, and track their publishing status.';
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
  <link rel="stylesheet" href="<?= koobdAsset('css/sections.css') ?>">
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
            <a href="home.php" class="sidebar-link" aria-label="Home">
              <div class="sidebar-icon-box">
                <img src="assets/images/icons/HOME 1.png" alt="">
              </div>
            </a>
            <a href="classroom.php" class="sidebar-link" aria-label="Classroom">
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
      <div class="main-inner teacher-story-library-main">
        <section class="teacher-story-library-shell">
          <header class="teacher-story-library-head">
            <div>
              <div class="teacher-story-kicker"><?= htmlspecialchars($kickerLabel) ?></div>
              <h1>My stories</h1>
              <p><?= htmlspecialchars($pageCopy) ?></p>
            </div>
            <?php if ($canCreateStory): ?>
              <button type="button" class="teacher-story-primary-btn" onclick="window.location.href='create_story.php'">Create Story</button>
            <?php else: ?>
              <a class="teacher-story-primary-btn is-locked" href="missions.php" aria-label="Story Creator locked. View your journey to unlock it.">
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                <span>Story Creator locked</span>
              </a>
            <?php endif; ?>
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
                <?php
                $storyId = (int)$story['teacher_story_id'];
                $isPlatform = $story['story_mode'] === 'platformer';
                $isUpdatedPending = !$isTeacher
                    && $story['status'] === 'pending_approval'
                    && (int)($story['version_number'] ?? 1) > 1;
                $storyStatusLabel = $isUpdatedPending ? 'Updated Story' : match ($story['status']) {
                  'pending_approval' => 'Pending Approval',
                  'revision_required' => 'Revision Required',
                  'published' => $isTeacher ? 'Published' : 'Approved',
                  'rejected' => 'Rejected',
                  'unpublished' => 'Approved · Unpublished',
                  default => 'Draft',
                };
                $storyStatusClass = match ($story['status']) {
                  'pending_approval' => 'is-pending',
                  'revision_required' => 'is-revision',
                  'published' => 'is-published',
                  'rejected' => 'is-rejected',
                  'unpublished' => 'is-unpublished',
                  default => 'is-draft',
                };
                $pageCount = (int)$story['page_count'];
                $edited = !empty($story['updated_at']) ? strtotime($story['updated_at']) : false;
                $editHref = 'teacher_story_editor.php?id=' . $storyId;
                $modeIcon = $isPlatform
                  ? '<path d="M6 9h12a4 4 0 014 4v1a3 3 0 01-5.4 1.8L15 14H9l-1.6 1.8A3 3 0 012 14v-1a4 4 0 014-4zM8 11v3M6.5 12.5h3M16 12h.01M18 13.5h.01"/>'
                  : '<path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/>';
                ?>
                <?php // A story card: its cover (or one drawn for it) with its status, what kind of story it is, its title, and what you can do with it. ?>
                <article class="ts-card<?= $isPlatform ? ' is-platform' : ' is-story' ?>"<?= !$isTeacher ? ' id="storyFeedback-' . $storyId . '"' : '' ?>>
                  <a class="ts-card-cover<?= empty($story['cover']) ? ' no-cover' : '' ?>" href="<?= htmlspecialchars($editHref) ?>" tabindex="-1" aria-hidden="true">
                    <?php if (!empty($story['cover'])): ?>
                      <img src="<?= htmlspecialchars($story['cover']) ?>" alt="" loading="lazy" decoding="async">
                    <?php else: ?>
                      <svg class="ts-card-placeholder" viewBox="0 0 24 24"><?= $modeIcon ?></svg>
                    <?php endif; ?>
                    <span class="ts-card-status <?= $storyStatusClass ?>"><?= htmlspecialchars($storyStatusLabel) ?></span>
                  </a>
                  <div class="ts-card-body">
                    <div class="ts-card-meta">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><?= $modeIcon ?></svg>
                      <span><?= $isPlatform ? 'Platform Mode' : 'Story Mode' ?></span>
                      <span class="ts-card-dot" aria-hidden="true"></span>
                      <span><?= $pageCount ?> page<?= $pageCount === 1 ? '' : 's' ?></span>
                    </div>
                    <h2 class="ts-card-title" translate="no"><?= htmlspecialchars($story['title']) ?></h2>
                    <?php if ($isUpdatedPending): ?>
                      <p class="ts-card-updated-note">Updated version · Pending teacher review</p>
                    <?php endif; ?>
                    <?php if (!$isTeacher && $story['status'] === 'revision_required'): ?>
                      <p class="ts-card-revision-note">Your teacher requested changes. Review their feedback below, edit your story, and submit it again.</p>
                    <?php endif; ?>
                    <?php if ($story['description'] !== ''): ?>
                      <p class="ts-card-desc" translate="no"><?= htmlspecialchars($story['description']) ?></p>
                    <?php else: ?>
                      <p class="ts-card-desc is-empty">No description yet.</p>
                    <?php endif; ?>
                    <?php if ($edited): ?>
                      <p class="ts-card-edited">Edited <?= htmlspecialchars(date('Y', $edited) === date('Y') ? date('M j', $edited) : date('M j, Y', $edited)) ?></p>
                    <?php endif; ?>
                    <?php if (!$isTeacher && !empty($story['submission_code'])): ?>
                      <p class="ts-card-submission-code">
                        <span>Submission code for this story</span>
                        <span class="ts-card-code-row">
                          <strong><?= htmlspecialchars($story['submission_code']) ?></strong>
                          <button type="button" class="ts-card-code-copy" data-copy-submission-code="<?= htmlspecialchars($story['submission_code'], ENT_QUOTES) ?>" aria-label="Copy submission code" title="Copy code">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 5 5.5v7A2.5 2.5 0 0 0 7.5 15H8"/></svg>
                          </button>
                        </span>
                      </p>
                    <?php elseif (!$isTeacher && $story['status'] === 'pending_approval'): ?>
                      <p class="ts-card-submission-code">Open this story and select <strong>Submit for Approval</strong> to generate its teacher code.</p>
                    <?php endif; ?>
                    <?php if (!$isTeacher && !empty($feedbackByStory[$storyId])): ?>
                      <section class="ts-feedback-history" aria-labelledby="storyFeedbackTitle-<?= $storyId ?>">
                        <h3 id="storyFeedbackTitle-<?= $storyId ?>">Teacher feedback<?php if (isset($newFeedbackStoryIds[$storyId])): ?> <span class="ts-feedback-new">New</span><?php endif; ?></h3>
                        <ol>
                          <?php foreach ($feedbackByStory[$storyId] as $feedbackItem): ?>
                            <?php
                              $feedbackDecisionLabel = match ($feedbackItem['decision']) {
                                'request_revision' => 'Revision requested',
                                'reject' => 'Submission rejected',
                                'approve' => 'Story approved',
                                'comment' => 'Feedback',
                                default => 'Teacher feedback',
                              };
                              $feedbackTimestamp = strtotime((string)$feedbackItem['reviewed_at']);
                            ?>
                            <li>
                              <div class="ts-feedback-reviewer">
                                <span class="ts-feedback-avatar" style="--feedback-top:<?= htmlspecialchars($feedbackItem['reviewer_profile']['top']) ?>;--feedback-bottom:<?= htmlspecialchars($feedbackItem['reviewer_profile']['bottom']) ?>;--feedback-accent:<?= htmlspecialchars($feedbackItem['reviewer_profile']['accent']) ?>">
                                  <img src="<?= htmlspecialchars($feedbackItem['reviewer_profile']['asset']) ?>" alt="">
                                </span>
                                <span><strong><?= htmlspecialchars($feedbackItem['reviewer_name']) ?></strong><small><?= htmlspecialchars($feedbackDecisionLabel) ?> · Version <?= (int)$feedbackItem['version_number'] ?></small></span>
                                <?php if ($feedbackTimestamp): ?><time datetime="<?= htmlspecialchars(date('c', $feedbackTimestamp)) ?>"><?= htmlspecialchars(date('M j, Y · g:i A', $feedbackTimestamp)) ?></time><?php endif; ?>
                              </div>
                              <p><?= nl2br(htmlspecialchars($feedbackItem['feedback'])) ?></p>
                            </li>
                          <?php endforeach; ?>
                        </ol>
                      </section>
                    <?php endif; ?>
                    <div class="ts-card-actions">
                      <?php if ($canCreateStory): ?>
                        <a class="ts-btn ts-btn-primary" href="<?= htmlspecialchars($editHref) ?>">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>
                          Edit
                        </a>
                      <?php else: ?>
                        <a class="ts-btn is-locked" href="missions.php" aria-label="Story editing is locked. View your journey to unlock it.">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                          Locked
                        </a>
                      <?php endif; ?>
                      <a class="ts-btn" href="teacher_story_preview.php?id=<?= $storyId ?>">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>
                        Preview
                      </a>
                      <?php if ($canCreateStory): ?>
                        <form method="post" class="teacher-story-duplicate-form">
                          <input type="hidden" name="action" value="duplicate_teacher_story">
                          <input type="hidden" name="teacher_story_id" value="<?= $storyId ?>">
                          <button type="submit" class="ts-icon-btn" aria-label="Duplicate <?= htmlspecialchars($story['title']) ?>" title="Duplicate">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0013.5 4h-7A2.5 2.5 0 004 6.5v7A2.5 2.5 0 006.5 16H8"/></svg>
                          </button>
                        </form>
                      <?php else: ?>
                        <button type="button" class="ts-icon-btn is-locked" aria-label="Story duplication is locked until you complete Developing Language Skills" title="Complete Developing Language Skills to unlock story creation" disabled>
                          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                        </button>
                      <?php endif; ?>
                      <button
                        type="button"
                        class="ts-icon-btn is-danger teacher-story-delete-trigger"
                        data-story-id="<?= $storyId ?>"
                        data-story-title="<?= htmlspecialchars($story['title']) ?>"
                        aria-label="Delete <?= htmlspecialchars($story['title']) ?>"
                        title="Delete"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/></svg>
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
    document.querySelectorAll('[data-copy-submission-code]').forEach((button) => {
      button.addEventListener('click', async () => {
        const code = button.dataset.copySubmissionCode || '';
        let copied = false;
        try {
          await navigator.clipboard.writeText(code);
          copied = true;
        } catch (error) {
          const field = document.createElement('textarea');
          field.value = code;
          field.setAttribute('readonly', '');
          field.style.position = 'fixed';
          field.style.opacity = '0';
          document.body.appendChild(field);
          try {
            field.select();
            copied = document.execCommand('copy');
          } catch (fallbackError) {
            copied = false;
          } finally {
            field.remove();
          }
        }

        button.classList.toggle('is-copied', copied);
        button.classList.toggle('is-copy-error', !copied);
        button.title = copied ? 'Copied' : 'Copy failed';
        button.setAttribute('aria-label', copied ? 'Submission code copied' : 'Could not copy submission code');
        button.innerHTML = copied
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5m0 3h.01"/><circle cx="12" cy="12" r="9"/></svg>';
        window.setTimeout(() => {
          button.classList.remove('is-copied', 'is-copy-error');
          button.title = 'Copy code';
          button.setAttribute('aria-label', 'Copy submission code');
          button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 5 5.5v7A2.5 2.5 0 0 0 7.5 15H8"/></svg>';
        }, 1600);
      });
    });
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

      // Duplicate: one copy per tap, even if it is tapped twice.
      document.querySelectorAll('.teacher-story-duplicate-form').forEach((duplicateForm) => {
        duplicateForm.addEventListener('submit', (event) => {
          const button = duplicateForm.querySelector('button');
          if (button.disabled) { event.preventDefault(); return; }
          window.setTimeout(() => { button.disabled = true; }, 0);
        });
      });

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
