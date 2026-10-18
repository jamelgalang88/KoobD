<?php
require_once('auth.php');
$user = koobdRequireAuth(true);
$username = $user["username"];
$profile = koobdResolvedProfile($user);
$isTeacher = koobdIsTeacher($user);
$classroomPath = 'classroom.php';
$profileEditPath = 'profile.php';

$whatsNewStories = [
  [
    'title' => 'The Hare and the Tortoise',
    'cover' => 'assets/images/books/book1_cover.png',
  ],
];

$eventsStories = [
  [
    'title' => 'Fresh Adventures',
    'cover' => 'assets/images/banners/banner1.png',
  ],
  [
    'title' => 'Colorful Worlds',
    'cover' => 'assets/images/banners/banner2.jpg',
  ],
  [
    'title' => 'Choose Your Path',
    'cover' => 'assets/images/banners/banner3.jpg',
  ],
  [
    'title' => 'Story Spotlight',
    'cover' => 'assets/images/banners/360_F_404733910_2mIXr6RbC5G3WZJFjopVsBaR3EOM6Bqy.jpg',
  ],
];
$developerStories = [
  [
    'id' => 'book1',
    'title' => 'The Hare and the Tortoise',
    'href' => 'book1.php',
    'cover' => 'assets/images/books/book1_cover.png',
    'mode' => 'story',
    'summary' => 'A proud, speedy hare challenges a slow but steady tortoise to a race through the forest. Follow them every step of the way and see who reaches the finish line first.',
    'lesson' => 'Lesson: Steady effort and kindness matter more than pride.'
  ],
  [
    'id' => 'false_knight',
    'title' => 'The False Knight',
    'href' => 'false_knight.php',
    'cover' => 'The%20False%20Knight/backround%20and%20stuff/The%20False%20Knight%20Cover.jpg',
    'mode' => 'platform',
    'summary' => 'CubeBot dreams of becoming a knight of the castle in the great World Tree. When a little thief runs off with his coins, the chase pulls him into an adventure that tests what real courage means.',
    'lesson' => 'Lesson: True courage is measured by the choices we make for others.'
  ],
];
$categoryItems = [];

foreach ($developerStories as $story) {
  $categoryItems[] = [
    'id' => $story['id'],
    'title' => $story['title'],
    'cover' => $story['cover'],
    'href' => $story['href'],
    'mode' => $story['mode'],
    'summary' => $story['summary'],
    'lesson' => preg_replace('/^Lesson:\s*/', '', $story['lesson']),
    'localCover' => true
  ];
}

$heroBanners = [
  [
    'image' => 'assets/images/banners/banner1.png',
    'eyebrow' => 'Featured Story Time',
    'title' => 'Read, imagine, and play through every page.'
  ],
  [
    'image' => 'assets/images/banners/banner2.jpg',
    'eyebrow' => 'Fresh Adventures',
    'title' => 'Discover colorful worlds made for young readers.'
  ],
  [
    'image' => 'assets/images/banners/banner3.jpg',
    'eyebrow' => 'Create Your Path',
    'title' => 'Pick a story and let each choice shape the journey.'
  ],
  [
    'image' => 'assets/images/banners/360_F_404733910_2mIXr6RbC5G3WZJFjopVsBaR3EOM6Bqy.jpg',
    'eyebrow' => 'Story Spotlight',
    'title' => 'Step into another world and discover a brand new scene.'
  ]
];

