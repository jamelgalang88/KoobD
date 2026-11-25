// Story shelves on Home (Classic Stories, Stories Made by Others): one row of
// story cards that scrolls sideways - by swiping, or with the arrow buttons at
// its edges, which turn off at the row's ends - or, with Show all, a grid of
// every story in the section. Each shelf keeps its own place and state.
//
// Light on purpose: the arrows only scroll the row (the browser does the
// smooth motion), and their state is worked out at most once a frame.
(function () {
  const shelves = document.querySelectorAll('[data-story-shelf]');
  if (!shelves.length) return;

  const root = document.documentElement;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smooth = () => (reducedMotion || root.classList.contains('koobd-lite') ? 'auto' : 'smooth');

  shelves.forEach((shelf) => {
    const track = shelf.querySelector('.story-shelf-track');
    const prev = shelf.querySelector('.story-shelf-nav.is-prev');
    const next = shelf.querySelector('.story-shelf-nav.is-next');
    const toggle = shelf.querySelector('.story-shelf-toggle');
    const toggleLabel = toggle ? toggle.querySelector('.story-shelf-toggle-label') : null;
    if (!track) {
      if (toggle) toggle.hidden = true;
      return;
    }

    let expanded = false;
    let frame = 0;

    const cards = () => Array.from(track.children).filter((card) => !card.hidden);

    // Arrows: shown while the row is longer than the space it has, each one
    // turned off when there is nothing more that way. Show all: offered while
    // the row does not fit (and always while it is open, to close it again).
    function update() {
      frame = 0;
      const overflowing = track.scrollWidth > track.clientWidth + 2;
      // The arrows (in the section's header, beside Show all) show while the
      // row is longer than its space; each one is off at its end of the row.
      const showArrows = !expanded && overflowing;
      if (prev) {
        prev.hidden = !showArrows;
        prev.disabled = track.scrollLeft <= 2;
      }
      if (next) {
        next.hidden = !showArrows;
        next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
      }
      if (toggle) {
        toggle.hidden = !expanded && !overflowing;
        const label = expanded ? 'Show less' : `Show all (${cards().length})`;
        if (toggleLabel) toggleLabel.textContent = label;
        // Its name even when phones show only the icon.
        toggle.setAttribute('aria-label', label);
        toggle.title = label;
      }
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };

    // One press slides the row on by the cards in view (one fewer when more
    // than two show, so the last card seen stays as a landmark) and lands
    // exactly on a card's edge. The slide eases out over a third of a second;
    // only the row's scroll position changes, which is cheap to draw.
    let slide = 0;
    function slideTo(target) {
      window.cancelAnimationFrame(slide);
      const start = track.scrollLeft;
      const distance = target - start;
      if (Math.abs(distance) < 1) return;
      if (reducedMotion) {
        track.scrollLeft = target;
        return;
      }
      const duration = 380;
      let began = 0;
      track.classList.add('is-sliding');
      const step = (now) => {
        if (!began) began = now;
        const progress = Math.min(1, (now - began) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        track.scrollLeft = start + distance * eased;
        if (progress < 1) {
          slide = window.requestAnimationFrame(step);
        } else {
          slide = 0;
          track.classList.remove('is-sliding');
          update();
        }
      };
      slide = window.requestAnimationFrame(step);
    }
    function page(direction) {
      const first = cards()[0];
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      const card = first ? first.getBoundingClientRect().width + gap : track.clientWidth;
      const inView = Math.max(1, Math.floor((track.clientWidth + gap) / card));
      const move = (inView > 2 ? inView - 1 : inView) * card;
      const max = track.scrollWidth - track.clientWidth;
      // From where the row is now (or where a slide still running is headed).
      const from = Math.round(track.scrollLeft / card) * card;
      slideTo(Math.max(0, Math.min(max, from + direction * move)));
    }
    // A press shows in the website's colours for a moment (a tap on a touch
    // screen is too quick to see :active alone).
    function press(button) {
      button.classList.add('is-pressed');
      window.setTimeout(() => button.classList.remove('is-pressed'), 260);
    }
    if (prev) prev.addEventListener('click', () => { press(prev); page(-1); });
    if (next) next.addEventListener('click', () => { press(next); page(1); });

    track.addEventListener('scroll', schedule, { passive: true });
    if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(track);
    else window.addEventListener('resize', schedule);
    // Search hides and adds cards in the row.
    new MutationObserver(schedule).observe(track, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });

    if (toggle) {
      toggle.addEventListener('click', () => {
        expanded = !expanded;
        shelf.classList.toggle('is-expanded', expanded);
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        if (!expanded) {
          // Back to the row from its start; if the long grid had scrolled
          // the section's title out of view, bring it back.
          track.scrollLeft = 0;
          if (shelf.getBoundingClientRect().top < 0) shelf.scrollIntoView({ block: 'start', behavior: smooth() });
        }
        update();
      });
    }

    update();
    // Covers arriving can change the row's length.
    window.addEventListener('load', schedule, { once: true });
  });
})();
