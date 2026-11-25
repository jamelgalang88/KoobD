// What Hint Hunt, Word Pairs, Letter Mix and Sentence Builder share: building
// the page, the set-up screen, the bar over a game, the results screen, and
// saving the best score.
window.KoobdMinigameKit = (function () {
  const config = window.KOOBD_MINIGAME || { game: '', bests: {} };
  const root = document.getElementById('mgRoot');
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
  const LEVELS = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];
  const LANGS = [['en', 'English'], ['tl', 'Filipino']];
  const bestOf = (key) => (config.bests[key] ? config.bests[key].best : 0);

  function backLinks() {
    const arrow = document.createElement('span');
    arrow.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
    return el('nav', { class: 'mg-nav', 'aria-label': 'Back' }, [
      el('a', { class: 'mg-back', href: 'minigames.php' }, [arrow.firstChild, 'Minigames']),
      el('a', { class: 'mg-back', href: 'profile.php', text: 'My Profile' })
    ]);
  }
  function seg(label, options, current, pick) {
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
  // The set-up screen: title, how to play, the choices, the best score, Start.
  const svg = (path, cls = '') => {
    const span = document.createElement('span');
    span.innerHTML = `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
    return span.firstChild;
  };
  // The X, the progress (one mark for each question) and the numbers, over a game.
  function hud({ onQuit, at, total, count, stats = [], extra = null }) {
    const steps = total ? el('div', { class: 'mg-steps', 'aria-hidden': 'true' }, Array.from({ length: total }, (_, i) => el('i', { class: i < at ? 'is-done' : (i === at ? 'is-now' : '') }))) : null;
    return el('div', { class: 'mg-hud' }, [
      el('button', { type: 'button', class: 'mg-quit', 'aria-label': 'Quit the game', onclick: onQuit }, [svg('M6 6l12 12M18 6L6 18')]),
      el('div', { class: 'mg-hud-main' }, [el('span', { class: 'mg-hud-count' }, [count]), steps]),
      extra,
      ...stats.map(([label, value]) => el('div', { class: 'mg-stat' }, [el('small', { text: label }), el('b', {}, [value])]))
    ]);
  }
  function setup({ title, sub, icon, steps, groups, bestKey, onStart }) {
    const best = el('span', { class: 'mg-best' });
    const refresh = () => {
      const value = bestOf(bestKey());
      best.replaceChildren(value ? 'Best ' : 'Not played yet', value ? el('strong', { text: String(value) }) : '');
    };
    const row = groups.map((group) => seg(group.label, group.options, group.get(), (value) => { group.set(value); refresh(); }));
    refresh();
    root.replaceChildren(
      backLinks(),
      el('header', { class: 'mg-hero' }, [
        el('span', { class: 'mg-hero-icon' }, [svg(icon)]),
        el('div', { class: 'mg-hero-text' }, [el('h1', { text: title }), el('p', { text: sub })])
      ]),
      el('section', { class: 'mg-panel' }, [
        el('ol', { class: 'mg-howto' }, steps.map((step, index) => el('li', {}, [el('b', { text: String(index + 1) }), el('span', { text: step })]))),
        el('div', { class: row.length > 1 ? 'mg-setup-row' : 'mg-setup-one' }, row),
        el('div', { class: 'mg-card-foot' }, [best, el('button', { type: 'button', class: 'mg-btn mg-btn-accent', onclick: onStart, text: 'Start' })])
      ])
    );
  }
  // The results: the score (saved, best kept), numbers, what to do next, and
  // anything else the game wants to show under them.
  function results({ heading, score, stats, again, change, changeLabel, extra, key }) {
    const before = bestOf(key);
    const newBest = el('span', { class: 'mg-newbest', hidden: true, text: 'New best score!' });
    const bestValue = el('dd', { text: String(Math.max(before, score)) });
    const saveStatus = el('p', { class: 'mg-save-status', role: 'status', hidden: true });
    sfx('success');
    root.replaceChildren(
      backLinks(),
      el('section', { class: 'mg-panel mg-result' }, [
        el('div', { class: 'mg-result-top' }, [
          el('h2', { text: heading }),
          el('p', { class: 'mg-score', text: String(score) }),
          newBest
        ]),
        el('div', { class: 'mg-result-body' }, [
          el('dl', { class: 'mg-stats' }, [
            ...stats.map(([label, value]) => el('div', {}, [el('dt', { text: label }), el('dd', { text: String(value) })])),
            el('div', {}, [el('dt', { text: 'Best score' }), bestValue])
          ]),
          el('div', { class: 'mg-actions' }, [
            el('button', { type: 'button', class: 'mg-btn mg-btn-accent', onclick: again, text: 'Play again' }),
            el('button', { type: 'button', class: 'mg-btn mg-btn-ghost', onclick: change, text: changeLabel }),
            el('a', { class: 'mg-btn mg-btn-ghost', href: 'minigames.php', text: 'Minigames' })
          ]),
          saveStatus,
          extra || null
        ])
      ])
    );
    fetch('minigames_api.php', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', game: config.game, variant: key, score })
    }).then((response) => response.json()).then((result) => {
      if (!result.success) throw new Error(result.message || 'Your score could not be saved.');
      config.bests[key] = { best: result.best, plays: result.plays };
      bestValue.textContent = String(result.best);
      if (result.newBest && before > 0) newBest.hidden = false;
      if (result.newUnlock) {
        saveStatus.hidden = false;
        saveStatus.classList.add('is-unlocked');
        saveStatus.replaceChildren(
          `New minigame unlocked: ${result.newUnlock.title}. `,
          el('a', { href: result.newUnlock.href, text: `Play ${result.newUnlock.title}` })
        );
      }
    }).catch((error) => {
      saveStatus.hidden = false;
      saveStatus.setAttribute('role', 'alert');
      saveStatus.textContent = error.message || 'Your score could not be saved. Check your connection and try again.';
    });
  }
  // Words and hints for a game, from the same list as Versus Mode.
  async function loadWords(lang, level) {
    const response = await fetch('minigames_api.php', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'words', game: config.game, lang, level })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'The words could not be loaded.');
    return result.words;
  }
  function showError(text, retry) {
    root.replaceChildren(backLinks(), el('section', { class: 'mg-panel', style: 'text-align:center' }, [
      el('p', { class: 'mg-sub', role: 'alert', text }),
      el('div', { class: 'mg-actions', style: 'margin-top:12px' }, [el('button', { type: 'button', class: 'mg-btn mg-btn-accent', onclick: retry, text: 'Try again' })])
    ]));
  }
  return { root, el, sfx, svg, shuffle, LEVELS, LANGS, setup, hud, results, loadWords, showError, backLinks };
})();
