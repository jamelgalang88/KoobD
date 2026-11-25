<?php
// A Versus Mode lobby, full screen: the waiting room, then the match in the
// arena (js/versus-game.js runs both; versus_api.php decides everything that
// counts). Only the lobby's two players can open it.
//   versus_play.php?lobby=<id>
require_once('versus_lib.php');
$user = koobdRequireAuth(true);
koobdMissionRequireFeature($user, 'versus');
$me = (int)$user['id'];
$lobby = vsLobby((int)($_GET['lobby'] ?? 0));
if (!$lobby || !vsSide($lobby, $me)) {
    if ($lobby) {
        vsFlag((int)$lobby['id'], $me, 'access', 'opened another lobby');
    }
    header('Location: versus.php');
    exit();
}
if (in_array($lobby['status'], ['finished', 'abandoned'], true)) {
    header('Location: versus_match.php?id=' . (int)$lobby['id']);
    exit();
}
if (in_array($lobby['status'], ['expired', 'cancelled'], true)) {
    header('Location: versus.php');
    exit();
}
$config = [
    'lobby' => (int)$lobby['id'],
    'me' => $me,
    'arena' => koobdVersusArena(),
];
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script src="<?= koobdAsset('js/i18n-tl.js') ?>"></script>
  <script src="<?= koobdAsset('js/i18n.js') ?>"></script>
  <script src="<?= koobdAsset('js/performance-mode.js') ?>"></script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>KoobD - Versus</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/versus.css') ?>">
  <link rel="icon" type="image/png" href="assets/images/icons/favicon.png">
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#141a3a">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
</head>
<body class="vs-play">
  <?php // The waiting room: the code, the settings and the two players. ?>
  <main class="vs-room" id="vsRoom" hidden>
    <div class="vs-room-card">
      <div class="vs-room-top">
        <a class="vs-room-back" href="versus.php" id="vsRoomLeave"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>Leave</span></a>
        <span class="vs-kicker">Versus lobby</span>
      </div>
      <div class="vs-room-code">
        <span class="vs-label">Lobby code</span>
        <div class="vs-code-row">
          <strong id="vsCode" translate="no">······</strong>
          <button type="button" class="vs-btn vs-btn-ghost" id="vsCopy"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0013.5 4h-7A2.5 2.5 0 004 6.5v7A2.5 2.5 0 006.5 16H8"/></svg><span>Copy code</span></button>
        </div>
        <p class="vs-hint">Share this code with one classmate. Only one opponent can join.</p>
      </div>
      <div class="vs-room-rules" id="vsRules"></div>
      <div class="vs-room-players">
        <div class="vs-slot" id="vsSlotHost"></div>
        <span class="vs-vs" aria-hidden="true">VS</span>
        <div class="vs-slot" id="vsSlotGuest"></div>
      </div>
      <p class="vs-room-status" id="vsRoomStatus" role="status"></p>
      <div class="vs-room-actions" id="vsRoomActions"></div>
      <p class="vs-error" id="vsRoomError" role="alert" hidden></p>
    </div>
  </main>

  <?php // The match: the bar on top, the arena, the controls. ?>
  <main class="vs-game" id="vsGame" hidden>
    <header class="vs-hud">
      <div class="vs-hud-player is-me" id="vsHudMe"></div>
      <div class="vs-hud-middle">
        <div class="vs-hud-score" id="vsScore" aria-live="polite"></div>
        <div class="vs-word" id="vsWord" aria-label="Your word"></div>
      </div>
      <div class="vs-hud-player is-them" id="vsHudThem"></div>
      <?php // The hint: what the word means, without saying it (tap to read all of it). ?>
      <button type="button" class="vs-clue" id="vsClue" aria-expanded="false" hidden>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0012 3z"/></svg>
        <span class="vs-clue-label">Hint</span>
        <span class="vs-clue-text" id="vsClueText"></span>
      </button>
    </header>
    <div class="vs-stage-wrap" id="vsStageWrap">
      <div class="vs-stage" id="vsStage">
        <canvas id="vsCanvas" aria-label="The arena"></canvas>
        <div class="vs-prompt" id="vsPrompt" hidden></div>
        <div class="vs-toast" id="vsToast" role="status" hidden></div>
        <div class="vs-overlay" id="vsCountdown" hidden><span></span></div>
        <div class="vs-overlay vs-question" id="vsQuestion" role="dialog" aria-modal="true" aria-labelledby="vsQuestionPrompt" hidden>
          <div class="vs-question-card">
            <span class="vs-kicker">Word complete!</span>
            <h2 id="vsQuestionPrompt"></h2>
            <div class="vs-question-choices" id="vsQuestionChoices"></div>
            <p class="vs-question-note" id="vsQuestionNote" role="status"></p>
          </div>
        </div>
        <div class="vs-overlay vs-banner" id="vsBanner" hidden></div>
        <div class="vs-overlay vs-away" id="vsAway" hidden></div>
      </div>
    </div>
    <footer class="vs-controls" id="vsControls">
      <?php // Move: slide the knob along the pill (js/versus-game.js) - left or right of the middle runs that way. ?>
      <div class="vs-pad is-move">
        <div class="vs-swipe" id="vsSwipe" role="slider" aria-label="Move: slide left or right" aria-valuemin="-1" aria-valuemax="1" aria-valuenow="0" aria-valuetext="Standing still">
          <svg class="vs-swipe-arrow is-left" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M10 7l-5 5 5 5"/></svg>
          <span class="vs-swipe-knob" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M10 11.5V5a1.6 1.6 0 013.2 0v6M13.2 10.5a1.6 1.6 0 013.2 0v1.5M16.4 11.2a1.6 1.6 0 013.1.3V15c0 3.6-2.6 6-5.9 6-2.4 0-3.8-1-5-2.7l-2.6-3.6a1.6 1.6 0 012.5-2L10 14.5"/></svg>
          </span>
          <svg class="vs-swipe-arrow is-right" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"/></svg>
        </div>
      </div>
      <p class="vs-keys-hint">Move <kbd>A</kbd><kbd>D</kbd> · Jump <kbd>Space</kbd> · Collect <kbd>E</kbd></p>
      <div class="vs-pad is-act">
        <button type="button" class="vs-key is-collect" data-key="collect" aria-label="Collect the letter" hidden>Collect</button>
        <button type="button" class="vs-key is-jump" data-key="jump" aria-label="Jump"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7"/></svg></button>
      </div>
    </footer>
    <button type="button" class="vs-leave" id="vsLeave" aria-label="Leave the match"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  </main>

  <?php // Leaving a match in progress: asked first (the opponent wins by forfeit). ?>
  <dialog class="vs-confirm" id="vsLeaveDialog" aria-labelledby="vsLeaveTitle" aria-describedby="vsLeaveText">
    <form method="dialog" class="vs-confirm-card">
      <span class="vs-confirm-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10 17l-5-5 5-5M5 12h11M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4"/></svg></span>
      <h2 id="vsLeaveTitle">Leave the match?</h2>
      <p id="vsLeaveText">You will lose by forfeit and your opponent wins this match.</p>
      <div class="vs-confirm-actions">
        <button type="submit" value="stay" class="vs-btn vs-confirm-stay" autofocus>Keep playing</button>
        <button type="submit" value="leave" class="vs-btn vs-confirm-leave">Leave match</button>
      </div>
    </form>
  </dialog>

  <div class="vs-rotate" id="vsRotate" hidden>Turn your device sideways for a bigger arena.</div>

  <script>window.KOOBD_VERSUS = <?= json_encode($config) ?>;</script>
  <script src="<?= koobdAsset('js/versus-fullscreen.js') ?>"></script>
  <script src="<?= koobdAsset('js/character-animation.js') ?>"></script>
  <script src="<?= koobdAsset('js/versus-game.js') ?>"></script>
</body>
</html>
