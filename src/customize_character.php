<?php
require_once('auth.php');
require_once('profile_swatches.php');
$user = koobdRequireAuth(false);
$username = $user["username"];
$catalog = koobdCharacterCatalog();
$setupMode = (int)($user['profile_completed'] ?? 0) !== 1;
$returnPath = koobdSanitizeReturnPath($_POST['return_to'] ?? $_GET['return'] ?? '', 'home.php');
$returnCopy = 'go back to where you came from';
if (str_starts_with($returnPath, 'profile.php')) {
  $returnCopy = 'go back to your profile';
} elseif (str_starts_with($returnPath, 'home.php')) {
  $returnCopy = 'go back home';
} elseif (str_starts_with($returnPath, 'classroom_room.php')) {
  $returnCopy = 'return to your classroom';
} elseif (str_starts_with($returnPath, 'classroom.php')) {
  $returnCopy = 'go back to Classroom';
}
$firstCharacterKey = array_key_first($catalog) ?? '';

$characterKey = koobdNormalizeReaderKey(
  $_POST['character_key'] ?? $_GET['character'] ?? ($user['selected_reader'] ?? $firstCharacterKey)
);

$character = $catalog[$characterKey];
$defaultProfile = koobdReaderProfileDefaults($characterKey);
$isCurrentProfile = ($user['selected_reader'] ?? '') === $characterKey;

$profileValues = [
  'characterName' => $isCurrentProfile && !empty($user['profile_reader_name']) ? $user['profile_reader_name'] : $defaultProfile['display'],
  'accentLabel' => 'Student',
  'topColor' => $isCurrentProfile && !empty($user['profile_top_color']) ? $user['profile_top_color'] : $defaultProfile['top'],
  'bottomColor' => $isCurrentProfile && !empty($user['profile_bottom_color']) ? $user['profile_bottom_color'] : $defaultProfile['bottom'],
  'accentColor' => $isCurrentProfile && !empty($user['profile_accent_color']) ? $user['profile_accent_color'] : $defaultProfile['accent'],
  'cardStyle' => $isCurrentProfile && !empty($user['profile_card_style']) ? $user['profile_card_style'] : $defaultProfile['style'],
  'scaleRange' => $isCurrentProfile && !empty($user['profile_scale']) ? (int)$user['profile_scale'] : (int)$defaultProfile['scale'],
];

[$topChoices, $bottomChoices] = koobdProfileColorChoices($defaultProfile);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $readerName = trim($_POST['characterName'] ?? '');
  $topColor = trim($_POST['topColor'] ?? '');
  $bottomColor = trim($_POST['bottomColor'] ?? '');
  // The profile is the reader's name and card colours; the other stored
  // values (accent, card style, scale) are kept as they are.
  $accentColor = $profileValues['accentColor'];
  $cardStyle = $profileValues['cardStyle'];
  $scaleRange = max(90, min(110, (int)$profileValues['scaleRange']));

  if ($readerName === '') {
    $readerName = $defaultProfile['display'];
  }
  $topColor = koobdProfileColor($topColor, $profileValues['topColor']);
  $bottomColor = koobdProfileColor($bottomColor, $profileValues['bottomColor']);

  $stmt = $conn->prepare(
    "UPDATE users
     SET selected_reader = ?, profile_reader_name = ?, profile_badge_label = 'Student', profile_top_color = ?,
         profile_bottom_color = ?, profile_accent_color = ?, profile_card_style = ?, profile_scale = ?,
         profile_completed = 1
     WHERE id = ?"
  );
  $stmt->bind_param(
    "ssssssii",
    $characterKey,
    $readerName,
    $topColor,
    $bottomColor,
    $accentColor,
    $cardStyle,
    $scaleRange,
    $user['id']
  );
  $stmt->execute();
  $stmt->close();

  $_SESSION['selected_reader'] = $characterKey;
  $_SESSION['profile_reader_name'] = $readerName;
  $_SESSION['profile_completed'] = 1;

  header("Location: " . ($setupMode ? 'home.php' : $returnPath));
  exit();
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
  <title>KoobD - Customize Character</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/app.css') ?>">
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
  <link rel="stylesheet" href="<?= koobdAsset('css/profile-edit.css') ?>">
