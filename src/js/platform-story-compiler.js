// Turns a Platform Mode page, as the story editor saves it, into the world the
// platform engine (js/platformer-story-player.js) plays - the same kind of
// world The False Knight is written as. The editor's preview and the real
// readers both use this, so a stage always plays exactly as it was built.
//
// Page model (page.platformer, version 3):
//   width            stage length in units (1000 = about ten screens; >= 1000)
//   player {x, y}    where the player starts (y: height above the ground)
//   background {id | asset, color, tint}
//   ground {material, color, asset, gaps: [{from, to, fill: water | chasm}]}
//   music {asset, volume}
//   objects [...]    block   {material, x, y, cols, rows}         (tiles, solid)
//                    image   {asset | prop | hazard, x, y, w, h, rotation, flip,
//                             solid, hazard, layer, anim, light, box}  (a picture;
//                             box: hand-set hitbox as fractions of the picture)
//                    legacy  {type, x, y, w, h, rotation, color}   (older blocks)
//   characters [...] {id, art | upload, sheet, name, x, feet, scale, behavior,
//                     talk, appear, leave}
//   checkpoints [{id, x}]
//   events [...]     {id, label, trigger {type: start | reach | talk, x, character},
//                     optional, cutscene {focus, holdCamera}, beats [...],
//                     after {type: continue | page | end, page, label}}
//   beat: {type: narration | dialogue | title | frame | choices, speaker, text,
//          image, video, audio, transition, choices: [{text, goto}]}
// Units: x across the stage, y down from the top of a 300-unit-tall world whose
// walkable ground is at y = 282. Objects are positioned by their centre.
(function () {
  const LIB = () => window.KoobdPlatformLibrary;
  const GROUND_Y = 282;
  const TILE_X = 4.5;
  const TILE_Y = 8;
  const url = (path) => (LIB() ? LIB().url(path) : encodeURI(String(path || '')));
  const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function tilesOf(tiles) {
    if (!tiles) return null;
    const out = {};
    Object.keys(tiles).forEach((key) => { out[key] = url(tiles[key]); });
    return out;
  }

  // Older (version 1-2) pages: blocks, catalog NPCs with talk, player, ground.
  function upgrade(scene, page = {}) {
    const raw = scene && typeof scene === 'object' ? scene : {};
    if (Number(raw.v) >= 3) return raw;
    const yShift = Number(raw.v || 1) < 2 ? 200 : 0;
    const legacyChars = (LIB() && LIB().legacyCharacters) || {};
    return {
      v: 3,
      width: 1000,
      player: { x: num(raw.player?.x, 14), y: num(raw.player?.y, 0) },
      background: { asset: page.backgroundAsset || '', legacy: page.background || '', color: page.backgroundColor || '#72c6ec', tint: 'day' },
      ground: raw.groundAsset
        ? { material: 'custom', asset: raw.groundAsset, color: raw.groundColor || '#557d2e', gaps: [] }
        : { material: 'none', color: raw.groundColor || '#557d2e', gaps: [] },
      music: null,
      objects: (Array.isArray(raw.platforms) ? raw.platforms : []).map((platform, index) => ({
        id: String(platform.id || `block-${index + 1}`),
        kind: 'legacy',
        type: platform.type || 'block1',
        x: num(platform.x, 50),
        y: num(platform.y, 72) + yShift,
        w: num(platform.width, 28),
        h: num(platform.height, 7),
        rotation: num(platform.rotation, 0),
        color: platform.color || '',
      })),
      characters: (Array.isArray(raw.npcs) ? raw.npcs : []).map((npc, index) => ({
        id: String(npc.id || `npc-${index + 1}`),
        art: legacyChars[npc.character] || npc.character || 'profile-cubebot',
        name: npc.name || '',
        x: num(npc.x, 60),
        feet: num(npc.y, 0),
        scale: 1,
        behavior: { type: 'stand' },
        talk: (Array.isArray(npc.dialogue) ? npc.dialogue : []).map((turn) => ({
          speaker: turn.speaker === 'player' ? 'player' : 'npc',
          text: String(turn.text || ''),
          choices: Array.isArray(turn.choices) ? turn.choices.map((choice) => ({ text: choice.text, goto: { type: 'continue' } })) : [],
        })),
      })),
      checkpoints: [],
      // The page's own lines (title, narration, dialogue) played as it opens.
      events: (() => {
        const beats = (Array.isArray(page.elements) ? page.elements : [])
          .filter((element) => String(element.text || '').trim())
          .map((element) => (element.type === 'title'
            ? { type: 'title', text: element.text }
            : { type: 'narration', text: element.type === 'dialogue' && element.speaker ? `${element.speaker}: ${element.text}` : element.text }));
        return beats.length ? [{ id: 'page-lines', trigger: { type: 'start' }, beats }] : [];
      })(),
    };
  }

  // A character's art: a library character, or an uploaded picture (a still
  // image or GIF, or a sprite sheet in the 32x46 KoobD layout).
  function artOf(character) {
    const lib = LIB();
    const libChar = lib && character.art ? lib.get('characters', character.art) : null;
    if (libChar) {
      return {
        asset: url(libChar.portrait),
        animationAsset: libChar.animated ? url(libChar.sheet) : '',
        still: Boolean(character.still),
        scale: num(character.scale, libChar.scale || 1),
        label: libChar.label,
      };
    }
    if (character.upload) {
      return {
        asset: url(character.portrait || character.upload),
        animationAsset: character.sheet ? url(character.upload) : '',
        still: Boolean(character.still),
        scale: num(character.scale, 1),
        label: 'Character',
      };
    }
    return { asset: '', animationAsset: '', scale: 1, label: 'Character' };
  }

  function compileGround(scene, width) {
    const lib = LIB();
    const ground = scene.ground || {};
    const gaps = (Array.isArray(ground.gaps) ? ground.gaps : [])
      .map((gap) => ({ from: clamp(num(gap.from), 0, width), to: clamp(num(gap.to), 0, width), fill: gap.fill === 'chasm' ? 'chasm' : 'water' }))
      .filter((gap) => gap.to - gap.from >= 2)
      .sort((a, b) => a.from - b.from);
    const surface = (() => {
      if (ground.material === 'custom' && ground.asset) return { asset: url(ground.asset), color: ground.color, tile: true };
      const def = lib ? lib.get('grounds', ground.material) : null;
      if (def && def.tiles) return { tiles: tilesOf(def.tiles), tileWidth: TILE_X, tileHeight: TILE_Y };
      // A plain coloured ground: a flat strip of the chosen colour.
      const color = /^#[0-9a-f]{6}$/i.test(String(ground.color || '')) ? ground.color : '#557d2e';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="${color}"/></svg>`;
      return { asset: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, color, tile: true };
    })();
    const segments = [];
    let from = 0;
    gaps.forEach((gap) => {
      if (gap.from > from) segments.push({ x: from, width: gap.from - from, ...surface });
      segments.push({ x: gap.from, width: gap.to - gap.from, fill: gap.fill, solid: false });
      from = Math.max(from, gap.to);
    });
    if (from < width) segments.push({ x: from, width: width - from, ...surface });
    return segments;
  }

  function compileBackground(scene, width) {
    const lib = LIB();
    const bg = scene.background || {};
    const def = lib && bg.id ? lib.get('backgrounds', bg.id) : null;
    const color = /^#[0-9a-f]{6}$/i.test(String(bg.color || '')) ? bg.color : (def ? def.color : '#72c6ec');
    if (def) {
      return [{ x: 0, width, assets: def.layers.map(url), color, groundLine: 0.8, worldAligned: Boolean(def.worldAligned), wholeCopies: Boolean(def.wholeCopies) }];
    }
    // An uploaded picture sits like the library scenery: its bottom edge at the
    // bottom of the screen, repeated along the stage.
    if (bg.asset) return [{ x: 0, width, assets: [url(bg.asset)], color, groundLine: 0.82, worldAligned: true }];
    return [{ x: 0, width, color }];
  }

  function compileObjects(scene) {
    const lib = LIB();
    const platforms = [];
    const decor = [];
    (Array.isArray(scene.objects) ? scene.objects : []).forEach((object, index) => {
      const id = `obj-${object.id || index + 1}`;
      if (object.kind === 'block') {
        const material = lib ? lib.get('materials', object.material) : null;
        if (!material) return;
        const cols = clamp(Math.round(num(object.cols, 2)), 1, 200);
        const rows = clamp(Math.round(num(object.rows, 1)), 1, 40);
        const tiles = tilesOf(material.tiles);
        platforms.push({
          id, type: 'block1', tiles, tileWidth: TILE_X, tileHeight: TILE_Y,
          x: num(object.x), y: num(object.y), width: cols * TILE_X, height: rows * TILE_Y, rotation: 0,
          ...(material.solid ? { solid: material.solid } : {}),
        });
        return;
      }
      if (object.kind === 'legacy') {
        platforms.push({
          id, type: object.type || 'block1', x: num(object.x), y: num(object.y),
          width: num(object.w, 28), height: num(object.h, 7), rotation: num(object.rotation), color: object.color || '',
        });
        return;
      }
      if (object.kind !== 'image') return;
      const prop = lib && object.prop ? lib.get('props', object.prop) : null;
      const hazardDef = lib && object.hazardId ? lib.get('hazards', object.hazardId) : null;
      const src = object.asset || (prop && prop.src) || (hazardDef && hazardDef.src) || '';
      if (!src) return;
      const h = Math.max(0.5, num(object.h, 10));
      const w = Math.max(0.5, num(object.w, h));
      if (object.hazard || object.solid) {
        platforms.push({
          id, type: 'block1', imageAsset: url(src),
          x: num(object.x), y: num(object.y), width: w, height: h, rotation: num(object.rotation),
          flip: Boolean(object.flip), hazard: Boolean(object.hazard), anim: object.anim || (hazardDef && hazardDef.anim) || '',
          // KoobD's own art is pixel art (kept crisp); uploads are drawn smoothly.
          pixelArt: !/^uploads\//.test(src),
          // A hand-set hitbox replaces the one traced from the picture.
          ...(object.box ? { box: { left: num(object.box.left), top: num(object.box.top), right: num(object.box.right, 1), bottom: num(object.box.bottom, 1) } } : {}),
        });
        return;
      }
      const item = {
        x: num(object.x), feet: GROUND_Y - (num(object.y) + h / 2), h,
        layer: ['far', 'back', 'front'].includes(object.layer) ? object.layer : 'back',
        flip: Boolean(object.flip), light: Boolean(object.light), smooth: /^uploads\//.test(src),
        ...(num(object.rotation) ? { rotation: num(object.rotation) } : {}),
      };
      if (prop && prop.flower) {
        decor.push({ ...item, stem: url(prop.stem), flower: url(prop.src) });
        return;
      }
      if (object.anim && object.anim !== 'none') {
        item.anim = object.anim;
        item.duration = { sway: 3.2, banner: 4, flicker: 0.9, float: 5, glow: 2.4, drift: 14, spin: 2 }[object.anim] || 3;
      }
      decor.push({ ...item, asset: url(src) });
    });
    return { platforms, decor };
  }

  // A beat of a story event, as one of the engine's dialogue turns.
  function compileBeat(beat, ctx) {
    const audio = beat.audio ? url(beat.audio) : '';
    const base = audio ? { audio } : {};
    const choicesOf = (list) => (Array.isArray(list) ? list : [])
      .filter((choice) => String(choice.text || '').trim())
      .map((choice) => ({ text: String(choice.text).trim(), goto: ctx.goto(choice.goto) }));
    if (beat.type === 'title') {
      const font = beat.font && LIB() ? LIB().get('fonts', beat.font) : null;
      return { speaker: 'narrator', type: 'title', text: String(beat.text || ''), choices: [], ...(font && font.stack ? { font: font.stack } : {}), ...(beat.size ? { size: String(beat.size) } : {}), ...(beat.rich ? { rich: String(beat.rich) } : {}), ...base };
    }
    if (beat.type === 'frame') {
      const image = beat.image ? url(beat.image) : '';
      const video = beat.video ? url(beat.video) : '';
      if (!image && !video) return null;
      return { speaker: 'narrator', type: 'frame', text: '', image, video, transition: beat.transition || 'crossfade', choices: [], ...base };
    }
    const speaker = ctx.speakerOf(beat.speaker);
    const text = String(beat.text || '').trim();
    const choices = beat.type === 'choices' ? choicesOf(beat.choices) : [];
    if (!text && !choices.length) return null;
    return { speaker, type: 'dialogue', text, choices, ...(beat.rich ? { rich: String(beat.rich) } : {}), ...base };
  }

  // `options`: { pageKeys: [keys in page order] } - used to check page links.
  function compile(page, options = {}) {
    const scene = upgrade(page && page.platformer, page || {});
    const width = Math.max(1000, Math.round(num(scene.width, 1000)));
    const { platforms, decor } = compileObjects(scene);
    const characters = Array.isArray(scene.characters) ? scene.characters : [];
    const events = Array.isArray(scene.events) ? scene.events : [];
    const charById = new Map(characters.map((character) => [String(character.id), character]));
    const npcId = (id) => `char-${id}`;
    const eventId = (id) => `event-${id}`;
    const pageKeys = Array.isArray(options.pageKeys) ? options.pageKeys : null;

    const ctx = {
      // Where a choice or an event leads: on through the story, to a page, or the end.
      goto(target) {
        const type = target && target.type;
        if (type === 'page' && target.page && (!pageKeys || pageKeys.includes(target.page))) return { type: 'page', page: target.page };
        if (type === 'end') return { type: 'end', label: String(target.label || '') };
        return { type: 'continue' };
      },
      speakerOf(speaker) {
        if (!speaker || speaker === 'narrator') return 'narrator';
        if (speaker === 'player') return 'player';
        return charById.has(String(speaker)) ? npcId(speaker) : 'narrator';
      },
    };

    const speakerModels = {};
    characters.forEach((character) => {
      const art = artOf(character);
      speakerModels[npcId(character.id)] = { name: character.name || art.label, asset: art.asset, animationAsset: art.animationAsset, scale: art.scale };
    });

    const storyEvents = [];
    events.forEach((event, index) => {
      const turns = (Array.isArray(event.beats) ? event.beats : []).map((beat) => compileBeat(beat, ctx)).filter(Boolean);
      if (!turns.length) return;
      const trigger = event.trigger || {};
      const talker = trigger.type === 'talk' ? charById.get(String(trigger.character)) : null;
      const compiled = {
        id: eventId(event.id || index + 1),
        name: talker ? (talker.name || artOf(talker).label) : 'Narrator',
        asset: talker ? artOf(talker).asset : '',
        turns,
      };
      if (talker) {
        compiled.x = num(talker.x);
        compiled.npcId = npcId(talker.id);
        compiled.requiresInteraction = true;
        compiled.manual = true;
        if (event.optional) compiled.optional = true;
      } else {
        compiled.x = trigger.type === 'reach' ? num(trigger.x) : 0;
        compiled.requiresInteraction = false;
      }
      const focus = (event.cutscene && Array.isArray(event.cutscene.focus) ? event.cutscene.focus : [])
        .filter((id) => charById.has(String(id))).map(npcId);
      if (focus.length) compiled.cutscene = { focus, holdCamera: Boolean(event.cutscene.holdCamera) };
      const after = ctx.goto(event.after);
      if (after.type === 'end') compiled.endsStory = true;
      if (after.type !== 'continue') compiled.goto = after;
      storyEvents.push(compiled);
    });
    // The engine plays story events one after another, by position.
    const validEventIds = new Set(storyEvents.map((event) => event.id));

    const npcs = characters.map((character) => {
      const art = artOf(character);
      const behavior = character.behavior || {};
      const npc = {
        id: npcId(character.id),
        name: character.name || art.label,
        x: num(character.x, 60),
        y: num(character.feet, 0),
        asset: art.asset,
        animationAsset: art.animationAsset,
        scale: art.scale,
        ...(art.animationAsset && art.still ? { still: true } : {}),
        dialogue: (Array.isArray(character.talk) ? character.talk : [])
          .filter((line) => String(line.text || '').trim())
          .map((line) => ({ speaker: line.speaker === 'player' ? 'player' : 'npc', text: String(line.text).trim(), choices: [] })),
      };
      if (behavior.type === 'stand') npc.routine = { type: 'stand' };
      else if (behavior.type === 'pace') {
        const span = clamp(num(behavior.radius, 20), 4, 200);
        npc.routine = { type: 'patrol', from: npc.x - span, to: npc.x + span, pause: 0.8 };
      } else if (behavior.type === 'follow') npc.follow = {};
      else npc.wanderRadius = clamp(num(behavior.radius, 20), 0, 200);
      if (num(behavior.speed) > 0) npc.speed = clamp(num(behavior.speed), 4, 60);
      const acts = storyEvents.filter((event) => event.npcId === npc.id).map((event) => event.id);
      if (acts.length) npc.actsIn = acts;
      const appear = character.appear && validEventIds.has(eventId(character.appear.event)) ? character.appear : null;
      if (appear) npc.appear = { event: eventId(appear.event), at: appear.at === 'end' ? 'current' : 'start' };
      const leave = character.leave && validEventIds.has(eventId(character.leave.event)) ? character.leave : null;
      if (leave) {
        const action = ['walk', 'run', 'hide'].includes(leave.action) ? leave.action : 'walk';
        npc.leave = { event: eventId(leave.event), action, toX: num(leave.toX, npc.x + 40), fade: action !== 'hide' };
      }
      // A character with nothing scripted and no animation simply stands.
      if (!npc.animationAsset && !npc.routine && !npc.follow) npc.wanderRadius = 0;
      return npc;
    });

    const bgDef = LIB() && scene.background && scene.background.tint ? LIB().get('tints', scene.background.tint) : null;
    const world = {
      width,
      jumpRise: 21,
      autoTalk: true,
      player: { x: num(scene.player && scene.player.x, 14), y: num(scene.player && scene.player.y, 0) },
      backgroundColor: (compileBackground(scene, width)[0] || {}).color || '#72c6ec',
      backgrounds: compileBackground(scene, width),
      grounds: compileGround(scene, width),
      platforms,
      decor,
      npcs,
      speakerModels,
      storyEvents,
      checkpoints: (Array.isArray(scene.checkpoints) ? scene.checkpoints : []).map((checkpoint, index) => ({ id: `checkpoint-${checkpoint.id || index + 1}`, x: num(checkpoint.x) })),
      scenes: [{ id: 'stage', startX: 0, endX: width, tint: bgDef ? bgDef.filter : '' }],
    };
    if (scene.music && scene.music.asset) world.music = { src: url(scene.music.asset), volume: clamp(num(scene.music.volume, 0.6), 0, 1) };
    if (page && String(page.stageName || '').trim()) {
      world.areas = [{ id: 'stage-name', x: 0, name: String(page.stageName).trim(), time: String(page.stageSubtitle || '').trim() }];
    }
    return world;
  }

  window.KoobdPlatformCompiler = { compile, upgrade, GROUND_Y, TILE_X, TILE_Y };
})();
