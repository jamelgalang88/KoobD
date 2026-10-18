// The home page's story search. Results follow the search box as the reader
// types - every letter added or removed updates them, with no Enter needed:
// the Classic Stories already on the page are filtered at once, and the
// Stories Made by Others are fetched from search_stories.php (all published
// stories, not only the newest few shown on the page). Only titles are
// searched. Clearing the box (or pressing Escape) brings the page back.
(function () {
  const input = document.querySelector('.dash-search');
  const column = document.querySelector('.dash-main-col');
  if (!input || !column) return;

  const classicSection = column.querySelector('.dash-category-wrap');
  const classicTiles = Array.from(column.querySelectorAll('.dash-category-grid .dash-story-tile'));
  const sharedSection = column.querySelector('.dash-shared-wrap');
  const sharedEmpty = sharedSection ? sharedSection.querySelector('.dash-shared-empty') : null;
  // Results are shown in the section's own grid: cards already on the page
  // stay where they are (hidden when they don't match), and older matching
  // stories are added to it - so nothing is swapped out while typing.
  let sharedGrid = sharedSection ? sharedSection.querySelector('.dash-shared-grid') : null;
  if (sharedSection && !sharedGrid) {
    sharedGrid = document.createElement('div');
    sharedGrid.className = 'dash-shared-grid';
    sharedGrid.hidden = true;
    sharedSection.appendChild(sharedGrid);
  }
  const pageCards = sharedGrid ? Array.from(sharedGrid.querySelectorAll('.dash-shared-card')) : [];
  const cardsByHref = new Map(pageCards.map((card) => [card.getAttribute('href'), card]));

  const summary = document.createElement('p');
  summary.className = 'dash-search-summary';
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');
  input.closest('.dash-search-wrap').appendChild(summary);

  const nothing = document.createElement('div');
  nothing.className = 'dash-search-empty';

  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-label', 'Search stories');
  input.setAttribute('placeholder', 'Search stories');

  let request = null;
  let token = 0;
  let classicCount = 0;

  const normalize = (text) => String(text || '').toLocaleLowerCase();

  // The title with the typed letters picked out.
  function markTitle(element, title, query) {
    const at = normalize(title).indexOf(normalize(query));
    element.textContent = '';
    if (!query || at < 0) {
      element.textContent = title;
      return;
    }
    const hit = document.createElement('mark');
    hit.className = 'search-hit';
    hit.textContent = title.slice(at, at + query.length);
    element.append(title.slice(0, at), hit, title.slice(at + query.length));
  }

  // Results that have just appeared ease in, one just after another. Ones
  // already on screen are left alone, so typing never makes them blink.
  function animateIn(nodes) {
    nodes.forEach((node, index) => {
      node.classList.remove('is-search-in');
      node.style.setProperty('--search-i', Math.min(index, 8));
      void node.offsetWidth;
      node.classList.add('is-search-in');
      node.addEventListener('animationend', () => node.classList.remove('is-search-in'), { once: true });
    });
  }

  function setSummary(query, total) {
    if (!query) {
      summary.textContent = '';
      return;
    }
    summary.textContent = total === 1 ? '1 story found' : `${total} stories found`;
  }

  function filterClassic(query) {
    let shown = 0;
    const appeared = [];
    const sectionWasHidden = Boolean(classicSection && classicSection.hidden);
    classicTiles.forEach((tile) => {
      const titleNode = tile.querySelector('.dash-story-title');
      const title = tile.dataset.title || (tile.dataset.title = titleNode ? titleNode.textContent.trim() : '');
      const match = !query || normalize(title).includes(normalize(query));
      const wasShown = !tile.hidden && !sectionWasHidden;
      tile.hidden = !match;
      if (titleNode) markTitle(titleNode, title, match ? query : '');
      if (match) {
        shown += 1;
        if (!wasShown) appeared.push(tile);
      }
    });
    classicCount = query ? shown : classicTiles.length;
    if (classicSection) classicSection.hidden = Boolean(query) && shown === 0;
    animateIn(appeared);
  }

  // The card's mode badge (the same as koobdStoryModeBadge in auth.php).
  const MODE_ICONS = {
    platform: 'M6 9h12a4 4 0 014 4v1a3 3 0 01-5.4 1.8L15 14H9l-1.6 1.8A3 3 0 012 14v-1a4 4 0 014-4zM8 11v3M6.5 12.5h3M16 12h.01M18 13.5h.01',
    story: 'M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z'
  };
  function modeBadge(mode) {
    const kind = mode === 'platform' ? 'platform' : 'story';
    const badge = document.createElement('span');
    badge.className = `story-mode-badge is-${kind}`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', MODE_ICONS[kind]);
    svg.appendChild(path);
    const label = document.createElement('span');
    label.textContent = kind === 'platform' ? 'Platform Mode' : 'Story Mode';
    badge.append(svg, label);
    return badge;
  }

  function sharedCard(story) {
    const card = document.createElement('a');
    card.className = 'dash-shared-card' + (story.cover ? '' : ' no-cover');
    card.href = story.href;
    // The details for the card's pop-up (js/story-details.js).
    Object.assign(card.dataset, {
      storyTitle: story.title || '',
      storyHref: story.href || '',
      storyCover: story.cover || '',
      storyMode: story.mode === 'platform' ? 'platform' : 'story',
      storyCreator: story.creator ? `Created by ${story.creator}` : '',
      storyDescription: story.description && story.description !== 'Published story' ? story.description : '',
      storyLesson: story.lesson || '',
      storyKey: story.key || ''
    });
    // A story the reader has opened: Continue / Restart (or Read Again).
    const resume = story.resume || null;
    if (resume) {
      if (resume.href) card.dataset.storyHref = resume.href;
      if (resume.progress !== undefined) card.dataset.storyProgress = String(resume.progress);
      if (resume.play) card.dataset.storyPlay = resume.play;
      if (resume['alt-href']) card.dataset.storyAltHref = resume['alt-href'];
      if (resume['alt-label']) card.dataset.storyAltLabel = resume['alt-label'];
    }
    card.appendChild(modeBadge(story.mode));
    if (story.cover) {
      const cover = document.createElement('div');
      cover.className = 'dash-shared-cover';
      const image = document.createElement('img');
      image.loading = 'lazy';
      image.decoding = 'async';
      image.src = story.cover;
      image.alt = story.title;
      image.loading = 'lazy';
      cover.appendChild(image);
      card.appendChild(cover);
    }
    const body = document.createElement('div');
    body.className = 'dash-shared-body' + (story.cover ? '' : ' no-cover');
    const heading = document.createElement('h3');
    heading.setAttribute('translate', 'no');
    heading.textContent = story.title;
    const meta = document.createElement('div');
    meta.className = 'dash-shared-meta';
    const author = document.createElement('span');
    author.className = 'dash-shared-author';
    author.textContent = `Created by ${story.creator}`;
    meta.appendChild(author);
    body.append(heading, meta);
    card.appendChild(body);
    return card;
  }

  function cardTitle(card) {
    const heading = card.querySelector('h3');
    if (!heading) return '';
    if (!card.dataset.title) card.dataset.title = heading.textContent.trim();
    return card.dataset.title;
  }

  // `stories` null: the page as it normally is (search cleared).
  function showShared(query, stories) {
    if (!sharedSection || !sharedGrid) return;
    const sectionWasHidden = sharedSection.hidden;
    const gridWasHidden = sharedGrid.hidden;
    const wanted = new Set();
    const appeared = [];
    (stories || []).forEach((story) => {
      let card = cardsByHref.get(story.href);
      if (!card) {
        card = sharedCard(story);
        card.hidden = true;
        cardsByHref.set(story.href, card);
        sharedGrid.appendChild(card);
      }
      wanted.add(card);
    });
    cardsByHref.forEach((card) => {
      const show = stories ? wanted.has(card) : pageCards.includes(card);
      const wasShown = !card.hidden && !sectionWasHidden && !gridWasHidden;
      card.hidden = !show;
      const heading = card.querySelector('h3');
      if (heading) markTitle(heading, cardTitle(card), stories && show ? query : '');
      if (show && !wasShown && stories) appeared.push(card);
    });
    const any = stories ? wanted.size > 0 : pageCards.length > 0;
    sharedGrid.hidden = !any;
    if (sharedEmpty) sharedEmpty.hidden = Boolean(stories) || pageCards.length > 0;
    sharedSection.hidden = Boolean(stories) && !any;
    animateIn(appeared);
  }

  function showNothing(query, show) {
    if (!show) {
      nothing.remove();
      return;
    }
    if (nothing.isConnected) return; // already showing: leave it be
    nothing.replaceChildren();
    const title = document.createElement('div');
    title.className = 'dash-search-empty-title';
    title.textContent = 'No stories match your search';
    const copy = document.createElement('p');
    copy.textContent = 'Try a different word, or check the spelling of the title.';
    nothing.append(title, copy);
    if (!nothing.isConnected) column.insertBefore(nothing, classicSection || sharedSection);
    animateIn([nothing]);
  }

  function clearSearch() {
    if (request) request.abort();
    request = null;
    token += 1;
    column.classList.remove('is-searching');
    filterClassic('');
    if (classicSection) classicSection.hidden = false;
    if (sharedSection) {
      showShared('', null);
      sharedSection.hidden = false;
    }
    showNothing('', false);
    setSummary('', 0);
  }

  function search() {
    const query = input.value.trim();
    if (!query) {
      clearSearch();
      return;
    }
    column.classList.add('is-searching');
    filterClassic(query);
    // The classic matches show at once; the summary counts them until the
    // other stories arrive. "No stories match" stays up (no flicker) until
    // the new results say otherwise.
    setSummary(query, classicCount);
    if (classicCount > 0) showNothing(query, false);

    if (request) request.abort();
    request = new AbortController();
    const mine = ++token;
    fetch(`search_stories.php?q=${encodeURIComponent(query)}`, {
      credentials: 'same-origin',
      signal: request.signal,
      headers: { Accept: 'application/json' },
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data) => {
        if (mine !== token) return; // the reader has typed on since
        const shared = Array.isArray(data.shared) ? data.shared : [];
        showShared(query, shared);
        setSummary(query, classicCount + shared.length);
        showNothing(query, classicCount + shared.length === 0);
      })
      .catch((error) => {
        if (error.name === 'AbortError' || mine !== token) return;
        // Offline or the server failed: still show what is on the page.
        const fallback = pageCards
          .filter((card) => normalize(cardTitle(card)).includes(normalize(query)))
          .map((card) => ({ title: cardTitle(card), href: card.getAttribute('href') }));
        showShared(query, fallback);
        setSummary(query, classicCount + fallback.length);
        showNothing(query, classicCount + fallback.length === 0);
      });
  }

  input.addEventListener('input', search);
  input.addEventListener('search', search); // the box's own clear (x) button
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') event.preventDefault();
    if (event.key === 'Escape' && input.value) {
      event.preventDefault();
      event.stopPropagation();
      input.value = '';
      clearSearch();
    }
  });
  if (input.value.trim()) search();
})();
