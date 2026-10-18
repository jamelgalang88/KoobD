// Full screen for the story editor (teacher_story_editor.php): both the Story
// Mode canvas and the Platform Mode stage have a button for it
// ([data-editor-fullscreen]); the same button leaves it again.
//
// Where the browser allows it, the page goes truly full screen (Fullscreen
// API; the browser's bars hide). Where it does not - iPhones, some in-app
// browsers, or when the request is refused - the editor still takes the whole
// window: html.editor-fullscreen-fallback drops the page's margins and pins
// the editor to the screen. Either way html.editor-is-fullscreen is set, so the
// editor's layout (css/story-editor.css) can make room for the canvas.
window.KoobdEditorFullscreen = (() => {
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  const canUseApi = Boolean(request) && document.fullscreenEnabled !== false && document.webkitFullscreenEnabled !== false;
  const ICON_ENTER = 'M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5';
  const ICON_EXIT = 'M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5';

  const apiElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const isOn = () => Boolean(apiElement()) || root.classList.contains('editor-fullscreen-fallback');

  function setFallback(on) {
    root.classList.toggle('editor-fullscreen-fallback', on);
    // Older mobile browsers tuck their address bar away after a tiny scroll.
    if (on) window.setTimeout(() => window.scrollTo(0, 1), 50);
  }

  // Every full-screen button shows the action it will take next.
  function sync() {
    const on = isOn();
    root.classList.toggle('editor-is-fullscreen', on);
    document.querySelectorAll('[data-editor-fullscreen]').forEach((button) => {
      const label = on ? 'Exit full screen' : 'Full screen';
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.setAttribute('aria-label', label);
      button.title = label;
      const path = button.querySelector('svg path');
      if (path) path.setAttribute('d', on ? ICON_EXIT : ICON_ENTER);
      const text = button.querySelector('[data-fullscreen-text]');
      if (text) text.textContent = label;
    });
    // The canvases measure themselves on resize; tell them the space changed.
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  async function enter() {
    if (canUseApi) {
      try {
        await request.call(root, { navigationUI: 'hide' });
        setFallback(false);
        sync();
        return;
      } catch (error) {
        // Refused (not from a tap, or blocked by the browser): use the fallback.
      }
    }
    setFallback(true);
    sync();
  }

  async function exit() {
    setFallback(false);
    if (apiElement()) {
      try {
        await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } catch (error) {
        // Already left (e.g. with the Back gesture or Esc).
      }
    }
    sync();
  }

  function toggle() {
    return isOn() ? exit() : enter();
  }

  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  document.addEventListener('click', (event) => {
    const button = event.target.closest && event.target.closest('[data-editor-fullscreen]');
    if (!button) return;
    event.preventDefault();
    toggle();
  });
  // Esc leaves the fallback too (true full screen handles Esc itself).
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && root.classList.contains('editor-fullscreen-fallback') && !document.querySelector('.ed-modal:not(.hidden), [aria-modal="true"]:not([hidden])')) exit();
  });

  // A ready-made button (used by the Platform Mode toolbar).
  function createButton(className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className || '';
    button.setAttribute('data-editor-fullscreen', '');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d=""/></svg>';
    window.requestAnimationFrame(sync);
    return button;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync, { once: true });
  else sync();

  return { toggle, enter, exit, isOn, createButton, sync };
})();
