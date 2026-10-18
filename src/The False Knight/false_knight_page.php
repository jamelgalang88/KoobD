<?php
// The False Knight's page. It is served through src/false_knight.php (a
// one-line entry that keeps the story's address the same), so every URL in it
// - css/, js/, "The False Knight/..." - is relative to src/, as before.
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    // Opened directly by its folder path: go through the story's address so
    // the page's relative links resolve.
    header('Location: ../false_knight.php');
    exit();
}
require_once dirname(__DIR__) . '/auth.php';

$user = koobdRequireAuth(true);
$story = koobdStoryMeta('false_knight');
if (!$story || ($story['type'] ?? '') !== 'builtin') {
    header('Location: home.php');
    exit();
}

// Read as a classroom activity (?activity_id=): progress is kept for that
// activity, and its links keep the activity and lead back to the classroom.
$activity = isset($_GET['activity_id']) ? koobdStudentActivity((int)$_GET['activity_id'], (int)$user['id']) : null;
if ($activity && $activity['story_id'] !== $story['id']) {
    $activity = null;
}
$progressContext = $activity ? koobdActivityProgressContext((int)$activity['id']) : 'global';
$activityQuery = $activity ? 'activity_id=' . (int)$activity['id'] . '&' : '';
$exitHref = $activity ? 'classroom_room.php?id=' . (int)$activity['classroom_id'] : 'home.php';

$initialPlayerX = null;
$initialStoryEventIndex = 0;
$initialStorySceneId = null;
// Choose Stage (from the ending): start at the beginning of one stage. The
// story script finds that stage's first event; here it only has to be a
// plain stage id, and the page must not open on the black title card.
$startStage = isset($_GET['stage']) && preg_match('/^[a-z0-9-]{1,40}$/', (string)$_GET['stage'])
    ? (string)$_GET['stage'] : null;
$opensOnTitle = $startStage === null || $startStage === 'field-and-town';
if (isset($_GET['restart'])) {
    // Restart (Home's pop-up or the pause page): from the beginning.
    koobdResetStoryProgress((int)$user['id'], (string)$story['id'], $progressContext);
} elseif (isset($_GET['resume'])) {
    $stmt = $conn->prepare(
        "SELECT progress_state, progress
         FROM story_progress
         WHERE user_id = ? AND story_id = ? AND progress_context = ?
         LIMIT 1"
    );
    $stmt->bind_param('iss', $user['id'], $story['id'], $progressContext);
    $stmt->execute();
    $result = $stmt->get_result();
    $savedProgress = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    if ($savedProgress && (int)$savedProgress['progress'] < 100) {
        $state = json_decode((string)($savedProgress['progress_state'] ?? ''), true);
        if (is_array($state)) {
            if (isset($state['playerX'])) {
                // The player script also clamps this into the saved scene.
                $initialPlayerX = max(0, min(6390, (int)$state['playerX']));
            }
            if (isset($state['storyEventIndex'])) {
                $initialStoryEventIndex = max(0, (int)$state['storyEventIndex']);
            }
            if (isset($state['storySceneId']) && is_string($state['storySceneId'])) {
                $initialStorySceneId = $state['storySceneId'];
            }
        }
    }
}

// Every False Knight asset lives in the story's own folder.
$falseKnightFolder = 'The False Knight';
$falseKnightUrl = static fn(string $path): string => str_replace(' ', '%20', $falseKnightFolder . '/' . $path);
$cubebotAnimationAsset = 'CUBEBOT/cubebot_spritesheet.png';
// Cache-bust the animation sheet the same way the CSS/JS are versioned so the
// browser always loads the current CubeBot sprite art.
$cubebotAnimationVersion = @filemtime(__DIR__ . '/' . $cubebotAnimationAsset) ?: time();
$playerProfile = [
    'name' => 'CubeBot',
    'asset' => $falseKnightUrl('CUBEBOT/CUBEBOT.png') . '?v=' . (@filemtime(__DIR__ . '/CUBEBOT/CUBEBOT.png') ?: time()),
    'animationAsset' => $falseKnightUrl($cubebotAnimationAsset) . '?v=' . $cubebotAnimationVersion,
];
$config = [
    'mode' => 'hardcoded',
    'storyId' => $story['id'],
    'title' => $story['title'],
    'progressContext' => $progressContext,
    'initialPlayerX' => $initialPlayerX,
    'initialStoryEventIndex' => $initialStoryEventIndex,
    'initialStorySceneId' => $initialStorySceneId,
    'playerProfile' => $playerProfile,
    // Back button: KoobD's shared pause page (Continue / Restart / Home), as
    // in every story; Home saves and resumes later (see the player's pausing).
    'confirmExit' => true,
    'restartUrl' => 'false_knight.php?' . $activityQuery . 'restart=1',
    'exitUrl' => $exitHref,
    'userId' => (int)$user['id'],
];
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
  <title><?= htmlspecialchars($story['title'], ENT_QUOTES, 'UTF-8') ?></title>
  <link rel="stylesheet" href="<?= koobdAsset('css/book1.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/story-reader.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/teacher-stories.css') ?>">
  <link rel="icon" type="image/png" href="assets/images/icons/favicon.png">
  <link rel="stylesheet" href="<?= koobdAsset('css/story-shared.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
