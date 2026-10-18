<?php
require_once('auth.php');
$user = koobdRequireAuth(false);
$username = $user["username"];
$characters = koobdCharacterCatalog();
$selectedReaderRaw = $user['selected_reader'] ?? '';
$selectedReader = $selectedReaderRaw !== '' ? koobdNormalizeReaderKey($selectedReaderRaw) : '';
$setupMode = (int)($user['profile_completed'] ?? 0) !== 1;
$returnPath = koobdSanitizeReturnPath($_GET['return'] ?? '', 'home.php');
$readerKeys = array_keys($characters);
$selectedKey = in_array($selectedReader, $readerKeys, true) ? $selectedReader : ($readerKeys[0] ?? '');
$selectedProfile = koobdReaderProfileDefaults($selectedKey);
$customizeBasePath = koobdIsTeacher($user) ? 'teacher_profile.php' : 'customize_character.php';
$selectedNameParts = preg_split('/\s+/', trim((string)$selectedProfile['display'])) ?: [];
$selectedNameLead = count($selectedNameParts) > 1 ? implode(' ', array_slice($selectedNameParts, 0, -1)) : ($selectedNameParts[0] ?? '');
$selectedNameAccent = count($selectedNameParts) > 1 ? end($selectedNameParts) : '';
$selectedCustomizePath = $customizeBasePath . '?return=' . rawurlencode($returnPath) . '&character=' . rawurlencode($selectedKey);
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
  <title>KoobD - Select Reader</title>
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
</head>
<body class="app-bg reader-page reader-setup-mode">
  <main class="reader-standalone">
    <section class="reader-layout" aria-label="Reader selection">
      <div class="reader-decor reader-decor-left" aria-hidden="true"></div>
      <div class="reader-decor reader-decor-right" aria-hidden="true"></div>
      <div class="reader-decor reader-decor-small" aria-hidden="true"></div>

      <?php if (!$setupMode): ?>
        <div class="reader-topbar">
          <a class="reader-back-link" href="<?= htmlspecialchars($returnPath) ?>">Back</a>
        </div>
      <?php endif; ?>

      <div class="reader-title">
        <h2>SELECT A READER</h2>
        <p class="reader-subtitle">
          <?= $setupMode
            ? 'Choose your reader profile, then tap the center card to customize it.'
            : 'Choose your saved reader again anytime to edit its profile.' ?>
        </p>
      </div>

      <div class="reader-carousel">
        <button class="reader-arrow" id="readerPrev" type="button" aria-label="Previous reader">&#8249;</button>

        <div class="reader-stage">
          <div class="reader-grid">
              <?php foreach ($readerKeys as $readerKey): ?>
              <?php $reader = $characters[$readerKey]; ?>
              <?php $defaults = koobdReaderProfileDefaults($readerKey); ?>
              <?php $readerCustomizeHref = $customizeBasePath . '?return=' . rawurlencode($returnPath) . '&character=' . rawurlencode($readerKey); ?>
              <a
                href="<?= htmlspecialchars($readerCustomizeHref) ?>"
                class="reader-card<?= $selectedKey === $readerKey ? ' is-selected' : '' ?>"
                data-selected="<?= $selectedKey === $readerKey ? 'true' : 'false' ?>"
                data-reader-name="<?= htmlspecialchars($reader['display']) ?>"
                data-reader-asset="<?= htmlspecialchars($reader['asset']) ?>"
                data-reader-href="<?= htmlspecialchars($readerCustomizeHref) ?>"
                style="--reader-card-top:<?= htmlspecialchars($defaults['top']) ?>; --reader-card-bottom:<?= htmlspecialchars($defaults['bottom']) ?>; --reader-card-accent:<?= htmlspecialchars($defaults['accent']) ?>;"
              >
                <div class="reader-avatar">
                  <img src="<?= htmlspecialchars($reader['asset']) ?>" alt="<?= htmlspecialchars($reader['display']) ?>">
                </div>
                <span class="reader-card-label" translate="no"><?= htmlspecialchars($reader['display']) ?></span>
              </a>
            <?php endforeach; ?>
          </div>
        </div>

        <button class="reader-arrow" id="readerNext" type="button" aria-label="Next reader">&#8250;</button>
      </div>

      <div class="reader-dots">
        <?php foreach ($readerKeys as $index => $readerKey): ?>
          <button
            type="button"
            class="reader-dot<?= $selectedKey === $readerKey ? ' is-active' : '' ?>"
            data-reader-dot="<?= $index ?>"
            aria-label="Show reader <?= $index + 1 ?>"
          ></button>
        <?php endforeach; ?>
      </div>

      <div class="reader-selected">
        <a class="reader-selected-avatar" id="readerSelectedLink" href="<?= htmlspecialchars($selectedCustomizePath) ?>" aria-label="Customize selected reader">
          <img id="readerSelectedAvatar" src="<?= htmlspecialchars($selectedProfile['asset']) ?>" alt="<?= htmlspecialchars($selectedProfile['display']) ?>">
        </a>
        <a class="reader-selected-name" id="readerSelectedName" href="<?= htmlspecialchars($selectedCustomizePath) ?>">
          <?php if ($selectedNameAccent !== ''): ?>
            <span class="reader-selected-name-plain"><?= htmlspecialchars($selectedNameLead) ?></span>
            <span class="reader-selected-name-accent"><?= htmlspecialchars($selectedNameAccent) ?></span>
          <?php else: ?>
            <span class="reader-selected-name-plain" translate="no"><?= htmlspecialchars($selectedProfile['display']) ?></span>
          <?php endif; ?>
        </a>
        <a class="reader-selected-cta" id="readerSelectedCta" href="<?= htmlspecialchars($selectedCustomizePath) ?>">
          <?= $setupMode ? 'Choose this reader' : 'Customize' ?>
        </a>
      </div>
    </section>
  </main>

  <script src="<?= koobdAsset('js/sidebar.js') ?>"></script>
</body>
</html>
