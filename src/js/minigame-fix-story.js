// Fix the Story (fix_story.php): a short story with mistakes in it. Tap a word
// that looks wrong; if it is a mistake, choose the fix and read why. At the
// end: the score, every answer explained, and the corrected story. The best
// score per story is kept by minigames_api.php.
(function () {
  const config = window.KOOBD_MINIGAME || { bests: {} };
  const root = document.getElementById('fs');
  if (!root) return;
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
  const shuffle = (list) => {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  // --- The stories -----------------------------------------------------------------------
  // A story is plain text and mistakes, in order. A mistake: what is written,
  // the right answer, its kind, why, and other wrong choices to pick from.
  const m = (wrong, right, kind, why, others = []) => ({ wrong, right, kind, why, others });
  const KINDS = {
    spelling: { en: 'Spelling', tl: 'Pagbaybay' },
    grammar: { en: 'Grammar', tl: 'Gramatika' },
    punctuation: { en: 'Punctuation and capitals', tl: 'Bantas at malaking titik' },
    word: { en: 'Word choice', tl: 'Pagpili ng salita' },
    order: { en: 'Sentence order', tl: 'Ayos ng pangungusap' }
  };
  const STORIES = {
    en: [
      { id: 'en-puppy', title: 'The Lost Puppy', level: 'easy', parts: [
        'Last ', m('saturday', 'Saturday', 'punctuation', 'Days of the week always start with a capital letter.'),
        ', Mia found a small puppy near the park. The puppy was wet and ', m('hungrey', 'hungry', 'spelling', '"Hungry" has no "e" before the "y".', ['hungree']),
        '. Mia ', m('carry', 'carried', 'grammar', 'This happened in the past, so we use the past form "carried".', ['carrying']),
        ' it home in her arms. Her mother gave the puppy some warm milk. The puppy wagged ', m("it's", 'its', 'word', '"Its" shows something belongs to it. "It\'s" means "it is".', ['its\'']),
        ' tail happily. ', m("The next day, a boy knocked on the door. Mia and her mother put up posters with the puppy's picture.", "Mia and her mother put up posters with the puppy's picture. The next day, a boy knocked on the door.", 'order', 'First they put up the posters. The boy came the next day because he saw them.'),
        ' "That is my puppy, Bantay!" he said. The boy was very ', m('thankfull', 'thankful', 'spelling', 'The ending "-ful" has only one "l".', ['thankfool']), '.'
      ] },
      { id: 'en-beach', title: 'A Day at the Beach', level: 'easy', parts: [
        'My family went to the beach on a hot day. The sun was ', m('shinning', 'shining', 'spelling', '"Shining" has only one "n" in the middle.', ['shineing']),
        ' and the water was clear and blue. My little brother and ', m('me', 'I', 'grammar', 'Use "I" when you are one of the people doing the action: "My brother and I built".', ['myself']),
        ' built a big sand castle. ', m('we', 'We', 'punctuation', 'A sentence always starts with a capital letter.'),
        ' found pretty shells along the shore. Mom told us to ', m('where', 'wear', 'word', '"Wear" is what we do with clothes and hats. "Where" asks about a place.', ['were']),
        ' our hats so we would not get sunburned. The waves ', m('was', 'were', 'grammar', '"Waves" means more than one, so we use "were".', ['is']),
        ' big, so we stayed near the sand. At the end of the day, I asked my brother, "Do you want to come back next ', m('week."', 'week?"', 'punctuation', 'This is a question, so it ends with a question mark.', ['week!"']),
        ' He smiled and said yes.'
      ] },
      { id: 'en-garden', title: 'The School Garden', level: 'medium', parts: [
        'Our class started a garden behind the school. Every morning, we ', m('waters', 'water', 'grammar', 'With "we", the verb has no "-s": "we water".', ['watering']),
        ' the plants before class. Ms. Reyes taught us how to plant ', m('tomatos', 'tomatoes', 'spelling', 'Words like "tomato" add "-es" when there are many.', ["tomato's"]),
        ' and eggplants. ', m('After a week, the seeds grew into small sprouts. We planted the seeds in the soil.', 'We planted the seeds in the soil. After a week, the seeds grew into small sprouts.', 'order', 'We must plant the seeds before they can grow.'),
        ' One day, a big storm came and ', m('breaked', 'broke', 'grammar', '"Break" is an irregular verb. Its past form is "broke".', ['broked']),
        ' some of the stems. We were ', m('sad', 'sad,', 'punctuation', 'Put a comma before "but" when it joins two complete sentences.', ['sad.']),
        ' but we did not give up. We tied the stems to sticks. A month later, the tomatoes turned red and tasted ', m('well', 'good', 'word', '"Good" tells how something tastes. "Well" tells how something is done.', ['goodly']),
        '. We shared them with the ', m('hole', 'whole', 'word', '"Whole" means all of it. A "hole" is an opening in something.', ['hold']), ' school.'
      ] },
      { id: 'en-fair', title: 'The Science Fair', level: 'hard', parts: [
        'Lea wanted to join the science fair, so she ', m('choosed', 'chose', 'grammar', '"Choose" is an irregular verb. Its past form is "chose".', ['chosen']),
        ' a project about plants. She put one plant near a sunny window and another plant inside a dark closet. Every day, she ', m('measure', 'measured', 'grammar', 'This happened in the past, so the verb needs "-ed".', ['measures']),
        ' both plants and wrote the numbers in her notebook. ', m('She showed her results at the fair. After two weeks, the plant near the window was much taller.', 'After two weeks, the plant near the window was much taller. She showed her results at the fair.', 'order', 'Lea had to see the results before she could show them.'),
        ' The judges were ', m('suprised', 'surprised', 'spelling', '"Surprised" has an "r" right after the "su".', ['surprized']),
        ' by her neat charts. Lea explained that plants need sunlight to make ', m('there', 'their', 'word', '"Their" shows something belongs to them. "There" tells about a place.', ["they're"]),
        ' own food. In the end, Lea won ', m('a', 'an', 'grammar', 'Use "an" before a word that starts with a vowel sound, like "award".'),
        ' award for her hard work. Her teacher hugged her and ', m('said', 'said,', 'punctuation', 'Put a comma after "said" before the exact words someone says.', ['said.']),
        ' "Great job, Lea!"'
      ] }
    ],
    tl: [
      { id: 'tl-pusa', title: 'Ang Aking Alagang Pusa', level: 'easy', parts: [
        'Mayroon akong alagang pusa na ang pangalan ay ', m('mingming', 'Mingming', 'punctuation', 'Nagsisimula sa malaking titik ang pangalan.'),
        '. Kulay puti at itim ang kanyang ', m('balahibu', 'balahibo', 'spelling', 'Ang tamang baybay ay "balahibo", na nagtatapos sa "o".', ['balahebo']),
        '. Tuwing umaga, ', m('kumain', 'kumakain', 'grammar', 'Ginagawa ito tuwing umaga, kaya "kumakain" ang tamang anyo.', ['kakain']),
        ' siya ng isda. Mahilig ', m('rin', 'din', 'grammar', 'Pagkatapos ng salitang nagtatapos sa katinig (tulad ng "mahilig"), "din" ang ginagamit.'),
        ' siyang matulog sa tabi ng bintana. Kapag gutom siya, malakas siyang ', m('tumatahol', 'ngumingiyaw', 'word', 'Ngumingiyaw ang pusa. Ang aso ang tumatahol.', ['umuunga']),
        '. Isang araw, nawala si Mingming. ', m('Nakita namin siya sa ilalim ng kama. Hinanap namin siya sa buong bahay.', 'Hinanap namin siya sa buong bahay. Nakita namin siya sa ilalim ng kama.', 'order', 'Hinanap muna namin siya bago namin siya nakita.'),
        ' Niyakap ko siya nang mahigpit. Gusto mo bang makita ang pusa ', m('ko.', 'ko?', 'punctuation', 'Tanong ito, kaya tandang pananong ang bantas sa dulo.', ['ko!'])
      ] },
      { id: 'tl-palengke', title: 'Sa Palengke', level: 'easy', parts: [
        'Tuwing ', m('sabado', 'Sabado', 'punctuation', 'Nagsisimula sa malaking titik ang mga araw ng linggo.'),
        ', sumasama ako kay Nanay sa palengke. Bumibili kami ng gulay, isda at ', m('prutaz', 'prutas', 'spelling', 'Ang tamang baybay ay "prutas", na may "s" sa dulo.', ['prootas']),
        '. ', m('Ang', 'Si', 'grammar', '"Si" ang ginagamit bago ang pangalan ng tao.', ['Ang mga']),
        ' Aling Rosa ang tindera ng gulay. Bumili kami ng ', m('kamatis', 'kamatis,', 'punctuation', 'Ginagamit ang kuwit para paghiwalayin ang mga bagay sa isang listahan.', ['kamatis.']),
        ' sibuyas at bawang. Mura ang mga gulay ngayon, kaya ', m('kaunti', 'marami', 'word', 'Kapag mura ang paninda, mas marami ang mabibili.', ['wala']),
        ' ang binili namin. Umuwi kami ', m('ng', 'nang', 'grammar', '"Nang" ang ginagamit kapag sinasabi kung paano ginawa ang kilos.'),
        ' masaya. ', m('Kumain kami nang sabay-sabay. Nagluto si Nanay ng masarap na sinigang.', 'Nagluto si Nanay ng masarap na sinigang. Kumain kami nang sabay-sabay.', 'order', 'Niluto muna ang sinigang bago kami kumain.')
      ] },
      { id: 'tl-paolo', title: 'Ang Batang Matulungin', level: 'medium', parts: [
        'Si Paolo ay isang batang ', m('matulongin', 'matulungin', 'spelling', 'Ang tamang baybay ay "matulungin", mula sa salitang "tulong" na nagiging "tulung-".', ['matolungin']),
        '. Kahapon, ', m('tutulungan', 'tinulungan', 'grammar', 'Nangyari ito kahapon, kaya "tinulungan" ang tamang anyo.', ['tumutulong']),
        ' niya ang kanyang lola na magdilig ng halaman. Pagkatapos, ', m('nagaral', 'nag-aral', 'spelling', 'May gitling kapag ang unlapi ay sinusundan ng salitang nagsisimula sa patinig.', ['nag aral']),
        ' siya ng kanyang aralin. Ginagawa niya ito ', m('araw araw', 'araw-araw', 'punctuation', 'Nilalagyan ng gitling ang salitang inuulit.', ['arawaraw']),
        '. Sabi ng kanyang ', m('lola', 'lola,', 'punctuation', 'Nilalagyan ng kuwit bago ang eksaktong sinabi ng isang tao.', ['lola.']),
        ' "Salamat, apo." Ang kanyang lola ay ', m('nagalit', 'natuwa', 'word', 'Mabuti ang ginawa ni Paolo, kaya natuwa ang kanyang lola.', ['nainis']),
        ' dahil sa kanyang kabaitan. ', m('Natulog siya nang maaga. Kumain sila ng hapunan.', 'Kumain sila ng hapunan. Natulog siya nang maaga.', 'order', 'Kumakain muna ng hapunan bago matulog.')
      ] },
      { id: 'tl-bundok', title: 'Ang Pag-akyat sa Bundok', level: 'hard', parts: [
        'Noong bakasyon, umakyat kami sa Bundok Apo, ang ', m('pinaka mataas', 'pinakamataas', 'spelling', 'Isinusulat nang dikit ang "pinaka" sa salitang kasunod nito.', ['pinaka-mataas']),
        ' na bundok sa Pilipinas. Sumama ', m('din', 'rin', 'grammar', 'Pagkatapos ng salitang nagtatapos sa patinig (tulad ng "sumama"), "rin" ang ginagamit.'),
        ' ang aking pinsan. Kinabukasan, maaga kaming ', m('gigising', 'gumising', 'grammar', 'Nangyari na ito, kaya "gumising" ang tamang anyo.', ['gumigising']),
        '. Napakalamig ng hangin kaya nagsuot kami ng ', m('manipis', 'makapal', 'word', 'Makapal na damit ang kailangan kapag malamig.', ['basang']),
        ' na damit. ', m('Narating namin ang tuktok. Naglakad kami nang anim na oras.', 'Naglakad kami nang anim na oras. Narating namin ang tuktok.', 'order', 'Naglakad muna kami bago namin narating ang tuktok.'),
        ' Sumigaw ako, "', m('Wow.', 'Wow!', 'punctuation', 'Ginagamit ang tandang padamdam sa matinding damdamin.', ['Wow?']),
        ' Ang ganda ng ', m('tanawen', 'tanawin', 'spelling', 'Ang tamang baybay ay "tanawin", mula sa salitang "tanaw".', ['tanauin']), '!"'
      ] }
    ]
  };
  const LEVEL_NAMES = { easy: { en: 'Easy', tl: 'Madali' }, medium: { en: 'Medium', tl: 'Katamtaman' }, hard: { en: 'Hard', tl: 'Mahirap' } };
  const POINTS = [10, 5, 2];   // by how many tries it took
  const WRONG_TAP = 2;         // a correct word tapped as a mistake
  const HINT_COST = 5;

  let lang = 'en';
  const say = (en, tl) => (lang === 'tl' ? tl : en);
  const mistakesOf = (story) => story.parts.filter((part) => typeof part !== 'string');
  const bestOf = (id) => (config.bests[id] ? config.bests[id].best : null);

  function backLinks() {
    const arrow = document.createElement('span');
    arrow.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
    return el('nav', { class: 'mg-nav', 'aria-label': 'Back' }, [
      el('a', { class: 'mg-back', href: 'minigames.php' }, [arrow.firstChild, 'Minigames']),
      el('a', { class: 'mg-back', href: 'profile.php', text: 'My Profile' })
    ]);
  }

  function heroIcon() {
    const span = document.createElement('span');
    span.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.500 6.500l4 4"/></svg>';
    return span.firstChild;
  }

  // --- Choosing a story ------------------------------------------------------------------
  function showStories() {
    closeSheet();
    current = null;
    const list = el('div', { class: 'fs-stories' });
    const render = () => {
      list.replaceChildren(...STORIES[lang].map((story) => {
        const best = bestOf(story.id);
        const tile = el('span', { class: `fs-story-icon is-${story.level}`, 'aria-hidden': 'true' });
        tile.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/></svg>';
        const go = document.createElement('span');
        go.innerHTML = '<svg class="fs-story-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
        return el('button', { type: 'button', class: 'fs-story-card', onclick: () => startStory(story) }, [
          tile,
          el('span', { class: 'fs-story-text' }, [
            el('strong', { translate: 'no', text: story.title }),
            el('span', { class: 'fs-story-meta' }, [
              el('span', { class: `fs-level is-${story.level}`, translate: 'no', text: LEVEL_NAMES[story.level][lang] }),
              `${mistakesOf(story).length} mistakes`,
              best !== null ? ` · Best ${best}` : null
            ])
          ]),
          go.firstChild
        ]);
      }));
    };
    const langButtons = [['en', 'English'], ['tl', 'Filipino']].map(([value, text]) => el('button', {
      type: 'button', class: 'mg-choice', 'aria-pressed': value === lang ? 'true' : 'false',
      onclick: (event) => {
        lang = value;
        langButtons.forEach((button) => button.setAttribute('aria-pressed', 'false'));
        event.currentTarget.setAttribute('aria-pressed', 'true');
        sfx('select');
        render();
      }
    }, [text]));
    render();
    root.replaceChildren(
      backLinks(),
      el('header', { class: 'mg-hero' }, [
        el('span', { class: 'mg-hero-icon' }, [heroIcon()]),
        el('div', { class: 'mg-hero-text' }, [el('h1', { text: 'Fix the Story' }), el('p', { text: 'Find the mistakes and fix them.' })])
      ]),
      el('section', { class: 'mg-panel' }, [
        el('ol', { class: 'mg-howto' }, [
          el('li', {}, [el('b', { text: '1' }), el('span', { text: 'Read the story.' })]),
          el('li', {}, [el('b', { text: '2' }), el('span', { text: 'Tap a word that looks wrong.' })]),
          el('li', {}, [el('b', { text: '3' }), el('span', { text: 'Choose the right fix and see why.' })])
        ]),
        el('div', { class: 'fs-pick-head' }, [
          el('h2', { text: 'Choose a story' }),
          el('div', { class: 'mg-seg', role: 'group', 'aria-label': 'Language' }, langButtons)
        ]),
        list
      ])
    );
  }

  // --- Playing ---------------------------------------------------------------------------
  let current = null;
  function startStory(story) {
    sfx('page');
    const mistakes = mistakesOf(story).map((part) => ({ ...part, fixed: false, tries: 0, node: null, points: 0 }));
    current = { story, mistakes, earned: 0, lost: 0, wrongTaps: 0, hints: 0 };
    const text = el('p', { class: 'fs-text', translate: 'no', lang: lang === 'tl' ? 'fil' : 'en' });
    let index = 0;
    story.parts.forEach((part) => {
      if (typeof part === 'string') {
        // Each word can be tapped; the spaces stay plain text.
        part.split(/(\s+)/).forEach((piece) => {
          if (!piece) return;
          if (/^\s+$/.test(piece)) { text.append(piece); return; }
          if (!/[\p{L}\p{N}]/u.test(piece)) { text.append(piece); return; }
          text.append(el('button', { type: 'button', class: 'fs-word', text: piece, onclick: (event) => tapFine(event.currentTarget) }));
        });
      } else {
        const mistake = mistakes[index];
        index += 1;
        // Word by word, like the rest of the text, so a long mistake (a
        // sentence in the wrong place) does not stand out by its shape.
        mistake.node = el('span', { class: 'fs-mistake' });
        part.wrong.split(/(\s+)/).forEach((piece) => {
          if (/^\s+$/.test(piece)) mistake.node.append(piece);
          else if (piece) mistake.node.append(el('button', { type: 'button', class: 'fs-word', text: piece, onclick: () => openFix(mistake) }));
        });
        text.append(mistake.node);
      }
    });
    current.steps = mistakes.map(() => el('i'));
    current.count = el('span');
    current.points = el('span', { text: '0' });
    root.replaceChildren(
      backLinks(),
      el('div', { class: 'mg-hud fs-bar' }, [
        el('div', { class: 'mg-hud-main' }, [
          el('span', { class: 'mg-hud-count' }, [current.count]),
          el('div', { class: 'mg-steps', 'aria-hidden': 'true' }, current.steps)
        ]),
        el('div', { class: 'mg-stat' }, [el('small', { text: 'Score' }), el('b', {}, [current.points])])
      ]),
      el('section', { class: 'fs-paper' }, [el('h2', { translate: 'no', text: story.title }), text]),
      el('div', { class: 'fs-tools' }, [
        el('button', { type: 'button', class: 'mg-btn mg-btn-ghost', onclick: useHint, text: `Hint (-${HINT_COST})` }),
        el('button', { type: 'button', class: 'mg-btn mg-btn-accent', onclick: finish, text: "I'm done" })
      ])
    );
    renderProgress();
    root.scrollIntoView({ block: 'start' });
  }
  // Points earned less points lost, kept apart so a penalty taken before the
  // first fix still counts.
  const scoreOf = (play) => Math.max(0, play.earned - play.lost);
  const markMistake = (mistake, name, on) => mistake.node.querySelectorAll('.fs-word').forEach((node) => node.classList.toggle(name, on));
  function renderProgress() {
    const done = current.mistakes.filter((mistake) => mistake.fixed).length;
    current.count.textContent = `Fixed ${done} of ${current.mistakes.length}`;
    current.steps.forEach((step, index) => step.classList.toggle('is-done', index < done));
    current.points.textContent = String(scoreOf(current));
  }
  let toastNode = null;
  let toastTimer = 0;
  function toast(text) {
    if (!toastNode) { toastNode = el('div', { class: 'mg fs-toast', role: 'status' }); document.body.append(toastNode); }
    toastNode.textContent = text;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { if (toastNode) { toastNode.remove(); toastNode = null; } }, 1600);
  }
  function tapFine(node) {
    if (!current) return;
    current.wrongTaps += 1;
    current.lost += WRONG_TAP;
    renderProgress();
    node.classList.remove('is-fine');
    void node.offsetWidth;
    node.classList.add('is-fine');
    window.setTimeout(() => node.classList.remove('is-fine'), 700);
    sfx('error');
    toast(say(`That word is correct. -${WRONG_TAP} points`, `Tama ang salitang iyan. -${WRONG_TAP} puntos`));
  }
  function useHint() {
    const next = current.mistakes.find((mistake) => !mistake.fixed && !mistake.hinted);
    if (!next) { toast(say('Look at the yellow words.', 'Tingnan ang mga salitang dilaw.')); return; }
    current.hints += 1;
    current.lost += HINT_COST;
    renderProgress();
    next.hinted = true;
    markMistake(next, 'is-hint', true);
    next.node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    sfx('magic');
  }

  // Choosing the fix: wrong choices are crossed out; the right one explains why.
  let sheetNodes = null;
  function closeSheet() {
    if (!sheetNodes) return;
    markMistake(sheetNodes.mistake, 'is-open', false);
    sheetNodes.back.remove();
    sheetNodes.sheet.remove();
    document.removeEventListener('keydown', sheetNodes.onKey);
    const again = sheetNodes.mistake.node.querySelector('button');
    if (again) again.focus({ preventScroll: true });
    sheetNodes = null;
    if (current && current.mistakes.every((mistake) => mistake.fixed)) finish();
  }
  function openFix(mistake) {
    if (!current || mistake.fixed) return;
    sfx('open');
    markMistake(mistake, 'is-open', true);
    const kind = KINDS[mistake.kind][lang];
    const back = el('div', { class: 'fs-sheet-back', onclick: () => closeSheet() });
    const opts = el('div', { class: 'fs-opts' });
    const after = el('div');
    const title = el('h3', { id: 'fsSheetTitle', text: say('Choose the fix', 'Piliin ang tama') });
    const sheet = el('section', { class: 'mg fs fs-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'fsSheetTitle' }, [
      title,
      el('p', { class: 'fs-sheet-was' }, [say('Written: ', 'Nakasulat: '), el('b', { translate: 'no', text: mistake.wrong })]),
      opts, after
    ]);
    // The right answer, what is written now, and any other wrong choices.
    const choices = shuffle([mistake.right, mistake.wrong, ...mistake.others]);
    opts.append(...choices.map((text) => el('button', {
      type: 'button', class: 'fs-opt', translate: 'no', text,
      onclick: (event) => choose(mistake, text, event.currentTarget, { opts, after, title, kind })
    })));
    const onKey = (event) => { if (event.key === 'Escape') closeSheet(); };
    document.addEventListener('keydown', onKey);
    document.body.append(back, sheet);
    sheetNodes = { back, sheet, mistake, onKey };
    const first = opts.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }
  function choose(mistake, text, button, parts) {
    if (text !== mistake.right) {
      mistake.tries += 1;
      button.disabled = true;
      sfx('wrong');
      parts.title.textContent = say('Not quite. Try again.', 'Hindi iyan. Subukan ulit.');
      return;
    }
    const points = POINTS[Math.min(mistake.tries, POINTS.length - 1)];
    mistake.fixed = true;
    mistake.points = points;
    current.earned += points;
    mistake.node.replaceChildren(...mistake.right.split(/(\s+)/).map((piece) => (/^\s+$/.test(piece) ? piece : el('span', { class: 'fs-word is-fixed', text: piece }))));
    renderProgress();
    sfx('correct');
    button.classList.add('is-right');
    parts.opts.querySelectorAll('button').forEach((node) => { node.disabled = node !== button; });
    button.disabled = true;
    button.style.textDecoration = 'none';
    parts.title.textContent = say(`Correct! +${points}`, `Tama! +${points}`);
    const last = current.mistakes.every((item) => item.fixed);
    parts.after.replaceChildren(
      el('p', { class: 'fs-why', translate: 'no' }, [el('b', { text: parts.kind }), mistake.why]),
      el('div', { class: 'fs-sheet-actions' }, [
        el('button', { type: 'button', class: 'mg-btn mg-btn-accent', onclick: () => closeSheet(), text: last ? say('See my score', 'Tingnan ang iskor') : say('Next', 'Susunod') })
      ])
    );
    parts.after.querySelector('button').focus({ preventScroll: true });
  }

  // --- The results -----------------------------------------------------------------------
  async function finish() {
    if (!current) return;
    const done = current;
    current = null;
    const { story, mistakes } = done;
    const max = mistakes.length * POINTS[0];
    const score = scoreOf(done);
    const share = score / max;
    const starCount = share >= 0.9 ? 3 : share >= 0.6 ? 2 : share > 0 ? 1 : 0;
    const before = bestOf(story.id);
    sfx(starCount >= 2 ? 'success' : 'fail');
    const stars = el('div', { class: 'mg-stars', role: 'img', 'aria-label': `${starCount} of 3 stars` });
    for (let i = 0; i < 3; i += 1) {
      const span = document.createElement('span');
      span.innerHTML = `<svg class="${i < starCount ? 'on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z"/></svg>`;
      stars.append(span.firstChild);
    }
    const newBest = el('span', { class: 'mg-newbest', hidden: true, text: 'New best score!' });
    const saveStatus = el('p', { class: 'mg-save-status', role: 'status', hidden: true });
    const fixedCount = mistakes.filter((mistake) => mistake.fixed).length;
    // The corrected story, with each fix marked.
    let index = 0;
    const final = el('p', { class: 'fs-text fs-final', translate: 'no', lang: lang === 'tl' ? 'fil' : 'en' });
    story.parts.forEach((part) => {
      if (typeof part === 'string') final.append(part);
      else { final.append(el('mark', { text: part.right })); index += 1; }
    });
    root.replaceChildren(
      backLinks(),
      el('section', { class: 'mg-panel mg-result' }, [
        el('div', { class: 'mg-result-top' }, [
          el('h2', { translate: 'no', text: story.title }),
          stars,
          el('p', { class: 'mg-score', text: String(score) }),
          newBest
        ]),
        el('div', { class: 'mg-result-body' }, [
          el('dl', { class: 'mg-stats' }, [
            el('div', {}, [el('dt', { text: 'Fixed' }), el('dd', { text: `${fixedCount} of ${mistakes.length}` })]),
            el('div', {}, [el('dt', { text: 'Top score' }), el('dd', { text: String(max) })]),
            el('div', {}, [el('dt', { text: 'Wrong taps' }), el('dd', { text: String(done.wrongTaps) })]),
            el('div', {}, [el('dt', { text: 'Hints' }), el('dd', { text: String(done.hints) })])
          ]),
          el('div', { class: 'mg-actions' }, [
            el('button', { type: 'button', class: 'mg-btn mg-btn-accent', onclick: () => startStory(story), text: 'Play again' }),
            el('button', { type: 'button', class: 'mg-btn mg-btn-ghost', onclick: showStories, text: 'Another story' }),
            el('a', { class: 'mg-btn mg-btn-ghost', href: 'minigames.php', text: 'Minigames' })
          ]),
          saveStatus,
          el('h3', { class: 'mg-section', text: 'The answers' }),
          el('ul', { class: 'fs-answers', translate: 'no' }, mistakes.map((mistake) => el('li', { class: 'fs-answer' }, [
            el('div', { class: 'fs-answer-head' }, [
              el('span', { class: 'fs-type', text: KINDS[mistake.kind][lang] }),
              el('span', { class: 'fs-from', text: mistake.wrong }),
              el('span', { 'aria-hidden': 'true', text: '→' }),
              el('span', { class: 'fs-to', text: mistake.right }),
              mistake.fixed ? null : el('span', { class: 'fs-level is-hard', text: say('Not fixed', 'Hindi naitama') })
            ]),
            el('p', { text: mistake.why })
          ]))),
          el('h3', { class: 'mg-section', text: 'The corrected story' }),
          el('div', { class: 'fs-paper fs-result-story' }, [final])
        ])
      ])
    );
    root.scrollIntoView({ block: 'start' });
    try {
      const response = await fetch('minigames_api.php', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', game: 'fixstory', variant: story.id, score })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || 'Your score could not be saved.');
      config.bests[story.id] = { best: result.best, plays: result.plays };
      if (result.newBest && before !== null) newBest.hidden = false;
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

  showStories();
})();
