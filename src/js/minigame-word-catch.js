// Word Catch (word_catch.php): words fall from the sky; tap the ones that
// match the target (animals, fruits, action words...). A wrong word costs a
// heart; a right word that lands only ends the combo. Three screens: set-up,
// the game, the results. The best score is kept by minigames_api.php.
(function () {
  const config = window.KOOBD_MINIGAME || { bests: {} };
  const root = document.getElementById('wc');
  if (!root) return;
  const lite = () => document.documentElement.classList.contains('koobd-lite');
  const sound = window.KoobdAudio || null;
  const sfx = (name, options) => { if (sound) sound.sfx(name, options); };
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    [].concat(children).forEach((child) => child !== null && child !== undefined && child !== false && node.append(child));
    return node;
  };
  const icon = (path) => {
    const span = document.createElement('span');
    span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
    return span.firstChild;
  };
  const shuffle = (list) => {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const words = (text) => text.split(' ');
  // Each target's line icon.
  const TARGET_ICONS = {
    paw: 'M12 12c-2.800 0-5.500 2.600-5.500 5.200 0 1.700 1.300 2.800 3 2.800 1 0 1.700-.5 2.500-.5s1.500.5 2.500.5c1.700 0 3-1.100 3-2.800 0-2.600-2.700-5.200-5.500-5.200zM5 8.500a1.800 2.200 0 100 4.400 1.800 2.200 0 000-4.400zM19 8.500a1.800 2.200 0 100 4.400 1.800 2.200 0 000-4.400zM9.300 4a1.800 2.300 0 100 4.600 1.800 2.300 0 000-4.600zM14.700 4a1.800 2.300 0 100 4.600 1.800 2.300 0 000-4.600z',
    fruit: 'M12 7c-1.8-1.3-4-1.4-5.6-.3C4 8.300 4 12 5.300 15.500 6.400 18.500 8.300 21 10 21c.8 0 1.300-.5 2-.5s1.200.5 2 .5c1.700 0 3.600-2.500 4.700-5.500C20 12 20 8.300 17.600 6.700 16 5.600 13.800 5.700 12 7zM12 7c0-1.700.8-3.200 2.500-4',
    palette: 'M12 3a9 9 0 100 18c1.400 0 2-.9 2-1.800 0-1.200-1-1.700-1-2.900 0-1 .8-1.800 1.800-1.800H17a4 4 0 004-4C21 6 17 3 12 3zM7.500 11h.01M9.500 7.500h.01M14 7h.01M17 10h.01',
    hand: 'M8 13V5.500a1.500 1.500 0 013 0V11M11 11V4a1.500 1.500 0 013 0v7M14 11V5.500a1.500 1.500 0 013 0V14c0 4-2.500 7-6 7-2.500 0-4-1-5.200-3L3.500 14a1.500 1.500 0 012.500-1.700L8 15',
    pencil: 'M4 20h4L19 9l-4-4L4 16zM13.500 6.500l4 4',
    job: 'M4 8h16v11H4zM9 8V5.500A1.500 1.500 0 0110.500 4h3A1.500 1.500 0 0115 5.500V8M4 13h16',
    pin: 'M12 21s7-6.200 7-11.500A7 7 0 005 9.500C5 14.800 12 21 12 21zM12 7.500a2 2 0 100 4 2 2 0 000-4z',
    cloud: 'M7 18a4 4 0 01-.6-7.950A5.500 5.500 0 0117 9a4.500 4.500 0 010 9z',
    box: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
    bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
    spark: 'M12 3l1.900 5.100L19 10l-5.100 1.900L12 17l-1.900-5.100L5 10l5.100-1.900zM19 16l.8 2.200L22 19l-2.200.8L19 22l-.8-2.200L16 19l2.200-.8z'
  };

  // --- The vocabulary --------------------------------------------------------------------
  // Each level's categories never share a word, so a word is only ever right
  // for its own category.
  const CATEGORIES = {
    en: {
      easy: [
        { icon: 'paw', name: 'ANIMALS', one: 'an animal', words: words('dog cat bird fish cow pig duck frog horse lion goat rabbit sheep bear zebra tiger') },
        { icon: 'fruit', name: 'FRUITS', one: 'a fruit', words: words('apple banana mango grapes lemon papaya melon pear cherry guava pineapple orange strawberry coconut') },
        { icon: 'palette', name: 'COLORS', one: 'a color', words: words('red blue green yellow purple pink black white brown gray violet gold silver') },
        { icon: 'hand', name: 'BODY PARTS', one: 'a body part', words: words('hand foot nose eye ear mouth knee head hair arm finger toe neck shoulder') }
      ],
      medium: [
        { icon: 'pencil', name: 'SCHOOL THINGS', one: 'a school thing', words: words('pencil eraser ruler notebook crayon chair blackboard scissors glue bag chalk folder paper') },
        { icon: 'job', name: 'JOBS', one: 'a job', words: words('doctor teacher farmer pilot nurse baker driver chef firefighter tailor dentist singer barber') },
        { icon: 'pin', name: 'PLACES', one: 'a place', words: words('school market church park hospital library bakery beach farm zoo mall museum bank') },
        { icon: 'cloud', name: 'WEATHER', one: 'a kind of weather', words: words('rain wind cloud storm thunder rainbow lightning fog snow typhoon sunshine hail breeze') }
      ],
      hard: [
        { icon: 'box', name: 'NAMING WORDS (NOUNS)', one: 'a naming word', words: words('table river book house garden window mountain shoes flower umbrella spoon ladder bridge pillow mirror') },
        { icon: 'bolt', name: 'ACTION WORDS (VERBS)', one: 'an action word', words: words('run jump swim write read sing dance cook climb laugh sleep throw wash draw carry catch') },
        { icon: 'spark', name: 'DESCRIBING WORDS (ADJECTIVES)', one: 'a describing word', words: words('tall happy soft bright heavy quiet brave tiny noisy gentle smooth clean sweet cold strong wide') }
      ]
    },
    tl: {
      easy: [
        { icon: 'paw', name: 'HAYOP', one: 'hayop', words: words('aso pusa ibon isda baka baboy pato palaka kabayo kambing kuneho unggoy tigre ahas usa tupa') },
        { icon: 'fruit', name: 'PRUTAS', one: 'prutas', words: words('mansanas saging mangga ubas pakwan papaya bayabas pinya santol lansones atis niyog dalandan suha') },
        { icon: 'palette', name: 'KULAY', one: 'kulay', words: words('pula asul berde dilaw lila kahel itim puti kayumanggi abo ginto pilak') },
        { icon: 'hand', name: 'BAHAGI NG KATAWAN', one: 'bahagi ng katawan', words: words('kamay paa ilong mata tainga bibig tuhod ulo buhok braso daliri leeg balikat pisngi') }
      ],
      medium: [
        { icon: 'pencil', name: 'GAMIT SA PAARALAN', one: 'gamit sa paaralan', words: words('lapis pambura panukat kuwaderno krayola upuan pisara gunting pandikit aklat papel mapa tisa') },
        { icon: 'job', name: 'HANAPBUHAY', one: 'hanapbuhay', words: words('doktor guro magsasaka piloto nars panadero tsuper kusinero mananahi bumbero pulis dentista barbero') },
        { icon: 'pin', name: 'LUGAR', one: 'lugar', words: words('paaralan palengke simbahan parke ospital aklatan panaderya dalampasigan bukid plasa museo bangko tindahan') },
        { icon: 'cloud', name: 'PANAHON', one: 'tungkol sa panahon', words: words('ulan hangin ulap bagyo kulog bahaghari kidlat hamog ambon baha tagtuyot') }
      ],
      hard: [
        { icon: 'box', name: 'PANGNGALAN', one: 'pangngalan', words: words('mesa ilog bahay hardin bintana bundok sapatos bulaklak payong kutsara hagdan damit tulay unan salamin') },
        { icon: 'bolt', name: 'PANDIWA', one: 'pandiwa', words: words('tumakbo tumalon lumangoy sumulat magbasa umawit sumayaw magluto umakyat tumawa matulog maghugas gumuhit tumulong sumigaw') },
        { icon: 'spark', name: 'PANG-URI', one: 'pang-uri', words: words('matangkad masaya malambot maliwanag mabigat tahimik matapang maliit maingay mabait makinis malinis matamis malamig malakas malawak') }
      ]
    }
  };
  const LEVELS = {
    easy: { label: 'Easy', fall: 7.2, every: 1.35, max: 5 },
    medium: { label: 'Medium', fall: 5.8, every: 1.05, max: 6 },
    hard: { label: 'Hard', fall: 4.6, every: 0.85, max: 7 }
  };
  const GAME_SECONDS = 60;
  const CATCHES_PER_TARGET = 6;
  const HEART = 'M12 20.5s-7.5-4.6-9.3-9.4C1.5 7.8 3.6 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.4 0 5.5 3.3 4.3 6.6-1.8 4.8-9.3 9.4-9.3 9.4z';

  const choice = { lang: 'en', level: 'easy' };
  const variant = () => `${choice.lang}-${choice.level}`;
  const bestOf = (key) => (config.bests[key] ? config.bests[key].best : 0);

  // --- Set-up ----------------------------------------------------------------------------
  function backLinks() {
    return el('nav', { class: 'mg-nav', 'aria-label': 'Back' }, [
      el('a', { class: 'mg-back', href: 'minigames.php' }, [icon('M15 6l-6 6 6 6'), 'Minigames']),
      el('a', { class: 'mg-back', href: 'profile.php', text: 'My Profile' })
    ]);
  }
  function optionGroup(label, cols, options, current, pick) {
    const buttons = options.map(([value, text]) => el('button', {
      type: 'button', class: 'mg-choice', 'aria-pressed': value === current ? 'true' : 'false',
      onclick: (event) => {
        buttons.forEach((button) => button.setAttribute('aria-pressed', 'false'));
        event.currentTarget.setAttribute('aria-pressed', 'true');
        sfx('select');
        pick(value);
      }
    }, [text]));
    return el('div', { class: 'mg-group' }, [el('span', { class: 'mg-group-label', text: label }), el('div', { class: 'mg-seg', role: 'group', 'aria-label': label }, buttons)]);
  }
  function showSetup() {
    stopGame();
    const best = el('span', { class: 'mg-best' });
    const refreshBest = () => {
      const value = bestOf(variant());
      best.replaceChildren(value ? 'Best ' : 'Not played yet', value ? el('strong', { text: String(value) }) : '');
    };
    refreshBest();
    root.replaceChildren(
      backLinks(),
      el('header', { class: 'mg-hero' }, [
        el('span', { class: 'mg-hero-icon' }, [icon('M12 3v9M8 8l4 4 4-4M4 15v3a3 3 0 003 3h10a3 3 0 003-3v-3')]),
        el('div', { class: 'mg-hero-text' }, [el('h1', { text: 'Word Catch' }), el('p', { text: 'Catch the right words before they land.' })])
      ]),
      el('section', { class: 'mg-panel' }, [
        el('ol', { class: 'mg-howto' }, [
          el('li', {}, [el('b', { text: '1' }), el('span', { text: 'Read the target at the top.' })]),
          el('li', {}, [el('b', { text: '2' }), el('span', { text: 'Tap the falling words that match it.' })]),
          el('li', {}, [el('b', { text: '3' }), el('span', { text: 'A wrong word costs a heart. You have 3.' })])
        ]),
        el('div', { class: 'mg-setup-row' }, [
          optionGroup('Language', 2, [['en', 'English'], ['tl', 'Filipino']], choice.lang, (value) => { choice.lang = value; refreshBest(); }),
          optionGroup('Level', 3, Object.entries(LEVELS).map(([key, level]) => [key, level.label]), choice.level, (value) => { choice.level = value; refreshBest(); })
        ]),
        el('div', { class: 'mg-card-foot' }, [best, el('button', { type: 'button', class: 'mg-btn mg-btn-accent', onclick: startGame, text: 'Start' })])
      ])
    );
  }

  // --- The game --------------------------------------------------------------------------
  let game = null;
  function stopGame() {
    if (game) {
      window.cancelAnimationFrame(game.raf);
      window.clearTimeout(game.noteTimer);
      game.counters.forEach((timer) => window.clearTimeout(timer));
    }
    game = null;
  }
  function startGame() {
    stopGame();
    const heartNodes = [0, 1, 2].map(() => {
      const span = document.createElement('span');
      span.innerHTML = `<svg class="wc-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="${HEART}"/></svg>`;
      return span.firstChild;
    });
    const hearts = el('div', { class: 'wc-hearts', role: 'img', 'aria-label': '3 hearts left' }, heartNodes);
    const scoreValue = el('span', { text: '0' });
    const timerFill = el('i');
    const target = el('div', { class: 'wc-target', 'aria-live': 'polite', translate: 'no' });
    const combo = el('div', { class: 'wc-combo', hidden: true });
    const note = el('div', { class: 'wc-note', role: 'status', translate: 'no', hidden: true });
    const count = el('div', { class: 'wc-count', 'aria-hidden': 'true' });
    const field = el('div', { class: 'wc-field' }, [el('div', { class: 'wc-ground' })]);
    const quit = el('button', { type: 'button', class: 'mg-quit', 'aria-label': 'Quit the game', onclick: showSetup }, [icon('M6 6l12 12M18 6L6 18')]);
    const stage = el('section', { class: 'wc-game', 'aria-label': 'Word Catch' }, [
      el('div', { class: 'wc-bar' }, [quit, hearts, el('div', { class: 'wc-score' }, [el('small', { text: 'Score' }), scoreValue])]),
      el('div', { class: 'wc-timer', 'aria-hidden': 'true' }, [timerFill]),
      field, target, combo, note, count
    ]);
    root.replaceChildren(stage);
    stage.scrollIntoView({ block: 'nearest' });

    const level = LEVELS[choice.level];
    const categories = CATEGORIES[choice.lang][choice.level];
    game = {
      level, categories, order: shuffle(categories), targetAt: -1, target: null, inTarget: 0,
      items: [], hearts: 3, score: 0, combo: 0, bestCombo: 0, right: 0, wrong: 0, missed: 0,
      sinceRight: 0, left: GAME_SECONDS, nextSpawn: 0, last: 0, raf: 0, noteTimer: 0, counters: [], over: false,
      nodes: { stage, field, target, combo, note, hearts, heartNodes, scoreValue, timerFill, count }
    };
    nextTarget();
    // 3, 2, 1, then the words start to fall.
    let number = 3;
    const tick = () => {
      if (!game) return;
      if (number === 0) {
        count.remove();
        sfx('go');
        game.last = performance.now();
        game.raf = window.requestAnimationFrame(frame);
        return;
      }
      count.textContent = String(number);
      sfx('tick');
      number -= 1;
      game.counters.push(window.setTimeout(tick, 750));
    };
    tick();
  }
  function nextTarget() {
    game.targetAt = (game.targetAt + 1) % game.order.length;
    game.target = game.order[game.targetAt];
    game.inTarget = 0;
    const node = game.nodes.target;
    node.replaceChildren(
      el('span', { class: 'wc-target-icon', 'aria-hidden': 'true' }, [icon(TARGET_ICONS[game.target.icon])]),
      choice.lang === 'tl' ? 'Saluhin ang ' : 'Catch: ',
      el('strong', { text: game.target.name })
    );
    node.classList.remove('is-new');
    void node.offsetWidth;
    node.classList.add('is-new');
    // Words of the old target still falling now count as wrong words, so they go.
    game.items.forEach((item) => { if (!item.done && item.right) dropItem(item); });
    game.items.forEach((item) => { item.right = item.category === game.target; });
  }
  function dropItem(item) {
    item.done = true;
    item.node.remove();
  }
  function spawn() {
    const onScreen = new Set(game.items.filter((item) => !item.done).map((item) => item.word));
    // About half are right; never more than two wrong ones in a row. (Always
    // sending a right word when none is on screen would leave a quick player
    // nothing wrong to avoid.)
    const wantRight = game.sinceRight >= 2 || Math.random() < 0.45;
    const others = game.categories.filter((category) => category !== game.target);
    const category = wantRight ? game.target : others[Math.floor(Math.random() * others.length)];
    const open = category.words.filter((word) => !onScreen.has(word));
    if (!open.length) return;
    const word = open[Math.floor(Math.random() * open.length)];
    game.sinceRight = wantRight ? 0 : game.sinceRight + 1;
    const node = el('button', { type: 'button', class: 'wc-word', translate: 'no', text: word });
    game.nodes.field.append(node);
    const width = game.nodes.field.clientWidth;
    const margin = 8;
    const x = margin + Math.random() * Math.max(0, width - node.offsetWidth - margin * 2);
    const item = { node, word, category, right: category === game.target, x, y: -56, done: false };
    node.style.transform = `translate3d(${x}px, ${item.y}px, 0)`;
    // On press, not on release: a falling word must not slip out from under the finger.
    node.addEventListener('pointerdown', (event) => { event.preventDefault(); tap(item); });
    node.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); tap(item); } });
    game.items.push(item);
  }
  function popText(item, text) {
    const pop = el('span', { class: 'wc-pop', 'aria-hidden': 'true', text });
    pop.style.left = `${item.x + 12}px`;
    pop.style.top = `${Math.max(90, item.y)}px`;
    game.nodes.field.append(pop);
    window.setTimeout(() => pop.remove(), 700);
  }
  function showNote(text) {
    const { note } = game.nodes;
    note.textContent = text;
    note.hidden = false;
    window.clearTimeout(game.noteTimer);
    game.noteTimer = window.setTimeout(() => { note.hidden = true; }, 1500);
  }
  function renderCombo() {
    const { combo } = game.nodes;
    combo.hidden = game.combo < 3;
    combo.textContent = `${game.combo} in a row!`;
  }
  function tap(item) {
    if (!game || game.over || item.done) return;
    item.done = true;
    if (item.right) {
      const points = 10 + Math.min(game.combo, 5) * 2;
      game.score += points;
      game.right += 1;
      game.combo += 1;
      game.bestCombo = Math.max(game.bestCombo, game.combo);
      game.inTarget += 1;
      game.nodes.scoreValue.textContent = String(game.score);
      item.node.classList.add('is-right');
      popText(item, `+${points}`);
      sfx(game.combo >= 3 ? 'sparkle' : 'collect');
      window.setTimeout(() => item.node.remove(), 180);
      renderCombo();
      if (game.inTarget >= CATCHES_PER_TARGET) {
        sfx('point');
        nextTarget();
      }
      return;
    }
    // A wrong word: red, a heart gone, and what it was not.
    game.wrong += 1;
    game.combo = 0;
    renderCombo();
    item.node.classList.add('is-wrong');
    window.setTimeout(() => item.node.remove(), 320);
    showNote(choice.lang === 'tl' ? `Hindi ${game.target.one} ang "${item.word}".` : `"${item.word}" is not ${game.target.one}.`);
    sfx('wrong');
    game.hearts -= 1;
    const lost = game.nodes.heartNodes[game.hearts];
    lost.classList.add('is-lost', 'is-breaking');
    game.nodes.hearts.setAttribute('aria-label', `${game.hearts} hearts left`);
    if (game.hearts <= 0) endGame('hearts');
  }
  function frame(now) {
    if (!game || game.over) return;
    game.raf = window.requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - game.last) / 1000);
    if (lite() && dt < 0.03) return;
    game.last = now;
    game.left -= dt;
    game.nodes.timerFill.style.transform = `scaleX(${Math.max(0, game.left / GAME_SECONDS)})`;
    if (game.left <= 0) { endGame('time'); return; }
    const height = game.nodes.field.clientHeight;
    const speed = height / game.level.fall;
    game.nextSpawn -= dt;
    if (game.nextSpawn <= 0 && game.items.filter((item) => !item.done).length < game.level.max) {
      spawn();
      game.nextSpawn = game.level.every * (0.85 + Math.random() * 0.3);
    }
    game.items.forEach((item) => {
      if (item.done) return;
      item.y += speed * dt;
      item.node.style.transform = `translate3d(${item.x}px, ${item.y}px, 0)`;
      if (item.y > height - 34 - item.node.offsetHeight * 0.4) {
        // A right word landed: no heart lost, but the combo ends.
        if (item.right) {
          game.missed += 1;
          game.combo = 0;
          renderCombo();
        }
        dropItem(item);
      }
    });
    if (game.items.length > 40) game.items = game.items.filter((item) => !item.done);
  }
  // A hidden page pauses by itself (no animation frames); the clock must not
  // jump when it comes back (dt is capped above).

  // --- The results -----------------------------------------------------------------------
  async function endGame(reason) {
    const done = game;
    done.over = true;
    window.cancelAnimationFrame(done.raf);
    window.clearTimeout(done.noteTimer);
    const tapped = done.right + done.wrong;
    const accuracy = tapped ? Math.round((done.right / tapped) * 100) : 0;
    const key = variant();
    const before = bestOf(key);
    const newBestTag = el('span', { class: 'mg-newbest', hidden: true, text: 'New best score!' });
    const bestValue = el('dd', { text: String(Math.max(before, done.score)) });
    const saveStatus = el('p', { class: 'mg-save-status', role: 'status', hidden: true });
    sfx(reason === 'time' && done.hearts > 0 ? 'success' : 'fail');
    game = null;
    root.replaceChildren(
      backLinks(),
      el('section', { class: 'mg-panel mg-result' }, [
        el('div', { class: 'mg-result-top' }, [
          el('h2', { text: reason === 'time' ? 'Time is up!' : 'Out of hearts!' }),
          el('p', { class: 'mg-score', text: String(done.score) }),
          newBestTag
        ]),
        el('div', { class: 'mg-result-body' }, [
          el('dl', { class: 'mg-stats' }, [
            el('div', {}, [el('dt', { text: 'Caught' }), el('dd', { text: String(done.right) })]),
            el('div', {}, [el('dt', { text: 'Wrong' }), el('dd', { text: String(done.wrong) })]),
            el('div', {}, [el('dt', { text: 'Accuracy' }), el('dd', { text: `${accuracy}%` })]),
            el('div', {}, [el('dt', { text: 'Best streak' }), el('dd', { text: String(done.bestCombo) })]),
            el('div', {}, [el('dt', { text: 'Best score' }), bestValue])
          ]),
          el('div', { class: 'mg-actions' }, [
            el('button', { type: 'button', class: 'mg-btn mg-btn-accent', onclick: startGame, text: 'Play again' }),
            el('button', { type: 'button', class: 'mg-btn mg-btn-ghost', onclick: showSetup, text: 'Change level' }),
            el('a', { class: 'mg-btn mg-btn-ghost', href: 'minigames.php', text: 'Minigames' })
          ]),
          saveStatus
        ])
      ])
    );
    try {
      const response = await fetch('minigames_api.php', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', game: 'wordcatch', variant: key, score: done.score })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || 'Your score could not be saved.');
      config.bests[key] = { best: result.best, plays: result.plays };
      bestValue.textContent = String(result.best);
      if (result.newBest && before > 0) newBestTag.hidden = false;
      if (result.newUnlock) {
        saveStatus.hidden = false;
        saveStatus.classList.add('is-unlocked');
        saveStatus.replaceChildren(
          `New minigame unlocked: ${result.newUnlock.title}. `,
          el('a', { href: result.newUnlock.href, text: `Play ${result.newUnlock.title}` })
        );
      }
    } catch (problem) {
      saveStatus.hidden = false;
      saveStatus.setAttribute('role', 'alert');
      saveStatus.textContent = problem.message || 'Your score could not be saved. Check your connection and try again.';
    }
  }

  showSetup();
})();
