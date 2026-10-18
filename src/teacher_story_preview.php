<?php
require_once('auth.php');
$user = koobdRequireAuth(true);
$storyDbId = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if ($storyDbId <= 0) {
    header("Location: teacher_stories.php");
    exit();
}

$story = koobdTeacherStoryById($storyDbId);
if (!$story || (int)$story['teacher_id'] !== (int)$user['id']) {
    header("Location: teacher_stories.php");
    exit();
}
$playerProfile = koobdResolvedProfile($user);

// The persisted JSON list order is the editor's current page order. Keep that
// order intact; stable IDs and derived displayOrder values are not sequencing
// sources for preview playback.
$previewPages = array_values($story['pages']);

$pagesForPlayer = koobdStoryPagesForPlayer($previewPages);
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
  <title>KoobD - Story Preview</title>
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
<body class="story-page teacher-story-player-page teacher-story-preview-mode">
  <a class="top-right teacher-story-top-right-link" href="teacher_story_editor.php?id=<?= (int)$storyDbId ?><?= koobdCleanId($_GET['page'] ?? '') !== '' ? '&amp;page=' . rawurlencode(koobdCleanId($_GET['page'])) : '' ?>">Continue Editing</a>

  <main class="platformer-story-stage koobd-story<?= ($previewPages[0]['pageType'] ?? '') === 'platformer' ? '' : ' hidden' ?>" id="platformerStoryStage" aria-label="Platformer page"><div class="platformer-story-background" id="platformerStoryBackground"></div><div class="platformer-story-world" id="platformerStoryWorld"><div class="platformer-story-ground" id="platformerStoryGround"></div><div class="platformer-story-platforms" id="platformerStoryPlatforms"></div><img class="platformer-story-player" id="platformerStoryPlayer" style="--platformer-player-scale:<?= max(0.7, min(1.25, ((int)$playerProfile['scale']) / 100)) ?>" src="<?= htmlspecialchars($playerProfile['asset']) ?>" alt="<?= htmlspecialchars($playerProfile['name']) ?>"><div class="platformer-story-npcs" id="platformerStoryNpcs" translate="no"></div></div><div class="platformer-story-hud"><span class="teacher-story-player-badge">Preview</span><div class="platformer-story-progress" id="platformerStoryProgress" role="slider" aria-label="Navigate the platformer world" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><span id="platformerStoryProgressFill"></span><button type="button" id="platformerStoryProgressThumb" aria-label="Navigate platformer world"></button></div><span class="platformer-story-mode" id="platformerStoryMode"></span></div><div class="platformer-story-controls"><div class="platformer-move-pad"><button id="platformerMoveLeft" class="platformer-control">&#8592;</button><button id="platformerMoveRight" class="platformer-control">&#8594;</button></div><div class="platformer-action-pad"><button id="platformerChatButton" class="platformer-control chat hidden">Chat</button><button id="platformerJumpButton" class="platformer-control jump">&#8593;</button></div></div><div class="platformer-story-dialogue hidden" id="platformerDialogue"><div class="platformer-story-dialogue-stage"><div class="platformer-story-dialogue-figure left" id="platformerDialogueFigureLeft"></div><div class="platformer-story-dialogue-card" translate="no"><div class="platformer-story-dialogue-name" id="platformerDialogueName"></div><div class="platformer-story-dialogue-text" id="platformerDialogueText"></div><div class="platformer-story-dialogue-choices" id="platformerDialogueChoices"></div><p class="platformer-story-dialogue-hint" id="platformerDialogueHint" translate="yes">Tap to continue</p></div><div class="platformer-story-dialogue-figure right" id="platformerDialogueFigureRight"></div></div></div></main>
  <div class="vn-wrapper teacher-story-vn<?= ($previewPages[0]['pageType'] ?? '') === 'platformer' ? ' hidden' : '' ?>">
    <div class="vn-background" id="teacherStoryPlayerBg"></div>

    <div class="vn-characters" translate="no">
      <img id="teacherStoryPlayerLeft" class="vn-char left" src="" alt="">
      <img id="teacherStoryPlayerRight" class="vn-char right" src="" alt="">
    </div>

    <div class="teacher-story-scene-meta">
      <div class="teacher-story-player-badges">
        <span class="teacher-story-player-badge"><?= htmlspecialchars(ucfirst($story['status'])) ?></span>
        <span class="teacher-story-player-badge"><?= (int)$story['page_count'] ?> page<?= (int)$story['page_count'] === 1 ? '' : 's' ?></span>
      </div>
      <div class="teacher-story-player-mode" id="teacherStoryMode">Page 1</div>
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

  <?php
  $playerConfig = [
    'mode' => 'preview',
    // The ending screen offers a way back to the editor.
    // ...at the page the test started from.
    'editorHref' => 'teacher_story_editor.php?id=' . (int)$storyDbId . (koobdCleanId($_GET['page'] ?? '') !== '' ? '&page=' . rawurlencode(koobdCleanId($_GET['page'])) : ''),
    'title' => $story['title'],
    'initialPage' => 0,
    'startPageKey' => koobdCleanId($_GET['page'] ?? ''),
    'pages' => $pagesForPlayer,
    'textStyle' => koobdStoryTextStyle($story),
    'lesson' => $story['lesson'] ?? '',
    'playerProfile' => ['name' => $playerProfile['name'], 'asset' => $playerProfile['asset']],
  ];
  ?>
  <script>
    window.KOOBD_TEACHER_STORY = <?= json_encode($playerConfig) ?>;
  </script>
  <script src="<?= koobdAsset('js/story-orientation.js') ?>"></script>
  <script src="<?= koobdAsset('js/platformer-blocks.js') ?>"></script>
  <script src="<?= koobdAsset('js/platform-library.js') ?>"></script>
  <script src="<?= koobdAsset('js/rich-text.js') ?>"></script>
  <script src="<?= koobdAsset('js/platform-story-compiler.js') ?>"></script>
  <script src="<?= koobdAsset('js/platformer-story-player.js') ?>"></script>
  <script src="<?= koobdAsset('js/story-shared.js') ?>"></script>
  <script src="<?= koobdAsset('js/teacher-story-player.js') ?>"></script>
</body>
</html>
