<?php
require_once('auth.php');
require_once('whats_new_data.php');
require_once('missions_lib.php');
$user = koobdRequireAuth(true);
$username = $user["username"];
$profile = koobdResolvedProfile($user);
$isTeacher = koobdIsTeacher($user);
$classroomPath = 'classroom.php';
$profileEditPath = 'profile.php';
$missions = koobdMissionOverview($user);
$missionJourneyHref = static function (array $mission): string {
    $href = (string)$mission['href'];
    $fragment = '';
    $hashAt = strpos($href, '#');
    if ($hashAt !== false) {
        $fragment = substr($href, $hashAt);
        $href = substr($href, 0, $hashAt);
    }
    $separator = strpos($href, '?') === false ? '?' : '&';
    return $href . $separator . http_build_query(['mission_tutorial' => $mission['key']]) . $fragment;
};
$journeyMissions = [];
if (!empty($missions['current_stage'])) {
    foreach ($missions['missions'] as $mission) {
        if ((int)$mission['stage_number'] === (int)$missions['current_stage']['number']) {
            $journeyMissions[] = $mission;
        }
    }
}

// What's New: the latest updates (whats_new_data.php).
$whatsNew = array_slice(koobdWhatsNew(), 0, 3);

// KoobD's own stories (auth.php).
$categoryItems = koobdClassicStories();