</head>
<body class="app-bg customize-page">
  <main class="customize-standalone">
    <div class="customize-shell">
      <section class="customize-hero panel">
        <div>
          <div class="customize-kicker">Character Customization</div>
          <h1 class="customize-title">Make <?= htmlspecialchars($character['display']) ?> your profile</h1>
          <p class="customize-copy"><?= htmlspecialchars($character['description']) ?></p>
        </div>
        <?php if (!$setupMode): ?>
          <a class="customize-back-link" href="<?= htmlspecialchars($returnPath) ?>">Back</a>
        <?php endif; ?>
      </section>

      <div class="customize-grid">
        <section class="customize-preview-panel panel">
          <div
            class="customize-preview-card"
            id="previewCard"
            style="--card-top:<?= htmlspecialchars($profileValues['topColor']) ?>; --card-bottom:<?= htmlspecialchars($profileValues['bottomColor']) ?>; --accent-color:<?= htmlspecialchars($profileValues['accentColor']) ?>;"
          >
            <div class="customize-preview-cover" aria-hidden="true"></div>
            <div class="customize-preview-avatar">
              <img
                id="previewImage"
                src="<?= htmlspecialchars($character['asset']) ?>"
                alt="<?= htmlspecialchars($character['display']) ?>"
              >
            </div>
            <div class="customize-preview-copy">
              <h2 class="customize-preview-name" id="previewName"><?= htmlspecialchars($profileValues['characterName']) ?></h2>
              <p class="customize-preview-note" id="previewNote">Profile for <?= htmlspecialchars($username) ?></p>
            </div>
          </div>
          <p class="customize-preview-hint">This is how your profile will look.</p>
        </section>

        <section class="customize-controls panel">
          <div class="customize-controls-head">
            <h2>Customize your reader profile</h2>
            <p>
              <?= $setupMode
                ? "This becomes the reader profile connected to your account. Save it when you're ready to continue into the app."
                : "Your saved reader profile stays editable. Update anything you want, then save to {$returnCopy}." ?>
            </p>
          </div>

          <form class="customize-form" id="customizeForm" method="post">
            <input type="hidden" name="character_key" value="<?= htmlspecialchars($characterKey) ?>">
            <input type="hidden" name="return_to" value="<?= htmlspecialchars($returnPath) ?>">

            <div class="customize-field full">
              <label for="characterName">Reader name</label>
              <input
                id="characterName"
                name="characterName"
                type="text"
                maxlength="24"
                value="<?= htmlspecialchars($profileValues['characterName']) ?>"
              >
            </div>

            <?php koobdRenderColorSwatches('topColor', 'Top color', $profileValues['topColor'], $topChoices, $defaultProfile['top']); ?>
            <?php koobdRenderColorSwatches('bottomColor', 'Bottom color', $profileValues['bottomColor'], $bottomChoices, $defaultProfile['bottom']); ?>

            <div class="customize-field full">
              <div class="customize-actions">
                <button class="customize-save-btn" type="submit"><?= $setupMode ? 'Save And Continue' : 'Save Profile' ?></button>
                <button class="customize-reset-btn" type="button" id="resetCustomization">Reset</button>
                <?php if (!$setupMode): ?>
                  <a class="customize-reset-btn" href="reader.php?return=<?= rawurlencode($returnPath) ?>">Change Character</a>
                <?php endif; ?>
              </div>
              <div class="customize-status" id="customizeStatus" aria-live="polite"></div>
            </div>
          </form>
        </section>
      </div>
    </div>
  </main>

  <script>
    window.KOOBD_CHARACTER = {
      defaults: <?= json_encode([
        'characterName' => $defaultProfile['display'],
        'accentLabel' => $defaultProfile['badge'],
        'topColor' => $defaultProfile['top'],
        'bottomColor' => $defaultProfile['bottom'],
        'accentColor' => $defaultProfile['accent'],
      ]) ?>,
      username: <?= json_encode($username) ?>
    };
  </script>
  <script src="<?= koobdAsset('js/character-customize.js') ?>"></script>
</body>
</html>
