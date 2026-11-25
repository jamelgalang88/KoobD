// How a character moves on screen - one implementation for Versus Mode
// (js/versus-game.js, drawn on a canvas) and Platform Mode stories
// (js/platformer-story-player.js, drawn as page elements).
//
// Every reader and story character's pixel sheet has the same layout: 32x46
// frames, row 0 a 4-frame idle loop, row 1 a 6-frame walk, row 2 the jump
// (take-off, rise, rise, top, fall, land). A character's state each frame
// picks the frame, and a gentle squash and stretch (feet planted) follows
// it: stretched rising, squashed landing or collecting, a small bounce in the
// stride. Characters without a sheet (a still picture) get the same squash,
// stretch and bounce, and a little sway when walking.
//
//   const anim = KoobdCharacterAnimation.create();
//   const look = KoobdCharacterAnimation.update(anim, {
//     airborne, rise, speed, paused, still, talking, hurt
//   }, performance.now());
//   // look: { state, row, column, lift, sx, sy, bob, tilt }
//
// rise: vertical speed as a share of the character's jump speed, up positive
// (1 = just jumped, 0 = the top, negative = falling). speed: running speed as
// a share of top speed (0..1), so the stride matches how fast they go.
// KoobdCharacterAnimation.grab(anim) shows the collect / interact pose.
(function () {
  const FRAME_W = 32;
  const FRAME_H = 46;
  const IDLE_FRAMES = 4;
  const WALK_FRAMES = 6;
  const IDLE_FRAME_MS = 220;
  const TALK_FRAME_MS = 160;
  const STRIDE_FRAME_S = 0.085;   // one walk frame per this much full-speed running
  const LAND_MS = 140;            // the landing pose, after a real jump or fall
  const AIR_BEFORE_LAND_MS = 150; // shorter hops (a step down) land without it
  const GRAB_MS = 220;
  // The jump row draws its poses higher inside the cell (in sheet pixels):
  // drawing the cell lower by the same amount keeps the feet where they are.
  const JUMP_FRAME_LIFT = [0, 3, 9, 12, 6, 0];
  // [width, height] of each state's squash and stretch.
  const SHAPE = {
    idle: [1, 1], run: [1, 1], rise: [0.94, 1.06], fall: [0.97, 1.03],
    land: [1.12, 0.86], grab: [1.08, 0.94], hurt: [1.1, 0.9], talk: [1, 1], still: [1, 1]
  };
  const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Reduced motion: the frames still play, without squash, stretch or bounce.
  // Low-end mode (html.koobd-lite, e.g. a Galaxy Tab A7 Lite) keeps them -
  // they only change when the character does something - but drops the
  // never-ending idle breathing and talking bounce, which would restyle every
  // character on every frame.
  const calm = () => reducedMotion;
  const lite = () => document.documentElement.classList.contains('koobd-lite');

  function create() {
    return { airSince: 0, landUntil: 0, grabUntil: 0, stride: 0, last: 0, sx: 1, sy: 1, state: 'idle' };
  }
  function grab(anim, now = performance.now()) {
    anim.grabUntil = now + GRAB_MS;
  }

  function update(anim, input, now = performance.now()) {
    const dt = anim.last ? Math.min(0.1, Math.max(0, (now - anim.last) / 1000)) : 0;
    anim.last = now;
    const paused = Boolean(input.paused);
    const rise = Number(input.rise) || 0;
    const speed = Math.max(0, Math.min(1.5, Number(input.speed) || 0));
    // In the air: noted from the first moment; shown once it is a real jump or
    // fall (not the instant a foot slips off a step), then landed.
    const airborne = Boolean(input.airborne) && !paused;
    if (airborne && !anim.airSince) anim.airSince = now;
    if (!airborne && anim.airSince) {
      if (now - anim.airSince > AIR_BEFORE_LAND_MS && !paused) anim.landUntil = now + LAND_MS;
      anim.airSince = 0;
    }
    const showAir = airborne && (now - anim.airSince > 50 || Math.abs(rise) > 0.05);
    const running = !airborne && !paused && speed > 0.05;
    if (running) anim.stride += dt * speed;
    else if (!airborne) anim.stride = 0;

    let state = 'idle';
    let row = 0;
    let column = Math.floor(now / IDLE_FRAME_MS) % IDLE_FRAMES;
    if (input.still) { state = 'still'; column = 0; }
    else if (input.hurt) { state = 'hurt'; row = 2; column = 5; }
    else if (paused) {
      // Held by the story (dialogue, a page turn): standing, breathing - or
      // talking, for whoever is speaking.
      if (input.talking) { state = 'talk'; column = Math.floor(now / TALK_FRAME_MS) % IDLE_FRAMES; }
    }
    else if (now < anim.grabUntil) { state = 'grab'; row = 2; column = 5; }
    else if (showAir) {
      row = 2;
      if (rise > 0.034) { state = 'rise'; column = rise > 0.59 ? 1 : 2; }
      else { state = 'fall'; column = rise > -0.21 ? 3 : 4; }
    }
    else if (now < anim.landUntil) { state = 'land'; row = 2; column = 5; }
    else if (running) { state = 'run'; row = 1; column = Math.floor(anim.stride / STRIDE_FRAME_S) % WALK_FRAMES; }
    anim.state = state;

    // Squash and stretch ease toward the state's shape, so changes never snap.
    let [tx, ty] = calm() ? [1, 1] : SHAPE[state];
    let bob = 0;
    let tilt = 0;
    if (!calm()) {
      if (state === 'idle' && !lite()) ty *= 1 + Math.sin(now / 420) * 0.015;
      if (state === 'talk' && !lite()) ty *= 1 + Math.abs(Math.sin(now / 110)) * 0.025;
      if (state === 'run') {
        // A bounce at each footfall (two per walk cycle) and, for a picture
        // without walk frames, a sway.
        const phase = (anim.stride / (STRIDE_FRAME_S * 3)) * Math.PI;
        bob = Math.abs(Math.sin(phase)) * (input.picture ? 0.06 : 0.02);
        if (input.picture) tilt = Math.sin(phase) * 0.05;
      }
    }
    const k = dt ? 1 - Math.exp(-dt * 30) : 1;
    anim.sx += (tx - anim.sx) * k;
    anim.sy += (ty - anim.sy) * k;
    return {
      state, row, column,
      lift: row === 2 ? JUMP_FRAME_LIFT[column] || 0 : 0,
      sx: anim.sx, sy: anim.sy, bob, tilt
    };
  }

  window.KoobdCharacterAnimation = { FRAME_W, FRAME_H, JUMP_FRAME_LIFT, create, grab, update };
})();
