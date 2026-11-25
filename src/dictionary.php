<?php
// The Dictionary (profile menu > Dictionary): look up an English or Tagalog
// word, see what it means and translate it into the other language. Words
// come from dictionary_api.php; js/dictionary.js does the searching, keeps
// the last words looked up on this device, and puts the search in the
// address (dictionary.php?q=forest&from=en), so Back and links work.
require_once('auth.php');
require_once __DIR__ . '/missions_lib.php';
$user = koobdRequireAuth(true);
koobdMissionRequireFeature($user, 'learning_tools');
$username = $user['username'];
$profile = koobdResolvedProfile($user);
$classroomPath = 'classroom.php';
$profileEditPath = 'profile.php';
$sidebarActive = '';
$from = ($_GET['from'] ?? 'en') === 'tl' ? 'tl' : 'en';
$query = mb_substr(trim((string)($_GET['q'] ?? '')), 0, 40);
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
  <title>KoobD - Dictionary</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/app.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/koobd-speech.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/dictionary.css') ?>">
  <link rel="icon" type="image/png" href="assets/images/icons/favicon.png">
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#f3f8ff">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <link rel="apple-touch-icon" href="assets/images/icons/app/apple-touch-icon.png">
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
  <script src="<?= koobdAsset('js/koobd-speech.js') ?>"></script>
</head>
<body class="app-bg dictionary-page">
  <div class="app-shell">
<?php include __DIR__ . '/versus_sidebar.php'; ?>

    <main class="main">
      <div class="main-inner dict">
        <header class="dict-hero">
          <span class="dict-hero-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/></svg>
          </span>
          <div class="dict-hero-copy">
            <h1>Dictionary</h1>
            <p>Look up English and Tagalog words, see what they mean, and translate them.</p>
          </div>
        </header>

        <form class="dict-search" id="dictForm" role="search" autocomplete="off">
          <div class="dict-direction" role="group" aria-label="Translate">
            <span class="dict-lang"><small>From</small><b id="dictFromLabel"><?= $from === 'tl' ? 'Tagalog' : 'English' ?></b></span>
            <button type="button" class="dict-swap" id="dictSwap" aria-label="Swap languages" title="Swap languages">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h12l-3-3M17 17H5l3 3"/></svg>
            </button>
            <span class="dict-lang is-to"><small>Into</small><b id="dictToLabel"><?= $from === 'tl' ? 'English' : 'Tagalog' ?></b></span>
          </div>
          <div class="dict-field">
            <svg class="dict-field-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            <input type="search" id="dictInput" name="q" maxlength="40" value="<?= htmlspecialchars($query) ?>"
              placeholder="<?= $from === 'tl' ? 'Type a Tagalog word' : 'Type an English word' ?>" aria-label="Word to look up" enterkeyhint="search" spellcheck="false" autocapitalize="off">
            <button type="submit" class="dict-go">Search</button>
          </div>
          <input type="hidden" name="from" id="dictFrom" value="<?= $from ?>">
        </form>

        <div class="dict-layout">
          <section class="dict-results" id="dictResults" aria-live="polite">
            <div class="dict-message">
              <h2>Find a word</h2>
              <p>Type a word above, or try one of these.</p>
            </div>
          </section>

          <aside class="dict-side">
            <section class="dict-panel" id="dictRecentPanel" hidden>
              <div class="dict-panel-head">
                <h2>Recent words</h2>
                <button type="button" class="dict-clear" id="dictClear">Clear</button>
              </div>
              <div class="dict-chips" id="dictRecent"></div>
            </section>
            <section class="dict-panel">
              <h2>Try these</h2>
              <div class="dict-try">
                <span class="dict-try-label">English</span>
                <div class="dict-chips">
                  <?php foreach (['book', 'friend', 'forest', 'happy', 'water', 'brave'] as $word): ?>
                    <button type="button" class="dict-chip" data-word="<?= $word ?>" data-from="en" translate="no"><?= $word ?></button>
                  <?php endforeach; ?>
                </div>
              </div>
              <div class="dict-try">
                <span class="dict-try-label">Tagalog</span>
                <div class="dict-chips">
                  <?php foreach (['bata', 'salamat', 'maganda', 'aso', 'bahay', 'kumain'] as $word): ?>
                    <button type="button" class="dict-chip" data-word="<?= $word ?>" data-from="tl" translate="no"><?= $word ?></button>
                  <?php endforeach; ?>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  </div>

  <script>window.KOOBD_DICTIONARY = <?= json_encode(['user' => (int)$user['id']]) ?>;</script>
  <script src="<?= koobdAsset('js/sidebar.js') ?>"></script>
  <script src="<?= koobdAsset('js/dictionary.js') ?>"></script>
</body>
</html>
