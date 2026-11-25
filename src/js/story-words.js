// Tap a word to hear it, while reading a story (js/koobd-speech.js).
// A small "Words" button at the side of the story opens the line on screen in
// a panel: tap any word to hear it, hear the whole line, or practise saying a
// word or the line (checked like a "Say it" question). A word being practised
// shows its meaning (word_definition.php), the one that fits the line first.
// Tapping the story text
// itself still moves the story on, as before; the panel keeps every tap and
// key to itself, so the story never advances underneath it.
(function () {
  const speech = window.KoobdSpeech;
  if (!speech) return;
  // The story text boxes of the readers (teacher stories, Platform Mode, the
  // classics), then their narration and title cards.
  const SOURCES = ['#teacherStoryText', '#platformerDialogueText', '#dialogueText', '#platformerTitleCardText', '.vn-story-card-text'];
  const lite = () => document.documentElement.classList.contains('koobd-lite');

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    [].concat(children).forEach((child) => child && node.append(child));
    return node;
  }

  // The line on screen now ('' when none is showing).
  function currentText() {
    for (const selector of SOURCES) {
      const node = document.querySelector(selector);
      if (!node || !node.getClientRects().length) continue;
      const style = window.getComputedStyle(node);
      if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    return '';
  }

  const button = el('button', { type: 'button', class: 'ks-reader-btn', 'aria-label': 'Words: hear and say the words on screen', hidden: true }, []);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 010 7"/></svg><span>Words</span>';
  document.body.appendChild(button);

  // Shown only while there is a line to read (and no question is open).
  function refresh() {
    const show = Boolean(currentText()) && !document.body.classList.contains('has-story-question') && !sheet;
    if (button.hidden === show) button.hidden = !show;
  }
  window.setInterval(() => { if (!document.hidden) refresh(); }, lite() ? 900 : 500);

  let sheet = null;
  let backdrop = null;
  function close() {
    speech.stop();
    sheet?.remove();
    backdrop?.remove();
    sheet = null;
    backdrop = null;
    refresh();
    button.focus({ preventScroll: true });
  }

  // --- Meanings (word_definition.php) ------------------------------------------------------------
  const meanings = new Map();
  function lookUp(word, lang) {
    const key = `${lang}:${word.toLowerCase()}`;
    if (!meanings.has(key)) {
      const request = fetch(`word_definition.php?lang=${lang}&word=${encodeURIComponent(word)}`, { credentials: 'same-origin' })
        .then((response) => response.json().catch(() => ({})).then((data) => ({ ...data, offline: data.offline || response.status >= 500 })))
        .catch(() => ({ found: false, offline: true }));
      meanings.set(key, request);
      // A failed lookup is tried again next time.
      request.then((data) => { if (data.offline) meanings.delete(key); });
    }
    return meanings.get(key);
  }

  // Which meaning fits this line: a few clues from the words around it
  // ("a soft song", "to lead", "song leads"), otherwise the dictionary's first.
  const DETERMINERS = new Set(['a', 'an', 'the', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'some', 'any', 'every', 'each', 'no', 'one']);
  const BE = new Set(['is', 'are', 'was', 'were', 'am', 'be', 'been']);
  function likelyPos(word, tokens, senses) {
    const has = (pos) => senses.some((sense) => sense.pos === pos);
    const lower = word.toLowerCase();
    const at = tokens.indexOf(lower);
    const prev = at > 0 ? tokens[at - 1] : '';
    const next = at >= 0 && at < tokens.length - 1 ? tokens[at + 1] : '';
    if (prev === 'to' && has('verb')) return 'verb';
    if (BE.has(prev) && /ing$/.test(lower) && has('verb')) return 'verb';
    if (DETERMINERS.has(prev)) {
      if (has('adjective') && next && !DETERMINERS.has(next) && !BE.has(next)) return 'adjective';
      if (has('noun')) return 'noun';
    }
    if (/ly$/.test(lower) && has('adverb')) return 'adverb';
    if (/ing$/.test(lower) && has('adjective') && next && !BE.has(prev)) return 'adjective';
    if (/s$/.test(lower) && prev && has('verb') && senses.some((sense) => sense.pos === 'verb' && sense.base)) return 'verb';
    return senses[0].pos;
  }

  function meaningCard(word, lang, line) {
    const box = el('div', { class: 'ks-meaning', 'aria-live': 'polite' }, [
      el('div', { class: 'ks-meaning-head' }, [el('span', { class: 'ks-meaning-label', text: 'Meaning' })]),
      el('p', { class: 'ks-meaning-loading', text: 'Looking up the meaning…' })
    ]);
    const tokens = (line.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) || []).map((token) => token.replace(/^[-'’]+|[-'’]+$/g, ''));
    lookUp(word, lang === 'fil-PH' ? 'tl' : 'en').then((data) => {
      const head = box.querySelector('.ks-meaning-head');
      box.replaceChildren(head);
      const senses = data && data.found && Array.isArray(data.senses) ? data.senses : [];
      if (!senses.length) {
        // A word written with a capital in the middle of the line, that no
        // dictionary has, is someone's or something's name.
        const named = /^\p{Lu}/u.test(word) && tokens.indexOf(word.toLowerCase()) > 0;
        box.classList.add('is-empty');
        box.append(el('p', { class: 'ks-meaning-note', text: data && data.offline
          ? 'The meaning could not be loaded. Check the internet connection and try again.'
          : named ? 'A name in this story.' : 'No meaning found for this word yet.' }));
        return;
      }
      const pos = likelyPos(word, tokens, senses);
      const main = senses.filter((sense) => sense.pos === pos).slice(0, 2);
      const others = senses.filter((sense) => !main.includes(sense));
      head.append(el('span', { class: 'ks-meaning-pos', text: pos }));
      const list = el('ol', { class: 'ks-meaning-list' + (main.length > 1 ? ' is-numbered' : '') }, main.map((sense) => el('li', {}, [
        el('span', { class: 'ks-meaning-text', text: sense.text }),
        sense.example ? el('span', { class: 'ks-meaning-example', text: `"${sense.example}"`, translate: 'no' }) : null
      ])));
      box.append(list);
      if (main[0].base && main[0].base.toLowerCase() !== word.toLowerCase()) {
        box.append(el('p', { class: 'ks-meaning-note', translate: 'no', text: `From "${main[0].base}"` }));
      }
      if (others.length) {
        // The word's other meanings, one for each part of speech.
        const firstOfEach = others.filter((sense, index) => others.findIndex((other) => other.pos === sense.pos) === index || sense.pos === pos).slice(0, 4);
        const more = el('ul', { class: 'ks-meaning-more', hidden: true }, firstOfEach.map((sense) => el('li', {}, [
          el('span', { class: 'ks-meaning-pos', text: sense.pos }),
          el('span', { class: 'ks-meaning-text', text: sense.text })
        ])));
        const toggle = el('button', { type: 'button', class: 'ks-meaning-toggle', 'aria-expanded': 'false', text: 'Other meanings' });
        toggle.addEventListener('click', () => {
          more.hidden = !more.hidden;
          toggle.setAttribute('aria-expanded', String(!more.hidden));
          toggle.textContent = more.hidden ? 'Other meanings' : 'Hide other meanings';
        });
        box.append(toggle, more);
      }
    });
    return box;
  }

  const ICON_LINE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>';
  const ICON_WORDS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/></svg>';
  const ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const withIcon = (node, svg) => { node.insertAdjacentHTML('afterbegin', svg); return node; };

  function open() {
    const text = currentText();
    if (!text) return;
    const lang = speech.detectLang(text);
    const seenWords = new Set();
    const words = (text.match(/[\p{L}\p{N}'’-]+/gu) || [])
      .map((word) => word.replace(/^[-'’]+|[-'’]+$/g, ''))
      .filter((word) => word.length > 1 && !seenWords.has(word.toLowerCase()) && seenWords.add(word.toLowerCase()));
    const practice = el('div', { class: 'ks-practice' }, [
      el('p', { class: 'ks-practice-empty', text: 'Choose a word to see what it means and practise saying it.' })
    ]);
    // Practise saying: a word from the line (with its meaning), or the whole line.
    const showPractice = (phrase, chip, isWord) => {
      sheet.querySelectorAll('.ks-chip').forEach((item) => {
        item.classList.toggle('is-picked', item === chip);
        item.setAttribute('aria-pressed', String(item === chip));
      });
      speech.stop();
      const card = speech.sayIt({ phrase, lang });
      if (isWord) card.querySelector('.ks-say-phrase')?.after(meaningCard(phrase, lang, text));
      practice.replaceChildren(card);
    };
    const lineChip = withIcon(el('button', { type: 'button', class: 'ks-chip is-line', 'aria-pressed': 'false', onclick: (event) => showPractice(text, event.currentTarget, false) }, [
      el('span', { text: 'Whole line' })
    ]), ICON_LINE);
    sheet = el('section', { class: 'ks-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ksSheetTitle' }, [
      el('div', { class: 'ks-sheet-head' }, [
        withIcon(el('span', { class: 'ks-sheet-icon', 'aria-hidden': 'true' }), ICON_WORDS),
        el('div', { class: 'ks-sheet-heading' }, [
          el('h2', { id: 'ksSheetTitle', text: 'Words' }),
          el('p', { text: 'Tap a word to hear it' })
        ]),
        el('span', { class: 'ks-sheet-lang', text: speech.langName(lang) }),
        withIcon(el('button', { type: 'button', class: 'ks-sheet-close', 'aria-label': 'Close', onclick: close }), ICON_CLOSE)
      ]),
      el('div', { class: 'ks-sheet-line' }, [
        speech.wordify(el('p', { class: 'ks-sheet-text', translate: 'no' }), text, lang),
        el('div', { class: 'ks-sheet-actions' }, [speech.listenButton(text, lang, { label: 'Hear the whole line' })])
      ]),
      el('div', { class: 'ks-sheet-section' }, [
        el('h3', { class: 'ks-sheet-note', text: 'Practise a word' }),
        el('div', { class: 'ks-chip-row' }, [lineChip].concat(words.slice(0, 24).map((word) => el('button', {
          type: 'button', class: 'ks-chip', 'aria-pressed': 'false', text: word, translate: 'no', onclick: (event) => showPractice(word, event.currentTarget, true)
        }))))
      ]),
      practice
    ]);
    backdrop = el('div', { class: 'ks-sheet-backdrop', onclick: close });
    // Nothing done in the panel reaches the story underneath.
    [sheet, backdrop].forEach((node) => ['click', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'keydown', 'keyup'].forEach((type) => {
      node.addEventListener(type, (event) => {
        if (type === 'keydown' && event.key === 'Escape') close();
        event.stopPropagation();
      });
    }));
    document.body.append(backdrop, sheet);
    button.hidden = true;
    sheet.querySelector('.ks-sheet-close').focus({ preventScroll: true });
  }

  ['click', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup'].forEach((type) => {
    button.addEventListener(type, (event) => event.stopPropagation());
  });
  button.addEventListener('click', open);
})();
