<?php
// Versus Mode: two students race in a platform arena to collect a word's
// letters and answer a question about it (versus_play.php). Here: Create
// Lobby (the host's settings) or Join Lobby (a classmate's code), and the
// player's recent matches.
require_once('versus_lib.php');
$user = koobdRequireAuth(true);
koobdMissionRequireFeature($user, 'versus');
$username = $user['username'];
$profile = koobdResolvedProfile($user);
$isTeacher = koobdIsTeacher($user);
$classroomPath = 'classroom.php';
$profileEditPath = 'profile.php';
$me = (int)$user['id'];

// Recent matches (finished, forfeited or abandoned).
$history = [];
$rows = $conn->query(
    "SELECT * FROM vs_lobbies WHERE (host_id = $me OR guest_id = $me) AND status IN ('finished', 'abandoned') AND guest_id IS NOT NULL
     ORDER BY finished_at DESC, id DESC LIMIT 8"
)->fetch_all(MYSQLI_ASSOC);
foreach ($rows as $row) {
    $side = (int)$row['host_id'] === $me ? 'host' : 'guest';
    $other = vsPlayer($side === 'host' ? (int)$row['guest_id'] : (int)$row['host_id']);
    $history[] = [
        'id' => (int)$row['id'],
        'other' => $other,
        'mine' => (int)$row[$side . '_score'],
        'theirs' => (int)$row[($side === 'host' ? 'guest' : 'host') . '_score'],
        'outcome' => $row['status'] === 'abandoned' ? 'Abandoned' : ((int)$row['winner_id'] === $me ? 'Won' : 'Lost'),
        'forfeit' => $row['result'] === 'forfeit',
        'lang' => $row['lang'] === 'fil' ? 'Filipino' : 'English',
        'when' => $row['finished_at'] ? date('M j, g:i A', strtotime($row['finished_at'])) : '',
    ];
}
// The player's record over every finished match (not only the recent ones).
$record = $conn->query(
    "SELECT COUNT(*) AS played, SUM(winner_id = $me) AS won FROM vs_lobbies
     WHERE (host_id = $me OR guest_id = $me) AND status = 'finished' AND guest_id IS NOT NULL"
)->fetch_assoc();
$played = (int)($record['played'] ?? 0);
$won = (int)($record['won'] ?? 0);
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
  <title>KoobD - Versus Mode</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/app.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/versus.css') ?>">
  <link rel="icon" type="image/png" href="assets/images/icons/favicon.png">
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#f3f8ff">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <link rel="apple-touch-icon" href="assets/images/icons/app/apple-touch-icon.png">
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
</head>
<body class="app-bg versus-page">
  <div class="app-shell">
