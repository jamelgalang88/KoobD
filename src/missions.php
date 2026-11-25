<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/missions_lib.php';

$user = koobdRequireAuth(true);
$username = (string)$user['username'];
$profile = koobdResolvedProfile($user);
$isTeacher = koobdIsTeacher($user);
$classroomPath = 'classroom.php';
$profileEditPath = 'profile.php';
$missions = koobdMissionOverview($user);
$missionCount = count($missions['missions']);
$journeyHref = static function (string $href, string $missionKey, bool $replay = false): string {
    $fragment = '';
    $hashAt = strpos($href, '#');
    if ($hashAt !== false) {
        $fragment = substr($href, $hashAt);
        $href = substr($href, 0, $hashAt);
    }
    $query = ['mission_tutorial' => $missionKey];
    if ($replay) {
        $query['tutorial_replay'] = '1';
    }
    return $href . (strpos($href, '?') === false ? '?' : '&') . http_build_query($query) . $fragment;
};
$counts = ['completed' => 0, 'progress' => 0, 'locked' => 0, 'available' => 0];
foreach ($missions['missions'] as $mission) {
    $filterKey = $mission['status'] === 'in_progress' ? 'progress' : $mission['status'];
    $counts[$filterKey]++;
}
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
  <title>KoobD - <?= htmlspecialchars($missions['journey_title']) ?></title>
  <link rel="stylesheet" href="<?= koobdAsset('css/app.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/whats-new.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/missions.css') ?>">
  <link rel="icon" type="image/png" href="assets/images/icons/favicon.png">
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#f3f8ff">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <link rel="apple-touch-icon" href="assets/images/icons/app/apple-touch-icon.png">
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
</head>
<body class="app-bg whats-new-page missions-page <?= $isTeacher ? 'is-teacher' : 'is-student' ?>">
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-inner">
        <div class="sidebar-top">
          <div class="sidebar-brand-mark"><img src="assets/images/logos/logo.png" alt="KoobD"></div>
          <div class="sidebar-brand-text">KoobD</div>
          <div class="sidebar-divider"></div>
          <nav class="sidebar-nav" aria-label="Main navigation">
            <a href="home.php" class="sidebar-link" aria-label="Home"><div class="sidebar-icon-box"><img src="assets/images/icons/HOME 1.png" alt=""></div></a>
            <a href="<?= htmlspecialchars($classroomPath) ?>" class="sidebar-link" aria-label="Classroom"><div class="sidebar-icon-box"><img src="assets/images/icons/classroom 1.png" alt=""></div></a>
            <a href="teacher_stories.php" class="sidebar-link sidebar-link-stories" aria-label="My Stories">
              <div class="sidebar-icon-box"><svg class="sidebar-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H19v-5"/><path d="M8.5 7.5h6M8.5 11h4"/></svg></div>
            </a>
            <?php include __DIR__ . '/sidebar_approve_stories.php'; ?>
            <?php include __DIR__ . '/sidebar_last_read.php'; ?>
            <a href="versus.php" class="sidebar-link sidebar-link-versus" aria-label="Versus Mode">
              <div class="sidebar-icon-box"><svg class="sidebar-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 6h9A5.5 5.5 0 0 1 22 11.5v1.5a4 4 0 0 1-7.2 2.4L14 14.5h-4l-.8.9A4 4 0 0 1 2 13v-1.5A5.5 5.5 0 0 1 7.5 6z"/><path d="M6 10v4M4 12h4"/><circle cx="16" cy="11" r=".6"/><circle cx="18" cy="13" r=".6"/></svg></div>
            </a>
            <a href="create_story.php" class="sidebar-link sidebar-link-add" aria-label="Create story"><div class="sidebar-icon-box sidebar-icon-add">+</div></a>
          </nav>
        </div>
        <div class="sidebar-bottom">
          <div class="sidebar-account sidebar-profile-menu">
            <button type="button" class="sidebar-profile-link" aria-haspopup="true" aria-expanded="false" aria-controls="sidebarProfileMenu" aria-label="Profile menu" title="Profile">
              <span class="sidebar-profile-card" style="--profile-top:<?= htmlspecialchars($profile['top']) ?>; --profile-bottom:<?= htmlspecialchars($profile['bottom']) ?>; --profile-accent:<?= htmlspecialchars($profile['accent']) ?>;">
                <span class="sidebar-profile-avatar"><img src="<?= htmlspecialchars($profile['asset']) ?>" alt="<?= htmlspecialchars($profile['name']) ?>"></span>
                <span class="sidebar-profile-name" translate="no"><?= htmlspecialchars($profile['name']) ?></span>
              </span>
              <span class="sidebar-user-text"><?= htmlspecialchars($username) ?></span>
            </button>
            <span class="sidebar-profile-visible-name" translate="no"><?= htmlspecialchars($profile['name']) ?></span>
            <div class="sidebar-profile-popover" id="sidebarProfileMenu" hidden>
              <a href="<?= htmlspecialchars($profileEditPath) ?>" class="sidebar-profile-menu-item"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg><span>My Profile</span></a>
              <form action="logout.php" method="post" class="sidebar-menu-logout-form"><button type="submit" class="sidebar-profile-menu-item is-logout"><img src="assets/images/icons/LOGOUT 1.png" alt=""><span>Log out</span></button></form>
            </div>
          </div>
        </div>
      </div>
    </aside>
    <main class="main">
      <div class="main-inner wn-main missions-page-content">
        <header class="wn-header">
          <a class="wn-back" href="home.php#goalsMissions"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>Home</span></a>
          <h1 class="wn-title"><?= htmlspecialchars($missions['journey_title']) ?></h1>
          <p class="wn-subtitle"><?= $isTeacher ? 'A practical guide to classroom tools, learning activities, and student support.' : 'Your next adventure starts with one small step.' ?></p>
        </header>

        <section class="missions-page-summary<?= $isTeacher ? ' is-teacher' : ' is-student' ?>" aria-label="<?= htmlspecialchars($missions['journey_title']) ?> progress">
          <?php if ($isTeacher): ?>
            <div class="journey-summary-heading">
              <span class="journey-summary-icon"><?= koobdMissionStageIcon((int)($missions['current_stage']['number'] ?? 1), true) ?></span>
              <div>
                <span class="journey-summary-label">Current focus</span>
                <strong><?= $missions['current_stage'] ? htmlspecialchars($missions['current_stage']['title']) : 'Journey complete' ?></strong>
                <span class="journey-summary-next"><?= $missions['next'] ? 'Next task: ' . htmlspecialchars($missions['next']['title']) : 'All required tasks are complete.' ?></span>
              </div>
              <span class="journey-summary-percent"><?= (int)$missions['percentage'] ?>%</span>
            </div>
          <?php else: ?>
            <div class="journey-flowerguide">
              <img src="<?= koobdAsset('assets/images/showcase/flowergirl.png') ?>" alt="Flowergirl">
              <div class="journey-flowerguide-bubble">
                <span>Flowergirl says</span>
                <strong><?= $missions['next'] ? 'Ready for your next step?' : 'You finished your journey!' ?></strong>
                <p><?= $missions['next'] ? 'Pick a mission and I’ll guide you along the way.' : 'You explored every part of your learning adventure.' ?></p>
              </div>
              <?php if ($missions['next']): ?>
                <a class="journey-start-button" href="<?= htmlspecialchars($journeyHref($missions['next']['href'], $missions['next']['key'])) ?>">
                  Start next mission
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                </a>
              <?php endif; ?>
            </div>
          <?php endif; ?>
          <div class="missions-page-progress">
            <div class="missions-page-progress-copy">
              <?php if ($isTeacher): ?>
                <strong><?= (int)$missions['completed'] ?> of <?= (int)$missions['total'] ?> required tasks complete</strong>
                <span><?= (int)$missions['percentage'] ?>% complete</span>
              <?php else: ?>
                <strong>Your journey</strong>
                <span><?= (int)$missions['completed'] ?> / <?= (int)$missions['total'] ?> missions</span>
              <?php endif; ?>
            </div>
            <div class="missions-page-progress-track" role="progressbar" aria-label="Overall journey progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="<?= (int)$missions['percentage'] ?>"><span style="width:<?= (int)$missions['percentage'] ?>%"></span></div>
          </div>
        </section>

        <div class="wn-filters missions-page-filters" role="group" aria-label="Filter journey missions">
          <button type="button" class="wn-filter" data-filter="all" aria-pressed="true">All <span class="wn-filter-count"><?= $missionCount ?></span></button>
          <button type="button" class="wn-filter" data-filter="progress" aria-pressed="false">In progress <span class="wn-filter-count"><?= $counts['progress'] ?></span></button>
          <button type="button" class="wn-filter" data-filter="available" aria-pressed="false">Available <span class="wn-filter-count"><?= $counts['available'] ?></span></button>
          <button type="button" class="wn-filter" data-filter="completed" aria-pressed="false">Completed <span class="wn-filter-count"><?= $counts['completed'] ?></span></button>
          <button type="button" class="wn-filter" data-filter="locked" aria-pressed="false">Locked <span class="wn-filter-count"><?= $counts['locked'] ?></span></button>
        </div>

        <ol class="journey-stage-list<?= $isTeacher ? ' is-teacher' : ' is-student' ?>" aria-label="Journey stages">
          <?php foreach ($missions['stages'] as $stageIndex => $stage): ?>
            <?php
              $stageStatusLabel = [
                  'completed' => 'Completed',
                  'in_progress' => $isTeacher ? 'In progress' : 'Your level',
                  'locked' => 'Locked',
              ][$stage['status']];
              $stageOpen = $stage['status'] === 'in_progress';
            ?>
            <li class="journey-stage-item is-<?= htmlspecialchars($stage['status']) ?><?= $stage['locked'] ? ' is-locked' : '' ?>" data-stage="<?= (int)$stage['number'] ?>">
              <details class="journey-stage"<?= $stageOpen ? ' open' : '' ?>>
                <summary class="journey-stage-heading">
                  <span class="journey-stage-art" aria-hidden="true">
                    <span class="journey-stage-icon"><?= koobdMissionStageIcon((int)$stage['number'], $isTeacher) ?></span>
                    <span class="journey-stage-number">
                      <?php if ($stage['status'] === 'completed'): ?>
                        <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>
                      <?php elseif ($stage['status'] === 'locked'): ?>
                        <svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                      <?php else: ?>
                        <?= (int)$stage['number'] ?>
                      <?php endif; ?>
                    </span>
                  </span>
                  <span class="journey-stage-main">
                    <span class="journey-stage-eyebrow">Stage <?= (int)$stage['number'] ?> of 5 · <?= htmlspecialchars($stageStatusLabel) ?></span>
                    <span class="journey-stage-title"><?= htmlspecialchars($stage['title']) ?></span>
                    <span class="journey-stage-description"><?= htmlspecialchars($stage['description']) ?></span>
                    <span class="journey-stage-progress-copy"><?= $isTeacher ? (int)$stage['progress'] . '% complete · ' . (int)$stage['completed_missions'] . '/' . (int)$stage['total_missions'] . ' tasks' : (int)$stage['completed_missions'] . '/' . (int)$stage['total_missions'] . ' missions' ?></span>
                    <span class="journey-stage-progress" role="progressbar" aria-label="Stage <?= (int)$stage['number'] ?> progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="<?= (int)$stage['progress'] ?>">
                      <span style="width:<?= (int)$stage['progress'] ?>%"></span>
                    </span>
                    <?php if ($stage['status'] === 'completed'): ?>
                      <span class="journey-stage-reward"><?= $isTeacher ? 'Stage complete' : '★ Stage cleared!' ?></span>
                    <?php elseif ($stage['status'] === 'in_progress' && !$isTeacher): ?>
                      <span class="journey-stage-reward is-next">Your next level</span>
                    <?php endif; ?>
                  </span>
                  <span class="journey-stage-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span>
                </summary>
                <div class="journey-stage-content">
                  <p class="journey-stage-objective"><strong><?= $isTeacher ? 'Objective' : 'Your goal' ?>:</strong> <?= htmlspecialchars($stage['objective']) ?></p>
                  <?php if (!empty($stage['unlocks'])): ?>
                    <p class="journey-stage-unlocks"><strong>Progression:</strong> <?= htmlspecialchars(implode(' · ', $stage['unlocks'])) ?></p>
                  <?php endif; ?>
                  <?php if ($stage['locked']): ?>
                    <p class="journey-stage-lock-note"><?= htmlspecialchars($stage['lock_reason']) ?></p>
                  <?php endif; ?>
                  <ol class="journey-mission-list">
                    <?php foreach ($stage['missions'] as $mission): ?>
                      <?php
                        $status = $mission['status'] === 'in_progress' ? 'progress' : $mission['status'];
                        $statusLabel = [
                            'completed' => 'Completed',
                            'locked' => 'Locked',
                            'progress' => 'In progress',
                            'available' => !empty($mission['is_optional']) ? 'Optional' : 'Available',
                        ][$status];
                      ?>
                      <li class="journey-mission-item" data-type="<?= htmlspecialchars($status) ?>">
                        <article class="journey-mission-card is-<?= htmlspecialchars($status) ?><?= $missions['next'] && $missions['next']['key'] === $mission['key'] ? ' is-next' : '' ?>">
                          <span class="journey-mission-status" aria-hidden="true">
                            <?php if ($status === 'completed'): ?>
                              <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>
                            <?php elseif ($status === 'locked'): ?>
                              <svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                            <?php elseif ($status === 'progress'): ?>
                              <svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7v5l3 2"/></svg>
                            <?php else: ?>
                              <?= (int)$mission['number'] ?>
                            <?php endif; ?>
                          </span>
                          <div class="journey-mission-body">
                            <div class="journey-mission-meta">
                              <span class="mission-page-badge"><?= htmlspecialchars($statusLabel) ?></span>
                              <?php if ($missions['next'] && $missions['next']['key'] === $mission['key']): ?><span class="journey-next-label"><?= $isTeacher ? 'Recommended next task' : 'Up next!' ?></span><?php endif; ?>
                              <?php if (!empty($mission['is_optional'])): ?><span class="journey-optional-label">Optional</span><?php endif; ?>
                            </div>
                            <h2 class="journey-mission-title"><?= htmlspecialchars($mission['title']) ?></h2>
                            <p class="journey-mission-description"><?= htmlspecialchars($mission['description']) ?></p>
                            <details class="journey-mission-guide">
                              <summary><?= $isTeacher ? 'Task details and completion criteria' : 'Mission guide and requirements' ?></summary>
                              <dl class="journey-mission-details">
                                <div><dt><?= $isTeacher ? 'Action' : 'What to do' ?></dt><dd><?= htmlspecialchars($mission['instruction']) ?></dd></div>
                                <div><dt>Where to go</dt><dd><?= htmlspecialchars($mission['location']) ?></dd></div>
                                <div><dt><?= $isTeacher ? 'Completion criteria' : 'How to complete' ?></dt><dd><?= htmlspecialchars($mission['requirement']) ?></dd></div>
                                <div><dt><?= $isTeacher ? 'Purpose' : 'Why it matters' ?></dt><dd><?= htmlspecialchars($mission['benefit']) ?></dd></div>
                                <div><dt>What comes next</dt><dd><?= htmlspecialchars($mission['unlocks']) ?></dd></div>
                              </dl>
                            </details>
                            <?php if ($status === 'locked'): ?>
                              <p class="journey-lock-reason"><strong>Locked:</strong> <?= htmlspecialchars($mission['lock_reason']) ?></p>
                            <?php else: ?>
                              <div class="wn-card-actions">
                                <a class="wn-btn mission-page-action<?= $missions['next'] && $missions['next']['key'] === $mission['key'] ? ' is-start' : '' ?>" href="<?= htmlspecialchars($status === 'completed' ? $mission['href'] : $journeyHref($mission['href'], $mission['key'])) ?>">
                                  <?= $status === 'completed' ? 'Review feature' : ($isTeacher ? 'Open task' : 'Start mission') ?>
                                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                                </a>
                                <?php if ($status === 'completed'): ?>
                                  <a class="wn-btn mission-page-action is-replay" href="<?= htmlspecialchars($journeyHref($mission['href'], $mission['key'], true)) ?>">Replay Flowergirl guide</a>
                                <?php endif; ?>
                              </div>
                            <?php endif; ?>
                          </div>
                        </article>
                      </li>
                    <?php endforeach; ?>
                  </ol>
                </div>
              </details>
            </li>
          <?php endforeach; ?>
        </ol>
        <p class="wn-empty" id="missionsFilterEmpty" hidden>No missions match this status.</p>
      </div>
    </main>
  </div>
  <script>
    window.KOOBD_SESSION = <?= json_encode(['role' => $isTeacher ? 'teacher' : 'student', 'userId' => (int)$user['id'], 'username' => $username]) ?>;
  </script>
  <script src="<?= koobdAsset('js/sidebar.js') ?>"></script>
  <script src="<?= koobdAsset('js/missions-page.js') ?>"></script>
</body>
</html>
