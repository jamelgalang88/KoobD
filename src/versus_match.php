<?php
// A finished Versus match (versus_play.php sends players here): the winner,
// the final score, each player's statistics and every round. Only the match's
// two players can see it. Rematch offers the same opponent a new lobby with
// the same settings; the other player sees the offer here.
//   versus_match.php?id=<lobby id>
require_once('versus_lib.php');
$user = koobdRequireAuth(true);
koobdMissionRequireFeature($user, 'versus');
$username = $user['username'];
$profile = koobdResolvedProfile($user);
$classroomPath = 'classroom.php';
$profileEditPath = 'profile.php';
$me = (int)$user['id'];
$lobby = vsLobby((int)($_GET['id'] ?? 0));
$side = $lobby ? vsSide($lobby, $me) : null;
if (!$lobby || !$side) {
    if ($lobby) {
        vsFlag((int)$lobby['id'], $me, 'access', 'opened another match summary');
    }
    header('Location: versus.php');
    exit();
}
if (!in_array($lobby['status'], ['finished', 'abandoned'], true)) {
    header('Location: versus_play.php?lobby=' . (int)$lobby['id']);
    exit();
}
$other = $side === 'host' ? 'guest' : 'host';
$summary = vsMatchSummary($lobby);
$players = $summary['players'];
$stats = $summary['stats'];
$winnerSide = $lobby['winner_id'] === null ? null : ((int)$lobby['winner_id'] === (int)$lobby['host_id'] ? 'host' : 'guest');
$iWon = $winnerSide === $side;
$seconds = static fn(?int $ms) => $ms === null ? '—' : number_format($ms / 1000, 1) . ' s';
$duration = $summary['durationS'] === null ? '—' : sprintf('%d:%02d', intdiv($summary['durationS'], 60), $summary['durationS'] % 60);
$result = $lobby['status'] === 'abandoned' ? 'Abandoned' : ($lobby['result'] === 'forfeit' ? 'Won by forfeit' : 'Won');
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
  <title>KoobD - Match summary</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/app.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/versus.css') ?>">
  <link rel="icon" type="image/png" href="assets/images/icons/favicon.png">
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#f3f8ff">
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
</head>
<body class="app-bg versus-page">
  <div class="app-shell">
