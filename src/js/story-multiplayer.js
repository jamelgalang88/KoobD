// Play together: a classroom's Platform Mode story activity with "Play
// together" on (story_presence.php keeps who is where). While a student plays,
// classmates playing the same activity at the same time appear in the world
// as light silhouettes with their names above them, and everyone's place
// shows on the one progress bar as coloured dots - the student's own dot is
// labelled "You" - with the student's own percentage beside it, as in
// Geometry Dash. Nobody's progress, answers or score is shared or changed:
// each player only reports where they are.
//
// Smooth movement: each player notes how they move about twelve times a
// second (place, facing, running, on the ground, vertical speed) and sends
// those notes in small batches - a few times a second while classmates are
// on the same page, less often otherwise, never while the tab is hidden.
// Each classmate's silhouette replays their notes a fraction of a second
// behind (just enough to always have the next note in hand), so it runs,
// jumps and lands the way they did instead of jumping from point to point.
// Late or missing notes are bridged for a moment and then held; small
// differences are eased away, and only a real jump in place (a new scene, a
// restart) moves a silhouette at once. The player's own character never
// waits for any of this: the notes are read from it, nothing is written back.
//
// Silhouettes are one masked colour each. In a story whose character has a
// sprite sheet, they show the same walk and jump frames; otherwise the
// classmate's picture bobs while running and stretches and squashes in the
// air, with transforms only, so slower tablets keep up.
// window.KOOBD_MULTIPLAYER = { activityId } is set by the story page; the
// world comes from window.KoobdPlatformerLive (js/platformer-story-player.js).
(function () {
  const config = window.KOOBD_MULTIPLAYER;
  if (!config || !config.activityId) return;
  const ENDPOINT = 'story_presence.php';
  const SAMPLE_MS = 80;            // how often this player's movement is noted
  const SEND_NEAR_MS = 350;        // classmates on the same page
  const SEND_AWAY_MS = 1500;       // classmates elsewhere in the story
  const SEND_ALONE_MS = 3000;      // nobody else playing
  const MAX_SAMPLES = 24;          // per report
  const MIN_DELAY = 220;           // replay this far behind at least (ms)
  const MAX_DELAY = 1800;
  const BRIDGE_MS = 220;           // keep moving this long past the last note
  const GAP_MS = 700;              // a longer pause between notes is a stop, not a slow walk
  const SNAP_X = 45;               // farther than this from where it should be: move at once
  const SNAP_Y = 40;
  const lite = () => document.documentElement.classList.contains('koobd-lite');
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let myColor = '#ff5a5f';
  let players = new Map(); // id -> record (see track())
  let samples = [];        // this player's notes not yet sent
  let lastSample = null;
  let lastReportAt = 0;
  let lastState = '';
  let busy = false;
  let ghostLayer = null;
  let dotLayer = null;
  let frameId = 0;
  let lastFrame = 0;
  let size = null;         // the player's box, for silhouettes of the same size

  // --- The server's clock --------------------------------------------------------------------
  // Notes carry the server's time, so every page replays them on one clock:
  // the estimate from the quickest recent answers is kept.
  const clockSamples = [];
  let clockOffset = 0;
  function learnClock(sentAt, receivedAt, serverNow) {
    if (!serverNow) return;
    clockSamples.push({ rtt: receivedAt - sentAt, offset: serverNow - (sentAt + receivedAt) / 2 });
    if (clockSamples.length > 10) clockSamples.shift();
    clockOffset = clockSamples.reduce((best, item) => (item.rtt < best.rtt ? item : best)).offset;
  }
  const serverNow = () => performance.now() + clockOffset;

  // How far behind silhouettes replay: a little more than the oldest the
  // latest notes have been on arrival lately. It grows quickly when notes
  // come late and shrinks slowly, so replay never visibly speeds up.
  const lags = [];
  let delay = 600;
  let delayTarget = 600;
  function learnLag(lag) {
    const now = performance.now();
    lags.push({ lag, at: now });
    while (lags.length && now - lags[0].at > 6000) lags.shift();
    delayTarget = Math.max(MIN_DELAY, Math.min(MAX_DELAY, Math.max(...lags.map((item) => item.lag)) + 70));
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // --- Noting and reporting this player's movement ------------------------------------------
  function stateNow(live, snap) {
    if (document.body.classList.contains('has-story-question')) return 'question';
    if (!live) return 'reading';
    if (snap.progress >= 100) return 'finished';
    return snap.paused ? 'paused' : 'playing';
  }

  function sample() {
    const live = window.KoobdPlatformerLive;
    if (!live || document.hidden) return;
    const snap = live.snapshot();
    const note = { t: performance.now(), x: snap.x, y: snap.y, f: snap.facing, m: snap.running && !snap.paused ? 1 : 0, g: snap.grounded ? 1 : 0, vy: snap.vy || 0 };
    // Standing still: one note says it (the first and the latest of a still stretch are kept).
    const same = lastSample && lastSample.x === note.x && lastSample.y === note.y && lastSample.f === note.f && lastSample.m === note.m && lastSample.g === note.g;
    if (same && samples.length >= 2 && samples[samples.length - 2].x === note.x && samples[samples.length - 2].y === note.y) {
      samples[samples.length - 1] = note;
    } else {
      samples.push(note);
    }
    if (samples.length > MAX_SAMPLES) samples = samples.slice(-MAX_SAMPLES);
    lastSample = note;
  }

  // How often to report: often while a classmate shares this page, less when
  // they are elsewhere, rarely when playing alone.
  function reportEvery() {
    const live = window.KoobdPlatformerLive;
    const me = live ? live.snapshot() : null;
    let near = false;
    players.forEach((record) => { if (me && onMyPage(record, me)) near = true; });
    if (near) return SEND_NEAR_MS;
    return players.size ? SEND_AWAY_MS : SEND_ALONE_MS;
  }

  async function report(force = false) {
    if (busy || document.hidden) return;
    const now = performance.now();
    const live = window.KoobdPlatformerLive;
    const snap = live ? live.snapshot() : { x: 0, y: 0, facing: 1, scene: '', page: 0, progress: 0 };
    const state = stateNow(live, snap);
    if (!force && state === lastState && now - lastReportAt < reportEvery()) return;
    const sending = samples;
    samples = [];
    const payload = {
      activity: config.activityId, page: snap.page, scene: snap.scene, x: snap.x, y: snap.y, facing: snap.facing, progress: snap.progress, state,
      trail: sending.map((note) => [Math.round(now - note.t), note.x, note.y, note.f, note.m, note.g, note.vy])
    };
    busy = true;
    lastReportAt = now;
    lastState = state;
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (result.success) {
        learnClock(now, performance.now(), result.now);
        myColor = result.me.color;
        track(result.players || []);
        drawDots();
        startFrames();
      } else {
        samples = sending.concat(samples).slice(-MAX_SAMPLES);
      }
    } catch (error) {
      // Connection lost for a moment: the notes go with the next report, and
      // classmates hold where they were last seen until news arrives.
      samples = sending.concat(samples).slice(-MAX_SAMPLES);
    } finally {
      busy = false;
    }
  }

  // --- Classmates' notes ------------------------------------------------------------------------
  function track(list) {
    const seen = new Set();
    list.forEach((player) => {
      seen.add(player.id);
      let record = players.get(player.id);
      if (!record) {
        record = { id: player.id, notes: [], lastAt: 0, shown: null, walk: 0, airSince: 0, landUntil: 0, frame: '', ghost: null };
        players.set(player.id, record);
      }
      record.info = player;
      const at = Number(player.at) || 0;
      if (at && at > record.lastAt) {
        const trail = Array.isArray(player.trail) && player.trail.length
          ? player.trail.map((item) => ({ t: at - item[0], x: item[1], y: item[2], f: item[3], m: item[4], g: item[5], vy: item[6] }))
          : [{ t: at, x: player.x, y: player.y, f: player.facing, m: 0, g: 1, vy: 0 }];
        const newest = record.notes.length ? record.notes[record.notes.length - 1].t : -Infinity;
        trail.forEach((note) => { if (note.t > newest + 1) record.notes.push(note); });
        record.lastAt = at;
        if (record.notes.length) learnLag(serverNow() - record.notes[record.notes.length - 1].t);
      }
      // Notes older than any replay will need.
      const keepAfter = serverNow() - MAX_DELAY - 3000;
      while (record.notes.length > 2 && record.notes[1].t < keepAfter) record.notes.shift();
    });
    // Classmates who left (closed the page, or were not heard from) fade out.
    players.forEach((record, id) => {
      if (seen.has(id)) return;
      removeGhost(record);
      players.delete(id);
    });
  }

  function onMyPage(record, me) {
    const info = record.info;
    return info && info.page === me.page && (info.scene || '') === (me.scene || '');
  }

  // Where a classmate is at a moment of the shared clock (and how they move then).
  function poseAt(notes, time) {
    if (!notes.length) return null;
    const first = notes[0];
    if (time <= first.t) return { ...first };
    for (let index = notes.length - 1; index >= 1; index -= 1) {
      const a = notes[index - 1];
      const b = notes[index];
      if (time < a.t || time > b.t) continue;
      // A long pause between notes: standing still, then moving on.
      let from = a.t;
      if (b.t - a.t > GAP_MS) {
        from = b.t - Math.min(BRIDGE_MS, b.t - a.t);
        if (time < from) return { ...a, m: 0 };
      }
      const k = (time - from) / Math.max(1, b.t - from);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, f: k < 0.5 ? a.f : b.f, m: a.m, g: k < 0.5 ? a.g : b.g, vy: a.vy + (b.vy - a.vy) * k };
    }
    // Past the latest note: keep going the same way for a moment, then hold.
    // Only sideways: guessing the height could sink a landing into the ground.
    const last = notes[notes.length - 1];
    const before = notes[notes.length - 2];
    const ahead = Math.min(BRIDGE_MS, time - last.t) / 1000;
    const pose = { ...last };
    if (before && last.m && last.t > before.t) pose.x += ((last.x - before.x) / ((last.t - before.t) / 1000)) * ahead;
    if (time - last.t > BRIDGE_MS + 400) pose.m = 0;
    return pose;
  }

  // --- Drawing ------------------------------------------------------------------------------------
  function ensureLayers(live) {
    if (!ghostLayer || ghostLayer.parentNode !== live.layer) {
      players.forEach((record) => { record.ghost = null; record.shown = null; });
      ghostLayer = el('div', 'mp-ghosts');
      ghostLayer.setAttribute('aria-hidden', 'true');
      live.layer.appendChild(ghostLayer);
      size = null;
    }
    if (live.progressBar && (!dotLayer || dotLayer.parentNode !== live.progressBar)) {
      dotLayer = el('div', 'mp-dots');
      dotLayer.setAttribute('aria-hidden', 'true');
      live.progressBar.appendChild(dotLayer);
      live.progressBar.classList.add('is-multiplayer');
    }
  }

  function measure(live) {
    size = {
      width: `${live.player.offsetWidth}px`,
      height: `${live.player.offsetHeight}px`,
      scale: getComputedStyle(live.player).getPropertyValue('--platformer-player-scale').trim() || '1'
    };
    players.forEach((record) => record.ghost && sizeGhost(record.ghost));
  }
  function sizeGhost(ghost) {
    if (!size) return;
    ghost.style.width = size.width;
    ghost.style.height = size.height;
    ghost.style.setProperty('--mp-scale', size.scale);
  }

  function makeGhost(record, live) {
    const info = record.info;
    const ghost = el('div', `mp-ghost${live.sheet ? ' is-sheet' : ''}`);
    const body = el('span', 'mp-ghost-body');
    // The character's shape filled with the player's colour (a mask over a
    // flat colour: no filters, cheap to draw). In a story with a sprite
    // sheet, the sheet's frames; otherwise the classmate's own picture. A
    // full address: a relative one would be read from the stylesheet's folder.
    const picture = el('span', 'mp-ghost-figure');
    const address = new URL(String(live.sheet || info.asset), document.baseURI).href.replace(/"/g, '%22');
    picture.style.setProperty('--mp-src', `url("${address}")`);
    const name = el('span', 'mp-ghost-name', info.name);
    name.setAttribute('translate', 'no');
    body.append(picture);
    ghost.append(name, body);
    ghostLayer.appendChild(ghost);
    sizeGhost(ghost);
    // Appears where the classmate is, fading in (never sliding in from elsewhere).
    ghost.classList.add('is-entering');
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => ghost.classList.remove('is-entering')));
    record.ghost = ghost;
    record.figure = picture;
    record.shown = null;
    record.frame = '';
    return ghost;
  }

  function removeGhost(record) {
    const ghost = record.ghost;
    record.ghost = null;
    record.shown = null;
    if (!ghost) return;
    if (reducedMotion || lite()) { ghost.remove(); return; }
    ghost.classList.add('is-leaving');
    window.setTimeout(() => ghost.remove(), 260);
  }

  // Pose of the silhouette: the same frames as the character's own (sprite
  // sheet), or classes for the picture's run, jump and landing.
  const JUMP_FRAME_LIFT = [0, 3, 9, 12, 6, 0];
  const jumpFrameFor = (vy) => (vy > 25 ? 2 : vy < -25 ? 4 : 3);
  function animate(record, pose, now, dt, sheet) {
    const ghost = record.ghost;
    const airborne = !pose.g;
    if (airborne && !record.airSince) record.airSince = now;
    if (!airborne && record.airSince) {
      if (now - record.airSince > 150) record.landUntil = now + 140;
      record.airSince = 0;
    }
    const running = pose.m && !airborne;
    record.walk = running ? record.walk + dt / 1000 : 0;
    const inAir = airborne && (now - record.airSince > 50 || Math.abs(pose.vy) > 25);
    const landing = !airborne && now < record.landUntil;
    if (sheet) {
      let row = 0;
      let column = Math.floor(now / 200) % 4;
      if (inAir) { row = 2; column = jumpFrameFor(pose.vy); }
      else if (landing) { row = 2; column = 5; }
      else if (running) { row = 1; column = Math.floor(record.walk / 0.09) % 6; }
      const frame = `${row}:${column}`;
      if (frame !== record.frame) {
        record.frame = frame;
        record.figure.style.setProperty('--mp-fx', `${(column / 5) * 100}%`);
        record.figure.style.setProperty('--mp-fy', `${(row / 2) * 100}%`);
        const lift = row === 2 ? JUMP_FRAME_LIFT[column] || 0 : 0;
        record.figure.style.setProperty('--mp-lift', lift ? `${((lift / 46) * 100).toFixed(3)}%` : '0px');
      }
    } else {
      const frame = inAir ? (pose.vy > 25 ? 'rise' : pose.vy < -25 ? 'fall' : 'top') : landing ? 'land' : running ? 'run' : 'idle';
      if (frame !== record.frame) {
        record.frame = frame;
        ghost.classList.toggle('is-running', frame === 'run');
        ghost.classList.toggle('is-rising', frame === 'rise');
        ghost.classList.toggle('is-falling', frame === 'fall' || frame === 'top');
        ghost.classList.toggle('is-landing', frame === 'land');
      }
    }
    ghost.classList.toggle('is-facing-left', pose.f < 0);
  }

  function drawFrame(now) {
    frameId = 0;
    const live = window.KoobdPlatformerLive;
    if (!live || !live.layer || document.hidden) return;
    // Slower tablets (lite mode): about 30 frames a second is plenty.
    if (lite() && now - lastFrame < 30) { startFrames(); return; }
    const dt = Math.min(100, lastFrame ? now - lastFrame : 16);
    lastFrame = now;
    ensureLayers(live);
    if (!size) measure(live);
    // Replay time moves on with the clock, easing toward the wanted delay.
    if (delay < delayTarget) delay = Math.min(delayTarget, delay + dt * 0.5);
    else if (delay > delayTarget) delay = Math.max(delayTarget, delay - dt * 0.08);
    const time = serverNow() - delay;
    const me = live.snapshot();
    let active = false;
    players.forEach((record) => {
      if (!onMyPage(record, me)) { removeGhost(record); return; }
      const pose = poseAt(record.notes, time);
      if (!pose) return;
      active = true;
      if (!record.ghost) makeGhost(record, live);
      const ghost = record.ghost;
      // Small differences are eased away; a real jump in place is shown at once.
      if (!record.shown || Math.abs(pose.x - record.shown.x) > SNAP_X || Math.abs(pose.y - record.shown.y) > SNAP_Y) {
        record.shown = { x: pose.x, y: pose.y };
      } else {
        const k = 1 - Math.exp(-dt / 45);
        record.shown.x += (pose.x - record.shown.x) * k;
        record.shown.y += (pose.y - record.shown.y) * k;
      }
      animate(record, pose, now, dt, Boolean(live.sheet));
      ghost.style.setProperty('--mp-color', record.info.color);
      ghost.classList.toggle('is-answering', record.info.state === 'question');
      live.place(ghost, record.shown.x, record.shown.y);
    });
    if (active) startFrames();
  }

  function startFrames() {
    if (!frameId && !document.hidden) frameId = window.requestAnimationFrame(drawFrame);
  }

  // Where a classmate's dot goes on this bar: the whole story, or (when the
  // bar shows only this page) their place on this page.
  function barPercent(live, me, player) {
    if (!live.barIsPage) return player.progress;
    if (player.page !== me.page) return player.page < me.page ? 0 : 100;
    const pageShare = 100 / Math.max(1, me.pageCount);
    return Math.max(0, Math.min(100, ((player.progress - player.page * pageShare) / pageShare) * 100));
  }

  const dots = new Map();
  function drawDots() {
    const live = window.KoobdPlatformerLive;
    if (!live || !live.layer) return;
    ensureLayers(live);
    if (live.progressBar) live.progressBar.style.setProperty('--mp-you', myColor);
    if (!dotLayer) return;
    const me = live.snapshot();
    players.forEach((record) => {
      let dot = dots.get(record.id);
      if (!dot || dot.parentNode !== dotLayer) {
        dot = el('span', 'mp-dot');
        dotLayer.appendChild(dot);
        dots.set(record.id, dot);
      }
      dot.style.setProperty('--mp-color', record.info.color);
      dot.style.left = `${barPercent(live, me, record.info).toFixed(2)}%`;
    });
    dots.forEach((dot, id) => { if (!players.has(id)) { dot.remove(); dots.delete(id); } });
  }

  // --- Running ------------------------------------------------------------------------------------
  window.setInterval(sample, SAMPLE_MS);
  // Checked often; reports go out at the pace reportEvery() picks.
  window.setInterval(() => report(), 100);
  // Silhouettes keep their size and place as the screen or page changes.
  window.addEventListener('resize', () => { size = null; startFrames(); });
  document.addEventListener('koobd:platformer-start', () => {
    ghostLayer = null;
    dotLayer = null;
    samples = [];
    lastSample = null;
    window.setTimeout(() => report(true), 200);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    // Back from another tab: start the notes afresh and catch up at once.
    samples = [];
    lastSample = null;
    report(true);
    startFrames();
  });
  // Leaving the page: classmates stop seeing this player at once.
  window.addEventListener('pagehide', () => {
    const body = JSON.stringify({ activity: config.activityId, leave: true });
    if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, body);
  });
  window.setTimeout(() => report(true), 300);
})();
