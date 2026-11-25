// Sentence Builder (sentence_builder.php): 8 sentences with their words mixed
// up. Tap the words in order to build the sentence; tap a placed word to take
// it back. Fewer wrong tries, more points; after three, the sentence is shown.
(function () {
  const { root, el, sfx, shuffle, LEVELS, LANGS, setup, hud, results } = window.KoobdMinigameKit;
  // Each sentence, with any other order that is just as correct. The tiles
  // show the words in small letters (names keep their capital), so the first
  // word and the end mark do not give the answer away.
  const SENTENCES = {
    en: {
      easy: [
        ['The cat is sleeping.'], ['I like to read books.'], ['She has a red bag.'], ['We play in the park.'], ['The dog runs very fast.'],
        ['My mother cooks rice.'], ['The sun is very hot.'], ['He drinks cold water.'], ['Birds can fly high.'], ['I love my family.'],
        ['The baby is crying.'], ['They eat ripe mangoes.']
      ],
      medium: [
        ['My sister sings a beautiful song.'], ['The teacher wrote on the board.'], ['We planted trees behind the school.'], ['The little boy lost his new shoes.'],
        ['Rain fell on the old house.'], ['Maria shared her lunch with me.'], ['The farmer feeds his animals every morning.', 'Every morning the farmer feeds his animals.'],
        ['I washed the dishes after dinner.', 'After dinner I washed the dishes.'], ['Our class visited the big museum.'], ['The fish swim in the clear river.'],
        ['My father drives a blue jeepney.'], ['The children are playing in the garden.']
      ],
      hard: [
        ['The brave firefighter saved the family from the fire.'], ['My grandmother tells us stories before we go to sleep.', 'Before we go to sleep my grandmother tells us stories.'],
        ['The students cleaned their classroom because it was very dirty.', 'Because it was very dirty the students cleaned their classroom.'],
        ['Although it was raining, we still went to school.', 'We still went to school although it was raining.'],
        ['The scientist looked at the tiny insect with a lens.'], ['We should always tell the truth to our parents.'],
        ['The old man walked slowly across the narrow bridge.'], ['Mia was happy because her friend gave her a gift.', 'Because her friend gave her a gift Mia was happy.'],
        ['Farmers work hard so that we have food to eat.'], ['The big storm knocked down many trees in our town.'],
        ['My brother practices the guitar every day after school.', 'Every day after school my brother practices the guitar.', 'After school my brother practices the guitar every day.'],
        ['The library is a quiet place for reading books.']
      ]
    },
    tl: {
      easy: [
        ['Ang pusa ay natutulog.'], ['Mahilig akong magbasa ng aklat.'], ['Si Nanay ay nagluluto.'], ['Maganda ang bulaklak.'], ['Ang aso ay tumatakbo.'],
        ['Masaya ang mga bata.'], ['Mainit ang araw ngayon.', 'Ngayon mainit ang araw.'], ['Umiinom ako ng tubig.'], ['Mabait ang aking guro.'], ['Malaki ang aming bahay.'],
        ['Kumain kami ng mangga.'], ['Mahal ko ang pamilya ko.']
      ],
      medium: [
        ['Ang mga bata ay naglalaro sa parke.', 'Sa parke ay naglalaro ang mga bata.'], ['Si Tatay ay nagtatanim ng puno.'], ['Bumili si Nanay ng isda sa palengke.'],
        ['Masipag mag-aral ang aking kapatid.'], ['Nagsusulat ang guro sa pisara.'], ['Ang ibon ay lumilipad sa langit.', 'Sa langit ay lumilipad ang ibon.'],
        ['Umuulan nang malakas kahapon.', 'Kahapon umuulan nang malakas.'], ['Tinulungan ko ang aking lola.'], ['Maalat ang tubig sa dagat.'],
        ['Maaga akong pumapasok sa paaralan.'], ['Si Ana ay kumakanta ng magandang awit.'], ['Naglilinis kami ng aming silid-aralan.']
      ],
      hard: [
        ['Ang matapang na bumbero ay nagligtas sa pamilya.'], ['Nagkukuwento si Lola bago kami matulog.', 'Bago kami matulog nagkukuwento si Lola.'],
        ['Dapat nating alagaan ang ating kalikasan.'], ['Masaya si Paolo dahil pumasa siya sa pagsusulit.', 'Dahil pumasa siya sa pagsusulit masaya si Paolo.'],
        ['Nag-aral nang mabuti ang mga mag-aaral para sa pagsusulit.'], ['Ang masipag na magsasaka ay nagtatanim ng palay.'],
        ['Hindi kami nakalabas dahil malakas ang bagyo.', 'Dahil malakas ang bagyo hindi kami nakalabas.'], ['Laging nagsasabi ng totoo ang batang matapat.'],
        ['Nagdiriwang ang mga Pilipino ng Araw ng Kalayaan.'], ['Tumutulong ang mga bata sa paglilinis ng paaralan.'],
        ['Mataas ang pangarap ng aking kapatid na babae.'], ['Sumulat ako ng liham para sa aking guro.']
      ]
    }
  };
  const ROUNDS = 8;
  const POINTS = [15, 10, 5];
  const choice = { lang: 'en', level: 'easy' };
  const key = () => `${choice.lang}-${choice.level}`;
  let game = null;

  // A sentence's words, without its end mark or commas.
  const NAMES = new Set(['Maria', 'Mia', 'Nanay', 'Tatay', 'Ana', 'Lola', 'Paolo', 'Pilipino', 'Araw', 'Kalayaan', 'I']);
  const tokens = (sentence) => sentence.replace(/[.,!?]/g, '').split(' ');
  const shown = (word, index, sentence) => {
    // Keep a real name's capital; "Araw" is only a name in "Araw ng Kalayaan".
    if (word === 'I' || (NAMES.has(word) && !(word === 'Araw' && !sentence.includes('Araw ng Kalayaan')))) return word;
    return word.toLowerCase();
  };
  const normal = (sentence) => tokens(sentence).join(' ').toLowerCase();

  function showSetup() {
    if (game) window.clearTimeout(game.next);
    game = null;
    setup({
      title: 'Sentence Builder',
      sub: 'Put the words in the right order.',
      icon: 'M4 7h6v4H4zM13 7h7v4h-7zM4 15h9v4H4zM16 15h4v4h-4z',
      steps: ['Tap the words in order.', 'Tap a placed word to take it back.', 'Get it right on the first try for the most points.'],
      groups: [
        { label: 'Language', options: LANGS, get: () => choice.lang, set: (value) => { choice.lang = value; } },
        { label: 'Level', options: LEVELS, get: () => choice.level, set: (value) => { choice.level = value; } }
      ],
      bestKey: key,
      onStart: start
    });
  }
  function start() {
    if (game) window.clearTimeout(game.next);
    game = { list: shuffle(SENTENCES[choice.lang][choice.level]).slice(0, ROUNDS), at: -1, score: 0, solved: 0, firstTry: 0, missed: [], next: 0 };
    nextSentence();
  }
  function nextSentence() {
    game.at += 1;
    if (game.at >= game.list.length) { finish(); return; }
    const answers = game.list[game.at];
    game.answers = answers;
    game.main = answers[0];
    game.tries = 0;
    game.placed = [];
    game.locked = false;
    const words = tokens(game.main);
    // Mixed up, and never already in a right order.
    let mixed = shuffle(words);
    const accepted = new Set(answers.map(normal));
    let guard = 0;
    while (accepted.has(mixed.join(' ').toLowerCase()) && guard < 20) { mixed = shuffle(words); guard += 1; }
    game.bank = mixed.map((word) => el('button', {
      type: 'button', class: 'sb-word', translate: 'no', 'data-word': word, text: shown(word, 0, game.main),
      onclick: (event) => place(event.currentTarget)
    }));
    game.line = el('div', { class: 'sb-line', translate: 'no', 'aria-label': 'Your sentence' });
    game.note = el('p', { class: 'mg-note', role: 'status' });
    game.triesNode = el('span', { class: 'lm-tries', text: 'First try' });
    game.clearBtn = el('button', { type: 'button', class: 'mg-btn mg-btn-ghost', onclick: clearLine, text: 'Clear' });
    game.checkBtn = el('button', { type: 'button', class: 'mg-btn mg-btn-accent', onclick: check, text: 'Check', disabled: true });
    root.replaceChildren(
      hud({ onQuit: showSetup, at: game.at, total: game.list.length, count: `${game.at + 1} of ${game.list.length}`, stats: [['Score', String(game.score)]] }),
      el('section', { class: 'mg-card-stage' }, [
        game.line,
        el('div', { class: 'sb-bank' }, game.bank),
        game.note,
        el('div', { class: 'lm-tools' }, [
          game.triesNode,
          el('div', { style: 'display:flex;gap:8px' }, [game.clearBtn, game.checkBtn])
        ])
      ])
    );
    renderLine();
  }
  function renderLine() {
    if (!game.placed.length) {
      game.line.replaceChildren(el('span', { class: 'sb-line-empty', text: 'Tap the words below' }));
    } else {
      game.line.replaceChildren(...game.placed.map((tile, index) => el('button', {
        type: 'button', class: 'sb-word', text: tile.textContent, 'aria-label': `Take back ${tile.textContent}`,
        onclick: () => takeBack(index)
      })));
    }
    game.checkBtn.disabled = game.locked || game.placed.length !== game.bank.length;
  }
  function place(tile) {
    if (game.locked || tile.disabled) return;
    tile.disabled = true;
    game.placed.push(tile);
    game.note.textContent = '';
    sfx('pop');
    renderLine();
  }
  function takeBack(index) {
    if (game.locked) return;
    const [tile] = game.placed.splice(index, 1);
    tile.disabled = false;
    sfx('toggle');
    renderLine();
  }
  function clearLine() {
    if (game.locked) return;
    game.placed.forEach((tile) => { tile.disabled = false; });
    game.placed = [];
    renderLine();
  }
  function showFinal(sentence, good) {
    game.locked = true;
    game.line.classList.toggle('is-right', good);
    game.line.replaceChildren(el('p', { class: 'sb-done', text: sentence }));
    game.clearBtn.disabled = true;
    game.checkBtn.disabled = true;
  }
  function check() {
    if (game.locked || game.placed.length !== game.bank.length) return;
    const written = game.placed.map((tile) => tile.dataset.word).join(' ').toLowerCase();
    const matched = game.answers.find((answer) => normal(answer) === written);
    if (matched) {
      const points = POINTS[Math.min(game.tries, POINTS.length - 1)];
      game.score += points;
      game.solved += 1;
      if (game.tries === 0) game.firstTry += 1;
      showFinal(matched, true);
      game.note.textContent = choice.lang === 'tl' ? `Tama! +${points}` : `Correct! +${points}`;
      game.note.classList.add('is-good');
      sfx('word');
      game.next = window.setTimeout(nextSentence, 1500);
      return;
    }
    game.tries += 1;
    sfx('wrong');
    game.line.classList.remove('is-shake');
    void game.line.offsetWidth;
    game.line.classList.add('is-shake');
    if (game.tries >= POINTS.length) {
      game.missed.push(game.main);
      showFinal(game.main, false);
      game.note.textContent = choice.lang === 'tl' ? 'Ito ang tamang pangungusap.' : 'This is the right sentence.';
      game.next = window.setTimeout(nextSentence, 2800);
      return;
    }
    game.note.textContent = choice.lang === 'tl' ? 'Hindi pa. Subukan ulit.' : 'Not quite. Try again.';
    game.triesNode.textContent = game.tries === 1 ? 'Second try' : 'Last try';
  }
  function finish() {
    const done = game;
    game = null;
    results({
      heading: done.solved === done.list.length ? 'All correct!' : 'Well done!',
      score: done.score,
      key: key(),
      stats: [['Solved', `${done.solved} of ${done.list.length}`], ['First try', done.firstTry]],
      again: start,
      change: showSetup,
      changeLabel: 'Change level',
      extra: done.missed.length ? el('div', { translate: 'no' }, [
        el('h3', { class: 'mg-section', text: 'Sentences to practise' }),
        el('ul', { class: 'fs-answers' }, done.missed.map((sentence) => el('li', { class: 'fs-answer' }, [el('div', { class: 'fs-answer-head' }, [el('span', { class: 'fs-to', text: sentence })])])))
      ]) : null
    });
  }
  showSetup();
})();
