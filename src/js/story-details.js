// The story details pop-up: opening a story first shows its details over the
// page (the page behind blurs), like choosing a show on a streaming app: the
// cover, the title and mode, a Read / Play button (and Start Over when there
// is progress), then what the story is about, its lesson and who made it.
//
// Anything with data-story-title (a story card, an "Open Book" button...)
// opens it; the attributes are written by koobdStoryDetailsData() in auth.php
// (or js/home-search.js for search results):
//   data-story-title, -href, -cover, -mode (story | platform), -creator,
//   -description, -lesson, -progress (0-100), -play (the button's label),
//   -alt-href and -alt-label (a second button, e.g. Start Over), -key (the
//   story's favourite key; with it the pop-up shows a heart, favorite_story.php).
// When a favourite is added or removed, a "koobd:favorite" event ({ key,
// favorite }) is sent on document (profile.php updates its list with it).
// Other scripts can call window.KoobdStoryDetails.open({ title, href, ... }).
// Ctrl / Cmd / Shift / middle clicks still open the story directly.
// (The teacher's My Stories and the editor do not use it.)
(function () {
  const TRIGGER = 'a[data-story-title], button[data-story-title]';
  const MODE_ICONS = {
    platform: 'M6 9h12a4 4 0 014 4v1a3 3 0 01-5.4 1.8L15 14H9l-1.6 1.8A3 3 0 012 14v-1a4 4 0 014-4zM8 11v3M6.5 12.5h3M16 12h.01M18 13.5h.01',
    story: 'M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z'
  };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let overlay = null;
  let dom = {};
  let lastFocus = null;
  let closeTimer = 0;

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function svg(pathData) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    icon.appendChild(path);
    return icon;
  }

  function build() {
    overlay = make('div', 'story-details');
    overlay.hidden = true;
    const card = make('div', 'story-details-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'storyDetailsTitle');

    // The cover, with the title and the buttons over its lower part.
    dom.hero = make('div', 'story-details-hero');
    dom.cover = make('img', 'story-details-cover');
    dom.cover.alt = '';
    dom.close = make('button', 'story-details-close');
    dom.close.type = 'button';
    dom.close.setAttribute('aria-label', 'Close');
    dom.close.title = 'Close';
    dom.close.appendChild(svg('M6 6l12 12M18 6L6 18'));
    dom.badge = make('span', 'story-mode-badge');
    dom.title = make('h2', 'story-details-title');
    dom.title.id = 'storyDetailsTitle';
    dom.title.setAttribute('translate', 'no');
    dom.play = make('a', 'story-details-play');
    dom.playLabel = make('span');
    dom.play.append(svg('M7 4l13 8-13 8z'), dom.playLabel);
    dom.alt = make('a', 'story-details-alt');
    dom.altLabel = make('span');
    dom.alt.append(svg('M4 5v5h5M4.6 14a8 8 0 102-8.4L4 10'), dom.altLabel);
    dom.fav = make('button', 'story-details-fav');
    dom.fav.type = 'button';
    dom.fav.appendChild(svg('M12 20.5s-7.5-4.6-9.4-9.3C1.2 7.7 3.3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3.1 1.7-2 3.2-3.1 5.3-3.1 3.4 0 5.5 3.2 4.1 6.7-1.9 4.7-9.4 9.3-9.4 9.3z'));
    dom.fav.addEventListener('click', toggleFavorite);
    const actions = make('div', 'story-details-actions');
    actions.append(dom.play, dom.alt, dom.fav);
    const heroCopy = make('div', 'story-details-hero-copy');
    heroCopy.append(dom.badge, dom.title, actions);
    dom.hero.append(dom.cover, dom.close, heroCopy);

    // What the story is about, and how far the reader got.
    const body = make('div', 'story-details-body');
    dom.creator = make('p', 'story-details-creator');
    dom.progress = make('div', 'story-details-progress');
    dom.progressFill = make('span');
    const bar = make('div', 'story-details-progress-bar');
    bar.appendChild(dom.progressFill);
    dom.progressText = make('span', 'story-details-progress-text');
    dom.progress.append(make('span', 'story-details-progress-label', 'Your progress'), bar, dom.progressText);
    dom.description = make('p', 'story-details-description');
    dom.lessonBox = make('div', 'story-details-lesson');
    dom.lessonText = make('p');
    dom.lessonBox.append(make('span', 'story-details-lesson-label', 'Lesson'), dom.lessonText);
    body.append(dom.creator, dom.progress, dom.description, dom.lessonBox);

    card.append(dom.hero, body);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Clicking the blurred page around the card, the close button, or Esc closes it.
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    dom.close.addEventListener('click', close);
    document.addEventListener('keydown', (event) => {
      if (!overlay || overlay.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        // Keep the keyboard inside the pop-up.
        const stops = [dom.close, dom.play, dom.alt, dom.fav].filter((node) => !node.hidden);
        const index = stops.indexOf(document.activeElement);
        event.preventDefault();
        stops[(index + (event.shiftKey ? stops.length - 1 : 1)) % stops.length].focus();
      }
    });
  }

  // The details from a trigger's data-story-* attributes.
  function fromNode(node) {
    const data = node.dataset;
    return {
      title: data.storyTitle, href: data.storyHref || node.getAttribute('href') || '', cover: data.storyCover,
      mode: data.storyMode, creator: data.storyCreator, description: data.storyDescription, lesson: data.storyLesson,
      progress: data.storyProgress, play: data.storyPlay, altHref: data.storyAltHref, altLabel: data.storyAltLabel,
      key: data.storyKey
    };
  }

  function open(source) {
    if (!overlay) build();
    window.clearTimeout(closeTimer);
    const story = source instanceof Element ? fromNode(source) : (source || {});
    const platform = story.mode === 'platform';
    const progress = story.progress === undefined || story.progress === null || story.progress === '' ? null : Math.max(0, Math.min(100, Math.round(Number(story.progress) || 0)));

    dom.cover.hidden = !story.cover;
    if (story.cover) dom.cover.src = story.cover; else dom.cover.removeAttribute('src');
    dom.hero.classList.toggle('no-cover', !story.cover);
    dom.badge.className = `story-mode-badge is-${platform ? 'platform' : 'story'}`;
    dom.badge.replaceChildren(svg(MODE_ICONS[platform ? 'platform' : 'story']), make('span', '', platform ? 'Platform Mode' : 'Story Mode'));
    dom.title.textContent = story.title || 'Untitled Story';
    dom.play.href = story.href || '#';
    dom.playLabel.textContent = story.play || (platform ? 'Play Story' : 'Read Story');
    dom.alt.hidden = !story.altHref;
    if (story.altHref) {
      dom.alt.href = story.altHref;
      dom.altLabel.textContent = story.altLabel || 'Start Over';
    }
    dom.fav.hidden = !story.key;
    dom.fav.dataset.key = story.key || '';
    if (story.key) loadFavorite(story.key);
    dom.creator.textContent = story.creator || '';
    dom.creator.hidden = !story.creator;
    dom.progress.hidden = progress === null;
    if (progress !== null) {
      dom.progressFill.style.width = `${progress}%`;
      dom.progressText.textContent = progress >= 100 ? 'Completed' : `${progress}%`;
    }
    dom.description.textContent = story.description || '';
    dom.description.hidden = !story.description;
    dom.lessonText.textContent = story.lesson || '';
    dom.lessonBox.hidden = !story.lesson;

    lastFocus = document.activeElement;
    overlay.hidden = false;
    document.documentElement.classList.add('story-details-open');
    // Next frame: let it fade and grow in.
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('is-open')));
    dom.play.focus({ preventScroll: true });
  }

  // --- Favourites -----------------------------------------------------------------------
  function showFavorite(on) {
    dom.fav.classList.toggle('is-on', on);
    dom.fav.setAttribute('aria-pressed', on ? 'true' : 'false');
    const label = on ? 'Remove from Favorites' : 'Add to Favorites';
    dom.fav.setAttribute('aria-label', label);
    dom.fav.title = label;
  }
  async function request(key, body) {
    const response = await fetch(`favorite_story.php${body ? '' : `?key=${encodeURIComponent(key)}`}`, {
      method: body ? 'POST' : 'GET', body, credentials: 'same-origin', headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('favorite');
    return response.json();
  }
  // Whether the story is a favourite (asked each time the pop-up opens). The
  // heart can be tapped at once; a tap made before the answer comes wins.
  let favoriteTapped = false;
  function loadFavorite(key) {
    showFavorite(false);
    dom.fav.disabled = false;
    favoriteTapped = false;
    request(key).then((result) => {
      if (dom.fav.dataset.key === key && !favoriteTapped) showFavorite(Boolean(result.favorite));
    }).catch(() => {});
  }
  function toggleFavorite() {
    const key = dom.fav.dataset.key;
    if (!key || dom.fav.disabled) return;
    const next = !dom.fav.classList.contains('is-on');
    favoriteTapped = true;
    showFavorite(next); // at once; put back if saving fails
    dom.fav.disabled = true;
    const body = new URLSearchParams({ key, favorite: next ? '1' : '0' });
    request(key, body).then((result) => {
      const on = Boolean(result.favorite);
      if (dom.fav.dataset.key === key) showFavorite(on);
      document.dispatchEvent(new CustomEvent('koobd:favorite', { detail: { key, favorite: on } }));
    }).catch(() => {
      if (dom.fav.dataset.key === key) showFavorite(!next);
    }).finally(() => { if (dom.fav.dataset.key === key) dom.fav.disabled = false; });
  }

  function close() {
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove('is-open');
    document.documentElement.classList.remove('story-details-open');
    closeTimer = window.setTimeout(() => { overlay.hidden = true; }, reduceMotion.matches ? 0 : 260);
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true });
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest && event.target.closest(TRIGGER);
    if (!trigger || event.defaultPrevented || (overlay && overlay.contains(trigger))) return;
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open(trigger);
  });

  window.KoobdStoryDetails = { open, close };
})();