<?php include __DIR__ . '/versus_sidebar.php'; ?>

    <main class="main">
      <div class="main-inner vs-landing">
        <header class="vs-hero">
          <div class="vs-hero-copy">
            <span class="vs-kicker">1v1 · Word race</span>
            <h1>Versus Mode</h1>
            <p>Race a classmate across the arena. Read the hint, collect the letters of the word in order, then answer a question about it to win the round. Careful: each wrong letter costs one of your 3 hearts.</p>
          </div>
          <div class="vs-hero-art" aria-hidden="true">
            <span class="vs-hero-tile">V</span><span class="vs-hero-tile is-b">S</span>
          </div>
        </header>

        <?php // The two choices, then the panel for the one picked. ?>
        <section class="vs-choices" id="vsChoices" aria-label="Play">
          <button type="button" class="vs-choice" data-open="create">
            <span class="vs-choice-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></span>
            <span class="vs-choice-text"><strong>Create Lobby</strong><span>Choose the rules and share a code</span></span>
            <svg class="vs-choice-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
          </button>
          <button type="button" class="vs-choice is-join" data-open="join">
            <span class="vs-choice-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4"/></svg></span>
            <span class="vs-choice-text"><strong>Join Lobby</strong><span>Enter a classmate's lobby code</span></span>
            <svg class="vs-choice-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
          </button>
        </section>

        <?php // Create Lobby: the rules on the left as option cards, a live preview
        // of the match (and the button) on the right; stacked on phones. ?>
        <section class="vs-panel vs-create" id="vsCreate" hidden aria-labelledby="vsCreateTitle">
          <div class="vs-panel-head">
            <button type="button" class="vs-back" data-back><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Back</button>
            <div class="vs-panel-titles">
              <h2 id="vsCreateTitle">Create a lobby</h2>
            </div>
          </div>
          <form id="vsCreateForm" class="vs-create-grid" novalidate>
            <div class="vs-create-settings">
              <fieldset class="vs-setting">
                <legend class="vs-setting-head"><span class="vs-setting-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 01-8 0zM8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v4M8.5 20h7M10 17h4"/></svg></span><span><strong>Winning score</strong></span></legend>
                <div class="vs-options is-three">
                  <?php foreach ([3, 4, 5] as $target): ?>
                    <label class="vs-option"><input type="radio" name="win" value="<?= $target ?>"<?= $target === 3 ? ' checked' : '' ?>><span class="vs-option-card"><b>First to <?= $target ?></b></span></label>
                  <?php endforeach; ?>
                </div>
              </fieldset>
              <fieldset class="vs-setting">
                <legend class="vs-setting-head"><span class="vs-setting-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h9M8.5 4v2M6 6c.6 3 2.4 5.4 5 6.6M11 6c-.6 3-2.6 5.6-6 7M13 20l4-9 4 9M14.4 17h5.2"/></svg></span><span><strong>Word language</strong></span></legend>
                <div class="vs-options is-two">
                  <label class="vs-option"><input type="radio" name="lang" value="en" checked><span class="vs-option-card"><span class="vs-option-tag">EN</span><b>English</b></span></label>
                  <label class="vs-option"><input type="radio" name="lang" value="fil"><span class="vs-option-card"><span class="vs-option-tag is-fil">FIL</span><b>Filipino</b></span></label>
                </div>
              </fieldset>
              <fieldset class="vs-setting">
                <legend class="vs-setting-head"><span class="vs-setting-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V14M12 20V9M19 20V4"/></svg></span><span><strong>Difficulty</strong></span></legend>
                <div class="vs-options is-four">
                  <label class="vs-option"><input type="radio" name="level" value="mixed" checked><span class="vs-option-card"><span class="vs-meter is-mixed" aria-hidden="true"><i></i><i></i><i></i></span><b>Mixed</b></span></label>
                  <label class="vs-option"><input type="radio" name="level" value="easy"><span class="vs-option-card"><span class="vs-meter" aria-hidden="true"><i class="on"></i><i></i><i></i></span><b>Easy</b></span></label>
                  <label class="vs-option"><input type="radio" name="level" value="medium"><span class="vs-option-card"><span class="vs-meter" aria-hidden="true"><i class="on"></i><i class="on"></i><i></i></span><b>Medium</b></span></label>
                  <label class="vs-option"><input type="radio" name="level" value="hard"><span class="vs-option-card"><span class="vs-meter" aria-hidden="true"><i class="on"></i><i class="on"></i><i class="on"></i></span><b>Hard</b></span></label>
                </div>
              </fieldset>
            </div>
            <aside class="vs-create-summary" aria-label="Match preview">
              <span class="vs-kicker">Match preview</span>
              <ul class="vs-preview">
                <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 01-8 0zM8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v4M8.5 20h7M10 17h4"/></svg><span id="vsPreviewWin">First to 3</span></li>
                <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h9M8.5 4v2M6 6c.6 3 2.4 5.4 5 6.6M11 6c-.6 3-2.6 5.6-6 7M13 20l4-9 4 9M14.4 17h5.2"/></svg><span id="vsPreviewLang">English</span></li>
                <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V14M12 20V9M19 20V4"/></svg><span id="vsPreviewLevel">Mixed difficulty</span></li>
                <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.5 7.8 3.6 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.4 0 5.5 3.3 4.3 6.6-1.8 4.8-9.3 9.4-9.3 9.4z"/></svg><span>3 hearts</span></li>
                <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0012 3z"/></svg><span>Hints</span></li>
              </ul>
              <p class="vs-error" role="alert" hidden></p>
              <button type="submit" class="vs-btn vs-btn-primary vs-create-go">Create Lobby</button>
            </aside>
          </form>
        </section>

        <section class="vs-panel" id="vsJoin" hidden aria-labelledby="vsJoinTitle">
          <div class="vs-panel-head">
            <button type="button" class="vs-back" data-back><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Back</button>
            <h2 id="vsJoinTitle">Join a lobby</h2>
          </div>
          <form id="vsJoinForm" class="vs-form" novalidate>
            <label class="vs-field" for="vsJoinCode">
              <span class="vs-label">Lobby code</span>
              <input id="vsJoinCode" class="vs-code-input" name="code" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" inputmode="text">
            </label>
            <p class="vs-error" role="alert" hidden></p>
            <button type="submit" class="vs-btn vs-btn-primary">Join Lobby</button>
          </form>
        </section>

        <?php // Recent matches: the player's record, then the latest matches (each opens its summary). ?>
        <section class="vs-history" aria-labelledby="vsHistoryTitle">
          <div class="vs-history-head">
            <h2 id="vsHistoryTitle">Recent matches</h2>
            <?php if ($played): ?>
              <dl class="vs-record">
                <div><dt>Played</dt><dd><?= $played ?></dd></div>
                <div class="is-won"><dt>Won</dt><dd><?= $won ?></dd></div>
                <div class="is-lost"><dt>Lost</dt><dd><?= $played - $won ?></dd></div>
                <div><dt>Win rate</dt><dd><?= (int)round($won / $played * 100) ?>%</dd></div>
              </dl>
            <?php endif; ?>
          </div>
          <?php if (!$history): ?>
            <p class="vs-empty">No matches yet. Create a lobby and share its code with a classmate.</p>
          <?php else: ?>
            <ul class="vs-history-list">
              <?php foreach ($history as $match): ?>
                <li>
                  <a class="vs-history-row is-<?= strtolower($match['outcome']) ?>" href="versus_match.php?id=<?= $match['id'] ?>">
                    <span class="vs-avatar is-sm" style="--a:<?= htmlspecialchars($match['other']['top'] ?? '#dfe6ff') ?>;--b:<?= htmlspecialchars($match['other']['bottom'] ?? '#d3f5e6') ?>"><img src="<?= htmlspecialchars($match['other']['asset'] ?? '') ?>" alt="" loading="lazy"></span>
                    <span class="vs-history-who">
                      <strong><span class="vs-history-vs">vs</span> <span translate="no"><?= htmlspecialchars($match['other']['name'] ?? 'Player') ?></span></strong>
                      <span class="vs-history-meta"><span class="vs-history-lang"><?= htmlspecialchars($match['lang']) ?></span><span><?= htmlspecialchars($match['when']) ?></span></span>
                    </span>
                    <span class="vs-history-score" aria-label="Score <?= $match['mine'] ?> to <?= $match['theirs'] ?>"><b><?= $match['mine'] ?></b><i aria-hidden="true">–</i><b><?= $match['theirs'] ?></b></span>
                    <span class="vs-history-result">
                      <span class="vs-outcome is-<?= strtolower($match['outcome']) ?>"><?= $match['outcome'] ?></span>
                      <?php if ($match['forfeit']): ?><span class="vs-history-note">by forfeit</span><?php endif; ?>
                    </span>
                    <svg class="vs-history-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
                  </a>
                </li>
              <?php endforeach; ?>
            </ul>
          <?php endif; ?>
        </section>
      </div>
    </main>
  </div>

  <script src="<?= koobdAsset('js/sidebar.js') ?>"></script>
  <script>
    (() => {
      // Create Lobby / Join Lobby: one panel at a time, then the lobby.
      const choices = document.getElementById('vsChoices');
      const panels = { create: document.getElementById('vsCreate'), join: document.getElementById('vsJoin') };
      function show(name) {
        choices.hidden = Boolean(name);
        Object.entries(panels).forEach(([key, panel]) => { panel.hidden = key !== name; });
        const focus = name === 'join' ? document.getElementById('vsJoinCode') : (name ? panels[name].querySelector('input:checked') : choices.querySelector('button'));
        if (focus) focus.focus();
      }
      document.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => show(button.dataset.open)));
      document.querySelectorAll('[data-back]').forEach((button) => button.addEventListener('click', () => show('')));
      if (location.hash === '#join') show('join');

      async function call(body) {
        const response = await fetch('versus_api.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const result = await response.json().catch(() => ({ success: false, message: 'The server did not answer. Try again.' }));
        if (!result.success) throw new Error(result.message || 'Something went wrong. Try again.');
        return result;
      }
      function wire(form, makeBody) {
        const error = form.querySelector('.vs-error');
        const button = form.querySelector('button[type="submit"]');
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          error.hidden = true;
          button.disabled = true;
          try {
            const result = await call(makeBody());
            window.location.href = `versus_play.php?lobby=${result.lobby}`;
          } catch (problem) {
            error.textContent = problem.message;
            error.hidden = false;
            button.disabled = false;
          }
        });
      }
      const createForm = document.getElementById('vsCreateForm');
      wire(createForm, () => ({ action: 'create', win: Number(createForm.win.value), lang: createForm.lang.value, level: createForm.level.value }));
      // The match preview follows the choices.
      const levelText = { mixed: 'Mixed difficulty', easy: 'Easy', medium: 'Medium', hard: 'Hard' };
      function preview() {
        document.getElementById('vsPreviewWin').textContent = `First to ${createForm.win.value}`;
        document.getElementById('vsPreviewLang').textContent = createForm.lang.value === 'fil' ? 'Filipino' : 'English';
        document.getElementById('vsPreviewLevel').textContent = levelText[createForm.level.value] || levelText.mixed;
      }
      createForm.addEventListener('change', preview);
      preview();
      const joinForm = document.getElementById('vsJoinForm');
      const codeInput = document.getElementById('vsJoinCode');
      codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
      wire(joinForm, () => ({ action: 'join', code: codeInput.value }));
    })();
  </script>
</body>
</html>
