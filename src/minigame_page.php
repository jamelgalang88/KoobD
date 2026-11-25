<?php
// One minigame's page (hint_hunt.php, word_pairs.php, letter_mix.php,
// sentence_builder.php). Expects
// $mgGame (the game's key), $mgTitle, $mgClass (its colours in css/minigames.css)
// and $mgScript; js/minigame-kit.js holds what these games share.
require_once __DIR__ . '/minigames_lib.php';
$user = koobdRequireAuth(true);
koobdMissionRequireFeature($user, 'minigames');
koobdRequireMinigameUnlocked($user, $mgGame);
$username = $user['username'];
$profile = koobdResolvedProfile($user);
$classroomPath = 'classroom.php';
$profileEditPath = 'profile.php';
$sidebarActive = '';
$bests = koobdMinigameBests((int)$user['id'], $mgGame);
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
  <title>KoobD - <?= htmlspecialchars($mgTitle) ?></title>
  <link rel="stylesheet" href="<?= koobdAsset('css/app.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/minigames.css') ?>">
  <link rel="icon" type="image/png" href="assets/images/icons/favicon.png">
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#f3f8ff">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <link rel="apple-touch-icon" href="assets/images/icons/app/apple-touch-icon.png">
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
</head>
<body class="app-bg minigames-page">
  <div class="app-shell">
<?php include __DIR__ . '/versus_sidebar.php'; ?>

    <main class="main">
      <div class="main-inner mg <?= htmlspecialchars($mgClass) ?>" id="mgRoot"></div>
    </main>
  </div>
  <script>window.KOOBD_MINIGAME = <?= json_encode(['game' => $mgGame, 'bests' => (object)$bests]) ?>;</script>
  <script src="<?= koobdAsset('js/sidebar.js') ?>"></script>
  <script src="<?= koobdAsset('js/minigame-kit.js') ?>"></script>
  <script src="<?= koobdAsset($mgScript) ?>"></script>
</body>
</html>
