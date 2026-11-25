// Writing Practice (writing.php): the student's notepads, the editor with its
// colour-coded suggestions, timed writing challenges and their feedback.
//
// The editor is a textarea over a copy of the same text in which the
// suggestions are marked (underlines and highlights), so the student types
// normally and sees the marks under their words. Tapping or clicking a
// marked word (moving the cursor into it) opens its explanation, with Accept
// and Ignore: nothing in the writing changes without the student's say-so.
// Writing saves itself as it changes (and is kept on the device until the
// server has it). A challenge's clock is the server's, so switching to
// another part of the page, reloading or leaving never resets it.
(function () {
  const root = document.getElementById('wp');
  if (!root || !window.KoobdWritingChecker) return;
  const Checker = window.KoobdWritingChecker;
  const config = window.KOOBD_WRITING || {};
  const stage = document.getElementById('wpStage');
  const LANG = { en: 'English', tl: 'Tagalog' };
  const TYPES = {
    spelling: { name: 'Spelling and word choice', short: 'Spelling' },
    grammar: { name: 'Grammar, prefixes and suffixes', short: 'Grammar' },
    organization: { name: 'Organization and flow', short: 'Organization' },
    vocabulary: { name: 'Vocabulary and creativity', short: 'Vocabulary' },
    mismatch: { name: 'Other language', short: 'Language' },
    emoji: { name: 'Emoji use', short: 'Emoji' }
  };
  const IDEAS = {
    en: ['Write about a day you will never forget.', 'Describe your dream adventure.', 'Write a story about an animal that can talk.', 'What would you do if you could fly for one day?',
      'Describe your favourite place using your five senses.', 'Write a letter to yourself ten years from now.', 'Tell the story of a lost treasure.', 'Write about someone you admire and why.'],
    tl: ['Isulat ang tungkol sa pinakamasayang araw mo.', 'Ilarawan ang paborito mong lugar gamit ang iyong limang pandama.', 'Sumulat ng kuwento tungkol sa isang hayop na nakapagsasalita.', 'Ano ang gagawin mo kung kaya mong lumipad nang isang araw?',
      'Ikuwento ang isang masayang alaala kasama ang iyong pamilya.', 'Sumulat ng liham para sa iyong matalik na kaibigan.', 'Ilarawan ang isang bagyo na naranasan mo.', 'Isulat kung ano ang gusto mong maging paglaki mo at bakit.']
  };
  const mobile = () => window.matchMedia('(max-width: 899px)').matches;

  let notes = [];
  let note = null;          // the open notepad (with its body)
  let serverOffset = 0;     // server time - this device's time
  let mode = 'home';        // 'home' | 'note' | 'setup' | 'challenge'
  const spellCache = { en: {}, tl: {} };
  let result = null;        // the latest check
  let aiIssues = [];
  let hidden = new Set();   // suggestion types turned off in the legend
  let ui = {};

  // --- Helpers -----------------------------------------------------------------------------------------
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    [].concat(children).forEach((child) => child !== null && child !== undefined && child !== false && node.append(child));
    return node;
  }
  const icon = (path) => el('span', { class: 'wp-svg', 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24">${path}</svg>` });
  const ICONS = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
    clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>', note: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h5"/>',
    spark: '<path d="M12 3l1.8 4.6L18.5 9.5l-4.7 1.9L12 16l-1.8-4.6L5.5 9.5l4.7-1.9zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    star: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z"/>', bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9V16h7v-2.1A6 6 0 0012 3z"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', back: '<path d="M15 5l-7 7 7 7"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>'
  };
  const now = () => Date.now() + serverOffset;
  function api(action, data = {}, options = {}) {
    return fetch('writing_api.php', {
      method: 'POST', credentials: 'same-origin', keepalive: Boolean(options.keepalive),
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data })
    }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (body.now) serverOffset = body.now - Date.now();
      if (!response.ok || !body.success) { const error = new Error(body.error || 'Something went wrong. Please try again.'); error.status = response.status; throw error; }
      return body;
    });
  }
  const ago = (ms) => {
    const s = Math.max(0, Math.round((now() - ms) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  const clock = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const draftKey = (id) => `koobd_writing_draft_${config.user || 0}_${id}`;
  const readDraft = (id) => { try { return JSON.parse(localStorage.getItem(draftKey(id)) || 'null'); } catch (error) { return null; } };
  const writeDraft = (id, body) => { try { localStorage.setItem(draftKey(id), JSON.stringify({ body, at: Date.now() })); } catch (error) { /* full or blocked */ } };
  const dropDraft = (id) => { try { localStorage.removeItem(draftKey(id)); } catch (error) { /* fine */ } };
  function setUrl(params) {
    const url = new URL(window.location.href);
    url.search = '';
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    try { window.history.replaceState(null, '', url.pathname + url.search); } catch (error) { /* fine */ }
  }

  // --- Two screens: the list, and one notepad full screen --------------------------------------------------
  // An open notepad (or challenge) takes the whole screen: the app's
  // sidebar and this page's header step aside, and Back returns to the list.
  function setFocus(on) {
    document.body.classList.toggle('wp-focus', on);
    window.scrollTo(0, 0);
  }
  async function goBack() {
    closePop();
    await flushSave();
    stopTimers();
    await loadList();
    showHome();
  }

  // --- The list --------------------------------------------------------------------------------------------
  function statusOf(item) {
    if (item.kind !== 'challenge') return null;
    const c = item.challenge;
    if (c.status === 'running') return { text: c.resumed ? 'Resumed' : 'In progress', cls: 'is-running' };
    if (c.status === 'interrupted') return { text: 'Interrupted', cls: 'is-interrupted' };
    return { text: c.resumed ? 'Resumed · Completed' : 'Completed', cls: 'is-completed' };
  }
  // The list screen: every notepad as a card (newest first), or, with none
  // yet, how it works. New notepad and Writing challenge are in the header.
  function drawList() {
    if (mode === 'home') renderHome();
  }
  function showHome() {
    mode = 'home';
    note = null;
    ui = {};
    setFocus(false);
    setUrl({});
    renderHome();
  }
  function renderHome() {
    if (!notes.length) {
      const step = (iconPath, title, text) => el('li', { class: 'wp-how-step' }, [
        el('span', { class: 'wp-how-icon' }, [icon(iconPath)]),
        el('strong', { text: title }),
        el('span', { text })
      ]);
      stage.replaceChildren(el('div', { class: 'wp-empty' }, [
        el('span', { class: 'wp-empty-icon' }, [icon(ICONS.edit)]),
        el('h2', { text: 'Start writing' }),
        el('p', { text: 'Press New notepad at the top to write anything you like - a story, a diary, a poem. Or try a timed Writing challenge.' }),
        el('ol', { class: 'wp-how', 'aria-label': 'How it works' }, [
          step(ICONS.note, 'Write', 'In English or Tagalog. Your work saves by itself.'),
          step(ICONS.check, 'Check your writing', 'See what to fix and why, then choose to fix it or not.'),
          step(ICONS.clock, 'Take a challenge', 'Beat the clock, then see how you did.')
        ])
      ]));
      return;
    }
    stage.replaceChildren(el('section', { class: 'wp-home', 'aria-labelledby': 'wpHomeTitle' }, [
      el('h2', { class: 'wp-home-title', id: 'wpHomeTitle' }, [el('span', { text: 'My notepads' }), el('b', { text: String(notes.length) })]),
      el('div', { class: 'wp-cards', role: 'list' }, notes.map((item) => {
        const status = statusOf(item);
        return el('button', { type: 'button', role: 'listitem', class: `wp-note-card${item.kind === 'challenge' ? ' is-challenge' : ''}`, onclick: () => openNote(item.id) }, [
          el('span', { class: 'wp-note-card-top' }, [
            el('span', { class: 'wp-note-card-icon' }, [icon(item.kind === 'challenge' ? ICONS.clock : ICONS.note)]),
            el('span', { class: `wp-lang-tag is-${item.lang}`, text: LANG[item.lang] }),
            status ? el('span', { class: `wp-status ${status.cls}`, text: status.text }) : null
          ]),
          el('span', { class: 'wp-note-card-title', translate: 'no', text: item.title || 'Untitled notepad' }),
          el('span', { class: 'wp-note-card-text', translate: 'no', text: item.preview || 'Nothing written yet.' }),
          el('span', { class: 'wp-note-card-meta', text: `${item.words} words · ${ago(item.updated)}` })
        ]);
      }))
    ]));
  }
  async function loadList() {
    try { notes = (await api('list')).notes; } catch (error) { notes = notes || []; }
    drawList();
  }
  function touchList(patch) {
    const item = notes.find((entry) => entry.id === note.id);
    if (item) Object.assign(item, patch, { updated: now() });
    notes.sort((a, b) => b.updated - a.updated);
  }

  // The colours, explained: only the kinds found in this writing.
  function legend(counts = {}) {
    return el('div', { class: 'wp-legend', 'aria-label': 'What the colours mean' }, Object.keys(TYPES).filter((type) => counts[type]).map((type) => el('span', { class: 'wp-legend-item' }, [
      el('span', { class: `wp-swatch is-${type}`, 'aria-hidden': 'true', text: 'abc' }), el('span', { text: TYPES[type].short }), el('b', { text: String(counts[type]) })
    ])));
  }

  // A question in one of the page's dialogs: the value of the button chosen
  // ('' when it is closed another way). The form's submit gives it at once;
  // the dialog's close covers Esc.
  function ask(dialog) {
    return new Promise((resolve) => {
      const form = dialog.querySelector('form');
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        form.removeEventListener('submit', onSubmit);
        dialog.removeEventListener('close', onClose);
        resolve(value);
      };
      const onSubmit = (event) => finish(event.submitter ? event.submitter.value : '');
      const onClose = () => finish(dialog.returnValue || '');
      form.addEventListener('submit', onSubmit);
      dialog.addEventListener('close', onClose);
      dialog.returnValue = '';
      dialog.showModal();
    });
  }

  // --- New notepad ------------------------------------------------------------------------------------------
  async function newNote() {
    const lang = await ask(document.getElementById('wpNewDialog'));
    if (!lang) return;
    try {
      const { note: created } = await api('create', { lang });
      notes.unshift(created);
      await openNote(created.id);
      ui.title?.select();
    } catch (error) { toast(error.message); }
  }
  document.getElementById('wpNewNote').addEventListener('click', newNote);
  document.getElementById('wpNewDialog').addEventListener('click', (event) => { if (event.target.id === 'wpNewDialog') event.target.close(''); });

  // --- Opening a notepad ------------------------------------------------------------------------------------
  async function openNote(id) {
    await flushSave();
    let data;
    try { data = await api('get', { id }); } catch (error) { toast(error.message); await loadList(); showHome(); return; }
    note = data.note;
    aiIssues = [];
    result = null;
    hidden = new Set();
    setUrl({ note: note.id });
    // Writing kept on this device that the server never got (offline).
    const draft = readDraft(note.id);
    if (draft && draft.body !== note.body && draft.at > note.updated && !(note.kind === 'challenge' && note.challenge.status !== 'running')) {
      note.body = draft.body;
      queueSave(true);
    }
    const index = notes.findIndex((entry) => entry.id === note.id);
    if (index >= 0) notes[index] = { ...notes[index], ...note };
    if (note.kind === 'challenge' && note.challenge.status === 'running') startChallengeView();
    else showEditor();
  }

  // --- The notepad (full screen) -----------------------------------------------------------------------------
  // A simple bar: Back, the title, the language, whether it is saved, Check
  // my writing (the corrections stay hidden until it is pressed) and More
  // (feedback, AI review, delete). Then the page to write on.
  let showChecks = false;
  function backButton(onclick) {
    return el('button', { type: 'button', class: 'wp-back', onclick }, [icon(ICONS.back), el('span', { text: 'Back' })]);
  }
  function showEditor() {
    mode = 'note';
    setFocus(true);
    const isChallenge = note.kind === 'challenge';
    const status = statusOf(note);
    // A finished challenge opens with its corrections showing.
    showChecks = isChallenge && note.challenge.status !== 'running';
    const textarea = el('textarea', { class: 'wp-text', spellcheck: 'false', autocapitalize: 'sentences', 'aria-label': 'Your writing', lang: note.lang === 'tl' ? 'fil' : 'en',
      placeholder: note.lang === 'tl' ? 'Simulan ang pagsulat dito…' : 'Start writing here…', translate: 'no' });
    textarea.value = note.body;
    const backdrop = el('div', { class: 'wp-marks', 'aria-hidden': 'true', translate: 'no' });
    const title = el('input', { class: 'wp-title', type: 'text', maxlength: '120', value: note.title, 'aria-label': 'Notepad title', placeholder: 'Title', translate: 'no' });
    const saveState = el('span', { class: 'wp-save', role: 'status' }, [icon(ICONS.check), el('span', { text: 'Saved' })]);
    const langSwitch = isChallenge
      ? el('span', { class: `wp-lang-tag is-${note.lang} is-big`, text: LANG[note.lang] })
      : el('div', { class: 'wp-seg', role: 'group', 'aria-label': 'Writing language' }, ['en', 'tl'].map((code) => el('button', {
        type: 'button', class: `wp-seg-btn${note.lang === code ? ' is-on' : ''}`, 'aria-pressed': String(note.lang === code), 'data-lang': code, 'aria-label': LANG[code], title: LANG[code],
        onclick: () => setLang(code)
      }, [el('span', { class: 'wp-lang-full', text: LANG[code] }), el('span', { class: 'wp-lang-short', 'aria-hidden': 'true', text: code.toUpperCase() })])));
    const count = el('span', { class: 'wp-count', text: '' });
    const checking = el('span', { class: 'wp-checking', hidden: true, text: 'Checking…' });
    const checkLabel = el('span', { class: 'wp-check-label' });
    const checkCount = el('b', { class: 'wp-check-count', hidden: true });
    const checkButton = el('button', { type: 'button', class: 'wp-btn wp-btn-check', onclick: toggleChecks }, [icon(ICONS.check), checkLabel, checkCount]);
    const banner = el('div', { class: 'wp-banner', hidden: true });
    const panel = el('aside', { class: 'wp-panel', 'aria-label': 'Things to check' });
    const feedbackBox = el('section', { class: 'wp-feedback', hidden: true, 'aria-label': 'Feedback' });
    const menu = el('div', { class: 'wp-menu', role: 'menu', hidden: true }, [
      el('button', { type: 'button', role: 'menuitem', class: 'wp-menu-item', onclick: () => { closeMenu(); showFeedback(true); } }, [icon(ICONS.chart), el('span', { text: 'How did I do?' })]),
      config.ai ? el('button', { type: 'button', role: 'menuitem', class: 'wp-menu-item', onclick: (event) => { closeMenu(); runAiReview(event); } }, [icon(ICONS.spark), el('span', { text: 'AI review' })]) : null,
      el('button', { type: 'button', role: 'menuitem', class: 'wp-menu-item is-danger', onclick: () => { closeMenu(); deleteNote(); } }, [icon(ICONS.trash), el('span', { text: 'Delete notepad' })])
    ]);
    const moreButton = el('button', { type: 'button', class: 'wp-btn wp-btn-ghost wp-more-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => (menu.hidden ? openMenu() : closeMenu()) },
      [icon('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'), el('span', { text: 'More' })]);
    const statusBanner = isChallenge && status ? el('div', { class: `wp-banner is-status ${status.cls}` }, [
      icon(ICONS.clock),
      el('span', { text: note.challenge.status === 'interrupted'
        ? 'Interrupted: time ran out while you were away. Your writing was saved and checked.'
        : `${Math.round(note.challenge.seconds / 60)}-minute challenge completed${note.challenge.resumed ? ' (resumed after a break)' : ''}. You can keep making your writing better.` })
    ]) : null;

    stage.replaceChildren(el('div', { class: `wp-editor${showChecks ? ' is-checking' : ''}` }, [
      el('header', { class: 'wp-bar' }, [
        backButton(goBack),
        el('div', { class: 'wp-bar-title' }, [
          // The title is a field to tap and type in, with a pencil to show it.
          el('label', { class: 'wp-title-field', title: 'Change the title' }, [title, el('span', { class: 'wp-title-pen', 'aria-hidden': 'true' }, [icon(ICONS.edit)])]),
          saveState
        ]),
        el('div', { class: 'wp-bar-tools' }, [langSwitch, checkButton, el('div', { class: 'wp-more' }, [moreButton, menu])])
      ]),
      el('div', { class: 'wp-editor-body' }, [
        el('div', { class: 'wp-editor-main' }, [
          statusBanner, banner,
          el('div', { class: 'wp-paper' }, [backdrop, textarea]),
          el('div', { class: 'wp-paper-foot' }, [count, checking]),
          feedbackBox
        ]),
        panel
      ])
    ]));
    ui = { textarea, backdrop, title, saveState, count, checking, banner, panel, feedbackBox, checkButton, checkLabel, checkCount, menu, moreButton, editor: stage.querySelector('.wp-editor') };
    updateCheckButton();

    textarea.addEventListener('input', () => { grow(); note.body = textarea.value; writeDraft(note.id, note.body); queueSave(); queueCheck(); renderMarks(true); closePop(); });
    ['click', 'keyup'].forEach((type) => textarea.addEventListener(type, (event) => {
      if (type === 'keyup' && !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      if (textarea.selectionStart !== textarea.selectionEnd) return;
      const found = issueAt(textarea.selectionStart);
      if (found) openPop(found); else closePop();
    }));
    textarea.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePop(); });
    title.addEventListener('input', () => { note.title = title.value; queueSave(); touchList({ title: title.value || 'Untitled notepad' }); });
    // Renaming: Enter (or tapping away) finishes; an empty title goes back to the default.
    title.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); title.blur(); } });
    title.addEventListener('focus', () => title.select());
    title.addEventListener('blur', () => {
      if (title.value.trim()) return;
      title.value = note.lang === 'tl' ? 'Bagong kuwaderno' : 'Untitled notepad';
      note.title = title.value;
      queueSave();
      touchList({ title: title.value });
    });
    window.addEventListener('resize', grow);
    grow();
    runCheck();
    if (isChallenge && note.feedback) showFeedback(false);
    else if (isChallenge && note.challenge.status !== 'running' && !note.feedback) finishFeedback();
  }

  // Check my writing: the marks and the list of things to check, shown only
  // when the student asks (and hidden again with the same button).
  function toggleChecks() {
    showChecks = !showChecks;
    ui.editor.classList.toggle('is-checking', showChecks);
    closePop();
    updateCheckButton();
    renderMarks();
    renderPanel();
  }
  function updateCheckButton() {
    if (!ui.checkButton) return;
    const total = result ? allIssues().length : 0;
    // Phones: the short words, so the bar fits on one row.
    const narrow = window.matchMedia('(max-width: 600px), (max-height: 500px) and (orientation: landscape)').matches;
    ui.checkLabel.textContent = showChecks ? (narrow ? 'Hide' : 'Hide checks') : (narrow ? 'Check' : 'Check my writing');
    ui.checkButton.setAttribute('aria-pressed', String(showChecks));
    ui.checkButton.classList.toggle('is-on', showChecks);
    ui.checkCount.hidden = showChecks || !total;
    ui.checkCount.textContent = String(total);
  }
  function openMenu() {
    ui.menu.hidden = false;
    ui.moreButton.setAttribute('aria-expanded', 'true');
    ui.menu.querySelector('button')?.focus({ preventScroll: true });
  }
  function closeMenu() {
    if (!ui.menu || ui.menu.hidden) return;
    ui.menu.hidden = true;
    ui.moreButton.setAttribute('aria-expanded', 'false');
  }
  document.addEventListener('pointerdown', (event) => { if (ui.menu && !ui.menu.hidden && !event.target.closest('.wp-more')) closeMenu(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && ui.menu && !ui.menu.hidden) { closeMenu(); ui.moreButton.focus(); } });
  function setSave(text, cls = '') {
    if (!ui.saveState) return;
    ui.saveState.className = `wp-save${cls ? ` ${cls}` : ''}`;
    ui.saveState.querySelector('span:last-child').textContent = text;
  }

  function grow() {
    if (!ui.textarea || !ui.textarea.isConnected) return;
    ui.textarea.style.height = 'auto';
    ui.textarea.style.height = `${Math.max(ui.textarea.scrollHeight, 200)}px`;
  }

  async function setLang(code) {
    if (!note || note.lang === code) return;
    note.lang = code;
    document.querySelectorAll('.wp-seg-btn').forEach((button) => {
      button.classList.toggle('is-on', button.dataset.lang === code);
      button.setAttribute('aria-pressed', String(button.dataset.lang === code));
    });
    ui.textarea.lang = code === 'tl' ? 'fil' : 'en';
    ui.textarea.placeholder = code === 'tl' ? 'Simulan ang pagsulat dito…' : 'Start writing here…';
    touchList({ lang: code });
    aiIssues = [];
    try { await api('save', { id: note.id, lang: code }); } catch (error) { toast(error.message); }
    runCheck();
  }

  // --- Saving ------------------------------------------------------------------------------------------------
  let saveTimer = 0;
  let saving = null;
  let dirty = false;
  function queueSave(now = false) {
    dirty = true;
    setSave('Saving…', 'is-saving');
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(save, now ? 0 : 900);
  }
  async function save(options = {}) {
    if (!note || !dirty) return;
    window.clearTimeout(saveTimer);
    dirty = false;
    const current = note;
    const body = { id: current.id, body: current.body, title: current.title };
    saving = api('save', body, options).then(() => {
      dropDraft(current.id);
      if (note === current) setSave('Saved');
      if (note === current) touchList({ words: (current.body.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length, preview: current.body.slice(0, 90) });
    }).catch((error) => {
      if (error.status === 409 && mode === 'challenge') return;
      dirty = true;
      if (note === current) setSave(error.status ? error.message : 'Saved on this device', 'is-error');
      if (!error.status) saveTimer = window.setTimeout(save, 8000);
    }).finally(() => { saving = null; });
    return saving;
  }
  async function flushSave() { if (dirty) await save(); else if (saving) await saving; }
  window.addEventListener('pagehide', () => { if (dirty && note) save({ keepalive: true }); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && dirty && note) save({ keepalive: true }); });

  // --- Checking ----------------------------------------------------------------------------------------------
  let checkTimer = 0;
  let checkRun = 0;
  function queueCheck() {
    window.clearTimeout(checkTimer);
    checkTimer = window.setTimeout(runCheck, 650);
  }
  async function runCheck() {
    if (!note || !ui.textarea) return;
    const mine = ++checkRun;
    const lang = note.lang;
    const text = ui.textarea.value;
    const words = Array.from(new Set((text.match(/[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu) || []).map((word) => word.replace(/[-'’]+$/, ''))))
      .filter((word) => !(word in spellCache[lang]));
    if (words.length) {
      ui.checking.hidden = false;
      try {
        const answer = await api('spell', { lang, words: words.slice(0, 400) });
        Object.assign(spellCache[lang], answer.words);
      } catch (error) { /* offline: the other checks still run */ }
      if (mine !== checkRun || !ui.checking.isConnected) return;
      ui.checking.hidden = true;
    }
    result = Checker.check(ui.textarea.value, lang, spellCache[lang], { ignored: note.ignored || [] });
    placeAiIssues();
    renderMarks();
    renderPanel();
  }

  // AI review suggestions, placed where their quotes are in the text now.
  function placeAiIssues() {
    aiIssues = [];
    const review = note && note.review;
    if (!review || !Array.isArray(review.issues) || review.lang && review.lang !== note.lang) return;
    const text = ui.textarea.value;
    const used = [];
    review.issues.forEach((item, index) => {
      if (!item.quote) return;
      let at = text.indexOf(item.quote);
      while (at >= 0 && used.some(([a, b]) => at < b && at + item.quote.length > a)) at = text.indexOf(item.quote, at + 1);
      if (at < 0) return;
      used.push([at, at + item.quote.length]);
      const issue = {
        id: `a${index}`, source: 'ai', start: at, end: at + item.quote.length, type: TYPES[item.type] ? item.type : 'grammar', title: item.title || 'Suggestion',
        message: item.explanation || '', suggestions: item.suggestion !== undefined && item.suggestion !== item.quote ? [item.suggestion] : [], definite: Boolean(item.definite), rule: 'ai'
      };
      issue.key = `ai:${issue.type}:${item.quote.toLowerCase()}`;
      if (!(note.ignored || []).includes(issue.key)) aiIssues.push(issue);
    });
  }
  function allIssues() {
    const base = (result ? result.issues : []).filter((issue) => !hidden.has(issue.type));
    const ai = aiIssues.filter((issue) => !hidden.has(issue.type) && !base.some((other) => other.start === issue.start && other.end === issue.end));
    return base.concat(ai).sort((a, b) => a.start - b.start || b.end - a.end);
  }

  // The marks under the text: nested where one suggestion covers another (a
  // long sentence with a misspelled word in it); a crossing one is left out.
  const escapeHtml = (text) => text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function renderMarks(stale) {
    if (!ui.backdrop) return;
    const text = ui.textarea.value;
    // While typing, the old marks would point at the wrong letters: they wait
    // for the next check.
    if (stale || !result || !showChecks) { ui.backdrop.innerHTML = `${escapeHtml(text)}\n `; return; }
    const issues = allIssues().filter((issue) => issue.end <= text.length && issue.start < issue.end);
    let html = '';
    let at = 0;
    const open = [];
    const events = [];
    const kept = [];
    issues.forEach((issue) => {
      if (kept.some((other) => issue.start < other.end && issue.end > other.start && !(issue.start >= other.start && issue.end <= other.end) && !(other.start >= issue.start && other.end <= issue.end))) return;
      kept.push(issue);
    });
    kept.forEach((issue) => { events.push([issue.start, 1, issue]); events.push([issue.end, 0, issue]); });
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[1] ? b[2].end - a[2].end : a[2].start - b[2].start));
    events.forEach(([pos, starting, issue]) => {
      html += escapeHtml(text.slice(at, pos));
      at = pos;
      if (starting) {
        html += `<mark class="wp-mark is-${issue.type}${issue.definite ? '' : ' is-optional'}${issue.source === 'ai' ? ' is-ai' : ''}" data-id="${issue.id}">`;
        open.push(issue);
      } else {
        html += '</mark>';
        open.pop();
      }
    });
    html += escapeHtml(text.slice(at));
    ui.backdrop.innerHTML = `${html}\n `;
  }
  function issueAt(pos) {
    if (!showChecks) return null;
    const covering = allIssues().filter((issue) => pos >= issue.start && pos <= issue.end && issue.end > issue.start);
    covering.sort((a, b) => (a.end - a.start) - (b.end - b.start));
    return covering[0] || null;
  }

  // Things to check (beside the page, or under it on smaller screens): the
  // colours found, and each suggestion. Shown with Check my writing.
  function renderPanel() {
    if (!ui.panel || !result) return;
    const all = (result.issues || []).concat(aiIssues);
    const counts = {};
    all.forEach((issue) => { counts[issue.type] = (counts[issue.type] || 0) + 1; });
    const shown = allIssues();
    ui.count.textContent = `${result.stats.words} ${result.stats.words === 1 ? 'word' : 'words'}`;
    updateCheckButton();
    // Most of it in the other language: a clear note at the top.
    const otherLang = note.lang === 'tl' ? 'en' : 'tl';
    if (result.stats.otherShare > 0.5 && result.stats.words >= 6) {
      ui.banner.hidden = false;
      ui.banner.className = 'wp-banner is-mismatch';
      ui.banner.replaceChildren(el('span', { text: `Most of this looks like ${LANG[otherLang]}, but this notepad is for practising ${LANG[note.lang]}.` }),
        note.kind === 'note' ? el('button', { type: 'button', class: 'wp-btn wp-btn-ghost wp-btn-sm', text: `Switch to ${LANG[otherLang]}`, onclick: () => setLang(otherLang) }) : null);
    } else {
      ui.banner.hidden = true;
    }
    const items = shown.map((issue) => el('button', { type: 'button', class: `wp-issue is-${issue.type}`, onclick: () => focusIssue(issue) }, [
      el('span', { class: `wp-dot is-${issue.type}`, 'aria-hidden': 'true' }),
      el('span', { class: 'wp-issue-body' }, [
        el('span', { class: 'wp-issue-title' }, [issue.title, issue.source === 'ai' ? el('span', { class: 'wp-ai-tag', text: 'AI' }) : null]),
        el('span', { class: 'wp-issue-text', translate: 'no', text: ui.textarea.value.slice(issue.start, issue.end).slice(0, 60) + (issue.end - issue.start > 60 ? '…' : '') })
      ]),
      el('span', { class: `wp-kind${issue.definite ? ' is-definite' : ''}`, text: issue.definite ? 'Fix' : 'Idea' })
    ]));
    ui.panel.replaceChildren(
      el('div', { class: 'wp-panel-head' }, [el('h2', { text: 'Things to check' }), el('span', { class: 'wp-panel-count', text: String(shown.length) })]),
      items.length ? legend(counts) : null,
      items.length ? el('p', { class: 'wp-panel-hint', text: 'Tap a coloured word to see why. "Fix" is a mistake. "Idea" can make it even better.' }) : null,
      items.length ? el('div', { class: 'wp-issues' }, items) : el('p', { class: 'wp-panel-empty', text: result.stats.words ? 'Nothing to fix right now. Great writing!' : 'Start writing, then check it here.' })
    );
  }
  function focusIssue(issue) {
    ui.textarea.focus({ preventScroll: true });
    ui.textarea.setSelectionRange(issue.start, issue.start);
    const mark = ui.backdrop.querySelector(`[data-id="${issue.id}"]`);
    if (mark) mark.scrollIntoView({ block: 'center', behavior: 'auto' });
    openPop(issue);
  }

  // --- The explanation pop-up ------------------------------------------------------------------------------
  let pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function openPop(issue) {
    closePop();
    const text = ui.textarea.value.slice(issue.start, issue.end);
    const actions = el('div', { class: 'wp-pop-actions' });
    const choices = el('div', { class: 'wp-pop-choices' });
    const addChoice = (suggestion) => choices.append(el('button', {
      type: 'button', class: 'wp-choice', translate: 'no', onclick: () => accept(issue, suggestion)
    }, [icon(ICONS.check), el('span', { text: suggestion === '' ? 'Remove it' : suggestion })]));
    (issue.suggestions || []).forEach(addChoice);
    pop = el('div', { class: `wp-pop is-${issue.type}`, role: 'dialog', 'aria-label': issue.title }, [
      el('div', { class: 'wp-pop-head' }, [
        el('span', { class: `wp-dot is-${issue.type}`, 'aria-hidden': 'true' }),
        el('span', { class: 'wp-pop-type', text: TYPES[issue.type].name }),
        el('span', { class: `wp-kind${issue.definite ? ' is-definite' : ''}`, text: issue.definite ? 'Fix' : 'Idea' }),
        issue.source === 'ai' ? el('span', { class: 'wp-ai-tag', text: 'AI' }) : null,
        el('button', { type: 'button', class: 'wp-icon-btn wp-pop-x', 'aria-label': 'Close', onclick: closePop }, [icon(ICONS.x)])
      ]),
      el('p', { class: 'wp-pop-found', translate: 'no' }, [el('span', { class: `wp-pop-quote is-${issue.type}`, text: text.length > 140 ? `${text.slice(0, 140)}…` : text })]),
      el('h3', { class: 'wp-pop-title', text: issue.title }),
      el('p', { class: 'wp-pop-msg', text: issue.message }),
      issue.example ? el('p', { class: 'wp-pop-example', translate: 'no' }, [el('b', { text: 'Example: ' }), issue.example]) : null,
      choices.childNodes.length || issue.lookup ? el('p', { class: 'wp-pop-label', text: 'Suggested change' }) : null,
      choices,
      actions
    ]);
    // An English word in Tagalog (or the other way): the Dictionary's translation.
    if (issue.lookup && !(issue.suggestions || []).length) {
      const waiting = el('span', { class: 'wp-pop-wait', text: 'Looking up a translation…' });
      choices.append(waiting);
      fetch(`dictionary_api.php?word=${encodeURIComponent(issue.lookup.word)}&from=${issue.lookup.from}`, { credentials: 'same-origin' })
        .then((response) => response.json()).then((data) => {
          waiting.remove();
          const found = [];
          (data.translations || []).forEach((group) => (group.words || []).forEach((word) => { if (found.length < 4 && !found.includes(word)) found.push(word); }));
          if (!found.length) choices.append(el('span', { class: 'wp-pop-wait', text: 'No translation found. Try the Dictionary.' }));
          found.forEach((word) => addChoice(/^\p{Lu}/u.test(text) ? word.charAt(0).toUpperCase() + word.slice(1) : word));
        }).catch(() => { waiting.textContent = 'The translation needs the internet.'; });
    }
    actions.append(el('button', { type: 'button', class: 'wp-btn wp-btn-ghost wp-btn-sm', onclick: () => ignore(issue) }, [icon(ICONS.x), el('span', { text: 'Ignore' })]));
    if (['spelling', 'mismatch'].includes(issue.type) && /^[\p{L}'’-]+$/u.test(text)) {
      actions.append(el('a', { class: 'wp-btn wp-btn-ghost wp-btn-sm', href: `dictionary.php?q=${encodeURIComponent(text.toLowerCase())}&from=${issue.lookup ? issue.lookup.from : note.lang}`, target: '_blank', rel: 'noopener' }, [icon(ICONS.book), el('span', { text: 'Dictionary' })]));
    }
    document.body.append(pop);
    placePop(issue);
  }
  function placePop(issue) {
    if (!pop) return;
    if (mobile()) { pop.classList.add('is-sheet'); return; }
    const mark = ui.backdrop.querySelector(`[data-id="${issue.id}"]`);
    const rect = (mark || ui.textarea).getBoundingClientRect();
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;
    let left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - 12) top = Math.max(12, rect.top - height - 8);
    pop.style.left = `${left + window.scrollX}px`;
    pop.style.top = `${top + window.scrollY}px`;
  }
  document.addEventListener('pointerdown', (event) => {
    if (pop && !pop.contains(event.target) && event.target !== ui.textarea) closePop();
  });
  window.addEventListener('resize', () => { closePop(); updateCheckButton(); });

  function accept(issue, suggestion) {
    const area = ui.textarea;
    area.focus({ preventScroll: true });
    area.setSelectionRange(issue.start, issue.end);
    // Kept in the undo history where the browser allows it.
    let done = false;
    try { done = document.execCommand && document.execCommand('insertText', false, suggestion); } catch (error) { done = false; }
    if (!done || area.value.slice(issue.start, issue.start + suggestion.length) !== suggestion) {
      area.setRangeText(suggestion, issue.start, issue.end, 'end');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    }
    closePop();
    window.clearTimeout(checkTimer);
    runCheck();
  }
  function ignore(issue) {
    note.ignored = Array.from(new Set((note.ignored || []).concat(issue.key)));
    api('ignore', { id: note.id, keys: note.ignored }).catch(() => {});
    closePop();
    result = Checker.check(ui.textarea.value, note.lang, spellCache[note.lang], { ignored: note.ignored });
    placeAiIssues();
    renderMarks();
    renderPanel();
  }

  // --- Feedback ------------------------------------------------------------------------------------------
  function currentFeedback() {
    const seconds = note.kind === 'challenge' ? Math.min(note.challenge.seconds, Math.max(1, Math.round((Math.min(now(), note.challenge.ends) - note.challenge.started) / 1000))) : 0;
    return Checker.feedback(ui.textarea.value, note.lang, result || Checker.check(ui.textarea.value, note.lang, spellCache[note.lang], { ignored: note.ignored || [] }), { seconds });
  }
  function showFeedback(fresh) {
    if (!result && fresh) { runCheck().then(() => showFeedback(true)); return; }
    const data = fresh || !note.feedback ? currentFeedback() : note.feedback;
    const box = ui.feedbackBox;
    box.hidden = false;
    const section = (cls, iconPath, title, children) => el('section', { class: `wp-fb-card ${cls}` }, [el('h3', {}, [icon(iconPath), el('span', { text: title })])].concat(children));
    const s = data.stats || {};
    const stat = (value, label) => (value === null || value === undefined ? null : el('div', { class: 'wp-stat' }, [el('b', { text: String(value) }), el('span', { text: label })]));
    const review = note.review && (!note.review.lang || note.review.lang === note.lang) ? note.review : null;
    box.replaceChildren(
      el('div', { class: 'wp-fb-head' }, [
        el('h2', { text: note.kind === 'challenge' && !fresh ? 'Challenge results' : 'Your feedback' }),
        el('p', { text: fresh ? 'Based on your writing right now.' : 'From when your challenge ended. The marks above show your writing as it is now.' }),
        el('button', { type: 'button', class: 'wp-icon-btn', 'aria-label': 'Close the feedback', onclick: () => { box.hidden = true; } }, [icon(ICONS.x)])
      ]),
      el('div', { class: 'wp-stats' }, [stat(s.words, 'words'), stat(s.sentences, 'sentences'), stat(s.paragraphs, 'paragraphs'), stat(s.unique, 'different words'),
        stat(s.averageSentence, 'words per sentence'), stat(s.corrections, 'to fix'), stat(s.ideas, 'ideas'), s.minutes ? stat(s.minutes, 'minutes') : null, s.wordsPerMinute ? stat(s.wordsPerMinute, 'words a minute') : null]),
      section('is-strengths', ICONS.star, 'What you did well', [el('ul', {}, (data.strengths || []).concat(review ? review.strengths || [] : []).map((item) => el('li', { text: item })))]),
      (data.corrections || []).length ? section('is-corrections', ICONS.edit, 'Corrections', data.corrections.map((group) => el('div', { class: `wp-fb-group is-${group.type}` }, [
        el('h4', {}, [el('span', { class: `wp-dot is-${group.type}`, 'aria-hidden': 'true' }), group.name]),
        el('ul', {}, group.items.map((item) => el('li', {}, [
          el('span', { class: 'wp-fb-from', translate: 'no', text: item.text }),
          item.suggestion !== '' ? el('span', { class: 'wp-fb-arrow', 'aria-hidden': 'true', text: '→' }) : null,
          item.suggestion !== '' ? el('span', { class: 'wp-fb-to', translate: 'no', text: item.suggestion }) : null,
          el('span', { class: `wp-kind${item.definite ? ' is-definite' : ''}`, text: item.definite ? 'Fix' : 'Idea' }),
          el('span', { class: 'wp-fb-why', text: item.message }),
          item.example ? el('span', { class: 'wp-fb-example', translate: 'no', text: `Example: ${item.example}` }) : null
        ])))
      ]))) : null,
      (data.improved || []).length || (review && (review.improved || []).length) ? section('is-improved', ICONS.check, 'Your sentences, improved', [el('ul', {}, (data.improved || []).concat(review ? review.improved || [] : []).slice(0, 5).map((item) => el('li', { translate: 'no' }, [
        el('span', { class: 'wp-fb-before', text: item.original }), el('span', { class: 'wp-fb-after', text: item.suggestion })
      ])))]) : null,
      section('is-advice', ICONS.bulb, 'Writing advice', [el('ul', {}, (data.advice || []).concat(review ? review.advice || [] : []).slice(0, 6).map((item) => el('li', { text: item })))]),
      data.emoji ? section('is-emoji', '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 007 0M9 9.5h.01M15 9.5h.01"/>', 'About emojis', [el('p', { text: data.emoji })]) : null,
      review && review.summary ? section('is-ai', ICONS.spark, 'AI coach says', [el('p', { text: review.summary })]) : null,
      el('p', { class: 'wp-fb-note', text: 'Tip: fix one kind of mistake at a time, then read your whole piece again. You can keep revising it here whenever you like.' })
    );
    if (fresh) box.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  // A finished challenge without feedback yet (time ran out while away).
  async function finishFeedback() {
    await runCheck();
    const data = currentFeedback();
    note.feedback = data;
    showFeedback(false);
    api('challenge_finish', { id: note.id, feedback: data }).catch(() => {});
  }

  // --- AI review -----------------------------------------------------------------------------------------------
  async function runAiReview(event) {
    const button = event && event.currentTarget;
    if (!note || !ui.textarea.value.trim()) { toast('Write something first, then ask for a review.'); return; }
    await flushSave();
    if (button) { button.disabled = true; button.querySelector('span:last-child').textContent = 'Reviewing…'; }
    try {
      const { review } = await api('review', { id: note.id });
      review.lang = note.lang;
      note.review = review;
      placeAiIssues();
      if (!showChecks) toggleChecks();
      renderMarks();
      renderPanel();
      showFeedback(true);
      toast(`The AI review found ${aiIssues.length} suggestion${aiIssues.length === 1 ? '' : 's'}. They are marked with "AI".`);
    } catch (error) {
      toast(error.message);
    } finally {
      if (button && button.isConnected) { button.disabled = false; button.querySelector('span:last-child').textContent = 'AI review'; }
    }
  }

  // --- Delete ----------------------------------------------------------------------------------------------------
  async function deleteNote() {
    document.getElementById('wpDeleteText').textContent = `"${note.title || 'Untitled notepad'}" and its writing will be gone for good.`;
    if (await ask(document.getElementById('wpDeleteDialog')) !== 'delete') return;
    const id = note.id;
    try {
      window.clearTimeout(saveTimer);
      dirty = false;
      await api('delete', { id });
      dropDraft(id);
      notes = notes.filter((item) => item.id !== id);
      showHome();
      toast('Notepad deleted.');
    } catch (error) { toast(error.message); }
  }

  // --- Challenge: setting it up ----------------------------------------------------------------------------
  function showSetup() {
    flushSave();
    mode = 'setup';
    note = null;
    ui = {};
    setFocus(true);
    setUrl({ challenge: 1 });
    let minutes = 5;
    let lang = 'en';
    let idea = '';
    const durations = [1, 3, 5, 10, 15];
    const custom = el('input', { type: 'number', class: 'wp-custom', min: '1', max: '60', step: '1', inputmode: 'numeric', placeholder: 'Other', 'aria-label': 'Minutes (1 to 60)' });
    const minuteButtons = durations.map((value) => el('button', { type: 'button', class: `wp-chip${value === minutes ? ' is-on' : ''}`, 'aria-pressed': String(value === minutes), text: `${value} min`,
      onclick: () => { minutes = value; custom.value = ''; mark(); } }));
    const langButtons = ['en', 'tl'].map((code) => el('button', { type: 'button', class: `wp-seg-btn${code === lang ? ' is-on' : ''}`, 'aria-pressed': String(code === lang), text: LANG[code],
      onclick: () => { lang = code; idea = ''; ideaBox.hidden = true; mark(); } }));
    const ideaText = el('p', { class: 'wp-idea-text', translate: 'no' });
    const ideaBox = el('div', { class: 'wp-idea', hidden: true }, [icon(ICONS.bulb), ideaText]);
    const error = el('p', { class: 'wp-error', role: 'alert', hidden: true });
    function mark() {
      minuteButtons.forEach((button, index) => { const on = durations[index] === minutes && !custom.value; button.classList.toggle('is-on', on); button.setAttribute('aria-pressed', String(on)); });
      langButtons.forEach((button, index) => { const on = ['en', 'tl'][index] === lang; button.classList.toggle('is-on', on); button.setAttribute('aria-pressed', String(on)); });
    }
    custom.addEventListener('input', () => { const value = Math.round(Number(custom.value)); if (value >= 1 && value <= 60) minutes = value; mark(); });
    const start = el('button', { type: 'button', class: 'wp-btn wp-btn-primary wp-btn-lg' }, [icon(ICONS.clock), el('span', { text: 'Start the challenge' })]);
    start.addEventListener('click', async () => {
      if (custom.value) {
        const value = Math.round(Number(custom.value));
        if (!(value >= 1 && value <= 60)) { error.textContent = 'Choose a time from 1 to 60 minutes.'; error.hidden = false; return; }
        minutes = value;
      }
      error.hidden = true;
      start.disabled = true;
      try {
        const { note: created } = await api('challenge_start', { lang, seconds: minutes * 60, title: idea || '' });
        notes.unshift({ ...created });
        note = created;
        setUrl({ note: created.id });
        startChallengeView();
      } catch (problem) { error.textContent = problem.message; error.hidden = false; start.disabled = false; }
    });
    stage.replaceChildren(el('header', { class: 'wp-bar is-plain' }, [backButton(goBack)]), el('div', { class: 'wp-setup' }, [
      el('div', { class: 'wp-setup-head' }, [el('span', { class: 'wp-empty-icon' }, [icon(ICONS.clock)]), el('h2', { text: 'Writing challenge' }),
        el('p', { text: 'Write as much as you can before the time runs out. When it ends, you will see what you did well and what to fix.' })]),
      el('div', { class: 'wp-field' }, [el('span', { class: 'wp-field-label', text: 'How long?' }), el('div', { class: 'wp-chips' }, minuteButtons.concat(el('label', { class: 'wp-custom-wrap' }, [custom, el('span', { text: 'min' })])))]),
      el('div', { class: 'wp-field' }, [el('span', { class: 'wp-field-label', text: 'Which language?' }), el('div', { class: 'wp-seg is-wide', role: 'group', 'aria-label': 'Challenge language' }, langButtons)]),
      el('div', { class: 'wp-field' }, [el('span', { class: 'wp-field-label', text: 'Need an idea? (optional)' }),
        el('button', { type: 'button', class: 'wp-btn wp-btn-ghost', onclick: () => { const list = IDEAS[lang]; idea = list[Math.floor(Math.random() * list.length)]; ideaText.textContent = idea; ideaBox.hidden = false; } }, [icon(ICONS.bulb), el('span', { text: 'Give me an idea' })]),
        ideaBox]),
      error,
      start
    ]));
  }
  document.getElementById('wpNewChallenge').addEventListener('click', showSetup);

  // --- Challenge: writing ------------------------------------------------------------------------------------
  let tick = 0;
  let heartbeat = 0;
  function stopTimers() { window.clearInterval(tick); window.clearInterval(heartbeat); tick = heartbeat = 0; }
  function startChallengeView() {
    stopTimers();
    mode = 'challenge';
    setFocus(true);
    const c = note.challenge;
    const textarea = el('textarea', { class: 'wp-text is-focus', spellcheck: 'false', autocapitalize: 'sentences', 'aria-label': 'Your writing', lang: note.lang === 'tl' ? 'fil' : 'en', translate: 'no',
      placeholder: note.lang === 'tl' ? 'Simulan ang pagsulat dito…' : 'Start writing here…' });
    textarea.value = note.body;
    const time = el('span', { class: 'wp-timer-time', 'aria-hidden': 'true', translate: 'no' });
    const timeLabel = el('span', { class: 'wp-sr', role: 'timer', 'aria-live': 'off' });
    const bar = el('span', { class: 'wp-timer-fill' });
    const words = el('span', { class: 'wp-timer-words' });
    const saveState = el('span', { class: 'wp-save', role: 'status' }, [icon(ICONS.check), el('span', { text: 'Saved' })]);
    const notice = el('div', { class: 'wp-banner is-status is-running', hidden: !c.resumed }, [icon(ICONS.clock), el('span', { text: 'Resumed: the timer kept running while you were away. Your writing was saved.' })]);
    const titleIsIdea = note.title && !/·\s*\d+\s*min$/.test(note.title);
    // Back during a challenge: asked first (the clock keeps going).
    const leave = async () => {
      if (await ask(document.getElementById('wpLeaveDialog')) === 'leave') goBack();
    };
    stage.replaceChildren(el('div', { class: 'wp-challenge' }, [
      el('div', { class: 'wp-timer' }, [
        el('div', { class: 'wp-timer-top' }, [
          backButton(leave),
          el('span', { class: `wp-lang-tag is-${note.lang} is-big`, text: LANG[note.lang] }),
          el('span', { class: 'wp-timer-clock' }, [icon(ICONS.clock), time, timeLabel]),
          el('button', { type: 'button', class: 'wp-btn wp-btn-ghost wp-btn-sm', onclick: finishEarly }, [icon(ICONS.check), el('span', { text: 'I\'m done' })])
        ]),
        el('div', { class: 'wp-timer-bar', 'aria-hidden': 'true' }, [bar]),
        el('div', { class: 'wp-timer-foot' }, [words, saveState])
      ]),
      notice,
      titleIsIdea ? el('div', { class: 'wp-idea is-prompt' }, [icon(ICONS.bulb), el('p', { class: 'wp-idea-text', translate: 'no', text: note.title })]) : null,
      el('div', { class: 'wp-paper is-focus' }, [textarea])
    ]));
    ui = { textarea, saveState, title: null };
    const countWords = () => { words.textContent = `${(textarea.value.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length} words`; };
    countWords();
    textarea.addEventListener('input', () => { note.body = textarea.value; writeDraft(note.id, note.body); countWords(); queueSave(); grow(); });
    grow();
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    let warned = false;
    const update = () => {
      const left = c.ends - now();
      time.textContent = clock(left);
      bar.style.transform = `scaleX(${Math.max(0, Math.min(1, left / (c.seconds * 1000)))})`;
      const lastMinute = left <= Math.min(60000, c.seconds * 250);
      time.closest('.wp-timer').classList.toggle('is-low', lastMinute);
      if (lastMinute && !warned && c.seconds > 90) { warned = true; toast('One minute left!'); timeLabel.textContent = 'One minute left'; }
      if (left <= 0) timeUp();
    };
    update();
    tick = window.setInterval(update, 250);
    heartbeat = window.setInterval(() => { if (!dirty) { dirty = true; save(); } }, 15000);
  }
  async function timeUp() {
    if (mode !== 'challenge') return;
    stopTimers();
    mode = 'ending';
    ui.textarea.readOnly = true;
    note.body = ui.textarea.value;
    dirty = true;
    await save().catch(() => {});
    toast('Time is up! Here is your feedback.');
    await endChallenge(false);
  }
  async function finishEarly() {
    if (mode !== 'challenge') return;
    stopTimers();
    mode = 'ending';
    note.body = ui.textarea.value;
    dirty = true;
    await save().catch(() => {});
    await endChallenge(true);
  }
  async function endChallenge(early) {
    // The results: the writing with its marks, and the feedback below it.
    note.challenge.status = 'completed';
    showEditor();
    await runCheck();
    const data = currentFeedback();
    note.feedback = data;
    showFeedback(false);
    ui.feedbackBox.scrollIntoView({ block: 'start', behavior: 'auto' });
    try {
      const answer = await api('challenge_finish', { id: note.id, feedback: data, early });
      note.challenge = answer.note.challenge;
      touchList({ challenge: note.challenge });
    } catch (error) { toast(error.message); }
  }
  // Leaving in the middle of a challenge: asked first (the work is saved
  // either way, and the clock keeps running).
  window.addEventListener('beforeunload', (event) => {
    if (mode === 'challenge') { event.preventDefault(); event.returnValue = ''; }
  });

  // --- Small notices -------------------------------------------------------------------------------------------
  let toastBox = null;
  let toastTimer = 0;
  function toast(text) {
    if (!toastBox) { toastBox = el('div', { class: 'wp-toast', role: 'status', 'aria-live': 'polite' }); document.body.append(toastBox); }
    toastBox.textContent = text;
    toastBox.classList.add('is-on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastBox.classList.remove('is-on'), 3800);
  }

  // --- Start ---------------------------------------------------------------------------------------------------------
  (async () => {
    await loadList();
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get('note'));
    if (params.get('challenge')) showSetup();
    else if (id && notes.some((item) => item.id === id)) openNote(id);
    else if (params.get('new')) { showHome(); newNote(); }
    else showHome();
  })();
})();
