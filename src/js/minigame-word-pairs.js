// Word Pairs (word_pairs.php): a memory game. Turn over two cards to match an
// English word with its Tagalog word. Fewer turns, more points.
(function () {
  const { root, el, sfx, svg, shuffle, LEVELS, setup, hud, results } = window.KoobdMinigameKit;
  // Each pair means one thing, and no word appears twice in a level.
  const PAIRS = {
    easy: [['dog', 'aso'], ['cat', 'pusa'], ['bird', 'ibon'], ['fish', 'isda'], ['house', 'bahay'], ['water', 'tubig'], ['book', 'aklat'], ['tree', 'puno'], ['rain', 'ulan'], ['moon', 'buwan'], ['egg', 'itlog'], ['milk', 'gatas'], ['chair', 'upuan'], ['door', 'pinto'], ['sun', 'araw'], ['star', 'bituin'], ['shoe', 'sapatos'], ['banana', 'saging'], ['chicken', 'manok'], ['horse', 'kabayo']],
    medium: [['teacher', 'guro'], ['friend', 'kaibigan'], ['school', 'paaralan'], ['flower', 'bulaklak'], ['mountain', 'bundok'], ['river', 'ilog'], ['sky', 'langit'], ['window', 'bintana'], ['kitchen', 'kusina'], ['bridge', 'tulay'], ['umbrella', 'payong'], ['forest', 'gubat'], ['turtle', 'pagong'], ['market', 'palengke'], ['farmer', 'magsasaka'], ['garden', 'hardin'], ['church', 'simbahan'], ['hospital', 'ospital'], ['hungry', 'gutom'], ['tired', 'pagod']],
    hard: [['rainbow', 'bahaghari'], ['volcano', 'bulkan'], ['weather', 'panahon'], ['freedom', 'kalayaan'], ['honesty', 'katapatan'], ['nature', 'kalikasan'], ['ocean', 'karagatan'], ['lightning', 'kidlat'], ['thunder', 'kulog'], ['science', 'agham'], ['dream', 'pangarap'], ['respectful', 'magalang'], ['obedient', 'masunurin'], ['harvest', 'anihan'], ['eagle', 'agila'], ['hero', 'bayani'], ['flag', 'watawat'], ['earthquake', 'lindol'], ['typhoon', 'bagyo'], ['knowledge', 'kaalaman']]
  };
  const SIZES = { easy: 6, medium: 8, hard: 10 };
  const choice = { level: 'easy' };
  let game = null;

  function showSetup() {
    stop();
    setup({
      title: 'Word Pairs',
      sub: 'Match each English word with its Tagalog word.',
      icon: 'M4 6a2 2 0 012-2h7a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2zM18 7l1.2.3a2 2 0 011.4 2.5l-2.3 8.7a2 2 0 01-2.4 1.4L12 19',
      steps: ['Turn over two cards.', 'Same meaning? They stay open.', 'Match them all in as few turns as you can.'],
      groups: [{ label: 'Level', options: LEVELS, get: () => choice.level, set: (value) => { choice.level = value; } }],
      bestKey: () => choice.level,
      onStart: start
    });
  }
  function stop() {
    if (game) { window.clearTimeout(game.flip); window.clearInterval(game.clock); }
    game = null;
  }
  function start() {
    stop();
    const pairs = shuffle(PAIRS[choice.level]).slice(0, SIZES[choice.level]);
    const cards = shuffle(pairs.flatMap((pair, id) => [{ id, word: pair[0], lang: 'EN' }, { id, word: pair[1], lang: 'TL' }]));
    game = { pairs, turns: 0, matched: 0, open: [], busy: false, seconds: 0, flip: 0, clock: 0 };
    game.turnsNode = el('span', { text: '0' });
    game.foundNode = el('span', { text: `0 of ${pairs.length}` });
    game.timeNode = el('span', { text: '0:00' });
    const grid = el('div', { class: `wp2-grid is-${choice.level}` }, cards.map((card) => {
      card.node = el('button', {
        type: 'button', class: 'wp2-card', 'aria-label': 'Hidden card', onclick: () => turn(card)
      }, [
        el('span', { class: 'wp2-back', 'aria-hidden': 'true' }, [svg('M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z')]),
        el('span', { class: 'wp2-face', translate: 'no' }, [el('small', { text: card.lang }), el('b', { text: card.word })])
      ]);
      return card.node;
    }));
    root.replaceChildren(
      hud({ onQuit: showSetup, count: el('span', {}, ['Found ', game.foundNode]), stats: [['Turns', game.turnsNode], ['Time', game.timeNode]] }),
      grid
    );
    game.clock = window.setInterval(() => {
      if (document.hidden) return;
      game.seconds += 1;
      game.timeNode.textContent = `${Math.floor(game.seconds / 60)}:${String(game.seconds % 60).padStart(2, '0')}`;
    }, 1000);
  }
  function show(card, on) {
    card.node.classList.toggle('is-open', on);
    card.node.setAttribute('aria-label', on ? `${card.word}, ${card.lang === 'EN' ? 'English' : 'Tagalog'}` : 'Hidden card');
  }
  function turn(card) {
    if (!game || game.busy || card.done || game.open.includes(card)) return;
    show(card, true);
    sfx('pop');
    game.open.push(card);
    if (game.open.length < 2) return;
    game.turns += 1;
    game.turnsNode.textContent = String(game.turns);
    const [first, second] = game.open;
    if (first.id === second.id) {
      first.done = true;
      second.done = true;
      first.node.classList.add('is-matched');
      second.node.classList.add('is-matched');
      game.open = [];
      game.matched += 1;
      game.foundNode.textContent = `${game.matched} of ${game.pairs.length}`;
      sfx('correct');
      if (game.matched === game.pairs.length) window.setTimeout(finish, 600);
      return;
    }
    // Not a pair: a moment to remember them, then they turn back.
    game.busy = true;
    sfx('wrong');
    first.node.classList.add('is-miss');
    second.node.classList.add('is-miss');
    game.flip = window.setTimeout(() => {
      [first, second].forEach((item) => { item.node.classList.remove('is-miss'); show(item, false); });
      game.open = [];
      game.busy = false;
    }, 1000);
  }
  function finish() {
    if (!game) return;
    const done = game;
    window.clearInterval(done.clock);
    game = null;
    // 20 points a pair; each turn beyond a perfect game costs 3 (never below 5 a pair).
    const count = done.pairs.length;
    const score = Math.max(count * 5, count * 20 - (done.turns - count) * 3);
    results({
      heading: done.turns === count ? 'A perfect game!' : 'All matched!',
      score,
      key: choice.level,
      stats: [['Turns', done.turns], ['Time', `${Math.floor(done.seconds / 60)}:${String(done.seconds % 60).padStart(2, '0')}`]],
      again: start,
      change: showSetup,
      changeLabel: 'Change level',
      extra: el('div', { translate: 'no' }, [
        el('h3', { class: 'mg-section', text: 'The pairs' }),
        el('ul', { class: 'wp2-list' }, done.pairs.map((pair) => el('li', {}, [el('b', { text: pair[0] }), el('span', { 'aria-hidden': 'true', text: '=' }), el('b', { text: pair[1] })])))
      ])
    });
  }
  showSetup();
})();
