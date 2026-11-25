// Expand or collapse the Home checklist while keeping the button state accessible.
(function () {
  const panel = document.querySelector('.dash-missions-panel');
  const toggle = panel && panel.querySelector('.missions-toggle');
  if (!panel || !toggle) return;

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    panel.classList.toggle('is-expanded', expanded);
    panel.closest('.dash-side-col')?.classList.toggle('is-missions-expanded', expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.querySelector('span').textContent = expanded ? 'See less' : 'See more';
  });
})();
