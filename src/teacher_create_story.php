<?php
require_once('auth.php');
$user = koobdRequireAuth(true);
$isTeacher = koobdIsTeacher($user);
$title = trim($_POST['title'] ?? '');
$description = trim($_POST['description'] ?? '');
$lesson = trim($_POST['lesson'] ?? '');
$storyMode = trim((string)($_POST['story_mode'] ?? 'regular'));
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($title === '' || $description === '') {
        $error = 'Add a story title and a short description before continuing.';
    } else {
        if (!in_array($storyMode, ['regular', 'platformer'], true)) {
            $storyMode = 'regular';
        }
        $defaultPages = koobdTeacherDefaultStoryPages();
        $pagesJson = json_encode($defaultPages);
        $coverImage = koobdTeacherUploadStoryCover($_FILES['cover_image'] ?? [], (int)$user['id']) ?? '';
        $stmt = $conn->prepare(
            "INSERT INTO teacher_stories (teacher_id, title, description, lesson, cover_image, story_mode, pages_json, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')"
        );
        $stmt->bind_param("issssss", $user['id'], $title, $description, $lesson, $coverImage, $storyMode, $pagesJson);
        $stmt->execute();
        $storyId = (int)$stmt->insert_id;
        $stmt->close();

        header("Location: teacher_story_editor.php?id=" . $storyId);
        exit();
    }
}
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
  <title>KoobD - Create Story</title>
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
<body class="app-bg teacher-story-page">
  <main class="teacher-story-shell teacher-story-setup-shell">
    <header class="teacher-story-topbar">
      <a class="teacher-story-icon-btn" href="home.php" aria-label="Back to home">&#8592;</a>
      <div class="teacher-story-topbar-copy">
        <h1>Create a new story</h1>
        <p>Start with the story details, then continue into the visual editor to build each page with dialogue, characters, backgrounds, and transitions.</p>
      </div>
      <button type="button" class="teacher-story-pill-btn" onclick="window.location.href='teacher_stories.php'">My Stories</button>
    </header>

    <section class="teacher-story-setup-card">
      <div class="teacher-story-section-head">
        <h2>Story setup</h2>
        <p><?= $isTeacher ? 'These details help you organize the story before you design its pages and publish it to the main screen.' : 'These details help you organize the story before you design its pages and share it on the main screen.' ?></p>
      </div>

      <form method="post" enctype="multipart/form-data" class="teacher-story-form">
        <label class="teacher-story-field full">
          <span>Story title</span>
          <input type="text" name="title" maxlength="120" value="<?= htmlspecialchars($title) ?>" placeholder="Example: The Little Cloud Who Found a Friend" required>
        </label>

        <fieldset class="teacher-story-mode-picker full">
          <legend>Story experience</legend>
          <label class="teacher-story-mode-option <?= $storyMode === 'regular' ? 'is-selected' : '' ?>">
            <input type="radio" name="story_mode" value="regular" <?= $storyMode === 'platformer' ? '' : 'checked' ?>>
            <span class="teacher-story-mode-icon" aria-hidden="true">&#128172;</span>
            <span><strong>Regular story</strong><small>Build scenes with dialogue, narration, titles, characters, and backgrounds.</small></span>
          </label>
          <label class="teacher-story-mode-option <?= $storyMode === 'platformer' ? 'is-selected' : '' ?>">
            <input type="radio" name="story_mode" value="platformer" <?= $storyMode === 'platformer' ? 'checked' : '' ?>>
            <span class="teacher-story-mode-icon" aria-hidden="true">&#127918;</span>
            <span><strong>Platformer story</strong><small>Build an interactive level with NPC conversations and mobile movement controls.</small></span>
          </label>
        </fieldset>

        <label class="teacher-story-field full">
          <span>Description</span>
          <textarea name="description" rows="4" placeholder="Write a short overview of the story people will see before opening it." required><?= htmlspecialchars($description) ?></textarea>
        </label>

        <label class="teacher-story-field full">
          <span>Lesson or moral</span>
          <input type="text" name="lesson" maxlength="180" value="<?= htmlspecialchars($lesson) ?>" placeholder="Example: Kindness grows when we listen and help each other.">
        </label>

        <label class="teacher-story-field full">
          <span>Story cover image</span>
          <input type="file" name="cover_image" accept="image/png,image/jpeg,image/webp">
        </label>

        <?php if ($error !== ''): ?>
          <div class="teacher-story-inline-error"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>

        <div class="teacher-story-actions">
          <a class="teacher-story-secondary-btn" href="teacher_stories.php">Cancel</a>
          <button type="submit" class="teacher-story-primary-btn">Continue To Editor</button>
        </div>
      </form>
    </section>
  </main>
</body>
</html>