$heroBanners = [
  [
    'image' => 'assets/images/banners/banner1.jpg',
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

$sharedStories = koobdSharedStories(24);
// Where the reader stopped in each story (Continue / Restart in its pop-up).
$savedProgress = koobdUserStoryProgress((int)$user['id']);
$progressOf = static function (string $storyId) use ($savedProgress): ?array {
  return $savedProgress[$storyId] ?? null;
};

// Each card's details for its pop-up (data-story-*, auth.php). What's New uses
// the same details, so those cards open the same pop-up.
$classicDetails = static fn(array $item): array => koobdClassicStoryDetails($item, $progressOf($item['id']));
$sharedDetails = static function (array $story) use ($progressOf): array {
  $key = koobdSharedStoryProgressKey($story);
  return koobdSharedStoryDetails($story, $key !== null ? $progressOf($key) : null);
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
  <link rel="stylesheet" href="<?= koobdAsset('css/whats-new.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/missions.css') ?>">
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
  <link rel="stylesheet" href="<?= koobdAsset('css/social.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/sections.css') ?>">
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
            <a href="home.php" class="sidebar-link active" aria-label="Home">
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

            <?php // Story shelves (js/story-shelf.js): one row that scrolls sideways with the arrows, or Show all for a grid of every story in it. ?>
            <section class="dash-category-wrap story-shelf" data-story-shelf aria-labelledby="shelfClassicTitle">
              <div class="story-shelf-head">
                <div class="dash-category-label" id="shelfClassicTitle">CLASSIC STORIES</div>
                <div class="story-shelf-controls">
                  <button type="button" class="story-shelf-nav is-prev" aria-label="Previous stories" hidden>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
                  </button>
                  <button type="button" class="story-shelf-nav is-next" aria-label="More stories" hidden>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
                  </button>
                <button type="button" class="story-shelf-toggle" aria-expanded="false" hidden>
                  <svg class="is-more" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>
                  <svg class="is-less" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>
                  <span class="story-shelf-toggle-label">Show all</span>
                </button>
                </div>
              </div>
              <div class="dash-category-art story-shelf-viewport">
                <div class="dash-category-grid story-shelf-track">
                  <?php foreach ($categoryItems as $item): ?>
                    <a class="dash-story-tile" href="<?= htmlspecialchars($item['href']) ?>"<?= koobdStoryDetailsData($classicDetails($item)) ?>>
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

            <section class="dash-shared-wrap story-shelf" data-story-shelf aria-labelledby="shelfSharedTitle">
              <div class="story-shelf-head">
                <div class="dash-shared-label" id="shelfSharedTitle">STORIES MADE BY OTHERS</div>
                <div class="story-shelf-controls">
                  <button type="button" class="story-shelf-nav is-prev" aria-label="Previous stories" hidden>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
                  </button>
                  <button type="button" class="story-shelf-nav is-next" aria-label="More stories" hidden>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
                  </button>
                <button type="button" class="story-shelf-toggle" aria-expanded="false" hidden>
                  <svg class="is-more" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>
                  <svg class="is-less" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>
                  <span class="story-shelf-toggle-label">Show all</span>
                </button>
                </div>
              </div>

              <?php if (empty($sharedStories)): ?>
                <div class="dash-shared-empty panel">
                  <div class="dash-shared-empty-title">No stories yet</div>
                  <p>Be the first to build and publish a story. Once it is published, everyone can find it here.</p>
                </div>
              <?php else: ?>
                <div class="story-shelf-viewport">
                <div class="dash-shared-grid story-shelf-track">
                  <?php foreach ($sharedStories as $story): ?>
                    <a class="dash-shared-card<?= empty($story['cover']) ? ' no-cover' : '' ?>" href="<?= htmlspecialchars($story['href']) ?>"<?= koobdStoryDetailsData($sharedDetails($story)) ?>>
                      <?= koobdStoryModeBadge($story['mode'] ?? 'story') ?>
                      <?php if (!empty($story['cover'])): ?>
                        <div class="dash-shared-cover">
                          <img src="<?= htmlspecialchars($story['cover']) ?>" loading="lazy" decoding="async" alt="<?= htmlspecialchars($story['title']) ?>">
                        </div>
                      <?php endif; ?>

                      <div class="dash-shared-body<?= empty($story['cover']) ? ' no-cover' : '' ?>">
                        <h3 translate="no"><?= htmlspecialchars($story['title']) ?></h3>
                        <div class="dash-shared-meta">
                          <span class="dash-shared-author"><?= htmlspecialchars($story['creator_attribution']) ?></span>
                        </div>
                      </div>
                    </a>
                  <?php endforeach; ?>
                </div>
                </div>
              <?php endif; ?>
            </section>

          </section>

          <section class="dash-side-col">
            <?php // What's New: the latest updates; See all opens the full list. A new story opens its pop-up. ?>
            <section class="dash-panel panel dash-whatsnew" aria-labelledby="dashWhatsNewTitle">
              <div class="dash-panel-head">
                <div class="dash-panel-title" id="dashWhatsNewTitle">WHAT'S NEW</div>
                <a class="dash-see-all" href="whats_new.php">SEE ALL</a>
              </div>
              <?php if (!$whatsNew): ?>
                <p class="wn-mini-empty">No updates yet.</p>
              <?php else: ?>
                <?php $wnTypes = koobdWhatsNewTypes(); ?>
                <ul class="wn-mini">
                  <?php foreach ($whatsNew as $update): ?>
                    <?php $wnStory = koobdWhatsNewStoryDetails($update, $savedProgress); ?>
                    <li>
                      <a class="wn-mini-item is-<?= $update['type'] ?>" href="<?= htmlspecialchars($wnStory ? $wnStory['href'] : 'whats_new.php#' . $update['id']) ?>"<?= $wnStory ? koobdStoryDetailsData($wnStory) : '' ?>>
                        <?php if ($wnStory && !empty($wnStory['cover'])): ?>
                          <span class="wn-mini-icon is-cover"><img src="<?= htmlspecialchars($wnStory['cover']) ?>" alt="" loading="lazy" decoding="async"></span>
                        <?php else: ?>
                          <span class="wn-mini-icon"><?= koobdWhatsNewIcon($update['type']) ?></span>
                        <?php endif; ?>
                        <span class="wn-mini-body">
                          <span class="wn-mini-top">
                            <span class="wn-tag is-<?= $update['type'] ?>"><?= htmlspecialchars($wnTypes[$update['type']]['label']) ?></span>
                            <?php if (koobdWhatsNewIsFresh($update['date'])): ?><span class="wn-fresh">New</span><?php endif; ?>
                            <time class="wn-date" datetime="<?= htmlspecialchars($update['date']) ?>"><?= htmlspecialchars(koobdWhatsNewDate($update['date'])) ?></time>
                          </span>
                          <span class="wn-mini-title"<?= $update['type'] === 'story' ? ' translate="no"' : '' ?>><?= htmlspecialchars($update['title']) ?></span>
                        </span>
                      </a>
                    </li>
                  <?php endforeach; ?>
                </ul>
              <?php endif; ?>
            </section>

            <section class="dash-panel panel dash-events-panel dash-missions-panel is-<?= $isTeacher ? 'teacher' : 'student' ?>" id="goalsMissions" aria-labelledby="missionsTitle">
              <div class="dash-panel-head missions-head">
                <div>
                  <div class="dash-panel-title events-title" id="missionsTitle"><?= htmlspecialchars($missions['journey_title']) ?></div>
                  <p class="missions-intro"><?= $isTeacher ? 'A clear overview of classroom setup and student support tasks.' : 'A little adventure, one mission at a time.' ?></p>
                </div>
                <div class="missions-head-actions">
                  <span class="missions-count"><?= (int)$missions['percentage'] ?>%</span>
                  <a class="dash-see-all" href="missions.php">SEE ALL</a>
                </div>
              </div>
              <div class="missions-progress" role="progressbar" aria-label="Overall journey progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="<?= (int)$missions['percentage'] ?>">
                <span style="width:<?= (int)$missions['percentage'] ?>%"></span>
              </div>
              <?php if (!empty($missions['current_stage'])): ?>
                <div class="missions-current-stage">
                  <span class="missions-stage-icon"><?= koobdMissionStageIcon((int)$missions['current_stage']['number'], $isTeacher) ?></span>
                  <span class="missions-stage-copy">
                    <span>Stage <?= (int)$missions['current_stage']['number'] ?> of 5</span>
                    <strong><?= htmlspecialchars($missions['current_stage']['title']) ?></strong>
                  </span>
                  <span class="missions-stage-count"><?= (int)$missions['completed'] ?>/<?= (int)$missions['total'] ?></span>
                </div>
                <div class="missions-stage-track" aria-hidden="true">
                  <?php foreach ($missions['stages'] as $stage): ?>
                    <span class="is-<?= htmlspecialchars($stage['status']) ?>" title="<?= htmlspecialchars($stage['title']) ?>">
                      <?= koobdMissionStageIcon((int)$stage['number'], $isTeacher) ?>
                    </span>
                  <?php endforeach; ?>
                </div>
              <?php endif; ?>
              <?php if ($missions['next']): ?>
                <div class="missions-next-card">
                  <?php if (!$isTeacher): ?><img src="<?= koobdAsset('assets/images/showcase/flowergirl.png') ?>" alt="" loading="lazy" decoding="async"><?php else: ?><span class="missions-next-icon"><?= koobdMissionStageIcon((int)$missions['next']['stage_number'], true) ?></span><?php endif; ?>
                  <div class="missions-next-copy">
                    <span><?= $isTeacher ? 'Recommended next task' : 'Flowergirl’s next mission' ?></span>
                    <strong><?= htmlspecialchars($missions['next']['title']) ?></strong>
                    <?php if ($isTeacher): ?><p><?= htmlspecialchars($missions['next']['description']) ?></p><?php endif; ?>
                  </div>
                  <a class="missions-next-action" href="<?= htmlspecialchars($missionJourneyHref($missions['next'])) ?>" aria-label="<?= htmlspecialchars(($isTeacher ? 'Open task: ' : 'Start mission: ') . $missions['next']['title']) ?>">
                    <?= $isTeacher ? 'Open task' : 'Let’s go' ?>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  </a>
                </div>
              <?php else: ?>
                <div class="missions-next-card is-complete">
                  <div class="missions-complete-hero">
                    <?php if (!$isTeacher): ?>
                      <img src="<?= koobdAsset('assets/images/showcase/flowergirl.png') ?>" alt="" loading="lazy" decoding="async">
                    <?php else: ?>
                      <span class="missions-complete-art" aria-hidden="true">
                        <svg viewBox="0 0 24 24"><path d="m12 3 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.2l5-.7L12 3Z"/><path d="m9 12 2 2 4-4"/></svg>
                      </span>
                    <?php endif; ?>
                    <div class="missions-complete-copy">
                      <span><?= $isTeacher ? 'Teaching journey complete' : 'Learning journey complete' ?></span>
                      <strong><?= $isTeacher ? 'All five stages are complete.' : 'Look how far you’ve come!' ?></strong>
                      <p><?= (int)$missions['completed'] ?> of <?= (int)$missions['total'] ?> required missions completed</p>
                    </div>
                    <span class="missions-complete-stars" aria-hidden="true">★ ★ ★</span>
                  </div>
                  <ol class="missions-complete-stages" aria-label="Completed journey stages">
                    <?php foreach ($missions['stages'] as $stage): ?>
                      <li class="missions-complete-stage">
                        <span class="missions-complete-stage-icon"><?= koobdMissionStageIcon((int)$stage['number'], $isTeacher) ?></span>
                        <span class="missions-complete-stage-copy">
                          <strong><?= htmlspecialchars($stage['title']) ?></strong>
                          <span><?= (int)$stage['completed_missions'] ?> of <?= (int)$stage['total_missions'] ?> tasks</span>
                        </span>
                        <span class="missions-complete-stage-done">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
                          Done
                        </span>
                      </li>
                    <?php endforeach; ?>
                  </ol>
                </div>
              <?php endif; ?>
              <ol class="missions-list" id="missionsList">
                <?php foreach ($journeyMissions as $mission): ?>
                  <?php $isNextMission = $missions['next'] && $missions['next']['key'] === $mission['key']; ?>
                  <li class="mission-item<?= $mission['completed'] ? ' is-complete' : '' ?><?= $mission['locked'] ? ' is-locked' : '' ?><?= $isNextMission ? ' is-next' : '' ?>">
                    <span class="mission-status" aria-hidden="true">
                      <?php if ($mission['status'] === 'completed'): ?>
                        <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>
                      <?php elseif ($mission['status'] === 'locked'): ?>
                        <svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                      <?php else: ?>
                        <?= (int)$mission['number'] ?>
                      <?php endif; ?>
                    </span>
                    <div class="mission-copy">
                      <?php if (!$mission['locked']): ?><a href="<?= htmlspecialchars($mission['completed'] ? $mission['href'] : $missionJourneyHref($mission)) ?>" class="mission-title"><?= htmlspecialchars($mission['title']) ?></a><?php else: ?><span class="mission-title"><?= htmlspecialchars($mission['title']) ?></span><?php endif; ?>
                      <?php if ($mission['locked']): ?><p><?= htmlspecialchars($mission['lock_reason']) ?></p><?php elseif ($isTeacher): ?><p><?= htmlspecialchars($mission['description']) ?></p><?php endif; ?>
                    </div>
                    <?php if ($isNextMission): ?>
                      <span class="mission-state is-next"><?= $isTeacher ? 'Next' : 'Up next' ?></span>
                    <?php elseif ($mission['status'] === 'completed'): ?>
                      <span class="mission-state">Done</span>
                    <?php elseif ($mission['status'] === 'locked'): ?>
                      <span class="mission-state"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>Locked</span>
                    <?php elseif (!empty($mission['is_optional'])): ?>
                      <span class="mission-state">Optional</span>
                    <?php endif; ?>
                  </li>
                <?php endforeach; ?>
              </ol>
              <?php if (count($journeyMissions) > 1): ?>
                <div class="missions-actions">
                  <button class="missions-toggle" type="button" aria-expanded="false" aria-controls="missionsList">
                    <span>See more</span>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
                  </button>
                </div>
              <?php endif; ?>
            </section>

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
  <script src="<?= koobdAsset('js/classroom-social.js') ?>"></script>
  <script src="<?= koobdAsset('js/home-banner.js') ?>"></script>
  <script src="<?= koobdAsset('js/home-search.js') ?>"></script>
  <script src="<?= koobdAsset('js/story-shelf.js') ?>"></script>
  <script src="<?= koobdAsset('js/story-details.js') ?>"></script>
  <script src="<?= koobdAsset('js/missions.js') ?>"></script>
</body>
</html>