$sharedStories = koobdSharedStories(8);
// Where the reader stopped in each story (Continue / Restart in its pop-up).
$savedProgress = koobdUserStoryProgress((int)$user['id']);
$progressOf = static function (string $storyId) use ($savedProgress): ?array {
  return $savedProgress[$storyId] ?? null;
};

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
  <title>KoobD</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/app.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/dashboard.css') ?>">
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
<body class="app-bg dashboard-home">
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
            <a href="home.php" class="sidebar-link active">
              <div class="sidebar-icon-box">
                <img src="assets/images/icons/HOME 1.png" alt="">
              </div>
            </a>

            <a href="<?= htmlspecialchars($classroomPath) ?>" class="sidebar-link">
              <div class="sidebar-icon-box">
                <img src="assets/images/icons/classroom 1.png" alt="">
              </div>
            </a>
            <a href="teacher_stories.php" class="sidebar-link sidebar-link-stories" aria-label="My Stories" title="My Stories">
              <div class="sidebar-icon-box">
                <svg class="sidebar-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H19v-5"/><path d="M8.5 7.5h6M8.5 11h4"/></svg>
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
      <div class="main-inner">
        <div class="dashboard-grid">

          <section class="dash-main-col">
            <div class="dash-search-wrap">
              <input class="dash-search" type="search" placeholder="Search stories" aria-label="Search stories" autocomplete="off" enterkeyhint="search">
            </div>

            <section class="dash-hero" aria-label="Featured banner">
              <div class="dash-hero-track" id="homeHeroTrack">
                <?php foreach ($heroBanners as $banner): ?>
                  <article
                    class="dash-hero-slide"
                    style="background-image: linear-gradient(110deg, rgba(30, 39, 75, .2), rgba(30, 39, 75, .05)), url('<?= htmlspecialchars($banner['image']) ?>');"
                  >
                  </article>
                <?php endforeach; ?>
              </div>

              <div class="dash-hero-dots" id="homeHeroDots" aria-label="Banner slides">
                <?php foreach ($heroBanners as $index => $banner): ?>
                  <button
                    type="button"
                    class="dash-hero-dot<?= $index === 0 ? ' is-active' : '' ?>"
                    data-slide="<?= $index ?>"
                    aria-label="Show banner <?= $index + 1 ?>"
                  ></button>
                <?php endforeach; ?>
              </div>
            </section>

            <section class="dash-category-wrap">
              <div class="dash-category-label">CLASSIC STORIES</div>
              <div class="dash-category-art">
                <div class="dash-category-grid">
                  <?php foreach ($categoryItems as $item): ?>
                    <a class="dash-story-tile" href="<?= htmlspecialchars($item['href']) ?>"<?= koobdStoryDetailsData(array_merge([
                      'title' => $item['title'], 'href' => $item['href'], 'cover' => $item['cover'], 'mode' => $item['mode'],
                      'creator' => 'A KoobD Classic', 'description' => $item['summary'], 'lesson' => $item['lesson'],
                      'key' => $item['id'],
                    ], koobdStoryProgressDetails($item['href'], $progressOf($item['id'])))) ?>>
                      <?php if (!empty($item['cover']) && !empty($item['localCover'])): ?>
                        <img
                          src="<?= htmlspecialchars($item['cover']) ?>" loading="lazy" decoding="async"
                          alt="<?= htmlspecialchars($item['title'] ?? 'Story') ?>"
                        >
                      <?php endif; ?>
                      <?= koobdStoryModeBadge($item['mode'] ?? 'story') ?>
                      <span class="dash-story-title" translate="no"><?= htmlspecialchars($item['title'] ?? 'Story') ?></span>
                    </a>
                  <?php endforeach; ?>
                </div>
              </div>
            </section>

            <section class="dash-shared-wrap">
              <div class="dash-shared-head">
                <div class="dash-shared-label">STORIES MADE BY OTHERS</div>
              </div>

              <?php if (empty($sharedStories)): ?>
                <div class="dash-shared-empty panel">
                  <div class="dash-shared-empty-title">No stories yet</div>
                  <p>Be the first to build and publish a story. Once it is published, everyone can find it here.</p>
                </div>
              <?php else: ?>
                <div class="dash-shared-grid">
                  <?php foreach ($sharedStories as $story): ?>
                    <a class="dash-shared-card<?= empty($story['cover']) ? ' no-cover' : '' ?>" href="<?= htmlspecialchars($story['href']) ?>"<?= koobdStoryDetailsData(array_merge([
                      'title' => $story['title'], 'href' => $story['href'], 'cover' => $story['cover'], 'mode' => $story['mode'],
                      'creator' => $story['creator_label'],
                      'description' => $story['description'] !== '' ? $story['description'] : ($story['subtitle'] !== 'Published story' ? $story['subtitle'] : ''),
                      'lesson' => $story['lesson'],
                      'key' => 'shared-' . (int)$story['id'],
                    ], koobdStoryProgressDetails($story['href'], (int)$story['teacher_story_id'] > 0 ? $progressOf(koobdTeacherStoryKey((int)$story['teacher_story_id'])) : null))) ?>>
                      <?= koobdStoryModeBadge($story['mode'] ?? 'story') ?>
                      <?php if (!empty($story['cover'])): ?>
                        <div class="dash-shared-cover">
                          <img src="<?= htmlspecialchars($story['cover']) ?>" loading="lazy" decoding="async" alt="<?= htmlspecialchars($story['title']) ?>">
                        </div>
                      <?php endif; ?>

                      <div class="dash-shared-body<?= empty($story['cover']) ? ' no-cover' : '' ?>">
                        <h3 translate="no"><?= htmlspecialchars($story['title']) ?></h3>
                        <div class="dash-shared-meta">
                          <span class="dash-shared-author"><?= htmlspecialchars($story['creator_label']) ?></span>
                        </div>
                      </div>
                    </a>
                  <?php endforeach; ?>
                </div>
              <?php endif; ?>
            </section>

          </section>

          <section class="dash-side-col">
            <section class="dash-panel panel">
              <div class="dash-panel-head">
                <div class="dash-panel-title">WHATS NEW</div>
                <a class="dash-see-all" href="<?= htmlspecialchars($classroomPath) ?>">SEE ALL</a>
              </div>

              <div class="dash-avatar-row">
                <?php for ($i = 0; $i < 2; $i++): ?>
                  <?php $story = $whatsNewStories[$i] ?? null; ?>
                  <div class="dash-avatar">
                      <?php if ($story && !empty($story['cover'])): ?>
                        <img
                          src="<?= htmlspecialchars($story['cover']) ?>"
                          alt="<?= htmlspecialchars($story['title'] ?? 'Story') ?>"
                          loading="lazy" decoding="async"
                        >
                      <?php endif; ?>
                  </div>
                <?php endfor; ?>
              </div>
            </section>

            <section class="dash-panel panel">
              <div class="dash-panel-head">
                <div class="dash-panel-title events-title">EVENTS</div>
                <a class="dash-see-all" href="<?= htmlspecialchars($classroomPath) ?>">SEE ALL</a>
              </div>

              <div class="dash-events-body">
                <?php foreach ($eventsStories as $story): ?>
                  <div class="dash-event-item">
                      <?php if (!empty($story['cover'])): ?>
                        <img
                          src="<?= htmlspecialchars($story['cover']) ?>"
                          alt="<?= htmlspecialchars($story['title'] ?? 'Story') ?>"
                          loading="lazy" decoding="async"
                        >
                      <?php endif; ?>
                  </div>
                <?php endforeach; ?>
              </div>
            </section>

            <div class="dash-lastread">
              <div class="dash-lastread-label">LAST READ</div>
              <button class="panel dash-progress-card" id="lastReadCard" type="button">
                <div class="dash-progress-story" id="lastReadStory">No story read yet</div>
                <div class="dash-progress-title">Progress</div>
                <div class="dash-progress-bar">
                  <div class="dash-progress-fill" id="lastReadFill" style="width:0%;"></div>
                </div>
                <div class="dash-progress-meta">
                  <span class="dash-progress-percent" id="lastReadPercent">0%</span>
                  <span class="dash-progress-hint" id="lastReadHint">Open a story to start tracking progress.</span>
                </div>
              </button>
            </div>
          </section>

        </div>
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
  <script src="<?= koobdAsset('js/last-read.js') ?>"></script>
  <script src="<?= koobdAsset('js/home-banner.js') ?>"></script>
  <script src="<?= koobdAsset('js/home-search.js') ?>"></script>
  <script src="<?= koobdAsset('js/story-details.js') ?>"></script>
</body>
</html>
