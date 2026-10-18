<?php
require_once('auth.php');
$user = koobdRequireAuth(true);
$storyId = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$story = koobdSharedStoryById($storyId);

if (!$story) {
    header("Location: home.php");
    exit();
}

$creatorName = $story['creator_name'] ?: 'Unknown creator';
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
  <title>KoobD - Story</title>
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
<body class="app-bg shared-story-page">
  <main class="shared-story-shell">
    <header class="teacher-story-topbar shared-story-topbar">
      <a class="teacher-story-icon-btn" href="home.php" aria-label="Back to home">
        <img src="assets/images/icons/LOGOUT 1.png" alt="">
      </a>
      <div class="teacher-story-topbar-copy">
        <h1 translate="no"><?= htmlspecialchars($story['title']) ?></h1>
        <p>Created by <?= htmlspecialchars($creatorName) ?> &middot; <?= htmlspecialchars($story['creator_role']) ?></p>
      </div>
      <a class="teacher-story-pill-btn" href="home.php">Home</a>
    </header>

    <section class="shared-story-detail-card">
      <?php if (!empty($story['cover'])): ?>
        <div class="shared-story-cover">
          <img src="<?= htmlspecialchars($story['cover']) ?>" alt="<?= htmlspecialchars($story['title']) ?>">
        </div>
      <?php endif; ?>

      <div class="shared-story-detail-body<?= empty($story['cover']) ? ' no-cover' : '' ?>">
        <div class="shared-story-detail-badge">Shared story</div>
        <h2 translate="no"><?= htmlspecialchars($story['title']) ?></h2>
        <p class="shared-story-subtitle"><?= htmlspecialchars($story['subtitle'] ?: 'No subtitle added yet.') ?></p>
        <?php if (!empty($story['source_file'])): ?>
          <a class="shared-story-file-link" href="<?= htmlspecialchars($story['source_file']) ?>" target="_blank" rel="noopener">
            Open uploaded story file<?= !empty($story['source_file_name']) ? ': ' . htmlspecialchars($story['source_file_name']) : '' ?>
          </a>
        <?php endif; ?>
        <p class="shared-story-creator">
          Created by <strong><?= htmlspecialchars($creatorName) ?></strong> &middot; <?= htmlspecialchars($story['creator_role']) ?>
        </p>
      </div>
    </section>
  </main>
</body>
</html>
