<?php
// Minigames (profile menu > Minigames, and the banner on the profile page): a
// card for each game, with the player's best score.
require_once('minigames_lib.php');
$user = koobdRequireAuth(true);
koobdMissionRequireFeature($user, 'minigames');
$username = $user['username'];
$profile = koobdResolvedProfile($user);
$classroomPath = 'classroom.php';
$profileEditPath = 'profile.php';
$sidebarActive = '';
$isTeacher = koobdIsTeacher($user);
$gameProgress = koobdMinigameProgress($user);
$totalPlays = array_sum(array_column($gameProgress, 'plays'));
$unlockedCount = count(array_filter($gameProgress, static fn($game) => $game['unlocked']));
$lockedGame = (string)($_GET['locked'] ?? '');
$lockedGameState = isset($gameProgress[$lockedGame]) && !$gameProgress[$lockedGame]['unlocked']
    ? $gameProgress[$lockedGame]
    : null;

function koobdMinigameCardProgressMarkup(array $state, bool $isTeacher): string
{
    $unlocked = $state['unlocked'];
    $percent = (int)$state['progress_percent'];
    $required = $state['requirement_score'];
    $statusClass = $unlocked ? 'is-available' : 'is-locked';
    $statusLabel = $unlocked ? ($isTeacher ? 'Available' : 'Unlocked') : 'Locked';
    $detail = '';
    $progress = '';

    if ($isTeacher) {
        $detail = 'Available to play.';
    } elseif ($unlocked && $required === null) {
        $detail = 'Final minigame in the progression.';
    } elseif ($unlocked) {
        $detail = $state['requirement_met']
            ? $state['next_title'] . ' unlocked.'
            : 'Score at least ' . $required . ' points to unlock ' . $state['next_title'] . '.';
        $progress = '<div class="mg-progress-track" role="progressbar" aria-label="Progress toward unlocking ' .
            htmlspecialchars((string)$state['next_title'], ENT_QUOTES, 'UTF-8') . '" aria-valuemin="0" aria-valuemax="' .
            (int)$required . '" aria-valuenow="' . min((int)$required, (int)$state['best']) . '">' .
            '<i style="width:' . $percent . '%"></i></div><small class="mg-progress-score">Best: ' .
            (int)$state['best'] . ' / ' . (int)$required . ' points</small>';
    } else {
        $detail = 'Score at least ' . $required . ' points in ' . $state['gate_title'] . ' to unlock ' . $state['title'] . '.';
        if ($state['gate_best'] >= $required) {
            $detail = 'Replay ' . $state['gate_title'] . ' and score at least ' . $required . ' points to unlock this game.';
        }
        $progress = '<div class="mg-progress-track" role="progressbar" aria-label="Unlock progress for ' .
            htmlspecialchars((string)$state['title'], ENT_QUOTES, 'UTF-8') . '" aria-valuemin="0" aria-valuemax="' .
            (int)$required . '" aria-valuenow="' . min((int)$required, (int)$state['gate_best']) . '">' .
            '<i style="width:' . $percent . '%"></i></div><small class="mg-progress-score">' .
            (int)$state['gate_best'] . ' / ' . (int)$required . ' points in ' .
            htmlspecialchars((string)$state['gate_title'], ENT_QUOTES, 'UTF-8') . '</small>';
    }

    $statusIcon = $unlocked
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4 4L19 6"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>';
    $bestText = $state['plays'] > 0
        ? '<span>Best</span> <strong>' . (int)$state['best'] . '</strong>'
        : '<span>Not played yet</span>';
    $playControl = $unlocked
        ? '<a class="mg-btn mg-btn-accent" href="' . htmlspecialchars((string)$state['href'], ENT_QUOTES, 'UTF-8') . '">Play<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>'
        : '<span class="mg-btn mg-btn-locked" aria-disabled="true"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>Locked</span>';

    return '<div class="mg-card-progression"><div class="mg-card-state ' . $statusClass . '">' .
        $statusIcon . '<strong>' . $statusLabel . '</strong></div>' .
        ($progress ? '<div class="mg-card-progress">' . $progress . '</div>' : '') .
        '<p class="mg-card-requirement">' . htmlspecialchars($detail, ENT_QUOTES, 'UTF-8') . '</p></div>' .
        '<div class="mg-card-foot"><span class="mg-best"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 01-8 0zM8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v4M8.5 20h7M10 17h4"/></svg>' .
        $bestText . '</span><span class="mg-run-count">' . (int)$state['plays'] . ' runs</span>' . $playControl . '</div>';
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
  <title>KoobD - Minigames</title>
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
      <div class="main-inner mg">
        <nav class="mg-nav" aria-label="Back">
          <a class="mg-back" href="profile.php"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>My Profile</a>
        </nav>
        <?php if ($lockedGameState): ?>
          <?php $gate = koobdMinigameCatalog()[$lockedGameState['gate_game']]; ?>
          <aside class="mg-lock-notice" role="status">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>
            <div>
              <strong><?= htmlspecialchars($lockedGameState['title'], ENT_QUOTES, 'UTF-8') ?> is locked</strong>
              <p>Score at least <?= (int)$lockedGameState['requirement_score'] ?> points in <?= htmlspecialchars($lockedGameState['gate_title'], ENT_QUOTES, 'UTF-8') ?> to unlock it.</p>
            </div>
            <a class="mg-btn mg-btn-ghost" href="<?= htmlspecialchars($gate['href'], ENT_QUOTES, 'UTF-8') ?>">Play <?= htmlspecialchars($lockedGameState['gate_title'], ENT_QUOTES, 'UTF-8') ?></a>
          </aside>
        <?php endif; ?>
        <header class="mg-hub-head">
          <div>
            <h1 class="mg-title">Minigames</h1>
            <p class="mg-sub">Meet each score goal to unlock the next learning challenge.</p>
          </div>
          <dl class="mg-hub-stats">
            <div><dt>Minigames unlocked</dt><dd><?= $unlockedCount ?> of 6</dd></div>
            <div><dt>Challenges completed</dt><dd><?= $totalPlays ?></dd></div>
          </dl>
        </header>

        <section class="mg-journey" aria-label="Minigame progression">
          <div class="mg-journey-head">
            <div>
              <h2>Progression</h2>
              <p><?= $unlockedCount === count(KOOBD_MINIGAMES) ? 'All minigames are unlocked!' : 'Complete the score challenge in your available minigame to advance.' ?></p>
            </div>
            <strong><?= (int)round(($unlockedCount / count(KOOBD_MINIGAMES)) * 100) ?>%</strong>
          </div>
          <div class="mg-journey-overall" role="progressbar" aria-label="Overall minigame unlock progress" aria-valuemin="0" aria-valuemax="6" aria-valuenow="<?= $unlockedCount ?>">
            <i style="width:<?= (int)round(($unlockedCount / count(KOOBD_MINIGAMES)) * 100) ?>%"></i>
          </div>
          <ol class="mg-stage-track">
            <?php foreach (array_values($gameProgress) as $index => $state): ?>
              <?php $stageClass = $state['unlocked'] ? 'is-unlocked' : ($index === $unlockedCount ? 'is-next' : 'is-locked'); ?>
              <li class="<?= $stageClass ?>" title="<?= htmlspecialchars($state['title'], ENT_QUOTES, 'UTF-8') ?>"<?= $stageClass === 'is-next' ? ' aria-current="step"' : '' ?>>
                <span class="mg-stage-dot"><?= $state['unlocked'] ? '✓' : $index + 1 ?></span>
                <span class="mg-stage-name"><?= htmlspecialchars($state['title'], ENT_QUOTES, 'UTF-8') ?></span>
              </li>
            <?php endforeach; ?>
          </ol>
        </section>

        <div class="mg-cards">
          <article class="mg-card wc<?= $gameProgress['wordcatch']['unlocked'] ? '' : ' is-locked' ?>">
            <svg class="mg-card-art" viewBox="0 0 400 200" role="img" aria-label="Words falling from a blue sky">
              <defs><linearGradient id="mgA1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f9fe6"/><stop offset="1" stop-color="#c8e9fb"/></linearGradient></defs>
              <rect width="400" height="200" fill="url(#mgA1)"/>
              <circle cx="338" cy="42" r="30" fill="#ffd65c" fill-opacity=".3"/><circle cx="338" cy="42" r="20" fill="#ffd65c"/>
              <g fill="#fff" fill-opacity=".8"><ellipse cx="66" cy="42" rx="34" ry="11"/><ellipse cx="88" cy="34" rx="22" ry="11"/><ellipse cx="226" cy="28" rx="26" ry="8"/></g>
              <path d="M0 160C80 136 170 140 250 156s110 8 150-6v50H0z" fill="#87d39b"/><path d="M0 176c100-14 190-12 280-2s90 2 120-6v32H0z" fill="#53b476"/>
              <g font-family="Segoe UI,system-ui,sans-serif" font-size="17" font-weight="700" text-anchor="middle">
                <g transform="rotate(-6 88 92)"><rect x="50" y="74" width="76" height="36" rx="10" fill="#fff"/><text x="88" y="98" fill="#172033">apple</text></g>
                <g transform="rotate(5 200 70)"><rect x="168" y="52" width="64" height="36" rx="10" fill="#12875a"/><text x="200" y="76" fill="#fff">aso</text></g>
                <g transform="rotate(-4 306 106)"><rect x="272" y="88" width="68" height="36" rx="10" fill="#fff"/><text x="306" y="112" fill="#172033">pula</text></g>
                <g transform="rotate(5 182 128)"><rect x="150" y="110" width="64" height="36" rx="10" fill="#fff"/><text x="182" y="134" fill="#172033">run</text></g>
              </g>
            </svg>
            <div class="mg-card-body">
              <span class="mg-tag">Vocabulary</span>
              <h2>Word Catch</h2>
              <p>Tap the falling words that match the target before they land.</p>
              <?= koobdMinigameCardProgressMarkup($gameProgress['wordcatch'], $isTeacher) ?>
            </div>
          </article>
          <article class="mg-card fs<?= $gameProgress['fixstory']['unlocked'] ? '' : ' is-locked' ?>">
            <svg class="mg-card-art" viewBox="0 0 400 200" role="img" aria-label="A story page with a mistake circled in red">
              <rect width="400" height="200" fill="#fde3db"/><circle cx="40" cy="30" r="56" fill="#fbd0c4"/><circle cx="372" cy="180" r="62" fill="#fbd0c4"/>
              <g transform="rotate(-3 200 104)">
                <rect x="96" y="24" width="208" height="158" rx="10" fill="#fffdf8" stroke="#ede6d6" stroke-width="1.5"/>
                <path d="M118 24v158" stroke="#f3c3b9" stroke-width="1.5"/>
                <g fill="#ddd5c4"><rect x="130" y="46" width="156" height="7" rx="3.500"/><rect x="130" y="72" width="34" height="7" rx="3.500"/><rect x="238" y="72" width="48" height="7" rx="3.500"/><rect x="130" y="98" width="156" height="7" rx="3.500"/><rect x="130" y="124" width="118" height="7" rx="3.500"/><rect x="130" y="150" width="78" height="7" rx="3.500"/></g>
                <text x="202" y="81" font-family="Georgia,serif" font-size="16" font-weight="700" text-anchor="middle" fill="#172033">freind</text>
                <ellipse cx="202" cy="75" rx="33" ry="15" fill="none" stroke="#e4593f" stroke-width="3"/>
              </g>
              <g transform="translate(300 90) rotate(38)"><rect width="15" height="72" rx="2" fill="#e4593f"/><rect width="15" height="11" rx="2" fill="#f7b6a8"/><path d="M0 72h15l-7.500 17z" fill="#f4d7ae"/><path d="M5 83h5l-2.500 6z" fill="#172033"/></g>
            </svg>
            <div class="mg-card-body">
              <span class="mg-tag">Grammar and spelling</span>
              <h2>Fix the Story</h2>
              <p>Find the mistakes in a short story and fix them.</p>
              <?= koobdMinigameCardProgressMarkup($gameProgress['fixstory'], $isTeacher) ?>
            </div>
          </article>
          <article class="mg-card hh<?= $gameProgress['hinthunt']['unlocked'] ? '' : ' is-locked' ?>">
            <svg class="mg-card-art" viewBox="0 0 400 200" role="img" aria-label="A magnifying glass over a hint">
              <rect width="400" height="200" fill="#e9e2fb"/><circle cx="360" cy="28" r="58" fill="#dad0f8"/><circle cx="30" cy="186" r="52" fill="#dad0f8"/>
              <g fill="#b6a4ea"><rect x="72" y="42" width="178" height="8" rx="4"/><rect x="72" y="62" width="132" height="8" rx="4"/><rect x="72" y="82" width="160" height="8" rx="4"/></g>
              <g font-family="Segoe UI,system-ui,sans-serif" font-size="16" font-weight="700" text-anchor="middle">
                <rect x="62" y="122" width="84" height="38" rx="10" fill="#fff"/><text x="104" y="146" fill="#172033">moon</text>
                <rect x="158" y="122" width="84" height="38" rx="10" fill="#6d45cf"/><text x="200" y="146" fill="#fff">sun</text>
                <rect x="254" y="122" width="84" height="38" rx="10" fill="#fff"/><text x="296" y="146" fill="#172033">rain</text>
              </g>
              <circle cx="288" cy="64" r="27" fill="#fff" fill-opacity=".7" stroke="#6d45cf" stroke-width="6"/><path d="M308 84l22 22" stroke="#6d45cf" stroke-width="9" stroke-linecap="round"/>
            </svg>
            <div class="mg-card-body">
              <span class="mg-tag">Word meanings</span>
              <h2>Hint Hunt</h2>
              <p>Read the hint and choose the right word before time runs out.</p>
              <?= koobdMinigameCardProgressMarkup($gameProgress['hinthunt'], $isTeacher) ?>
            </div>
          </article>
          <article class="mg-card wp2<?= $gameProgress['wordpairs']['unlocked'] ? '' : ' is-locked' ?>">
            <svg class="mg-card-art" viewBox="0 0 400 200" role="img" aria-label="Cards matching the words dog and aso">
              <rect width="400" height="200" fill="#d6f2e4"/><circle cx="40" cy="28" r="54" fill="#bfead5"/><circle cx="370" cy="178" r="58" fill="#bfead5"/>
              <g font-family="Segoe UI,system-ui,sans-serif" font-weight="700" text-anchor="middle">
                <g transform="rotate(-8 92 100)"><rect x="52" y="48" width="80" height="104" rx="12" fill="#12875a"/><path d="M92 84l16 16-16 16-16-16z" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.500"/></g>
                <g transform="rotate(-3 168 100)"><rect x="128" y="48" width="80" height="104" rx="12" fill="#fff" stroke="#12875a" stroke-width="2.500"/><text x="168" y="92" font-size="11" fill="#8a93a6">EN</text><text x="168" y="114" font-size="20" fill="#172033">dog</text></g>
                <g transform="rotate(4 240 100)"><rect x="200" y="48" width="80" height="104" rx="12" fill="#fff" stroke="#12875a" stroke-width="2.500"/><text x="240" y="92" font-size="11" fill="#8a93a6">TL</text><text x="240" y="114" font-size="20" fill="#172033">aso</text></g>
                <g transform="rotate(9 316 100)"><rect x="276" y="48" width="80" height="104" rx="12" fill="#12875a"/><path d="M316 84l16 16-16 16-16-16z" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.500"/></g>
              </g>
            </svg>
            <div class="mg-card-body">
              <span class="mg-tag">English and Tagalog</span>
              <h2>Word Pairs</h2>
              <p>Turn over cards to match each English word with its Tagalog word.</p>
              <?= koobdMinigameCardProgressMarkup($gameProgress['wordpairs'], $isTeacher) ?>
            </div>
          </article>
          <article class="mg-card lm<?= $gameProgress['lettermix']['unlocked'] ? '' : ' is-locked' ?>">
            <svg class="mg-card-art" viewBox="0 0 400 200" role="img" aria-label="Mixed-up letter tiles">
              <rect width="400" height="200" fill="#fdefc9"/><circle cx="370" cy="24" r="54" fill="#fbe2a4"/><circle cx="26" cy="180" r="54" fill="#fbe2a4"/>
              <g font-family="Segoe UI,system-ui,sans-serif" font-size="27" font-weight="700" text-anchor="middle" fill="#172033">
                <g transform="rotate(-9 92 74)"><rect x="66" y="48" width="52" height="52" rx="11" fill="#fff"/><text x="92" y="84">T</text></g>
                <g transform="rotate(7 168 90)"><rect x="142" y="64" width="52" height="52" rx="11" fill="#fff"/><text x="168" y="100">S</text></g>
                <g transform="rotate(-5 240 64)"><rect x="214" y="38" width="52" height="52" rx="11" fill="#ffc53d"/><text x="240" y="74">R</text></g>
                <g transform="rotate(10 314 88)"><rect x="288" y="62" width="52" height="52" rx="11" fill="#fff"/><text x="314" y="98">A</text></g>
              </g>
              <g fill="#c17f00"><rect x="112" y="150" width="38" height="5" rx="2.500"/><rect x="160" y="150" width="38" height="5" rx="2.500"/><rect x="208" y="150" width="38" height="5" rx="2.500"/><rect x="256" y="150" width="38" height="5" rx="2.500"/></g>
            </svg>
            <div class="mg-card-body">
              <span class="mg-tag">Spelling</span>
              <h2>Letter Mix</h2>
              <p>Tap the mixed-up letters in order to spell the word.</p>
              <?= koobdMinigameCardProgressMarkup($gameProgress['lettermix'], $isTeacher) ?>
            </div>
          </article>
          <article class="mg-card sb<?= $gameProgress['sentence']['unlocked'] ? '' : ' is-locked' ?>">
            <svg class="mg-card-art" viewBox="0 0 400 200" role="img" aria-label="Word tiles forming a sentence">
              <rect width="400" height="200" fill="#d3f0f2"/><circle cx="44" cy="26" r="56" fill="#bbe6e9"/><circle cx="368" cy="178" r="58" fill="#bbe6e9"/>
              <rect x="44" y="46" width="312" height="52" rx="12" fill="#fff" stroke="#0e8490" stroke-width="1.500" stroke-dasharray="6 5"/>
              <g font-family="Segoe UI,system-ui,sans-serif" font-size="16" font-weight="700" text-anchor="middle">
                <rect x="56" y="56" width="58" height="32" rx="8" fill="#0e8490"/><text x="85" y="77" fill="#fff">The</text>
                <rect x="120" y="56" width="58" height="32" rx="8" fill="#0e8490"/><text x="149" y="77" fill="#fff">cat</text>
                <g transform="rotate(-5 110 142)"><rect x="82" y="124" width="56" height="36" rx="8" fill="#fff"/><text x="110" y="148" fill="#172033">is</text></g>
                <g transform="rotate(5 244 138)"><rect x="196" y="120" width="96" height="36" rx="8" fill="#fff"/><text x="244" y="144" fill="#172033">sleeping</text></g>
              </g>
            </svg>
            <div class="mg-card-body">
              <span class="mg-tag">Sentences</span>
              <h2>Sentence Builder</h2>
              <p>Put the word tiles in order to build a correct sentence.</p>
              <?= koobdMinigameCardProgressMarkup($gameProgress['sentence'], $isTeacher) ?>
            </div>
          </article>
        </div>
      </div>
    </main>
  </div>
  <script src="<?= koobdAsset('js/sidebar.js') ?>"></script>
</body>
</html>
