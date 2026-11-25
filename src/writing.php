<?php
// Writing Practice (sidebar > Writing, profile menu, profile page): a
// student's notepads in English or Tagalog, checked as they write, and timed
// writing challenges with feedback at the end. js/writing.js runs the page;
// js/writing-checker.js does the checking; writing_api.php keeps the notepads.
//   writing.php                 the notepads
//   writing.php?note=<id>       one notepad (or challenge)
//   writing.php?challenge=1     set up a new challenge
require_once('auth.php');
require_once('writing_lib.php');
$user = koobdRequireAuth(true);
require_once __DIR__ . '/missions_lib.php';
koobdMissionRequireFeature($user, 'learning_tools');
$username = $user['username'];
$profile = koobdResolvedProfile($user);
$classroomPath = 'classroom.php';
$profileEditPath = 'profile.php';
$sidebarActive = '';
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
  <title>KoobD - Writing Practice</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/app.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/writing.css') ?>">
  <link rel="icon" type="image/png" href="assets/images/icons/favicon.png">
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#f3f8ff">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <link rel="apple-touch-icon" href="assets/images/icons/app/apple-touch-icon.png">
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
</head>
<body class="app-bg writing-page">
  <div class="app-shell">
<?php include __DIR__ . '/versus_sidebar.php'; ?>

    <main class="main">
      <div class="main-inner wp" id="wp">
        <header class="wp-top">
          <div class="wp-top-title">
            <span class="wp-top-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></span>
            <div>
              <h1>Writing Practice</h1>
              <p>Write in English or Tagalog. Your work saves by itself.</p>
            </div>
          </div>
          <div class="wp-top-actions">
            <button type="button" class="wp-btn wp-btn-ghost" id="wpNewChallenge">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg><span>Writing challenge</span>
            </button>
            <button type="button" class="wp-btn wp-btn-primary" id="wpNewNote">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>New notepad</span>
            </button>
          </div>
        </header>

        <?php // The list of notepads, or one notepad full screen (js/writing.js). ?>
        <section class="wp-stage" id="wpStage">
          <div class="wp-empty">
            <h2>Loading your notepads…</h2>
          </div>
        </section>
      </div>
    </main>
  </div>

  <?php // Choosing the language of a new notepad. ?>
  <dialog class="wp-dialog" id="wpNewDialog" aria-labelledby="wpNewTitle">
    <form method="dialog" class="wp-dialog-card">
      <h2 id="wpNewTitle">New notepad</h2>
      <p>Which language will you practise?</p>
      <div class="wp-lang-pick">
        <button type="submit" value="en" class="wp-lang-card"><strong>English</strong><span>Write in English</span></button>
        <button type="submit" value="tl" class="wp-lang-card"><strong>Tagalog</strong><span>Sumulat sa Tagalog</span></button>
      </div>
      <button type="submit" value="" class="wp-btn wp-btn-ghost wp-dialog-cancel">Cancel</button>
    </form>
  </dialog>

  <?php // Deleting a notepad. ?>
  <dialog class="wp-dialog" id="wpDeleteDialog" aria-labelledby="wpDeleteTitle">
    <form method="dialog" class="wp-dialog-card">
      <h2 id="wpDeleteTitle">Delete this notepad?</h2>
      <p id="wpDeleteText">Its writing will be gone for good.</p>
      <div class="wp-dialog-actions">
        <button type="submit" value="" class="wp-btn wp-btn-ghost" autofocus>Keep it</button>
        <button type="submit" value="delete" class="wp-btn wp-btn-danger">Delete</button>
      </div>
    </form>
  </dialog>

  <?php // Back in the middle of a challenge. ?>
  <dialog class="wp-dialog" id="wpLeaveDialog" aria-labelledby="wpLeaveTitle">
    <form method="dialog" class="wp-dialog-card">
      <h2 id="wpLeaveTitle">Leave the challenge?</h2>
      <p>Your writing is saved, but the timer keeps going. Come back before it ends to finish.</p>
      <div class="wp-dialog-actions">
        <button type="submit" value="" class="wp-btn wp-btn-ghost" autofocus>Keep writing</button>
        <button type="submit" value="leave" class="wp-btn wp-btn-primary">Leave</button>
      </div>
    </form>
  </dialog>

  <script>window.KOOBD_WRITING = <?= json_encode(['user' => (int)$user['id'], 'ai' => koobdWritingAiAvailable()]) ?>;</script>
  <script src="<?= koobdAsset('js/sidebar.js') ?>"></script>
  <script src="<?= koobdAsset('js/writing-checker.js') ?>"></script>
  <script src="<?= koobdAsset('js/writing.js') ?>"></script>
</body>
</html>
