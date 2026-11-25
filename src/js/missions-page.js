// Filter the full mission list by its current status.
(function () {
  const buttons = document.querySelectorAll('.missions-page-filters .wn-filter');
  const items = document.querySelectorAll('.journey-mission-item');
  const stages = document.querySelectorAll('.journey-stage-item');
  const empty = document.getElementById('missionsFilterEmpty');
  if (!buttons.length || !items.length || !stages.length || !empty) return;

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.filter;
      buttons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      let visible = 0;
      items.forEach((item) => {
        const shown = filter === 'all' || item.dataset.type === filter;
        item.hidden = !shown;
        if (shown) visible++;
      });
      stages.forEach((stage) => {
        const stageItems = stage.querySelectorAll('.journey-mission-item');
        const hasVisibleItem = Array.from(stageItems).some((item) => !item.hidden);
        stage.hidden = !hasVisibleItem;
        if (hasVisibleItem && filter !== 'all') stage.querySelector('.journey-stage').open = true;
      });
      empty.hidden = visible > 0;
    });
  });
})();
