// The Dictionary page (dictionary.php): search an English or Tagalog word,
// show its translation into the other language and its meanings
// (dictionary_api.php). A translated word can be tapped to look it up in
// turn; the speaker buttons read words aloud (js/koobd-speech.js). The last
// words looked up are kept on this device, per account.
(function () {
  const form = document.getElementById('dictForm');
  if (!form) return;
  const input = document.getElementById('dictInput');
  const fromField = document.getElementById('dictFrom');
  const fromLabel = document.getElementById('dictFromLabel');
  const toLabel = document.getElementById('dictToLabel');
  const results = document.getElementById('dictResults');
  const recentPanel = document.getElementById('dictRecentPanel');
  const recentList = document.getElementById('dictRecent');
  const speech = window.KoobdSpeech || null;
  const NAMES = { en: 'English', tl: 'Tagalog' };
  const VOICE = { en: 'en-US', tl: 'fil-PH' };
  const RECENT_KEY = `koobd_dictionary_recent_${(window.KOOBD_DICTIONARY && window.KOOBD_DICTIONARY.user) || 0}`;
  let request = 0;

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
  const listen = (text, from, compact) => (speech ? speech.listenButton(text, VOICE[from], { label: 'Hear it', compact }) : null);

  // --- Direction ------------------------------------------------------------------------------------
  function setFrom(from) {
    fromField.value = from;
    fromLabel.textContent = NAMES[from];
    toLabel.textContent = NAMES[from === 'en' ? 'tl' : 'en'];
    input.placeholder = from === 'tl' ? 'Type a Tagalog word' : 'Type an English word';
  }
  document.getElementById('dictSwap').addEventListener('click', () => {
    setFrom(fromField.value === 'en' ? 'tl' : 'en');
    if (input.value.trim()) search(input.value, fromField.value);
    else input.focus();
  });

  // --- Recent words (this device) ------------------------------------------------------------------
  function readRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((item) => item && item.word); } catch (error) { return []; }
  }
  function remember(word, from) {
    const list = [{ word, from }].concat(readRecent().filter((item) => !(item.word.toLowerCase() === word.toLowerCase() && item.from === from))).slice(0, 10);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (error) { /* fine */ }
    drawRecent();
  }
  function drawRecent() {
    const list = readRecent();
    recentPanel.hidden = !list.length;
    recentList.replaceChildren(...list.map((item) => el('button', {
      type: 'button', class: 'dict-chip', 'data-word': item.word, 'data-from': item.from, translate: 'no'
    }, [item.word, el('span', { class: 'dict-chip-lang', text: item.from.toUpperCase() })])));
  }
  document.getElementById('dictClear').addEventListener('click', () => {
    try { localStorage.removeItem(RECENT_KEY); } catch (error) { /* fine */ }
    drawRecent();
  });

  // --- Results --------------------------------------------------------------------------------------
  function message(title, text, kind) {
    results.replaceChildren(el('div', { class: `dict-message${kind ? ` is-${kind}` : ''}` }, [
      el('h2', { text: title }),
      text ? el('p', { text }) : null
    ]));
  }

  function render(data) {
    const from = data.from;
    const to = data.to;
    const card = el('article', { class: 'dict-card' });

    // The word, its language, and how it sounds.
    card.append(el('header', { class: 'dict-word' }, [
      el('div', { class: 'dict-word-main' }, [
        el('span', { class: 'dict-word-lang', text: NAMES[from] }),
        el('h2', { class: 'dict-word-text', translate: 'no', text: data.word })
      ]),
      listen(data.word, from, false)
    ]));
    if (data.switched) {
      card.append(el('p', { class: 'dict-switched', text: `No ${NAMES[to]} word "${data.word}" was found, so this is the ${NAMES[from]} word.` }));
    }

    // Its translation: each group of words with what it means.
    const translations = (data.translations || []).filter((group) => group.words && group.words.length);
    const translation = el('section', { class: 'dict-translation', 'aria-label': `In ${NAMES[to]}` }, [
      el('h3', { class: 'dict-section-title' }, [el('span', { text: `In ${NAMES[to]}` })])
    ]);
    if (!translations.length) {
      translation.append(el('p', { class: 'dict-none', text: `No ${NAMES[to]} translation found for this word yet.` }));
    }
    translations.forEach((group) => {
      const row = el('div', { class: 'dict-translation-row' });
      if (group.sense && from === 'en') row.append(el('p', { class: 'dict-translation-sense', translate: 'no', text: group.sense }));
      if (from === 'tl' && group.sense) row.append(el('span', { class: 'dict-pos', text: group.sense }));
      row.append(el('div', { class: 'dict-translation-words' }, group.words.map((word) => el('span', { class: 'dict-term' }, [
        el('button', { type: 'button', class: 'dict-term-word', translate: 'no', 'data-word': word, 'data-from': to, title: `Look up "${word}"`, text: word }),
        listen(word, to, true)
      ]))));
      translation.append(row);
    });
    card.append(translation);

    // Its meanings, by part of speech.
    const senses = data.senses || [];
    if (senses.length) {
      const meaning = el('section', { class: 'dict-meanings' }, [
        el('h3', { class: 'dict-section-title' }, [el('span', { text: 'Meaning' })])
      ]);
      const byPos = new Map();
      senses.forEach((sense) => {
        if (!byPos.has(sense.pos)) byPos.set(sense.pos, []);
        byPos.get(sense.pos).push(sense);
      });
      byPos.forEach((list, pos) => {
        meaning.append(el('div', { class: 'dict-pos-group' }, [
          el('span', { class: 'dict-pos', text: pos }),
          el('ol', { class: `dict-sense-list${list.length > 1 ? ' is-numbered' : ''}` }, list.map((sense) => el('li', {}, [
            el('span', { class: 'dict-sense', text: sense.text }),
            sense.example ? el('span', { class: 'dict-example', translate: 'no', text: `"${sense.example}"` }) : null,
            sense.base && sense.base.toLowerCase() !== data.word.toLowerCase() ? el('span', { class: 'dict-base', translate: 'no', text: `From "${sense.base}"` }) : null
          ])))
        ]));
      });
      card.append(meaning);
    }
    card.append(el('p', { class: 'dict-source', text: 'Meanings and translations from Wiktionary.' }));
    results.replaceChildren(card);
  }

  async function search(raw, from, { push = true } = {}) {
    const word = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!word) { input.focus(); return; }
    if (word.length > 40 || !/^[\p{L}][\p{L}\p{M}'’ -]*$/u.test(word)) {
      message('Letters only, please', 'Type a single word or a short phrase using letters.', 'warning');
      return;
    }
    setFrom(from);
    input.value = word;
    if (push) {
      const url = `dictionary.php?q=${encodeURIComponent(word)}&from=${from}`;
      try { window.history.pushState({ word, from }, '', url); } catch (error) { /* fine */ }
    }
    const mine = ++request;
    results.replaceChildren(el('div', { class: 'dict-loading', role: 'status' }, [
      el('span', { class: 'dict-loading-bar' }), el('span', { class: 'dict-loading-bar is-short' }), el('span', { class: 'dict-loading-text', text: 'Looking it up…' })
    ]));
    let data = null;
    let status = 0;
    try {
      const response = await fetch(`dictionary_api.php?word=${encodeURIComponent(word)}&from=${from}`, { credentials: 'same-origin' });
      status = response.status;
      data = await response.json().catch(() => null);
    } catch (error) { /* offline */ }
    if (mine !== request) return;
    if (!data || data.offline || status >= 500 || status === 0) {
      message('Could not look it up', 'This word needs the internet the first time it is looked up. Check the connection and try again.', 'warning');
      return;
    }
    if (!data.found) {
      message(`No results for "${word}"`, from === 'en'
        ? 'Check the spelling, or swap the languages to look it up as a Tagalog word.'
        : 'Check the spelling, or swap the languages to look it up as an English word.');
      return;
    }
    if (data.switched) setFrom(data.from);
    render(data);
    remember(data.word, data.from);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    input.blur();
    search(input.value, fromField.value);
  });
  // Any word button on the page (Try these, Recent words, a translation).
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-word][data-from]');
    if (!button || !button.matches('button')) return;
    search(button.dataset.word, button.dataset.from);
    window.scrollTo({ top: 0, behavior: 'auto' });
    form.scrollIntoView({ block: 'nearest' });
  });
  window.addEventListener('popstate', (event) => {
    const state = event.state;
    if (state && state.word) search(state.word, state.from, { push: false });
    else { input.value = ''; message('Find a word', 'Type a word above, or try one of these.'); }
  });

  drawRecent();
  if (input.value.trim()) {
    const from = fromField.value;
    try { window.history.replaceState({ word: input.value.trim(), from }, ''); } catch (error) { /* fine */ }
    search(input.value, from, { push: false });
  }
})();
