// KoobD's Platform Mode library: every ready-made piece a story creator can use
// in the Platform Mode editor, from The False Knight's own art - its tiles,
// scenery, backgrounds, animated characters and storyboard illustrations - plus
// hazards and the profile characters. The editor shows these in its library,
// js/platform-story-compiler.js turns them into the engine's world, and the
// server (auth.php, koobdPlatformerLibraryPath) only accepts asset paths that
// are in this folder set or uploaded by the teacher.
//
// Paths are stored as written on disk (with spaces); use KoobdPlatformLibrary.url()
// to turn one into a URL.
(function () {
  const FK = 'The False Knight/';
  const tile = (name) => `${FK}platforms/tiles/${name}.png`;
  const prop = (name) => `${FK}environment/props/${name}.png`;
  const scenery = (name) => `${FK}environment/backgrounds/${name}.png`;

  // --- Blocks: tile materials, laid out on the same grid as The False Knight --
  // One tile is 4.5 x 8 units (square on screen). `cap` is the top row,
  // `fill` the rest; *Left/*Right are the outlined end columns.
  const materials = [
    { id: 'earth', label: 'Grass & Dirt', category: 'Ground', tiles: { cap: tile('grass-top'), capLeft: tile('grass-left'), capRight: tile('grass-right'), fill: tile('dirt'), fillLeft: tile('dirt-left'), fillRight: tile('dirt-right') } },
    { id: 'rock', label: 'Stone Block', category: 'Ground', tiles: { fill: tile('stone-block') } },
    { id: 'brick', label: 'Stone Brick', category: 'Ground', tiles: { fill: tile('stone-brick') } },
    { id: 'snowRock', label: 'Snowy Rock', category: 'Ground', tiles: { cap: tile('snow-rock'), fill: tile('stone-block') } },
    { id: 'castle', label: 'Castle Stone', category: 'Buildings', tiles: { fill: tile('castle-block') } },
    { id: 'carpetFloor', label: 'Carpet Floor', category: 'Buildings', tiles: { cap: tile('carpet'), fill: tile('castle-block') } },
    { id: 'woodFloor', label: 'Wood Floor', category: 'Buildings', tiles: { cap: tile('wood-floor'), fill: tile('wood-floor') } },
    { id: 'house', label: 'House', category: 'Buildings', tiles: { cap: tile('roof'), fill: tile('house-wall') } },
    { id: 'bookshelf', label: 'Bookshelf', category: 'Buildings', tiles: { fill: tile('bookshelf') } },
    { id: 'crate', label: 'Wooden Crate', category: 'Objects', tiles: { fill: tile('wood-crate') } },
    { id: 'barrel', label: 'Barrel', category: 'Objects', tiles: { fill: tile('barrel') } },
    { id: 'log', label: 'Log', category: 'Objects', tiles: { fill: tile('log') } },
    { id: 'plank', label: 'Plank Bridge', category: 'Objects', tiles: { fill: tile('plank-mid') }, solid: 6 / 16 },
  ];

  // --- Hazards: touching one sends the player back to the last checkpoint ---
  const hazards = [
    { id: 'spikes', label: 'Spikes', src: 'assets/images/platform/spikes.svg', w: 9, h: 8 },
    { id: 'ice-spikes', label: 'Ice Spikes', src: 'assets/images/platform/ice-spikes.svg', w: 9, h: 8 },
    { id: 'thorns', label: 'Thorns', src: prop('thorn-vine'), w: 10, h: 9 },
    { id: 'saw', label: 'Saw Blade', src: 'assets/images/platform/saw.svg', w: 8, h: 14, anim: 'spin' },
  ];

  // --- Scenery: props that never block the way ------------------------------
  // `h` is the height The False Knight draws them at; `anim` and `light` are
  // its defaults for that prop (the editor can change them).
  const props = [
    ['big-tree', 'Big Tree', 'Nature', 42], ['white-tree', 'White Tree', 'Nature', 42], ['world-tree', 'World Tree', 'Nature', 82, { layer: 'far' }],
    ['bush', 'Bush', 'Nature', 14], ['tall-grass', 'Tall Grass', 'Nature', 13, { anim: 'sway', layer: 'front' }],
    ['thorn-vine', 'Thorn Vine', 'Nature', 9, { anim: 'sway' }], ['vine', 'Vine', 'Nature', 20, { anim: 'banner' }],
    ['twig', 'Twig', 'Nature', 4], ['rubble', 'Rubble', 'Nature', 6], ['glow-mushroom', 'Glowing Mushroom', 'Nature', 6, { anim: 'glow', light: true }],
    ['glow-root', 'Glowing Root', 'Nature', 6, { anim: 'glow', light: true }],
    ['firefly', 'Firefly', 'Sky & Weather', 2, { anim: 'float', light: true, feet: 30 }], ['pollen', 'Pollen', 'Sky & Weather', 2, { anim: 'float', light: true, feet: 30 }],
    ['music-note', 'Music Note', 'Sky & Weather', 5.5, { anim: 'float', light: true, feet: 40 }], ['moon', 'Moon', 'Sky & Weather', 8, { light: true, feet: 64 }],
    ['mist', 'Mist', 'Sky & Weather', 5, { anim: 'drift' }], ['cloud-sea', 'Cloud Sea', 'Sky & Weather', 13, { anim: 'drift', layer: 'far', feet: 30 }],
    ['dust-cloud', 'Dust Cloud', 'Sky & Weather', 11, { anim: 'drift' }],
    ['market-stall', 'Market Stall', 'Town', 18], ['lamp-post', 'Lamp Post', 'Town', 25], ['house-door', 'House Door', 'Town', 11, { layer: 'front' }],
    ['house-gable-6', 'House Roof (6)', 'Town', 22], ['house-gable-7', 'House Roof (7)', 'Town', 24.5], ['city-gate', 'City Gate', 'Town', 66],
    ['trash-can', 'Trash Can', 'Town', 7], ['training-dummy', 'Training Dummy', 'Town', 20],
    ['castle-tower', 'Castle Tower', 'Castle', 120, { layer: 'far' }], ['castle-doorway', 'Castle Doorway', 'Castle', 120, { layer: 'far' }],
    ['room-doorway', 'Room Doorway', 'Castle', 120, { layer: 'far' }], ['gate', 'Gate', 'Castle', 30], ['stone-pillar', 'Stone Pillar', 'Castle', 62, { layer: 'front' }],
    ['banner', 'Banner', 'Castle', 13, { anim: 'banner', feet: 18 }], ['torch', 'Torch', 'Castle', 7.5, { feet: 14 }], ['flame', 'Flame', 'Castle', 3, { anim: 'flicker', light: true, feet: 20 }],
    ['library-facade', 'Library Front', 'Castle', 115, { layer: 'far' }],
    ['bed', 'Bed', 'Indoors', 12], ['canopy-bed', 'Canopy Bed', 'Indoors', 28], ['seer-bed', 'Small Bed', 'Indoors', 17], ['drawer', 'Drawer', 'Indoors', 10],
    ['table', 'Table', 'Indoors', 7], ['candle', 'Candle', 'Indoors', 6.5], ['cauldron', 'Cauldron', 'Indoors', 12], ['potion-shelf', 'Potion Shelf', 'Indoors', 20],
    ['potted-plant', 'Potted Plant', 'Indoors', 10], ['herbs', 'Hanging Herbs', 'Indoors', 9, { anim: 'banner', feet: 46 }],
    ['crystal-ball', 'Crystal Ball', 'Magic', 7.5, { anim: 'glow', light: true }], ['glass-dome', 'Glass Dome', 'Magic', 15, { anim: 'glow', light: true }],
    ['undying-flower', 'Glowing Flower', 'Magic', 13, { anim: 'glow', light: true }],
  ].map(([id, label, category, h, more = {}]) => ({ id, label, category, src: prop(id), h, ...more }));
  // Field flowers: stem and head, swaying (the engine's flower decor).
  ['red', 'yellow', 'pink', 'blue'].forEach((color) => {
    props.push({ id: `flower-${color}`, label: `${color[0].toUpperCase()}${color.slice(1)} Flower`, category: 'Nature', src: prop(`flower-head-${color}`), stem: prop('flower-stem'), h: 9, flower: true });
  });

  // --- Backgrounds -------------------------------------------------------------
  const meadowSky = [`${FK}ALL (PNG)/meadow_03_hills.png`, `${FK}ALL (PNG)/meadow_02_clouds.png`, `${FK}ALL (PNG)/meadow_01_sky.png`];
  const backgrounds = [
    { id: 'meadow', label: 'Meadow', layers: [`${FK}ALL (PNG)/meadow_04_trees_stones.png`, ...meadowSky], color: '#8fd0ee', worldAligned: true },
    { id: 'meadow-hills', label: 'Open Hills', layers: meadowSky, color: '#8fd0ee', worldAligned: true },
    { id: 'town', label: 'Town', layers: [scenery('town'), ...meadowSky], color: '#8fd0ee', worldAligned: true, wholeCopies: true },
    { id: 'deep-forest', label: 'Deep Forest', layers: [scenery('deep-forest')], color: '#224a34' },
    { id: 'enchanted-forest', label: 'Enchanted Forest', layers: [scenery('enchanted-forest')], color: '#1e2c54' },
    { id: 'water-forest', label: 'Water Forest', layers: [scenery('water-forest')], color: '#8acae2' },
    { id: 'hillside', label: 'Hillside', layers: [scenery('hillside'), ...meadowSky.slice(1)], color: '#8fd0ee', worldAligned: true },
    { id: 'mountains', label: 'Mountains', layers: [scenery('mountains'), ...meadowSky.slice(1)], color: '#8fd0ee', worldAligned: true },
    { id: 'mountain-high', label: 'Mountain Peak', layers: [scenery('mountain-high'), ...meadowSky.slice(1)], color: '#8fd0ee', worldAligned: true },
    { id: 'castle-walls', label: 'Castle Walls', layers: [scenery('castle-walls'), ...meadowSky.slice(1)], color: '#8fd0ee', worldAligned: true },
    { id: 'castle-outskirts', label: 'Castle Outskirts', layers: [scenery('castle-outskirts'), ...meadowSky.slice(1)], color: '#8fd0ee', worldAligned: true },
    { id: 'castle-courtyard', label: 'Castle Courtyard', layers: [scenery('castle-courtyard'), ...meadowSky.slice(1)], color: '#8fd0ee', worldAligned: true },
    { id: 'castle-hall-day', label: 'Castle Hall (Day)', layers: [scenery('castle-hall-day')], color: '#585261' },
    { id: 'castle-hall-night', label: 'Castle Hall (Night)', layers: [scenery('castle-hall-night')], color: '#585261' },
    { id: 'princess-room-day', label: 'Royal Room (Day)', layers: [scenery('princess-room-day')], color: '#e6c9d9' },
    { id: 'princess-room-night', label: 'Royal Room (Night)', layers: [scenery('princess-room-night')], color: '#8f7aa3' },
    { id: 'library', label: 'Grand Library', layers: [scenery('library')], color: '#4a3326' },
    { id: 'seer-house', label: 'Cosy Cottage', layers: [scenery('seer-house')], color: '#4a3224' },
    { id: 'city-night', label: 'City at Night', layers: [scenery('city-night')], color: '#18203a' },
  ];

  // --- Characters ------------------------------------------------------------
  // `portrait` is shown in dialogue; `sheet` is the animated 32x46 sprite sheet
  // (rows: idle, run, jump) used in the world. Profile characters have a
  // portrait only and stand still.
  const fkChar = (id, label, portrait, sheet, more = {}) => ({ id, label, portrait: `${FK}${portrait}`, sheet: `${FK}${sheet}`, animated: true, ...more });
  const characters = [
    fkChar('cubebot', 'CubeBot', 'CUBEBOT/CUBEBOT.png', 'CUBEBOT/cubebot_spritesheet.png'),
    fkChar('flowergirl', 'FlowerGirl', 'FLOWERLING/FLOWER.png', 'ALL (PNG)/flowerling_spritesheet.png'),
    fkChar('paperbag', 'PaperBag', 'PAPERBAG/paperbag.png', 'PAPERBAG/paperbag_spritesheet (1).png', { scale: 0.8 }),
    fkChar('old-man', 'Old Man', 'OLD MAN/old .png', 'OLD MAN/oldcubebot_spritesheet.png'),
    fkChar('golem', 'Mr. Golem', 'GOLEM/GOLEM.png', 'ALL (PNG)/golem_spritesheet.png'),
    fkChar('twigg', 'Twigg', 'TWIG/TWIG.png', 'ALL (PNG)/twig_spritesheet.png'),
    fkChar('water-spirit', 'Water Spirit', 'WATER/WATER MAIN.png', 'ALL (PNG)/droplet_spritesheet.png'),
    fkChar('whitey', 'Whitey', 'RAINCAR/RAINCAT.png', 'ALL (PNG)/raincat_spritesheet.png'),
    fkChar('guard', 'Guard', 'GUARD/GUARD.png', 'GUARD/guard_spritesheet.png'),
    fkChar('head-guard', 'Head Guard', 'HEAD GUARD/HEAD GUARD.png', 'HEAD GUARD/head_guard_spritesheet.png'),
    fkChar('seer', 'Seer', 'SEER/SEER.png', 'SEER/seer_spritesheet.png'),
    fkChar('king', 'King', 'KING/KING.png', 'KING/king_spritesheet.png'),
    fkChar('doctor', 'Doctor', 'DOCTOR/DOCTOR.png', 'DOCTOR/doctor_spritesheet.png'),
    { id: 'profile-flower', label: 'Flower Girl', portrait: 'assets/images/characters/FLOWER.png', animated: false },
    { id: 'profile-cubebot', label: 'CubeBot (classic)', portrait: 'assets/images/characters/CUBEBOT.png', animated: false },
    { id: 'profile-golem', label: 'Golem', portrait: 'assets/images/characters/GOLEM.png', animated: false },
    { id: 'profile-raincat', label: 'Raincat', portrait: 'assets/images/characters/RAINCAT.png', animated: false },
    { id: 'profile-twig', label: 'Twig', portrait: 'assets/images/characters/TWIG.png', animated: false },
    { id: 'profile-watermain', label: 'Water Main', portrait: 'assets/images/characters/WATER MAIN.png', animated: false },
  ];
  // The story editor's older characters (koobdCharacterCatalog keys) map onto these.
  const legacyCharacters = { flower: 'profile-flower', cubebot: 'profile-cubebot', golem: 'profile-golem', raincat: 'profile-raincat', twig: 'profile-twig', watermain: 'profile-watermain' };

  // --- Storyboard illustrations (The False Knight's storyboard frames) -------
  const frames = [];
  for (let n = 1; n <= 92; n++) {
    if ([67, 68, 70].includes(n)) continue; // drawn for the book only
    frames.push({ id: `fk-frame-${n}`, label: `Illustration ${n}`, src: `${FK}storyboard/frame-${String(n).padStart(2, '0')}.jpg` });
  }

  // --- Looks -------------------------------------------------------------------
  // Time of day: a tint over the scenery (The False Knight's scene tints).
  const tints = [
    { id: 'day', label: 'Day', filter: '' },
    { id: 'dawn', label: 'Dawn', filter: 'sepia(0.22) hue-rotate(-18deg) saturate(1.1) brightness(0.93)' },
    { id: 'afternoon', label: 'Late Afternoon', filter: 'sepia(0.28) saturate(1.15) brightness(0.97)' },
    { id: 'sunset', label: 'Sunset', filter: 'sepia(0.35) saturate(1.3) hue-rotate(-12deg) brightness(0.95)' },
    { id: 'overcast', label: 'Overcast', filter: 'saturate(0.7) brightness(0.95)' },
    { id: 'lamplit', label: 'Lamplit Night', filter: 'brightness(0.72) saturate(0.85) hue-rotate(-8deg)' },
    { id: 'night', label: 'Night', filter: 'brightness(0.42) saturate(0.7) hue-rotate(-12deg)' },
  ];
  // Ground under the whole stage.
  const grounds = [
    { id: 'earth', label: 'Grass', tiles: materials[0].tiles },
    { id: 'rock', label: 'Stone', tiles: { cap: tile('stone-block'), fill: tile('stone-block') } },
    { id: 'brick', label: 'Stone Floor', tiles: { cap: tile('stone-brick'), fill: tile('stone-brick') } },
    { id: 'snow', label: 'Snow', tiles: { cap: tile('snow-rock'), fill: tile('stone-block') } },
    { id: 'wood', label: 'Wooden Floor', tiles: { cap: tile('wood-floor'), fill: tile('wood-floor') } },
    { id: 'carpet', label: 'Carpet', tiles: { cap: tile('carpet'), fill: tile('castle-block') } },
    { id: 'none', label: 'Plain Colour', tiles: null },
  ];
  // Story text fonts (system fonts, no downloads).
  const fonts = [
    { id: 'default', label: 'KoobD (default)', stack: '' },
    { id: 'storybook', label: 'Storybook', stack: "Georgia, 'Times New Roman', serif" },
    { id: 'rounded', label: 'Rounded', stack: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif" },
    { id: 'handwritten', label: 'Handwritten', stack: "'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', cursive" },
    { id: 'typewriter', label: 'Typewriter', stack: "'Courier New', Courier, monospace" },
    { id: 'clean', label: 'Clean', stack: "Arial, Helvetica, sans-serif" },
    { id: 'display', label: 'Bold Display', stack: "Impact, 'Arial Black', 'Haettenschweiler', sans-serif" },
    { id: 'elegant', label: 'Elegant', stack: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif" },
  ];
  const textSizes = [
    { id: 'small', label: 'Small', scale: 0.9 },
    { id: 'medium', label: 'Medium', scale: 1 },
    { id: 'large', label: 'Large', scale: 1.15 },
  ];
  // A title's own size (the CSS scales it: [data-title-size] in story-shared.css).
  const titleSizes = [
    { id: 'small', label: 'Small' },
    { id: 'large', label: 'Large' },
    { id: 'xlarge', label: 'Extra large' },
  ];

  const byId = (list) => new Map(list.map((item) => [item.id, item]));
  const index = {
    materials: byId(materials), hazards: byId(hazards), props: byId(props), backgrounds: byId(backgrounds),
    characters: byId(characters), frames: byId(frames), tints: byId(tints), grounds: byId(grounds),
    fonts: byId(fonts), textSizes: byId(textSizes),
  };

  window.KoobdPlatformLibrary = {
    materials, hazards, props, backgrounds, characters, legacyCharacters, frames, tints, grounds, fonts, textSizes, titleSizes,
    TILE_X: 4.5,
    TILE_Y: 8,
    get(kind, id) { return index[kind] ? index[kind].get(id) || null : null; },
    // A stored path (spaces and all) as a URL the browser can load.
    url(path) {
      const value = String(path || '');
      if (!value || /^(data:|blob:|https?:)/.test(value)) return value;
      return encodeURI(value).replace(/#/g, '%23');
    },
  };
})();