</head>
<body class="story-page">
  <button id="backHomeBtn" class="top-right story-exit-btn" aria-label="Pause story" title="Pause (Esc)">
    <span class="story-pause-icon" aria-hidden="true"></span>
  </button>

  <?php // A fresh start opens on the title card: black from the first paint. ?>
  <main class="platformer-story-stage koobd-story<?= $initialStoryEventIndex === 0 && $opensOnTitle ? ' is-title-intro' : '' ?>" id="platformerStoryStage">
    <div class="platformer-story-background" id="platformerStoryBackground"></div>
    <div class="platformer-story-world" id="platformerStoryWorld">
      <div class="platformer-story-ground" id="platformerStoryGround"></div>
      <div class="platformer-story-platforms" id="platformerStoryPlatforms"></div>
      <div class="platformer-story-player is-animated" id="platformerStoryPlayer" style="--platformer-player-scale:1" aria-label="CubeBot, player character">
        <img class="platformer-sprite-sheet" alt="" aria-hidden="true">
      </div>
      <div class="platformer-story-npcs" id="platformerStoryNpcs" translate="no"></div>
    </div>
    <div class="platformer-story-hud">
      <span class="teacher-story-player-badge" translate="no"><?= htmlspecialchars($story['title'], ENT_QUOTES, 'UTF-8') ?></span>
      <div class="platformer-story-progress" id="platformerStoryProgress" role="slider" aria-label="Story progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
        <span id="platformerStoryProgressFill"></span>
        <button type="button" id="platformerStoryProgressThumb" aria-label="Navigate story progress"></button>
      </div>
      <span class="platformer-story-mode" id="platformerStoryMode"></span>
    </div>
    <div class="platformer-story-controls" aria-label="Platformer controls">
      <div class="platformer-move-pad">
        <button id="platformerMoveLeft" class="platformer-control" aria-label="Move left">&#8592;</button>
        <button id="platformerMoveRight" class="platformer-control" aria-label="Move right">&#8594;</button>
      </div>
      <div class="platformer-action-pad">
        <button id="platformerChatButton" class="platformer-control chat hidden" aria-label="Talk to nearby character">Chat</button>
        <button id="platformerJumpButton" class="platformer-control jump" aria-label="Jump">&#8593;</button>
      </div>
    </div>
    <div class="platformer-story-dialogue hidden" id="platformerDialogue"></div>
    <div class="ending-screen hidden" id="endingScreen" role="dialog" aria-modal="true" aria-labelledby="endingTitle">
      <div class="ending-content">
        <h1 id="endingTitle">The End</h1>
        <p class="ending-lesson" id="endingLesson" translate="no"><?= htmlspecialchars($story['lesson'], ENT_QUOTES, 'UTF-8') ?></p>
        <div class="ending-buttons">
          <a class="choice-btn blue-btn" href="false_knight.php?<?= htmlspecialchars($activityQuery) ?>restart=1">Play Again</a>
          <button type="button" class="choice-btn gray-btn" id="endingChooseStage">Choose Stage</button>
          <a class="choice-btn gray-btn" href="<?= htmlspecialchars($exitHref) ?>">Home</a>
        </div>
        <div class="ending-stages" id="endingStages" aria-labelledby="endingStagesTitle">
          <p class="ending-stages-title" id="endingStagesTitle">Choose a stage</p>
          <div class="ending-stage-grid" id="endingStageGrid"></div>
          <button type="button" class="ending-stages-back" id="endingStagesBack">&larr; Back</button>
        </div>
      </div>
    </div>
  </main>

  <script>
    window.KOOBD_FALSE_KNIGHT_CONFIG = <?= json_encode($config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  </script>
  <script src="<?= koobdAsset('js/story-orientation.js') ?>"></script>
  <?php
  // The newest time any of the story's art changed: the story adds it to its
  // asset addresses, so browsers always fetch redrawn frames and props.
  $artFiles = array_merge(
      glob(__DIR__ . '/storyboard/*.jpg') ?: [],
      glob(__DIR__ . '/environment/*/*.png') ?: [],
      glob(__DIR__ . '/platforms/tiles/*.png') ?: [],
      glob(__DIR__ . '/*/*.png') ?: []
  );
  $artVersion = $artFiles ? max(array_map('filemtime', $artFiles)) : time();
  ?>
  <script>window.KOOBD_FALSE_KNIGHT_ASSET_VERSION = <?= (int)$artVersion ?>;</script>
  <script src="<?= koobdAsset('The%20False%20Knight/false-knight-story.tl.js') ?>"></script>
  <script src="<?= koobdAsset('The%20False%20Knight/false-knight-story.js') ?>"></script>
  <script src="<?= koobdAsset('js/story-shared.js') ?>"></script>
  <script src="<?= koobdAsset('js/platformer-blocks.js') ?>"></script>
  <script src="<?= koobdAsset('js/platformer-story-player.js') ?>"></script>
  <script>
    const config = {
      ...window.KOOBD_FALSE_KNIGHT_CONFIG,
      platformerWorld: window.KOOBD_FALSE_KNIGHT_STORY.world,
      allowProgressNavigation: false,
      debugHitboxes: false
    };
    // The stages a player can start from: every scene with a story event of
    // its own, starting at its first event.
    const storyWorld = config.platformerWorld;
    const stageStarts = (storyWorld.scenes || []).map((scene) => ({
      scene,
      eventIndex: (storyWorld.storyEvents || []).findIndex((event) =>
        Number(event.x) >= Number(scene.startX) && Number(event.x) < Number(scene.endX)),
    })).filter((stage) => stage.eventIndex >= 0);
    const chosenStage = stageStarts.find((stage) =>
      stage.scene.id === new URLSearchParams(window.location.search).get('stage'));
    if (chosenStage) {
      config.initialStorySceneId = chosenStage.scene.id;
      config.initialStoryEventIndex = chosenStage.eventIndex;
      config.initialPlayerX = null;
    }
    // The ending's lesson in the story's own language (Tagalog when KoobD is).
    const endingLesson = document.getElementById('endingLesson');
    if (endingLesson && window.KOOBD_FALSE_KNIGHT_STORY.lesson) endingLesson.textContent = window.KOOBD_FALSE_KNIGHT_STORY.lesson;
    window.startKoobdPlatformerPage(config, () => {
      document.getElementById('endingScreen')?.classList.remove('hidden');
    });

    // Choose Stage on the ending page: the list of stages, each starting at
    // the beginning of that part of the story.
    const stageGrid = document.getElementById('endingStageGrid');
    stageStarts.forEach((stage, index) => {
      const link = document.createElement('a');
      link.className = 'ending-stage';
      link.href = 'false_knight.php?' + <?= json_encode($activityQuery) ?> + 'stage=' + encodeURIComponent(stage.scene.id);
      const number = document.createElement('span');
      number.className = 'ending-stage-number';
      number.textContent = String(index + 1);
      const name = document.createElement('span');
      name.className = 'ending-stage-name';
      name.setAttribute('translate', 'no');
      name.textContent = stage.scene.title;
      link.append(number, name);
      stageGrid?.append(link);
    });
    const endingContent = document.querySelector('#endingScreen .ending-content');
    const showStages = (open) => endingContent?.classList.toggle('is-choosing-stage', open);
    document.getElementById('endingChooseStage')?.addEventListener('click', () => showStages(true));
    document.getElementById('endingStagesBack')?.addEventListener('click', () => showStages(false));
  </script>
</body>
</html>
