// KOOB'D's sound: one audio manager for every page (added to each page's
// <head> by auth.php, with the signed-in user's saved settings).
//
// Everything is made here with the Web Audio API - original sounds, nothing
// to download, light on memory:
//   KoobdAudio.sfx(name, options)   character, gameplay and story effects
//   KoobdAudio.ui(name)             interface clicks (also automatic, below)
//   KoobdAudio.music(trackId)       generated background music, crossfaded
//   KoobdAudio.musicFile(url, vol)  a story's own uploaded music
//   KoobdAudio.ambience({rain: 1})  weather and surroundings, faded in and out
//   KoobdAudio.bindMedia(el, kind)  other <audio> (voice-overs) follow the volume
//   KoobdAudio.openSettings()       the Sound settings panel (profile menu)
//
// Four volumes - master, music, effects (with weather), clicks - and mute,
// saved per user (users.audio_prefs, audio_settings.php) and on the device per
// user, so one student's settings never become another's on a shared tablet.
// Browsers only allow sound after the first tap or key: everything waits for
// it once, quietly (no repeated attempts). Leaving the tab pauses all sound;
// coming back resumes it. Music keeps its place from page to page.
(function () {
  if (window.KoobdAudio) return;
  const config = window.KOOBD_AUDIO || {};
  const page = String(config.page || location.pathname.split('/').pop() || '').toLowerCase();
  const AC = window.AudioContext || window.webkitAudioContext;
  const DEFAULTS = { master: 80, music: 50, sfx: 80, ui: 60, muted: false };
  const userKey = `koobd.audio.prefs.${Number(config.user) > 0 ? Number(config.user) : 'guest'}`;
  const lite = () => document.documentElement.classList.contains('koobd-lite');
  const rand = (min, max) => min + Math.random() * (max - min);
  const midiHz = (note) => 440 * Math.pow(2, (note - 69) / 12);

  // --- Settings ------------------------------------------------------------------------------------
  function cleanPrefs(raw) {
    const out = { ...DEFAULTS };
    if (raw && typeof raw === 'object') {
      ['master', 'music', 'sfx', 'ui'].forEach((key) => {
        const value = Number(raw[key]);
        if (Number.isFinite(value)) out[key] = Math.max(0, Math.min(100, Math.round(value)));
      });
      out.muted = Boolean(raw.muted);
    }
    return out;
  }
  function readLocal() {
    try { return JSON.parse(localStorage.getItem(userKey) || 'null'); } catch (error) { return null; }
  }
  // Signed in: the account's saved settings win; then this device's for this user.
  let prefs = cleanPrefs(config.prefs || readLocal() || DEFAULTS);
  function writeLocal() {
    try { localStorage.setItem(userKey, JSON.stringify(prefs)); } catch (error) { /* this visit only */ }
  }
  let saveTimer = 0;
  function saveServer() {
    if (!(Number(config.user) > 0)) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      fetch('audio_settings.php', {
        method: 'POST', credentials: 'same-origin', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefs })
      }).catch(() => {});
    }, 600);
  }
  function setPrefs(partial, save = true) {
    prefs = cleanPrefs({ ...prefs, ...partial });
    applyLevels();
    if (save) { writeLocal(); saveServer(); }
    window.dispatchEvent(new CustomEvent('koobd:audio-prefs', { detail: { ...prefs } }));
  }
  // Another tab of the same user changed them: follow at once.
  window.addEventListener('storage', (event) => {
    if (event.key !== userKey || !event.newValue) return;
    try { prefs = cleanPrefs(JSON.parse(event.newValue)); applyLevels(); } catch (error) { /* ignore */ }
  });
  // Volumes feel even when squared.
  const curve = (value) => Math.pow(Math.max(0, Math.min(100, value)) / 100, 2);
  function level(kind) {
    if (prefs.muted) return 0;
    const masterLevel = curve(prefs.master);
    if (kind === 'voice' || kind === 'master') return masterLevel;
    return masterLevel * curve(prefs[kind] ?? 100);
  }

  // --- The engine ------------------------------------------------------------------------------------
  let ctx = null;
  let out = null;            // master gain
  const bus = {};            // music, sfx, ui (ambience goes through sfx)
  let verb = null;           // a soft room for music and bells
  let noiseBuffer = null;
  let brownBuffer = null;
  let unlocked = false;
  let paused = false;        // a story's pause menu is open

  function makeNoise(seconds, brown) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.5; } else data[i] = white;
    }
    // A soft join at the loop point.
    for (let i = 0; i < 400; i++) { const k = i / 400; data[i] *= k; data[length - 1 - i] *= k; }
    return buffer;
  }
  function build() {
    if (ctx || !AC) return;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (error) { try { ctx = new AC(); } catch (problem) { ctx = null; return; } }
    out = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 10;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.2;
    out.connect(limiter).connect(ctx.destination);
    ['music', 'sfx', 'ui'].forEach((name) => { bus[name] = ctx.createGain(); bus[name].connect(out); });
    // Surroundings are effects (their volume), with their own fader for pauses.
    bus.amb = ctx.createGain();
    bus.amb.connect(bus.sfx);
    noiseBuffer = makeNoise(2, false);
    brownBuffer = makeNoise(3, true);
    if (!lite()) {
      verb = ctx.createConvolver();
      const length = Math.floor(ctx.sampleRate * 1.6);
      const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
      }
      verb.buffer = impulse;
      const verbGain = ctx.createGain();
      verbGain.gain.value = 0.22;
      verb.connect(verbGain).connect(out);
    }
    applyLevels(true);
  }
  function applyLevels(instant) {
    if (ctx) {
      const t = ctx.currentTime;
      const set = (param, value) => { if (instant) param.setValueAtTime(value, t); else param.setTargetAtTime(value, t, 0.04); };
      set(out.gain, prefs.muted ? 0 : curve(prefs.master));
      set(bus.music.gain, paused ? 0.0001 : curve(prefs.music));
      set(bus.amb.gain, paused ? 0.0001 : 1);
      set(bus.sfx.gain, curve(prefs.sfx));
      set(bus.ui.gain, curve(prefs.ui));
    }
    media.forEach((entry) => { try { entry.el.volume = Math.max(0, Math.min(1, entry.base * level(entry.kind))); } catch (error) { /* gone */ } });
  }
  const ready = () => Boolean(ctx && unlocked && ctx.state === 'running');

  // The first tap, click or key starts sound (browsers need it); only once.
  const gestures = ['pointerdown', 'keydown', 'touchend'];
  function unlock() {
    build();
    if (!ctx) return;
    const done = () => {
      if (ctx.state !== 'running') return;
      unlocked = true;
      gestures.forEach((type) => window.removeEventListener(type, unlock, true));
      startPending();
    };
    if (ctx.state === 'suspended') ctx.resume().then(done).catch(() => {});
    else done();
  }
  gestures.forEach((type) => window.addEventListener(type, unlock, { capture: true, passive: true }));
  // Leaving the tab (or the app going to the background) pauses everything.
  document.addEventListener('visibilitychange', () => {
    if (!ctx || !unlocked) return;
    if (document.hidden) { ctx.suspend().catch(() => {}); pauseFileMusic(); }
    else { ctx.resume().catch(() => {}); if (!paused) resumeFileMusic(); }
  });

  // --- Building blocks ------------------------------------------------------------------------------------
  function tone(t, freq, dur, o = {}) {
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + (o.slide || dur));
    if (o.detune) osc.detune.value = o.detune;
    const gain = ctx.createGain();
    const peak = o.gain ?? 0.2;
    const attack = o.attack ?? 0.005;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    let node = osc.connect(gain);
    if (o.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = o.filter;
      filter.frequency.setValueAtTime(o.freq || 1200, t);
      if (o.freqTo) filter.frequency.exponentialRampToValueAtTime(o.freqTo, t + attack + dur);
      filter.Q.value = o.q ?? 0.7;
      node = node.connect(filter);
    }
    if (o.pan && ctx.createStereoPanner) { const panner = ctx.createStereoPanner(); panner.pan.value = o.pan; node = node.connect(panner); }
    node.connect(o.out);
    if (o.verb && verb) node.connect(verb);
    osc.start(t);
    osc.stop(t + attack + dur + 0.05);
    return osc;
  }
  function hiss(t, dur, o = {}) {
    const source = ctx.createBufferSource();
    source.buffer = o.brown ? brownBuffer : noiseBuffer;
    source.playbackRate.value = o.rate || 1;
    const filter = ctx.createBiquadFilter();
    filter.type = o.filter || 'bandpass';
    filter.frequency.setValueAtTime(o.freq || 1500, t);
    if (o.freqTo) filter.frequency.exponentialRampToValueAtTime(o.freqTo, t + dur);
    filter.Q.value = o.q ?? 0.8;
    const gain = ctx.createGain();
    const attack = o.attack ?? 0.003;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(o.gain ?? 0.15, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    let node = source.connect(filter).connect(gain);
    if (o.pan && ctx.createStereoPanner) { const panner = ctx.createStereoPanner(); panner.pan.value = o.pan; node = node.connect(panner); }
    node.connect(o.out);
    source.start(t, Math.random() * 1.5);
    source.stop(t + attack + dur + 0.05);
    return source;
  }
  // Instruments, shared by effects and music.
  const inst = {
    marimba(t, note, o) {
      const f = midiHz(note);
      tone(t, f, o.dur || 0.5, { out: o.out, gain: 0.22 * (o.vel ?? 1), attack: 0.003, verb: o.verb });
      tone(t, f * 4, 0.07, { out: o.out, gain: 0.05 * (o.vel ?? 1), attack: 0.002 });
    },
    bell(t, note, o) {
      const f = midiHz(note);
      tone(t, f, o.dur || 1.4, { out: o.out, gain: 0.14 * (o.vel ?? 1), attack: 0.004, verb: true });
      tone(t, f * 2.76, (o.dur || 1.4) * 0.35, { out: o.out, gain: 0.05 * (o.vel ?? 1), attack: 0.003 });
    },
    pluck(t, note, o) {
      const f = midiHz(note);
      tone(t, f, o.dur || 0.32, { type: 'triangle', out: o.out, gain: 0.16 * (o.vel ?? 1), attack: 0.004, filter: 'lowpass', freq: 3200, freqTo: 900, verb: o.verb });
      tone(t, f * 2, 0.12, { out: o.out, gain: 0.04 * (o.vel ?? 1), attack: 0.002 });
    },
    lute(t, note, o) {
      tone(t, midiHz(note), o.dur || 0.6, { type: 'sawtooth', out: o.out, gain: 0.09 * (o.vel ?? 1), attack: 0.004, filter: 'lowpass', freq: 2600, freqTo: 500, q: 1.2, verb: o.verb });
    },
    keys(t, note, o) {
      const f = midiHz(note);
      tone(t, f, o.dur || 1, { out: o.out, gain: 0.12 * (o.vel ?? 1), attack: 0.01, verb: o.verb });
      tone(t, f * 2, (o.dur || 1) * 0.5, { type: 'triangle', out: o.out, gain: 0.03 * (o.vel ?? 1), attack: 0.01 });
    },
    bass(t, note, o) {
      const f = midiHz(note);
      tone(t, f, o.dur || 0.4, { type: 'triangle', out: o.out, gain: 0.26 * (o.vel ?? 1), attack: 0.008, filter: 'lowpass', freq: 700 });
      tone(t, f / 2, o.dur || 0.4, { out: o.out, gain: 0.12 * (o.vel ?? 1), attack: 0.01 });
    },
    pad(t, notes, o) {
      const dur = o.dur || 2;
      notes.forEach((note) => {
        const f = midiHz(note);
        (lite() ? [0] : [-7, 7]).forEach((cents) => {
          const osc = ctx.createOscillator();
          osc.type = lite() ? 'triangle' : 'sawtooth';
          osc.frequency.value = f;
          osc.detune.value = cents;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = o.bright || 900;
          const gain = ctx.createGain();
          const peak = (lite() ? 0.05 : 0.028) * (o.vel ?? 1);
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.linearRampToValueAtTime(peak, t + Math.min(0.6, dur * 0.3));
          gain.gain.setValueAtTime(peak, t + dur * 0.7);
          gain.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
          osc.connect(filter).connect(gain).connect(o.out);
          if (verb) gain.connect(verb);
          osc.start(t);
          osc.stop(t + dur + 0.5);
        });
      });
    },
    kick(t, o) {
      tone(t, 130, 0.22, { out: o.out, gain: 0.5 * (o.vel ?? 1), attack: 0.002, to: 42, slide: 0.12 });
    },
    snare(t, o) {
      hiss(t, 0.14, { out: o.out, gain: 0.16 * (o.vel ?? 1), filter: 'bandpass', freq: 1900, q: 0.6 });
      tone(t, 190, 0.07, { out: o.out, gain: 0.08 * (o.vel ?? 1), type: 'triangle' });
    },
    hat(t, o) {
      hiss(t, 0.035, { out: o.out, gain: 0.06 * (o.vel ?? 1), filter: 'highpass', freq: 7500, q: 0.5 });
    },
    shaker(t, o) {
      hiss(t, 0.05, { out: o.out, gain: 0.035 * (o.vel ?? 1), filter: 'bandpass', freq: 6000, q: 0.9, attack: 0.012 });
    },
    tom(t, o) {
      tone(t, 150, 0.25, { out: o.out, gain: 0.32 * (o.vel ?? 1), attack: 0.002, to: 90, slide: 0.2 });
    }
  };

  // --- Effects ------------------------------------------------------------------------------------
  // Each effect: (time, output, options). Small random changes keep repeated
  // sounds (steps, clicks) from sounding mechanical.
  const surfaces = {
    grass: (t, o, v) => { hiss(t, 0.06 * v.len, { out: o, gain: 0.2 * v.g, freq: 1700 * v.f, q: 1, pan: v.pan }); hiss(t, 0.03, { out: o, gain: 0.08 * v.g, filter: 'lowpass', freq: 500, pan: v.pan }); },
    dirt: (t, o, v) => { hiss(t, 0.05 * v.len, { out: o, gain: 0.2 * v.g, freq: 1100 * v.f, q: 0.9, pan: v.pan }); tone(t, 110 * v.f, 0.05, { out: o, gain: 0.08 * v.g }); },
    stone: (t, o, v) => { hiss(t, 0.03 * v.len, { out: o, gain: 0.12 * v.g, filter: 'highpass', freq: 2600 * v.f, pan: v.pan }); tone(t, 170 * v.f, 0.045, { out: o, gain: 0.13 * v.g, to: 120 }); },
    wood: (t, o, v) => { tone(t, 150 * v.f, 0.08, { out: o, gain: 0.22 * v.g, to: 105, pan: v.pan }); hiss(t, 0.04, { out: o, gain: 0.08 * v.g, freq: 900 * v.f, pan: v.pan }); },
    sand: (t, o, v) => { hiss(t, 0.09 * v.len, { out: o, gain: 0.14 * v.g, filter: 'lowpass', freq: 1300 * v.f, attack: 0.012, pan: v.pan }); },
    snow: (t, o, v) => { hiss(t, 0.05, { out: o, gain: 0.12 * v.g, freq: 3200 * v.f, q: 0.5, pan: v.pan }); hiss(t + 0.04, 0.05, { out: o, gain: 0.1 * v.g, freq: 2600 * v.f, q: 0.5, pan: v.pan }); }
  };
  let stepSide = 1;
  const SFX = {
    // Interface.
    click: (t, o) => { tone(t, rand(1950, 2150), 0.04, { out: o, gain: 0.16, to: 1300, slide: 0.03 }); hiss(t, 0.015, { out: o, gain: 0.03, filter: 'highpass', freq: 3500 }); },
    nav: (t, o) => { tone(t, 880, 0.05, { type: 'triangle', out: o, gain: 0.13 }); tone(t + 0.035, 1320, 0.07, { out: o, gain: 0.09 }); },
    select: (t, o) => { inst.marimba(t, 72, { out: o, vel: 0.75, dur: 0.3 }); inst.marimba(t + 0.05, 79, { out: o, vel: 0.6, dur: 0.35 }); },
    open: (t, o) => { tone(t, 560, 0.09, { out: o, gain: 0.12, to: 880, slide: 0.07 }); },
    close: (t, o) => { tone(t, 880, 0.08, { out: o, gain: 0.1, to: 560, slide: 0.07 }); },
    confirm: (t, o) => { inst.marimba(t, 76, { out: o, vel: 0.8, dur: 0.25 }); inst.marimba(t + 0.07, 83, { out: o, vel: 0.8, dur: 0.4 }); },
    cancel: (t, o) => { inst.marimba(t, 74, { out: o, vel: 0.6, dur: 0.2 }); inst.marimba(t + 0.07, 69, { out: o, vel: 0.6, dur: 0.3 }); },
    toggle: (t, o) => { tone(t, rand(2500, 2700), 0.03, { out: o, gain: 0.12, to: 1900, slide: 0.025 }); },
    error: (t, o) => { tone(t, 220, 0.18, { type: 'triangle', out: o, gain: 0.12, filter: 'lowpass', freq: 1200 }); tone(t, 233, 0.18, { type: 'triangle', out: o, gain: 0.1, filter: 'lowpass', freq: 1200 }); },
    page: (t, o) => { hiss(t, 0.13, { out: o, gain: 0.09, freq: 1200, freqTo: 3200, q: 0.7, attack: 0.03 }); },
    // Characters.
    step: (t, o, opt) => {
      const kind = surfaces[opt.surface] ? opt.surface : 'grass';
      stepSide = -stepSide;
      surfaces[kind](t, o, { g: rand(0.8, 1.05) * (opt.volume ?? 1), f: rand(0.88, 1.12), len: rand(0.85, 1.15), pan: stepSide * 0.12 });
    },
    jump: (t, o) => { tone(t, rand(250, 280), 0.1, { out: o, gain: 0.13, to: 540, slide: 0.08 }); hiss(t, 0.09, { out: o, gain: 0.05, freq: 1400, freqTo: 3000 }); },
    land: (t, o, opt) => {
      const s = Math.max(0.3, Math.min(1, opt.strength ?? 0.7));
      tone(t, 120, 0.12, { out: o, gain: 0.26 * s, to: 52, slide: 0.1 });
      hiss(t, 0.08, { out: o, gain: 0.14 * s, filter: 'lowpass', freq: 800 });
      SFX.step(t + 0.01, o, { surface: opt.surface, volume: 0.8 * s });
    },
    fall: (t, o) => { hiss(t, 0.5, { out: o, gain: 0.08, freq: 1000, freqTo: 380, attack: 0.08 }); },
    hurt: (t, o) => { tone(t, 330, 0.22, { type: 'triangle', out: o, gain: 0.15, to: 160 }); tone(t, 349, 0.22, { type: 'triangle', out: o, gain: 0.1, to: 170 }); hiss(t, 0.06, { out: o, gain: 0.08, freq: 900 }); },
    interact: (t, o) => { tone(t, 420, 0.06, { out: o, gain: 0.16, to: 820, slide: 0.05 }); },
    talk: (t, o) => { tone(t, rand(520, 700), 0.05, { out: o, gain: 0.05, to: rand(560, 760) }); },
    whoosh: (t, o) => { hiss(t, 0.36, { out: o, gain: 0.12, freq: 450, freqTo: 2200, attack: 0.1, q: 0.9 }); },
    checkpoint: (t, o) => { [79, 84, 88].forEach((note, i) => inst.bell(t + i * 0.08, note, { out: o, vel: 0.8, dur: 1 })); },
    // Gameplay.
    collect: (t, o) => { inst.bell(t, 91, { out: o, vel: 0.9, dur: 0.4 }); inst.bell(t + 0.06, 96, { out: o, vel: 0.8, dur: 0.6 }); tone(t + 0.1, 4200, 0.05, { out: o, gain: 0.03 }); },
    letter: (t, o, opt) => { const scale = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93]; inst.marimba(t, scale[Math.min(scale.length - 1, opt.index || 0)], { out: o, vel: 0.9, dur: 0.45 }); inst.bell(t + 0.03, scale[Math.min(scale.length - 1, opt.index || 0)] + 12, { out: o, vel: 0.35, dur: 0.5 }); },
    word: (t, o) => { [72, 76, 79, 84].forEach((note, i) => inst.marimba(t + i * 0.07, note, { out: o, vel: 0.85, dur: 0.5 })); inst.bell(t + 0.3, 88, { out: o, vel: 0.7, dur: 1.4 }); },
    correct: (t, o) => { inst.bell(t, 79, { out: o, vel: 0.9, dur: 0.6 }); inst.bell(t + 0.1, 84, { out: o, vel: 0.9, dur: 1 }); },
    wrong: (t, o) => { tone(t, 196, 0.3, { type: 'triangle', out: o, gain: 0.13, to: 180, filter: 'lowpass', freq: 1100 }); tone(t + 0.14, 155, 0.36, { type: 'triangle', out: o, gain: 0.12, filter: 'lowpass', freq: 900 }); },
    tick: (t, o) => { tone(t, 1250, 0.03, { out: o, gain: 0.16 }); hiss(t, 0.01, { out: o, gain: 0.04, filter: 'highpass', freq: 4000 }); },
    go: (t, o) => { [72, 76, 79, 84].forEach((note) => inst.marimba(t, note, { out: o, vel: 0.7, dur: 0.6 })); hiss(t, 0.25, { out: o, gain: 0.06, freq: 2500, freqTo: 6000 }); },
    point: (t, o) => { tone(t, 988, 0.06, { out: o, gain: 0.12 }); tone(t + 0.06, 1319, 0.16, { out: o, gain: 0.12 }); },
    roundWin: (t, o) => { [72, 76, 79, 84, 88].forEach((note, i) => inst.marimba(t + i * 0.06, note, { out: o, vel: 0.85, dur: 0.5 })); [84, 88, 91].forEach((note) => inst.bell(t + 0.32, note, { out: o, vel: 0.5, dur: 1.6 })); },
    roundLose: (t, o) => { [76, 72, 67].forEach((note, i) => inst.pluck(t + i * 0.14, note, { out: o, vel: 0.8, dur: 0.5 })); },
    matchWin: (t, o) => {
      const brass = (time, note, dur) => { tone(time, midiHz(note), dur, { type: 'sawtooth', out: o, gain: 0.08, attack: 0.03, filter: 'lowpass', freq: 2200, verb: true }); tone(time, midiHz(note - 12), dur, { type: 'triangle', out: o, gain: 0.08, attack: 0.03 }); };
      brass(t, 67, 0.16); brass(t + 0.18, 72, 0.16); brass(t + 0.36, 76, 0.16); brass(t + 0.54, 79, 1.1);
      [72, 76, 79, 84].forEach((note) => inst.bell(t + 0.54, note, { out: o, vel: 0.5, dur: 2 }));
    },
    matchLose: (t, o) => { [69, 67, 64, 60].forEach((note, i) => inst.keys(t + i * 0.28, note, { out: o, vel: 0.8, dur: 0.9, verb: true })); },
    join: (t, o) => { inst.bell(t, 84, { out: o, vel: 0.7, dur: 0.6 }); inst.bell(t + 0.09, 91, { out: o, vel: 0.6, dur: 0.8 }); },
    ready: (t, o) => { inst.marimba(t, 79, { out: o, vel: 0.7, dur: 0.3 }); inst.marimba(t + 0.06, 86, { out: o, vel: 0.7, dur: 0.4 }); },
    notify: (t, o) => { inst.bell(t, 88, { out: o, vel: 0.6, dur: 0.9 }); },
    // Story effects creators can place (also used by KOOB'D's own stories).
    chime: (t, o) => { [84, 88, 91, 96].forEach((note, i) => inst.bell(t + i * 0.09, note, { out: o, vel: 0.6, dur: 1.5 })); },
    bell: (t, o) => { const f = midiHz(55); [1, 2.4, 3, 4.2, 5.4].forEach((ratio, i) => tone(t, f * ratio, 3.2 / (1 + i * 0.6), { out: o, gain: 0.14 / (1 + i), attack: 0.004, verb: true })); },
    door: (t, o) => { tone(t, 95, 0.55, { type: 'sawtooth', out: o, gain: 0.06, to: 150, slide: 0.5, filter: 'bandpass', freq: 700, q: 3 }); tone(t + 0.58, 90, 0.18, { out: o, gain: 0.3, to: 50 }); hiss(t + 0.58, 0.08, { out: o, gain: 0.1, filter: 'lowpass', freq: 600 }); },
    knock: (t, o) => { [0, 0.17, 0.34].forEach((d) => { tone(t + d, rand(160, 175), 0.07, { out: o, gain: 0.3, to: 120 }); hiss(t + d, 0.03, { out: o, gain: 0.08, freq: 1200 }); }); },
    magic: (t, o) => { for (let i = 0; i < 9; i++) inst.bell(t + i * 0.045, 84 + [0, 4, 7, 11, 12, 16, 19, 23, 24][i], { out: o, vel: 0.35, dur: 0.9 }); hiss(t, 0.6, { out: o, gain: 0.04, filter: 'highpass', freq: 5000, attack: 0.2 }); },
    splash: (t, o) => { hiss(t, 0.5, { out: o, gain: 0.22, filter: 'lowpass', freq: 4000, freqTo: 500, attack: 0.01 }); for (let i = 0; i < 4; i++) tone(t + 0.15 + i * rand(0.05, 0.1), rand(400, 900), 0.06, { out: o, gain: 0.05, to: rand(900, 1500) }); },
    thunder: (t, o) => { hiss(t, 0.18, { out: o, gain: 0.25, filter: 'highpass', freq: 900, attack: 0.005 }); hiss(t + 0.05, 3.2, { out: o, gain: 0.6, brown: true, filter: 'lowpass', freq: 160, attack: 0.08, rate: 0.6 }); },
    pop: (t, o) => { tone(t, 380, 0.05, { out: o, gain: 0.2, to: 900, slide: 0.04 }); },
    sparkle: (t, o) => { [96, 100, 103].forEach((note, i) => inst.bell(t + i * 0.05, note, { out: o, vel: 0.4, dur: 0.6 })); },
    success: (t, o) => SFX.word(t, o),
    fail: (t, o) => SFX.wrong(t, o),
    footsteps: (t, o, opt) => { for (let i = 0; i < 4; i++) SFX.step(t + i * 0.3, o, { surface: opt.surface || 'dirt' }); },
    eagle: (t, o) => { [0, 0.45].forEach((d) => { tone(t + d, 2600, 0.38, { type: 'sawtooth', out: o, gain: 0.05, to: 1500, slide: 0.36, filter: 'bandpass', freq: 2400, q: 2, verb: true }); tone(t + d, 2200, 0.34, { out: o, gain: 0.05, to: 1300, slide: 0.32 }); }); },
    snore: (t, o) => { [0, 1.6].forEach((d) => { hiss(t + d, 0.9, { out: o, gain: 0.1, filter: 'lowpass', freq: 380, attack: 0.5, brown: true }); tone(t + d + 0.2, 82, 0.7, { type: 'sawtooth', out: o, gain: 0.03, attack: 0.3, filter: 'lowpass', freq: 300 }); }); },
    cheer: (t, o) => { hiss(t, 2.4, { out: o, gain: 0.2, freq: 1500, q: 0.5, attack: 0.25 }); for (let i = 0; i < 10; i++) tone(t + rand(0, 1.6), rand(500, 900), 0.3, { type: 'triangle', out: o, gain: 0.025, to: rand(700, 1200), pan: rand(-0.6, 0.6) }); }
  };
  // The last few sounds and music requests, for checking a page (KoobdAudio.requests).
  const requests = [];
  function note(what) { requests.push(`${Math.round(performance.now())} ${what}`); if (requests.length > 30) requests.shift(); }
  // How often an effect may start (ms), and how many may sound at once.
  const LIMIT = { step: [70, 3], click: [40, 2], toggle: [40, 2], talk: [60, 2], tick: [80, 2], jump: [90, 2], land: [120, 2], collect: [60, 3], letter: [60, 3], hurt: [300, 1], whoosh: [200, 2], thunder: [800, 2] };
  const lastStart = {};
  const playing = {};
  function play(kind, name, options = {}) {
    if (!ready() || !SFX[name] || level(kind) <= 0) return false;
    const now = performance.now();
    const [gap, max] = LIMIT[name] || [50, 3];
    if (now - (lastStart[name] || 0) < gap || (playing[name] || 0) >= max) return false;
    lastStart[name] = now;
    playing[name] = (playing[name] || 0) + 1;
    window.setTimeout(() => { playing[name] = Math.max(0, (playing[name] || 1) - 1); }, 450);
    let output = bus[kind];
    if (options.volume !== undefined && options.volume !== 1 && name !== 'step') {
      output = ctx.createGain();
      output.gain.value = Math.max(0, Math.min(2, options.volume));
      output.connect(bus[kind]);
    }
    try { SFX[name](ctx.currentTime + 0.005, output, options); } catch (error) { return false; }
    note(`${kind} ${name}`);
    return true;
  }

  // --- Weather and surroundings ------------------------------------------------------------------------
  // Layers fade in and out; each runs only while it is heard.
  const AMBIENCE = {
    rain(o) {
      const a = hissLoop(o, { filter: 'highpass', freq: 500, gain: 0.32 });
      const b = hissLoop(o, { filter: 'bandpass', freq: 2600, q: 0.6, gain: 0.14 });
      const drops = lite() ? null : every(70, 200, (t) => tone(t, rand(2200, 4200), 0.012, { out: o, gain: rand(0.008, 0.025), pan: rand(-0.7, 0.7) }));
      return () => { a(); b(); drops && drops(); };
    },
    wind(o) {
      const source = loopSource(noiseBuffer);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass'; filter.frequency.value = 520; filter.Q.value = 0.9;
      const gain = ctx.createGain(); gain.gain.value = 0.3;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      const lfoAmount = ctx.createGain(); lfoAmount.gain.value = 260;
      lfo.connect(lfoAmount).connect(filter.frequency);
      const swell = ctx.createOscillator(); swell.frequency.value = 0.11;
      const swellAmount = ctx.createGain(); swellAmount.gain.value = 0.14;
      swell.connect(swellAmount).connect(gain.gain);
      source.connect(filter).connect(gain).connect(o);
      lfo.start(); swell.start();
      return () => { [source, lfo, swell].forEach((node) => { try { node.stop(); } catch (error) { /* done */ } }); };
    },
    water(o) {
      const a = hissLoop(o, { filter: 'lowpass', freq: 900, gain: 0.5, brown: true });
      const b = hissLoop(o, { filter: 'bandpass', freq: 1800, q: 1.2, gain: 0.05 });
      const bubbles = every(140, 420, (t) => tone(t, rand(300, 800), 0.05, { out: o, gain: rand(0.02, 0.05), to: rand(900, 1600), slide: 0.04, pan: rand(-0.5, 0.5) }));
      return () => { a(); b(); bubbles(); };
    },
    birds(o) {
      return every(1200, 4200, (t) => {
        const pan = rand(-0.7, 0.7);
        const base = rand(2400, 3800);
        const count = Math.floor(rand(2, 6));
        for (let i = 0; i < count; i++) tone(t + i * rand(0.08, 0.13), base * rand(0.9, 1.15), 0.06, { out: o, gain: rand(0.025, 0.05), to: base * rand(1.2, 1.5), slide: 0.05, pan });
      });
    },
    crickets(o) {
      return every(700, 1500, (t) => {
        const pan = rand(-0.6, 0.6);
        const f = rand(4300, 4900);
        for (let i = 0; i < 3; i++) tone(t + i * 0.045, f, 0.018, { out: o, gain: 0.025, pan });
      });
    },
    thunder(o) {
      return every(14000, 32000, (t) => {
        hiss(t, 3.6, { out: o, gain: rand(0.35, 0.6), brown: true, filter: 'lowpass', freq: 150, attack: 0.25, rate: 0.6 });
        if (Math.random() < 0.4) hiss(t + 0.1, 0.25, { out: o, gain: 0.12, filter: 'highpass', freq: 900 });
      }, true);
    },
    fire(o) {
      const a = hissLoop(o, { filter: 'lowpass', freq: 600, gain: 0.25, brown: true });
      const crackle = every(60, 260, (t) => hiss(t, 0.01, { out: o, gain: rand(0.02, 0.08), filter: 'highpass', freq: rand(2000, 5000) }));
      return () => { a(); crackle(); };
    }
  };
  function loopSource(buffer) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start(ctx.currentTime, Math.random() * buffer.duration);
    return source;
  }
  function hissLoop(o, opt) {
    const source = loopSource(opt.brown ? brownBuffer : noiseBuffer);
    const filter = ctx.createBiquadFilter();
    filter.type = opt.filter; filter.frequency.value = opt.freq; filter.Q.value = opt.q ?? 0.7;
    const gain = ctx.createGain(); gain.gain.value = opt.gain;
    source.connect(filter).connect(gain).connect(o);
    return () => { try { source.stop(); } catch (error) { /* done */ } };
  }
  // Calls fn(time) every min-max ms while running (a sound event).
  function every(min, max, fn, firstLater) {
    let timer = 0;
    let live = true;
    const next = () => {
      timer = window.setTimeout(() => {
        if (!live) return;
        if (ctx && ctx.state === 'running') fn(ctx.currentTime + 0.02);
        next();
      }, rand(min, max));
    };
    if (!firstLater && ctx && ctx.state === 'running') fn(ctx.currentTime + 0.05);
    next();
    return () => { live = false; window.clearTimeout(timer); };
  }
  const ambienceLayers = {};   // name -> { gain, stop }
  let ambienceWanted = {};
  function applyAmbience(fade = 1.6) {
    if (!ready()) return;
    Object.keys(AMBIENCE).forEach((name) => {
      const target = Math.max(0, Math.min(1, Number(ambienceWanted[name]) || 0));
      let layer = ambienceLayers[name];
      if (target > 0 && !layer) {
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        gain.connect(bus.amb);
        layer = ambienceLayers[name] = { gain, stop: AMBIENCE[name](gain), target: 0 };
      }
      if (!layer || layer.target === target) return;
      layer.target = target;
      const t = ctx.currentTime;
      layer.gain.gain.cancelScheduledValues(t);
      layer.gain.gain.setValueAtTime(Math.max(0.0001, layer.gain.gain.value), t);
      layer.gain.gain.linearRampToValueAtTime(Math.max(0.0001, target * 0.9), t + fade);
      if (target === 0) {
        window.clearTimeout(layer.end);
        layer.end = window.setTimeout(() => {
          if (layer.target !== 0) return;
          layer.stop();
          layer.gain.disconnect();
          delete ambienceLayers[name];
        }, fade * 1000 + 200);
      }
    });
  }
  // layers: { rain: 0.8, wind: 0.5 } or ['rain', 'wind'] (full), or null for none.
  function ambience(layers, options = {}) {
    const wanted = {};
    const scale = options.volume ?? 1;
    if (Array.isArray(layers)) layers.forEach((name) => { if (AMBIENCE[name]) wanted[name] = scale; });
    else if (layers && typeof layers === 'object') Object.entries(layers).forEach(([name, value]) => { if (AMBIENCE[name]) wanted[name] = Number(value) * scale; });
    ambienceWanted = wanted;
    applyAmbience(options.fade ?? 1.6);
  }

  // --- Music -----------------------------------------------------------------------------------------
  // Each track: tempo, key, scale, 8 bars of chords (scale degrees) and its
  // parts. The melody is made from the chords with a fixed seed, so a track is
  // always itself; it varies a little from one time round to the next.
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };
  const TRACKS = {
    home: { name: 'Sunny Shelves', bpm: 96, root: 60, scale: 'major', chords: [0, 5, 3, 4, 0, 5, 3, 4], pad: 0.8, arp: { inst: 'marimba', pattern: [0, 1, 2, 1, 2, 1, 0, 1], vel: 0.55 }, bass: 'half', melody: { inst: 'bell', density: 0.32, vel: 0.5 }, drums: { shaker: 'eighths', kick: [0, 8] }, gain: 0.85 },
    browse: { name: 'Quiet Corner', bpm: 84, root: 65, scale: 'major', chords: [0, 2, 3, 4, 0, 2, 3, 1], pad: 0.8, arp: { inst: 'keys', pattern: [0, -1, 2, -1, 1, -1, 2, -1], vel: 0.6 }, bass: 'whole', melody: { inst: 'keys', density: 0.22, vel: 0.5 }, gain: 0.8 },
    reading: { name: 'Quiet Pages', bpm: 66, root: 63, scale: 'major', chords: [0, 3, 5, 4, 0, 3, 1, 4], pad: 0.9, bass: 'whole', melody: { inst: 'bell', density: 0.16, vel: 0.45 }, gain: 0.7 },
    adventure: { name: 'Off We Go', bpm: 112, root: 67, scale: 'major', chords: [0, 4, 5, 3, 0, 4, 5, 3], pad: 0.6, arp: { inst: 'pluck', pattern: [0, 1, 2, 1, 0, 1, 2, 1], vel: 0.6 }, bass: 'eighths', melody: { inst: 'marimba', density: 0.45, vel: 0.65 }, drums: { kick: [0, 8], snare: [4, 12], hat: 'eighths' }, gain: 0.8 },
    calm: { name: 'Meadow Breeze', bpm: 76, root: 62, scale: 'major', chords: [0, 3, 0, 4, 5, 3, 1, 4], pad: 0.8, arp: { inst: 'marimba', pattern: [0, -1, 1, -1, 2, -1, 1, -1], vel: 0.45 }, bass: 'whole', melody: { inst: 'bell', density: 0.2, vel: 0.4 }, gain: 0.8 },
    mystery: { name: 'Whispering Woods', bpm: 72, root: 62, scale: 'dorian', chords: [0, 3, 0, 6, 0, 3, 4, 6], pad: 1, bass: 'whole', melody: { inst: 'bell', density: 0.2, vel: 0.45 }, arp: { inst: 'pluck', pattern: [0, -1, -1, 2, -1, -1, 1, -1], vel: 0.35 }, gain: 0.8 },
    joyful: { name: 'Bright Day', bpm: 122, root: 69, scale: 'major', chords: [0, 3, 4, 3, 0, 3, 4, 4], pad: 0.5, arp: { inst: 'marimba', pattern: [0, 2, 1, 2, 0, 2, 1, 2], vel: 0.55 }, bass: 'quarters', melody: { inst: 'marimba', density: 0.5, vel: 0.6 }, drums: { kick: [0, 8], snare: [4, 12], shaker: 'sixteenths' }, gain: 0.75 },
    night: { name: 'Starlight', bpm: 60, root: 68, scale: 'major', chords: [0, 3, 5, 4, 0, 3, 4, 0], pad: 0.8, arp: { inst: 'bell', pattern: [0, -1, 1, -1, 2, -1, 1, -1], vel: 0.35 }, bass: 'whole', gain: 0.75 },
    tense: { name: 'Close Call', bpm: 100, root: 64, scale: 'minor', chords: [0, 0, 5, 6, 0, 0, 5, 4], pad: 0.7, bright: 600, arp: { inst: 'pluck', pattern: [0, 0, 1, 0, 0, 2, 0, 1], vel: 0.4 }, bass: 'eighths', drums: { kick: [0, 6, 8] }, gain: 0.8 },
    royal: { name: 'Castle Halls', bpm: 90, root: 62, scale: 'dorian', chords: [0, 6, 3, 0, 0, 6, 4, 0], pad: 0.6, arp: { inst: 'lute', pattern: [0, 1, 2, 1, 0, 2, 1, 2], vel: 0.55 }, bass: 'half', melody: { inst: 'lute', density: 0.4, vel: 0.6 }, drums: { tom: [0, 6, 8] }, gain: 0.8 },
    meadow: { name: 'Race in the Meadow', bpm: 104, root: 65, scale: 'major', chords: [0, 3, 4, 0, 0, 3, 1, 4], pad: 0.6, arp: { inst: 'marimba', pattern: [0, 1, 2, 1, 2, 1, 0, 1], vel: 0.5 }, bass: 'half', melody: { inst: 'pluck', density: 0.45, vel: 0.6 }, drums: { shaker: 'eighths', kick: [0, 8] }, gain: 0.8 },
    lobby: { name: 'Get Ready', bpm: 100, root: 69, scale: 'minor', chords: [0, 5, 2, 6, 0, 5, 2, 6], pad: 0.6, arp: { inst: 'pluck', pattern: [0, 1, 2, 1, 0, 1, 2, 1], vel: 0.45 }, bass: 'half', drums: { hat: 'offbeats', kick: [0, 8] }, gain: 0.75 },
    versus: { name: 'Word Race', bpm: 128, root: 69, scale: 'minor', chords: [0, 5, 2, 6, 0, 5, 2, 6], pad: 0.5, arp: { inst: 'pluck', pattern: [0, 2, 1, 2, 0, 2, 1, 2], vel: 0.5, sixteenths: true }, bass: 'eighths', melody: { inst: 'bell', density: 0.25, vel: 0.45 }, drums: { kick: [0, 4, 8, 12], snare: [4, 12], hat: 'offbeats' }, gain: 0.75 }
  };
  // Which tracks creators can choose (story editors list these).
  const STORY_TRACKS = ['adventure', 'calm', 'mystery', 'joyful', 'night', 'tense', 'royal', 'meadow', 'reading'];

  function chordNotes(track, degree, octave = 0) {
    const scale = SCALES[track.scale] || SCALES.major;
    return [0, 2, 4].map((step) => {
      const index = degree + step;
      return track.root + scale[index % 7] + 12 * Math.floor(index / 7) + 12 * octave;
    });
  }
  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  const hash = (text) => Array.from(text).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const melodyCache = {};
  function melodyBar(id, track, bar, round) {
    const key = `${id}:${bar}:${round % 2}`;
    if (melodyCache[key]) return melodyCache[key];
    const random = seeded(hash(id) + (bar % 4) * 97 + (bar >= 4 ? 13 : 0) + (round % 2) * 7919);
    const chord = chordNotes(track, track.chords[bar], 1);
    const scale = SCALES[track.scale] || SCALES.major;
    const notes = [];
    let last = chord[0];
    for (let eighth = 0; eighth < 8; eighth++) {
      const strong = eighth % 2 === 0;
      if (random() > track.melody.density * (strong ? 1.3 : 0.6)) continue;
      let note = strong ? chord[Math.floor(random() * 3)] : track.root + 12 + scale[Math.floor(random() * 7)];
      while (note - last > 7) note -= 12;
      while (last - note > 7) note += 12;
      notes.push({ eighth, note, len: random() < 0.3 ? 2 : 1 });
      last = note;
    }
    return (melodyCache[key] = notes);
  }

  let current = null;   // { id, track, gain, startAt, step, timer }
  let wantedMusic = null;   // { id } or { file, volume }
  const STEPS_PER_BAR = 16;
  function schedule(state) {
    const track = state.track;
    const stepDur = 60 / track.bpm / 4;
    const totalSteps = track.chords.length * STEPS_PER_BAR;
    while (state.nextTime < ctx.currentTime + 0.25) {
      const step = state.step;
      const t = state.nextTime;
      const inLoop = step % totalSteps;
      const round = Math.floor(step / totalSteps);
      const bar = Math.floor(inLoop / STEPS_PER_BAR);
      const s = inLoop % STEPS_PER_BAR;
      const o = state.gain;
      const degree = track.chords[bar];
      const chord = chordNotes(track, degree);
      // Every fourth time round the drums rest, for breathing space.
      const drumsRest = round % 4 === 3;
      if (s === 0 && track.pad) inst.pad(t, chord.map((n) => n - 12), { out: o, dur: stepDur * 16, vel: track.pad, bright: track.bright });
      if (track.bass) {
        const root = chord[0] - 24;
        const hit = { whole: [0], half: [0, 8], quarters: [0, 4, 8, 12], eighths: [0, 2, 4, 6, 8, 10, 12, 14] }[track.bass] || [];
        if (hit.includes(s)) inst.bass(t, track.bass === 'eighths' && s % 4 === 2 ? root + 12 : root, { out: o, dur: stepDur * (track.bass === 'whole' ? 14 : track.bass === 'half' ? 7 : 1.8), vel: 0.8 });
      }
      if (track.arp && (track.arp.sixteenths || s % 2 === 0)) {
        const index = track.arp.sixteenths ? s % 8 : (s / 2) % 8;
        const pick = track.arp.pattern[index];
        if (pick >= 0) inst[track.arp.inst](t, chord[pick] + (track.arp.inst === 'bell' ? 12 : 0), { out: o, vel: track.arp.vel * (s % 4 === 0 ? 1 : 0.8), dur: track.arp.inst === 'bell' ? 1.2 : 0.4 });
      }
      if (track.melody && s % 2 === 0 && !(lite() && track.arp)) {
        melodyBar(state.id, track, bar, round).forEach((m) => {
          if (m.eighth * 2 === s) inst[track.melody.inst](t, m.note, { out: o, vel: track.melody.vel, dur: stepDur * 2 * m.len + 0.2, verb: true });
        });
      }
      if (track.drums && !drumsRest) {
        const d = track.drums;
        if (d.kick && d.kick.includes(s)) inst.kick(t, { out: o, vel: 0.8 });
        if (d.snare && d.snare.includes(s)) inst.snare(t, { out: o, vel: 0.7 });
        if (d.tom && d.tom.includes(s)) inst.tom(t, { out: o, vel: 0.7 });
        if (d.hat === 'eighths' && s % 2 === 0) inst.hat(t, { out: o, vel: s % 4 === 0 ? 0.6 : 1 });
        if (d.hat === 'offbeats' && s % 4 === 2) inst.hat(t, { out: o });
        if (d.shaker === 'eighths' && s % 2 === 0) inst.shaker(t, { out: o, vel: s % 4 === 2 ? 1 : 0.6 });
        if (d.shaker === 'sixteenths' && !lite()) inst.shaker(t, { out: o, vel: s % 2 ? 0.5 : 0.9 });
      }
      state.step++;
      state.nextTime += stepDur;
    }
  }
  const MUSIC_KEY = 'koobd.audio.music';
  function startTrack(id, fade) {
    const track = TRACKS[id];
    if (!track) return;
    // The same track as on the last page carries on from where it was.
    let step = 0;
    try {
      const saved = JSON.parse(sessionStorage.getItem(MUSIC_KEY) || 'null');
      if (saved && saved.id === id && Date.now() - saved.at < 30 * 60 * 1000) {
        step = Math.floor(((Date.now() - saved.at) / 1000) / (60 / track.bpm / 4));
      } else sessionStorage.setItem(MUSIC_KEY, JSON.stringify({ id, at: Date.now() }));
    } catch (error) { /* starts at the beginning */ }
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.linearRampToValueAtTime(track.gain, ctx.currentTime + fade);
    gain.connect(bus.music);
    const state = { id, track, gain, step, nextTime: ctx.currentTime + 0.08 };
    state.timer = window.setInterval(() => { if (ctx.state === 'running') schedule(state); }, 60);
    schedule(state);
    current = state;
  }
  function stopTrack(state, fade) {
    if (!state) return;
    const t = ctx.currentTime;
    state.gain.gain.cancelScheduledValues(t);
    state.gain.gain.setValueAtTime(state.gain.gain.value, t);
    state.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
    window.setTimeout(() => { window.clearInterval(state.timer); state.gain.disconnect(); }, fade * 1000 + 500);
  }
  // A story's own music file, through the same music volume.
  let fileMusic = null;   // { url, el, gain, source }
  function startFile(url, volume, fade) {
    const el = new Audio();
    el.src = url;
    el.loop = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    let source = null;
    try { source = ctx.createMediaElementSource(el); source.connect(gain); } catch (error) { source = null; }
    gain.connect(bus.music);
    gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, volume)), ctx.currentTime + fade);
    el.play().catch(() => {});
    el.addEventListener('error', () => { /* a missing file: silence, nothing else */ }, { once: true });
    fileMusic = { url, el, gain, source };
  }
  function stopFile(fade) {
    if (!fileMusic) return;
    const old = fileMusic;
    fileMusic = null;
    const t = ctx.currentTime;
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setValueAtTime(old.gain.gain.value, t);
    old.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
    window.setTimeout(() => { old.el.pause(); old.el.removeAttribute('src'); old.gain.disconnect(); }, fade * 1000 + 300);
  }
  function pauseFileMusic() { if (fileMusic) fileMusic.el.pause(); }
  function resumeFileMusic() { if (fileMusic) fileMusic.el.play().catch(() => {}); }
  function applyMusic(fade = 1.4) {
    if (!ready()) return;
    const want = wantedMusic;
    const wantId = want && want.id ? want.id : null;
    const wantFile = want && want.file ? want.file : null;
    if (current && current.id !== wantId) { stopTrack(current, fade); current = null; }
    if (fileMusic && fileMusic.url !== wantFile) stopFile(fade);
    if (wantId && !current) startTrack(wantId, fade);
    if (wantFile && !fileMusic) startFile(wantFile, want.volume ?? 0.7, fade);
  }
  function startPending() {
    applyLevels(true);
    applyMusic(1.2);
    applyAmbience(1.6);
  }

  // --- Other sounds on the page (voice-overs, recordings) ------------------------------------------
  const media = new Set();
  function bindMedia(el, kind = 'voice', base = 1) {
    if (!el) return el;
    const entry = { el, kind, base };
    media.forEach((other) => { if (other.el === el) media.delete(other); });
    media.add(entry);
    try { el.volume = Math.max(0, Math.min(1, base * level(kind))); } catch (error) { /* read-only on some phones */ }
    return el;
  }

  // --- The page's music, unless the page chooses its own ---------------------------------------------
  const SECTION = {
    'home.php': 'home', 'index.php': 'home', 'log.php': 'home', 'sign.php': 'home', 'teacher_login.php': 'home', 'teacher_register.php': 'home',
    'classroom.php': 'browse', 'classroom_room.php': 'browse', 'student_stories.php': 'browse', 'favorites.php': 'browse',
    'search_stories.php': 'browse', 'story.php': 'browse', 'whats_new.php': 'browse', 'profile.php': 'browse', 'teacher_stories.php': 'browse',
    'teacher_classroom.php': 'browse', 'teacher_dashboard.php': 'browse', 'teacher_profile.php': 'browse', 'reader.php': 'browse', 'customize_character.php': 'browse',
    'versus.php': 'lobby', 'versus_match.php': 'browse'
  };
  // Pages that start their own music (stories, matches) - or keep quiet for
  // focus (editors, quizzes, reports).
  if (SECTION[page] && document.body?.dataset.koobdMusic !== 'none') wantedMusic = { id: SECTION[page] };
  document.addEventListener('DOMContentLoaded', () => {
    const chosen = document.body.dataset.koobdMusic;
    if (chosen === 'none') { wantedMusic = null; applyMusic(); }
    else if (chosen && TRACKS[chosen]) { wantedMusic = { id: chosen }; applyMusic(); }
  });

  // --- Interface clicks ------------------------------------------------------------------------------
  // One short, soft sound for each tap or press on something that does
  // something; its kind from what it is. Game controls and story stages have
  // their own sounds; typing, sliders and scrolling make none.
  const INTERACTIVE = 'a[href], button, [role="button"], [role="tab"], [role="radio"], [role="menuitem"], [role="option"], [role="switch"], summary, label[for], input[type="checkbox"], input[type="radio"], input[type="submit"], input[type="button"], select, [data-click-sound]';
  const QUIET = '[data-no-click-sound], .platformer-story-controls, .platformer-story-stage, .vs-controls, .vs-stage, .koobd-story canvas, input[type="range"], [contenteditable="true"]';
  function kindOf(target) {
    if (target.dataset.clickSound) return target.dataset.clickSound;
    if (target.disabled || target.getAttribute('aria-disabled') === 'true') return 'error';
    if (target.closest('.sidebar-nav, .sidebar-link, .mobile-nav, .bottom-nav')) return 'nav';
    if (target.matches('[aria-haspopup], .sidebar-profile-link, .classroom-story-menu-btn') && target.getAttribute('aria-expanded') !== 'true') return 'open';
    if (target.matches('[aria-haspopup]') && target.getAttribute('aria-expanded') === 'true') return 'close';
    if (/close|cancel|dismiss/i.test(`${target.getAttribute('aria-label') || ''} ${target.className || ''} ${target.dataset.closeActivityForm !== undefined ? 'close' : ''}`) || /^(cancel|close|no|back|not now)$/i.test((target.textContent || '').trim())) return 'close';
    if (target.matches('[role="tab"], [role="radio"], [role="switch"], input[type="checkbox"], input[type="radio"], .tr-tab, .tr-view')) return 'toggle';
    if (target.matches('.danger, .is-danger, [type="submit"], .is-primary, .vs-btn-primary') || /^(save|confirm|delete|submit|done|start|join|create|ok|yes|send|publish)/i.test((target.textContent || '').trim())) return 'confirm';
    if (target.closest('[class*="story-card"], [class*="story-tile"], .story-shelf-track a, .story-shelf-track button, [data-story-details], .vs-choice, .activity-card a, .st-student, .vs-history-row')) return 'select';
    return 'click';
  }
  const lastPressed = new WeakMap();
  function onPress(event) {
    if (event.type === 'pointerdown' && event.button !== 0) return;
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target.closest ? event.target.closest(INTERACTIVE) : null;
    if (!target || target.closest(QUIET)) return;
    if (event.type === 'keydown' && (target.matches('input, select, textarea') || (event.key === ' ' && target.tagName === 'A'))) return;
    const now = performance.now();
    if (now - (lastPressed.get(target) || 0) < 350) return;
    lastPressed.set(target, now);
    // The kind is read now (a menu button still shows whether it is about to
    // open or close); the sound plays a moment later, once a first press has
    // unlocked sound.
    const kind = kindOf(target);
    window.setTimeout(() => play('ui', kind), 0);
  }
  window.addEventListener('pointerdown', onPress, { capture: true, passive: true });
  window.addEventListener('keydown', onPress, { capture: true });

  // --- Sound settings ------------------------------------------------------------------------------------
  // "Sound settings" in the profile menu (every page that has one), and on
  // pages without it through KoobdAudio.openSettings().
  const ICON_SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/></svg>';
  function addMenuItems() {
    document.querySelectorAll('.sidebar-profile-popover').forEach((menu) => {
      if (menu.querySelector('[data-sound-settings]')) return;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'sidebar-profile-menu-item koobd-sound-menu-item';
      item.dataset.soundSettings = '';
      item.innerHTML = `${ICON_SPEAKER}<span>Sound settings</span>`;
      item.addEventListener('click', () => { menu.hidden = true; menu.closest('.sidebar-profile-menu')?.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false'); openSettings(); });
      const logout = menu.querySelector('form, .is-logout');
      menu.insertBefore(item, logout ? logout.closest('form') || logout : null);
    });
  }
  let panel = null;
  function openSettings() {
    if (!panel) panel = buildPanel();
    refreshPanel();
    if (typeof panel.showModal === 'function') panel.showModal(); else panel.setAttribute('open', '');
    panel.querySelector('input[type="range"]')?.focus();
  }
  function buildPanel() {
    const dialog = document.createElement('dialog');
    dialog.className = 'koobd-sound';
    dialog.setAttribute('aria-labelledby', 'koobdSoundTitle');
    const ICONS = {
      music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
      sfx: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3.5l1.7 4.6 4.6 1.7-4.6 1.7L11 16.1l-1.7-4.6-4.6-1.7 4.6-1.7z"/><path d="M18 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
      ui: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 013 0V11m0-1a1.5 1.5 0 013 0v1m0-.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-.8a6 6 0 01-5-2.7L4.7 15.4a1.6 1.6 0 012.6-1.8L9 15.5"/></svg>'
    };
    const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.8v12.4l9.6-6.2z"/></svg>';
    const slider = (key) => `<input type="range" id="koobdSound-${key}" min="0" max="100" step="5" data-key="${key}" data-no-click-sound aria-describedby="koobdSoundHint-${key}">`;
    // A mix row: its icon, name and what it covers, its level, the slider and a test.
    const row = (key, label, hint, preview) => `
      <li class="koobd-sound-row" data-row="${key}">
        <span class="koobd-sound-kind" aria-hidden="true">${ICONS[key]}</span>
        <div class="koobd-sound-main">
          <div class="koobd-sound-label">
            <label for="koobdSound-${key}">${label}</label>
            <output for="koobdSound-${key}" data-value="${key}"></output>
          </div>
          <span class="koobd-sound-hint" id="koobdSoundHint-${key}">${hint}</span>
          <div class="koobd-sound-control">
            ${slider(key)}
            <button type="button" class="koobd-sound-test" data-preview="${preview}" data-no-click-sound aria-label="Play a test of ${label.toLowerCase()}">${PLAY}<span>Test</span></button>
          </div>
        </div>
      </li>`;
    dialog.innerHTML = `
      <form method="dialog" class="koobd-sound-card">
        <header class="koobd-sound-head">
          <div>
            <h2 id="koobdSoundTitle">Sound settings</h2>
            <p>Saved to your account and heard right away.</p>
          </div>
          <button type="submit" class="koobd-sound-x" aria-label="Close" data-click-sound="close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </header>

        <section class="koobd-sound-master" data-row="master" aria-label="Master volume">
          <div class="koobd-sound-master-top">
            <span class="koobd-sound-master-icon" aria-hidden="true">${ICON_SPEAKER}</span>
            <div class="koobd-sound-master-text">
              <label for="koobdSound-master">Master volume</label>
              <span id="koobdSoundHint-master" data-switch-text></span>
            </div>
            <label class="koobd-sound-switch">
              <input type="checkbox" role="switch" data-mute data-no-click-sound aria-label="Sound on">
              <span class="koobd-sound-track" aria-hidden="true"></span>
            </label>
          </div>
          <div class="koobd-sound-control is-master">
            ${slider('master')}
            <output for="koobdSound-master" data-value="master"></output>
            <button type="button" class="koobd-sound-test is-icon" data-preview="all" data-no-click-sound aria-label="Play a test of all sound">${PLAY}</button>
          </div>
        </section>

        <h3 class="koobd-sound-group">Mix</h3>
        <ul class="koobd-sound-rows">
          ${row('music', 'Background music', 'Pages, stories and matches', 'music')}
          ${row('sfx', 'Sound effects', 'Characters, weather and games', 'sfx')}
          ${row('ui', 'Interface clicks', 'Buttons, menus and tabs', 'ui')}
        </ul>

        <footer class="koobd-sound-foot">
          <button type="button" class="koobd-sound-reset" data-reset><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 102.3-5.7M4 4v4h4"/></svg>Restore defaults</button>
          <button type="submit" class="koobd-sound-done" data-click-sound="confirm">Done</button>
        </footer>
      </form>`;
    document.body.appendChild(dialog);
    dialog.querySelectorAll('input[type="range"]').forEach((input) => {
      input.addEventListener('input', () => { setPrefs({ [input.dataset.key]: Number(input.value), muted: false }, false); refreshPanel(); });
      input.addEventListener('change', () => { setPrefs({}, true); if (input.dataset.key === 'ui') play('ui', 'click'); });
    });
    dialog.querySelector('[data-mute]').addEventListener('change', (event) => { setPrefs({ muted: !event.target.checked }); refreshPanel(); if (event.target.checked) play('ui', 'toggle'); });
    dialog.querySelector('[data-reset]').addEventListener('click', () => { setPrefs({ ...DEFAULTS }); refreshPanel(); play('ui', 'confirm'); });
    dialog.querySelectorAll('[data-preview]').forEach((button) => button.addEventListener('click', () => preview(button.dataset.preview)));
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { if (previewing) stopPreview(); });
    return dialog;
  }
  function refreshPanel() {
    if (!panel) return;
    ['master', 'music', 'sfx', 'ui'].forEach((key) => {
      panel.querySelector(`[data-key="${key}"]`).value = prefs[key];
      panel.querySelector(`[data-value="${key}"]`).textContent = prefs[key] === 0 ? 'Off' : `${prefs[key]}%`;
      panel.querySelector(`[data-row="${key}"]`).style.setProperty('--fill', `${prefs[key]}%`);
    });
    panel.querySelector('[data-mute]').checked = !prefs.muted;
    panel.querySelector('[data-switch-text]').textContent = prefs.muted ? "Sound is off. KOOB'D is silent." : "Everything in KOOB'D";
    panel.classList.toggle('is-muted', prefs.muted);
    // Muted: the volumes wait, untouched, until sound is back on.
    panel.querySelectorAll('input[type="range"], .koobd-sound-test').forEach((control) => { control.disabled = prefs.muted; });
  }
  // Test buttons: a moment of music, a few effects, or a click.
  let previewing = null;
  function stopPreview() {
    if (!previewing) return;
    window.clearTimeout(previewing.timer);
    if (previewing.restore !== undefined) { wantedMusic = previewing.restore; applyMusic(0.6); }
    previewing = null;
  }
  function preview(kind) {
    unlock();
    window.setTimeout(() => {
      if (!ready()) return;
      if (kind === 'ui') { play('ui', 'click'); window.setTimeout(() => play('ui', 'confirm'), 250); return; }
      if (kind === 'sfx' || kind === 'all') {
        play('sfx', 'jump');
        window.setTimeout(() => play('sfx', 'land', { surface: 'grass' }), 380);
        window.setTimeout(() => play('sfx', 'collect'), 760);
      }
      if (kind === 'music' || (kind === 'all' && !current && !fileMusic)) {
        stopPreview();
        const playingNow = current || fileMusic;
        if (playingNow) return;   // the page's own music is the test
        previewing = { restore: wantedMusic };
        wantedMusic = { id: 'home' };
        applyMusic(0.4);
        previewing.timer = window.setTimeout(stopPreview, 6000);
      }
    }, 60);
  }

  // --- The manager -------------------------------------------------------------------------------------

  window.KoobdAudio = {
    sfx: (name, options) => play('sfx', name, options || {}),
    ui: (name) => play('ui', name || 'click'),
    music(id, options = {}) {
      note(`music ${id}`);
      wantedMusic = id && TRACKS[id] ? { id } : null;
      applyMusic(options.fade ?? 1.4);
    },
    musicFile(url, volume = 0.7, options = {}) {
      note(`file ${url}`);
      wantedMusic = url ? { file: url, volume } : null;
      applyMusic(options.fade ?? 1.4);
    },
    stopMusic(fade = 1.2) { note('stop music'); wantedMusic = null; applyMusic(fade); },
    ambience(layers, options) { note(`ambience ${JSON.stringify(layers)}`); ambience(layers, options); },
    get requests() { return requests.slice(); },
    // A story pausing (its pause menu) fades its music and surroundings out
    // (clicks in the menu still sound); resume brings them back.
    pause() { paused = true; applyLevels(); pauseFileMusic(); },
    resume() { paused = false; applyLevels(); if (!document.hidden) resumeFileMusic(); },
    bindMedia,
    level,
    get prefs() { return { ...prefs }; },
    setPrefs,
    openSettings,
    tracks: STORY_TRACKS.map((id) => ({ id, name: TRACKS[id].name })),
    effects: ['chime', 'bell', 'door', 'knock', 'magic', 'whoosh', 'splash', 'thunder', 'pop', 'sparkle', 'success', 'fail', 'footsteps', 'eagle', 'snore', 'cheer'],
    weather: ['rain', 'wind', 'thunder', 'water', 'birds', 'crickets', 'fire'],
    // Names for the story editors.
    labels: {
      effects: { chime: 'Chime', bell: 'Big bell', door: 'Creaky door', knock: 'Knock knock', magic: 'Magic sparkle', whoosh: 'Whoosh', splash: 'Splash', thunder: 'Thunderclap', pop: 'Pop', sparkle: 'Twinkle', success: 'Success', fail: 'Oops', footsteps: 'Footsteps', eagle: 'Bird cry', snore: 'Snoring', cheer: 'Crowd cheering' },
      weather: { rain: 'Rain', wind: 'Wind', thunder: 'Thunder (now and then)', water: 'Flowing water', birds: 'Birds', crickets: 'Crickets (night)', fire: 'Crackling fire' },
      surfaces: { auto: 'What they stand on', grass: 'Grass', dirt: 'Dirt path', stone: 'Stone', wood: 'Wood', sand: 'Sand', snow: 'Snow' }
    },
    // Editors' "Listen" buttons: a track for a few seconds, an effect, a weather layer.
    previewMusic(id, seconds = 8) {
      stopPreview();
      if (!TRACKS[id]) return;
      previewing = { restore: wantedMusic };
      wantedMusic = { id };
      applyMusic(0.4);
      previewing.timer = window.setTimeout(stopPreview, seconds * 1000);
    },
    previewWeather(layers, seconds = 6) {
      const before = ambienceWanted;
      ambience(layers, { fade: 0.6 });
      window.setTimeout(() => { ambienceWanted = before; applyAmbience(0.8); }, seconds * 1000);
    },
    hasTrack: (id) => Boolean(TRACKS[id]),
    get ready() { return ready(); },
    // What is sounding now (for checks and the editors' previews).
    get status() {
      return { context: ctx ? ctx.state : 'none', music: current ? current.id : (fileMusic ? 'file' : null), ambience: Object.keys(ambienceLayers).filter((name) => ambienceLayers[name].target > 0) };
    }
  };
  // Leaving the page: remember where the music was; the next page carries on.
  window.addEventListener('pagehide', () => {
    if (current) { try { sessionStorage.setItem(MUSIC_KEY, JSON.stringify({ id: current.id, at: Date.now() - (current.step * (60 / current.track.bpm / 4)) * 1000 })); } catch (error) { /* fine */ } }
  });
  // Signing out or in: the next person starts from their own settings.
  if (['log.php', 'sign.php', 'teacher_login.php', 'index.php'].includes(page)) { try { sessionStorage.removeItem(MUSIC_KEY); } catch (error) { /* fine */ } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addMenuItems); else addMenuItems();
})();
