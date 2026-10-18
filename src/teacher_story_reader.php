<?php
require_once('teacher_auth.php');
$user = koobdRequireStudentAuth(true);
// A classroom activity (?activity_id=) the student has joined; its story must
// be one made in the story editor. Progress is kept per activity.
$activityId = isset($_GET['activity_id']) ? (int)$_GET['activity_id'] : 0;
$activity = koobdStudentActivity($activityId, (int)$user['id']);
if (!$activity) {
    // Links from before activities named only the classroom.
    $legacyClassroomId = isset($_GET['classroom_id']) ? (int)$_GET['classroom_id'] : 0;
    header("Location: " . ($legacyClassroomId > 0 ? 'classroom_room.php?id=' . $legacyClassroomId : 'classroom.php'));
    exit();
}
$classroomId = (int)$activity['classroom_id'];
$classroom = $activity;
$classroom['title'] = $activity['classroom_title'];

$story = koobdStoryMeta($activity['story_id']);
if (!$story || ($story['type'] ?? '') !== 'teacher_story') {
    header("Location: classroom_room.php?id=" . $classroomId);
    exit();
}
$playerProfile = koobdResolvedProfile($user);

$teacherProfile = koobdResolvedTeacherProfile($classroom);
$progressContext = koobdActivityProgressContext($activityId);
$progressStmt = $conn->prepare(
    "SELECT progress_state FROM story_progress WHERE user_id = ? AND story_id = ? AND progress_context = ? LIMIT 1"
);
$progressStmt->bind_param("iss", $user['id'], $classroom['story_id'], $progressContext);
$progressStmt->execute();
$progressResult = $progressStmt->get_result();
$progressRow = $progressResult ? $progressResult->fetch_assoc() : null;
$progressStmt->close();

$initialPage = 0;
$initialElement = 0;
$initialPlayerX = null;
$initialStoryEventIndex = 0;
$deriveStoryEventIndex = false;
if (isset($_GET['resume']) && $progressRow && !empty($progressRow['progress_state'])) {
    $progressState = json_decode((string)$progressRow['progress_state'], true);
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
  <title>KoobD - Classroom Story</title>
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
<body class="story-page teacher-story-player-page">
  <a class="top-right teacher-story-top-right-link" href="classroom_room.php?id=<?= (int)$classroomId ?>">Back To Class</a>

  <main class="platformer-story-stage koobd-story<?= ($story['pages'][$initialPage]['pageType'] ?? '') === 'platformer' ? '' : ' hidden' ?>" id="platformerStoryStage"><div class="platformer-story-background" id="platformerStoryBackground"></div><div class="platformer-story-world" id="platformerStoryWorld"><div class="platformer-story-ground hidden" id="platformerStoryGround"></div><div class="platformer-story-platforms" id="platformerStoryPlatforms"></div><img class="platformer-story-player" id="platformerStoryPlayer" style="--platformer-player-scale:<?= max(0.7, min(1.25, ((int)$playerProfile['scale']) / 100)) ?>" src="<?= htmlspecialchars($playerProfile['asset']) ?>" alt="<?= htmlspecialchars($playerProfile['name']) ?>"><div class="platformer-story-npcs" id="platformerStoryNpcs" translate="no"></div></div><div class="platformer-story-hud"><span class="teacher-story-player-badge" translate="no"><?= htmlspecialchars($classroom['title']) ?></span><div class="platformer-story-progress" id="platformerStoryProgress" role="slider" aria-label="Navigate the platformer world" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><span id="platformerStoryProgressFill"></span><button type="button" id="platformerStoryProgressThumb" aria-label="Navigate platformer world"></button></div><span class="platformer-story-mode" id="platformerStoryMode"></span></div><div class="platformer-story-controls"><div class="platformer-move-pad"><button id="platformerMoveLeft" class="platformer-control">&#8592;</button><button id="platformerMoveRight" class="platformer-control">&#8594;</button></div><div class="platformer-action-pad"><button id="platformerChatButton" class="platformer-control chat hidden">Chat</button><button id="platformerJumpButton" class="platformer-control jump">&#8593;</button></div></div><div class="platformer-story-dialogue hidden" id="platformerDialogue"><div class="platformer-story-dialogue-stage"><div class="platformer-story-dialogue-figure left" id="platformerDialogueFigureLeft"></div><div class="platformer-story-dialogue-card" translate="no"><div class="platformer-story-dialogue-name" id="platformerDialogueName"></div><div class="platformer-story-dialogue-text" id="platformerDialogueText"></div><div class="platformer-story-dialogue-choices" id="platformerDialogueChoices"></div><p class="platformer-story-dialogue-hint" id="platformerDialogueHint" translate="yes">Tap to continue</p></div><div class="platformer-story-dialogue-figure right" id="platformerDialogueFigureRight"></div></div></div></main>
  <div class="vn-wrapper teacher-story-vn<?= ($story['pages'][$initialPage]['pageType'] ?? '') === 'platformer' ? ' hidden' : '' ?>">
    <div class="vn-background" id="teacherStoryPlayerBg"></div>

    <div class="vn-characters" translate="no">
      <img id="teacherStoryPlayerLeft" class="vn-char left" src="" alt="">
      <img id="teacherStoryPlayerRight" class="vn-char right" src="" alt="">
    </div>

    <div class="teacher-story-scene-meta">
      <div class="teacher-story-player-badges">
        <span class="teacher-story-player-badge" translate="no"><?= htmlspecialchars($classroom['title']) ?></span>
        <span class="teacher-story-player-badge" translate="no"><?= htmlspecialchars($teacherProfile['name']) ?></span>
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
  <script src="<?= koobdAsset('js/story-orientation.js') ?>"></script>
  <?php
  $playerConfig = [
    'mode' => 'student',
    'storyId' => $story['id'],
    'title' => $story['title'],
    'progressContext' => $progressContext,
    'returnHref' => 'classroom_room.php?id=' . $classroomId,
    'pages' => $pagesForPlayer,
    'textStyle' => koobdStoryTextStyle($story),
    'lesson' => $story['lesson'] ?? '',
    'playerProfile' => ['name' => $playerProfile['name'], 'asset' => $playerProfile['asset']],
  ];
  $playerConfig['initialPage'] = $initialPage;
  $playerConfig['initialElement'] = $initialElement;
  if ($deriveStoryEventIndex) {
    $playerConfig['initialStoryEventIndex'] = null;
  } else {
    $playerConfig['initialStoryEventIndex'] = $initialStoryEventIndex;
  }
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
  <script src="<?= koobdAsset('js/story-shared.js') ?>"></script>
  <script src="<?= koobdAsset('js/teacher-story-player.js') ?>"></script>
</body>
</html>
