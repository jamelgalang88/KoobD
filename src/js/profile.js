// The profile page's favourites (profile.php). A favourite leaves the page when
// it is removed: with its × button (a short "Removed · Undo" message follows),
// or with the heart in its pop-up (js/story-details.js, the "koobd:favorite"
// event). Adding it back brings it back.
(function () {
  const grid = document.getElementById('profileFavoriteGrid');
  const empty = document.getElementById('profileFavoriteEmpty');
  const counts = document.querySelectorAll('[data-favorite-count]');
  const toast = document.getElementById('profileFavoriteToast');
  const undoButton = document.getElementById('profileFavoriteUndo');
  if (!grid) return;

  let undoKey = '';
  let toastTimer = 0;

  const itemFor = (key) => grid.querySelector(`.profile-fav-item[data-fav-key="${CSS.escape(key)}"]`);

  function refresh() {
    const shown = grid.querySelectorAll('.profile-fav-item:not([hidden])').length;
    counts.forEach((node) => { node.textContent = String(shown); });
    empty.classList.toggle('hidden', shown > 0);
  }

  function show(key, on) {
    const item = itemFor(key);
    if (item) item.hidden = !on;
    refresh();
  }

  // Saves for the same story run one after another, so a quick Undo always
  // lands after the removal it undoes.
  const queues = {};
  function save(key, on) {
    queues[key] = (queues[key] || Promise.resolve()).catch(() => {}).then(() => send(key, on));
    return queues[key];
  }
  function send(key, on) {
    return fetch('favorite_story.php', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({ key, favorite: on ? '1' : '0' })
    }).then((response) => {
      if (!response.ok) throw new Error('favorite');
      return response.json();
    });
  }

  function hideToast() {
    window.clearTimeout(toastTimer);
    toast.hidden = true;
    undoKey = '';
  }

  // The × on a cover: out of favourites at once, with a moment to undo it.
  grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-favorite]');
    if (!button) return;
    event.preventDefault();
    const key = button.closest('.profile-fav-item').dataset.favKey;
    show(key, false);
    undoKey = key;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hideToast, 6000);
    save(key, false).catch(() => { show(key, true); if (undoKey === key) hideToast(); });
  });

  undoButton.addEventListener('click', () => {
    const key = undoKey;
    if (!key) return;
    hideToast();
    show(key, true);
    save(key, true).catch(() => show(key, false));
  });

  // The heart in the story's pop-up.
  document.addEventListener('koobd:favorite', (event) => show(event.detail.key, event.detail.favorite));
})();
