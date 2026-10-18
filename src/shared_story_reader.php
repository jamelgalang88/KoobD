<?php
require_once('auth.php');
$user = koobdRequireAuth(true);
$sharedStoryId = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if ($sharedStoryId <= 0) {
    header("Location: home.php");
    exit();
}

$sharedStory = koobdSharedStoryById($sharedStoryId);
if (!$sharedStory) {
    header("Location: home.php");
    exit();
}

if ((int)($sharedStory['teacher_story_id'] ?? 0) <= 0) {
    header("Location: story.php?id=" . $sharedStoryId);
    exit();
}

$story = koobdTeacherStoryById((int)$sharedStory['teacher_story_id']);
if (!$story || trim((string)($story['status'] ?? 'draft')) !== 'published') {
    header("Location: home.php");
    exit();
}
$playerProfile = koobdResolvedProfile($user);

// ?resume=1 picks up where the reader stopped (Continue on Home); ?restart=1
// starts again from the first page and clears the saved place.
$restartHref = 'shared_story_reader.php?id=' . $sharedStoryId . '&restart=1';
$initialPage = 0;
$initialElement = 0;
$initialPlayerX = null;
$initialStoryEventIndex = 0;
$deriveStoryEventIndex = false;
if (isset($_GET['restart'])) {
    koobdResetStoryProgress((int)$user['id'], (string)$story['id']);
} elseif (isset($_GET['resume'])) {
    $saved = koobdStoryProgressFor((int)$user['id'], (string)$story['id']);
    $progressState = $saved && $saved['progress'] < 100 ? $saved['state'] : null;
    if (is_array($progressState)) {
        if (isset($progressState['currentPage'])) {
            $initialPage = max(0, min(count($story['pages']) - 1, (int)$progressState['currentPage']));
        }
        if (isset($progressState['currentElement'])) {
            $initialElement = max(0, (int)$progressState['currentElement']);
        }
        if (isset($progressState['playerX'])) {
            $initialPlayerX = max(0, min(max(1000, count($story['pages']) * 1000), (int)$progressState['playerX']));
            $deriveStoryEventIndex = !isset($progressState['storyEventIndex']);
        }
        if (isset($progressState['storyEventIndex'])) {
            $initialStoryEventIndex = max(0, (int)$progressState['storyEventIndex']);
            $deriveStoryEventIndex = false;
        }
    }
}

$pagesForPlayer = koobdStoryPagesForPlayer($story['pages']);
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
  <title>KoobD - Story</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/book1.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/story-reader.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/teacher-stories.css') ?>">
  <link rel="icon" type="image/png" href="assets/images/icons/favicon.png">
  <?php // Installable as an app (manifest.webmanifest): opens without the address bar. ?>
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#f3f8ff">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="KoobD">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link rel="apple-touch-icon" href="assets/images/icons/app/apple-touch-icon.png">
  <link rel="stylesheet" href="<?= koobdAsset('css/story-shared.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
