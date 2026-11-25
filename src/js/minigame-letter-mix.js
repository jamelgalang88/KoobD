// Letter Mix (letter_mix.php): 8 words with their letters mixed up. Tap the
// letters in order to spell the word; the hint tells what it means. Fewer wrong
// tries, more points; after three, the word is shown and the game moves on.
(function () {
  const { root, el, sfx, shuffle, LEVELS, LANGS, setup, hud, results, loadWords, showError, backLinks } = window.KoobdMinigameKit;
  const WORDS = 8;
  const POINTS = [15, 10, 5];
  const choice = { lang: 'en', level: 'easy' };
  const key = () => `${choice.lang}-${choice.level}`;
  let game = null;

  function showSetup() {
    if (game) window.clearTimeout(game.next);
    game = null;
    setup({
      title: 'Letter Mix',
      sub: 'Put the letters back in order.',
      icon: 'M4 7h3l10 10h3M4 17h3l3-3M14 10l3-3h3M18 4l3 3-3 3M18 14l3 3-3 3',
      steps: ['Read the hint.', 'Tap the letters in the right order.', 'Spell it on the first try for the most points.'],
      groups: [
        { label: 'Language', options: LANGS, get: () => choice.lang, set: (value) => { choice.lang = value; } },
        { label: 'Level', options: LEVELS, get: () => choice.level, set: (value) => { choice.level = value; } }
      ],
      bestKey: key,
      onStart: start
    });
  }
  async function start() {
    if (game) window.clearTimeout(game.next);
    game = null;
    root.replaceChildren(backLinks(), el('p', { class: 'mg-sub', role: 'status', text: 'Getting the words…' }));
    let words;
    try { words = await loadWords(choice.lang, choice.level); } catch (problem) { showError(problem.message, start); return; }
    game = { words: shuffle(words).slice(0, WORDS), at: -1, score: 0, solved: 0, firstTry: 0, missed: [], next: 0 };
    nextWord();
  }
  // Mixed up, and never already in order.
  function mix(word) {
    const letters = word.split('');
    if (new Set(letters).size < 2) return letters;
    let mixed = shuffle(letters);
    while (mixed.join('') === word) mixed = shuffle(letters);
    return mixed;
  }
  function nextWord() {
    game.at += 1;
    if (game.at >= game.words.length) { finish(); return; }
    const item = game.words[game.at];
    game.word = item.w.toUpperCase();
    game.tries = 0;
    game.picked = [];
    game.locked = false;
    game.tiles = mix(game.word).map((letter) => el('button', {
      type: 'button', class: 'lm-tile', translate: 'no', text: letter,
      onclick: (event) => pick(event.currentTarget)
    }));
    game.slots = el('div', { class: 'lm-slots', translate: 'no', 'aria-label': 'Your word' });
    game.note = el('p', { class: 'mg-note', role: 'status' });
    game.triesNode = el('span', { class: 'lm-tries', text: 'First try' });
    root.replaceChildren(
      hud({ onQuit: showSetup, at: game.at, total: game.words.length, count: `${game.at + 1} of ${game.words.length}`, stats: [['Score', String(game.score)]] }),
      el('section', { class: 'mg-card-stage' }, [
        el('span', { class: 'mg-label', text: 'Hint' }),
        el('p', { class: 'mg-prompt hh-hint', translate: 'no', lang: choice.lang === 'tl' ? 'fil' : 'en', text: item.h }),
        game.slots,
        el('div', { class: 'lm-tiles' }, game.tiles),
        game.note,
        el('div', { class: 'lm-tools' }, [
          game.triesNode,
          el('button', { type: 'button', class: 'mg-btn mg-btn-ghost', onclick: clearPicked, text: 'Clear' })
        ])
      ])
    );
    renderSlots();
  }
  function renderSlots() {
    const boxes = [];
    for (let i = 0; i < game.word.length; i += 1) {
      const tile = game.picked[i];
      boxes.push(el('button', {
        type: 'button', class: `lm-slot${tile ? ' is-filled' : ''}`, text: tile ? tile.textContent : '', disabled: !tile || game.locked,
        'aria-label': tile ? `Remove ${tile.textContent}` : 'Empty',
        onclick: () => unpick(i)
      }));
    }
    game.slots.replaceChildren(...boxes);
  }
  function pick(tile) {
    if (game.locked || tile.disabled) return;
    tile.disabled = true;
    game.picked.push(tile);
    sfx('letter', { index: game.picked.length - 1 });
    renderSlots();
    if (game.picked.length === game.word.length) check();
  }
  function unpick(index) {
    if (game.locked) return;
    const [tile] = game.picked.splice(index, 1);
    tile.disabled = false;
    sfx('toggle');
    renderSlots();
  }
  function clearPicked() {
    if (game.locked) return;
    game.picked.forEach((tile) => { tile.disabled = false; });
    game.picked = [];
    renderSlots();
  }
  function check() {
    const written = game.picked.map((tile) => tile.textContent).join('');
    if (written === game.word) {
      const points = POINTS[Math.min(game.tries, POINTS.length - 1)];
      game.score += points;
      game.solved += 1;
      if (game.tries === 0) game.firstTry += 1;
      game.locked = true;
      renderSlots();
      game.slots.classList.add('is-right');
      game.note.textContent = `Correct! +${points}`;
      game.note.classList.add('is-good');
      sfx('word');
      game.next = window.setTimeout(nextWord, 1000);
      return;
    }
    game.tries += 1;
    sfx('wrong');
    game.slots.classList.remove('is-shake');
    void game.slots.offsetWidth;
    game.slots.classList.add('is-shake');
    if (game.tries >= POINTS.length) {
      // Three tries: the word, and on to the next.
      game.locked = true;
      game.missed.push(game.words[game.at]);
      game.picked = game.word.split('').map((letter) => ({ textContent: letter }));
      renderSlots();
      game.note.textContent = `The word is "${game.word}".`;
      game.next = window.setTimeout(nextWord, 2000);
      return;
    }
    game.note.textContent = 'Not quite. Try again.';
    game.triesNode.textContent = game.tries === 1 ? 'Second try' : 'Last try';
    game.next = window.setTimeout(() => { if (game && !game.locked) clearPicked(); }, 500);
  }
  function finish() {
    const done = game;
    game = null;
    results({
      heading: done.solved === done.words.length ? 'All solved!' : 'Well done!',
      score: done.score,
      key: key(),
      stats: [['Solved', `${done.solved} of ${done.words.length}`], ['First try', done.firstTry]],
      again: start,
      change: showSetup,
      changeLabel: 'Change level',
      extra: done.missed.length ? el('div', { translate: 'no' }, [
        el('h3', { class: 'mg-section', text: 'Words to practise' }),
        el('ul', { class: 'fs-answers' }, done.missed.map((word) => el('li', { class: 'fs-answer' }, [
          el('div', { class: 'fs-answer-head' }, [el('span', { class: 'fs-to', text: word.w })]),
          el('p', { text: word.h })
        ])))
      ]) : null
    });
  }
  showSetup();
})();