<?php include __DIR__ . '/versus_sidebar.php'; ?>

    <main class="main">
      <div class="main-inner vs-summary">
        <a class="vs-back" href="versus.php"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Versus Mode</a>

        <section class="vs-result <?= $winnerSide === null ? 'is-none' : ($iWon ? 'is-win' : 'is-lose') ?>" aria-labelledby="vsResultTitle">
          <span class="vs-kicker">Match summary</span>
          <h1 id="vsResultTitle"><?= $winnerSide === null ? 'Match abandoned' : ($iWon ? 'Victory!' : 'Defeat') ?></h1>
          <div class="vs-result-players">
            <?php foreach (['host', 'guest'] as $who): ?>
              <?php $player = $players[$who]; ?>
              <div class="vs-result-player<?= $winnerSide === $who ? ' is-winner' : '' ?>">
                <span class="vs-avatar is-lg" style="--a:<?= htmlspecialchars($player['top'] ?? '#dfe6ff') ?>;--b:<?= htmlspecialchars($player['bottom'] ?? '#d3f5e6') ?>"><img src="<?= htmlspecialchars($player['asset'] ?? '') ?>" alt=""></span>
                <strong translate="no"><?= htmlspecialchars($player['name'] ?? 'Player') ?></strong>
                <span><?= htmlspecialchars($player['username'] ?? '') ?><?= $who === $side ? ' · You' : '' ?></span>
                <?php if ($winnerSide === $who): ?><span class="vs-winner-tag"><?= htmlspecialchars($result) ?></span><?php endif; ?>
              </div>
              <?php if ($who === 'host'): ?>
                <div class="vs-result-score"><?= (int)$lobby['host_score'] ?><span>–</span><?= (int)$lobby['guest_score'] ?></div>
              <?php endif; ?>
            <?php endforeach; ?>
          </div>
          <ul class="vs-facts">
            <li><span>Winning score</span><strong>First to <?= (int)$lobby['win_target'] ?></strong></li>
            <li><span>Language</span><strong><?= $lobby['lang'] === 'fil' ? 'Filipino' : 'English' ?></strong></li>
            <li><span>Rounds played</span><strong><?= count($summary['rounds']) ?></strong></li>
            <li><span>Duration</span><strong><?= $duration ?></strong></li>
            <li><span>Played</span><strong><?= $lobby['finished_at'] ? date('M j, Y · g:i A', strtotime($lobby['finished_at'])) : '—' ?></strong></li>
          </ul>
          <div class="vs-result-actions" id="vsActions">
            <button type="button" class="vs-btn vs-btn-primary" id="vsRematch">Rematch</button>
            <a class="vs-btn vs-btn-ghost" href="versus.php">Play Again</a>
            <a class="vs-btn vs-btn-ghost" href="versus.php">Back to Versus Mode</a>
          </div>
          <p class="vs-rematch-offer" id="vsRematchOffer" role="status" hidden></p>
          <p class="vs-error" id="vsActionError" role="alert" hidden></p>
        </section>

        <section class="vs-stats" aria-labelledby="vsStatsTitle">
          <h2 id="vsStatsTitle">Player statistics</h2>
          <div class="vs-stat-grid">
            <?php foreach ([$side, $other] as $who): ?>
              <?php $s = $stats[$who]; $player = $players[$who]; ?>
              <article class="vs-stat-card<?= $who === $side ? ' is-me' : '' ?>">
                <header><span class="vs-avatar is-sm" style="--a:<?= htmlspecialchars($player['top'] ?? '#dfe6ff') ?>;--b:<?= htmlspecialchars($player['bottom'] ?? '#d3f5e6') ?>"><img src="<?= htmlspecialchars($player['asset'] ?? '') ?>" alt=""></span><strong translate="no"><?= htmlspecialchars($player['name'] ?? 'Player') ?></strong><?= $who === $side ? '<span class="vs-you">You</span>' : '' ?></header>
                <div class="vs-stat-group">
                  <h3>Word building</h3>
                  <dl>
                    <div><dt>Rounds won</dt><dd><?= $s['rounds'] ?></dd></div>
                    <div><dt>Words completed</dt><dd><?= $s['words'] ?></dd></div>
                    <div><dt>Letters collected</dt><dd><?= $s['letters'] ?></dd></div>
                    <div><dt>Wrong letters tried</dt><dd><?= $s['wrongPickups'] ?></dd></div>
                    <div><dt>Average time to build a word</dt><dd><?= $seconds($s['avgWordMs']) ?></dd></div>
                  </dl>
                </div>
                <div class="vs-stat-group">
                  <h3>Vocabulary questions</h3>
                  <dl>
                    <div><dt>Correct answers</dt><dd><?= $s['correct'] ?></dd></div>
                    <div><dt>Wrong answers</dt><dd><?= $s['wrong'] ?></dd></div>
                    <div><dt>Average time to answer</dt><dd><?= $seconds($s['avgAnswerMs']) ?></dd></div>
                    <div><dt>Average word + question</dt><dd><?= $seconds($s['avgTotalMs']) ?></dd></div>
                  </dl>
                </div>
              </article>
            <?php endforeach; ?>
          </div>
        </section>

        <section class="vs-rounds" aria-labelledby="vsRoundsTitle">
          <h2 id="vsRoundsTitle">Round by round</h2>
          <?php if (!$summary['rounds']): ?>
            <p class="vs-empty">No round was finished in this match.</p>
          <?php else: ?>
            <div class="vs-table-wrap">
              <table class="vs-table">
                <thead>
                  <tr><th>Round</th><th>Word</th><th>Winner</th><th>Your word time</th><th>Your answer</th><th>Their word time</th><th>Their answer</th></tr>
                </thead>
                <tbody>
                  <?php foreach ($summary['rounds'] as $round): ?>
                    <?php $mine = $round['players'][$side] ?? []; $theirs = $round['players'][$other] ?? []; ?>
                    <?php $answerText = static function (array $p) use ($seconds) {
                        if (($p['answered'] ?? null) === 'correct') return 'Correct · ' . $seconds($p['answerMs']) . ($p['wrongAnswers'] ? ' (' . $p['wrongAnswers'] . ' wrong first)' : '');
                        if (($p['answered'] ?? null) === 'wrong') return 'Wrong (' . $p['wrongAnswers'] . ')';
                        if (($p['answered'] ?? null) === 'none') return 'Not answered';
                        return '—';
                    }; ?>
                    <tr class="<?= $round['winner'] === $side ? 'is-mine' : '' ?>">
                      <td data-label="Round"><?= $round['no'] ?></td>
                      <td data-label="Word" translate="no"><strong><?= htmlspecialchars($round['word']) ?></strong> <span class="vs-muted"><?= $round['lang'] === 'fil' ? 'FIL' : 'EN' ?></span></td>
                      <td data-label="Winner"><?= $round['winner'] === $side ? 'You' : htmlspecialchars($players[$other]['name'] ?? 'Opponent') ?></td>
                      <td data-label="Your word time"><?= $seconds($mine['wordMs'] ?? null) ?></td>
                      <td data-label="Your answer"><?= htmlspecialchars($answerText($mine)) ?></td>
                      <td data-label="Their word time"><?= $seconds($theirs['wordMs'] ?? null) ?></td>
                      <td data-label="Their answer"><?= htmlspecialchars($answerText($theirs)) ?></td>
                    </tr>
                  <?php endforeach; ?>
                </tbody>
              </table>
            </div>
          <?php endif; ?>
        </section>
      </div>
    </main>
  </div>

  <script src="<?= koobdAsset('js/sidebar.js') ?>"></script>
  <script>
    (() => {
      // Rematch: a new lobby with the same settings for the same two players.
      // The other player is offered it here (checked every few seconds).
      const lobbyId = <?= (int)$lobby['id'] ?>;
      const button = document.getElementById('vsRematch');
      const offer = document.getElementById('vsRematchOffer');
      const error = document.getElementById('vsActionError');
      async function call(body) {
        const response = await fetch('versus_api.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lobby: lobbyId, ...body }) });
        const result = await response.json().catch(() => ({ success: false, message: 'The server did not answer.' }));
        if (!result.success) throw new Error(result.message || 'Something went wrong.');
        return result;
      }
      async function rematch() {
        button.disabled = true;
        error.hidden = true;
        try {
          const result = await call({ action: 'rematch' });
          if (result.join) await fetch('versus_api.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'join', code: result.join }) });
          window.location.href = `versus_play.php?lobby=${result.lobby}`;
        } catch (problem) {
          error.textContent = problem.message;
          error.hidden = false;
          button.disabled = false;
        }
      }
      button.addEventListener('click', rematch);
      async function check() {
        try {
          const result = await call({ action: 'summary' });
          if (result.lobby.rematch) {
            offer.hidden = false;
            offer.textContent = 'A rematch is waiting with the same settings.';
            button.textContent = 'Join the rematch';
          }
        } catch (problem) { /* try again later */ }
      }
      check();
      window.setInterval(() => { if (!document.hidden) check(); }, 4000);
    })();
  </script>
</body>
</html>
