// Quiz / Reading tabs above a classroom's activities (teacher_classroom.php and
// classroom_room.php): one kind of activity is shown at a time. The page draws
// the tabs with one already chosen; here they switch, the choice is kept for
// this classroom on this device, and a link to one activity
// (#activity-<id>, or ?comments=<id>) opens the tab it is in.
(function () {
  document.querySelectorAll('[data-activity-tabs]').forEach((bar) => {
    const tabs = Array.from(bar.querySelectorAll('[role="tab"]'));
    const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
    const key = `koobd.activityTab.${bar.dataset.activityTabs}`;

    function select(name, { focus = false, remember = true } = {}) {
      tabs.forEach((tab, index) => {
        const on = tab.dataset.tab === name;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.tabIndex = on ? 0 : -1;
        tab.classList.toggle('is-active', on);
        if (panels[index]) panels[index].hidden = !on;
        if (on && focus) tab.focus();
      });
      if (remember) {
        try { window.localStorage.setItem(key, name); } catch (problem) { /* private mode */ }
      }
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab.dataset.tab));
      // Arrow keys move between the tabs (and Home / End).
      tab.addEventListener('keydown', (event) => {
        let next = -1;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        if (next < 0) return;
        event.preventDefault();
        select(tabs[next].dataset.tab, { focus: true });
      });
    });

    // A link to one activity wins; then the last tab used here; then the page's choice.
    function tabOf(id) {
      const target = id && document.getElementById(`activity-${id}`);
      const panel = target && panels.find((item) => item && item.contains(target));
      return panel ? tabs[panels.indexOf(panel)].dataset.tab : '';
    }
    const fromHash = (window.location.hash.match(/^#activity-(\d+)$/) || [])[1];
    const fromQuery = new URLSearchParams(window.location.search).get('comments');
    const linked = tabOf(fromHash) || tabOf(fromQuery);
    let saved = '';
    try { saved = window.localStorage.getItem(key) || ''; } catch (problem) { /* private mode */ }
    if (linked) select(linked, { remember: false });
    else if (tabs.some((tab) => tab.dataset.tab === saved)) select(saved, { remember: false });
    window.addEventListener('hashchange', () => {
      const tab = tabOf((window.location.hash.match(/^#activity-(\d+)$/) || [])[1]);
      if (tab) select(tab);
    });
  });
})();
