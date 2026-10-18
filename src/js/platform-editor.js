// The story editor's Platform Mode editor: a level editor for one Platform
// Mode page, in the spirit of Geometry Dash's editor. Pick a piece in the
// library (blocks, hazards, scenery, characters, your uploads), click the
// stage to place it as many times as you like, then move, resize, rotate,
// flip, duplicate or delete it. The stage is drawn the way the game draws it
// (same tiles, sizes, hitboxes and time-of-day tint), and everything is saved
// as the page model that js/platform-story-compiler.js turns into the game.
//
// The inspector (Selected / Stage / Story events) is in
// js/platform-editor-panels.js; shared form helpers are in js/editor-ui.js.
//
// Units: x runs along the stage (100 = one screen wide); y runs down a world
// 300 units tall (100 = one screen high) whose ground surface is at y = 282.
(function () {
  'use strict';

  const UI = window.KoobdEditorUI;
  const LIB = window.KoobdPlatformLibrary;
  const COMPILER = window.KoobdPlatformCompiler;
  const COLLISION = window.KOOBD_PLATFORMER_COLLISION;
  const { el, icon, iconButton } = UI;

  const GROUND_Y = 282;
  const WORLD_H = 300;
  const TX = LIB.TILE_X;
  const TY = LIB.TILE_Y;
  const Y_PER_X = 0.5625; // a y unit is this many x units on screen (16:9)
  const CHAR_H = 26; // a character's height on screen, in y units (scale 1)
  const PLAYER_H = 22;
  const SHEET_ASPECT = 32 / 46; // sprite sheet frames (width / height)
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 3;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  const r2 = (value) => Math.round(value * 100) / 100;
  const makeId = UI.makeId;
  const url = (path) => LIB.url(path);

  // --- Page model ------------------------------------------------------------

  function newScene() {
    return {
      v: 3,
      width: 1000,
      player: { x: 14, y: 0 },
      background: { id: 'meadow', asset: '', color: '#8fd0ee', tint: 'day' },
      ground: { material: 'earth', color: '#557d2e', asset: '', gaps: [] },
      music: null,
      objects: [],
      characters: [],
      checkpoints: [],
      events: []
    };
  }

  // Brings any saved page (older versions included) up to the current model
  // and fills in anything missing, so the editor can rely on every field.
  function normalizeScene(page, legacyBackgrounds = []) {
    const raw = page.platformer && typeof page.platformer === 'object' ? page.platformer : null;
    const scene = raw ? COMPILER.upgrade(raw, page) : newScene();
    scene.v = 3;
    scene.width = clamp(Math.round(num(scene.width, 1000) / 100) * 100, 1000, 4000);
    scene.player = { x: num(scene.player && scene.player.x, 14), y: Math.max(0, num(scene.player && scene.player.y, 0)) };
    const bg = scene.background && typeof scene.background === 'object' ? scene.background : {};
    if (bg.legacy && !bg.asset) {
      const legacy = legacyBackgrounds.find((item) => item.id === bg.legacy);
      if (legacy) bg.asset = legacy.asset;
    }
    scene.background = {
      id: LIB.get('backgrounds', bg.id) ? bg.id : '',
      asset: String(bg.asset || ''),
      color: /^#[0-9a-f]{6}$/i.test(String(bg.color || '')) ? bg.color : '#8fd0ee',
      tint: LIB.get('tints', bg.tint) ? bg.tint : 'day'
    };
    const ground = scene.ground && typeof scene.ground === 'object' ? scene.ground : {};
    scene.ground = {
      material: ground.material === 'custom' || LIB.get('grounds', ground.material) ? ground.material : 'earth',
      color: /^#[0-9a-f]{6}$/i.test(String(ground.color || '')) ? ground.color : '#557d2e',
      asset: String(ground.asset || ''),
      gaps: (Array.isArray(ground.gaps) ? ground.gaps : []).map((gap) => ({
        id: String(gap.id || makeId('gap')), from: num(gap.from), to: num(gap.to), fill: gap.fill === 'chasm' ? 'chasm' : 'water'
      }))
    };
    if (scene.ground.material === 'custom' && !scene.ground.asset) scene.ground.material = 'earth';
    scene.music = scene.music && scene.music.asset ? { asset: String(scene.music.asset), volume: clamp(num(scene.music.volume, 0.6), 0, 1) } : null;
    scene.objects = (Array.isArray(scene.objects) ? scene.objects : []).filter((object) => object && ['block', 'image', 'legacy'].includes(object.kind));
    scene.objects.forEach((object) => { object.id = String(object.id || makeId('obj')); });
    scene.characters = (Array.isArray(scene.characters) ? scene.characters : []).filter(Boolean).map((character) => ({
      ...character,
      id: String(character.id || makeId('char')),
      name: String(character.name || ''),
      x: num(character.x, 60),
      feet: num(character.feet, 0),
      scale: clamp(num(character.scale, (LIB.get('characters', character.art) || {}).scale || 1), 0.4, 2.5),
      behavior: { type: 'stand', radius: 20, speed: 0, ...(character.behavior || {}) },
      talk: Array.isArray(character.talk) ? character.talk : []
    }));
    scene.checkpoints = (Array.isArray(scene.checkpoints) ? scene.checkpoints : []).map((checkpoint) => ({ id: String(checkpoint.id || makeId('cp')), x: num(checkpoint.x) }));
    scene.events = (Array.isArray(scene.events) ? scene.events : []).filter(Boolean).map((event) => ({
      id: String(event.id || makeId('ev')),
      label: String(event.label || ''),
      trigger: { type: 'start', x: 0, character: '', ...(event.trigger || {}) },
      optional: Boolean(event.optional),
      cutscene: { focus: [], holdCamera: false, ...(event.cutscene || {}) },
      beats: (Array.isArray(event.beats) ? event.beats : []).map((beat) => ({ ...beat, id: String(beat.id || makeId('beat')) })),
      after: event.after && event.after.type ? event.after : { type: 'continue' }
    }));
    page.platformer = scene;
    return scene;
  }

  // --- Pictures: natural shape and the hitbox traced from their pixels -------
  const pictures = new Map();
  function pictureInfo(src, onReady) {
    let info = pictures.get(src);
    if (!info) {
      info = { aspect: 0, parts: null, waiting: [] };
      pictures.set(src, info);
      const image = new Image();
      image.onload = () => {
        info.aspect = image.naturalWidth / Math.max(1, image.naturalHeight);
        try { info.parts = COLLISION.readImageParts(image); } catch (error) { info.parts = null; }
        const waiting = info.waiting;
        info.waiting = [];
        waiting.forEach((callback) => callback(info));
      };
      image.onerror = () => { info.aspect = 1; info.waiting = []; };
      image.src = url(src);
    }
    if (info.aspect) return info;
    if (onReady && !info.waiting.includes(onReady)) info.waiting.push(onReady);
    return null;
  }

  // Same tile layout as the game (platformer-story-player.js renderTiles).
  function renderTiles(node, tiles, width, height) {
    const sx = (TX / width) * 100;
    const sy = (TY / height) * 100;
    const layer = (asset, style) => {
      if (!asset) return;
      const part = el('span', { class: 'pe-tile-layer' });
      Object.assign(part.style, style, { backgroundImage: `url('${url(asset)}')` });
      node.appendChild(part);
    };
    layer(tiles.fill, { inset: '0', backgroundSize: `${sx}% ${sy}%`, backgroundRepeat: 'repeat' });
    layer(tiles.fillLeft, { left: '0', top: '0', width: `${sx}%`, height: '100%', backgroundSize: `100% ${sy}%`, backgroundRepeat: 'repeat-y' });
    layer(tiles.fillRight, { right: '0', top: '0', width: `${sx}%`, height: '100%', backgroundSize: `100% ${sy}%`, backgroundRepeat: 'repeat-y' });
    layer(tiles.cap, { left: '0', right: '0', top: '0', height: `${sy}%`, backgroundSize: `${sx}% 100%`, backgroundRepeat: 'repeat-x' });
    layer(tiles.capLeft, { left: '0', top: '0', width: `${sx}%`, height: `${sy}%`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' });
    layer(tiles.capRight, { right: '0', top: '0', width: `${sx}%`, height: `${sy}%`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' });
  }

  // Positions a node by a box in world units (centre x/y, width, height).
  function placeNode(node, box) {
    node.style.left = `calc(var(--ux) * ${r2(box.x - box.w / 2)})`;
    node.style.top = `calc(var(--uy) * ${r2(box.y - box.h / 2)})`;
    node.style.width = `calc(var(--ux) * ${r2(box.w)})`;
    node.style.height = `calc(var(--uy) * ${r2(box.h)})`;
    node.style.transform = box.r ? `rotate(${box.r}deg)` : '';
  }

  // ===========================================================================
  function create(options) {
    const ed = {
      options,
      page: null,
      scene: null,
      active: false,
      ui: {
        tool: 'select',
        armed: null,
        selection: [],
        zoom: 1,
        camX: 0,
        camY: 0,
        snap: true,
        hitboxes: false,
        tab: 'selected',
        activeEventId: null,
        libraryTab: 'blocks',
        librarySearch: '',
        libraryCategory: ''
      },
      clipboard: null
    };
    const nodes = new Map();

    // ---------- Lookups --------------------------------------------------------
    function resolve(ref) {
      if (!ref || !ed.scene) return null;
      if (ref === 'player') return { type: 'player', item: ed.scene.player };
      const [prefix, id] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
      const find = (list) => list.find((item) => String(item.id) === id) || null;
      const item = prefix === 'o' ? find(ed.scene.objects)
        : prefix === 'c' ? find(ed.scene.characters)
          : prefix === 'k' ? find(ed.scene.checkpoints)
            : prefix === 'g' ? find(ed.scene.ground.gaps)
              : prefix === 'e' ? find(ed.scene.events)
                : null;
      if (!item) return null;
      const type = prefix === 'o' ? item.kind : { c: 'character', k: 'checkpoint', g: 'gap', e: 'event' }[prefix];
      return { type, item };
    }
    ed.resolve = resolve;

    function characterArt(character) {
      const libChar = character.art ? LIB.get('characters', character.art) : null;
      // `still`: an animated character that the author set to keep its first pose.
      const still = Boolean(character.still);
      if (libChar) return { src: libChar.portrait, sheet: libChar.animated ? libChar.sheet : '', still, label: libChar.label };
      if (character.upload) return { src: character.portrait || character.upload, sheet: character.sheet ? character.upload : '', still, label: 'Your character' };
      return { src: LIB.get('characters', 'profile-cubebot').portrait, sheet: '', label: 'Character' };
    }
    ed.characterArt = characterArt;

    function imageSrc(object) {
      if (object.asset) return object.asset;
      if (object.prop) return (LIB.get('props', object.prop) || {}).src || '';
      if (object.hazardId) return (LIB.get('hazards', object.hazardId) || {}).src || '';
      return '';
    }
    ed.imageSrc = imageSrc;

    // Scenery keeps its picture's shape; solid and hazard pictures can be stretched.
    function keepsShape(object) {
      return object.kind === 'image' && !object.solid && !object.hazard;
    }

    function charSize(src, sheet, scale, height) {
      const h = height * scale;
      let aspect = SHEET_ASPECT;
      if (!sheet) {
        const info = pictureInfo(src, () => renderWorld());
        aspect = info ? info.aspect : 0.75;
      }
      return { w: h * aspect * Y_PER_X, h };
    }

    // A thing's box in world units: centre x/y, width, height, rotation.
    function boxOf(ref) {
      const found = resolve(ref);
      if (!found) return null;
      const { type, item } = found;
      if (type === 'block') return { x: item.x, y: item.y, w: item.cols * TX, h: item.rows * TY, r: 0 };
      if (type === 'image' || type === 'legacy') return { x: item.x, y: item.y, w: num(item.w, 10), h: num(item.h, 10), r: num(item.rotation) };
      if (type === 'character') {
        const art = characterArt(item);
        const size = charSize(art.src, art.sheet, item.scale || 1, CHAR_H);
        return { x: item.x, y: GROUND_Y - item.feet - size.h / 2, ...size, r: 0 };
      }
      if (type === 'player') {
        const size = charSize(options.playerAsset, '', 1, PLAYER_H);
        return { x: item.x, y: GROUND_Y - item.y - size.h / 2, ...size, r: 0 };
      }
      if (type === 'checkpoint') return { x: item.x, y: GROUND_Y - 8, w: 4, h: 16, r: 0 };
      if (type === 'gap') return { x: (item.from + item.to) / 2, y: GROUND_Y + 9, w: Math.max(1, item.to - item.from), h: 18, r: 0 };
      if (type === 'event') return { x: num(item.trigger.x), y: GROUND_Y - 52, w: 6, h: 10, r: 0 };
      return null;
    }
    ed.boxOf = boxOf;

    // Tops of the surfaces that things can stand on under x (ground and blocks).
    function surfacesAt(x, ignoreRefs = []) {
      const tops = [];
      const inGap = ed.scene.ground.gaps.some((gap) => x > gap.from && x < gap.to);
      if (!inGap) tops.push(GROUND_Y);
      ed.scene.objects.forEach((object) => {
        if (ignoreRefs.includes(`o:${object.id}`)) return;
        const solid = object.kind === 'block' || object.kind === 'legacy' || (object.kind === 'image' && object.solid);
        if (!solid) return;
        const box = boxOf(`o:${object.id}`);
        if (x >= box.x - box.w / 2 && x <= box.x + box.w / 2) tops.push(box.y - box.h / 2);
      });
      return tops;
    }
    function snapBottom(x, bottom, ignoreRefs, range = 3) {
      const near = surfacesAt(x, ignoreRefs).filter((top) => Math.abs(top - bottom) <= range).sort((a, b) => Math.abs(a - bottom) - Math.abs(b - bottom));
      return near.length ? near[0] : bottom;
    }

    // ---------- DOM ------------------------------------------------------------
    const dom = {};
    function toolButton(tool, iconName, label, key) {
      return el('button', {
        type: 'button', class: 'ed-icon-btn pe-tool', dataset: { tool }, title: `${label} (${key})`, 'aria-label': label,
        on: { click: () => setTool(tool) }
      }, [icon(iconName)]);
    }

    function buildStage() {
      const root = options.stageRoot;
      root.replaceChildren();
      dom.zoomLabel = el('output', { class: 'pe-zoom-label', text: '100%' });
      dom.snapBtn = iconButton('magnet', 'Snap to grid', () => { ed.ui.snap = !ed.ui.snap; renderToolbar(); }, { class: 'pe-toggle', title: 'Snap to the tile grid and to the ground (hold Alt while dragging to place freely)' });
      dom.hitboxBtn = iconButton('hitbox', 'Show hitboxes', () => { ed.ui.hitboxes = !ed.ui.hitboxes; renderToolbar(); renderHitboxes(); }, { class: 'pe-toggle', title: 'Show hitboxes: green = solid, red = hazard, purple = characters, blue = player' });
      dom.editButtons = [
        iconButton('duplicate', 'Duplicate', () => duplicateSelection(), { title: 'Duplicate (Ctrl+D)' }),
        iconButton('rotateLeft', 'Rotate left', () => rotateSelection(-15), { title: 'Rotate left 15° (Shift+R)' }),
        iconButton('rotateRight', 'Rotate right', () => rotateSelection(15), { title: 'Rotate right 15° (R)' }),
        iconButton('flip', 'Flip', () => flipSelection(), { title: 'Flip (F)' }),
        iconButton('front', 'Bring forward', () => restackSelection(1), { title: 'Bring forward (])' }),
        iconButton('back', 'Send backward', () => restackSelection(-1), { title: 'Send backward ([)' }),
        iconButton('trash', 'Delete', () => deleteSelection(), { class: 'is-danger', title: 'Delete (Delete key)' })
      ];
      dom.toolbar = el('div', { class: 'pe-toolbar', role: 'toolbar', 'aria-label': 'Stage tools' }, [
        el('div', { class: 'pe-tool-group' }, [
          toolButton('select', 'select', 'Select and move', 'V'),
          toolButton('pan', 'pan', 'Move around the stage', 'H'),
          toolButton('gap', 'gap', 'Cut a gap in the ground (drag along the ground)', 'G'),
          toolButton('checkpoint', 'flag', 'Place a checkpoint', 'C')
        ]),
        el('div', { class: 'pe-tool-group' }, dom.editButtons),
        el('div', { class: 'pe-tool-group' }, [
          dom.snapBtn,
          dom.hitboxBtn,
          iconButton('zoomOut', 'Zoom out', () => zoomBy(1 / 1.25)),
          dom.zoomLabel,
          iconButton('zoomIn', 'Zoom in', () => zoomBy(1.25)),
          iconButton('fit', 'Show the whole stage', () => fitStage())
        ]),
        el('div', { class: 'pe-tool-group' }, [
          iconButton('settings', 'Stage settings', () => window.KoobdPlatformEditor.panels.openStage(ed), { title: 'Stage settings: background, time of day, ground, length, music, checkpoints' })
        ]),
        el('div', { class: 'pe-tool-spacer' }),
        el('button', { type: 'button', class: 'ed-btn ed-btn-primary pe-test-btn', on: { click: () => options.onTest && options.onTest() } }, [icon('play'), el('span', { text: 'Test this page' })]),
        // Full screen (js/editor-fullscreen.js); the same button leaves it. Last
        // in the toolbar and pinned to its end, so it stays in reach when the
        // toolbar scrolls sideways on a phone.
        window.KoobdEditorFullscreen ? window.KoobdEditorFullscreen.createButton('ed-icon-btn pe-fullscreen-btn') : null
      ].filter(Boolean));
      dom.world = el('div', { class: 'pe-world' });
      dom.tinted = el('div', { class: 'pe-tinted' });
      dom.sky = el('div', { class: 'pe-sky' });
      dom.far = el('div', { class: 'pe-layer' });
      dom.back = el('div', { class: 'pe-layer' });
      dom.blocks = el('div', { class: 'pe-layer' });
      dom.ground = el('div', { class: 'pe-layer' });
      dom.markers = el('div', { class: 'pe-layer' });
      dom.chars = el('div', { class: 'pe-layer' });
      dom.front = el('div', { class: 'pe-layer pe-layer-front' });
      dom.hitboxes = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      dom.hitboxes.classList.add('pe-hitboxes');
      dom.hitboxes.setAttribute('preserveAspectRatio', 'none');
      dom.overlay = el('div', { class: 'pe-layer pe-overlay' });
      dom.tinted.append(dom.sky, dom.far, dom.back, dom.blocks, dom.ground);
      dom.world.append(dom.tinted, dom.markers, dom.chars, dom.front, dom.hitboxes, dom.overlay);
      dom.ghost = el('div', { class: 'pe-ghost hidden' });
      dom.marquee = el('div', { class: 'pe-marquee hidden' });
      dom.hint = el('div', { class: 'pe-stage-hint hidden', role: 'status' });
      dom.stage = el('div', { class: 'pe-stage', tabindex: '0', 'aria-label': 'Stage. Click a piece to select it; drag empty space to move around; Ctrl + scroll to zoom.' }, [dom.world, dom.ghost, dom.marquee, dom.hint]);
      buildLine();
      dom.minimap = el('div', { class: 'pe-minimap', 'aria-label': 'Whole stage overview. Click or drag to move around.' });
      root.append(dom.toolbar, dom.stage, dom.minimap);
      bindStage();
      bindMinimap();
      if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (ed.active) applyCamera(); }).observe(dom.stage);
    }

    // ---------- The line being written, shown on the stage ----------------------
    // While a story event is open, its line (narration, dialogue, a title or a
    // question) shows on the stage as the reader will see it, and can be
    // written in and formatted right there (js/rich-text.js). The same line's
    // text box in the inspector follows along.
    const TEXT_BEATS = ['narration', 'dialogue', 'title', 'choices'];
    function buildLine() {
      dom.lineName = el('div', { class: 'pe-stage-line-name', translate: 'no' });
      dom.lineText = el('div', { class: 'pe-stage-line-text' });
      dom.lineLabel = el('span', { class: 'pe-stage-line-label' });
      dom.line = el('div', { class: 'pe-stage-line hidden' }, [
        el('div', { class: 'pe-stage-line-head' }, [
          dom.lineLabel,
          iconButton('close', 'Hide the line preview', () => { ed.ui.lineHidden = true; renderLine(); }, { class: 'pe-stage-line-close' })
        ]),
        el('div', { class: 'pe-stage-line-box' }, [dom.lineName, dom.lineText])
      ]);
      // Writing here never moves, selects or zooms the stage.
      ['pointerdown', 'dblclick', 'contextmenu', 'wheel'].forEach((type) => dom.line.addEventListener(type, (event) => event.stopPropagation()));
      dom.lineEdit = window.KoobdRichText ? window.KoobdRichText.attach(dom.lineText) : null;
      dom.stage.appendChild(dom.line);
    }
    function speakerName(id) {
      if (id === 'narrator') return '';
      if (id === 'player') return 'You';
      const character = ed.scene.characters.find((item) => item.id === id);
      return character ? character.name || ed.characterArt(character).label : '';
    }
    function renderLine() {
      if (!dom.line) return;
      const event = ed.ui.tab === 'events' && ed.scene ? ed.scene.events.find((item) => item.id === ed.ui.activeEventId) : null;
      const lines = event ? event.beats.filter((beat) => TEXT_BEATS.includes(beat.type)) : [];
      const beat = lines.find((item) => item.id === ed.ui.activeBeatId) || lines[0];
      dom.line.classList.toggle('hidden', !beat || Boolean(ed.ui.lineHidden) || !dom.lineEdit);
      if (!beat || !dom.lineEdit) return;
      const isCard = beat.type === 'title' || beat.type === 'narration' || (beat.type === 'choices' && beat.speaker === 'narrator');
      dom.line.classList.toggle('is-card', isCard);
      dom.line.classList.toggle('is-title', beat.type === 'title');
      const name = isCard ? '' : speakerName(beat.speaker || 'player');
      dom.lineName.textContent = name;
      dom.lineName.classList.toggle('hidden', !name);
      dom.lineLabel.textContent = `${event.label || 'Story event'} · ${{ narration: 'Narration', dialogue: 'Dialogue', title: 'Title card', choices: 'Choice' }[beat.type]} ${lines.indexOf(beat) + 1}/${lines.length}`;
      const font = beat.type === 'title' && beat.font ? LIB.get('fonts', beat.font) : null;
      dom.lineText.style.fontFamily = font && font.stack ? font.stack : '';
      if (beat.type === 'title' && beat.size) dom.lineText.dataset.titleSize = beat.size; else delete dom.lineText.dataset.titleSize;
      dom.lineEdit.bind({
        rich: beat.rich || '', text: beat.text || '', label: 'The line on the stage',
        placeholder: { narration: 'What the narrator says', dialogue: 'What they say', title: 'e.g. Chapter Two', choices: 'The question (optional)' }[beat.type],
        singleLine: beat.type === 'title', maxLength: beat.type === 'title' ? 120 : 600,
        onChange(rich, plain) {
          beat.text = plain;
          if (rich) beat.rich = rich; else delete beat.rich;
          const box = ed.lineEditors && ed.lineEditors.get(beat.id);
          if (box) box.load(rich, plain);
          ed.touch();
        }
      });
    }
    ed.renderLine = renderLine;
    // Shows this line on the stage (the inspector calls it when you work on one).
    ed.showLine = (beatId) => {
      if (ed.ui.activeBeatId === beatId && !ed.ui.lineHidden) return;
      ed.ui.activeBeatId = beatId;
      ed.ui.lineHidden = false;
      renderLine();
      options.inspectorRoot.querySelectorAll('.pe-beat').forEach((node) => node.classList.toggle('is-on-stage', node.dataset.beat === beatId));
    };

    // ---------- Camera ---------------------------------------------------------
    function stageSize() {
      const rect = dom.stage.getBoundingClientRect();
      return { w: Math.max(1, rect.width), h: Math.max(1, rect.height), rect };
    }
    // Pixels per x unit and per y unit. One screen is 100 x 100 units on a
    // 16:9 stage, so a tile (4.5 x 8 units) is square.
    function px() {
      const { w } = stageSize();
      const ux = (w / 100) * ed.ui.zoom;
      return { ux, uy: ux * Y_PER_X };
    }
    function viewSize() {
      const { w, h } = stageSize();
      const { ux, uy } = px();
      return { w: w / ux, h: h / uy };
    }
    function clampCamera() {
      const view = viewSize();
      const width = ed.scene.width;
      // The view never goes past either end of the stage.
      ed.ui.camX = clamp(ed.ui.camX, 0, Math.max(0, width - view.w));
      ed.ui.camY = view.h >= WORLD_H ? WORLD_H - view.h : clamp(ed.ui.camY, 0, WORLD_H - view.h);
    }
    function applyCamera() {
      if (!ed.scene) return;
      clampCamera();
      const { ux, uy } = px();
      dom.world.style.setProperty('--ux', `${ux}px`);
      dom.world.style.setProperty('--uy', `${uy}px`);
      dom.world.style.width = `${ed.scene.width * ux}px`;
      dom.world.style.height = `${WORLD_H * uy}px`;
      dom.world.style.transform = `translate(${-ed.ui.camX * ux}px, ${-ed.ui.camY * uy}px)`;
      dom.zoomLabel.textContent = `${Math.round(ed.ui.zoom * 100)}%`;
      renderMinimapWindow();
    }
    function worldPoint(clientX, clientY) {
      const { rect } = stageSize();
      const { ux, uy } = px();
      return { x: ed.ui.camX + (clientX - rect.left) / ux, y: ed.ui.camY + (clientY - rect.top) / uy };
    }
    function zoomTo(zoom, clientX, clientY) {
      const { rect } = stageSize();
      const cx = clientX ?? rect.left + rect.width / 2;
      const cy = clientY ?? rect.top + rect.height / 2;
      const before = worldPoint(cx, cy);
      ed.ui.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
      const { ux, uy } = px();
      ed.ui.camX = before.x - (cx - rect.left) / ux;
      ed.ui.camY = before.y - (cy - rect.top) / uy;
      applyCamera();
      renderSelection();
    }
    function zoomBy(factor) { zoomTo(ed.ui.zoom * factor); }
    function fitStage() {
      ed.ui.zoom = clamp(100 / ed.scene.width, MIN_ZOOM, 1);
      ed.ui.camX = 0;
      ed.ui.camY = WORLD_H;
      applyCamera();
      renderSelection();
    }
    function lookAt(x) {
      const view = viewSize();
      ed.ui.camX = x - view.w / 2;
      applyCamera();
      renderSelection();
    }
    ed.lookAt = lookAt;
    ed.viewCentreX = () => r2(ed.ui.camX + viewSize().w / 2);

    // ---------- World rendering -------------------------------------------------
    function renderSky() {
      const bg = ed.scene.background;
      const def = bg.id ? LIB.get('backgrounds', bg.id) : null;
      const layers = def ? def.layers : bg.asset ? [bg.asset] : [];
      const groundLine = def ? 0.8 : 0.82;
      const top = GROUND_Y - groundLine * 100;
      dom.sky.style.backgroundColor = bg.color || (def && def.color) || '#8fd0ee';
      dom.sky.style.backgroundImage = layers.map((layer) => `url('${url(layer)}')`).join(',');
      const copies = Math.max(1, Math.round(ed.scene.width / 100));
      dom.sky.style.backgroundSize = layers.map((layer, index) => (index === 0 && def && def.wholeCopies
        ? `${100 / copies}% calc(var(--uy) * 100)`
        : 'calc(var(--ux) * 100) calc(var(--uy) * 100)')).join(',');
      dom.sky.style.backgroundPosition = layers.map(() => `0 calc(var(--uy) * ${top})`).join(',');
      dom.sky.style.backgroundRepeat = layers.map(() => 'repeat-x').join(',');
      const tint = LIB.get('tints', bg.tint);
      dom.tinted.style.filter = tint && tint.filter ? tint.filter : '';
      [dom.front].forEach((layer) => { layer.style.filter = tint && tint.filter ? tint.filter : ''; });
    }

    function groundSurface() {
      const ground = ed.scene.ground;
      if (ground.material === 'custom' && ground.asset) return { asset: ground.asset };
      const def = LIB.get('grounds', ground.material);
      if (def && def.tiles) return { tiles: def.tiles };
      return { color: ground.color };
    }

    function renderGround() {
      dom.ground.replaceChildren();
      const width = ed.scene.width;
      const gaps = ed.scene.ground.gaps.slice().sort((a, b) => a.from - b.from);
      const surface = groundSurface();
      let from = 0;
      const strip = (start, end) => {
        if (end - start <= 0) return;
        const node = el('div', { class: 'pe-ground-strip' });
        placeNode(node, { x: (start + end) / 2, y: GROUND_Y + 9, w: end - start, h: 18 });
        if (surface.tiles) renderTiles(node, { cap: surface.tiles.cap, fill: surface.tiles.fill }, end - start, 18);
        else if (surface.asset) {
          node.style.backgroundImage = `url('${url(surface.asset)}')`;
          node.style.backgroundSize = 'calc(var(--ux) * 33.333) 100%';
        } else node.style.backgroundColor = surface.color;
        dom.ground.appendChild(node);
      };
      gaps.forEach((gap) => {
        strip(from, gap.from);
        from = Math.max(from, gap.to);
      });
      strip(from, width);
      gaps.forEach((gap) => {
        const node = el('div', { class: `pe-gap is-${gap.fill}`, dataset: { ref: `g:${gap.id}` }, title: gap.fill === 'water' ? 'Water' : 'Pit' });
        placeNode(node, boxOf(`g:${gap.id}`));
        nodes.set(`g:${gap.id}`, node);
        dom.ground.appendChild(node);
      });
      // The end of the stage: walking past it finishes the page.
      const finish = el('div', { class: 'pe-finish', title: 'The end of the stage' }, [el('span', { text: 'Finish' })]);
      placeNode(finish, { x: width - 1, y: GROUND_Y - 30, w: 2, h: 60 });
      dom.ground.appendChild(finish);
    }

    function renderObject(object) {
      const ref = `o:${object.id}`;
      const box = boxOf(ref);
      const node = el('div', { class: `pe-item pe-object is-${object.kind}`, dataset: { ref } });
      if (object.kind === 'block') {
        const material = LIB.get('materials', object.material);
        if (material) renderTiles(node, material.tiles, box.w, box.h);
        else node.classList.add('is-missing');
      } else if (object.kind === 'legacy') {
        const type = (window.KOOBD_PLATFORMER_BLOCKS || []).find((item) => item.id === object.type) || {};
        node.style.backgroundColor = object.color || type.color || '#5f9b58';
        node.classList.add('is-legacy');
      } else {
        const src = imageSrc(object);
        const prop = object.prop ? LIB.get('props', object.prop) : null;
        if (prop && prop.flower) {
          node.append(el('img', { class: 'pe-flower-stem', src: url(prop.stem), alt: '', draggable: false }), el('img', { class: 'pe-flower-head', src: url(prop.src), alt: '', draggable: false }));
        } else {
          node.appendChild(el('img', { src: url(src), alt: '', draggable: false }));
        }
        if (object.flip) node.classList.add('is-flipped');
        if (/^uploads\//.test(src)) node.classList.add('is-smooth');
        if (object.hazard) node.classList.add('is-hazard');
        if (object.solid) node.classList.add('is-solid');
        if (object.anim && object.anim !== 'none') node.classList.add(`anim-${object.anim}`);
        if (keepsShape(object)) {
          const info = pictureInfo(src, () => { if (ed.active) renderWorld(); });
          if (info) {
            const w = r2(object.h * info.aspect * Y_PER_X);
            if (Math.abs(w - num(object.w)) > 0.05) { object.w = w; box.w = w; }
          }
        }
      }
      placeNode(node, box);
      nodes.set(ref, node);
      const layer = object.kind === 'image' && !object.solid && !object.hazard
        ? ({ far: dom.far, back: dom.back, front: dom.front }[object.layer] || dom.back)
        : dom.blocks;
      if (object.kind === 'image' && object.light && !object.solid && !object.hazard) node.classList.add('is-light');
      layer.appendChild(node);
    }

    function renderCharacter(character) {
      const ref = `c:${character.id}`;
      const art = characterArt(character);
      // On the editing canvas every character holds its first standing frame:
      // nothing animates or walks while a story is being edited (it would only
      // cost the device work). Its own settings - animated or still, how it
      // moves - are kept as they are and play in Preview and in the story.
      const node = el('div', { class: 'pe-item pe-character', dataset: { ref, animated: art.sheet && !art.still ? 'true' : 'false' } });
      if (art.sheet) node.appendChild(el('span', { class: 'pe-sheet' }, [el('img', { src: url(art.sheet), alt: '', draggable: false })]));
      else node.appendChild(el('img', { src: url(art.src), alt: '', draggable: false }));
      node.appendChild(el('span', { class: 'pe-name-tag', translate: 'no', text: character.name || art.label }));
      const talks = ed.scene.events.filter((event) => event.trigger.type === 'talk' && event.trigger.character === character.id).length;
      if (talks) node.appendChild(el('span', { class: 'pe-talk-badge', title: `${talks} conversation${talks > 1 ? 's' : ''}` }, [icon('chat')]));
      if (character.behavior && character.behavior.type !== 'stand' && character.behavior.type !== 'follow') {
        const radius = character.behavior.type === 'pace' ? clamp(num(character.behavior.radius, 20), 4, 200) : clamp(num(character.behavior.radius, 20), 0, 200);
        // How far they walk around their spot.
        const range = el('span', { class: 'pe-range' });
        range.style.left = `calc(50% - var(--ux) * ${radius})`;
        range.style.width = `calc(var(--ux) * ${radius * 2})`;
        node.appendChild(range);
      }
      placeNode(node, boxOf(ref));
      nodes.set(ref, node);
      dom.chars.appendChild(node);
    }

    function renderMarkers() {
      dom.markers.replaceChildren();
      ed.scene.checkpoints.forEach((checkpoint) => {
        const ref = `k:${checkpoint.id}`;
        const node = el('div', { class: 'pe-item pe-checkpoint', dataset: { ref }, title: 'Checkpoint' }, [icon('flag')]);
        placeNode(node, boxOf(ref));
        nodes.set(ref, node);
        dom.markers.appendChild(node);
      });
      ed.scene.events.forEach((event, index) => {
        if (event.trigger.type !== 'reach') return;
        const ref = `e:${event.id}`;
        const node = el('div', { class: `pe-item pe-event-marker${ed.ui.activeEventId === event.id ? ' is-open' : ''}`, dataset: { ref }, title: `Story event ${index + 1}: plays when the player reaches here` }, [
          el('span', { class: 'pe-event-bubble', text: String(index + 1) }),
          el('span', { class: 'pe-event-label', translate: event.label ? 'no' : null, text: event.label || `Event ${index + 1}` })
        ]);
        placeNode(node, boxOf(ref));
        nodes.set(ref, node);
        dom.markers.appendChild(node);
      });
      const player = el('div', { class: 'pe-item pe-player', dataset: { ref: 'player' }, title: 'Where the player starts' }, [
        el('img', { src: url(options.playerAsset), alt: '', draggable: false }),
        el('span', { class: 'pe-name-tag is-player', text: 'Start' })
      ]);
      placeNode(player, boxOf('player'));
      nodes.set('player', player);
      dom.markers.appendChild(player);
    }

    function renderWorld() {
      if (!ed.scene) return;
      nodes.clear();
      [dom.far, dom.back, dom.blocks, dom.chars, dom.front].forEach((layer) => layer.replaceChildren());
      renderSky();
      renderGround();
      ed.scene.objects.forEach(renderObject);
      ed.scene.characters.forEach(renderCharacter);
      renderMarkers();
      applyCamera();
      renderSelection();
      renderHitboxes();
      renderMinimap();
      renderLine();
    }
    ed.renderWorld = renderWorld;

    // Moves the nodes of the given refs without rebuilding the world (drags).
    function repositionNodes(refs) {
      refs.forEach((ref) => {
        const node = nodes.get(ref);
        const box = boxOf(ref);
        if (node && box) placeNode(node, box);
        if (ref.startsWith('o:')) {
          const found = resolve(ref);
          if (found && found.type === 'block' && node) {
            node.querySelectorAll('.pe-tile-layer').forEach((layer) => layer.remove());
            const material = LIB.get('materials', found.item.material);
            if (material) renderTiles(node, material.tiles, box.w, box.h);
          }
        }
      });
      if (refs.some((ref) => ref.startsWith('g:'))) renderGround();
      renderSelection();
      renderHitboxes();
    }

    // ---------- Hitboxes ------------------------------------------------------
    function corners(box, part = { left: 0, top: 0, right: 1, bottom: 1 }) {
      // Rotation happens on screen (px), where x and y units differ in size.
      const rad = (box.r || 0) * Math.PI / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const hw = box.w / 2;
      const hh = (box.h / 2) * Y_PER_X; // in x-unit-sized steps
      return [[part.left, part.top], [part.right, part.top], [part.right, part.bottom], [part.left, part.bottom]].map(([fx, fy]) => {
        const lx = (fx * 2 - 1) * hw;
        const ly = (fy * 2 - 1) * hh;
        return [box.x + lx * cos - ly * sin, box.y + (lx * sin + ly * cos) / Y_PER_X];
      });
    }
    ed.corners = corners;

    function renderHitboxes() {
      const svg = dom.hitboxes;
      svg.replaceChildren();
      svg.classList.toggle('hidden', !ed.ui.hitboxes);
      if (!ed.ui.hitboxes || !ed.scene) return;
      svg.setAttribute('viewBox', `0 0 ${ed.scene.width} ${WORLD_H}`);
      svg.style.width = `calc(var(--ux) * ${ed.scene.width})`;
      svg.style.height = `calc(var(--uy) * ${WORLD_H})`;
      const poly = (points, cls) => {
        const node = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        node.setAttribute('points', points.map((point) => point.map(r2).join(',')).join(' '));
        node.setAttribute('class', cls);
        svg.appendChild(node);
      };
      let from = 0;
      ed.scene.ground.gaps.slice().sort((a, b) => a.from - b.from).concat([{ from: ed.scene.width, to: ed.scene.width }]).forEach((gap) => {
        if (gap.from > from) poly([[from, GROUND_Y], [gap.from, GROUND_Y], [gap.from, GROUND_Y + 1.2], [from, GROUND_Y + 1.2]], 'pe-hit-ground');
        from = Math.max(from, gap.to);
      });
      ed.scene.objects.forEach((object) => {
        const box = boxOf(`o:${object.id}`);
        if (object.kind === 'block') {
          const material = LIB.get('materials', object.material) || {};
          poly(corners(box, { left: 0, top: 0, right: 1, bottom: clamp(num(material.solid, 1), 0.05, 1) }), 'pe-hit-solid');
          return;
        }
        if (object.kind === 'legacy') { poly(corners(box), 'pe-hit-solid'); return; }
        if (!object.solid && !object.hazard) return;
        const cls = object.hazard ? 'pe-hit-hazard' : 'pe-hit-solid';
        // A flipped picture's hitbox is mirrored with it.
        const mirror = (part) => (object.flip ? { left: 1 - part.right, right: 1 - part.left, top: part.top, bottom: part.bottom } : part);
        if (object.box) { poly(corners(box, mirror(object.box)), cls); return; }
        const info = pictureInfo(imageSrc(object), () => renderHitboxes());
        const parts = info && info.parts ? info.parts : [{ left: 0, top: 0, right: 1, bottom: 1 }];
        parts.forEach((part) => poly(corners(box, mirror(part)), cls));
      });
      ed.scene.characters.forEach((character) => {
        const box = boxOf(`c:${character.id}`);
        poly(corners({ ...box, w: box.w * 0.6 }), 'pe-hit-character');
      });
      const playerBox = boxOf('player');
      poly(corners({ ...playerBox, w: playerBox.w * 0.6 }), 'pe-hit-player');
    }

    // ---------- Selection ------------------------------------------------------
    function selectionItems() { return ed.ui.selection.filter((ref) => resolve(ref)); }
    function setSelection(refs, options2 = {}) {
      ed.ui.selection = refs.filter((ref, index) => ref && refs.indexOf(ref) === index && resolve(ref));
      const first = ed.ui.selection[0] && resolve(ed.ui.selection[0]);
      if (first && first.type === 'event') ed.ui.activeEventId = first.item.id;
      renderSelection();
      renderToolbar();
      if (!options2.keepTab && ed.ui.selection.length && ed.ui.tab !== 'selected' && !(first && first.type === 'event')) ed.ui.tab = 'selected';
      if (first && first.type === 'event') ed.ui.tab = 'events';
      renderInspector();
    }
    ed.select = (refs) => setSelection(Array.isArray(refs) ? refs : [refs]);

    function renderSelection() {
      if (!dom.overlay) return;
      dom.overlay.replaceChildren();
      nodes.forEach((node, ref) => node.classList.toggle('is-selected', ed.ui.selection.includes(ref)));
      const refs = selectionItems();
      if (!refs.length) return;
      if (refs.length > 1) {
        const boxes = refs.map(boxOf);
        const left = Math.min(...boxes.map((box) => box.x - box.w / 2));
        const right = Math.max(...boxes.map((box) => box.x + box.w / 2));
        const top = Math.min(...boxes.map((box) => box.y - box.h / 2));
        const bottom = Math.max(...boxes.map((box) => box.y + box.h / 2));
        const frame = el('div', { class: 'pe-selection is-group' });
        placeNode(frame, { x: (left + right) / 2, y: (top + bottom) / 2, w: right - left, h: bottom - top });
        frame.appendChild(el('span', { class: 'pe-selection-count', text: `${refs.length} selected` }));
        dom.overlay.appendChild(frame);
        return;
      }
      const ref = refs[0];
      const found = resolve(ref);
      const box = boxOf(ref);
      const frame = el('div', { class: 'pe-selection' });
      placeNode(frame, box);
      const handles = [];
      if (found.type === 'block') handles.push(['w', -1, 0], ['e', 1, 0], ['n', 0, -1], ['s', 0, 1], ['nw', -1, -1], ['ne', 1, -1], ['sw', -1, 1], ['se', 1, 1]);
      else if (found.type === 'image' || found.type === 'legacy') {
        handles.push(['nw', -1, -1], ['ne', 1, -1], ['sw', -1, 1], ['se', 1, 1]);
        if (!keepsShape(found.item)) handles.push(['w', -1, 0], ['e', 1, 0], ['n', 0, -1], ['s', 0, 1]);
        frame.appendChild(el('span', { class: 'pe-rotate-handle', dataset: { handle: 'rotate' }, title: 'Drag to rotate (hold Shift for free rotation)' }));
      } else if (found.type === 'character') handles.push(['nw', -1, -1], ['ne', 1, -1]);
      else if (found.type === 'gap') handles.push(['w', -1, 0], ['e', 1, 0]);
      handles.forEach(([name, sx, sy]) => frame.appendChild(el('span', { class: `pe-handle is-${name}`, dataset: { handle: name, sx: String(sx), sy: String(sy) } })));
      dom.overlay.appendChild(frame);
    }

    // ---------- Editing ---------------------------------------------------------
    // After a finished change: redraw and tell the story editor (saving + undo).
    function commit(what = {}) {
      renderWorld();
      if (what.inspector !== false) renderInspector();
      options.onChange && options.onChange();
    }
    ed.commit = commit;
    // A change made by typing in the inspector: redraw the stage only.
    ed.touch = () => {
      renderWorld();
      if (ed.afterTouch) ed.afterTouch();
      options.onChange && options.onChange();
    };

    function addObject(object, select = true) {
      ed.scene.objects.push(object);
      if (select) ed.ui.selection = [`o:${object.id}`];
      commit();
    }

    function deleteSelection() {
      const refs = selectionItems().filter((ref) => ref !== 'player');
      if (!refs.length) return false;
      refs.forEach((ref) => {
        const id = ref.slice(ref.indexOf(':') + 1);
        if (ref.startsWith('o:')) ed.scene.objects = ed.scene.objects.filter((item) => item.id !== id);
        if (ref.startsWith('c:')) {
          ed.scene.characters = ed.scene.characters.filter((item) => item.id !== id);
          ed.scene.events.forEach((event) => {
            if (event.trigger.type === 'talk' && event.trigger.character === id) event.trigger = { type: 'reach', x: ed.viewCentreX(), character: '' };
            event.cutscene.focus = event.cutscene.focus.filter((focus) => focus !== id);
          });
        }
        if (ref.startsWith('k:')) ed.scene.checkpoints = ed.scene.checkpoints.filter((item) => item.id !== id);
        if (ref.startsWith('g:')) ed.scene.ground.gaps = ed.scene.ground.gaps.filter((item) => item.id !== id);
        if (ref.startsWith('e:')) {
          ed.scene.events = ed.scene.events.filter((item) => item.id !== id);
          ed.scene.characters.forEach((character) => {
            if (character.appear && character.appear.event === id) delete character.appear;
            if (character.leave && character.leave.event === id) delete character.leave;
          });
        }
      });
      ed.ui.selection = [];
      commit();
      return true;
    }
    ed.deleteSelection = deleteSelection;

    function cloneWithNewId(ref, offsetX) {
      const found = resolve(ref);
      if (!found) return null;
      const copy = JSON.parse(JSON.stringify(found.item));
      if (ref.startsWith('o:')) {
        copy.id = makeId('obj');
        copy.x = r2(copy.x + offsetX);
        ed.scene.objects.push(copy);
        return `o:${copy.id}`;
      }
      if (ref.startsWith('c:')) {
        copy.id = makeId('char');
        copy.x = r2(copy.x + offsetX);
        delete copy.appear;
        delete copy.leave;
        ed.scene.characters.push(copy);
        return `c:${copy.id}`;
      }
      if (ref.startsWith('k:')) {
        copy.id = makeId('cp');
        copy.x = r2(copy.x + offsetX);
        ed.scene.checkpoints.push(copy);
        return `k:${copy.id}`;
      }
      return null;
    }

    function selectionWidth(refs) {
      const boxes = refs.map(boxOf).filter(Boolean);
      if (!boxes.length) return 10;
      return Math.max(...boxes.map((box) => box.x + box.w / 2)) - Math.min(...boxes.map((box) => box.x - box.w / 2));
    }

    function duplicateSelection() {
      const refs = selectionItems().filter((ref) => /^[ock]:/.test(ref));
      if (!refs.length) return false;
      const offset = r2(Math.ceil(selectionWidth(refs) / TX) * TX);
      ed.ui.selection = refs.map((ref) => cloneWithNewId(ref, offset)).filter(Boolean);
      commit();
      return true;
    }
    ed.duplicateSelection = duplicateSelection;

    function copySelection() {
      const refs = selectionItems().filter((ref) => /^[ock]:/.test(ref));
      if (!refs.length) return false;
      ed.clipboard = refs.map((ref) => ({ prefix: ref[0], item: JSON.parse(JSON.stringify(resolve(ref).item)) }));
      return true;
    }
    function pasteClipboard() {
      if (!ed.clipboard || !ed.clipboard.length) return false;
      const minX = Math.min(...ed.clipboard.map((entry) => num(entry.item.x)));
      const target = ed.viewCentreX();
      const refs = [];
      ed.clipboard.forEach(({ prefix, item }) => {
        const copy = JSON.parse(JSON.stringify(item));
        copy.x = r2(num(copy.x) - minX + target);
        if (prefix === 'o') { copy.id = makeId('obj'); ed.scene.objects.push(copy); refs.push(`o:${copy.id}`); }
        if (prefix === 'c') { copy.id = makeId('char'); delete copy.appear; delete copy.leave; ed.scene.characters.push(copy); refs.push(`c:${copy.id}`); }
        if (prefix === 'k') { copy.id = makeId('cp'); ed.scene.checkpoints.push(copy); refs.push(`k:${copy.id}`); }
      });
      ed.ui.selection = refs;
      commit();
      return true;
    }

    function rotateSelection(degrees) {
      const refs = selectionItems().filter((ref) => {
        const found = resolve(ref);
        return found && (found.type === 'image' || found.type === 'legacy');
      });
      if (!refs.length) return false;
      refs.forEach((ref) => {
        const item = resolve(ref).item;
        let next = (num(item.rotation) + degrees) % 360;
        if (next > 180) next -= 360;
        if (next <= -180) next += 360;
        item.rotation = r2(next);
      });
      commit();
      return true;
    }
    function flipSelection() {
      const refs = selectionItems().filter((ref) => resolve(ref).type === 'image');
      if (!refs.length) return false;
      refs.forEach((ref) => { const item = resolve(ref).item; item.flip = !item.flip; });
      commit();
      return true;
    }
    // Moves pictures in front of or behind others (their order in the list).
    function restackSelection(direction) {
      const refs = selectionItems().filter((ref) => ref.startsWith('o:'));
      if (!refs.length) return false;
      const ids = new Set(refs.map((ref) => ref.slice(2)));
      const list = ed.scene.objects;
      if (direction > 0) {
        for (let index = list.length - 2; index >= 0; index -= 1) {
          if (ids.has(list[index].id) && !ids.has(list[index + 1].id)) [list[index], list[index + 1]] = [list[index + 1], list[index]];
        }
      } else {
        for (let index = 1; index < list.length; index += 1) {
          if (ids.has(list[index].id) && !ids.has(list[index - 1].id)) [list[index], list[index - 1]] = [list[index - 1], list[index]];
        }
      }
      commit();
      return true;
    }

    function nudgeSelection(dx, dy) {
      const refs = selectionItems();
      if (!refs.length) return false;
      refs.forEach((ref) => moveRef(ref, dx, dy, resolveStart(ref)));
      repositionNodes(refs);
      clearTimeout(ed.nudgeTimer);
      ed.nudgeTimer = setTimeout(() => commit(), 250);
      return true;
    }

    // ---------- Moving ---------------------------------------------------------
    function resolveStart(ref) {
      const found = resolve(ref);
      if (!found) return null;
      const item = found.item;
      if (found.type === 'player') return { x: item.x, y: item.y };
      if (found.type === 'character') return { x: item.x, feet: item.feet };
      if (found.type === 'gap') return { from: item.from, to: item.to };
      if (found.type === 'event') return { x: num(item.trigger.x) };
      if (found.type === 'checkpoint') return { x: item.x };
      return { x: item.x, y: item.y };
    }

    function moveRef(ref, dx, dy, start, free = false) {
      const found = resolve(ref);
      if (!found || !start) return;
      const { type, item } = found;
      const width = ed.scene.width;
      const snap = ed.ui.snap && !free;
      if (type === 'block') {
        const box = boxOf(ref);
        let left = start.x + dx - box.w / 2;
        let top = start.y + dy - box.h / 2;
        if (snap) {
          left = Math.round(left / TX) * TX;
          top = GROUND_Y - Math.round((GROUND_Y - top) / TY) * TY;
        }
        item.x = r2(clamp(left + box.w / 2, -40, width + 40));
        item.y = r2(clamp(top + box.h / 2, -90, 310));
      } else if (type === 'image' || type === 'legacy') {
        const box = boxOf(ref);
        let x = start.x + dx;
        let y = start.y + dy;
        if (snap) {
          x = Math.round(x * 2) / 2;
          const bottom = snapBottom(x, y + box.h / 2, [ref]);
          y = bottom - box.h / 2;
        }
        item.x = r2(clamp(x, -40, width + 40));
        item.y = r2(clamp(y, -90, 310));
      } else if (type === 'character' || type === 'player') {
        const x = clamp(start.x + dx, 0, width);
        const startFeet = type === 'player' ? start.y : start.feet;
        let bottom = GROUND_Y - startFeet + dy;
        if (snap) bottom = snapBottom(x, bottom, [], 6);
        const feet = r2(clamp(GROUND_Y - bottom, type === 'player' ? 0 : -18, GROUND_Y));
        item.x = r2(x);
        if (type === 'player') item.y = feet; else item.feet = feet;
      } else if (type === 'checkpoint') {
        item.x = r2(clamp(start.x + dx, 0, width));
      } else if (type === 'event') {
        item.trigger.x = r2(clamp(start.x + dx, 0, width));
      } else if (type === 'gap') {
        const span = start.to - start.from;
        const from = clamp(start.from + dx, 0, width - span);
        item.from = r2(snap ? Math.round(from / TX) * TX : from);
        item.to = r2(item.from + span);
      }
    }

    // ---------- Resizing and rotating ----------------------------------------
    function resizeRef(ref, start, handle, point, free) {
      const found = resolve(ref);
      const { type, item } = found;
      const sx = Number(handle.sx);
      const sy = Number(handle.sy);
      if (type === 'gap') {
        const x = clamp(point.x, 0, ed.scene.width);
        const snapped = ed.ui.snap && !free ? Math.round(x / TX) * TX : x;
        if (sx < 0) item.from = r2(Math.min(snapped, item.to - 2));
        else item.to = r2(Math.max(snapped, item.from + 2));
        return;
      }
      if (type === 'character') {
        const bottom = GROUND_Y - item.feet;
        const height = clamp(bottom - point.y, 4, 120);
        item.scale = r2(clamp(height / CHAR_H, 0.4, 2.5));
        return;
      }
      // Work on screen (x-unit-sized steps), where rotation is a true rotation.
      const rad = (start.r || 0) * Math.PI / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const toLocal = (x, y) => {
        const dx = x - start.x;
        const dy = (y - start.y) * Y_PER_X;
        return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
      };
      const W = start.w;
      const H = start.h * Y_PER_X;
      const anchor = { x: -sx * W / 2, y: -sy * H / 2 };
      const local = toLocal(point.x, point.y);
      let newW = sx ? Math.max(0.5, (local.x - anchor.x) * sx) : W;
      let newH = sy ? Math.max(0.5 * Y_PER_X, (local.y - anchor.y) * sy) : H;
      if (type === 'block') {
        const cols = clamp(Math.round(newW / TX), 1, 200);
        const rows = clamp(Math.round(newH / (TY * Y_PER_X)), 1, 40);
        item.cols = cols;
        item.rows = rows;
        newW = cols * TX;
        newH = rows * TY * Y_PER_X;
      } else if (type === 'image' && keepsShape(item)) {
        const factor = Math.max(newW / W, newH / H);
        newW = W * factor;
        newH = H * factor;
      }
      const centreLocal = { x: anchor.x + (sx ? sx * newW / 2 : 0), y: anchor.y + (sy ? sy * newH / 2 : 0) };
      if (!sx) centreLocal.x = 0;
      if (!sy) centreLocal.y = 0;
      const cx = start.x + centreLocal.x * cos - centreLocal.y * sin;
      const cy = start.y + (centreLocal.x * sin + centreLocal.y * cos) / Y_PER_X;
      item.x = r2(cx);
      item.y = r2(cy);
      if (type !== 'block') {
        item.w = r2(clamp(newW, 0.5, 1000));
        item.h = r2(clamp(newH / Y_PER_X, 0.5, 300));
      }
    }

    function rotateRef(ref, start, point, free) {
      const item = resolve(ref).item;
      const dx = point.x - start.x;
      const dy = (point.y - start.y) * Y_PER_X;
      let angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
      if (!free) angle = Math.round(angle / 15) * 15;
      if (angle > 180) angle -= 360;
      item.rotation = r2(angle);
    }

    // ---------- Placing from the library -------------------------------------
    // armed: { kind: block | hazard | prop | character | upload | uploadCharacter, id, src, sheet }
    function arm(armed) {
      ed.ui.armed = armed && ed.ui.armed && ed.ui.armed.kind === armed.kind && ed.ui.armed.id === armed.id ? null : armed;
      if (ed.ui.armed) ed.ui.tool = 'select';
      renderToolbar();
      renderLibrary();
      updateHint();
      dom.ghost.classList.add('hidden');
    }
    ed.arm = arm;

    function armedLabel(armed) {
      if (!armed) return '';
      if (armed.kind === 'block') return (LIB.get('materials', armed.id) || {}).label;
      if (armed.kind === 'hazard') return (LIB.get('hazards', armed.id) || {}).label;
      if (armed.kind === 'prop') return (LIB.get('props', armed.id) || {}).label;
      if (armed.kind === 'character') return (LIB.get('characters', armed.id) || {}).label;
      return armed.name || 'your picture';
    }

    function updateHint() {
      const armed = ed.ui.armed;
      let text = '';
      if (armed) text = `Placing: ${armedLabel(armed)} — click the stage to place (as many as you like). Esc or right-click to stop.`;
      else if (ed.ui.tool === 'gap') text = 'Gap tool: drag along the ground to cut water or a pit into it.';
      else if (ed.ui.tool === 'checkpoint') text = 'Checkpoint tool: click where a checkpoint should be. Players who fall or touch a hazard return to the last one they passed.';
      else if (ed.ui.tool === 'pan') text = 'Drag to move around the stage.';
      dom.hint.textContent = text;
      dom.hint.classList.toggle('hidden', !text);
      dom.stage.dataset.tool = armed ? 'place' : ed.ui.tool;
    }

    // The new thing an armed library piece would place at a world point.
    function buildArmed(armed, point) {
      if (armed.kind === 'block') {
        const object = { id: makeId('obj'), kind: 'block', material: armed.id, cols: 4, rows: 1, x: 0, y: 0 };
        let left = point.x - (object.cols * TX) / 2;
        let top = point.y - TY / 2;
        if (ed.ui.snap) {
          left = Math.round(left / TX) * TX;
          top = GROUND_Y - Math.round((GROUND_Y - top) / TY) * TY;
        }
        object.x = r2(left + (object.cols * TX) / 2);
        object.y = r2(top + (object.rows * TY) / 2);
        return { object };
      }
      if (armed.kind === 'hazard' || armed.kind === 'prop' || armed.kind === 'upload') {
        const def = armed.kind === 'hazard' ? LIB.get('hazards', armed.id) : armed.kind === 'prop' ? LIB.get('props', armed.id) : null;
        const src = def ? def.src : armed.src;
        const info = pictureInfo(src);
        const h = def ? (def.h || 10) : 20;
        const w = def && def.w ? def.w : r2(h * (info ? info.aspect : 1) * Y_PER_X);
        // An upload placed from Blocks is solid ground, from Hazards a hazard (armed.role).
        const object = { id: makeId('obj'), kind: 'image', x: 0, y: 0, w, h, rotation: 0, flip: false, solid: armed.role === 'solid', hazard: armed.kind === 'hazard' || armed.role === 'hazard', layer: 'back', anim: 'none', light: false };
        if (armed.kind === 'hazard') object.hazardId = armed.id;
        else if (armed.kind === 'prop') {
          object.prop = armed.id;
          object.layer = def.layer || 'back';
          object.anim = def.anim || 'none';
          object.light = Boolean(def.light);
        } else object.asset = armed.src;
        let x = point.x;
        let bottom = point.y + h / 2;
        if (ed.ui.snap) {
          x = Math.round(x * 2) / 2;
          bottom = snapBottom(x, bottom, [], 6);
        }
        object.x = r2(x);
        object.y = r2(bottom - h / 2);
        return { object };
      }
      if (armed.kind === 'character' || armed.kind === 'uploadCharacter') {
        const def = armed.kind === 'character' ? LIB.get('characters', armed.id) : null;
        const character = {
          id: makeId('char'),
          name: def ? def.label : 'Character',
          x: 0,
          feet: 0,
          scale: def && def.scale ? def.scale : 1,
          behavior: { type: 'stand', radius: 20, speed: 0 },
          talk: []
        };
        if (def) character.art = def.id;
        else { character.upload = armed.src; character.sheet = Boolean(armed.sheet); }
        const x = clamp(point.x, 0, ed.scene.width);
        const art = characterArt(character);
        const size = charSize(art.src, art.sheet, character.scale, CHAR_H);
        let bottom = point.y + size.h / 2;
        if (ed.ui.snap) bottom = snapBottom(x, bottom, [], 8);
        character.x = r2(x);
        character.feet = r2(clamp(GROUND_Y - bottom, -18, GROUND_Y));
        return { character };
      }
      return null;
    }

    function placeArmed(point) {
      const built = buildArmed(ed.ui.armed, point);
      if (!built) return;
      if (built.object) {
        ed.scene.objects.push(built.object);
        ed.ui.selection = [`o:${built.object.id}`];
      } else if (built.character) {
        ed.scene.characters.push(built.character);
        ed.ui.selection = [`c:${built.character.id}`];
      }
      ed.ui.tab = 'selected';
      commit();
    }
    ed.placeArmedAt = (armed, clientX, clientY) => {
      const previous = ed.ui.armed;
      ed.ui.armed = armed;
      placeArmed(worldPoint(clientX, clientY));
      ed.ui.armed = previous;
    };

    function showGhost(point) {
      const armed = ed.ui.armed;
      if (!armed) { dom.ghost.classList.add('hidden'); return; }
      const built = buildArmed(armed, point);
      if (!built) return;
      const { ux, uy } = px();
      let box;
      dom.ghost.replaceChildren();
      if (built.object && built.object.kind === 'block') {
        box = { x: built.object.x, y: built.object.y, w: built.object.cols * TX, h: built.object.rows * TY };
        const material = LIB.get('materials', built.object.material);
        if (material) renderTiles(dom.ghost, material.tiles, box.w, box.h);
      } else if (built.object) {
        box = { x: built.object.x, y: built.object.y, w: built.object.w, h: built.object.h };
        dom.ghost.appendChild(el('img', { src: url(imageSrc(built.object)), alt: '' }));
      } else {
        const art = characterArt(built.character);
        const size = charSize(art.src, art.sheet, built.character.scale, CHAR_H);
        box = { x: built.character.x, y: GROUND_Y - built.character.feet - size.h / 2, ...size };
        if (art.sheet) dom.ghost.appendChild(el('span', { class: 'pe-sheet' }, [el('img', { src: url(art.sheet), alt: '' })]));
        else dom.ghost.appendChild(el('img', { src: url(art.src), alt: '' }));
      }
      dom.ghost.style.left = `${(box.x - box.w / 2 - ed.ui.camX) * ux}px`;
      dom.ghost.style.top = `${(box.y - box.h / 2 - ed.ui.camY) * uy}px`;
      dom.ghost.style.width = `${box.w * ux}px`;
      dom.ghost.style.height = `${box.h * uy}px`;
      dom.ghost.classList.remove('hidden');
    }

    // ---------- Stage pointer handling ----------------------------------------
    function setTool(tool) {
      ed.ui.tool = tool;
      ed.ui.armed = null;
      renderToolbar();
      renderLibrary();
      updateHint();
    }
    ed.setTool = setTool;

    function bindStage() {
      const stage = dom.stage;
      let gesture = null;

      stage.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        if (ed.ui.armed) { arm(null); return; }
        const target = event.target.closest('[data-ref]');
        if (target && !ed.ui.selection.includes(target.dataset.ref)) setSelection([target.dataset.ref]);
        openContextMenu(event);
      });

      // Two fingers on the stage: pinch to zoom toward them, move them to pan.
      // These listeners run before the ones below (capture). A second finger
      // cancels whatever the first one started - a piece it was moving, resized
      // or rotated goes back to where it was - and after a pinch the finger left
      // on the glass does nothing until it is lifted, so nothing moves by accident.
      const touches = new Map();
      const pinchFingers = new Set();
      let pinch = null;
      let pinchFrame = 0;
      let sceneAtTouch = null;
      const pair = () => Array.from(touches.values()).slice(0, 2);
      function cancelGestureForPinch() {
        const current = gesture;
        gesture = null;
        if (!current) return;
        const changed = ['move', 'resize', 'rotate', 'gap'].includes(current.kind) && (current.moved || current.kind === 'gap');
        if (changed && sceneAtTouch) {
          const before = JSON.parse(sceneAtTouch);
          Object.keys(ed.scene).forEach((key) => { delete ed.scene[key]; });
          Object.assign(ed.scene, before);
          renderWorld();
          renderInspector();
        }
        if (current.kind === 'marquee') {
          dom.marquee.classList.add('hidden');
          ed.ui.selection = current.base;
        }
        dom.ghost.classList.add('hidden');
        renderSelection();
      }
      function startPinch() {
        cancelGestureForPinch();
        const [a, b] = pair();
        const mid = worldPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = { distance: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), zoom: ed.ui.zoom, anchor: mid };
        // A frame still pending from an earlier pinch is dropped.
        window.cancelAnimationFrame(pinchFrame);
        pinchFrame = 0;
      }
      function stepPinch() {
        pinchFrame = 0;
        if (!pinch || touches.size < 2) return;
        const [a, b] = pair();
        const { rect } = stageSize();
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        ed.ui.zoom = clamp(pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance), MIN_ZOOM, MAX_ZOOM);
        // The stage point that was between the fingers stays between them.
        const { ux, uy } = px();
        ed.ui.camX = pinch.anchor.x - (cx - rect.left) / ux;
        ed.ui.camY = pinch.anchor.y - (cy - rect.top) / uy;
        applyCamera();
        renderSelection();
      }
      stage.addEventListener('pointerdown', (event) => {
        if (!ed.active || event.pointerType !== 'touch') return;
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.size === 1) {
          sceneAtTouch = JSON.stringify(ed.scene);
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        touches.forEach((touch, id) => pinchFingers.add(id));
        if (touches.size === 2) startPinch();
      }, true);
      stage.addEventListener('pointermove', (event) => {
        if (!touches.has(event.pointerId)) return;
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (!pinchFingers.has(event.pointerId)) return;
        event.stopImmediatePropagation();
        if (pinch && !pinchFrame) pinchFrame = window.requestAnimationFrame(stepPinch);
      }, true);
      const endTouch = (event) => {
        if (!touches.has(event.pointerId)) return;
        touches.delete(event.pointerId);
        const wasPinchFinger = pinchFingers.delete(event.pointerId);
        if (pinch && touches.size < 2) {
          pinch = null;
          window.cancelAnimationFrame(pinchFrame);
          pinchFrame = 0;
        }
        if (!touches.size) sceneAtTouch = null;
        if (wasPinchFinger) {
          // The pinch's fingers lifting must not finish a gesture below.
          event.stopImmediatePropagation();
          if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
        }
      };
      stage.addEventListener('pointerup', endTouch, true);
      stage.addEventListener('pointercancel', endTouch, true);

      stage.addEventListener('pointerdown', (event) => {
        if (!ed.active) return;
        if (event.button === 2) return;
        stage.focus({ preventScroll: true });
        closeContextMenu();
        const point = worldPoint(event.clientX, event.clientY);
        const handle = event.target.closest('[data-handle]');
        const target = event.target.closest('[data-ref]');
        const panning = event.button === 1 || ed.ui.tool === 'pan' || ed.spaceHeld;
        stage.setPointerCapture(event.pointerId);
        event.preventDefault();

        if (panning) {
          gesture = { kind: 'pan', startX: event.clientX, startY: event.clientY, camX: ed.ui.camX, camY: ed.ui.camY };
        } else if (handle && ed.ui.selection.length === 1) {
          const ref = ed.ui.selection[0];
          gesture = { kind: handle.dataset.handle === 'rotate' ? 'rotate' : 'resize', ref, handle: handle.dataset, start: boxOf(ref) };
        } else if (ed.ui.armed) {
          gesture = { kind: 'place', startX: event.clientX, startY: event.clientY, camX: ed.ui.camX, camY: ed.ui.camY, moved: false };
        } else if (ed.ui.tool === 'gap') {
          const id = makeId('gap');
          const x = ed.ui.snap ? Math.round(point.x / TX) * TX : point.x;
          gesture = { kind: 'gap', id, from: x };
        } else if (ed.ui.tool === 'checkpoint') {
          const checkpoint = { id: makeId('cp'), x: r2(clamp(point.x, 0, ed.scene.width)) };
          ed.scene.checkpoints.push(checkpoint);
          ed.ui.selection = [`k:${checkpoint.id}`];
          commit();
          gesture = null;
        } else if (target) {
          const ref = target.dataset.ref;
          if (event.shiftKey || event.ctrlKey || event.metaKey) {
            const has = ed.ui.selection.includes(ref);
            setSelection(has ? ed.ui.selection.filter((item) => item !== ref) : [...ed.ui.selection, ref]);
            gesture = null;
          } else {
            if (!ed.ui.selection.includes(ref)) setSelection([ref]);
            else if (ed.ui.tab !== 'selected' && !ref.startsWith('e:')) { ed.ui.tab = 'selected'; renderInspector(); }
            const refs = selectionItems();
            gesture = { kind: 'move', refs, origin: point, starts: new Map(refs.map((item) => [item, resolveStart(item)])), moved: false };
          }
        } else if (event.shiftKey) {
          gesture = { kind: 'marquee', origin: point, startX: event.clientX, startY: event.clientY, base: ed.ui.selection.slice() };
        } else {
          gesture = { kind: 'pan', startX: event.clientX, startY: event.clientY, camX: ed.ui.camX, camY: ed.ui.camY, deselect: true, moved: false };
        }
      });

      stage.addEventListener('pointermove', (event) => {
        if (!ed.active) return;
        const point = worldPoint(event.clientX, event.clientY);
        if (!gesture) {
          if (ed.ui.armed) showGhost(point);
          return;
        }
        const free = event.altKey;
        if (gesture.kind === 'pan' || gesture.kind === 'place') {
          const dx = event.clientX - gesture.startX;
          const dy = event.clientY - gesture.startY;
          if (Math.abs(dx) + Math.abs(dy) > 4) gesture.moved = true;
          if (gesture.kind === 'pan' || gesture.moved) {
            const { ux, uy } = px();
            ed.ui.camX = gesture.camX - dx / ux;
            ed.ui.camY = gesture.camY - dy / uy;
            applyCamera();
          }
          if (gesture.kind === 'place') showGhost(point);
        } else if (gesture.kind === 'move') {
          const dx = point.x - gesture.origin.x;
          const dy = point.y - gesture.origin.y;
          if (!gesture.moved && Math.abs(dx) + Math.abs(dy) < 0.6) return;
          gesture.moved = true;
          // Several pieces move together by the same (grid-sized) step.
          if (gesture.refs.length > 1) {
            const sdx = ed.ui.snap && !free ? Math.round(dx / TX) * TX : dx;
            const sdy = ed.ui.snap && !free ? Math.round(dy / TY) * TY : dy;
            gesture.refs.forEach((ref) => moveRef(ref, sdx, sdy, gesture.starts.get(ref), true));
          } else {
            moveRef(gesture.refs[0], dx, dy, gesture.starts.get(gesture.refs[0]), free);
          }
          repositionNodes(gesture.refs);
          renderInspectorLive();
        } else if (gesture.kind === 'resize') {
          resizeRef(gesture.ref, gesture.start, gesture.handle, point, free);
          gesture.moved = true;
          repositionNodes([gesture.ref]);
          renderInspectorLive();
        } else if (gesture.kind === 'rotate') {
          rotateRef(gesture.ref, gesture.start, point, event.shiftKey);
          gesture.moved = true;
          repositionNodes([gesture.ref]);
          renderInspectorLive();
        } else if (gesture.kind === 'gap') {
          const x = clamp(ed.ui.snap ? Math.round(point.x / TX) * TX : point.x, 0, ed.scene.width);
          const from = Math.min(gesture.from, x);
          const to = Math.max(gesture.from, x);
          let gap = ed.scene.ground.gaps.find((item) => item.id === gesture.id);
          if (!gap && to - from >= 2) {
            gap = { id: gesture.id, from, to, fill: 'water' };
            ed.scene.ground.gaps.push(gap);
          }
          if (gap) {
            gap.from = r2(from);
            gap.to = r2(to);
            renderGround();
            renderHitboxes();
          }
        } else if (gesture.kind === 'marquee') {
          const left = Math.min(gesture.origin.x, point.x);
          const right = Math.max(gesture.origin.x, point.x);
          const top = Math.min(gesture.origin.y, point.y);
          const bottom = Math.max(gesture.origin.y, point.y);
          const { ux, uy } = px();
          Object.assign(dom.marquee.style, {
            left: `${(left - ed.ui.camX) * ux}px`, top: `${(top - ed.ui.camY) * uy}px`,
            width: `${(right - left) * ux}px`, height: `${(bottom - top) * uy}px`
          });
          dom.marquee.classList.remove('hidden');
          const hits = [];
          nodes.forEach((node, ref) => {
            if (ref.startsWith('g:') || ref.startsWith('e:')) return;
            const box = boxOf(ref);
            if (box && box.x + box.w / 2 >= left && box.x - box.w / 2 <= right && box.y + box.h / 2 >= top && box.y - box.h / 2 <= bottom) hits.push(ref);
          });
          ed.ui.selection = [...new Set([...gesture.base, ...hits])];
          renderSelection();
        }
      });

      const finish = (event) => {
        if (!gesture) return;
        const done = gesture;
        gesture = null;
        if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
        if (done.kind === 'pan') {
          if (done.deselect && !done.moved && ed.ui.selection.length) setSelection([]);
          return;
        }
        if (done.kind === 'place') {
          if (!done.moved && event.type === 'pointerup') placeArmed(worldPoint(event.clientX, event.clientY));
          return;
        }
        if (done.kind === 'marquee') {
          dom.marquee.classList.add('hidden');
          setSelection(ed.ui.selection);
          return;
        }
        if (done.kind === 'gap') {
          const gap = ed.scene.ground.gaps.find((item) => item.id === done.id);
          if (gap) ed.ui.selection = [`g:${gap.id}`];
          commit();
          return;
        }
        if ((done.kind === 'move' || done.kind === 'resize' || done.kind === 'rotate') && done.moved) commit();
      };
      stage.addEventListener('pointerup', finish);
      stage.addEventListener('pointercancel', finish);
      stage.addEventListener('pointerleave', () => { if (!gesture) dom.ghost.classList.add('hidden'); });

      // Ctrl + wheel zooms; Shift + wheel (or a sideways swipe) moves along the
      // stage; a plain wheel still scrolls the page.
      stage.addEventListener('wheel', (event) => {
        if (!ed.active) return;
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          zoomTo(ed.ui.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), event.clientX, event.clientY);
          return;
        }
        const sideways = Math.abs(event.deltaX) > Math.abs(event.deltaY);
        if (!event.shiftKey && !sideways) return;
        event.preventDefault();
        const { ux } = px();
        ed.ui.camX += (sideways ? event.deltaX : event.deltaY) / ux;
        applyCamera();
      }, { passive: false });

      // Library pieces can also be dragged onto the stage.
      stage.addEventListener('dragover', (event) => {
        if (!ed.dragArmed) return;
        event.preventDefault();
        showGhostFor(ed.dragArmed, worldPoint(event.clientX, event.clientY));
      });
      stage.addEventListener('dragleave', () => dom.ghost.classList.add('hidden'));
      stage.addEventListener('drop', (event) => {
        if (!ed.dragArmed) return;
        event.preventDefault();
        const armed = ed.dragArmed;
        ed.dragArmed = null;
        dom.ghost.classList.add('hidden');
        ed.placeArmedAt(armed, event.clientX, event.clientY);
      });
    }

    function showGhostFor(armed, point) {
      const previous = ed.ui.armed;
      ed.ui.armed = armed;
      showGhost(point);
      ed.ui.armed = previous;
    }

    // ---------- Context menu ----------------------------------------------------
    function closeContextMenu() {
      if (dom.menu) { dom.menu.remove(); dom.menu = null; }
    }
    function openContextMenu(event) {
      closeContextMenu();
      const has = selectionItems().length > 0;
      const item = (label, run, enabled = true, danger = false) => el('button', {
        type: 'button', class: `pe-menu-item${danger ? ' is-danger' : ''}`, text: label, disabled: !enabled,
        on: { click() { closeContextMenu(); run(); } }
      });
      const point = worldPoint(event.clientX, event.clientY);
      dom.menu = el('div', { class: 'pe-menu', role: 'menu' }, [
        item('Duplicate', duplicateSelection, has),
        item('Copy', copySelection, has),
        item('Paste here', () => { if (ed.clipboard) { pasteClipboard(); } }, Boolean(ed.clipboard)),
        item('Flip', flipSelection, has),
        item('Bring forward', () => restackSelection(1), has),
        item('Send backward', () => restackSelection(-1), has),
        item('Add a story event here', () => {
          const event = ed.addEvent({ type: 'reach', x: r2(clamp(point.x, 0, ed.scene.width)) });
          ed.openEvent(event.id);
        }),
        item('Add a checkpoint here', () => {
          const checkpoint = { id: makeId('cp'), x: r2(clamp(point.x, 0, ed.scene.width)) };
          ed.scene.checkpoints.push(checkpoint);
          ed.ui.selection = [`k:${checkpoint.id}`];
          commit();
        }),
        item('Start the player here', () => {
          ed.scene.player.x = r2(clamp(point.x, 0, ed.scene.width));
          ed.scene.player.y = r2(clamp(GROUND_Y - snapBottom(point.x, point.y, [], 400), 0, GROUND_Y));
          commit();
        }),
        item('Delete', deleteSelection, has && !(ed.ui.selection.length === 1 && ed.ui.selection[0] === 'player'), true)
      ]);
      document.body.appendChild(dom.menu);
      const rect = dom.menu.getBoundingClientRect();
      dom.menu.style.left = `${Math.min(event.clientX, window.innerWidth - rect.width - 8)}px`;
      dom.menu.style.top = `${Math.min(event.clientY, window.innerHeight - rect.height - 8)}px`;
    }
    document.addEventListener('pointerdown', (event) => { if (dom.menu && !dom.menu.contains(event.target)) closeContextMenu(); });

    // ---------- Keyboard --------------------------------------------------------
    function handleKey(event) {
      if (!ed.active) return false;
      const target = event.target;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || ''))) return false;
      if (document.querySelector('.ed-modal:not(.hidden)')) return false;
      const key = event.key.toLowerCase();
      const ctrl = event.ctrlKey || event.metaKey;
      if (key === 'escape') {
        if (ed.ui.armed) { arm(null); return true; }
        if (ed.ui.tool !== 'select') { setTool('select'); return true; }
        if (ed.ui.selection.length) { setSelection([]); return true; }
        return false;
      }
      if (ctrl && key === 'd') return duplicateSelection();
      if (ctrl && key === 'c') return copySelection();
      if (ctrl && key === 'v') return pasteClipboard();
      if (ctrl) return false;
      if (key === 'delete' || key === 'backspace') return deleteSelection();
      const step = event.shiftKey ? 5 : 1;
      const stepX = ed.ui.snap ? TX * step : 0.5 * step;
      const stepY = ed.ui.snap ? TY * step : 0.5 * step;
      if (key === 'arrowleft') return nudgeSelection(-stepX, 0);
      if (key === 'arrowright') return nudgeSelection(stepX, 0);
      if (key === 'arrowup') return nudgeSelection(0, -stepY);
      if (key === 'arrowdown') return nudgeSelection(0, stepY);
      if (key === 'r') return rotateSelection(event.shiftKey ? -15 : 15);
      if (key === 'f') return flipSelection();
      if (key === ']') return restackSelection(1);
      if (key === '[') return restackSelection(-1);
      if (key === 'v') { setTool('select'); return true; }
      if (key === 'h') { setTool('pan'); return true; }
      if (key === 'g') { setTool('gap'); return true; }
      if (key === 'c') { setTool('checkpoint'); return true; }
      if (key === ' ') { ed.spaceHeld = true; dom.stage.dataset.tool = 'pan'; return true; }
      return false;
    }
    document.addEventListener('keydown', (event) => { if (handleKey(event)) event.preventDefault(); });
    document.addEventListener('keyup', (event) => {
      if (event.key === ' ' && ed.spaceHeld) { ed.spaceHeld = false; updateHint(); }
    });

    // ---------- Toolbar state ---------------------------------------------------
    function renderToolbar() {
      if (!dom.toolbar) return;
      dom.toolbar.querySelectorAll('[data-tool]').forEach((button) => {
        const on = !ed.ui.armed && button.dataset.tool === ed.ui.tool;
        button.classList.toggle('is-active', on);
        button.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      dom.snapBtn.classList.toggle('is-active', ed.ui.snap);
      dom.snapBtn.setAttribute('aria-pressed', ed.ui.snap ? 'true' : 'false');
      dom.hitboxBtn.classList.toggle('is-active', ed.ui.hitboxes);
      dom.hitboxBtn.setAttribute('aria-pressed', ed.ui.hitboxes ? 'true' : 'false');
      const types = selectionItems().map((ref) => resolve(ref).type);
      const has = types.length > 0;
      const [duplicate, rotateLeft, rotateRight, flip, front, back, remove] = dom.editButtons;
      duplicate.disabled = !types.some((type) => ['block', 'image', 'legacy', 'character', 'checkpoint'].includes(type));
      rotateLeft.disabled = rotateRight.disabled = !types.some((type) => type === 'image' || type === 'legacy');
      flip.disabled = !types.includes('image');
      front.disabled = back.disabled = !types.some((type) => ['block', 'image', 'legacy'].includes(type));
      remove.disabled = !has || (types.length === 1 && types[0] === 'player');
      updateHint();
    }

    // ---------- Minimap -----------------------------------------------------------
    function bindMinimap() {
      const move = (event) => {
        const rect = dom.minimap.getBoundingClientRect();
        const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        lookAt(ratio * ed.scene.width);
      };
      dom.minimap.addEventListener('pointerdown', (event) => {
        dom.minimap.setPointerCapture(event.pointerId);
        move(event);
      });
      dom.minimap.addEventListener('pointermove', (event) => { if (dom.minimap.hasPointerCapture(event.pointerId)) move(event); });
    }
    function renderMinimap() {
      if (!ed.scene) return;
      const width = ed.scene.width;
      const pct = (x) => `${clamp(x / width, 0, 1) * 100}%`;
      dom.minimap.replaceChildren();
      ed.scene.ground.gaps.forEach((gap) => {
        dom.minimap.appendChild(el('span', { class: `pe-mini-gap is-${gap.fill}`, style: { left: pct(gap.from), width: pct(gap.to - gap.from) } }));
      });
      ed.scene.objects.forEach((object) => {
        if (object.kind === 'image' && !object.solid && !object.hazard) return;
        const box = boxOf(`o:${object.id}`);
        dom.minimap.appendChild(el('span', { class: `pe-mini-block${object.hazard ? ' is-hazard' : ''}`, style: { left: pct(box.x - box.w / 2), width: pct(Math.max(box.w, 2)) } }));
      });
      ed.scene.characters.forEach((character) => dom.minimap.appendChild(el('span', { class: 'pe-mini-char', style: { left: pct(character.x) }, title: character.name })));
      ed.scene.checkpoints.forEach((checkpoint) => dom.minimap.appendChild(el('span', { class: 'pe-mini-flag', style: { left: pct(checkpoint.x) } })));
      ed.scene.events.forEach((event, index) => {
        const character = event.trigger.type === 'talk' ? ed.scene.characters.find((item) => item.id === event.trigger.character) : null;
        const x = event.trigger.type === 'reach' ? num(event.trigger.x) : character ? character.x : 0;
        dom.minimap.appendChild(el('span', { class: 'pe-mini-event', style: { left: pct(x) }, text: String(index + 1), title: event.label || `Event ${index + 1}` }));
      });
      dom.minimap.appendChild(el('span', { class: 'pe-mini-player', style: { left: pct(ed.scene.player.x) } }));
      dom.miniWindow = el('span', { class: 'pe-mini-window' });
      dom.minimap.appendChild(dom.miniWindow);
      renderMinimapWindow();
    }
    function renderMinimapWindow() {
      if (!dom.miniWindow || !ed.scene) return;
      const view = viewSize();
      const width = ed.scene.width;
      dom.miniWindow.style.left = `${clamp(ed.ui.camX / width, 0, 1) * 100}%`;
      dom.miniWindow.style.width = `${clamp(view.w / width, 0.01, 1) * 100}%`;
    }

    // ---------- Library -------------------------------------------------------------
    const LIBRARY_TABS = [
      ['blocks', 'Blocks'], ['hazards', 'Hazards'], ['scenery', 'Scenery'], ['characters', 'Characters'],
      ['backgrounds', 'Backgrounds'], ['uploads', 'My uploads']
    ];
    function buildLibrary() {
      const root = options.libraryRoot;
      root.replaceChildren();
      dom.libTabs = el('div', { class: 'ed-tabs pe-lib-tabs', role: 'tablist' }, LIBRARY_TABS.map(([id, label]) => el('button', {
        type: 'button', role: 'tab', text: label, dataset: { tab: id },
        on: { click() { ed.ui.libraryTab = id; ed.ui.libraryCategory = ''; renderLibrary(); } }
      })));
      dom.libSearch = el('input', { type: 'search', class: 'pe-lib-search', placeholder: 'Search the library…', 'aria-label': 'Search the library' });
      dom.libSearch.addEventListener('input', () => { ed.ui.librarySearch = dom.libSearch.value.trim().toLowerCase(); renderLibrary(); });
      dom.libNote = el('p', { class: 'pe-lib-note' });
      dom.libCats = el('div', { class: 'pe-lib-cats' });
      dom.libGrid = el('div', { class: 'pe-lib-grid' });
      dom.libStatus = el('span', { class: 'pe-lib-status', role: 'status' });
      // The tab's how-to note opens from a small info button beside the search.
      dom.libInfo = UI.iconButton('info', 'How to use this tab', () => {
        const open = !dom.libNote.classList.contains('is-open');
        dom.libNote.classList.toggle('is-open', open);
        dom.libInfo.classList.toggle('is-active', open);
        dom.libInfo.setAttribute('aria-expanded', open ? 'true' : 'false');
      }, { class: 'pe-lib-info' });
      dom.libInfo.setAttribute('aria-expanded', 'false');
      root.append(dom.libTabs, el('div', { class: 'pe-lib-searchrow' }, [dom.libSearch, dom.libInfo]), dom.libNote, dom.libCats, dom.libGrid);
      UI.uploads.onChange(() => { if (ed.active) renderLibrary(); });
    }

    // keepName: the label is a character's name, never translated.
    function libItem({ label, thumb, active, armed, onClick, extra, title, keepName }) {
      const button = el('button', {
        type: 'button', class: `pe-lib-item${active ? ' is-active' : ''}`, title: title || label, 'aria-pressed': active ? 'true' : 'false',
        draggable: Boolean(armed),
        on: { click: onClick }
      }, [el('span', { class: 'pe-lib-thumb' }, [thumb]), el('span', { class: 'pe-lib-label', translate: keepName ? 'no' : null, text: label })]);
      if (armed) {
        button.addEventListener('dragstart', (event) => {
          ed.dragArmed = armed;
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData('text/plain', label);
        });
        button.addEventListener('dragend', () => { ed.dragArmed = null; dom.ghost.classList.add('hidden'); });
      }
      const extras = [].concat(extra || []).filter(Boolean);
      return extras.length ? el('div', { class: 'pe-lib-cell' }, [button, ...extras]) : button;
    }

    function tileThumb(tiles) {
      const node = el('span', { class: 'pe-tile-thumb' });
      renderTiles(node, tiles, 3 * TX, 2 * TY);
      return node;
    }
    const img = (src) => el('img', { src: url(src), alt: '', loading: 'lazy', draggable: false });
    const isArmed = (kind, id) => Boolean(ed.ui.armed && ed.ui.armed.kind === kind && ed.ui.armed.id === id);
    const matches = (label) => !ed.ui.librarySearch || String(label).toLowerCase().includes(ed.ui.librarySearch);

    function categoryChips(list) {
      const cats = [...new Set(list.map((item) => item.category).filter(Boolean))];
      dom.libCats.replaceChildren(...['', ...cats].map((category) => el('button', {
        type: 'button', class: `pe-chip${ed.ui.libraryCategory === category ? ' is-active' : ''}`, text: category || 'All',
        on: { click() { ed.ui.libraryCategory = category; renderLibrary(); } }
      })));
      return list.filter((item) => (!ed.ui.libraryCategory || item.category === ed.ui.libraryCategory) && matches(item.label));
    }

    async function renderLibrary() {
      if (!dom.libGrid || !ed.active) return;
      const tab = ed.ui.libraryTab;
      dom.libTabs.querySelectorAll('[data-tab]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.tab === tab);
        button.setAttribute('aria-selected', button.dataset.tab === tab ? 'true' : 'false');
      });
      dom.libCats.replaceChildren();
      dom.libGrid.replaceChildren();
      dom.libGrid.dataset.tab = tab;
      const notes = {
        blocks: 'Solid ground pieces on the tile grid. Pick one, then click the stage to place it; drag its edges to make it longer or taller.',
        hazards: 'Touching a hazard sends the player back to the last checkpoint.',
        scenery: 'Decoration the player walks past. Select a piece to make it solid, a hazard, glow, or move in front of characters.',
        characters: 'Characters can stand, wander, walk back and forth or follow the player, and talk in your story events.',
        backgrounds: 'The scenery behind the whole stage. Pick one, or upload your own picture.',
        uploads: 'Your own pictures (PNG, JPG, WEBP, GIF), sounds (MP3) and videos (MP4, WEBM). Pictures can be placed on the stage.'
      };
      dom.libNote.textContent = notes[tab];
      // Each picture section starts with its upload button, then the pictures
      // uploaded to it (newest first, each with a bin), then the library's own.
      const section = { blocks: 'block', hazards: 'hazard', scenery: 'scenery', characters: 'character', backgrounds: 'background' }[tab];
      let sectionUploads = [];
      if (section) {
        const uploadOptions = { section, aspect: section === 'background' ? 16 / 9 : null };
        const labels = { block: 'Upload a block', hazard: 'Upload a hazard', scenery: 'Upload scenery', character: 'Upload your own character', background: 'Upload a background' };
        const box = el('div', { class: 'pe-lib-upload' });
        if (section === 'character') {
          const sheetBox = el('input', { type: 'checkbox' });
          uploadOptions.sheet = () => sheetBox.checked;
          box.append(
            UI.uploadButton(labels.character, 'image/png,image/jpeg,image/webp,image/gif', (item) => {
              arm({ kind: 'uploadCharacter', id: item.url, src: item.url, sheet: item.sheet, name: item.name });
            }, dom.libStatus, uploadOptions),
            el('label', { class: 'pe-lib-check', title: 'A sprite sheet in the KoobD layout: 32 x 46 pixel frames, 6 across, rows for standing, running and jumping.' }, [sheetBox, el('span', { text: 'It is an animated sprite sheet (32×46 frames)' })])
          );
        } else if (section === 'background') {
          box.append(UI.uploadButton(labels.background, 'image/png,image/jpeg,image/webp,image/gif', (item) => {
            ed.scene.background.id = '';
            ed.scene.background.asset = item.url;
            commit();
          }, dom.libStatus, uploadOptions));
        } else {
          const role = { block: 'solid', hazard: 'hazard', scenery: 'scenery' }[section];
          box.append(UI.uploadButton(labels[section], 'image/png,image/jpeg,image/webp,image/gif', (item) => {
            arm({ kind: 'upload', id: item.url, src: item.url, name: item.name, role });
          }, dom.libStatus, uploadOptions));
        }
        box.append(dom.libStatus);
        dom.libGrid.appendChild(box);
        sectionUploads = (await UI.uploads.forSection(section)).filter((item) => matches(item.name));
        if (ed.ui.libraryTab !== tab) return;
      }
      const bin = (item) => UI.deleteUploadButton(item);

      if (tab === 'blocks' || tab === 'hazards' || tab === 'scenery') {
        const role = { blocks: 'solid', hazards: 'hazard', scenery: 'scenery' }[tab];
        sectionUploads.forEach((item) => {
          const armed = { kind: 'upload', id: item.url, src: item.url, name: item.name, role };
          dom.libGrid.appendChild(libItem({
            label: item.name, thumb: img(item.url), active: isArmed('upload', item.url),
            armed, onClick: () => arm(armed), extra: bin(item)
          }));
        });
      }
      if (tab === 'blocks') {
        categoryChips(LIB.materials).forEach((material) => dom.libGrid.appendChild(libItem({
          label: material.label, thumb: tileThumb(material.tiles), active: isArmed('block', material.id),
          armed: { kind: 'block', id: material.id }, onClick: () => arm({ kind: 'block', id: material.id })
        })));
      } else if (tab === 'hazards') {
        LIB.hazards.filter((hazard) => matches(hazard.label)).forEach((hazard) => dom.libGrid.appendChild(libItem({
          label: hazard.label, thumb: img(hazard.src), active: isArmed('hazard', hazard.id),
          armed: { kind: 'hazard', id: hazard.id }, onClick: () => arm({ kind: 'hazard', id: hazard.id })
        })));
      } else if (tab === 'scenery') {
        categoryChips(LIB.props).forEach((prop) => dom.libGrid.appendChild(libItem({
          label: prop.label, thumb: img(prop.src), active: isArmed('prop', prop.id),
          armed: { kind: 'prop', id: prop.id }, onClick: () => arm({ kind: 'prop', id: prop.id })
        })));
      } else if (tab === 'characters') {
        // Uploaded characters are characters: they stand, walk, talk and animate like the rest.
        sectionUploads.forEach((item) => {
          const armed = { kind: 'uploadCharacter', id: item.url, src: item.url, sheet: item.sheet, name: item.name };
          dom.libGrid.appendChild(libItem({
            label: item.name, thumb: item.sheet ? el('span', { class: 'pe-sheet' }, [img(item.url)]) : img(item.url),
            active: isArmed('uploadCharacter', item.url), keepName: true,
            title: item.sheet ? `${item.name} (animated)` : `${item.name} (still picture)`,
            armed, onClick: () => arm(armed), extra: bin(item)
          }));
        });
        LIB.characters.filter((character) => matches(character.label)).forEach((character) => dom.libGrid.appendChild(libItem({
          label: character.label, thumb: img(character.portrait), active: isArmed('character', character.id), keepName: true,
          title: character.animated ? `${character.label} (animated)` : `${character.label} (still picture)`,
          armed: { kind: 'character', id: character.id }, onClick: () => arm({ kind: 'character', id: character.id })
        })));
      } else if (tab === 'backgrounds') {
        const bg = ed.scene.background;
        const useUpload = (item) => {
          ed.scene.background.id = '';
          ed.scene.background.asset = item.url;
          commit();
          renderLibrary();
        };
        // A picture in use that is not among the uploads (e.g. from another teacher's copy).
        if (bg.asset && !bg.id && !sectionUploads.some((item) => item.url === bg.asset)) {
          dom.libGrid.appendChild(libItem({ label: 'Your picture', thumb: img(bg.asset), active: true, onClick() {} }));
        }
        sectionUploads.forEach((item) => dom.libGrid.appendChild(libItem({
          label: item.name, thumb: el('span', { class: 'pe-bg-thumb', style: { backgroundImage: `url('${url(item.url)}')` } }),
          active: !bg.id && bg.asset === item.url, onClick: () => useUpload(item), extra: bin(item)
        })));
        LIB.backgrounds.filter((item) => matches(item.label)).forEach((item) => {
          const thumb = el('span', { class: 'pe-bg-thumb', style: { backgroundColor: item.color, backgroundImage: item.layers.map((layer) => `url('${url(layer)}')`).join(',') } });
          dom.libGrid.appendChild(libItem({
            label: item.label, thumb, active: bg.id === item.id,
            onClick() {
              ed.scene.background.id = item.id;
              ed.scene.background.asset = '';
              ed.scene.background.color = item.color;
              commit();
              renderLibrary();
            }
          }));
        });
      } else if (tab === 'uploads') {
        dom.libGrid.appendChild(el('div', { class: 'pe-lib-upload' }, [
          UI.uploadButton('Upload a file', 'image/png,image/jpeg,image/webp,image/gif,audio/mpeg,video/mp4,video/webm', () => {}, dom.libStatus),
          dom.libStatus
        ]));
        const items = (await UI.uploads.list()).filter((item) => matches(item.name));
        if (ed.ui.libraryTab !== 'uploads') return;
        if (!items.length) dom.libGrid.appendChild(el('p', { class: 'pe-lib-empty', text: 'Nothing uploaded yet.' }));
        items.forEach((item) => {
          if (item.kind === 'image') {
            dom.libGrid.appendChild(libItem({
              label: item.name, thumb: img(item.url), active: isArmed('upload', item.url),
              armed: { kind: 'upload', id: item.url, src: item.url, name: item.name },
              onClick: () => arm({ kind: 'upload', id: item.url, src: item.url, name: item.name }),
              extra: [bin(item), el('button', { type: 'button', class: 'pe-lib-mini', text: 'Add to event', title: 'Show it full-screen in a story event', on: { click: () => ed.addMediaBeat({ image: item.url }) } })]
            }));
          } else if (item.kind === 'video') {
            dom.libGrid.appendChild(libItem({
              label: item.name, thumb: el('video', { src: url(item.url), muted: true, preload: 'metadata' }),
              title: 'Click to add this video to a story event', onClick: () => ed.addMediaBeat({ video: item.url }),
              extra: bin(item)
            }));
          } else {
            const isMusic = ed.scene.music && ed.scene.music.asset === item.url;
            dom.libGrid.appendChild(el('div', { class: 'pe-lib-audio' }, [
              bin(item),
              icon('music'),
              el('span', { class: 'pe-lib-label', text: item.name }),
              el('audio', { controls: true, preload: 'none', src: url(item.url) }),
              el('button', {
                type: 'button', class: `pe-lib-mini${isMusic ? ' is-active' : ''}`, text: isMusic ? 'Stage music ✓' : 'Use as stage music',
                on: { click() { ed.scene.music = isMusic ? null : { asset: item.url, volume: 0.6 }; commit(); renderLibrary(); } }
              })
            ]));
          }
        });
      }
    }
    ed.renderLibrary = renderLibrary;

    // ---------- Inspector (js/platform-editor-panels.js) -------------------------
    function renderInspector() {
      if (!ed.active || !window.KoobdPlatformEditor.panels.render) return;
      window.KoobdPlatformEditor.panels.render(ed, options.inspectorRoot);
      // An open popup shows the same values, so it is redrawn with them.
      if (ed.modal) ed.modal.refresh();
    }
    ed.renderInspector = renderInspector;
    // While dragging: only refresh the numbers shown for the selection.
    function renderInspectorLive() {
      if (window.KoobdPlatformEditor.panels.live) window.KoobdPlatformEditor.panels.live(ed, options.inspectorRoot);
    }

    // Story events helpers used by the library and the panels.
    ed.addEvent = (trigger) => {
      const event = {
        id: makeId('ev'),
        label: '',
        trigger: { type: 'start', x: 0, character: '', ...trigger },
        optional: false,
        cutscene: { focus: [], holdCamera: false },
        beats: [],
        after: { type: 'continue' }
      };
      // Keep events in the order the player meets them.
      const at = (item) => (item.trigger.type === 'start' ? -1 : item.trigger.type === 'reach' ? num(item.trigger.x) : (ed.scene.characters.find((c) => c.id === item.trigger.character) || { x: 0 }).x);
      const index = ed.scene.events.findIndex((item) => at(item) > at(event));
      if (index < 0) ed.scene.events.push(event); else ed.scene.events.splice(index, 0, event);
      return event;
    };
    ed.openEvent = (id) => {
      ed.ui.activeEventId = id;
      ed.ui.tab = 'events';
      commit();
      const event = ed.scene.events.find((item) => item.id === id);
      if (event && event.trigger.type === 'reach') lookAt(num(event.trigger.x));
      options.onRevealInspector && options.onRevealInspector();
    };
    ed.addMediaBeat = (media) => {
      let event = ed.scene.events.find((item) => item.id === ed.ui.activeEventId);
      if (!event) {
        event = ed.addEvent({ type: 'reach', x: ed.viewCentreX() });
        event.label = 'Cutscene';
      }
      event.beats.push({ id: makeId('beat'), type: 'frame', image: media.image || '', video: media.video || '', transition: 'crossfade' });
      ed.ui.activeEventId = event.id;
      ed.ui.tab = 'events';
      commit();
      options.notify && options.notify(`Added to story event “${event.label || 'Event'}”.`);
      options.onRevealInspector && options.onRevealInspector();
    };

    // ---------- Public ----------------------------------------------------------------
    buildStage();
    buildLibrary();

    return {
      ed,
      // Shows a Platform Mode page in the editor.
      // keepView: stay where the camera is and keep the selection (after undo).
      load(page, keepView = false) {
        const wasActive = ed.active;
        if (ed.modal && ed.page !== page) ed.modal.close();
        ed.page = page;
        ed.scene = normalizeScene(page, options.legacyBackgrounds || []);
        ed.active = true;
        if (!keepView || !wasActive) {
          ed.ui.selection = [];
          ed.ui.armed = null;
          ed.ui.activeEventId = null;
          ed.ui.zoom = 1;
          ed.ui.camY = WORLD_H;
          ed.ui.camX = ed.scene.player.x - 15;
        } else {
          ed.ui.selection = ed.ui.selection.filter((ref) => resolve(ref));
        }
        renderWorld();
        renderToolbar();
        renderLibrary();
        renderInspector();
      },
      hide() {
        if (ed.modal) ed.modal.close();
        ed.active = false;
        ed.ui.armed = null;
        closeContextMenu();
      },
      refresh() { if (ed.active) { renderWorld(); renderInspector(); } }
    };
  }

  window.KoobdPlatformEditor = Object.assign(window.KoobdPlatformEditor || {}, { create, normalizeScene, newScene, GROUND_Y, TILE_X: TX, TILE_Y: TY, CHAR_H });
  window.KoobdPlatformEditor.panels = window.KoobdPlatformEditor.panels || {};
})();