</head>
<body class="story-page">
  <button id="backHomeBtn" class="top-right story-exit-btn" aria-label="Pause story" title="Pause (Esc)">
    <span class="story-pause-icon" aria-hidden="true"></span>
  </button>

  <main class="platformer-story-stage koobd-story<?= ($story['pages'][$initialPage]['pageType'] ?? '') === 'platformer' ? '' : ' hidden' ?>" id="platformerStoryStage">
    <div class="platformer-story-background" id="platformerStoryBackground"></div>
    <div class="platformer-story-world" id="platformerStoryWorld">
      <div class="platformer-story-ground" id="platformerStoryGround"></div>
      <div class="platformer-story-platforms" id="platformerStoryPlatforms"></div>
      <img class="platformer-story-player" id="platformerStoryPlayer" style="--platformer-player-scale:<?= max(0.7, min(1.25, ((int)$playerProfile['scale']) / 100)) ?>" src="<?= htmlspecialchars($playerProfile['asset']) ?>" alt="<?= htmlspecialchars($playerProfile['name']) ?>">
      <div class="platformer-story-npcs" id="platformerStoryNpcs" translate="no"></div>
    </div>
    <div class="platformer-story-hud"><span class="teacher-story-player-badge" translate="no"><?= htmlspecialchars($story['title']) ?></span><div class="platformer-story-progress" id="platformerStoryProgress" role="slider" aria-label="Navigate the platformer world" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><span id="platformerStoryProgressFill"></span><button type="button" id="platformerStoryProgressThumb" aria-label="Navigate platformer world"></button></div><span class="platformer-story-mode" id="platformerStoryMode"></span></div>
    <div class="platformer-story-controls" aria-label="Platformer controls"><div class="platformer-move-pad"><button id="platformerMoveLeft" class="platformer-control" aria-label="Move left">&#8592;</button><button id="platformerMoveRight" class="platformer-control" aria-label="Move right">&#8594;</button></div><div class="platformer-action-pad"><button id="platformerChatButton" class="platformer-control chat hidden" aria-label="Chat with nearby character">Chat</button><button id="platformerJumpButton" class="platformer-control jump" aria-label="Jump">&#8593;</button></div></div>
    <div class="platformer-story-dialogue hidden" id="platformerDialogue"><div class="platformer-story-dialogue-stage"><div class="platformer-story-dialogue-figure left" id="platformerDialogueFigureLeft"></div><div class="platformer-story-dialogue-card" translate="no"><div class="platformer-story-dialogue-name" id="platformerDialogueName"></div><div class="platformer-story-dialogue-text" id="platformerDialogueText"></div><div class="platformer-story-dialogue-choices" id="platformerDialogueChoices"></div><p class="platformer-story-dialogue-hint" id="platformerDialogueHint" translate="yes">Tap to continue</p></div><div class="platformer-story-dialogue-figure right" id="platformerDialogueFigureRight"></div></div></div>
  </main>
  <div class="vn-wrapper<?= ($story['pages'][$initialPage]['pageType'] ?? '') === 'platformer' ? ' hidden' : '' ?>">
    <div class="vn-background" id="teacherStoryPlayerBg"></div>

    <div class="vn-characters" translate="no">
      <img id="teacherStoryPlayerLeft" class="vn-char left" src="" alt="">
      <img id="teacherStoryPlayerRight" class="vn-char right" src="" alt="">
    </div>

    <div class="teacher-story-scene-title hidden" id="teacherStoryTitleWrap" translate="no">
      <div class="teacher-story-scene-title-text" id="teacherStoryTitle"></div>
    </div>

    <div class="vn-dialogue" id="teacherStoryDialogueWrap" translate="no">
      <div class="vn-names">
        <div class="name-box" id="teacherStoryNameLeft"></div>
        <div class="name-box" id="teacherStoryNameRight"></div>
      </div>
      <div class="dialogue-box visible" id="teacherStoryText"></div>
    </div>
  </div>
  <script src="<?= koobdAsset('js/story-orientation.js') ?>"></script>
  <script src="<?= koobdAsset('js/story-shared.js') ?>"></script>
  <script>
    // The exit button opens KoobD's shared pause page, as in every story:
    // Continue, Restart (the story from its first page), or Home.
    (() => {
      const goHome = () => {
        if (window.storyReadingMode && typeof window.storyReadingMode.exitToMain === 'function') {
          window.storyReadingMode.exitToMain('home.php');
          return;
        }
        window.location.href = 'home.php';
      };
      const pause = window.KoobdStory.createPauseScreen({
        onRestart: () => { window.location.href = <?= json_encode($restartHref) ?>; },
        onHome: goHome,
      });
      document.getElementById('backHomeBtn')?.addEventListener('click', (event) => {
        event.stopPropagation();
        pause.open();
      });
    })();
  </script>
  <?php
  $playerConfig = [
    'mode' => 'shared',
    'storyId' => $story['id'],
    'title' => $story['title'],
    'progressContext' => 'global',
    'userId' => (int)$user['id'],
    'initialPage' => $initialPage,
    'initialElement' => $initialElement,
    'initialStoryEventIndex' => $deriveStoryEventIndex ? null : $initialStoryEventIndex,
    'restartUrl' => $restartHref,
    'returnHref' => 'home.php',
    'pages' => $pagesForPlayer,
    'textStyle' => koobdStoryTextStyle($story),
    'lesson' => $story['lesson'] ?? '',
    'playerProfile' => ['name' => $playerProfile['name'], 'asset' => $playerProfile['asset']],
  ];
  if ($initialPlayerX !== null) {
    $playerConfig['initialPlayerX'] = $initialPlayerX;
  }
  ?>
  <script>
    window.KOOBD_TEACHER_STORY = <?= json_encode($playerConfig) ?>;
  </script>
  <script src="<?= koobdAsset('js/platformer-blocks.js') ?>"></script>
  <script src="<?= koobdAsset('js/platform-library.js') ?>"></script>
  <script src="<?= koobdAsset('js/rich-text.js') ?>"></script>
  <script src="<?= koobdAsset('js/platform-story-compiler.js') ?>"></script>
  <script src="<?= koobdAsset('js/platformer-story-player.js') ?>"></script>
  <script src="<?= koobdAsset('js/teacher-story-player.js') ?>"></script>
</body>
</html>
