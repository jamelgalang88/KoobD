<?php
require_once('auth.php');
$user = koobdRequireAuth(true);
$username = $user["username"];
// Read as a classroom activity (?activity_id=): progress is kept for that activity.
$activity = isset($_GET['activity_id']) ? koobdStudentActivity((int)$_GET['activity_id'], (int)$user['id']) : null;
if ($activity && $activity['story_id'] !== 'book1') {
    $activity = null;
}
$activityId = $activity ? (int)$activity['id'] : 0;
$progressContext = $activity ? koobdActivityProgressContext($activityId) : 'global';
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
  <title>Book 1: The Hare and the Tortoise</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/book1.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/story-reader.css') ?>">
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
<body class="story-page">
  <button id="backHomeBtn" class="top-right story-exit-btn" aria-label="Pause story" title="Pause (Esc)">
    <span class="story-pause-icon" aria-hidden="true"></span>
  </button>

  <?php // The story's root: part of the shared story system, black from the first paint until the title comes up. ?>
  <div class="vn-wrapper koobd-story is-title-intro" id="storyRoot">
    <div class="vn-background" id="sceneBg"></div>

    <div class="vn-characters" translate="no">
      <img id="charLeft" class="vn-char left" src="" alt="">
      <img id="charRight" class="vn-char right" src="" alt="">
    </div>

    <div class="vn-dialogue" translate="no">
      <div class="vn-names">
        <div class="name-box" id="nameLeft"></div>
        <div class="name-box" id="nameRight"></div>
      </div>
      <div class="dialogue-box" id="dialogueText">...</div>
      <div class="vn-choices" id="choiceButtons"></div>
    </div>

    <div class="choice-timer hidden" id="choiceTimer" aria-hidden="true">
      <div class="choice-timer-track">
        <div class="choice-timer-fill" id="choiceTimerFill"></div>
      </div>
    </div>
  </div>


  <script>
    window.KOOBD_SESSION = <?= json_encode([
      'role' => 'student',
      'userId' => (int)$user['id'],
      'username' => $username,
      'progressContext' => $progressContext,
      'activityId' => $activityId,
      // Home, or back to the classroom for an activity.
      'returnHref' => $activity ? 'classroom_room.php?id=' . (int)$activity['classroom_id'] : 'home.php',
      // Where the reader stopped, kept on the server: Continue works on any device.
      'savedProgress' => (function () use ($user, $progressContext) {
        $saved = koobdStoryProgressFor((int)$user['id'], 'book1', $progressContext);
        return $saved ? [
          'storyId' => 'book1',
          'progressContext' => $progressContext,
          'progress' => $saved['progress'],
          'state' => $saved['state'] ?? new stdClass(),
          'updatedAt' => $saved['updatedAt'],
        ] : null;
      })(),
    ]) ?>;
  </script>
  <script src="<?= koobdAsset('js/story-orientation.js') ?>"></script>
  <script src="<?= koobdAsset('js/story-shared.js') ?>"></script>
  <script src="<?= koobdAsset('The%20Hare%20and%20the%20Tortoise/hare-and-tortoise-story.tl.js') ?>"></script>
  <script src="<?= koobdAsset('The%20Hare%20and%20the%20Tortoise/hare-and-tortoise-story.js') ?>"></script>
</body>
</html>
