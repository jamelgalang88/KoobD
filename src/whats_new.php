<?php
// What's New: every KoobD update (whats_new_data.php) - new stories, new
// features, improvements and bug fixes - newest first, grouped by month, with
// a filter per category. A new story opens the same pop-up as its card.
require_once('auth.php');
require_once('whats_new_data.php');
$user = koobdRequireAuth(true);
$username = $user["username"];
$profile = koobdResolvedProfile($user);
$isTeacher = koobdIsTeacher($user);
$classroomPath = 'classroom.php';
$profileEditPath = 'profile.php';

$types = koobdWhatsNewTypes();
$updates = koobdWhatsNew();
$savedProgress = koobdUserStoryProgress((int)$user['id']);
$counts = array_fill_keys(array_keys($types), 0);
$months = [];
foreach ($updates as $update) {
  $counts[$update['type']] = ($counts[$update['type']] ?? 0) + 1;
  $months[date('F Y', strtotime($update['date']))][] = $update;
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
  <title>KoobD - What's New</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/app.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/whats-new.css') ?>">
  <link rel="icon" type="image/png" href="assets/images/icons/favicon.png">
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#f3f8ff">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="KoobD">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link rel="apple-touch-icon" href="assets/images/icons/app/apple-touch-icon.png">
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
</head>
<body class="app-bg whats-new-page">
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-inner">
        <div class="sidebar-top">
          <div class="sidebar-brand-mark">
            <img src="assets/images/logos/logo.png" alt="KoobD">
          </div>
          <div class="sidebar-brand-text">KoobD</div>
          <div class="sidebar-divider"></div>
          <nav class="sidebar-nav" aria-label="Main navigation">
            <a href="home.php" class="sidebar-link" aria-label="Home">
              <div class="sidebar-icon-box">
                <img src="assets/images/icons/HOME 1.png" alt="">
              </div>
            </a>

            <a href="<?= htmlspecialchars($classroomPath) ?>" class="sidebar-link" aria-label="Classroom">
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
              <span class="sidebar-user-text"><?= htmlspecialchars($username) ?></span>
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
      <div class="main-inner wn-main">
        <header class="wn-header">
          <a class="wn-back" href="home.php">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
            <span>Home</span>
          </a>
          <h1 class="wn-title">What's New</h1>
          <p class="wn-subtitle">New stories, features and fixes in KoobD.</p>
        </header>

        <?php // Filters: everything, or one kind of update. ?>
        <div class="wn-filters" role="group" aria-label="Show updates">
          <button type="button" class="wn-filter" data-filter="all" aria-pressed="true">
            All <span class="wn-filter-count"><?= count($updates) ?></span>
          </button>
          <?php foreach ($types as $type => $info): ?>
            <?php if (!$counts[$type]) continue; ?>
            <button type="button" class="wn-filter is-<?= $type ?>" data-filter="<?= $type ?>" aria-pressed="false">
              <?= koobdWhatsNewIcon($type) ?>
              <?= htmlspecialchars($info['plural']) ?> <span class="wn-filter-count"><?= $counts[$type] ?></span>
            </button>
          <?php endforeach; ?>
        </div>

        <?php if (!$updates): ?>
          <p class="wn-empty">No updates yet. Check back soon.</p>
        <?php endif; ?>

        <?php foreach ($months as $month => $entries): ?>
          <section class="wn-month" aria-label="<?= htmlspecialchars($month) ?>">
            <h2 class="wn-month-title"><?= htmlspecialchars($month) ?></h2>
            <ol class="wn-list">
              <?php foreach ($entries as $update): ?>
                <?php
                $type = $update['type'];
                $story = koobdWhatsNewStoryDetails($update, $savedProgress);
                $major = !empty($update['major']);
                ?>
                <li class="wn-item" data-type="<?= $type ?>">
                  <article class="wn-card is-<?= $type ?><?= $major ? ' is-major' : '' ?><?= $story ? ' has-story' : '' ?>" id="<?= htmlspecialchars($update['id']) ?>">
                    <?php if ($story && !empty($story['cover'])): ?>
                      <a class="wn-card-cover" href="<?= htmlspecialchars($story['href']) ?>"<?= koobdStoryDetailsData($story) ?> tabindex="-1" aria-hidden="true">
                        <img src="<?= htmlspecialchars($story['cover']) ?>" alt="" loading="lazy" decoding="async">
                      </a>
                    <?php else: ?>
                      <span class="wn-card-icon"><?= koobdWhatsNewIcon($type) ?></span>
                    <?php endif; ?>
                    <div class="wn-card-body">
                      <div class="wn-card-top">
                        <span class="wn-tag is-<?= $type ?>"><?= htmlspecialchars($types[$type]['label']) ?></span>
                        <?php if ($major && $type !== 'story'): ?><span class="wn-major">Major update</span><?php endif; ?>
                        <?php if (koobdWhatsNewIsFresh($update['date'])): ?><span class="wn-fresh">New</span><?php endif; ?>
                        <time class="wn-date" datetime="<?= htmlspecialchars($update['date']) ?>"><?= htmlspecialchars(koobdWhatsNewDate($update['date'])) ?></time>
                      </div>
                      <h3 class="wn-card-title"<?= $type === 'story' ? ' translate="no"' : '' ?>><?= htmlspecialchars($update['title']) ?></h3>
                      <p class="wn-card-summary"><?= htmlspecialchars($update['summary']) ?></p>
                      <?php if (!empty($update['points'])): ?>
                        <ul class="wn-points">
                          <?php foreach ($update['points'] as $point): ?>
                            <li><?= htmlspecialchars($point) ?></li>
                          <?php endforeach; ?>
                        </ul>
                      <?php endif; ?>
                      <?php if ($story): ?>
                        <div class="wn-card-actions">
                          <a class="wn-btn" href="<?= htmlspecialchars($story['href']) ?>"<?= koobdStoryDetailsData($story) ?>>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>
                            <?= htmlspecialchars($story['play'] ?? ($story['mode'] === 'platform' ? 'Play Story' : 'Read Story')) ?>
                          </a>
                          <span class="wn-story-meta"><?= $story['mode'] === 'platform' ? 'Platform Mode' : 'Story Mode' ?> · <span translate="no"><?= htmlspecialchars($story['creator'] ?? '') ?></span></span>
                        </div>
                      <?php endif; ?>
                    </div>
                  </article>
                </li>
              <?php endforeach; ?>
            </ol>
          </section>
        <?php endforeach; ?>
        <p class="wn-empty" id="wnFilterEmpty" hidden>Nothing here yet.</p>
      </div>
    </main>
  </div>

  <script>
    window.KOOBD_SESSION = <?= json_encode([
      'role' => $isTeacher ? 'teacher' : 'student',
      'userId' => (int)$user['id'],
      'username' => $username,
    ]) ?>;
  </script>
  <script src="<?= koobdAsset('js/sidebar.js') ?>"></script>
  <script src="<?= koobdAsset('js/story-details.js') ?>"></script>
  <script>
    (() => {
      // Filters: show one kind of update (or all); months with nothing left
      // to show step aside.
      const buttons = document.querySelectorAll('.wn-filter');
      const items = document.querySelectorAll('.wn-item');
      const months = document.querySelectorAll('.wn-month');
      const empty = document.getElementById('wnFilterEmpty');
      buttons.forEach((button) => button.addEventListener('click', () => {
        const filter = button.dataset.filter;
        buttons.forEach((item) => item.setAttribute('aria-pressed', item === button ? 'true' : 'false'));
        items.forEach((item) => { item.hidden = filter !== 'all' && item.dataset.type !== filter; });
        let shown = 0;
        months.forEach((month) => {
          const visible = month.querySelectorAll('.wn-item:not([hidden])').length;
          month.hidden = visible === 0;
          shown += visible;
        });
        if (empty) empty.hidden = shown > 0;
      }));
    })();
  </script>
</body>
</html>
