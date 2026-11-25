// Hint Hunt (hint_hunt.php): 10 hints, each with four words to choose from and
// 15 seconds on the clock. Faster answers and streaks earn more; every word
// missed is shown again at the end with its hint.
(function () {
  const { root, el, sfx, shuffle, LEVELS, LANGS, setup, hud, results, loadWords, showError, backLinks } = window.KoobdMinigameKit;
  const QUESTIONS = 10;
  const SECONDS = 15;
  const choice = { lang: 'en', level: 'easy' };
  const key = () => `${choice.lang}-${choice.level}`;
  let game = null;

  function showSetup() {
    stop();
    setup({
      title: 'Hint Hunt',
      sub: 'Read the hint and find the word.',
      icon: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.5-4.5',
      steps: ['Read the hint.', 'Choose the word it describes.', 'Answer fast for more points.'],
      groups: [
        { label: 'Language', options: LANGS, get: () => choice.lang, set: (value) => { choice.lang = value; } },
        { label: 'Level', options: LEVELS, get: () => choice.level, set: (value) => { choice.level = value; } }
      ],
      bestKey: key,
      onStart: start
    });
  }
  function stop() {
    if (game) { window.clearInterval(game.timer); window.clearTimeout(game.next); }
    game = null;
  }
  async function start() {
    stop();
    root.replaceChildren(backLinks(), el('p', { class: 'mg-sub', role: 'status', text: 'Getting the words…' }));
    let words;
    try { words = await loadWords(choice.lang, choice.level); } catch (problem) { showError(problem.message, start); return; }
    const mixed = shuffle(words);
    game = { all: words, questions: mixed.slice(0, QUESTIONS), at: -1, score: 0, right: 0, streak: 0, bestStreak: 0, missed: [], timer: 0, next: 0, left: SECONDS };
    nextQuestion();
  }
  function nextQuestion() {
    window.clearInterval(game.timer);
    game.at += 1;
    if (game.at >= game.questions.length) { finish(); return; }
    const question = game.questions[game.at];
    const decoys = shuffle(game.all.filter((word) => word.w !== question.w)).slice(0, 3).map((word) => word.w);
    const buttons = shuffle([question.w, ...decoys]).map((word, index) => el('button', {
      type: 'button', class: 'hh-choice', translate: 'no', 'data-word': word,
      onclick: (event) => answer(question, word, event.currentTarget)
    }, [el('b', { 'aria-hidden': 'true', text: 'ABCD'[index] }), el('span', { text: word })]));
    game.fill = el('i');
    game.buttons = buttons;
    game.note = el('p', { class: 'mg-note', role: 'status' });
    game.left = SECONDS;
    game.done = false;
    root.replaceChildren(
      hud({
        onQuit: showSetup, at: game.at, total: game.questions.length, count: `${game.at + 1} of ${game.questions.length}`,
        extra: game.streak >= 2 ? el('span', { class: 'mg-streak', text: `${game.streak} in a row!` }) : null,
        stats: [['Score', String(game.score)]]
      }),
      el('div', { class: 'hh-timer', 'aria-hidden': 'true' }, [game.fill]),
      el('section', { class: 'mg-card-stage' }, [
        el('span', { class: 'mg-label', text: 'Hint' }),
        el('p', { class: 'mg-prompt hh-hint', translate: 'no', lang: choice.lang === 'tl' ? 'fil' : 'en', text: question.h }),
        el('div', { class: 'hh-choices' }, buttons),
        game.note
      ])
    );
    const startedAt = performance.now();
    game.timer = window.setInterval(() => {
      if (document.hidden) return;
      game.left = SECONDS - (performance.now() - startedAt) / 1000;
      game.fill.style.transform = `scaleX(${Math.max(0, game.left / SECONDS)})`;
      if (game.left <= 0) answer(question, null, null);
    }, 100);
  }
  function answer(question, word, button) {
    if (!game || game.done) return;
    game.done = true;
    window.clearInterval(game.timer);
    game.buttons.forEach((node) => {
      node.disabled = true;
      if (node.dataset.word === question.w) node.classList.add('is-right');
    });
    if (word === question.w) {
      const points = 10 + Math.round((Math.max(0, game.left) / SECONDS) * 5) + Math.min(game.streak, 5);
      game.score += points;
      game.right += 1;
      game.streak += 1;
      game.bestStreak = Math.max(game.bestStreak, game.streak);
      game.note.textContent = `Correct! +${points}`;
      game.note.classList.add('is-good');
      sfx('correct');
    } else {
      if (button) button.classList.add('is-wrong');
      game.streak = 0;
      game.missed.push(question);
      game.note.textContent = button ? `The word is "${question.w}".` : `Time is up! The word is "${question.w}".`;
      sfx('wrong');
    }
    game.next = window.setTimeout(nextQuestion, word === question.w ? 900 : 1900);
  }
  function finish() {
    const done = game;
    window.clearInterval(done.timer);
    game = null;
    results({
      heading: done.right === done.questions.length ? 'All correct!' : 'Well done!',
      score: done.score,
      key: key(),
      stats: [['Correct', `${done.right} of ${done.questions.length}`], ['Best streak', done.bestStreak]],
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
