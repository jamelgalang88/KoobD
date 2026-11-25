// Versus Mode, one lobby (versus_play.php): the waiting room, then the match.
//
// The arena is drawn on a canvas with a fixed camera (1120 x 630 units,
// scaled to fit the screen). The player's own character moves here at once
// (its physics run in this browser, so controls never wait for the network);
// a few times a second its movement goes to the server (versus_api.php),
// which checks it against the same limits and sends back the opponent's,
// replayed smoothly a moment behind. Everything that counts - which letters
// were collected, the question, whether the answer was right, the round, the
// score - is decided by the server; this page only shows it. The opponent's
// letters and progress never reach this page.
(function () {
  const config = window.KOOBD_VERSUS;
  if (!config) return;
  const arena = config.arena;
  const P = arena.physics;
  const W = arena.w;
  const H = arena.h;
  const $ = (id) => document.getElementById(id);
  const lite = () => document.documentElement.classList.contains('koobd-lite');
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    [].concat(children).forEach((child) => child !== null && child !== undefined && child !== false && node.append(child));
    return node;
  }
  const eventId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

  async function api(body) {
    const response = await fetch('versus_api.php', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobby: config.lobby, ...body })
    });
    const result = await response.json().catch(() => ({ success: false, message: 'The server did not answer.' }));
    if (!result.success) {
      const error = new Error(result.message || 'Something went wrong.');
      error.status = response.status;
      throw error;
    }
    return result;
  }

  // --- The server's clock (the quickest recent answers) -----------------------------------------
  const clock = [];
  let offset = 0;
  function learnClock(sent, received, serverNow) {
    if (!serverNow) return;
    clock.push({ rtt: received - sent, offset: serverNow - (sent + received) / 2 });
    if (clock.length > 12) clock.shift();
    offset = clock.reduce((best, item) => (item.rtt < best.rtt ? item : best)).offset;
  }
  const serverNow = () => performance.now() + offset;

  // --- State -----------------------------------------------------------------------------------------
  let lobby = null;      // the public lobby view
  let round = null;      // this round, as the server sees it for this player
  let opponentInfo = null;
  let view = '';         // 'room' | 'game'
  let polling = false;
  let lastPoll = 0;
  let roundId = 0;
  const players = {};    // side -> { info, image, sheet, anim }
  const Anim = window.KoobdCharacterAnimation;
  // Sound: KOOB'D's audio manager (js/koobd-audio.js) - the reader's settings apply.
  const sound = window.KoobdAudio || null;
  const sfx = (name, options) => { if (sound) sound.sfx(name, options); };
  let musicNow = '';
  const musicFor = (id) => { if (sound && musicNow !== id) { musicNow = id; sound.music(id); } };

  function side() { return lobby ? lobby.me : 'host'; }
  function otherSide() { return side() === 'host' ? 'guest' : 'host'; }

  // ===================================================================================================
  // The waiting room
  // ===================================================================================================
  function slot(player, label, waiting) {
    if (!player) {
      return [el('span', { class: 'vs-slot-avatar is-empty' }, [el('span', { class: 'vs-spinner', 'aria-hidden': 'true' })]),
        el('strong', { text: 'Waiting for opponent…' }), el('span', { class: 'vs-slot-role', text: label })];
    }
    return [
      el('span', { class: 'vs-slot-avatar', style: `--a:${player.top};--b:${player.bottom}` }, [el('img', { src: player.asset, alt: '' })]),
      el('strong', { translate: 'no', text: player.name }),
      el('span', { class: 'vs-slot-role', text: `${label} · ${player.username}` }),
      waiting === null ? null : el('span', { class: `vs-ready${waiting ? '' : ' is-on'}`, text: waiting ? 'Not ready' : 'Ready' })
    ];
  }

  let roomGuest = null;
  let roomReady = null;
  function renderRoom() {
    musicFor('lobby');
    // An opponent arriving, or getting ready: a soft ping (not on first sight).
    const guestId = lobby.guest ? lobby.guest.id : 0;
    if (roomGuest !== null && guestId && guestId !== roomGuest) sfx('join');
    if (roomReady !== null && lobby.guestReady !== roomReady && guestId === roomGuest) sfx(lobby.guestReady ? 'ready' : 'toggle');
    roomGuest = guestId;
    roomReady = lobby.guestReady;
    $('vsRoom').hidden = false;
    $('vsGame').hidden = true;
    $('vsCode').textContent = lobby.code;
    $('vsRules').replaceChildren(
      el('span', { class: 'vs-chip' }, [el('strong', { text: `First to ${lobby.win}` }), ' wins']),
      el('span', { class: 'vs-chip' }, [el('strong', { text: lobby.lang === 'fil' ? 'Filipino' : 'English' }), ' words']),
      el('span', { class: 'vs-chip' }, [el('strong', { text: LEVELS[lobby.level] || 'Mixed' }), lobby.level === 'mixed' || !lobby.level ? ' (easy to hard)' : ' words']),
      el('span', { class: 'vs-chip' }, [el('strong', { text: '3 hearts' }), ' each round']),
      el('span', { class: 'vs-chip' }, [el('strong', { text: 'Hints' }), ' for every word'])
    );
    $('vsSlotHost').replaceChildren(...slot(lobby.host, 'Host', null).filter(Boolean));
    $('vsSlotHost').classList.toggle('is-me', side() === 'host');
    $('vsSlotGuest').replaceChildren(...slot(lobby.guest, 'Opponent', lobby.guest ? !lobby.guestReady : null).filter(Boolean));
    $('vsSlotGuest').classList.toggle('is-me', side() === 'guest');
    const actions = [];
    let status = '';
    if (lobby.status === 'cancelled' || lobby.status === 'expired') {
      status = side() === 'host' ? 'This lobby has closed.' : 'The host closed this lobby.';
      actions.push(el('a', { class: 'vs-btn vs-btn-primary', href: 'versus.php', text: 'Back to Versus Mode' }));
    } else if (side() === 'host') {
      status = !lobby.guest ? 'Waiting for a classmate to join with your code…' : (lobby.guestReady ? 'Your opponent is ready. Start when you are!' : 'Your opponent joined. Waiting for them to be ready…');
      actions.push(
        el('button', { type: 'button', class: 'vs-btn vs-btn-ghost', text: 'Cancel lobby', onclick: () => leaveRoom('cancel') }),
        el('button', { type: 'button', class: 'vs-btn vs-btn-primary', text: 'Start Match', disabled: !(lobby.guest && lobby.guestReady), onclick: startMatch })
      );
    } else {
      status = lobby.guestReady ? 'You are ready. Waiting for the host to start…' : 'Press Ready when you are set. The host starts the match.';
      actions.push(
        el('button', { type: 'button', class: 'vs-btn vs-btn-ghost', text: 'Leave', onclick: () => leaveRoom('leave') }),
        el('button', { type: 'button', class: `vs-btn ${lobby.guestReady ? 'vs-btn-ghost' : 'vs-btn-primary'}`, text: lobby.guestReady ? 'Not ready' : 'Ready', onclick: () => setReady(!lobby.guestReady) })
      );
    }
    $('vsRoomStatus').textContent = status;
    $('vsRoomActions').replaceChildren(...actions);
  }

  function roomError(problem) {
    const note = $('vsRoomError');
    note.textContent = problem ? problem.message : '';
    note.hidden = !problem;
  }
  async function setReady(ready) {
    try { await api({ action: 'ready', ready }); roomError(null); poll(true); } catch (problem) { roomError(problem); }
  }
  async function startMatch() {
    try { await api({ action: 'start' }); roomError(null); poll(true); } catch (problem) { roomError(problem); }
  }
  async function leaveRoom(action) {
    try { await api({ action }); } catch (problem) { /* gone already */ }
    window.location.href = 'versus.php';
  }
  $('vsRoomLeave').addEventListener('click', (event) => {
    if (!lobby || !['waiting', 'ready'].includes(lobby.status)) return;
    event.preventDefault();
    leaveRoom(side() === 'host' ? 'cancel' : 'leave');
  });
  $('vsCopy').addEventListener('click', async () => {
    const label = $('vsCopy').querySelector('span');
    try {
      await navigator.clipboard.writeText(lobby.code);
    } catch (error) {
      const field = el('textarea', {}, []);
      field.value = lobby.code;
      document.body.append(field);
      field.select();
      try { document.execCommand('copy'); } catch (problem) { /* shown below */ }
      field.remove();
    }
    label.textContent = 'Copied!';
    window.setTimeout(() => { label.textContent = 'Copy code'; }, 1600);
  });

  // ===================================================================================================
  // The match
  // ===================================================================================================
  const canvas = $('vsCanvas');
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let backdrop = null;

  // The canvas fills the space it has at 16:9 (never stretched), sharp on
  // fine screens but no sharper than slower tablets can draw.
  // The game fills the whole screen. The arena itself (1120 x 630, fixed
  // camera) is drawn as large as fits under the score bar - and, on a phone
  // held upright, above the touch buttons - standing on the screen's bottom;
  // the sky and the ground carry on to the screen's edges around it.
  // fit: the arena's scale and its offset on the screen (CSS pixels).
  const fit = { s: 1, ox: 0, oy: 0, dpr: 1, w: 0, h: 0 };
  function fitStage() {
    const box = $('vsStageWrap').getBoundingClientRect();
    const w = Math.max(200, box.width);
    const h = Math.max(150, box.height);
    const hud = document.querySelector('.vs-hud').getBoundingClientRect().height;
    const upright = h > w;
    const below = touch && upright ? 150 : 0;
    const room = h - hud - below - 6;
    // Held sideways with touch buttons: the arena keeps clear of the move
    // buttons (left) and Jump (right) only when that costs little size - the
    // characters staying large matters more; otherwise the buttons sit over
    // the arena's far corners (the players start further in).
    let edge = 0;
    if (touch && !upright) {
      const move = document.querySelector('.vs-pad.is-move').getBoundingClientRect();
      const jump = document.querySelector('.vs-key.is-jump').getBoundingClientRect();
      edge = Math.max(move.width ? move.right - box.left + 10 : 0, jump.width ? box.right - jump.left + 10 : 0);
    }
    const largest = Math.min(w / W, room / H);
    const clear = Math.min((w - 2 * edge) / W, room / H);
    const s = Math.max(0.1, clear >= largest * 0.92 ? clear : largest);
    Object.assign(fit, {
      s, w, h,
      ox: (w - W * s) / 2,
      oy: upright ? hud + (room - H * s) / 2 + 3 : h - H * s,
      dpr: Math.min(window.devicePixelRatio || 1, lite() ? 1 : 1.5)
    });
    canvas.width = Math.round(w * fit.dpr);
    canvas.height = Math.round(h * fit.dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    scale = fit.dpr * s;
    backdrop = null;
    // Notices at the top of the arena sit just under the score bar.
    $('vsStage').style.setProperty('--vs-hud-h', `${Math.round(hud)}px`);
    $('vsRotate').hidden = !(touch && upright && w < 760);
    $('vsRotate').style.top = `${Math.round(hud) + 8}px`;
  }
  // A point of the arena on the screen (CSS pixels from the stage's corner).
  const toScreen = (x, y) => ({ x: fit.ox + x * fit.s, y: fit.oy + y * fit.s });
  window.addEventListener('resize', () => { if (view === 'game') fitStage(); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if (view === 'game') fitStage(); });

  function roundRect(context, x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  // The arena behind everything, drawn once (and again only when resized):
  // an evening sky, far hills, the main stage and the floating platforms.
  function drawBackdrop() {
    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    const c = off.getContext('2d');
    c.setTransform(scale, 0, 0, scale, fit.ox * fit.dpr, fit.oy * fit.dpr);
    // The whole screen in arena units (the scenery reaches past the arena).
    const x0 = -fit.ox / fit.s;
    const x1 = (fit.w - fit.ox) / fit.s;
    const y0 = -fit.oy / fit.s;
    const y1 = (fit.h - fit.oy) / fit.s;
    const sky = c.createLinearGradient(0, y0, 0, arena.ground);
    sky.addColorStop(0, '#161d45');
    sky.addColorStop(0.55, '#3b3f8a');
    sky.addColorStop(1, '#6b5ca8');
    c.fillStyle = sky;
    c.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Stars.
    c.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 110; i += 1) {
      const x = x0 + ((i * 233) % Math.max(1, Math.round(x1 - x0)));
      const y = y0 + ((i * 97) % Math.max(1, Math.round(arena.ground * 0.55 - y0)));
      c.fillRect(x, y, i % 3 === 0 ? 3 : 2, i % 3 === 0 ? 3 : 2);
    }
    // Far hills in two shades, for depth.
    const hills = (color, base, amp, step, shift) => {
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(x0, y1);
      for (let x = x0; x <= x1 + step; x += step) c.lineTo(x, base - Math.abs(Math.sin((x + shift) / 200)) * amp);
      c.lineTo(x1, y1);
      c.closePath();
      c.fill();
    };
    hills('#2c2f6e', arena.ground - 110, 130, 30, 0);
    hills('#24285c', arena.ground - 55, 90, 30, 130);
    // The main stage: the ground, with a lit edge along its top, all the way
    // across the screen.
    const ground = c.createLinearGradient(0, arena.ground, 0, Math.max(H, y1));
    ground.addColorStop(0, '#3e8c6c');
    ground.addColorStop(0.12, '#2f6e57');
    ground.addColorStop(1, '#1d3f3a');
    c.fillStyle = ground;
    c.fillRect(x0, arena.ground, x1 - x0, y1 - arena.ground);
    c.fillStyle = '#7fd6a8';
    c.fillRect(x0, arena.ground, x1 - x0, 6);
    // Floating platforms: a stone body under a grassy top edge.
    arena.platforms.forEach((p) => {
      c.fillStyle = 'rgba(10,14,40,.28)';
      roundRect(c, p.x + 6, p.y + 10, p.w, 26, 12);
      c.fill();
      const body = c.createLinearGradient(0, p.y, 0, p.y + 26);
      body.addColorStop(0, '#5a63a8');
      body.addColorStop(1, '#3a3f7a');
      c.fillStyle = body;
      roundRect(c, p.x, p.y, p.w, 26, 12);
      c.fill();
      c.fillStyle = '#8fe0b5';
      roundRect(c, p.x, p.y, p.w, 7, 4);
      c.fill();
    });
    backdrop = off;
  }

  // --- Characters ----------------------------------------------------------------------------------
  function loadPlayer(sideName, info) {
    if (!info) return;
    if (players[sideName] && players[sideName].info.id === info.id) return;
    const record = { info, image: null, sheet: null, anim: Anim.create() };
    const image = new Image();
    image.onload = () => { record.image = image; };
    image.src = info.asset;
    if (info.sheet) {
      const sheet = new Image();
      sheet.onload = () => { record.sheet = sheet; };
      sheet.src = info.sheet;
    }
    players[sideName] = record;
  }

  // Draws a character standing at (x, feet y) in its pose. The frame, squash
  // and stretch come from js/character-animation.js (shared with Platform
  // Mode stories): the sprite sheet's frames for characters that have one;
  // otherwise the picture with a bounce and sway while running.
  function drawCharacter(record, pose, now, outline) {
    if (!record) return;
    const h = P.ph * 1.15;
    // Sheet frames keep their 32x46 shape; pictures get a little more room.
    const w = record.sheet ? h * Anim.FRAME_W / Anim.FRAME_H : P.pw * 1.25;
    const look = Anim.update(record.anim, { ...pose.motion, picture: !record.sheet }, now);
    if (record === players[side()] && lobby && lobby.status === 'playing') moveSounds(look);
    ctx.save();
    ctx.translate(pose.x, pose.y);
    // A soft shadow on the ground under the character.
    ctx.fillStyle = 'rgba(10,14,40,.25)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(0, -look.bob * h);
    ctx.rotate(look.tilt);
    ctx.scale((pose.f < 0 ? -1 : 1) * look.sx, look.sy);
    if (record.sheet) {
      // The jump row's poses sit higher in their cells: drawn lower to match.
      const drop = look.lift * h / Anim.FRAME_H;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(record.sheet, look.column * Anim.FRAME_W, look.row * Anim.FRAME_H, Anim.FRAME_W, Anim.FRAME_H, -w / 2, -h + drop, w, h);
      ctx.imageSmoothingEnabled = true;
    } else if (record.image) {
      const ratio = record.image.naturalWidth / Math.max(1, record.image.naturalHeight);
      const dh = h;
      const dw = Math.min(w * 1.4, dh * ratio);
      ctx.drawImage(record.image, -dw / 2, -dh, dw, dh);
    } else {
      ctx.fillStyle = record.info.bottom || '#d3f5e6';
      roundRect(ctx, -w / 2, -h, w, h, 14);
      ctx.fill();
    }
    ctx.restore();
    // The player's name above them (the opponent's in their colour).
    ctx.font = '800 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const label = record.info.name;
    const tw = ctx.measureText(label).width + 20;
    ctx.fillStyle = outline;
    roundRect(ctx, pose.x - tw / 2, pose.y - h - 40, tw, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, pose.x, pose.y - h - 20);
  }

  // --- The player's own movement --------------------------------------------------------------------
  const me = { x: 0, y: arena.ground, vx: 0, vy: 0, grounded: true, f: 1, coyote: 0, buffer: 0 };
  const keys = { left: false, right: false, jump: false };
  const touchKeys = { left: false, right: false, jump: false };
  let jumpPressed = false;

  function resetToStart() {
    const start = arena.starts[side()];
    Object.assign(me, { x: start.x, y: start.y, vx: 0, vy: 0, grounded: true, f: side() === 'host' ? 1 : -1, coyote: 0, buffer: 0 });
    samples = [];
  }

  // Can this player move right now? Not before the round starts, not while
  // answering, not after the round is over.
  function frozen() {
    if (!round || !lobby || lobby.status !== 'playing') return true;
    if (serverNow() < round.startMs || round.winner) return true;
    if (round.mine.done) return true;
    return false;
  }

  function step(dt) {
    const dir = frozen() ? 0 : ((keys.right || touchKeys.right) ? 1 : 0) - ((keys.left || touchKeys.left) ? 1 : 0);
    const target = dir * P.run;
    const accel = me.grounded ? 4200 : 2600;
    if (me.vx < target) me.vx = Math.min(target, me.vx + accel * dt);
    else if (me.vx > target) me.vx = Math.max(target, me.vx - accel * dt);
    if (dir !== 0) me.f = dir;
    // Jump, with a little grace off a ledge and for an early press.
    me.coyote = me.grounded ? 0.09 : Math.max(0, me.coyote - dt);
    me.buffer = Math.max(0, me.buffer - dt);
    if (jumpPressed && !frozen()) { me.buffer = 0.12; jumpPressed = false; }
    if (me.buffer > 0 && me.coyote > 0) {
      me.vy = -P.jump;
      me.grounded = false;
      me.coyote = 0;
      me.buffer = 0;
      sfx('jump');
    }
    me.vy = Math.min(P.fall, me.vy + arena.physics.gravity * dt);
    const wasY = me.y;
    let x = me.x + me.vx * dt;
    let y = me.y + me.vy * dt;
    x = Math.max(P.pw / 2, Math.min(W - P.pw / 2, x));
    // The sky has a ceiling: a jump from the top platform stops with the
    // head just past the arena's top (the server keeps players inside it).
    if (y < P.ph / 2) { y = P.ph / 2; me.vy = Math.max(0, me.vy); }
    let landed = false;
    if (y >= arena.ground) { y = arena.ground; landed = true; }
    if (!landed && me.vy >= 0) {
      for (const p of arena.platforms) {
        if (wasY <= p.y + 0.5 && y >= p.y && x >= p.x - P.pw * 0.3 && x <= p.x + p.w + P.pw * 0.3) { y = p.y; landed = true; break; }
      }
    }
    // Walking off a platform's edge: falling.
    if (landed) {
      me.vy = 0;
      me.grounded = true;
    } else if (me.grounded) {
      const onSomething = y >= arena.ground || arena.platforms.some((p) => Math.abs(y - p.y) < 1 && x >= p.x - P.pw * 0.3 && x <= p.x + p.w + P.pw * 0.3);
      if (!onSomething) me.grounded = false;
    }
    if (!landed && me.grounded && me.vy < 0) me.grounded = false;
    me.x = x;
    me.y = y;
  }

  // motion: what js/character-animation.js needs (rise: share of the jump
  // speed, up positive; speed: share of top running speed).
  function myPose() {
    return { x: me.x, y: me.y, f: me.f, motion: { airborne: !me.grounded, rise: -me.vy / P.jump, speed: Math.abs(me.vx) / P.run } };
  }

  // --- The live relay -------------------------------------------------------------------------------
  // A WebSocket to relay/versus-relay.js: this player's movement goes
  // straight to the other player, and a nudge ("check now") after every
  // letter, answer or forfeit, so hearts, letters and round results show on
  // both screens at once. The game itself still comes from versus_api.php.
  // Without the relay (blocked, or not running) polling carries everything,
  // more often.
  const relay = { ws: null, pass: null, open: false, peer: false, wanted: false, retry: 0, timer: 0, rtt: 0 };
  const relayLive = () => relay.open && relay.peer;
  function relayUrl(pass) {
    const secure = window.location.protocol === 'https:';
    return `${secure ? 'wss' : 'ws'}://${window.location.hostname}:${secure ? pass.tlsPort : pass.port}`;
  }
  function relayConnect() {
    if (!relay.wanted || !relay.pass || relay.ws || !('WebSocket' in window)) return;
    let ws;
    try { ws = new WebSocket(relayUrl(relay.pass)); } catch (problem) { relayRetry(); return; }
    relay.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'hello', token: relay.pass.token }));
      relayPing();
    };
    ws.onmessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch (problem) { return; }
      if (message.t === 'm' && Array.isArray(message.s)) takeStamped(message.at, message.s);
      else if (message.t === 'e') poll(true);
      else if (message.t === 'P') {
        const back = performance.now();
        relay.rtt = back - message.c;
        learnClock(message.c, back, message.at);
      } else if (message.t === 'ok') { relay.open = true; relay.peer = Boolean(message.peer); relay.retry = 0; }
      else if (message.t === 'peer') relay.peer = Boolean(message.on);
      else if (message.t === 'no') relay.pass = null;   // an old pass: the next poll asks for a new one
    };
    ws.onclose = () => {
      if (relay.ws === ws) { relay.ws = null; relay.open = false; relay.peer = false; }
      relayRetry();
    };
    ws.onerror = () => { try { ws.close(); } catch (problem) { /* closed */ } };
  }
  function relayRetry() {
    window.clearTimeout(relay.timer);
    if (!relay.wanted) return;
    const wait = Math.min(8000, 1000 * 2 ** relay.retry);
    relay.retry += 1;
    relay.timer = window.setTimeout(relayConnect, wait);
  }
  function relayStop() {
    relay.wanted = false;
    window.clearTimeout(relay.timer);
    if (relay.ws) { try { relay.ws.close(); } catch (problem) { /* closed */ } }
    relay.ws = null;
    relay.open = false;
    relay.peer = false;
  }
  function relaySend(message) {
    if (!relay.open || !relay.ws || relay.ws.readyState !== 1) return false;
    try { relay.ws.send(JSON.stringify(message)); return true; } catch (problem) { return false; }
  }
  // Pings keep the clock matched to the server's (both run on one machine).
  function relayPing() {
    if (!relay.ws || relay.ws.readyState !== 1) return;
    try { relay.ws.send(JSON.stringify({ t: 'p', c: performance.now() })); } catch (problem) { /* closed */ }
  }
  window.setInterval(() => { if (relay.open && !document.hidden) relayPing(); }, 2000);
  const nudge = () => relaySend({ t: 'e', k: 'state' });
  // For checking the connection: versus_play.php?lobby=..&vsdebug shows the
  // numbers in the console (window.KoobdVersusDebug).
  if (new URLSearchParams(window.location.search).has('vsdebug')) {
    window.KoobdVersusDebug = {
      live: () => relayLive(), open: () => relay.open, rtt: () => Math.round(relay.rtt), delay: () => Math.round(delay), target: () => Math.round(delayTarget),
      shown: () => (them.shown ? { x: them.shown.x, y: them.shown.y } : null), serverNow: () => serverNow(),
      pose: (dt) => opponentPose(performance.now(), dt),
      lags: () => lags.map((item) => Math.round(item.lag)),
      round: () => (round ? { no: round.no, hearts: round.hearts, winner: round.winner } : null),
      poll: () => poll()
    };
  }

  // --- Sending movement, hearing the opponent's -----------------------------------------------------
  // Every 70 ms a sample goes into the trail sent with each poll (the server
  // checks it). With the live relay, each change of movement also goes
  // straight to the other player (every 45 ms while moving; standing still,
  // only a short "still here" every half second).
  let samples = [];
  let lastSample = 0;
  let lastLive = 0;
  let lastLiveKey = '';
  function noteSample(now) {
    const sample = { t: now, x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, f: me.f, m: Math.abs(me.vx) > 40 ? 1 : 0, g: me.grounded ? 1 : 0, vy: Math.round(me.vy) };
    if (now - lastSample >= 70) {
      lastSample = now;
      samples.push(sample);
      if (samples.length > 30) samples = samples.slice(-30);
    }
    if (relay.open && lobby && lobby.status === 'playing' && now - lastLive >= 45) {
      const key = `${sample.x},${sample.y},${sample.f},${sample.m},${sample.g}`;
      if (key !== lastLiveKey || now - lastLive >= 500) {
        lastLive = now;
        lastLiveKey = key;
        // Stamped with the server's clock, so the other screen puts moves in
        // order and knows how late they came, even on a jittery connection.
        relaySend({ t: 'm', s: [[Math.round(serverNow()), sample.x, sample.y, sample.f, sample.m, sample.g, sample.vy]] });
      }
    }
  }

  // The opponent's movement, from the relay or from polling: notes on the
  // server's clock, shown a little in the past (delay) so there is always a
  // note before and after to move smoothly between. The delay follows how
  // late the notes arrive (most of them, not the rare slowest one), so it
  // stays short on a good connection and grows only as much as needed.
  const them = { notes: [], lastAt: 0, shown: null, speed: 0 };
  const lags = [];
  let delay = 250;
  let delayTarget = 250;
  // From polling: [ageMs, ...] (age when the server stored it). From the
  // relay: [stamp, ...] on the server's clock (kept within reason of when it
  // reached the relay). A move older than the newest one is dropped.
  function takeStamped(at, list) {
    takeSamples(at, list.map((s) => [at - Math.max(at - 3000, Math.min(at + 100, Number(s[0]) || at)), ...s.slice(1)]));
  }
  function takeSamples(at, trail) {
    let added = false;
    trail.forEach((s) => {
      const newest = them.notes.length ? them.notes[them.notes.length - 1].t : -Infinity;
      const note = { t: at - s[0], x: s[1], y: s[2], f: s[3], m: s[4], g: s[5], vy: s[6] };
      if (note.t > newest + 1) { them.notes.push(note); added = true; }
    });
    if (!added) return;
    const now = performance.now();
    lags.push({ lag: serverNow() - them.notes[them.notes.length - 1].t, at: now });
    while (lags.length && now - lags[0].at > 3000) lags.shift();
    const sorted = lags.map((item) => item.lag).sort((a, b) => a - b);
    // Most notes (80 in 100): a short stall (a slow phone, a busy tab) that
    // makes a few arrive late does not slow the opponent down for long.
    const typical = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.8))] || 0;
    // Room for the gap between notes, plus a little for jitter.
    const gap = relayLive() ? 45 : 250;
    delayTarget = Math.max(relayLive() ? 70 : 140, Math.min(1000, typical + gap * 0.5 + 25));
    while (them.notes.length > 3 && them.notes[1].t < serverNow() - 3000) them.notes.shift();
  }
  function takeOpponent(info) {
    opponentInfo = info;
    if (!info || !info.at || info.at <= them.lastAt) return;
    them.lastAt = info.at;
    // While the relay brings their movement, polling only fills gaps.
    takeSamples(info.at, Array.isArray(info.trail) && info.trail.length ? info.trail : [[0, info.x, info.y, 1, 0, 1, 0]]);
  }
  function opponentPose(now, dt) {
    // Grows fast when notes come late; shrinks gently, so nothing jumps.
    if (delay < delayTarget) delay = Math.min(delayTarget, delay + dt * 0.5);
    else delay = Math.max(delayTarget, delay - dt * 0.2);
    const time = serverNow() - delay;
    const notes = them.notes;
    if (!notes.length) return null;
    let pose;
    if (time <= notes[0].t) pose = { ...notes[0] };
    else if (time >= notes[notes.length - 1].t) {
      const last = notes[notes.length - 1];
      const before = notes[notes.length - 2];
      pose = { ...last };
      const ahead = Math.min(200, time - last.t) / 1000;
      if (before && last.m && last.t > before.t) pose.x = Math.max(0, Math.min(W, pose.x + ((last.x - before.x) / ((last.t - before.t) / 1000)) * ahead));
      // In the air: carry on along the jump for that short moment.
      if (!last.g && ahead > 0) {
        const short = Math.min(ahead, 0.15);
        pose.y = Math.min(arena.ground, last.y + (Number(last.vy) || 0) * short + 0.5 * P.gravity * short * short);
        pose.vy = Math.min(P.fall, (Number(last.vy) || 0) + P.gravity * short);
      }
      if (time - last.t > 600) pose.m = 0;
    } else {
      for (let i = notes.length - 1; i >= 1; i -= 1) {
        const a = notes[i - 1];
        const b = notes[i];
        if (time < a.t || time > b.t) continue;
        const k = (time - a.t) / Math.max(1, b.t - a.t);
        pose = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, f: k < 0.5 ? a.f : b.f, m: a.m, g: k < 0.5 ? a.g : b.g, vy: a.vy + (b.vy - a.vy) * k };
        break;
      }
      if (!pose) pose = { ...notes[notes.length - 1] };
    }
    // Eases small differences away; a real jump in place shows at once.
    const wasX = them.shown ? them.shown.x : pose.x;
    if (!them.shown || Math.abs(pose.x - them.shown.x) > 160 || Math.abs(pose.y - them.shown.y) > 160) them.shown = { x: pose.x, y: pose.y };
    else {
      const k = 1 - Math.exp(-dt / 28);
      them.shown.x += (pose.x - them.shown.x) * k;
      them.shown.y += (pose.y - them.shown.y) * k;
    }
    // Their stride follows how fast they are seen to move (smoothed).
    const seen = dt > 0 ? Math.abs(them.shown.x - wasX) / (dt / 1000) / P.run : 0;
    them.speed += ((pose.m ? Math.min(1.2, seen) : 0) - them.speed) * Math.min(1, dt / 80);
    return { x: them.shown.x, y: them.shown.y, f: pose.f, motion: { airborne: !pose.g, rise: -(Number(pose.vy) || 0) / P.jump, speed: them.speed } };
  }

  // --- Letters --------------------------------------------------------------------------------------
  function availableLetters() {
    if (!round) return [];
    const taken = new Set(round.mine.collected);
    return round.letters.filter((letter) => !taken.has(letter.id));
  }
  function nearestLetter() {
    if (frozen()) return null;
    const cx = me.x;
    const cy = me.y - P.ph / 2;
    let best = null;
    let bestD = Infinity;
    availableLetters().forEach((letter) => {
      const d = Math.hypot(letter.x - cx, letter.y - cy);
      if (d <= P.reach && d < bestD) { best = letter; bestD = d; }
    });
    return best;
  }

  let collecting = false;
  async function collect() {
    const letter = nearestLetter();
    if (!letter || collecting || !round) return;
    collecting = true;
    if (players[side()]) Anim.grab(players[side()].anim);
    try {
      const result = await api({ action: 'collect', round: round.id, letter: letter.id, x: me.x, y: me.y, event: eventId() });
      if (result.repeat) return;
      nudge();   // the other screen checks at once (hearts, round result)
      if (!result.correct) {
        if (Array.isArray(result.tried)) round.mine.tried = result.tried;
        if (result.again) {
          // Tried before for this slot: no heart lost.
          toast(result.message || 'You already tried that letter.', 'info');
          return;
        }
        if (typeof result.hearts === 'number') round.hearts[side()] = result.hearts;
        toast(result.message || 'Wrong letter! You lost a heart.', 'warn');
        sfx('error');
        shakeWord();
        hurt();
        renderHud();
        if (result.out) poll(true);
        return;
      }
      round.mine.collected.push(letter.id);
      round.mine.filled[result.index] = result.ch;
      round.mine.next = result.index + 1;
      flyLetter(letter, result.index);
      // Confirmed by the server (a repeat answer returned above): rising
      // notes as the word fills, a flourish when it is complete.
      sfx('letter', { index: result.index });
      if (result.done) window.setTimeout(() => sfx('word'), 260);
      if (result.done) {
        round.mine.done = true;
        round.mine.question = result.question;
        window.setTimeout(() => showQuestion(), 450);
      }
    } catch (problem) {
      toast(problem.message, 'warn');
    } finally {
      collecting = false;
    }
  }

  // The collected letter flies from the arena to its slot at the top.
  function flyLetter(letter, index) {
    const slotNode = $('vsWord').children[index];
    const stageRect = $('vsStage').getBoundingClientRect();
    const point = toScreen(letter.x, letter.y);
    const startX = stageRect.left + point.x;
    const startY = stageRect.top + point.y;
    if (!slotNode || reducedMotion || lite()) { renderWord(); return; }
    const target = slotNode.getBoundingClientRect();
    const flyer = el('span', { class: 'vs-flyer', text: letter.ch });
    flyer.style.left = `${startX}px`;
    flyer.style.top = `${startY}px`;
    document.body.append(flyer);
    requestAnimationFrame(() => {
      flyer.style.transform = `translate(${target.left + target.width / 2 - startX}px, ${target.top + target.height / 2 - startY}px) scale(.7)`;
      flyer.style.opacity = '0.4';
    });
    window.setTimeout(() => { flyer.remove(); renderWord(true, index); }, 480);
  }

  // The player's own footsteps (on each footfall of the walk) and landings,
  // from the animation they see: grass on the ground, stone on platforms.
  let stepState = 'idle';
  let stepColumn = -1;
  let airSince = 0;
  function moveSounds(look) {
    const surface = me.y >= arena.ground - 1 ? 'grass' : 'stone';
    if (look.state === 'run' && (look.column === 1 || look.column === 4) && look.column !== stepColumn) sfx('step', { surface, volume: 0.8 });
    stepColumn = look.state === 'run' ? look.column : -1;
    if ((look.state === 'rise' || look.state === 'fall') && !airSince) airSince = performance.now();
    if (look.state === 'land' && stepState !== 'land') sfx('land', { surface, strength: Math.min(1, 0.35 + (performance.now() - (airSince || performance.now())) / 900) });
    if (look.state !== 'rise' && look.state !== 'fall') airSince = 0;
    stepState = look.state;
  }

  // --- The bar on top ---------------------------------------------------------------------------------
  // Hearts: full ones, then empty ones; a heart just lost breaks.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function heartIcon(cls) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', `vs-heart${cls}`);
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M12 20.5s-7.5-4.6-9.3-9.4C1.5 7.8 3.6 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.4 0 5.5 3.3 4.3 6.6-1.8 4.8-9.3 9.4-9.3 9.4z');
    svg.append(path);
    return svg;
  }
  function heartsRow(left, max, breaking) {
    const icons = [];
    for (let i = 0; i < max; i += 1) icons.push(heartIcon(i < left ? ' is-full' : (breaking && i === left ? ' is-breaking' : ' is-empty')));
    return el('div', { class: `vs-hearts${left <= 1 ? ' is-low' : ''}`, role: 'img', 'aria-label': `${left} of ${max} hearts left` }, icons);
  }
  const LEVELS = { mixed: 'Mixed', easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  function hudPlayer(record, isMe, hearts, breaking) {
    if (!record) return [];
    const info = record.info;
    return [
      el('span', { class: 'vs-avatar', style: `--a:${info.top};--b:${info.bottom}` }, [el('img', { src: info.asset, alt: '' })]),
      el('span', { class: 'vs-hud-name' }, [
        el('strong', { translate: 'no', text: info.name }),
        el('span', { text: isMe ? 'You' : (opponentInfo && opponentInfo.connected === false ? 'Reconnecting…' : 'Opponent') }),
        hearts ? heartsRow(hearts.left, hearts.max, breaking) : null
      ].filter(Boolean))
    ];
  }
  const hudDrawn = { me: '', them: '' };
  const heartsSeen = { round: 0, me: null, them: null };
  function renderHudSide(node, key, record, isMe, sideName) {
    const max = round ? round.maxHearts || 3 : 3;
    const left = round && round.hearts ? round.hearts[sideName] : max;
    if (!round || heartsSeen.round !== round.id) { heartsSeen.round = round ? round.id : 0; heartsSeen.me = null; heartsSeen.them = null; }
    const breaking = heartsSeen[key] !== null && left < heartsSeen[key] && !lite() && !reducedMotion;
    heartsSeen[key] = left;
    const signature = JSON.stringify([record && record.info.name, isMe || (opponentInfo && opponentInfo.connected), left, max]);
    if (signature === hudDrawn[key]) return;
    hudDrawn[key] = signature;
    node.replaceChildren(...hudPlayer(record, isMe, round ? { left, max } : null, breaking));
    if (!isMe && breaking) sfx('toggle');
  }
  function renderHud() {
    renderHudSide($('vsHudMe'), 'me', players[side()], true, side());
    renderHudSide($('vsHudThem'), 'them', players[otherSide()], false, otherSide());
    const clue = $('vsClue');
    const hint = round && round.hint ? round.hint : '';
    if (clue && clue.dataset.hint !== hint) {
      clue.dataset.hint = hint;
      clue.hidden = !hint;
      $('vsClueText').textContent = hint;
      clue.setAttribute('aria-label', `Hint: ${hint}`);
      clue.classList.remove('is-open');
      clue.setAttribute('aria-expanded', 'false');
      // The bar may be taller or shorter now: the arena fits under it.
      requestAnimationFrame(fitStage);
    }
    // Between rounds the hint keeps its place (so the arena does not jump).
    if (clue) clue.classList.toggle('is-blank', Boolean(round && round.winner));
    const mine = lobby.score[side()];
    const theirs = lobby.score[otherSide()];
    $('vsScore').replaceChildren(
      el('span', { class: 'vs-score-num is-me', text: String(mine) }),
      el('span', { class: 'vs-score-mid' }, [el('strong', { text: `Round ${round ? round.no : 1}` }), el('span', { text: round && round.level ? `${LEVELS[round.level]} · First to ${lobby.win}` : `First to ${lobby.win}` })]),
      el('span', { class: 'vs-score-num', text: String(theirs) })
    );
  }
  function renderWord(pop = false, index = -1) {
    if (!round) { $('vsWord').replaceChildren(); return; }
    const slots = [];
    for (let i = 0; i < round.length; i += 1) {
      const ch = round.mine.filled[i] || '';
      slots.push(el('span', { class: `vs-slot-letter${ch ? ' is-filled' : ''}${i === round.mine.next && !round.mine.done ? ' is-next' : ''}${pop && i === index ? ' is-pop' : ''}`, text: ch }));
    }
    $('vsWord').replaceChildren(...slots);
  }
  function hurt() {
    if (lite() || reducedMotion) return;
    const stage = $('vsStage');
    stage.classList.remove('is-hurt');
    void stage.offsetWidth;
    stage.classList.add('is-hurt');
  }
  function shakeWord() {
    const word = $('vsWord');
    word.classList.remove('is-shake');
    void word.offsetWidth;
    word.classList.add('is-shake');
  }
  let toastTimer = 0;
  function toast(text, tone = '') {
    const node = $('vsToast');
    node.textContent = text;
    node.className = `vs-toast${tone ? ` is-${tone}` : ''}`;
    node.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { node.hidden = true; }, 1800);
  }

  // --- The question ---------------------------------------------------------------------------------
  let answering = false;
  let shownToken = '';
  function showQuestion() {
    const q = round && round.mine.question;
    const box = $('vsQuestion');
    if (!q || round.winner) { box.hidden = true; shownToken = ''; return; }
    box.hidden = false;
    if (shownToken === q.token && !round.mine.lockedMs) return;
    shownToken = q.token;
    $('vsQuestionPrompt').textContent = q.prompt;
    const locked = round.mine.lockedMs > 0;
    $('vsQuestionNote').textContent = locked ? 'Not quite. The next question comes in a moment…' : (q.type === 'tf' ? 'True or false?' : 'Choose the right answer.');
    $('vsQuestionChoices').replaceChildren(...q.choices.map((choice, index) => el('button', {
      type: 'button', class: 'vs-answer', disabled: locked, translate: 'no',
      onclick: () => answer(index)
    }, [el('span', { class: 'vs-answer-key', text: q.type === 'tf' ? (index === 0 ? 'T' : 'F') : String.fromCharCode(65 + index) }), el('span', { text: choice })])));
  }
  async function answer(index) {
    if (answering || !round || !round.mine.question) return;
    answering = true;
    const buttons = $('vsQuestionChoices').querySelectorAll('button');
    buttons.forEach((button) => { button.disabled = true; });
    try {
      const result = await api({ action: 'answer', round: round.id, token: round.mine.question.token, choice: index, event: eventId() });
      if (result.repeat) return;
      nudge();   // the other screen checks at once (hearts, round result)
      if (result.correct) {
        $('vsQuestionNote').textContent = result.won ? 'Correct! You win the round!' : 'Correct!';
        buttons[index].classList.add('is-right');
        sfx('correct');
        poll(true);
      } else {
        buttons[index].classList.add('is-wrong');
        sfx('wrong');
        $('vsQuestionNote').textContent = 'Not quite. Here comes another question about the word…';
        round.mine.lockedMs = result.lockedMs;
        window.setTimeout(() => {
          if (!round || round.winner) return;
          round.mine.question = result.question;
          round.mine.lockedMs = 0;
          shownToken = '';
          showQuestion();
        }, result.lockedMs);
      }
    } catch (problem) {
      $('vsQuestionNote').textContent = problem.message;
      buttons.forEach((button) => { button.disabled = false; });
    } finally {
      answering = false;
    }
  }

  // --- Banners: countdown, round won, match over ------------------------------------------------------
  let countdownShown = 0;
  let countdownRound = 0;
  function renderBanner() {
    const banner = $('vsBanner');
    const countdown = $('vsCountdown');
    if (!round || !lobby) { banner.hidden = true; countdown.hidden = true; return; }
    const left = round.startMs - serverNow();
    const counting = left > 0 && !round.winner && lobby.status === 'playing';
    countdown.hidden = !counting;
    if (counting) countdown.firstChild.textContent = left > 3000 ? `Round ${round.no}` : String(Math.ceil(left / 1000));
    // 3, 2, 1: a tick each; then "go" as the round starts (once per round).
    const shown = counting && left <= 3000 ? Math.ceil(left / 1000) : 0;
    if (shown && shown !== countdownShown) sfx('tick');
    if (!counting && countdownShown && countdownRound === round.id && lobby.status === 'playing' && !round.winner) sfx('go');
    countdownShown = shown;
    countdownRound = round.id;
    if (lobby.status === 'finished') {
      const won = lobby.winner === side();
      const forfeit = lobby.result === 'forfeit';
      banner.hidden = false;
      if (banner.dataset.kind !== 'match') {
        banner.dataset.kind = 'match';
        banner.className = `vs-overlay vs-banner is-match ${won ? 'is-win' : 'is-lose'}`;
        banner.replaceChildren(el('div', { class: 'vs-banner-card' }, [
          el('span', { class: 'vs-kicker', text: forfeit ? 'Match over · forfeit' : 'Match over' }),
          el('h2', { text: won ? 'Victory!' : 'Defeat' }),
          el('p', { class: 'vs-banner-score', text: `${lobby.score[side()]} – ${lobby.score[otherSide()]}` }),
          el('p', { text: won ? (forfeit ? 'Your opponent left the match.' : 'You won the match. Great spelling!') : `${players[otherSide()] ? players[otherSide()].info.name : 'Your opponent'} won this time.` }),
          el('div', { class: 'vs-banner-actions' }, [
            el('button', { type: 'button', class: 'vs-btn vs-btn-primary vs-banner-again', onclick: (event) => playAgain(event.currentTarget), text: 'Play again' }),
            el('a', { class: 'vs-btn vs-btn-ghost', href: 'versus.php', text: 'Versus menu' })
          ]),
          el('a', { class: 'vs-banner-link', href: `versus_match.php?id=${lobby.id}`, text: 'View match summary' })
        ]));
        $('vsQuestion').hidden = true;
        // Once per match, even if this page is opened again.
        const playedKey = `koobd.versus.ended.${lobby.id}`;
        let played = false;
        try { played = sessionStorage.getItem(playedKey) === '1'; sessionStorage.setItem(playedKey, '1'); } catch (error) { /* plays */ }
        if (sound && musicNow !== 'none') { musicNow = 'none'; sound.stopMusic(1.2); }
        if (!played) sfx(won ? 'matchWin' : 'matchLose');
      }
      // The other player already asked for a rematch: join it.
      const again = banner.querySelector('.vs-banner-again');
      if (again && lobby.rematch && again.dataset.offer !== '1') {
        again.dataset.offer = '1';
        again.textContent = 'Join the rematch';
        again.insertAdjacentElement('beforebegin', el('p', { class: 'vs-banner-offer', role: 'status', text: 'Your opponent wants a rematch!' }));
      }
      return;
    }
    if (round.winner) {
      banner.hidden = false;
      const key = `round-${round.id}`;
      if (banner.dataset.kind !== key) {
        banner.dataset.kind = key;
        const won = round.winner === side();
        const hearts = round.reason === 'hearts';
        const loserName = players[won ? otherSide() : side()] ? players[won ? otherSide() : side()].info.name : 'Your opponent';
        const winnerName = players[round.winner] ? players[round.winner].info.name : 'Your opponent';
        banner.className = `vs-overlay vs-banner ${won ? 'is-win' : 'is-lose'}${hearts ? ' is-hearts' : ''}`;
        banner.replaceChildren(el('div', { class: 'vs-banner-card' }, [
          el('span', { class: 'vs-kicker', text: hearts ? `Round ${round.no} · Game over` : `Round ${round.no}` }),
          hearts ? el('div', { class: 'vs-banner-hearts' }, [heartIcon(' is-empty'), heartIcon(' is-empty'), heartIcon(' is-empty')]) : null,
          el('h2', { text: won ? 'You win the round!' : (hearts ? 'Out of hearts!' : `${winnerName} wins the round`) }),
          hearts ? el('p', { text: won ? `${loserName} ran out of hearts.` : `${winnerName} wins the round.` }) : null,
          el('p', {}, ['The word was ', el('strong', { translate: 'no', text: round.word || '' })]),
          el('p', { class: 'vs-banner-score', text: `${lobby.score[side()]} – ${lobby.score[otherSide()]}` }),
          el('p', { class: 'vs-banner-next', role: 'status' }),
          el('div', { class: 'vs-banner-actions' }, [
            el('button', { type: 'button', class: 'vs-btn vs-btn-ghost', onclick: () => leaveMatch(), text: 'Versus menu' })
          ])
        ].filter(Boolean)));
        $('vsQuestion').hidden = true;
        sfx(won ? 'roundWin' : 'roundLose');
      }
      // The next round starts by itself after a short break.
      const next = banner.querySelector('.vs-banner-next');
      if (next && round.endedMs) {
        const wait = Math.max(0, Math.ceil((round.endedMs + 4500 - serverNow()) / 1000));
        const text = wait > 0 ? `Next round in ${wait}…` : 'Next round is starting…';
        if (next.textContent !== text) next.textContent = text;
      }
      return;
    }
    banner.hidden = true;
    banner.dataset.kind = '';
  }

  function renderAway() {
    const away = $('vsAway');
    const gone = opponentInfo && opponentInfo.connected === false && lobby.status === 'playing';
    away.hidden = !gone;
    if (gone) {
      const left = Math.max(0, Math.ceil((60000 - opponentInfo.awayMs) / 1000));
      away.textContent = `Your opponent lost connection. Waiting for them to come back… (${left}s)`;
    }
  }

  // --- Drawing a frame -----------------------------------------------------------------------------------
  let lastFrame = 0;
  let acc = 0;
  let prompted = null;
  function frame(now) {
    requestAnimationFrame(frame);
    if (view !== 'game') return;
    if (lite() && now - lastFrame < 30) return;
    const dt = Math.min(100, lastFrame ? now - lastFrame : 16);
    lastFrame = now;
    acc += dt / 1000;
    while (acc >= 1 / 120) { step(1 / 120); acc -= 1 / 120; }
    noteSample(now);

    if (!backdrop) drawBackdrop();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(backdrop, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, fit.ox * fit.dpr, fit.oy * fit.dpr);

    // Letters this player can still collect.
    const near = nearestLetter();
    const bob = reducedMotion ? 0 : Math.sin(now / 380);
    const tried = new Set(round && round.mine.tried ? round.mine.tried : []);
    availableLetters().forEach((letter, index) => {
      const y = letter.y + (lite() ? 0 : Math.sin(now / 380 + index) * 3);
      const isNear = near && near.id === letter.id;
      const wasTried = tried.has(`${round.mine.next}:${letter.ch}`);
      ctx.globalAlpha = wasTried ? 0.45 : 1;
      ctx.fillStyle = 'rgba(10,14,40,.3)';
      roundRect(ctx, letter.x - 26, y - 22, 52, 52, 12);
      ctx.fill();
      ctx.fillStyle = isNear ? '#ffd166' : '#ffffff';
      roundRect(ctx, letter.x - 28, y - 28, 56, 56, 12);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = isNear ? '#f0a500' : '#c9d2f0';
      ctx.stroke();
      ctx.fillStyle = '#1b2350';
      ctx.font = '900 34px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter.ch, letter.x, y + 2);
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = 1;
    });
    void bob;

    // The opponent, then this player (in front).
    const opp = opponentPose(now, dt);
    if (opp && lobby && lobby.status === 'playing') drawCharacter(players[otherSide()], opp, now, '#e0475f');
    drawCharacter(players[side()], myPose(now), now, '#4f63d6');

    // Near a letter: the Collect button shows it (touch), or a "Press E"
    // tag floats over it (keyboard).
    const collectButton = document.querySelector('.vs-key.is-collect');
    if (near !== prompted) {
      prompted = near;
      collectButton.hidden = !near;
      if (near) {
        const triedNear = round && (round.mine.tried || []).includes(`${round.mine.next}:${near.ch}`);
        collectButton.classList.toggle('is-tried', Boolean(triedNear));
        collectButton.replaceChildren(el('span', { class: 'vs-collect-letter', translate: 'no', text: near.ch }), el('span', { class: 'vs-collect-label', text: triedNear ? 'Tried' : 'Collect' }));
        collectButton.setAttribute('aria-label', triedNear ? `You already tried ${near.ch}` : `Collect the letter ${near.ch}`);
      }
      const prompt = $('vsPrompt');
      prompt.hidden = !near || touch;
      if (near) prompt.textContent = 'Press E';
    }
    if (near && !touch) {
      const prompt = $('vsPrompt');
      const point = toScreen(near.x, near.y - 46);
      prompt.style.left = `${point.x}px`;
      prompt.style.top = `${point.y}px`;
    }
    renderBanner();
  }

  // --- Polling --------------------------------------------------------------------------------------------
  async function poll(force = false) {
    if (polling) return;
    const now = performance.now();
    const playing = view === 'game' && lobby && lobby.status === 'playing';
    const every = playing ? (relayLive() ? 400 : 160) : 1000;
    if (!force && now - lastPoll < every) return;
    polling = true;
    lastPoll = now;
    const sending = view === 'game' ? samples : [];
    samples = [];
    const sentAt = performance.now();
    try {
      const result = await api({ action: 'state', wantRelay: !relay.pass, trail: sending.map((s) => [Math.round(sentAt - s.t), s.x, s.y, s.f, s.m, s.g, s.vy]) });
      learnClock(sentAt, performance.now(), result.now);
      apply(result);
    } catch (problem) {
      if (problem.status === 404) { window.location.href = 'versus.php'; return; }
      samples = sending.concat(samples).slice(-30);
    } finally {
      polling = false;
    }
  }

  function apply(result) {
    lobby = result.lobby;
    // The live relay: joined while the match runs, left when it ends.
    if (result.relay && !relay.pass) { relay.pass = result.relay; relay.wanted = true; relayConnect(); }
    if (lobby.status !== 'playing' && relay.wanted) relayStop();
    loadPlayer('host', lobby.host);
    loadPlayer('guest', lobby.guest);
    if (['waiting', 'ready', 'cancelled', 'expired'].includes(lobby.status)) {
      view = 'room';
      renderRoom();
      return;
    }
    if (view !== 'game') {
      view = 'game';
      $('vsRoom').hidden = true;
      $('vsGame').hidden = false;
      // The match: the page no longer scrolls, and a full-screen phone turns sideways.
      document.body.classList.add('vs-in-game');
      if (window.KoobdVersusFullscreen) window.KoobdVersusFullscreen.lockSideways();
      $('vsControls').classList.toggle('is-touch', touch);
      if (lobby.status === 'playing') musicFor('versus');
      fitStage();
      requestAnimationFrame(fitStage);
    }
    const fresh = result.round;
    if (fresh && fresh.id !== roundId) {
      // A new round: back to the start, empty slots, no question.
      roundId = fresh.id;
      resetToStart();
      them.notes = [];
      them.shown = null;
      shownToken = '';
      $('vsQuestion').hidden = true;
    }
    if (fresh) {
      // Keeps what this page already knows about letters it just collected.
      if (round && round.id === fresh.id && answering) fresh.mine.question = round.mine.question;
      round = fresh;
    }
    if (result.correction) {
      me.x = result.correction.x;
      me.y = result.correction.y;
      me.vx = 0;
      me.vy = 0;
    }
    takeOpponent(result.opponent);
    renderHud();
    renderWord();
    renderAway();
    if (round && round.mine.question && !round.winner && !answering) showQuestion();
    else if (round && (!round.mine.question || round.winner)) $('vsQuestion').hidden = true;
  }

  // --- Controls -------------------------------------------------------------------------------------------
  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump', ArrowUp: 'jump', KeyW: 'jump' };
  window.addEventListener('keydown', (event) => {
    if (view !== 'game' || leaveOpen()) return;
    if (event.target.closest && event.target.closest('button, input, textarea') && event.code === 'Space') return;
    if (!$('vsQuestion').hidden) {
      // Answer keys: A-D or 1-4 (T/F for true or false).
      const q = round && round.mine.question;
      if (!q) return;
      const map = q.type === 'tf' ? { KeyT: 0, KeyF: 1, Digit1: 0, Digit2: 1 } : { KeyA: 0, KeyB: 1, KeyC: 2, KeyD: 3, Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };
      if (event.code in map && !round.mine.lockedMs) { event.preventDefault(); answer(map[event.code]); }
      return;
    }
    const key = KEYMAP[event.code];
    if (key) {
      event.preventDefault();
      if (key === 'jump' && !keys.jump) jumpPressed = true;
      keys[key] = true;
    } else if (event.code === 'KeyE' || event.code === 'Enter' || event.code === 'KeyJ') {
      event.preventDefault();
      collect();
    }
  });
  window.addEventListener('keyup', (event) => {
    const key = KEYMAP[event.code];
    if (key) keys[key] = false;
  });
  window.addEventListener('blur', () => { keys.left = keys.right = keys.jump = false; touchKeys.left = touchKeys.right = touchKeys.jump = false; });

  // Touch buttons: held while pressed (several at once: run and jump).
  document.querySelectorAll('.vs-key').forEach((button) => {
    const name = button.dataset.key;
    const down = (event) => {
      event.preventDefault();
      if (name === 'collect') { collect(); return; }
      if (name === 'jump' && !touchKeys.jump) jumpPressed = true;
      touchKeys[name] = true;
      button.classList.add('is-down');
      if (button.setPointerCapture && event.pointerId !== undefined) { try { button.setPointerCapture(event.pointerId); } catch (error) { /* fine */ } }
    };
    const up = (event) => {
      if (name === 'collect') return;
      event.preventDefault();
      touchKeys[name] = false;
      button.classList.remove('is-down');
    };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });

  // Move: a pill with a knob in the middle. Press anywhere on it and slide -
  // the knob follows the finger along the pill, and past a small gap either
  // side of the middle the character runs that way (pressing near an arrow
  // runs straight away). Letting go puts the knob back in the middle. It
  // keeps its own finger, so Jump can be pressed at the same time.
  const swipe = $('vsSwipe');
  if (swipe) {
    const knob = swipe.querySelector('.vs-swipe-knob');
    let finger = null;
    let travel = 0;
    const setDirection = (dir) => {
      touchKeys.left = dir < 0;
      touchKeys.right = dir > 0;
      swipe.classList.toggle('is-left', dir < 0);
      swipe.classList.toggle('is-right', dir > 0);
      swipe.setAttribute('aria-valuenow', String(dir));
      swipe.setAttribute('aria-valuetext', dir < 0 ? 'Moving left' : dir > 0 ? 'Moving right' : 'Standing still');
    };
    const follow = (event) => {
      const box = swipe.getBoundingClientRect();
      travel = Math.max(1, (box.width - knob.offsetWidth) / 2 - 4);
      const offset = Math.max(-travel, Math.min(travel, event.clientX - (box.left + box.width / 2)));
      swipe.style.setProperty('--knob-x', `${offset.toFixed(1)}px`);
      setDirection(Math.abs(offset) < travel * 0.22 ? 0 : Math.sign(offset));
    };
    const release = (event) => {
      if (finger === null || (event && event.pointerId !== undefined && event.pointerId !== finger)) return;
      finger = null;
      swipe.classList.remove('is-held');
      swipe.style.setProperty('--knob-x', '0px');
      setDirection(0);
    };
    swipe.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (finger !== null) return;
      finger = event.pointerId;
      swipe.classList.add('is-held');
      if (swipe.setPointerCapture) { try { swipe.setPointerCapture(finger); } catch (error) { /* fine */ } }
      follow(event);
    });
    swipe.addEventListener('pointermove', (event) => {
      if (event.pointerId === finger) follow(event);
    });
    swipe.addEventListener('pointerup', release);
    swipe.addEventListener('pointercancel', release);
    swipe.addEventListener('lostpointercapture', release);
    swipe.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('blur', () => release());
  }

  // Leaving a match in progress: the game's own dialog asks first (Keep
  // playing / Leave match; Esc or a tap outside keeps playing). Browsers
  // without <dialog> fall back to their own question.
  const leaveDialog = $('vsLeaveDialog');
  const leaveOpen = () => Boolean(leaveDialog && leaveDialog.open);
  function askToLeave() {
    if (!leaveDialog || typeof leaveDialog.showModal !== 'function') {
      return Promise.resolve(window.confirm('Leave the match? Your opponent wins by forfeit.'));
    }
    keys.left = keys.right = keys.jump = false;
    touchKeys.left = touchKeys.right = touchKeys.jump = false;
    leaveDialog.returnValue = '';
    leaveDialog.showModal();
    return new Promise((resolve) => {
      leaveDialog.addEventListener('close', () => resolve(leaveDialog.returnValue === 'leave'), { once: true });
    });
  }
  if (leaveDialog) {
    leaveDialog.addEventListener('click', (event) => { if (event.target === leaveDialog) leaveDialog.close('stay'); });
  }
  async function leaveMatch() {
    if (lobby && lobby.status === 'playing') {
      if (!(await askToLeave())) return;
      try { await api({ action: 'forfeit' }); nudge(); } catch (problem) { /* gone */ }
      window.location.href = `versus_match.php?id=${config.lobby}`;
      return;
    }
    window.location.href = lobby && lobby.status === 'finished' ? `versus_match.php?id=${config.lobby}` : 'versus.php';
  }
  $('vsLeave').addEventListener('click', leaveMatch);
  // Play again: a rematch lobby with the same settings (the other player is
  // offered it on their screen too).
  async function playAgain(button) {
    button.disabled = true;
    try {
      const result = await api({ action: 'rematch' });
      if (result.join) await api({ action: 'join', code: result.join });
      window.location.href = `versus_play.php?lobby=${result.lobby}`;
    } catch (problem) {
      toast(problem.message, 'warn');
      button.disabled = false;
    }
  }
  // The hint: one line; a tap shows all of it.
  const clueNode = $('vsClue');
  if (clueNode) {
    clueNode.addEventListener('click', () => {
      const open = !clueNode.classList.contains('is-open');
      clueNode.classList.toggle('is-open', open);
      clueNode.setAttribute('aria-expanded', String(open));
      requestAnimationFrame(fitStage);
      // Space jumps again straight away (it would press the hint instead).
      if (!touch) clueNode.blur();
    });
  }

  // --- Running ---------------------------------------------------------------------------------------------
  window.setInterval(() => { if (!document.hidden) poll(); }, 100);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(true); });
  requestAnimationFrame(frame);
  poll(true);
})();
