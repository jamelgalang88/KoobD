// A Versus lobby and its match (versus_play.php) use the whole screen.
// Browsers only allow full screen once the player has touched the page, so it
// is asked for straight away (in case the browser allows it) and then on every
// tap, click or key while the page is not full screen - leaving it (Esc, the
// back gesture) lasts until the next tap. Where a browser has no full screen
// (an iPhone), or KoobD already runs from the home screen, nothing happens.
// During a match (body.vs-in-game) a phone or tablet is also turned sideways
// where it allows. The layout follows the screen size, so going in and out
// keeps the lobby and the match as they were.
(function () {
  const root = document.documentElement;
  const supported = Boolean(root.requestFullscreen && document.fullscreenEnabled !== false);
  const standalone = window.matchMedia && (window.matchMedia('(display-mode: fullscreen)').matches || window.matchMedia('(display-mode: standalone)').matches);

  function lockSideways() {
    if (!document.body.classList.contains('vs-in-game')) return;
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
  }
  function enter() {
    if (!supported || standalone || document.fullscreenElement) return Promise.resolve();
    return root.requestFullscreen({ navigationUI: 'hide' }).then(lockSideways).catch(() => {});
  }

  window.KoobdVersusFullscreen = { enter, lockSideways, auto: enter };
  if (!supported || standalone) return;
  enter();
  document.addEventListener('pointerdown', enter, { capture: true });
  document.addEventListener('keydown', (event) => {
    // Esc leaves full screen; it should not bring it straight back.
    if (event.key !== 'Escape') enter();
  }, { capture: true });
})();
