// Screen time (screen_time_lib.php): measures a student's ACTIVE time on this
// page for their teachers' reports. A second counts only while the page is in
// view and focused AND being used - a tap, key, scroll or mouse move recently
// (a minute; two on reading and quiz pages, where reading and thinking take
// time), or a story's narration or video playing. Leaving the tab, another
// window in front, or no use for that long: nothing is counted. Nothing about
// what is on the screen or typed is kept - only seconds, in 30-second slots,
// sent to screen_time_track.php every 30 seconds and when the page is left.
// Added to student pages by koobdRequireAuth; never on teachers' pages.
(function () {
  if (window.__koobdScreenTime) return;
  window.__koobdScreenTime = true;

  const SLOT_MS = 30000;
  const SEND_MS = 30000;
  const page = (location.pathname.split('/').pop() || 'index.php').toLowerCase();
  const query = new URLSearchParams(location.search);
  const context = {
    page,
    activity: Number(query.get('activity_id') || query.get('activity')) || 0,
    classroom: page === 'classroom_room.php' ? Number(query.get('id')) || 0 : 0
  };
  const slowPages = ['book1.php', 'story.php', 'teacher_story_reader.php', 'shared_story_reader.php', 'quiz_take.php'];
  const idleMs = slowPages.includes(page) ? 120000 : 60000;

  let lastUse = performance.now();
  const used = () => { lastUse = performance.now(); };
  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll', 'input'].forEach((type) => {
    window.addEventListener(type, used, { capture: true, passive: true });
  });

  // Story readers show reading pages and Platform Mode pages: which is open.
  function kind() {
    const stage = document.getElementById('platformerStoryStage');
    if (!stage) return '';
    return stage.classList.contains('hidden') || stage.hidden ? 'story' : 'platform';
  }
  function mediaPlaying() {
    return Array.from(document.querySelectorAll('audio, video')).some((media) => !media.paused && !media.ended && media.readyState > 2);
  }

  // The server's clock, learned from its answers (the quickest one wins).
  let skew = 0;
  let bestRtt = Infinity;
  const slotNow = () => Math.floor((Date.now() + skew) / SLOT_MS);

  // slot -> { secs, kind, sent }
  const slots = new Map();
  window.setInterval(() => {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    if (performance.now() - lastUse > idleMs && !mediaPlaying()) return;
    const slot = slotNow();
    const entry = slots.get(slot) || { secs: 0, kind: '', sent: 0 };
    entry.secs = Math.min(30, entry.secs + 1);
    entry.kind = kind();
    slots.set(slot, entry);
  }, 1000);

  function payload() {
    const list = [];
    slots.forEach((entry, slot) => {
      if (entry.secs > entry.sent) list.push([slot, entry.secs, entry.kind]);
    });
    return list.length ? { ...context, slots: list.slice(-40) } : null;
  }
  function settle(body) {
    body.slots.forEach(([slot, secs]) => {
      const entry = slots.get(slot);
      if (entry) entry.sent = Math.max(entry.sent, secs);
    });
    // Finished slots that are fully sent are forgotten.
    const current = slotNow();
    slots.forEach((entry, slot) => { if (slot < current && entry.sent >= entry.secs) slots.delete(slot); });
  }
  async function send() {
    const body = payload();
    if (!body) return;
    const sentAt = Date.now();
    try {
      const response = await fetch('screen_time_track.php', {
        method: 'POST', credentials: 'same-origin', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!response.ok) return;
      const result = await response.json().catch(() => null);
      const receivedAt = Date.now();
      if (result && result.now && receivedAt - sentAt < bestRtt) {
        bestRtt = receivedAt - sentAt;
        skew = result.now - (sentAt + receivedAt) / 2;
      }
      settle(body);
    } catch (error) {
      // Offline: kept, and sent with the next try (if still recent).
    }
  }
  // Leaving the page or the tab: what is left goes now.
  function flush() {
    const body = payload();
    if (!body) return;
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    if (navigator.sendBeacon && navigator.sendBeacon('screen_time_track.php', blob)) settle(body);
    else send();
  }
  window.setInterval(send, SEND_MS);
  window.setTimeout(send, 5000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
})();
