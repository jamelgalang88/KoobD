(function () {
  // Every asset comes from this story's own folder, "The False Knight": the
  // provided character art and sprite sheets, the meadow layers and storyboard
  // backgrounds, and the platform tiles cut from the provided tileset.
  // The page passes a version that changes whenever the art does, so a
  // redrawn frame or prop is never shown from an old cached copy.
  const ASSET_VERSION = window.KOOBD_FALSE_KNIGHT_ASSET_VERSION;
  const folder = (path) => encodeURI(`The False Knight/${path}`) + (ASSET_VERSION ? `?v=${ASSET_VERSION}` : '');
  const block = (name) => folder(`platforms/tiles/${name}.png`);

  // --- World grid -------------------------------------------------------------
  // Scene units: x is 1% of the stage width, y is 1% of the stage height, and
  // the world is 300 units tall with an 18-unit ground band at the bottom. The
  // grass of that band is the walkable surface, at GROUND_Y.
  //
  // Everything solid is built from whole 16px tiles from the provided platform
  // tileset (grass/dirt, stone brick, stone block, crate, plank). One tile is
  // TILE_X by TILE_Y units, which is square on a 16:9 stage. Pieces are laid out
  // on that grid in columns and rows, so the drawn tiles, the collision box and
  // the ground all line up exactly - there is no stretched art and no gap
  // between a piece and what it stands on.
  const TILE_X = 4.5;
  const TILE_Y = 8;
  const GROUND_Y = 282;
  const WORLD_BOTTOM = 300;
  // The plank tile only paints the top 6 of its 16 pixel rows.
  const PLANK_SOLID = 6 / 16;
  // Columns are authored in tiles; this is where a column starts in units.
  const colX = (column) => column * TILE_X;
  // The top of something `rows` tiles tall standing on the ground.
  const levelY = (rows) => GROUND_Y - rows * TILE_Y;

  const MATERIALS = {
    // Raised ground: a grass cap over dirt, with outlined edges on exposed sides.
    earth: {
      cap: block('grass-top'), capLeft: block('grass-left'), capRight: block('grass-right'),
      fill: block('dirt'), fillLeft: block('dirt-left'), fillRight: block('dirt-right'),
    },
    brick: { fill: block('stone-brick') },
    rock: { fill: block('stone-block') },
    crate: { fill: block('wood-crate') },
    plank: { fill: block('plank-mid') },
    // Drawn for this story (_make_environment.py) in the tileset's style:
    // town houses (roof over plaster and timber), the castle's dressed stone,
    // the Princess's carpeted floor, library bookshelves, barrels, a fallen
    // log, and snow-capped rock high on the mountain.
    house: { cap: block('roof'), fill: block('house-wall') },
    castle: { fill: block('castle-block') },
    carpetFloor: { cap: block('carpet'), fill: block('castle-block') },
    bookshelf: { fill: block('bookshelf') },
    barrel: { fill: block('barrel') },
    log: { fill: block('log') },
    snowRock: { cap: block('snow-rock'), fill: block('stone-block') },
  };

  const layout = [];
  const registry = new Map();
  const addPiece = (id, material, column, cols, top, bottom, options = {}) => {
    if (registry.has(id)) throw new Error(`Duplicate platform id: ${id}`);
    const left = colX(column);
    const width = cols * TILE_X;
    const height = bottom - top;
    const piece = {
      id,
      type: 'block1',
      tiles: { ...MATERIALS[material], ...(options.tiles || {}) },
      tileWidth: TILE_X,
      tileHeight: TILE_Y,
      x: left + width / 2,
      y: top + height / 2,
      width,
      height,
      rotation: 0,
    };
    if (options.solid) piece.solid = options.solid;
    layout.push(piece);
    registry.set(id, {
      piece, material, left, right: left + width, top, bottom,
      restsOn: options.restsOn || null, anchors: options.anchors || null,
      sunk: options.sunk || 0,
    });
    return piece;
  };

  // A run of adjacent columns standing on the ground - a hill, a staircase, a
  // building - given as [cols, rows] pairs from left to right. Earth gets its
  // outlined edge only down the part of a side that is actually exposed, so a
  // step reads as one landform rather than separate boxes.
  const terrain = (id, material, column, profile) => {
    let at = column;
    profile.forEach(([cols, rows], index) => {
      const previous = index > 0 ? profile[index - 1][1] : 0;
      const next = index < profile.length - 1 ? profile[index + 1][1] : 0;
      const tiles = MATERIALS[material].fillLeft
        ? { leftDepth: Math.max(0, rows - previous) * TILE_Y, rightDepth: Math.max(0, rows - next) * TILE_Y }
        : {};
      // A mound of earth grows out of the ground: its dirt carries on one row
      // into the ground band, covering the ground's grass where the mound
      // stands, so grass shows only on its top and either side of it. That row
      // is below the walking surface, so collision is unaffected.
      const sunk = material === 'earth' ? TILE_Y : 0;
      addPiece(`${id}-${index + 1}`, material, at, cols, levelY(rows), GROUND_Y + sunk, { tiles, sunk });
      at += cols;
    });
  };
  // A piece standing on top of another piece (crates on a floor, rubble on a
  // ledge). It must sit wholly on its support.
  const stack = (id, material, supportId, column, cols, rows) => {
    const support = registry.get(supportId);
    if (!support) throw new Error(`${id}: unknown support ${supportId}`);
    return addPiece(id, material, column, cols, support.top - rows * TILE_Y, support.top, { restsOn: supportId });
  };
  // A stone rising out of a pool or ravine from the bed of the world, with its
  // top `rows` tiles above the ground line.
  const stone = (id, column, cols, rows) => addPiece(id, 'rock', column, cols, levelY(rows), WORLD_BOTTOM, { restsOn: 'bed' });
  // A plank spanning the gap between two supports, flush with both tops.
  const bridge = (id, leftId, rightId) => {
    const a = registry.get(leftId);
    const b = registry.get(rightId);
    if (!a || !b) throw new Error(`${id}: unknown bridge support`);
    const column = Math.round(a.right / TILE_X);
    const cols = Math.round((b.left - a.right) / TILE_X);
    return addPiece(id, 'plank', column, cols, a.top, a.top + TILE_Y, { solid: PLANK_SOLID, anchors: [leftId, rightId] });
  };
  // Half of a broken bridge, fixed to one bank and reaching out over the gap.
  const brokenBridge = (id, bankId, side, cols) => {
    const bank = registry.get(bankId);
    if (!bank) throw new Error(`${id}: unknown bank ${bankId}`);
    const column = Math.round((side === 'right' ? bank.right : bank.left - cols * TILE_X) / TILE_X);
    return addPiece(id, 'plank', column, cols, bank.top, bank.top + TILE_Y, { solid: PLANK_SOLID, anchors: [bankId] });
  };

  // Gaps in the ground: a stream, a ravine, the pool and two mountain crevices.
  // Falling into one returns the player to the footing they jumped from.
  const GAPS = [
    { from: 225, to: 235, fill: 'water' },
    { from: 892, to: 906, fill: 'chasm' },
    { from: 1024, to: 1060, fill: 'water' },
    { from: 1123, to: 1127, fill: 'chasm' },
    { from: 1134, to: 1138, fill: 'chasm' },
    { from: 1148, to: 1152, fill: 'chasm' },
  ];
  const WORLD_COLUMNS = 1420;

  // --- Scene layouts ----------------------------------------------------------
  // Each scene follows the script in order. Between conversations the path
  // climbs, drops and crosses gaps that come from the story's own places, and
  // every piece stands on the ground, on another piece, or on a stream/ravine
  // bed. Steps rise at most 2 tiles (16 units, inside the 21-unit jump) and
  // jumps span at most 5 tiles.

  // 1. Field and Town (columns 0-170). CubeBot copies the knights' drills on
  // the training ground, follows the road over a hill into town, meets the
  // hooded kid, then chases him across the rooftops and out toward the forest.
  terrain('field-dais', 'castle', 12, [[6, 1]]);
  terrain('field-drill-crates', 'barrel', 24, [[2, 1], [2, 2]]);
  terrain('field-hill', 'earth', 36, [[4, 1], [6, 2], [4, 1]]);
  terrain('town-stall', 'crate', 56, [[2, 1]]);
  terrain('town-house-a', 'house', 74, [[6, 2]]);
  terrain('town-street-crate', 'barrel', 82, [[2, 1]]);
  terrain('town-house-b', 'house', 86, [[6, 3]]);
  terrain('town-street-crates', 'crate', 94, [[2, 2]]);
  terrain('town-house-c', 'house', 97, [[7, 3]]);
  terrain('town-house-d', 'house', 112, [[6, 3]]);
  // The alley between houses C and D is open street: CubeBot can leap from
  // roof to crates, or drop down onto the grass and climb back up by the
  // crates stacked against house D. (Grass that can be seen is ground that
  // can be reached - nothing roofs it over.)
  terrain('town-alley-crates', 'crate', 108, [[2, 1], [2, 2]]);
  terrain('town-roof-steps', 'crate', 118, [[2, 2]]);

  // 2. The Deep Forest Clearing (170-312), script scenes 3-5. The clearing
  // where CubeBot first hears FlowerGirl; the next day the roots and the
  // stream on the way back to her, and the ridge up to their tree.
  terrain('clearing-roots', 'earth', 198, [[4, 1], [8, 2], [4, 1]]);
  stone('stream-stone', 229, 3, 0);
  terrain('forest-ridge', 'earth', 264, [[4, 1], [4, 2], [6, 3], [4, 2], [4, 1]]);

  // 3. The Castle (312-400), scene 6, at night: the courtyard inside the
  // walls where the knights stand guard, the steps up into the torch-lit
  // hall, and the Princess's carpeted room at its end.
  terrain('castle-hall', 'castle', 338, [[3, 1], [31, 2]]);
  terrain('princess-chamber', 'carpetFloor', 372, [[28, 2]]);

  // 4. Outside the Castle Walls at night (400-490), scene 7: over the rubble
  // and the broken fence toward the noise, where guards hold the thief.
  terrain('night-rubble', 'rock', 412, [[4, 1], [3, 2]]);
  terrain('night-fence-post-a', 'log', 428, [[2, 1]]);
  terrain('night-fence-post-b', 'log', 438, [[2, 1]]);
  // Only the posts of the broken fence remain; the grass between them is
  // open ground.

  // 5. The Hillside outside the castle (490-560), scene 8: their usual tree on
  // top of the hill.
  terrain('hillside', 'earth', 510, [[5, 1], [8, 2], [5, 1]]);
  // The Seer's house in the city, where the knights bring FlowerGirl.

  // 6. The Grand Library (560-620), scene 9: through the doors and up among
  // the shelves, where the old man waits at the end of an aisle.
  terrain('library', 'castle', 576, [[4, 1], [4, 2], [36, 3]]);
  stack('library-shelf-a', 'bookshelf', 'library-3', 588, 2, 2);
  stack('library-shelf-b', 'bookshelf', 'library-3', 596, 2, 2);
  bridge('library-shelf-board', 'library-shelf-a', 'library-shelf-b');
  stack('library-shelf-c', 'bookshelf', 'library-3', 604, 2, 1);

  // 7. The Castle Gates at dawn (620-650), scene 10, where PaperBag waits.
  terrain('gatehouse-crate', 'barrel', 646, [[2, 1]]);

  // 8. The Mountain Pass (650-780), scene 11: the steep trail up to the narrow
  // ledge where the landslide comes down.
  terrain('pass-entry', 'rock', 650, [[1, 6]]);
  terrain('pass-slope', 'rock', 658, [[6, 1], [6, 2]]);
  terrain('pass-cliff', 'rock', 670, [[6, 3], [76, 4], [6, 2]]);
  stack('landslide-boulder-a', 'rock', 'pass-cliff-2', 700, 2, 1);
  stack('landslide-boulder-b', 'rock', 'pass-cliff-2', 712, 3, 1);

  // 9. The Enchanted Forest (780-980), scene 12. Roots in the Bloomstorm, the stone
  // outcrop the travellers shelter beside, the ravine and its broken bridge,
  // then the glowing roots that lead beyond the forest.
  terrain('bloom-roots', 'earth', 792, [[4, 1], [6, 2], [4, 1]]);
  // A great trunk felled across the path by the storm.
  terrain('fallen-log', 'log', 812, [[8, 1]]);
  terrain('outcrop-west', 'rock', 826, [[6, 2]]);
  terrain('outcrop-east', 'rock', 864, [[4, 1], [6, 2]]);
  terrain('ravine-west-bank', 'rock', 884, [[8, 2]]);
  terrain('ravine-east-bank', 'rock', 906, [[8, 2]]);
  brokenBridge('ravine-bridge-west', 'ravine-west-bank-1', 'right', 4);
  brokenBridge('ravine-bridge-east', 'ravine-east-bank-1', 'left', 4);
  terrain('glowing-roots', 'earth', 930, [[4, 1], [4, 2], [6, 3], [4, 2], [4, 1]]);

  // 10. The Water Forest (980-1100), scene 13. The spirits meet them at the pool's edge;
  // stepping stones carry CubeBot across the still water toward the mountain.
  stone('pool-stone-1', 1028, 3, 0);
  stone('pool-stone-2', 1036, 3, 1);
  stone('pool-stone-3', 1044, 3, 0);
  stone('pool-stone-4', 1052, 3, 1);
  terrain('pool-far-rock', 'rock', 1075, [[4, 1]]);

  // 11. The Mountain (1100-1260), scenes 14-15. The long climb alone: ledges up the face,
  // two crevices where the stone gives way, the summit shelf where PaperBag
  // finds him with the flower, and the way back down.
  // The climb is played: rising ledges of snow-capped rock, three chasms
  // crossed on pillars of stone, a boulder to clamber over, and at the top
  // a crag where the Undying Flower grows. No step is higher than a jump.
  terrain('mountain-wall', 'rock', 1100, [[1, 6]]);
  terrain('mountain-foot', 'rock', 1112, [[4, 1], [4, 2], [3, 3]]);
  stone('cliff-pillar-1', 1124, 2, 2);
  terrain('mountain-ledge', 'snowRock', 1127, [[4, 4], [3, 5]]);
  stone('cliff-pillar-2', 1135, 2, 4);
  terrain('mountain-face', 'snowRock', 1138, [[3, 6], [4, 7], [3, 6]]);
  stack('face-boulder', 'rock', 'mountain-face-2', 1142, 2, 1);
  stone('cliff-pillar-3', 1149, 2, 5);
  terrain('mountain-crest', 'snowRock', 1152, [[3, 7], [3, 8], [4, 9]]);
  terrain('mountain-summit', 'snowRock', 1162, [[16, 9], [4, 7], [4, 5], [4, 3], [4, 1]]);
  // The flower's crag, the highest point of the peak.
  stack('flower-crag', 'snowRock', 'mountain-summit-1', 1171, 3, 1);
  terrain('mountain-meadow', 'earth', 1230, [[5, 1]]);

  // 12. The Road to the Castle (1260-1305), scene 16: back through the quiet
  // outer town to the closed gates.
  terrain('market-crates', 'crate', 1285, [[2, 1], [2, 2]]);
  // 13. The Princess's Room (1305-1420), scene 17: up the castle steps,
  // through the hall and into her room, to her bedside.
  terrain('castle-return', 'castle', 1310, [[5, 1], [5, 2], [10, 3]]);
  terrain('princess-room', 'carpetFloor', 1330, [[90, 3]]);

  // --- Ground -----------------------------------------------------------------
  const groundTiles = (leftEdge, rightEdge) => ({
    cap: block('grass-top'),
    fill: block('dirt'),
    ...(leftEdge ? { capLeft: block('grass-left'), fillLeft: block('dirt-left') } : {}),
    ...(rightEdge ? { capRight: block('grass-right'), fillRight: block('dirt-right') } : {}),
  });
  // Indoors (the castle, the library, the Princess's room) the floor is
  // stone, built from the same tileset; on the mountain it is bare rock (snow
  // on the high slopes, down to the meadow at its foot); everywhere else it is
  // grass on dirt.
  const INTERIORS = [[312, 400], [532, 560, 'wood-floor'], [560, 620], [1305, 1420]];
  const MOUNTAIN_GROUND = [[650, 780, 'stone-block'], [1100, 1228, 'snow-rock']];
  const floorTilesOf = (name = 'stone-brick') => ({ cap: block(name), fill: block(name) });
  const rockTilesOf = (cap) => ({ cap: block(cap), fill: block('stone-block') });
  const grounds = [];
  const solidGround = (from, to, leftEdge, rightEdge) => {
    const cuts = [from, to];
    [...INTERIORS, ...MOUNTAIN_GROUND].forEach(([a, b]) => [a, b].forEach((c) => { if (c > from && c < to) cuts.push(c); }));
    cuts.sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const [a, b] = [cuts[i], cuts[i + 1]];
      const room = INTERIORS.find(([x, y]) => a >= x && b <= y);
      const rock = MOUNTAIN_GROUND.find(([x, y]) => a >= x && b <= y);
      grounds.push({
        x: colX(a),
        width: colX(b - a),
        tiles: room ? floorTilesOf(room[2]) : rock ? rockTilesOf(rock[2])
          : groundTiles(leftEdge && i === 0, rightEdge && i === cuts.length - 2),
        tileWidth: TILE_X,
        tileHeight: TILE_Y,
      });
    }
  };
  let groundStart = 0;
  GAPS.forEach((gap, index) => {
    solidGround(groundStart, gap.from, index > 0, true);
    grounds.push({ x: colX(gap.from), width: colX(gap.to - gap.from), fill: gap.fill, solid: false });
    groundStart = gap.to;
  });
  solidGround(groundStart, WORLD_COLUMNS, true, false);

  // --- Layout check -------------------------------------------------------------
  // Every piece must be held up by something: the ground (and not over a gap),
  // the bed of a gap, a piece it sits wholly on, or - for a plank - the
  // supports it is fixed to, flush with their tops. Anything else is reported.
  const inGap = (left, right) => GAPS.some((gap) => left < colX(gap.to) && right > colX(gap.from));
  const withinGap = (left, right) => GAPS.some((gap) => left >= colX(gap.from) && right <= colX(gap.to));
  registry.forEach((entry, id) => {
    const problem = (() => {
      if (entry.anchors) {
        return entry.anchors.every((anchorId) => {
          const anchor = registry.get(anchorId);
          return anchor && anchor.top === entry.top
            && (Math.abs(anchor.right - entry.left) < 1e-6 || Math.abs(anchor.left - entry.right) < 1e-6);
        }) ? '' : 'plank is not flush with its supports';
      }
      if (entry.restsOn === 'bed') {
        return entry.bottom === WORLD_BOTTOM && withinGap(entry.left, entry.right) ? '' : 'stone is not in a gap';
      }
      if (entry.restsOn) {
        const support = registry.get(entry.restsOn);
        return support && support.top === entry.bottom && support.left <= entry.left && support.right >= entry.right
          ? '' : `does not sit on ${entry.restsOn}`;
      }
      return entry.bottom - entry.sunk === GROUND_Y && !inGap(entry.left, entry.right) ? '' : 'is not standing on solid ground';
    })();
    if (problem) console.error(`The False Knight layout: ${id} ${problem}.`);
  });

  // --- Checkpoints ------------------------------------------------------------
  // One before every obstacle that cannot simply be walked back through (the
  // rooftop chase, the stream, the ravine, the pool and each stage of the
  // mountain), plus one just past each gap. Every scene's entry point is a
  // checkpoint too (the castle steps, the library and the pass each open a
  // scene of their own). Falling in, or pressing the return control, restarts from
  // the last one reached. Each sits on flat footing: never over a gap, and
  // never across the edge of a step, so the player can't respawn inside a block.
  const CHECKPOINT_COLUMNS = [
    70, 122, // the rooftop chase, and the street to the city gate
    219, 240, // the stream (before and after)
    879, 919, // the ravine (before and after)
    1022, 1064, // the pool (before and after)
    1109, 1129, 1139.5, 1156.5, 1166, // the mountain: its foot, each ledge past a chasm, the summit
  ];
  const CHECKPOINT_HALF_WIDTH = 6;
  const checkpoints = CHECKPOINT_COLUMNS.map((column) => ({ id: `checkpoint-${column}`, x: colX(column) }));
  checkpoints.forEach((checkpoint) => {
    const left = checkpoint.x - CHECKPOINT_HALF_WIDTH;
    const right = checkpoint.x + CHECKPOINT_HALF_WIDTH;
    const under = [...registry.values()].filter((entry) => entry.left < right && entry.right > left);
    const tops = new Set(under.map((entry) => entry.top));
    const covered = under.length === 0 || under.some((entry) => entry.left <= left && entry.right >= right);
    if (inGap(left, right) && !under.length) console.error(`The False Knight layout: ${checkpoint.id} is over a gap.`);
    if (tops.size > 1 || !covered) console.error(`The False Knight layout: ${checkpoint.id} straddles a step edge.`);
  });

  // Feet height (above the ground line) of something standing on a piece.
  const feetOn = (platformId) => GROUND_Y - registry.get(platformId).top;
  // Story positions are authored on the same column grid as the layout.
  const at = (column) => colX(column);

  // Background art, one screen-wide copy per screen, chosen for each place in
  // the script. `groundLine` is where the ground is drawn in each picture, so
  // what is drawn stands on the real ground; above the picture the panel shows
  // its own colour, so climbing never runs out of background.
  //   - The meadow layers: the grassy field, the road out of town, the
  //     hillside.
  //   - environment/backgrounds (drawn for this story, _make_environment.py):
  //     the town's streets; the castle's outer walls and towers (its courtyard,
  //     the road outside at night, the gates); the castle hall with its
  //     pillars, arches and windows; the Princess's room, by night and by day;
  //     the grand library and the city streets outside it at night; the
  //     mountains; the deep forest in late-afternoon light; the enchanted
  //     forest's tall trunks crossed by thorny branches; the pale trees of the
  //     water forest - each as the storyboard draws it. The outdoor
  //     ones are drawn over the meadow's clouds and sky.
  // Shared layers (hills, clouds, sky) are lined up with the world, so they run
  // on unbroken where one background meets the next. The town is a row of
  // whole houses fitted a whole number of times into its stretch of street, so
  // no house is ever cut in two where the street begins or ends; where indoor
  // and outdoor pictures meet, a doorway or tower (in the scenery) joins them.
  const meadowSky = [
    folder('ALL (PNG)/meadow_03_hills.png'),
    folder('ALL (PNG)/meadow_02_clouds.png'),
    folder('ALL (PNG)/meadow_01_sky.png'),
  ];
  const meadowLayers = [folder('ALL (PNG)/meadow_04_trees_stones.png'), ...meadowSky];
  const clouds = meadowSky.slice(1);
  const scenery = (name) => folder(`environment/backgrounds/${name}.png`);
  const span = (from, to) => ({ x: at(from), width: at(to - from), groundLine: 0.8 });
  const meadow = (from, to) => ({ ...span(from, to), assets: meadowLayers, color: '#8fd0ee', worldAligned: true });
  const forest = (from, to, name, color) => ({ ...span(from, to), asset: scenery(name), color });
  const outdoors = (from, to, name, filter) => ({
    ...span(from, to), assets: [scenery(name), ...clouds], color: '#8fd0ee', filter, worldAligned: true,
  });
  // The town over the meadow's hills, so the hills carry on behind the houses.
  const town = (from, to) => ({
    ...span(from, to), assets: [scenery('town'), ...meadowSky], color: '#8fd0ee', wholeCopies: true, worldAligned: true,
  });
  const indoors = (from, to, name, color) => ({ ...span(from, to), asset: scenery(name), color });
  const backgrounds = [
    meadow(0, 52),
    town(52, 123),
    meadow(123, 129),
    forest(170, 312, 'deep-forest', '#224a34'),
    // The castle at night: the courtyard under the open sky (darker than the
    // torch-lit rooms inside), the hall, the Princess's room.
    outdoors(312, 341, 'castle-courtyard', 'brightness(0.7)'),
    indoors(341, 372, 'castle-hall-night', '#585261'),
    indoors(372, 400, 'princess-room-night', '#8f7aa3'),
    outdoors(400, 490, 'castle-outskirts'),
    outdoors(490, 532, 'hillside'),
    indoors(532, 560, 'seer-house', '#4a3224'),
    // The city streets in the storm, then the library through its doors.
    { ...span(560, 576), asset: scenery('city-night'), color: '#18203a' },
    indoors(576, 620, 'library', '#4a3326'),
    outdoors(620, 650, 'castle-walls'),
    outdoors(650, 780, 'mountains'),
    forest(780, 980, 'enchanted-forest', '#1e2c54'),
    forest(980, 1100, 'water-forest', '#8acae2'),
    outdoors(1100, 1260, 'mountain-high'),
    town(1260, 1282),
    outdoors(1282, 1305, 'castle-walls'),
    indoors(1305, 1330, 'castle-hall-day', '#585261'),
    indoors(1330, 1420, 'princess-room-day', '#e6c9d9'),
  ];

  // --- Scenery -------------------------------------------------------------------
  // Props that never block movement (environment/props), placed where the
  // script puts them: `feet` is the height of their base above the ground
  // line (on a platform: feetOn), heights are at the tiles' pixel size (one
  // art pixel is half a unit). `far` sits on the horizon, `front` in front of
  // the characters, `light` things glow through the night. Flowers sway, each
  // on its own timing, and grow only on grass outdoors.
  const env = (name) => folder(`environment/props/${name}.png`);
  const prop = (name, column, feet, h, more = {}) => ({ x: at(column), feet, h, asset: env(name), ...more });
  const flowers = (color, feet, ...columns) => columns.map((column) => ({
    x: at(column), feet, h: 9, stem: env('flower-stem'), flower: env(`flower-head-${color}`),
  }));
  const torch = (column, feet) => [
    prop('torch', column, feet, 7.5),
    prop('flame', column, feet + 6, 3, { light: true, anim: 'flicker', duration: 0.9 }),
  ];
  const candle = (column, feet) => [
    prop('candle', column, feet, 6.5),
    prop('flame', column, feet + 4.5, 2.5, { light: true, anim: 'flicker', duration: 0.7 }),
  ];
  // A town house the kid and CubeBot run across: the platform is its walls and
  // eaves; its pitched roof (behind the runners) and its front door complete it.
  const house = (column, cols, platformId) => [
    prop(`house-gable-${cols}`, column + cols / 2, feetOn(platformId), cols === 7 ? 24.5 : 22),
    prop('house-door', column + cols / 2, 0, 11, { layer: 'front' }),
  ];
  // Where an outdoor picture meets an indoor one: a whole tower, or a wall
  // with the doorway that leads through (its opening level with the floor).
  const join = (name, column, feet = 0) => prop(name, column, feet, 120, { layer: 'far' });
  const banner = (column, feet) => prop('banner', column, feet, 13, { anim: 'banner', duration: 4 });
  const lights = (name, h, anim, duration, points) => points.map(([column, feet]) => prop(name, column, feet, h, { light: true, anim, duration }));
  const decor = [
    // 1. The grassy field beneath the World Tree, with its castle carved into
    // the trunk; the knights' training ground; the town's market and lamps;
    // the road out toward the forest.
    prop('world-tree', 30, 0, 82, { layer: 'far' }),
    prop('training-dummy', 8, 0, 20),
    prop('training-dummy', 31, 0, 20, { flip: true }),
    ...flowers('red', 0, 3, 5.5, 33, 34.5),
    ...[2, 9.5, 21, 28.5, 51.5].map((column) => prop('tall-grass', column, 0, 13, { layer: 'front', anim: 'sway', duration: 3.2 })),
    ...flowers('yellow', 0, 4.5, 51),
    ...flowers('pink', feetOn('field-hill-2'), 42, 44.5),
    prop('market-stall', 57.5, 0, 18),
    ...house(74, 6, 'town-house-a-1'), ...house(86, 6, 'town-house-b-1'),
    ...house(97, 7, 'town-house-c-1'), ...house(112, 6, 'town-house-d-1'),
    prop('lamp-post', 71, 0, 25),
    prop('lamp-post', 105.5, 0, 25),
    // The city gate: the way out to the forest, where the kid escapes and the
    // end of the town page. Torches mark it; nothing lies beyond it.
    ...flowers('yellow', 0, 120.8, 122),
    prop('city-gate', 126.2, 0, 66),
    ...torch(122.9, 30), ...torch(128.6, 30),

    // 2. The deep forest: the clearing full of glowing insects where
    // FlowerGirl sings, mushrooms among the roots, and the two trees where
    // they sit together and where the guards find them.
    ...lights('firefly', 2, 'float', 5, [[199, 30], [202, 40], [205, 28], [208, 44], [211, 32], [204, 52], [196, 22], [213, 24]]),
    prop('big-tree', 206, feetOn('clearing-roots-2'), 46),
    ...lights('music-note', 5.5, 'float', 4, [[208.5, 46], [210.5, 40], [207, 52]]).map((note) => ({ ...note, until: 'flower-first-meeting' })),
    prop('bush', 194, 0, 18, { layer: 'front' }),
    ...flowers('pink', 0, 175.5, 181, 192),
    ...flowers('blue', 0, 195.5),
    prop('bush', 172, 0, 11),
    ...lights('glow-mushroom', 6, 'glow', 2.4, [[199.5, feetOn('clearing-roots-1')], [212, feetOn('clearing-roots-3')]]),
    prop('bush', 217, 0, 11, { flip: true }),
    ...flowers('yellow', 0, 243, 246, 260),
    prop('big-tree', 255, 0, 40),
    prop('twig', 245.5, 0, 4),
    ...flowers('pink', 0, 290, 294),
    prop('big-tree', 302, 0, 40, { flip: true }),
    ...lights('firefly', 2, 'float', 6, [[297, 24], [305, 30], [309, 18]]),

    // 3. The castle at night: torches and banners on the courtyard walls under
    // the moon; torches and banners down the hall; the Princess's room with
    // her drawer, table, candles and bed.
    prop('moon', 326, 64, 8, { light: true }),
    join('castle-doorway', 341), join('room-doorway', 372),
    banner(316, 18), ...torch(321, 14), banner(331, 18), ...torch(335, 14),
    ...torch(345, 30), banner(351, 28), ...torch(357, 30), banner(363, 28), ...torch(369, 30),
    prop('drawer', 376, feetOn('princess-chamber-1'), 10),
    ...candle(376, feetOn('princess-chamber-1') + 10),
    prop('table', 383, feetOn('princess-chamber-1'), 7),
    ...candle(383.5, feetOn('princess-chamber-1') + 7),
    prop('canopy-bed', 395, feetOn('princess-chamber-1'), 28),
    prop('trash-can', 387, feetOn('princess-chamber-1'), 7),

    // 4. Outside the castle walls at night: the moon, torches on the wall, the
    // rubble, a street lamp, the alley where the guards catch the thief.
    prop('moon', 444, 66, 8, { light: true }),
    ...torch(404, 18),
    prop('rubble', 409.5, 0, 6),
    prop('rubble', 421, 0, 6, { flip: true }),
    prop('lamp-post', 448, 0, 25),
    prop('trash-can', 453, 0, 7),
    ...torch(482, 18),

    // 5. The hillside: their tree on top of the hill, the World Tree on the
    // horizon, wild flowers on the slopes.
    prop('world-tree', 529, 0, 82, { layer: 'far' }),
    prop('big-tree', 519, feetOn('hillside-2'), 40),
    ...flowers('yellow', 0, 494, 497.5, 503, 529.5),
    ...flowers('red', 0, 506, 531),
    ...flowers('pink', feetOn('hillside-1'), 512),
    ...flowers('pink', feetOn('hillside-2'), 516.5, 523),

    // The Seer's house: her crystal ball, the cauldron, herbs and candles, and
    // FlowerGirl in the small bed.
    prop('room-doorway', 532.6, 0, 120, { layer: 'far' }),
    prop('cauldron', 539, 0, 12),
    prop('table', 545, 0, 7),
    prop('crystal-ball', 545, 7, 7.5, { light: true, anim: 'glow', duration: 3 }),
    prop('seer-bed', 554, 0, 17),
    ...candle(557.5, 0),
    prop('herbs', 542, 46, 9, { anim: 'banner', duration: 5 }),
    prop('herbs', 550, 46, 9, { anim: 'banner', duration: 6 }),

    // The start of each place is a natural edge, never empty air.
    prop('bush', 0.8, 0, 14), prop('big-tree', 1.6, 0, 40),
    prop('big-tree', 171, 0, 44), prop('bush', 171.8, 0, 14),
    prop('castle-tower', 312.6, 0, 120, { layer: 'far' }),
    prop('castle-tower', 400.6, 0, 120, { layer: 'far' }),
    prop('big-tree', 491, 0, 42), prop('bush', 491.8, 0, 13),
    prop('castle-tower', 620.6, 0, 120, { layer: 'far' }),
    prop('big-tree', 781, 0, 46), prop('thorn-vine', 783, 30, 9),
    prop('white-tree', 981, 0, 44),
    prop('castle-doorway', 1305.8, 0, 120, { layer: 'far' }),

    // 6. The grand library through the night: torches, a reading table and
    // candles among the shelves.
    prop('lamp-post', 566, 0, 25),
    { x: at(568), width: at(16), rain: true },
    prop('library-facade', 576, 0, 115, { layer: 'far' }),
    ...torch(586, 40), ...torch(608, 34),
    prop('table', 601, feetOn('library-3'), 7),
    ...candle(601.5, feetOn('library-3') + 7),
    ...candle(589, feetOn('library-shelf-a')),
    ...candle(605, feetOn('library-shelf-c')),

    // 7. The castle gates at dawn: the closed gatehouse they leave behind,
    // torches either side, PaperBag stepping out of the shadows.
    prop('gate', 629, 0, 30),
    ...torch(624.5, 14), ...torch(633.5, 14),
    prop('stone-pillar', 639, 0, 62, { layer: 'front' }),
    ...flowers('yellow', 0, 643, 649),

    // 8. The mountain pass: bare rock from its foot, fallen stone on the
    // slope and rubble on the ledge where the landslide comes down.
    prop('rubble', 654, 0, 5),
    prop('rubble', 661, feetOn('pass-slope-1'), 6, { flip: true }),
    prop('rubble', 696, feetOn('pass-cliff-2'), 6),
    prop('rubble', 707, feetOn('pass-cliff-2'), 6, { flip: true }),
    prop('rubble', 718, feetOn('pass-cliff-2'), 6),
    ...[[698, 6], [706, 12], [714, 4]].map(([column, lift]) => prop('dust-cloud', column, feetOn('pass-cliff-2') + lift, 11, { anim: 'drift', duration: 6, from: 'paperbag-pass' })),

    // 9. The enchanted forest in the Bloomstorm: pollen drifting through the
    // air, glowing mushrooms, flowers by the fallen log and the outcrops, and
    // the glowing roots that lead the way out.
    ...lights('pollen', 2, 'float', 7, [
      [786, 30], [794, 18], [803, 36], [811, 24], [819, 40], [828, 28], [837, 20], [846, 38], [855, 26],
      [863, 34], [872, 22], [881, 40], [890, 30], [899, 20], [908, 36], [917, 26], [926, 32], [955, 22], [966, 34],
    ]),
    ...[[792, 44], [818, 58], [849, 40], [889, 54], [924, 46], [958, 60]].map(([column, feet]) => prop('thorn-vine', column, feet, 9, { anim: 'sway', duration: 6 })),
    ...lights('glow-mushroom', 6, 'glow', 2.4, [[794, feetOn('bloom-roots-1')], [823.5, 0], [835, 0], [860, 0]]),
    ...flowers('pink', 0, 808, 809.5, 822),
    ...flowers('blue', 0, 834, 857),
    ...lights('glow-root', 6, 'glow', 3, [
      [932, feetOn('glowing-roots-1')], [936, feetOn('glowing-roots-2')], [941, feetOn('glowing-roots-3')],
      [946, feetOn('glowing-roots-4')], [950, feetOn('glowing-roots-5')], [958, 0], [967, 0], [976, 0],
    ]),

    // 10. The water forest: still mist over the pool, the white-barked tree
    // Whitey steps out from behind, blue flowers at the water's edge, and the
    // mist CubeBot disappears into.
    prop('white-tree', 1019.5, 0, 40),
    ...flowers('blue', 0, 984, 987.5, 995, 1001, 1066, 1070, 1083),
    ...lights('firefly', 2, 'float', 6, [[992, 20], [999, 28], [1005, 16], [1063, 22], [1072, 30]]),
    prop('mist', 1033, 0, 5, { anim: 'drift', duration: 14 }),
    prop('mist', 1052, 2, 5, { anim: 'drift', duration: 18 }),
    prop('mist', 1093, 0, 6, { layer: 'front', anim: 'drift', duration: 16 }),

    // 11. The mountain: fallen stone at its foot, the single glowing Undying
    // Flower on the summit (gone once CubeBot pulls it free), and the meadow
    // on the way back down.
    prop('rubble', 1110, 0, 6),
    prop('rubble', 1130, feetOn('mountain-ledge-1'), 6),
    prop('rubble', 1146.5, feetOn('mountain-face-3'), 6, { flip: true }),
    ...[1126, 1170, 1214, 1248].map((column) => prop('cloud-sea', column, 30, 13, { layer: 'far', anim: 'drift', duration: 20 })),
    // The Undying Flower on its crag: the same flower as in his hands later.
    prop('undying-flower', 1172.5, feetOn('flower-crag'), 13, { light: true, anim: 'glow', until: 'paperbag-peak' }),
    ...flowers('yellow', 0, 1240, 1249.5),
    ...flowers('red', feetOn('mountain-meadow-1'), 1232),

    // 12. The road to the castle: the quiet market, a street lamp, and the
    // closed gates, torches either side.
    prop('lamp-post', 1264, 0, 25),
    join('castle-tower', 1282),
    prop('market-stall', 1270, 0, 18),
    banner(1292, 18),
    prop('gate', 1298.5, 0, 30),
    ...torch(1294, 14), ...torch(1303, 14),

    // 13. The Princess's room by day: a torch and banner in the hall; her
    // drawer, bed, table (where the Undying Flower stands once it is brought
    // to her), candles, and banners.
    join('room-doorway', 1330, 8),
    ...torch(1322, feetOn('castle-return-3') + 14),
    banner(1327, feetOn('castle-return-3') + 12),
    prop('drawer', 1341, feetOn('princess-room-1'), 10),
    ...candle(1341, feetOn('princess-room-1') + 10),
    prop('canopy-bed', 1351, feetOn('princess-room-1'), 28),
    prop('potted-plant', 1384, feetOn('princess-room-1'), 10),
    prop('table', 1362, feetOn('princess-room-1'), 7),
    prop('glass-dome', 1362, feetOn('princess-room-1') + 7, 15, { light: true, anim: 'glow', from: 'flower-return' }),
    ...candle(1364, feetOn('princess-room-1') + 7),
    banner(1374, feetOn('princess-room-1') + 14),
    banner(1392, feetOn('princess-room-1') + 14),
  ];
  // Time of day, from the script's scene headings, as a tint on the scenery.
  const NIGHT = 'brightness(0.42) saturate(0.7) hue-rotate(-12deg)';
  const LAMPLIT_NIGHT = 'brightness(0.72) saturate(0.85) hue-rotate(-8deg)';
  const LATE_AFTERNOON = 'sepia(0.28) saturate(1.15) brightness(0.97)';
  const DAWN = 'sepia(0.22) hue-rotate(-18deg) saturate(1.1) brightness(0.93)';
  const SUNSET = 'sepia(0.35) saturate(1.3) hue-rotate(-12deg) brightness(0.95)';
  const OVERCAST = 'saturate(0.7) brightness(0.95)';

  const turn = (speaker, text, type = 'dialogue', extra = {}) => ({ speaker, text, type, choices: [], ...extra });
  // Storyboard frames (storyboard/, drawn by storyboard/_make_storyboard.py at
  // the project root after the storyboard in the script): each is a beat of
  // its own, the picture filling the screen, right after the narration line of
  // the moment it pictures.
  // How each frame arrives after the one before it: most melt into the next
  // ('crossfade', the default); a change of place or time dips through black;
  // a blinding light flashes through white.
  const FRAME_TRANSITIONS = {
    28: 'dip', // the collapse, then the rain
    29: 'dip', // to the castle gates
    30: 'dip', // into the city, to the Seer
    31: 'dip', // inside the Seer's house
    35: 'dip', // out into the storm
    72: 'flash', // the light of the flower, the dream
    90: 'dip', // the end
    92: 'dip', // from the window outside, back into her room
  };
  const frame = (number) => turn('narrator', '', 'frame', {
    image: folder(`storyboard/frame-${String(number).padStart(2, '0')}.jpg`),
    transition: FRAME_TRANSITIONS[number] || 'crossfade',
  });
  // Where each frame goes: for each event, the frames that follow its line N
  // (-1: before its first line), in the storyboard's order. The script's
  // storyboard has no frames for scenes 5-7; frames 91-92 were added for
  // scene 6 (CubeBot leaping from her window, FlowerGirl coughing blood).
  const STORYBOARD = {
    opening: { 0: [1], 1: [2] }, // waking from a nap in the field; staring at the far castle
    kid: { 0: [3], 2: [4], 3: [5] }, // the bump; "my coins!" - he is on the rooftops; out through the walls
    'page-forest-clearing': { 0: [6, 7] },
    'flower-first-meeting': { 0: [8, 9, 10, 11, 12], 1: [13] },
    'flower-clearing': { '-1': [14, 15, 16, 17, 18], 0: [19, 20], 1: [21, 22], 2: [23] },
    // Under their tree (sitting, laughing, the wind), then the collapse.
    'flower-room': { 4: [91, 92] }, // out of her window into the night; alone, she coughs blood
    'flower-collapse': { '-1': [24, 25, 26], 0: [27, 28, 29, 30, 31, 32, 33], 3: [34], 4: [35] },
    'old-man': { 0: [36, 37, 38], 4: [39] },
    'page-castle-gates-and-library': { 0: [40] },
    'paperbag-joins': { 0: [41], 7: [42] },
    'paperbag-pass': { 0: [43, 44, 45, 46], 2: [47, 48, 49, 50] },
    'page-enchanted-forest': { 0: [51] },
    'mr-golem': { 0: [52], 1: [53, 54, 55, 56, 57] },
    'water-spirit': { 0: [58, 59] },
    whitey: { 0: [60, 61] },
    'water-spirit-sacrifice': { 0: [62] },
    'paperbag-sacrifice': { 3: [63] },
    'page-mountain-ascent': { 0: [64] },
    // The climb itself (frames 67, 68 and 70) is now played, not shown.
    'mountain-ascent': { 0: [65, 66], 2: [69] },
    'paperbag-peak': { 0: [71, 74, 72], 3: [73], 5: [75], 6: [76] },
    'page-return-to-the-kingdom': { 0: [77] },
    'castle-gates': { 0: [78, 79, 80], 4: [81] },
    'flower-return': { 0: [82, 83], 2: [84], 3: [85, 86], 4: [87, 88, 89], 6: [90] },
  };
  const withStoryboard = (events) => events.map((event) => {
    const placed = STORYBOARD[event.id];
    if (!placed) return event;
    const turns = [...(placed[-1] || []).map(frame)];
    event.turns.forEach((line, index) => turns.push(line, ...(placed[index] || []).map(frame)));
    return { ...event, turns };
  });
  // `optional: true` marks a talk that is not a turn in the story (a passing
  // remark): it never blocks the way, and the player can walk past it.
  // `extra` says what the end of a scene's dialogue leads to: `thenScene`
  // (fade through black to another scene, with no narration of its own) or
  // `endsStory`.
  const scene = (id, x, name, asset, turns, requiresInteraction = true, extra = {}) => ({
    id,
    x,
    name,
    asset,
    npcId: id,
    requiresInteraction,
    gateX: requiresInteraction ? x + 14 : null,
    turns,
    ...extra,
  });
  // A page turn: black screen, narration, next scene. By default it waits
  // just inside the end of its scene (the player walks on to the next place);
  // one listed in IMMEDIATE_PAGES follows straight on from the dialogue before
  // it, because the script moves to the new place right after that moment.
  const IMMEDIATE_PAGES = new Set([
    'page-castle-and-night-road', // after the pendant, out of the window into the night
    'page-castle-gates-and-library', // after the old man vanishes, to the gates at dawn
    'page-enchanted-forest', // after the landslide, on into the forest
    'page-return-to-the-kingdom', // after the summit, the journey home
  ]);
  const pageTurn = (id, endColumn, nextScene, text) => ({
    id,
    x: at(endColumn) - 10,
    name: 'Narrator',
    asset: '',
    nextScene,
    immediate: IMMEDIATE_PAGES.has(id),
    requiresInteraction: false,
    turns: [turn('narrator', text)],
  });

  // Character art: the provided portrait plus its 32x46 sprite sheet (rows:
  // idle, walk/run, jump). The kid, the thief and PaperBag are one character,
  // so all three use the PaperBag art.
  const art = (portrait, sheet) => ({ asset: folder(portrait), animationAsset: folder(sheet) });
  const cubebotArt = art('CUBEBOT/CUBEBOT.png', 'CUBEBOT/cubebot_spritesheet.png');
  const flowerArt = art('FLOWERLING/FLOWER.png', 'ALL (PNG)/flowerling_spritesheet.png');
  // PaperBag is the kid: drawn at 80% so he is clearly smaller than CubeBot
  // and the adults, in every scene he appears in (his hitbox, feet and name
  // tag follow the smaller size).
  const KID_SCALE = 0.8;
  const paperbagArt = { ...art('PAPERBAG/paperbag.png', 'PAPERBAG/paperbag_spritesheet (1).png'), scale: KID_SCALE };
  const oldManArt = art('OLD MAN/old .png', 'OLD MAN/oldcubebot_spritesheet.png');
  const golemArt = art('GOLEM/GOLEM.png', 'ALL (PNG)/golem_spritesheet.png');
  const twigArt = art('TWIG/TWIG.png', 'ALL (PNG)/twig_spritesheet.png');
  const waterSpiritArt = art('WATER/WATER MAIN.png', 'ALL (PNG)/droplet_spritesheet.png');
  const whiteyArt = art('RAINCAR/RAINCAT.png', 'ALL (PNG)/raincat_spritesheet.png');
  // Characters from the script that had no provided art, drawn to match it
  // (each folder holds its "Pixel <Name>.html" sprite generator; see also
  // _export_sprites.js and _make_portraits.py). The knights at the field and
  // gates and the castle guards share the Guard design.
  const guardArt = art('GUARD/GUARD.png', 'GUARD/guard_spritesheet.png');
  const headGuardArt = art('HEAD GUARD/HEAD GUARD.png', 'HEAD GUARD/head_guard_spritesheet.png');
  const seerArt = art('SEER/SEER.png', 'SEER/seer_spritesheet.png');
  const kingArt = art('KING/KING.png', 'KING/king_spritesheet.png');
  const doctorArt = art('DOCTOR/DOCTOR.png', 'DOCTOR/doctor_spritesheet.png');
  const flowerGirl = flowerArt.asset;
  const paperbag = paperbagArt.asset;
  const oldMan = oldManArt.asset;
  const golem = golemArt.asset;
  const twig = twigArt.asset;
  const waterSpirit = waterSpiritArt.asset;
  const raincat = whiteyArt.asset;
  // Twigg rides on top of Mr. Golem's head until he hops down: the golem's
  // body rises 25 of the sheet's 46 pixel rows above his feet.
  const ON_GOLEMS_HEAD = 14;

  window.KOOBD_FALSE_KNIGHT_STORY = {
    title: 'The False Knight',
    lesson: 'True courage is measured by the choices we make for others.',
    // CubeBot uses the provided 32x46 sprite sheet (rows: idle / run / jump)
    // so the platformer player animates instead of showing a static image.
    playerProfile: {
      name: 'CubeBot',
      ...cubebotArt,
    },
    world: {
      width: at(WORLD_COLUMNS),
      // One jump for the whole cast: a full jump clears a two-tile step (16
      // units) with room to spare, exactly as high as the other characters'
      // own hop up such a step.
      jumpRise: 21,
      // Story conversations open by themselves when CubeBot comes to stand in
      // front of the character - no Chat press, and no invisible wall.
      autoTalk: true,
      backgroundColor: '#91d7ee',
      player: { x: 14, y: 0 },
      // One scene per location in the script, in the script's order.
      scenes: [
        // The page ends at the city gate: once the kid has escaped through it,
        // CubeBot follows him there, and walking through it turns the page.
        { id: 'field-and-town', title: 'Field and Town', startX: at(0), endX: at(129) },
        { id: 'forest-clearing', title: 'The Deep Forest', startX: at(170), endX: at(312) },
        { id: 'castle', title: 'The Castle', startX: at(312), endX: at(400), tint: LAMPLIT_NIGHT },
        { id: 'castle-walls', title: 'Outside the Castle Walls', startX: at(400), endX: at(490), tint: NIGHT },
        { id: 'hillside', title: 'The Hillside', startX: at(490), endX: at(532), tint: LATE_AFTERNOON },
        { id: 'seer-house', title: "The Seer's House", startX: at(532), endX: at(560), tint: LAMPLIT_NIGHT },
        { id: 'library', title: 'The Grand Library', startX: at(560), endX: at(620), tint: LAMPLIT_NIGHT },
        { id: 'castle-gates', title: 'The Castle Gates', startX: at(620), endX: at(650), tint: DAWN },
        { id: 'mountain-pass', title: 'The Mountain Pass', startX: at(650), endX: at(780) },
        { id: 'enchanted-forest', title: 'The Enchanted Forest', startX: at(780), endX: at(980) },
        { id: 'water-forest', title: 'The Water Forest', startX: at(980), endX: at(1100) },
        { id: 'mountain-ascent', title: 'The Mountain', startX: at(1100), endX: at(1260), tint: SUNSET },
        { id: 'return-to-the-kingdom', title: 'The Road to the Castle', startX: at(1260), endX: at(1305), tint: OVERCAST },
        { id: 'princess-room', title: "The Princess's Room", startX: at(1305), endX: at(1420) },
      ],
      backgrounds,
      decor,
      // Where the player is, as the script's scene headings name it: shown at
      // the top of the screen on first entering each place.
      areas: [
        { id: 'grassy-field', x: at(0), name: 'Grassy Field', time: 'Morning' },
        { id: 'town', x: at(52), name: 'Town', time: 'Day' },
        { id: 'deep-forest', x: at(170), name: 'Deep Forest', time: 'Late Afternoon' },
        { id: 'forest-clearing', x: at(222), name: 'Forest Clearing', time: 'Late Afternoon \u2013 Next Day' },
        { id: 'castle-courtyard', x: at(312), name: 'Castle Courtyard', time: 'Night' },
        { id: 'castle-hallway', x: at(341), name: 'Castle Hallway', time: 'Night' },
        { id: 'princess-room-night', x: at(372), name: "Princess's Room", time: 'Night' },
        { id: 'castle-walls-night', x: at(400), name: 'Castle Walls', time: 'Night' },
        { id: 'outside-the-castle', x: at(436), name: 'Outside the Castle', time: 'Night' },
        { id: 'hillside', x: at(490), name: 'Hillside Outside the Castle', time: 'Late Afternoon' },
        { id: 'city-streets', x: at(560), name: 'City Streets', time: 'Night' },
        { id: 'grand-library', x: at(576), name: 'Grand Library', time: 'Night' },
        { id: 'seer-house', x: at(532), name: "Seer's House", time: 'Night' },
        { id: 'castle-walls-morning', x: at(620), name: 'Castle Walls', time: 'Morning' },
        { id: 'mountain-pass', x: at(650), name: 'Mountain Pass', time: 'Morning' },
        { id: 'enchanted-forest', x: at(780), name: 'Enchanted Forest', time: 'Day' },
        { id: 'water-forest', x: at(980), name: 'Water Forest', time: 'Day' },
        { id: 'mountain-foot', x: at(1100), name: 'Mountain Foot', time: 'Day' },
        { id: 'lower-cliffside', x: at(1123), name: 'Lower Cliffside' },
        { id: 'mid-mountain', x: at(1138), name: 'Mid-Mountain', time: 'Later' },
        { id: 'higher-ascent', x: at(1152), name: 'Higher Ascent', time: 'Afternoon' },
        { id: 'mountain-peak', x: at(1162), name: 'Mountain Peak', time: 'Sunset' },
        { id: 'road-to-the-castle', x: at(1260), name: 'Road to the Castle', time: 'Day' },
        { id: 'castle-gates', x: at(1278), name: 'Castle Gates', time: 'Moments Later' },
        { id: 'princess-room-day', x: at(1305), name: "Princess' Room", time: 'Day' },
      ],
      // Tiled grass-and-dirt ground, broken by the stream, the ravine, the pool
      // and the mountain crevices (see GAPS).
      grounds,
      // Built from the provided platform tiles on the column grid above, each
      // piece standing on the ground, on another piece, or on a gap's bed.
      platforms: layout,
      checkpoints,
      // Who speaks under a turn's speaker label, for labels other than the
      // event's own character. Labels not listed here (the guards, the seer)
      // still have no model, so their lines show no figure.
      speakerModels: {
        kid: { name: 'Kid', ...paperbagArt },
        thief: { name: 'Thief', ...paperbagArt },
        paperbag: { name: 'PaperBag', ...paperbagArt },
        'old man': { name: 'Old Man', ...oldManArt },
        flowergirl: { name: 'FlowerGirl', ...flowerArt },
        'head guard': { name: 'Head Guard', ...headGuardArt },
        seer: { name: 'Seer', ...seerArt },
      },
      // Every character in the script with a provided model, placed and moved
      // by the story (see the scripted characters in the platformer player):
      // `actsIn` - the events they take part in; `appear` / `leave` - when they
      // arrive and go; `moves` - where they walk after an event; `follow` -
      // when they travel with CubeBot. Nobody wanders at random.
      npcs: [
        // The grassy field: knights training near the World Tree's roots,
        // which CubeBot watches and tries to copy.
        { id: 'knight-dais', name: 'Knight', x: at(15), y: feetOn('field-dais-1'), ...guardArt,
          routine: { type: 'drill' } ,
          dialogue: [{ speaker: 'npc', text: 'Shoulders back, shield up. A knight never drops his guard.' }] },
        { id: 'knight-field', name: 'Knight', x: at(21), y: 0, ...guardArt, routine: { type: 'drill', leap: 7 } ,
          dialogue: [{ speaker: 'npc', text: 'Copying our drills again? Watch the footwork, little one.' }] },
        // Town: soldiers rush through the streets.
        { id: 'town-soldier', name: 'Soldier', x: at(54), y: 0, ...guardArt,
          routine: { type: 'patrol', from: at(52), to: at(71), run: true } },
        // Town: the hooded kid bumps into CubeBot, then runs off across the
        // rooftops toward the forest.
        { id: 'kid', name: 'Kid', x: at(64), y: 0, ...paperbagArt, actsIn: ['kid'],
          // He runs off across the rooftops and out through the city gate into
          // the forest while the camera follows him; then CubeBot gives chase
          // through the town to the same gate.
          leave: { event: 'kid', action: 'run', toX: at(126.2), fade: true } },
        // The deep forest: FlowerGirl singing among the insects, until the
        // guards come into the clearing on her right and escort her away to
        // the right - the way the clearing continues, and where she is found
        // the next day. The camera holds still (see the event's cutscene) and
        // they walk out of the shot, stopping just short of the stream.
        { id: 'flowergirl-first-meeting', name: 'FlowerGirl', x: at(206), y: feetOn('clearing-roots-2'), ...flowerArt,
          actsIn: ['flower-first-meeting'],
          leave: { event: 'flower-first-meeting', action: 'walk', toX: at(224) } },
        { id: 'head-guard-clearing', name: 'Head Guard', x: at(212), y: feetOn('clearing-roots-3'), ...headGuardArt,
          appear: { event: 'flower-first-meeting', at: 'start' },
          leave: { event: 'flower-first-meeting', action: 'walk', toX: at(224.3) } },
        { id: 'guard-clearing', name: 'Guard', x: at(216), y: 0, ...guardArt,
          appear: { event: 'flower-first-meeting', at: 'start' },
          leave: { event: 'flower-first-meeting', action: 'walk', toX: at(224.6) } },
        // The next day she is by the stream; she walks to their tree, and after
        // the guards find them there she walks back to the castle, where she
        // gives CubeBot the pendant in her room.
        { id: 'flowergirl', name: 'FlowerGirl', x: at(250), y: 0, ...flowerArt,
          appear: { event: 'flower-clearing' },
          actsIn: ['flower-clearing', 'flower-bodyguard'],
          moves: [{ after: 'flower-clearing', toX: at(300) - 8 }],
          // The guards escort her back toward the castle.
          leave: { event: 'flower-bodyguard', action: 'walk', toX: at(312) + 8 } },
        // The next evening the guards find them under the tree.
        { id: 'head-guard-escort', name: 'Head Guard', x: at(304), y: 0, ...headGuardArt,
          appear: { event: 'flower-bodyguard', at: 'start' },
          leave: { event: 'flower-bodyguard', action: 'walk', toX: at(312) + 8 } },
        { id: 'guard-escort', name: 'Guard', x: at(308), y: 0, ...guardArt,
          appear: { event: 'flower-bodyguard', at: 'start' },
          leave: { event: 'flower-bodyguard', action: 'walk', toX: at(312) + 8 } },
        // The castle (script, scene 6): FlowerGirl brings CubeBot in past the
        // knights standing guard in the courtyard - they step aside for her
        // bodyguard - and leads him up the steps, along the hallway and into
        // her room, where she gives him the pendant.
        { id: 'castle-knight-a', name: 'Knight', x: at(323), y: 0, ...guardArt,
          routine: { type: 'stand' }, moves: [{ after: 'flower-room', at: 'near', distance: 22, toX: at(320.5) }] ,
          dialogue: [{ speaker: 'npc', text: 'The Princess vouched for you. Mind your step inside.' }] },
        { id: 'castle-knight-b', name: 'Knight', x: at(333), y: 0, ...guardArt,
          routine: { type: 'stand' }, moves: [{ after: 'flower-room', at: 'near', distance: 22, toX: at(336) }] ,
          dialogue: [{ speaker: 'npc', text: 'A bodyguard? The Princess has never chosen one before.' }] },
        { id: 'flowergirl-castle', name: 'FlowerGirl', x: at(318), y: 0, ...flowerArt,
          actsIn: ['flower-room'], lead: { to: at(390), gap: 30 } },
        // Outside the castle: the thief, who runs off into the dark once
        // CubeBot lets him go.
        // He runs off into the darkness once CubeBot lets him go.
        { id: 'thief', name: 'Thief', x: at(465), y: 0, ...paperbagArt, actsIn: ['thief'],
          leave: { event: 'thief', action: 'run', toX: at(490) + 8 } },
        // The two guards roughing up the thief, who step back at the sight of
        // the pendant and walk away grumbling.
        { id: 'guard-1', name: 'Guard', x: at(461), y: 0, ...guardArt,
          leave: { event: 'thief', action: 'walk', toX: at(400) - 8 } },
        { id: 'guard-2', name: 'Guard', x: at(469), y: 0, ...guardArt,
          leave: { event: 'thief', action: 'walk', toX: at(400) - 8 } },
        // The hillside tree: FlowerGirl sits with CubeBot until she collapses
        // and he carries her to the castle gates.
        { id: 'flowergirl-hillside', name: 'FlowerGirl', x: at(521), y: feetOn('hillside-2'), ...flowerArt,
          leave: { event: 'flower-collapse', at: 'start', action: 'hide' } },
        // The Seer at her patient's bedside, and the knight who brought them.
        { id: 'seer', name: 'Seer', x: at(549), y: 0, ...seerArt, routine: { type: 'stand' } },
        { id: 'guard-seer', name: 'Knight', x: at(537), y: 0, ...guardArt, routine: { type: 'stand' } },
        // The grand library: the old man, who is gone when CubeBot blinks.
        { id: 'old-man', name: 'Old Man', x: at(612), y: feetOn('library-3'), ...oldManArt,
          actsIn: ['old-man'], leave: { event: 'old-man', action: 'vanish' } },
        // The castle gates: PaperBag steps out and becomes CubeBot's squire.
        { id: 'paperbag', name: 'PaperBag', x: at(639), y: 0, ...paperbagArt,
          // He waits behind the pillar and steps out as CubeBot comes near.
          moves: [{ after: 'paperbag-joins', at: 'near', distance: 26, toX: at(642.5) }],
          actsIn: ['paperbag-joins'], follow: { from: 'paperbag-joins' } },
        // The mountain pass: the two climb together.
        { id: 'paperbag-mountain-pass', name: 'PaperBag', x: at(653), y: 0, ...paperbagArt,
          actsIn: ['paperbag-pass'], follow: {} },
        // The enchanted forest: PaperBag still at CubeBot's side; Mr. Golem
        // with Twigg on his head, who hops down to circle the travellers.
        { id: 'paperbag-enchanted-forest', name: 'PaperBag', x: at(780) + 4, y: 0, ...paperbagArt,
          actsIn: ['paperbag-bloomstorm'], follow: {} },
        { id: 'mr-golem', name: 'Mr. Golem', x: at(842), y: 0, ...golemArt, actsIn: ['mr-golem'] ,
          dialogue: [{ speaker: 'npc', text: 'The roots glow brightest at dusk. Do not stray from them.' }] },
        { id: 'twigg', name: 'Twigg', x: at(842), y: ON_GOLEMS_HEAD, perched: true, ...twigArt,
          actsIn: ['twigg'], moves: [{ after: 'mr-golem', toX: at(847) }] ,
          dialogue: [{ speaker: 'npc', text: 'Still here? The forest will not wait forever!' }] },
        // The water forest: PaperBag arrives with CubeBot and stays behind;
        // the Water Spirit rises from the pool and sinks back into it; Whitey
        // steps out from behind a white-barked tree and later steps aside.
        { id: 'paperbag-water-forest', name: 'PaperBag', x: at(980) + 4, y: 0, ...paperbagArt,
          actsIn: ['paperbag-sacrifice'], follow: { until: 'paperbag-sacrifice' },
          moves: [{ after: 'paperbag-sacrifice', toX: at(1006) }] ,
          dialogue: [{ speaker: 'npc', text: "I'll be right here. Probably. Go!" }] },
        { id: 'water-spirit', name: 'Water Spirit', x: at(1026), y: -3, perched: true, ...waterSpiritArt,
          appear: { event: 'water-spirit', at: 'start', enter: 'rise' },
          actsIn: ['water-spirit', 'water-spirit-sacrifice'],
          leave: { event: 'paperbag-sacrifice', action: 'sink' } },
        { id: 'whitey', name: 'Whitey', x: at(1017), y: 0, ...whiteyArt,
          appear: { event: 'water-spirit', at: 'start', enter: 'fade' },
          actsIn: ['whitey'], moves: [{ after: 'paperbag-sacrifice', toX: at(1013) }] ,
          dialogue: [{ speaker: 'npc', text: 'The mountain is waiting. So is the one you climb for.' }] },
        // The summit: PaperBag, who followed after all, is beside CubeBot when
        // he wakes - then the two head home together.
        { id: 'paperbag-peak', name: 'PaperBag', x: at(1166), y: feetOn('mountain-summit-1'), ...paperbagArt,
          appear: { event: 'paperbag-peak', at: 'start', enter: 'fade' },
          actsIn: ['paperbag-peak'], follow: { from: 'paperbag-peak' } },
        // The road home and the castle: PaperBag runs beside CubeBot; FlowerGirl
        // lies in her room.
        { id: 'paperbag-return', name: 'PaperBag', x: at(1260) + 4, y: 0, ...paperbagArt, follow: {} ,
          dialogue: [{ speaker: 'npc', text: "Almost home. Whatever you do, don't drop that flower!" }] },
        // The castle gates: armed guards and the Head Guard, who opens the gates
        // and leads CubeBot to the Princess's room.
        // "Follow me": he leads the way through the gates to the castle.
        { id: 'head-guard-gates', name: 'Head Guard', x: at(1294), y: 0, ...headGuardArt,
          leave: { event: 'castle-gates', action: 'walk', toX: at(1305) + 8, speed: 34 } },
        { id: 'guard-gates', name: 'Guard', x: at(1301), y: 0, ...guardArt, routine: { type: 'stand' } },
        // The Princess's room: the Head Guard, who led them in, PaperBag by the
        // wall, and the King and the Doctor at her bedside.
        { id: 'head-guard-room', name: 'Head Guard', x: at(1336), y: feetOn('princess-room-1'), ...headGuardArt,
          routine: { type: 'stand' } ,
          dialogue: [{ speaker: 'npc', text: 'The King has not left her side all week.' }] },
        { id: 'paperbag-room', name: 'PaperBag', x: at(1326), y: feetOn('castle-return-3'), ...paperbagArt,
          routine: { type: 'stand' } ,
          dialogue: [{ speaker: 'npc', text: "Go on. She's waiting for you." }] },
        { id: 'doctor', name: 'Doctor', x: at(1344), y: feetOn('princess-room-1'), ...doctorArt,
          routine: { type: 'stand' } ,
          dialogue: [{ speaker: 'npc', text: 'Nothing I have tried has helped her. If that flower is real...' }] },
        { id: 'guard-room-a', name: 'Guard', x: at(1370), y: feetOn('princess-room-1'), ...guardArt,
          routine: { type: 'stand' } },
        { id: 'guard-room-b', name: 'Guard', x: at(1376), y: feetOn('princess-room-1'), ...guardArt,
          routine: { type: 'stand' } },
        { id: 'king', name: 'King', x: at(1357), y: feetOn('princess-room-1'), ...kingArt,
          routine: { type: 'stand' } ,
          dialogue: [{ speaker: 'npc', text: 'If you truly carry the cure... please. Save my daughter.' }] },
        { id: 'flower-return', name: 'FlowerGirl', x: at(1350), y: feetOn('princess-room-1'), ...flowerArt,
          actsIn: ['flower-return'] },
      ],
      storyEvents: withStoryboard([
        {
          id: 'opening',
          x: 18,
          name: 'Narrator',
          asset: '',
          requiresInteraction: false,
          turns: [
            turn('narrator', 'The False Knight', 'title'),
            turn('narrator', 'On a grassy field beneath the World Tree, CubeBot watches the knights train beside the castle carved into its trunk.'),
            turn('narrator', 'He tries to imitate their swordplay, tumbles into the grass, then rises, salutes the distant castle, and sets off toward town.'),
          ],
        },
        scene('kid', at(64), 'Kid', paperbag, [
          turn('narrator', 'Town is in an uproar. A hooded child bumps into CubeBot and darts away.'),
          turn('kid', 'Sorry!'),
          turn('player', 'Wait… my coins!'),
          turn('narrator', 'The child leaps across the rooftops. CubeBot chases through the busy streets and follows the trail out toward the forest.'),
        ], true, { cutscene: { focus: ['kid'] } }),
        pageTurn('page-forest-clearing', 129, 'forest-clearing', 'Beyond the busy town, the road gives way to a quiet forest clearing.'),
        scene('flower-first-meeting', at(203), 'FlowerGirl', flowerGirl, [
          turn('narrator', 'A soft song leads CubeBot into a forest clearing filled with glowing insects. FlowerGirl is there, singing.'),
          turn('narrator', 'Guards hurry into the clearing and surround her.'),
          turn('Head Guard', 'Princess!'),
          turn('narrator', 'FlowerGirl glances back at CubeBot as the guards escort her away. He is left alone in the quiet forest.'),
        ], true, { cutscene: { focus: ['flowergirl-first-meeting', 'head-guard-clearing', 'guard-clearing'], holdCamera: true }, thenScene: 'forest-clearing' }),
        scene('flower-clearing', at(250), 'FlowerGirl', flowerGirl, [
          turn('player', 'Your Highness… I didn’t mean to intrude.'),
          turn('npc', 'You don’t have to kneel.'),
          turn('player', 'I was just… curious why the Princess is out here.'),
          turn('npc', 'It’s the only place where I can breathe.'),
          turn('narrator', 'They sit together beneath a tree. For the first time, CubeBot is not pretending to be a knight; he is simply himself.'),
        ], true, { manual: true }),
        scene('flower-bodyguard', at(300), 'FlowerGirl', flowerGirl, [
          turn('narrator', 'The next evening, guards find them together. FlowerGirl calmly tells them CubeBot is her personal bodyguard.'),
          turn('Head Guard', 'He does not look like a royal guard.'),
          turn('npc', 'He is disguised.'),
          turn('narrator', 'The guards reluctantly escort FlowerGirl toward the castle. CubeBot looks from his small hands to the World Tree, realizing the moment is real.'),
        ], true, { cutscene: { focus: ['flowergirl', 'head-guard-escort', 'guard-escort'] }, thenScene: 'castle' }),
        scene('flower-room', at(390), 'FlowerGirl', flowerGirl, [
          turn('narrator', 'Inside the castle, FlowerGirl explains why she called him her bodyguard.'),
          turn('npc', 'Because I wanted you to stay. You’re the first friend I’ve ever had… and I like you.'),
          turn('player', 'L-like… me?'),
          turn('npc', 'Show this pendant to someone whenever you are in trouble.'),
          turn('narrator', 'She gives CubeBot her royal pendant. As he leaves through the window, FlowerGirl quietly coughs blood and hides it.'),
        ], true, { manual: true }),
        pageTurn('page-castle-and-night-road', 400, 'castle-walls', 'Night settles over the kingdom as CubeBot leaves the castle and follows the thief into the moonlit streets.'),
        scene('thief', at(465), 'Thief', paperbag, [
          turn('narrator', 'Outside the castle, two guards are roughing up the hooded thief. The royal crest on the pendant makes them step back.'),
          turn('player', 'I will handle this.'),
          turn('narrator', 'The thief tries to flee. CubeBot catches him, then listens as he explains that he stole food for his sick sister.'),
          turn('thief', 'I didn’t want trouble. I just needed food.'),
          turn('player', 'Go. Do not waste this chance.'),
          turn('narrator', 'CubeBot lets him go, then stands alone beneath the moonlight, thinking about the pendant and the thief.'),
        ], true, { manual: true, cutscene: { focus: ['thief'] }, thenScene: 'hillside' }),
        scene('flower-collapse', at(516), 'Narrator', '', [
          turn('narrator', 'Days later, FlowerGirl collapses beneath their tree. CubeBot carries her through the rain to the castle gates and follows the knights to the Seer.'),
          turn('seer', 'She carries a rare illness, found only among the Flower Race. When the sleeping curse blooms completely, she will never wake.', 'dialogue', { scene: 'seer-house' }),
          turn('player', 'How long does she have? Is there a cure?'),
          turn('seer', 'One week. There is a cure: the Undying Flower.'),
          turn('narrator', 'CubeBot runs into the storm. The Seer’s warning follows him: the flower may exist only in stories.'),
        ], false, { thenScene: 'library' }),
        scene('old-man', at(612), 'Old Man', oldMan, [
          turn('narrator', 'Soaked from the storm, CubeBot searches the grand library through the night. An old man appears at the end of an aisle.'),
          turn('old man', 'Few dare to seek the Undying Flower. Fewer return. It grows at the highest peak of the tallest mountain.'),
          turn('player', 'How do I find it?'),
          turn('old man', 'The mountain finds those desperate enough.'),
          turn('narrator', 'The old man vanishes. CubeBot grips the pendant and leaves at dawn, determined to find the cure.'),
        ], true, { cutscene: { focus: ['old-man'] }, talkLead: 18 }),
        pageTurn('page-castle-gates-and-library', 620, 'castle-gates', 'At the castle gates, a familiar face waits in the first light of morning.'),
        scene('paperbag-joins', at(636), 'PaperBag', paperbag, [
          turn('narrator', 'At the closed castle gates, the former thief steps from the shadows. He reveals a paper bag over his face and calls himself PaperBag.'),
          turn('player', 'Why hide your face?'),
          turn('npc', 'Long story. You’re going after that flower, right? Let me be your squire. I owe you.'),
          turn('player', 'This journey is dangerous. You will slow me down.'),
          turn('npc', 'Or I’ll keep you alive.'),
          turn('narrator', 'CubeBot starts toward the mountains.'),
          turn('player', 'Keep up, squire.'),
          turn('npc', 'Yes, sir!'),
        ], true, { thenScene: 'mountain-pass' }),
        scene('paperbag-pass', at(690), 'PaperBag', paperbag, [
          turn('narrator', 'On the narrow mountain pass, the ground trembles and a landslide crashes down. CubeBot shields PaperBag from the boulders.'),
          // The journey follows the storyboard: up the trail to the ledge where
          // the landslide comes down (frames 43-46), then - after the slip and
          // the rescue at the edge (47-49) - collapsed on solid ground where the
          // pass gives way to the enchanted forest (50).
          turn('player', 'Move!', 'dialogue', { at: at(706) }),
          turn('narrator', 'PaperBag slips toward the edge. CubeBot catches his arm and pulls him back as rocks tumble past.'),
          turn('npc', 'Okay… I take it back. This is definitely trying to kill us.', 'dialogue', { scene: 'enchanted-forest', at: at(788) }),
          turn('player', 'Then we must climb faster.'),
        ]),
        pageTurn('page-enchanted-forest', 780, 'enchanted-forest', 'The mountain pass opens into an ancient forest, where a Bloomstorm is gathering among the trees.'),
        scene('mr-golem', at(842), 'Mr. Golem', golem, [
          turn('narrator', 'They enter an enchanted forest. A Bloomstorm tears through the trees, roots and glowing pollen whipping across the path. They shelter beneath a stone outcrop.'),
          turn('player', 'Stay close!'),
          turn('npc', 'Few survive the Bloomstorm.'),
          turn('player', 'We seek the highest peak. The Undying Flower.'),
          turn('npc', 'The path ahead is not meant for ordinary travelers.'),
          turn('player', 'We are not ordinary.'),
          turn('npc', 'Follow the roots that glow at dusk. They will lead you beyond the forest.'),
          turn('narrator', 'Twigg hops down from Mr. Golem’s shoulder and circles the travelers.'),
        ], true, { cutscene: { focus: ['twigg'] } }),
        scene('twigg', at(847), 'Twigg', twig, [
          turn('npc', 'Brave… or foolish. Then perhaps you may continue.'),
          turn('narrator', 'Mr. Golem points deeper into the forest, toward a narrow path behind ancient trees.'),
          turn('narrator', 'Follow the roots that glow at dusk. They will lead you beyond the forest.'),
        ], true, { manual: true, optional: true }),
        scene('paperbag-bloomstorm', at(852), 'PaperBag', paperbag, [
          turn('paperbag', 'Why do all helpful beings speak in riddles?'),
        ], true, { manual: true, optional: true }),
        pageTurn('page-water-forest', 980, 'water-forest', 'The glowing roots lead the travelers out of the storm and into a still forest gathered around a pool.'),
        scene('water-spirit', at(1008), 'Water Spirit', waterSpirit, [
          turn('narrator', 'In a quiet water forest, a figure rises from a pool.'),
          turn('npc', 'Many have sought the Undying Flower for power. You seek it for someone else.'),
          turn('player', 'I will reach it.'),
          turn('npc', 'The next ascent will test not strength… but sacrifice.'),
        ], false),
        scene('whitey', at(1012), 'Whitey', raincat, [
          turn('narrator', 'Whitey steps from behind a white-barked tree and regards the travelers.'),
          turn('npc', 'You have crossed the mountain and survived the Bloomstorm. Your resolve remains unbroken.'),
          turn('player', 'Why are you guiding us?'),
          turn('npc', 'We do not guide.'),
          turn('narrator', 'The Water Spirit answers from the pool: “We challenge.”'),
        ], true, { manual: true, optional: true }),
        scene('water-spirit-sacrifice', at(1016), 'Water Spirit', waterSpirit, [
          turn('narrator', 'Climbing hooks, enchanted rope, and ice-resistant gloves rise from the water and float toward CubeBot and PaperBag.'),
          turn('npc', 'The mountain ahead devours the unprepared. One of you will not make it if both continue.'),
        ], true, { manual: true }),
        scene('paperbag-sacrifice', at(1020), 'PaperBag', paperbag, [
          turn('paperbag', 'He’s faster. Stronger. Built for this.'),
          turn('player', 'You are my squire.'),
          turn('paperbag', 'I’ll wait here. Try not to die, okay?'),
          turn('narrator', 'CubeBot turns toward the mountain alone. PaperBag watches him disappear into the mist.'),
        ], true, { manual: true, cutscene: { focus: ['water-spirit'] } }),
        pageTurn('page-mountain-ascent', 1100, 'mountain-ascent', 'The last trees fall away. Above the clouds, the mountain rises into the snow.'),
        {
          id: 'mountain-ascent',
          x: at(1106),
          name: 'Narrator',
          asset: '',
          requiresInteraction: false,
          turns: [
            turn('narrator', 'The mountain rises above the clouds. CubeBot hooks his rope into the rock and begins the long climb alone.'),
            turn('narrator', 'Loose stone breaks beneath him. He dangles over open air, catches himself, and climbs on through cold fog and ice.', 'dialogue', { waitX: at(1140) }),
            turn('narrator', 'At sunset, exhausted and flickering, he reaches the summit and collapses beside a single glowing flower.', 'dialogue', { waitX: at(1163) }),
          ],
        },
        scene('paperbag-peak', at(1171.5), 'PaperBag', paperbag, [
          turn('narrator', 'CubeBot pulls the Undying Flower free. Its light overwhelms him, and his vision fades to the grassy field where his journey began.'),
          // Script, scene 15: FlowerGirl's voice in CubeBot's dream, not PaperBag.
          turn('flowergirl', 'CubeBot… wake up… please wake up…'),
          turn('player', 'Stop—'),
          turn('narrator', 'The dream shatters. CubeBot wakes on the snowy peak with the flower still in his hands. PaperBag is beside him.'),
          turn('player', 'You… stayed behind.'),
          turn('npc', 'Yeah. About that. You really thought I’d let you collapse alone up here?'),
          turn('npc', 'You found it.'),
          turn('narrator', 'The storm begins to calm. The two friends prepare to return to the kingdom with the cure.'),
        ], false),
        pageTurn('page-return-to-the-kingdom', 1260, 'return-to-the-kingdom', 'With the Undying Flower safe, the two friends begin the long journey home.'),
        scene('castle-gates', at(1290), 'Narrator', '', [
          turn('narrator', 'CubeBot and PaperBag hurry down the road. The castle is strangely quiet, and its gates are closed.'),
          turn('Head Guard', 'State your business.'),
          turn('player', 'We have returned with the cure.'),
          turn('narrator', 'CubeBot shows FlowerGirl’s pendant. The Head Guard recognizes the royal crest and opens the gates.'),
          turn('Head Guard', 'Open the gates. Follow me.'),
        ], false, { cutscene: { focus: ['head-guard-gates'] }, thenScene: 'princess-room' }),
        scene('flower-return', at(1350), 'FlowerGirl', flowerGirl, [
          turn('narrator', 'FlowerGirl lies pale and still in her room. CubeBot gives the Undying Flower to the Doctor. Its light fills the chamber.'),
          turn('player', 'This will cure her. Use it.'),
          turn('narrator', 'The Doctor prepares an infusion. A faint glow spreads across FlowerGirl’s chest; color returns, and her eyes open.'),
          turn('npc', 'CubeBot…?'),
          turn('narrator', 'The next morning, the kingdom is alive again. The pendant rests around FlowerGirl’s neck. CubeBot stands by the window as peace returns to the World Tree.'),
          turn('narrator', 'The False Knight', 'title'),
          turn('narrator', 'A friend, a squire, and a hero—not because of armor, but because he chose to help. The End.'),
        ], true, { manual: true, endsStory: true }),
      ]),
    },
  };

  // In Tagalog (KoobD's language set to Tagalog) the story is told in Tagalog:
  // every line, name and place the reader sees is swapped for its Tagalog in
  // false-knight-story.tl.js. The title stays as it is, and so does anything
  // without a Tagalog version (the characters' own names).
  const tagalog = window.KoobdI18n && window.KoobdI18n.lang === 'tl' ? window.KOOBD_FALSE_KNIGHT_TL : null;
  if (tagalog) {
    const story = window.KOOBD_FALSE_KNIGHT_STORY;
    const SHOWN = new Set(['text', 'name', 'title', 'time', 'lesson']);
    const tell = (node) => {
      if (Array.isArray(node)) { node.forEach(tell); return; }
      if (!node || typeof node !== 'object') return;
      Object.keys(node).forEach((key) => {
        const value = node[key];
        if (typeof value === 'string') {
          if (SHOWN.has(key) && Object.prototype.hasOwnProperty.call(tagalog, value)) node[key] = tagalog[value];
        } else {
          tell(value);
        }
      });
    };
    tell(story.world);
    story.lesson = tagalog[story.lesson] || story.lesson;
  }
})();
