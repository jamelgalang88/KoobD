(function () {
  window.startKoobdPlatformerPage = function (config, onComplete) {
  config = config || {};
  const pages = Array.isArray(config.pages) ? config.pages : [];
  const stage = document.getElementById('platformerStoryStage');
  const sourcePage = config.page || pages[Number(config.storyPageIndex) || 0] || pages[0];
  const world = config.platformerWorld || config.world
    || buildWorldFromPages(sourcePage ? [sourcePage] : [], 0);
  if (!stage || !world) return () => {};
  const eventController = new AbortController();
  // A stage that follows another one (a story with several platform pages)
  // starts clean: the last one's ending, fade and cutscene states are gone.
  stage.classList.remove('is-story-ended', 'is-scene-transitioning', 'is-cutscene', 'is-dialogue-open');

  const background = document.getElementById('platformerStoryBackground');
  const worldLayer = document.getElementById('platformerStoryWorld') || stage.querySelector('.platformer-story-world');
  let backgroundSegmentsLayer = worldLayer?.querySelector('.platformer-story-backgrounds');
  if (worldLayer && !backgroundSegmentsLayer) {
    backgroundSegmentsLayer = document.createElement('div');
    backgroundSegmentsLayer.className = 'platformer-story-backgrounds';
    worldLayer.prepend(backgroundSegmentsLayer);
  }
  const ground = document.getElementById('platformerStoryGround');
  const platformsLayer = document.getElementById('platformerStoryPlatforms');
  // Scenery that does not block movement (`world.decor`), in depth order:
  // `far` (the horizon, just in front of the background art), `back` (props
  // behind the characters), `lights` (flames, lamps, glowing things - kept out
  // of the scene's tint so night never dims them) and `front` (in front of
  // the characters).
  const decorLayers = {};
  // The layers behind everything that the scene's time-of-day tint colours
  // (the background, far and back scenery, the ground) share one wrapper, so
  // the tint is one filter pass instead of one per layer. Tints are colour
  // matrices (brightness, saturation, hue, sepia), which look the same on the
  // group as on each layer. A wrapper left by an earlier page is undone first.
  let tintGroup = null;
  if (worldLayer) {
    worldLayer.querySelectorAll('.platformer-tint-group').forEach((group) => {
      group.replaceWith(...group.childNodes);
    });
    worldLayer.querySelectorAll('.platformer-decor-layer').forEach((layer) => layer.remove());
    const makeLayer = (name, z) => {
      const layer = document.createElement('div');
      layer.className = `platformer-decor-layer is-${name}`;
      layer.style.zIndex = String(z);
      decorLayers[name] = layer;
      return layer;
    };
    backgroundSegmentsLayer?.after(makeLayer('far', 0));
    (ground || backgroundSegmentsLayer)?.after(makeLayer('back', 1), makeLayer('lights', 1));
    worldLayer.append(makeLayer('front', 4));
    if (backgroundSegmentsLayer && backgroundSegmentsLayer.parentNode === worldLayer) {
      tintGroup = document.createElement('div');
      tintGroup.className = 'platformer-tint-group';
      backgroundSegmentsLayer.before(tintGroup);
      tintGroup.append(...[backgroundSegmentsLayer, decorLayers.far, ground, decorLayers.back]
        .filter((layer) => layer && layer.parentNode === worldLayer));
    }
  }
  const npcLayer = document.getElementById('platformerStoryNpcs');
  const player = document.getElementById('platformerStoryPlayer');
  const playerProfile = config.playerProfile || {};
  const playerSprite = player?.tagName === 'IMG' ? player : player?.querySelector('img');
  const playerUsesSpriteSheet = Boolean(playerProfile.animationAsset && playerSprite);
  const SPRITE_FRAME_WIDTH = 32;
  const SPRITE_FRAME_HEIGHT = 46;
  if (playerUsesSpriteSheet) {
    player.classList.add('is-animated');
    playerSprite.classList.add('platformer-sprite-sheet');
    playerSprite.src = playerProfile.animationAsset;
    playerSprite.onerror = () => console.error(`Could not load player animation sheet: ${playerProfile.animationAsset}`);
  }
  worldLayer?.querySelector('.platformer-hitbox-overlay')?.remove();
  const hitboxSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  hitboxSvg.classList.add('platformer-hitbox-overlay');
  hitboxSvg.setAttribute('aria-hidden', 'true');
  const hitboxToggle = document.createElement('button');
  hitboxToggle.type = 'button';
  hitboxToggle.className = 'platformer-hitbox-toggle';
  hitboxToggle.textContent = 'Hitboxes: On';
  hitboxToggle.title = 'Red: obstacles · Green: player · Purple: NPCs · Yellow: ground. Press H to toggle.';
  hitboxToggle.setAttribute('aria-label', hitboxToggle.title);
  hitboxToggle.setAttribute('aria-pressed', 'true');
  stage.appendChild(hitboxToggle);
  worldLayer?.appendChild(hitboxSvg);
  const debugHitboxes = config.debugHitboxes !== false;
  let hitboxesVisible = debugHitboxes;
  if (!debugHitboxes) {
    hitboxToggle.remove();
    hitboxSvg.classList.add('hidden');
  }
  const chatButton = document.getElementById('platformerChatButton');
  const dialogue = document.getElementById('platformerDialogue');
  if (dialogue) {
    dialogue.className = 'platformer-story-dialogue vn-wrapper hidden';
    dialogue.setAttribute('role', 'dialog');
    dialogue.setAttribute('aria-label', 'Character dialogue');
    dialogue.setAttribute('aria-hidden', 'true');
    dialogue.innerHTML = `
      <div class="vn-characters">
        <span class="vn-char left" id="platformerDialogueFigureLeft"><img src="" alt=""></span>
        <span class="vn-char right" id="platformerDialogueFigureRight"><img src="" alt=""></span>
      </div>
      <div class="vn-dialogue" translate="no">
        <div class="vn-names">
          <div class="name-box" id="platformerDialogueNameLeft"></div>
          <div class="name-box" id="platformerDialogueNameRight"></div>
        </div>
        <div class="dialogue-box visible" id="platformerDialogueText"></div>
        <div class="vn-choices" id="platformerDialogueChoices"></div>
      </div>
      <div class="choice-timer hidden" id="platformerDialogueTimer" aria-hidden="true">
        <div class="choice-timer-track">
          <div class="choice-timer-fill" id="platformerDialogueTimerFill"></div>
        </div>
      </div>
      <!-- Story card: a full-bleed black screen used for a turn typed "title" and
           for narrator turns. Both read as an introduction rather than dialogue -
           centred on black with the gameplay hidden behind them - so they share
           one card, told apart only by a modifier class for typography. It is
           deliberately not the narrator's dialogue box. -->
      <div class="vn-story-card" id="platformerTitleCard" aria-hidden="true" translate="no">
        <p class="vn-story-card-text" id="platformerTitleCardText"></p>
      </div>`;
  }
  const dialogueFigureLeft = document.getElementById('platformerDialogueFigureLeft');
  const dialogueFigureRight = document.getElementById('platformerDialogueFigureRight');
  const dialogueNameLeft = document.getElementById('platformerDialogueNameLeft');
  const dialogueNameRight = document.getElementById('platformerDialogueNameRight');
  const dialogueText = document.getElementById('platformerDialogueText');
  const dialogueChoices = document.getElementById('platformerDialogueChoices');
  const titleCard = document.getElementById('platformerTitleCard');
  const titleCardText = document.getElementById('platformerTitleCardText');
  // The title card is moved onto the stage (see ensureTitleCardOnStage) so it
  // can fade independently of the dialogue being display:none. It therefore
  // needs its own click-to-advance, and it must not be a child of the dialogue.
  // A storyboard frame shown on the card above a narration line (`turn.image`).
  let titleCardFrame = null;
  let titleCardImage = null;
  if (titleCard && titleCardText) {
    titleCard.querySelector('.vn-story-card-frame')?.remove();
    titleCardFrame = document.createElement('figure');
    titleCardFrame.className = 'vn-story-card-frame';
    titleCardImage = document.createElement('img');
    titleCardImage.alt = '';
    titleCardFrame.appendChild(titleCardImage);
    titleCard.insertBefore(titleCardFrame, titleCardText);
  }
  if (titleCard) {
    titleCard.classList.add('is-stage-title');
    stage.appendChild(titleCard);
    titleCard.addEventListener('click', (event) => {
      event.stopPropagation();
      if (performance.now() < ignoreDialogueClickUntil) return;
      if (dialogueOpen) advanceDialogue();
    }, { signal: eventController.signal });
  }
  const choiceTimer = document.getElementById('platformerDialogueTimer');
  const choiceTimerFill = document.getElementById('platformerDialogueTimerFill');
  const modeLabel = document.getElementById('platformerStoryMode');
  let progressBar = document.getElementById('platformerStoryProgress');
  let progressFill = document.getElementById('platformerStoryProgressFill');
  let progressThumb = document.getElementById('platformerStoryProgressThumb');
  if (!progressBar) {
    const hud = stage.querySelector('.platformer-story-hud');
    if (hud) {
      progressBar = document.createElement('div');
      progressBar.className = 'platformer-story-progress';
      progressBar.id = 'platformerStoryProgress';
      progressBar.setAttribute('role', 'slider');
      progressBar.setAttribute('aria-label', 'Navigate the platformer world');
      progressBar.setAttribute('aria-valuemin', '0');
      progressBar.setAttribute('aria-valuemax', '100');
      progressBar.setAttribute('aria-valuenow', '0');
      progressBar.tabIndex = 0;
      progressFill = document.createElement('span');
      progressFill.id = 'platformerStoryProgressFill';
      progressThumb = document.createElement('button');
      progressThumb.type = 'button';
      progressThumb.id = 'platformerStoryProgressThumb';
      progressThumb.setAttribute('aria-label', 'Navigate platformer world');
      progressBar.append(progressFill, progressThumb);
      hud.insertBefore(progressBar, modeLabel || null);
    }
  }
  const leftButton = document.getElementById('platformerMoveLeft');
  const rightButton = document.getElementById('platformerMoveRight');
  const jumpButton = document.getElementById('platformerJumpButton');
  const progressContext = String(config.progressContext || 'global');
  const allowProgressNavigation = config.allowProgressNavigation !== false;
  if (progressBar && !allowProgressNavigation) {
    progressBar.setAttribute('role', 'progressbar');
    progressBar.setAttribute('aria-label', 'Story progress');
    progressBar.removeAttribute('tabindex');
    if (progressThumb) {
      progressThumb.disabled = true;
      progressThumb.tabIndex = -1;
      progressThumb.setAttribute('aria-hidden', 'true');
    }
    stage.classList.add('is-progress-readonly');
  }

  const isPreview = config.mode === 'preview';
  // The story's text style: { font: CSS font stack, size: small | medium | large }.
  if (config.textStyle) {
    if (config.textStyle.font) stage.style.setProperty('--story-font', config.textStyle.font);
    if (config.textStyle.size) stage.dataset.textSize = config.textStyle.size;
  }
  const hasGround = Boolean(world.groundAsset)
    || (Array.isArray(world.grounds) && world.grounds.some((segment) => Boolean(segment.asset || segment.tiles)));
  // The world is WORLD_HEIGHT scene units tall (100 = one screen height) with
  // an 18-unit ground band at the very bottom; entity y is height measured
  // upward from the band's top.
  const GROUND_BAND = 18;
  const WORLD_HEIGHT = 300;
  const WORLD_LAYER_HEIGHT = hasGround ? WORLD_HEIGHT : 500;
  const groundTop = WORLD_HEIGHT - GROUND_BAND;
  const WORLD_VIEW_SCALE = 1.08;
  const gravity = 200;
  const FALL_GRAVITY_SCALE = 1.7;
  const moveSpeed = 38;
  const MAX_FALL_SPEED = 220;
  // How high a full jump lifts a character's feet, in scene units. Everyone -
  // the player and every scripted character - shares the gravity above, the
  // faster fall and the fall-speed cap; a world can also set one jump height
  // for its whole cast (`world.jumpRise`), so the player jumps exactly as high
  // as the other characters do. Without it the original jump is kept:
  // v^2 / 2g = 105^2 / (2 * 200) = 27.5.
  const CHARACTER_JUMP_RISE = Number(world.jumpRise) > 0 ? Number(world.jumpRise) : 27.5625;
  const jumpVelocity = Math.sqrt(2 * gravity * CHARACTER_JUMP_RISE);
  // Responsiveness: allow jumping shortly after leaving ground and buffer
  // jump presses slightly before landing.
  const COYOTE_TIME = 0.1;
  const JUMP_BUFFER = 0.12;
  const CHOICE_TIMER_MS = 8000;
  // Distance (scene % of width) at which an NPC can be talked to — used both
  // for the chat button prompt and for clicking the NPC directly.
  const NPC_TALK_RANGE = 14;
  // NPC wandering: gentle stroll around their spawn point with walk animation.
  const NPC_WALK_SPEED = 9;
  const NPC_WANDER_RADIUS = 42;
  // World size in scene units, where 100 units = one screen.
  const WORLD_WIDTH = Math.max(1000, Number(world.width) || 1000);
  const storyScenes = Array.isArray(world.scenes) ? world.scenes : [];
  const initialSceneX = config.initialPlayerX ?? world.player?.x ?? 0;
  let activeStoryScene = storyScenes.find((scene) => scene.id === config.initialStorySceneId)
    || storyScenes.find((scene) =>
    Number(initialSceneX) >= Number(scene.startX || 0)
    && Number(initialSceneX) < Number(scene.endX || WORLD_WIDTH)
  ) || storyScenes[0] || null;
  let sceneTransitioning = false;
  {
    const resumeEvents = Array.isArray(world.storyEvents) ? world.storyEvents : [];
    const doneCount = Math.max(0, Math.min(resumeEvents.length, Number(config.initialStoryEventIndex) || 0));
    const lastTurn = resumeEvents.slice(0, doneCount).filter((event) => event.nextScene || event.thenScene).pop();
    const turnedTo = lastTurn && storyScenes.find((scene) => scene.id === (lastTurn.nextScene || lastTurn.thenScene));
    if (turnedTo && storyScenes.indexOf(turnedTo) > storyScenes.indexOf(activeStoryScene)) {
      activeStoryScene = turnedTo;
    }
  }
  const MAX_CAMERA = WORLD_WIDTH - (100 / WORLD_VIEW_SCALE);
  const MAX_CAMERA_Y = WORLD_LAYER_HEIGHT - (100 / WORLD_VIEW_SCALE);
  let groundSurfaceDepths = [];
  // Highest point (scene y) the active scene's background art reaches; the
  // camera never looks above it.
  let backdropTop = 0;
  // Geometry Dash-style framing: the character sits this far from the screen
  // edge in the direction it is facing.
  const CAMERA_ANCHOR_FORWARD = 44 / WORLD_VIEW_SCALE;
  const CAMERA_ANCHOR_BACKWARD = 56 / WORLD_VIEW_SCALE;
  const CAMERA_LERP_RATE = 11;
  // Vertical framing: the character's feet stay this many scene units below
  // the top of the view; on the ground that parks the camera at the world's
  // bottom band, matching the original full-height view.
  const CAMERA_ANCHOR_Y = 64 / WORLD_VIEW_SCALE;
  // Vertical dead-zone (scene units from the view's top edge): while airborne
  // the camera only moves when the feet approach the upper edge
  // (CAMERA_DEADZONE_TOP) or the lower edge (CAMERA_DEADZONE_BOTTOM), so
  // ordinary jumps keep the world perfectly still.
  const CAMERA_DEADZONE_TOP = 24 / WORLD_VIEW_SCALE;
  const CAMERA_DEADZONE_BOTTOM = 78 / WORLD_VIEW_SCALE;
  // Distance from the right edge that counts as finishing the world.
  const FINISH_MARGIN = 55;
  // Where a new scene puts the player: far enough in that the whole character
  // is on screen at the scene's opening camera.
  const SCENE_ENTRY_OFFSET = 10;
  // Falling this far below the ground band (into a ravine or pool) returns the
  // player to the last solid footing.
  const FALL_RESPAWN_DEPTH = 30;

  // Camera bounds for the active scene: the view is 100 / WORLD_VIEW_SCALE
  // scene units wide, so clamp it to [sceneStart, sceneEnd - viewWidth] to
  // guarantee blank space beyond a background is never revealed.
  const SCENE_VIEW_WIDTH = 100 / WORLD_VIEW_SCALE;
  function sceneCameraBounds(scene = activeStoryScene) {
    const startX = clamp(Number(scene?.startX) || 0, 0, MAX_CAMERA);
    const endX = Number(scene?.endX) || WORLD_WIDTH;
    return { min: startX, max: clamp(endX - SCENE_VIEW_WIDTH, startX, MAX_CAMERA) };
  }
  function scenePlayerBounds(scene = activeStoryScene) {
    const startX = Number(scene?.startX) || 0;
    const endX = Number(scene?.endX) || WORLD_WIDTH;
    return { min: startX, max: endX };
  }
  const BLOCK_TYPES = window.KOOBD_PLATFORMER_BLOCKS;
  const platformImageParts = new Map();
  // Bumped when anything collision shapes depend on changes (the stage size,
  // a picture's traced outline): cached shapes older than it are rebuilt.
  let geometryVersion = 0;
  const platformImageLoads = new Map();
  // Retired square/brick/thin/slope/spike data maps onto the four designs.
  const LEGACY_BLOCK_TYPE_MAP = { square: 'block1', brick: 'block2', thin: 'block2', slope: 'block3', spike: 'block4' };
  function blockTypeId(value) {
    const id = String(value || '');
    if (BLOCK_TYPES.some((b) => b.id === id)) return id;
    return LEGACY_BLOCK_TYPE_MAP[id] || 'block1';
  }
  function blockTypeDef(value) {
    return BLOCK_TYPES.find((b) => b.id === blockTypeId(value)) || BLOCK_TYPES[0];
  }
  function readPlatformImageParts(img) {
    return window.KOOBD_PLATFORMER_COLLISION.readImageParts(img);
  }

  function nextInteractionGateX() {
    const event = storyEvents[storyEventIndex];
    if (!event?.requiresInteraction || world.autoTalk || event.optional) return WORLD_WIDTH;
    const eventX = Number(event.x) || 0;
    return Math.max(eventX, Number(event.gateX ?? (eventX + NPC_TALK_RANGE)));
  }

  function loadPlatformImageParts(def) {
    if (!def.img || platformImageParts.has(def.id)) return Promise.resolve();
    const existingLoad = platformImageLoads.get(def.id);
    if (existingLoad) return existingLoad;

    const image = new Image();
    const load = new Promise((resolve) => {
      image.onload = () => {
        try {
          const parts = readPlatformImageParts(image);
          if (!parts.length) console.warn(`Block image for ${def.id} has no opaque pixels; it will not collide.`);
          platformImageParts.set(def.id, parts);
          geometryVersion += 1;
        } catch (error) {
          console.error(`Could not read collision data for block image ${def.id}.`, error);
          platformImageParts.set(def.id, null);
          geometryVersion += 1;
        }
        renderStaticHitboxes();
        resolve();
      };
      image.onerror = () => {
        console.error(`Could not load block image for ${def.id}: ${def.img}`);
        platformImageParts.set(def.id, null);
        resolve();
      };
      image.src = def.img;
    });
    platformImageLoads.set(def.id, load);
    return load;
  }

  // Set while the character is failing on a hazard, until it respawns.
  let hazardHit = false;
  let playerHalfWidth = 2;
  let playerHeight = 12;
  let coyoteTimer = 0;
  let jumpBufferTimer = 0;
  // Keep character bounds at the full rendered sprite size; visible feet are
  // aligned separately to the collision origin below.
  const HITBOX_HEIGHT_SCALE = 1;
  const HITBOX_WIDTH_SCALE = 1;

  // Vertical offset (in scene % height) compensating for transparent padding
  // at the bottom of the character sprite, so visible feet match the hitbox.
  let playerBottomTrim = 0;
  // The transparent margins of the player's picture (fractions of it), so a
  // hazard is touched by the character's visible body, not its picture box.
  let playerBodyTrim = { top: 0, bottom: 0, left: 0, right: 0 };

  const initialSpawn = spawn();
  let playerX = clamp(isPreview ? initialSpawn.x : (Number(config.initialPlayerX) || initialSpawn.x), 2, WORLD_WIDTH - 2);
  let playerY = clamp(initialSpawn.y, 0, groundTop);
  let velocityY = 0;
  let direction = 0;
  let lastDirection = 1;
  let grounded = false;
  let lastSafeX = playerX;
  let lastSafeY = playerY;
  // Checkpoints sit on safe footing before each obstacle that cannot be walked
  // back through. Falling, or asking to return, restarts from the last one
  // passed in the current scene (or the scene's own entry point).
  const checkpoints = (Array.isArray(world.checkpoints) ? world.checkpoints : [])
    .filter((checkpoint) => Number.isFinite(Number(checkpoint?.x)))
    .slice()
    .sort((a, b) => Number(a.x) - Number(b.x));
  let checkpointX = null;
  // True while the "Leave Story" confirmation is showing.
  let exitPromptOpen = false;
  let activeNpc = null;
  let conversationNpc = null;
  let turnIndex = 0;
  let dialogueOpen = false;
  let playerWalkAnimationTime = 0;
  let choiceTimerFrame = 0;
  let dialogueTextTimer = 0;
  let frameId = null;
  let lastTime = performance.now();
  let cameraX = 0;
  let cameraY = MAX_CAMERA_Y;
  let cameraSnapped = false;
  let manualCamera = false;
  let suppressWorldClick = false;
  let completed = false;
  let lastSavedX = -1;
  let lastSaveAt = 0;
  let lastModeText = '';
  const storyEvents = Array.isArray(world.storyEvents) ? world.storyEvents : [];
  const configuredStoryEventIndex = config.initialStoryEventIndex;
  const derivedStoryEventIndex = config.initialPlayerX === undefined
    ? 0
    : storyEvents.filter((event) => Number(event.x) < Number(config.initialPlayerX)).length;
  // Optional story talks the player walked past, by character (see skipPassedOptionalEvents).
  const missedTalks = new Map();
  let storyEventIndex = configuredStoryEventIndex === null || configuredStoryEventIndex === undefined
    ? clamp(derivedStoryEventIndex, 0, storyEvents.length)
    : clamp(Number(configuredStoryEventIndex) || 0, 0, storyEvents.length);
  const npcStates = new Map();
  const npcSizes = new Map();

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  // Writes a style only when it changes. Every frame sets each character's
  // position and sprite frame; most of those values are the same as the last
  // frame (a standing character, a frame held for several ticks), and an
  // unchanged write still costs the browser a style and layout pass - real
  // time on a slow tablet.
  const styleCache = new WeakMap();
  function setStyle(node, prop, value) {
    if (!node) return;
    let cache = styleCache.get(node);
    if (!cache) { cache = {}; styleCache.set(node, cache); }
    if (cache[prop] === value) return;
    cache[prop] = value;
    if (prop.startsWith('--')) node.style.setProperty(prop, value);
    else node.style[prop] = value;
  }
  function setSpriteFrame(image, row, column) {
    if (!image) return;
    setStyle(image, 'left', `${-column * 100}%`);
    setStyle(image, 'top', `${-row * 100}%`);
  }
  // The sprite sheets are drawn facing right only, so facing left is a mirror
  // of the frame that is showing. The sheet <img> is six frames wide and slides
  // under its clipping box, so the mirror must pivot on the centre of the
  // CURRENT frame - and because the frame changes every tick, the pivot is set
  // together with the frame, every time. (Setting it only when the direction
  // changed left a stale pivot, so the mirrored box showed the wrong cell or an
  // empty one, which read as the character flipping/spinning.) The box itself
  // is never transformed, so there is no rotation or scale animation to see.
  function setSpriteFrameFacing(image, row, column, facingLeft, extraTransform = '') {
    if (!image) return;
    setSpriteFrame(image, row, column);
    setStyle(image, 'transformOrigin', `${(((column + 0.5) / 6) * 100).toFixed(3)}% 50%`);
    setStyle(image, 'transform', `${facingLeft ? 'scaleX(-1)' : ''}${extraTransform}`.trim());
  }
  // Scene x is measured in screen widths (100 = one screen); the world layer
  // is WORLD_WIDTH% of the stage wide, so convert scene units to the layer's
  // own %-coordinate space for CSS positioning.
  function toLayerPercent(x) { return (x / WORLD_WIDTH) * 100; }
  // Same conversion for y: the layer is WORLD_HEIGHT% of the stage tall, so
  // CSS top/translate percentages refer to the layer's box, not the stage.
  function toLayerYPercent(y) { return (y / WORLD_LAYER_HEIGHT) * 100; }
  // Layer %-bottom for an entity whose feet are `feetAboveGround` above the
  // ground band's top (the y storage convention for the player and NPCs).
  function entityBottomPct(feetAboveGround) {
    return ((WORLD_LAYER_HEIGHT - groundTop + feetAboveGround) / WORLD_LAYER_HEIGHT) * 100;
  }
  function belongsToActiveScene(item, centered = false) {
    if (!activeStoryScene) return true;
    const left = Number(item.x) - (centered ? Number(item.width || 0) / 2 : 0);
    const right = left + Math.max(1, Number(item.width) || 1);
    return right > Number(activeStoryScene.startX || 0)
      && left < Number(activeStoryScene.endX || WORLD_WIDTH);
  }
  // The active scene's platforms, worked out once per scene (they were
  // filtered from the whole world several times every physics step).
  let platformLists = null;
  function platformListsNow() {
    const source = Array.isArray(world.platforms) ? world.platforms : [];
    if (!platformLists || platformLists.scene !== activeStoryScene || platformLists.source !== source || platformLists.count !== source.length) {
      const all = source.filter((platform) => belongsToActiveScene(platform, true));
      platformLists = {
        scene: activeStoryScene, source, count: source.length, all,
        solid: all.filter((platform) => !platform.hazard && platform.collide !== false),
        hazard: all.filter((platform) => platform.hazard)
      };
    }
    return platformLists;
  }
  function platforms() {
    return platformListsNow().all;
  }
  // What the player stands on and bumps into: everything except hazards
  // (which hurt instead) and pictures placed with collision off.
  function solidPlatforms() {
    return platformListsNow().solid;
  }
  function hazardPlatforms() {
    return platformListsNow().hazard;
  }
  function npcs() {
    return (Array.isArray(world.npcs) ? world.npcs : [])
      .filter((npc) => belongsToActiveScene(npc));
  }
  function spawn() {
    const configSpawn = world.player;
    const rawX = Number(configSpawn?.x);
    const rawY = Number(configSpawn?.y);
    return {
      x: Number.isFinite(rawX) ? rawX : 14,
      y: Number.isFinite(rawY) ? rawY : 0
    };
  }

  function buildWorldFromPages(sourcePages, initialPage) {
    if (!sourcePages.length) return null;
    const page = sourcePages.find((item) => item?.pageType === 'platformer')
      || sourcePages[initialPage]
      || sourcePages[0];
    if (!page) return null;
    const scene = page.platformer || {};
    const yShift = (Number(scene.v) || 1) < 2 ? 200 : 0;
    return {
      backgroundAsset: page.backgroundAsset || '',
      backgroundColor: page.backgroundColor || '#72c6ec',
      groundColor: scene.groundColor || '#557d2e',
      groundAsset: scene.groundAsset || '',
      width: Math.max(1000, sourcePages.length * 1000),
      player: {
        x: Number(scene.player?.x) || 14,
        y: Number(scene.player?.y) || 0
      },
      platforms: (Array.isArray(scene.platforms) ? scene.platforms : []).map((platform) => ({
        ...platform,
        x: Number(platform.x) || 0,
        y: (Number(platform.y) || 0) + yShift
      })),
      npcs: Array.isArray(scene.npcs) ? scene.npcs : [],
      storyEvents: []
    };
  }

  function backgroundStyle() {
    background.style.backgroundColor = world.backgroundColor || '#72c6ec';
    background.style.backgroundImage = Array.isArray(world.backgrounds) && world.backgrounds.length
      ? ''
      : (world.backgroundAsset ? `url('${world.backgroundAsset}')` : '');
    background.style.backgroundSize = world.backgroundAsset ? 'cover' : '';
    background.style.backgroundPosition = world.backgroundAsset ? 'center' : '';
    const inScene = (segment) => belongsToActiveScene(segment);
    // How high the camera must be able to look in this scene: the highest
    // surface the player can stand on, with the view framed on it (which also
    // covers a full jump from there). Picture backgrounds are sized to reach at
    // least that high, and the camera stops at the picture's top edge.
    const highestSurface = solidPlatforms().reduce((top, platform) => Math.min(top, platformRect(platform).top), groundTop);
    const neededViewTop = Math.max(0, highestSurface - CAMERA_ANCHOR_Y - 2);
    backdropTop = 0;
    if (backgroundSegmentsLayer) {
      backgroundSegmentsLayer.replaceChildren();
      (Array.isArray(world.backgrounds) ? world.backgrounds : []).filter(inScene).forEach((segment) => {
        const panel = document.createElement('div');
        panel.className = 'platformer-story-background-segment';
        panel.style.left = `${(Number(segment.x) / WORLD_WIDTH) * 100}%`;
        panel.style.width = `${(Number(segment.width) / WORLD_WIDTH) * 100}%`;
        panel.style.backgroundColor = segment.color || '#72c6ec';
        const layers = Array.isArray(segment.assets)
          ? segment.assets.filter((asset) => typeof asset === 'string' && asset.trim())
          : [];
        panel.style.backgroundImage = layers.length
          ? layers.map((asset) => `url('${asset}')`).join(',')
          : (segment.asset ? `url('${segment.asset}')` : '');
        if (segment.filter) panel.style.filter = segment.filter;
        if (segment.repeatSize) {
          // A wall of repeated tiles: each tile is repeatSize scene units.
          const w = Number(segment.repeatSize.w) || 10;
          const h = Number(segment.repeatSize.h) || 10;
          panel.style.backgroundSize = `${(w / Math.max(1, Number(segment.width))) * 100}% ${(h / WORLD_LAYER_HEIGHT) * 100}%`;
          panel.style.backgroundRepeat = 'repeat';
          panel.style.backgroundPosition = '0 0';
          panel.style.imageRendering = 'pixelated';
          backgroundSegmentsLayer.appendChild(panel);
          return;
        }
        const groundLine = Number(segment.groundLine);
        if (Number.isFinite(groundLine) && segment.groundLine !== null) {
          // Copies of the art side by side, placed so the ground drawn in it
          // (at `groundLine` of its height) sits exactly on the walkable ground.
          // Each copy is one screen tall, or - in a scene the player can climb
          // high in - scaled up evenly just enough that the art still reaches
          // the top of the highest view, so the camera never shows past it.
          const count = Math.max(1, layers.length || 1);
          const scale = Math.max(1, (groundTop - neededViewTop) / (groundLine * 100));
          const copy = 100 * scale;
          const segmentWidth = Math.max(1, Number(segment.width));
          const imageTop = groundTop - groundLine * copy;
          backdropTop = Math.max(backdropTop, imageTop);
          const positionY = `${(imageTop / Math.max(1, WORLD_LAYER_HEIGHT - copy)) * 100}%`;
          const sizeY = `${(copy / WORLD_LAYER_HEIGHT) * 100}%`;
          const sizes = [];
          const positions = [];
          for (let layerIndex = 0; layerIndex < count; layerIndex += 1) {
            if (layerIndex === 0 && segment.wholeCopies) {
              // The picture is a complete scene in itself (a row of whole
              // houses): fit a whole number of copies into the segment, so
              // neither end of it cuts a building in two.
              const copies = Math.max(1, Math.round(segmentWidth / copy));
              sizes.push(`${100 / copies}% ${sizeY}`);
              positions.push(`0% ${positionY}`);
              continue;
            }
            sizes.push(`${(copy / segmentWidth) * 100}% ${sizeY}`);
            if (segment.worldAligned && Math.abs(segmentWidth - copy) > 1e-6) {
              // Line the art up with the world, not with this segment, so a
              // backdrop shared by neighbouring segments (hills, sky) runs on
              // across the join without a break.
              const offset = ((Number(segment.x) % copy) + copy) % copy;
              positions.push(`${(-offset / (segmentWidth - copy)) * 100}% ${positionY}`);
            } else {
              positions.push(`0% ${positionY}`);
            }
          }
          panel.style.backgroundSize = sizes.join(',');
          panel.style.backgroundRepeat = Array(count).fill('repeat-x').join(',');
          panel.style.backgroundPosition = positions.join(',');
          backgroundSegmentsLayer.appendChild(panel);
          return;
        }
        const isTiled = Boolean(segment.tile);
        panel.style.backgroundSize = isTiled
          ? (layers.length ? layers.map(() => '100% 33.333%').join(',') : '100% 33.333%')
          : (layers.length ? layers.map(() => 'auto 100%').join(',') : 'cover');
        panel.style.backgroundRepeat = isTiled
          ? (layers.length ? layers.map(() => 'repeat').join(',') : 'repeat')
          : (layers.length ? layers.map(() => 'repeat-x').join(',') : 'no-repeat');
        panel.style.backgroundPosition = layers.length
          ? layers.map(() => (isTiled ? 'left center' : 'center')).join(',')
          : (isTiled ? 'left center' : 'center');
        backgroundSegmentsLayer.appendChild(panel);
      });
    }
    if (ground) {
      const groundSegments = Array.isArray(world.grounds) && world.grounds.length
        ? world.grounds.filter(inScene)
        : (world.groundAsset ? [{ x: 0, width: WORLD_WIDTH, asset: world.groundAsset, color: world.groundColor }] : []);
      ground.replaceChildren();
      groundSegments.forEach((segment) => {
        if (!segment.asset && !segment.tiles && !segment.fill) return;
        const panel = document.createElement('div');
        panel.className = 'platformer-story-ground-segment';
        panel.style.left = `${(Number(segment.x) / WORLD_WIDTH) * 100}%`;
        panel.style.width = `${(Number(segment.width) / WORLD_WIDTH) * 100}%`;
        if (segment.fill) {
          // A gap in the ground (a pool or a ravine): drawn, but not walkable.
          panel.classList.add(`is-${segment.fill}`);
          ground.appendChild(panel);
          return;
        }
        if (segment.tiles) {
          // Grass-and-dirt tiles whose grass top IS the walkable surface.
          renderTiles(panel, segment.tiles, Number(segment.width), GROUND_BAND, segment.tileWidth, segment.tileHeight);
          ground.appendChild(panel);
          return;
        }
        panel.style.backgroundColor = segment.color || world.groundColor || '#557d2e';
        panel.style.backgroundImage = `url('${segment.asset}')`;
        panel.style.backgroundSize = segment.tile ? 'auto 100%' : '100% 100%';
        panel.style.backgroundRepeat = segment.tile ? 'repeat-x' : 'no-repeat';
        ground.appendChild(panel);
      });
      ground.classList.toggle('hidden', groundSegments.length === 0);
      ground.style.borderTop = 'none';
      ground.style.boxShadow = 'none';
    }
    const tint = activeStoryScene?.tint || '';
    const tinted = tintGroup
      ? [tintGroup, platformsLayer, decorLayers.front]
      : [backgroundSegmentsLayer, ground, platformsLayer, decorLayers.far, decorLayers.back, decorLayers.front];
    tinted.forEach((layer) => {
      if (layer) layer.style.filter = tint;
    });
    loadGroundCollisionMask();
  }

  function loadGroundCollisionMask() {
    const segments = Array.isArray(world.grounds) && world.grounds.length
      ? world.grounds.filter((segment) => belongsToActiveScene(segment))
      : (world.groundAsset ? [{ x: 0, width: WORLD_WIDTH, asset: world.groundAsset }] : []);
    groundSurfaceDepths = segments
      .filter((segment) => segment.solid !== false && (segment.asset || segment.tiles))
      .map((segment) => ({
        x: Number(segment.x) || 0,
        width: Math.max(1, Number(segment.width) || WORLD_WIDTH),
        depths: null,
        aspect: 1,
        tile: Boolean(segment.tile),
        // Tiled ground is opaque from its very top, so its surface is the
        // band's top edge everywhere - no image mask is needed.
        flat: Boolean(segment.tiles),
        asset: segment.asset
      }));
    groundSurfaceDepths.forEach((surface) => {
      if (surface.flat) return;
      const image = new Image();
      image.onload = () => {
        try {
          const width = Math.min(512, image.naturalWidth);
          const height = Math.min(128, image.naturalHeight);
          surface.aspect = image.naturalWidth / image.naturalHeight;
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error('Could not create canvas context for the ground collision mask.');
          context.drawImage(image, 0, 0, width, height);
          const alpha = context.getImageData(0, 0, width, height).data;
          const depths = new Array(width).fill(null);
          for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
              if (alpha[(y * width + x) * 4 + 3] >= 128) {
                depths[x] = (y / height) * GROUND_BAND;
                break;
              }
            }
          }
          surface.depths = depths;
        } catch (error) {
          console.error('Could not read the uploaded ground image collision shape.', error);
        }
        renderStaticHitboxes();
      };
      image.onerror = () => console.error(`Could not load ground image: ${surface.asset}`);
      image.src = surface.asset;
    });
  }

  function groundSurfaceDepth(x, halfWidth = 0) {
    if (!groundSurfaceDepths.length) return null;
    let topDepth = Infinity;
    const sampleCount = 8;
    // Sample just inside the actor's edges: an actor pressed against the far
    // wall of a gap only touches the ground beyond it at its very edge, and
    // must still fall in rather than stand on that edge.
    const span = Math.max(0, halfWidth - 0.25);
    for (let sample = 0; sample <= sampleCount; sample++) {
      const sampleX = clamp(x - span + (2 * span * sample) / sampleCount, 0, WORLD_WIDTH - 0.001);
      groundSurfaceDepths.forEach((surface) => {
        if (sampleX < surface.x || sampleX >= surface.x + surface.width) return;
        if (surface.flat || !surface.depths) {
          topDepth = Math.min(topDepth, 0);
          return;
        }
        let localX = (sampleX - surface.x) / surface.width;
        if (surface.tile) {
          const { W, H } = stagePx();
          const tileWidth = GROUND_BAND * surface.aspect * H / W;
          const tileX = ((sampleX - surface.x) % tileWidth + tileWidth) % tileWidth;
          localX = tileX / tileWidth;
        }
        const index = Math.min(surface.depths.length - 1, Math.floor(localX * surface.depths.length));
        const depth = surface.depths[index];
        if (depth !== null && depth < topDepth) topDepth = depth;
      });
    }
    return Number.isFinite(topDepth) ? topDepth : null;
  }

  function npcFeetValue(npc) {
    const state = npcStates.get(npc.id);
    return state ? state.feet : clamp(Number(npc.y) || 0, -GROUND_BAND, groundTop);
  }

  function npcRect(npc) {
    const state = npcStates.get(npc.id) || {};
    const rawX = Number(state.x ?? npc.x);
    const cx = clamp(Number.isFinite(rawX) ? rawX : 60, 0, WORLD_WIDTH);
    const feet = npcFeetValue(npc);
    const size = npcSizes.get(npc.id) || { height: 22 * HITBOX_HEIGHT_SCALE, halfWidth: 6 * HITBOX_WIDTH_SCALE };
    const bottom = groundTop - feet;
    return { left: cx - size.halfWidth, right: cx + size.halfWidth, top: bottom - size.height, bottom, cx, feet };
  }

  // The stage's size in pixels. Collision shapes need it many times a frame
  // (every platform, every physics step, for every character); measuring it
  // each time made the browser lay the page out again after the frame had
  // already moved things - a stall on slow devices. It is measured once and
  // again only when the stage is resized.
  let stageSize = null;
  function measureStage() {
    const r = stage.getBoundingClientRect();
    const next = { W: r.width > 0 ? r.width : 1000, H: r.height > 0 ? r.height : 600 };
    if (!stageSize || Math.abs(stageSize.W - next.W) > 0.5 || Math.abs(stageSize.H - next.H) > 0.5) {
      stageSize = next;
      geometryVersion += 1;
    }
    return stageSize;
  }
  function stagePx() {
    return stageSize || measureStage();
  }

  // A tiled platform is built from whole pixel-art tiles (see renderTiles), so
  // its box is exactly its drawn tiles and the collision is that same box -
  // cut down to `solid` of its height for art that only fills the top of its
  // row (a plank). Units are scene units throughout, so there is nothing to
  // measure and the hitbox can never drift from the art.
  function tiledPlatformRect(platform) {
    const width = Math.max(0.1, Number(platform.width) || 0);
    const height = Math.max(0.1, Number(platform.height) || 0);
    const cx = Number(platform.x) || 0;
    const cy = Number(platform.y) || 0;
    const left = cx - width / 2;
    const right = cx + width / 2;
    const top = cy - height / 2;
    const bottom = top + height * clamp(Number(platform.solid) || 1, 0.05, 1);
    const corners = [
      { x: left, y: top }, { x: right, y: top },
      { x: right, y: bottom }, { x: left, y: bottom }
    ];
    return {
      left, right, top, bottom, rotation: 0, cx, cy, hw: width / 2, hh: height / 2,
      corners,
      parts: [{ corners, left, right, top, bottom }]
    };
  }

  // Feet height for standing on the highest tiled piece under `x`, so a
  // resumed position inside a raised floor starts on top of it, not inside it.
  function standingFeetAt(x) {
    return platforms().filter((platform) => platform.tiles).reduce((feet, platform) => {
      const rect = tiledPlatformRect(platform);
      if (x + playerHalfWidth <= rect.left || x - playerHalfWidth >= rect.right) return feet;
      return Math.max(feet, groundTop - rect.top);
    }, 0);
  }

  function mirrorParts(parts, flip) {
    if (!flip || !Array.isArray(parts)) return parts;
    return parts.map((part) => ({ left: 1 - part.right, right: 1 - part.left, top: part.top, bottom: part.bottom }));
  }

  // A platform's collision shape, cached until the stage is resized or a
  // traced outline arrives (see geometryVersion): a traced picture has many
  // parts, and the shape was rebuilt for every actor on every physics step.
  const platformShapes = new WeakMap();
  function platformRect(platform) {
    const cached = platformShapes.get(platform);
    if (cached && cached.version === geometryVersion) return cached.rect;
    const rect = buildPlatformRect(platform);
    platformShapes.set(platform, { version: geometryVersion, rect });
    return rect;
  }
  function buildPlatformRect(platform) {
    if (platform.tiles) return tiledPlatformRect(platform);
    const { W, H } = stagePx();
    const typeDef = blockTypeDef(platform.type);
    const asset = String(platform.imageAsset || typeDef.img || '');
    const def = asset === typeDef.img
      ? typeDef
      : { ...typeDef, id: `asset:${asset}`, img: asset };
    return window.KOOBD_PLATFORMER_COLLISION.platformGeometry(
      platform, W, H, WORLD_WIDTH, WORLD_HEIGHT,
      // A hand-set hitbox (from the editor) wins over the one traced from the
      // art; a flipped picture's hitbox is mirrored with it.
      mirrorParts(platform.box ? [platform.box] : platformImageParts.get(def.id), platform.flip), !!def.img
    );
  }

  function hitboxPoint(point) {
    return {
      x: point.x * WORLD_WIDTH / 100,
      y: point.y * WORLD_LAYER_HEIGHT / 100
    };
  }

  function createHitboxPolygon(points, className) {
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('class', className);
    polygon.setAttribute('points', points.map((point) => {
      const mapped = hitboxPoint(point);
      return `${mapped.x},${mapped.y}`;
    }).join(' '));
    return polygon;
  }

  function renderStaticHitboxes() {
    if (!debugHitboxes) return;
    hitboxSvg.setAttribute('viewBox', `0 0 ${WORLD_WIDTH} ${WORLD_LAYER_HEIGHT}`);
    hitboxSvg.replaceChildren();
    platforms().forEach((platform) => {
      platformRect(platform).parts.forEach((part) => {
        hitboxSvg.appendChild(createHitboxPolygon(part.corners, 'platformer-hitbox-obstacle'));
      });
    });

    groundSurfaceDepths.forEach((surface) => {
      const points = [];
      const sampleCount = Math.min(256, Math.max(2, surface.depths?.length || 128));
      for (let index = 0; index <= sampleCount; index++) {
        const x = surface.x + (surface.width * index) / sampleCount;
        const depth = groundSurfaceDepth(x);
        if (depth === null) continue;
        points.push(hitboxPoint({ x: x / WORLD_WIDTH * 100, y: groundTop + depth }));
      }
      if (points.length < 2) return;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      path.setAttribute('class', 'platformer-hitbox-ground');
      path.setAttribute('points', points.map((point) => `${point.x},${point.y}`).join(' '));
      hitboxSvg.appendChild(path);
    });

    npcs().forEach((npc) => {
      const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      box.setAttribute('class', 'platformer-hitbox-npc');
      box.dataset.npcId = npc.id;
      hitboxSvg.appendChild(box);
    });
    const playerBox = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    playerBox.setAttribute('class', 'platformer-hitbox-player');
    playerBox.dataset.hitbox = 'player';
    hitboxSvg.appendChild(playerBox);
    updateActorHitboxes();
  }

  function setHitboxRect(node, left, top, width, height) {
    if (!node) return;
    node.setAttribute('x', String(left * WORLD_WIDTH / 100));
    node.setAttribute('y', String(top * WORLD_LAYER_HEIGHT / 100));
    node.setAttribute('width', String(width * WORLD_WIDTH / 100));
    node.setAttribute('height', String(height * WORLD_LAYER_HEIGHT / 100));
  }

  function updateActorHitboxes() {
    if (!hitboxSvg.childElementCount) return;
    const playerBox = hitboxSvg.querySelector('[data-hitbox="player"]');
    setHitboxRect(
      playerBox,
      playerX - playerHalfWidth,
      groundTop - playerY - playerHeight,
      playerHalfWidth * 2,
      playerHeight
    );
    npcs().forEach((npc) => {
      const rect = npcRect(npc);
      const node = Array.from(hitboxSvg.querySelectorAll('.platformer-hitbox-npc'))
        .find((hitbox) => hitbox.dataset.npcId === npc.id);
      setHitboxRect(
        node,
        rect.left,
        rect.top,
        rect.right - rect.left,
        rect.bottom - rect.top
      );
    });
  }

  function setHitboxesVisible(visible) {
    hitboxesVisible = visible;
    hitboxSvg.classList.toggle('hidden', !visible);
    hitboxToggle.textContent = `Hitboxes: ${visible ? 'On' : 'Off'}`;
    hitboxToggle.setAttribute('aria-pressed', visible ? 'true' : 'false');
  }

  hitboxToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    setHitboxesVisible(!hitboxesVisible);
  }, { signal: eventController.signal });

  // Separating-axis test between the actor and one opaque image-mask region.
  // Projection is performed in pixels so rotations respect the stage aspect.
  function satResolve(rect, left, right, top, bottom) {
    const { W, H } = stagePx();
    const xScale = W / 100;
    const yScale = H / 100;
    const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
    const poly = rect.corners.map((point) => ({ x: point.x * xScale, y: point.y * yScale }));
    let minTranslation = Infinity;
    let minAxis = null;
    let minAxisSign = 1;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ex = b.x - a.x, ey = b.y - a.y;
      const len = Math.hypot(ey, -ex);
      if (len > 1e-6) axes.push({ x: ey / len, y: -ex / len });
    }
    const box = [
      { x: left * xScale, y: top * yScale }, { x: right * xScale, y: top * yScale },
      { x: right * xScale, y: bottom * yScale }, { x: left * xScale, y: bottom * yScale }
    ];
    for (const axis of axes) {
      let pMin = Infinity, pMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const p of poly) {
        const d = p.x * axis.x + p.y * axis.y;
        if (d < pMin) pMin = d;
        if (d > pMax) pMax = d;
      }
      for (const p of box) {
        const d = p.x * axis.x + p.y * axis.y;
        if (d < bMin) bMin = d;
        if (d > bMax) bMax = d;
      }
      const overlap = Math.min(pMax, bMax) - Math.max(pMin, bMin);
      if (overlap <= 0) return null;
      const movePositive = pMax - bMin;
      const moveNegative = bMax - pMin;
      const distance = Math.min(movePositive, moveNegative);
      if (distance < minTranslation) {
        minTranslation = distance;
        minAxis = axis;
        minAxisSign = movePositive < moveNegative ? 1 : -1;
      }
    }
    const nx = minAxis.x * minAxisSign;
    const ny = minAxis.y * minAxisSign;
    return {
      ny,
      dx: nx * minTranslation / xScale,
      dy: ny * minTranslation / yScale
    };
  }

  // A small stable number per item, so each animated piece of scenery gets its
  // own timing and no two flowers (or flames) move in step.
  function decorSeed(index, x) {
    const n = Math.sin((index + 1) * 12.9898 + Number(x) * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  // Scenery: images placed in the world by their centre x and the height of
  // their base above the ground line, `h` scene units tall (width follows the
  // image). They never collide. `anim` gives them a gentle looping motion;
  // a `flower` is built from a stem and a head that sway separately.
  // Scenery tied to the story: `from` (an event id) shows it once that event
  // has begun, `until` takes it away when that event begins (a flower that is
  // picked, a gate that opens).
  let timedDecor = [];
  function syncDecor() {
    timedDecor.forEach(({ node, from, until }) => {
      const begun = (id) => ['started', 'done'].includes(eventStage(id));
      node.classList.toggle('is-gone', Boolean((from && !begun(from)) || (until && begun(until))));
    });
  }

  // Scenery outside the camera's view is marked .is-offscreen: not painted,
  // and its sway or flicker paused until it is back in view (see
  // css/teacher-stories.css). A long scene can hold many animated pieces.
  let cullableDecor = [];
  let lastCullCameraX = null;
  const DECOR_VIEW_MARGIN = 20;
  function cullOffscreenDecor(force = false) {
    if (!cullableDecor.length) return;
    if (!force && lastCullCameraX !== null && Math.abs(cameraX - lastCullCameraX) < 3) return;
    lastCullCameraX = cameraX;
    const viewLeft = cameraX - DECOR_VIEW_MARGIN;
    const viewRight = cameraX + SCENE_VIEW_WIDTH + DECOR_VIEW_MARGIN;
    cullableDecor.forEach((entry) => {
      const offscreen = entry.right < viewLeft || entry.left > viewRight;
      if (entry.offscreen !== offscreen) {
        entry.offscreen = offscreen;
        entry.node.classList.toggle('is-offscreen', offscreen);
      }
    });
  }

  function renderDecor() {
    Object.values(decorLayers).forEach((layer) => layer.replaceChildren());
    timedDecor = [];
    cullableDecor = [];
    lastCullCameraX = null;
    (Array.isArray(world.decor) ? world.decor : []).forEach((item, index) => {
      if (!belongsToActiveScene({ x: item.x, width: 1 })) return;
      if (item.rain) {
        // Falling rain over a stretch of the world, in front of everything.
        const rain = document.createElement('div');
        rain.className = 'platformer-rain';
        rain.style.left = `${toLayerPercent(Number(item.x) - Number(item.width || 100) / 2)}%`;
        rain.style.width = `${toLayerPercent(Number(item.width || 100))}%`;
        decorLayers.front?.appendChild(rain);
        if (item.from || item.until) timedDecor.push({ node: rain, from: item.from, until: item.until });
        return;
      }
      const layerName = item.light ? 'lights' : (item.layer || 'back');
      const layer = decorLayers[layerName];
      if (!layer) return;
      const node = document.createElement('div');
      node.className = 'platformer-decor';
      node.style.left = `${toLayerPercent(Number(item.x))}%`;
      node.style.bottom = `${entityBottomPct(Number(item.feet) || 0)}%`;
      node.style.height = `${toLayerYPercent(Number(item.h) || 10)}%`;
      if (item.flip) node.classList.add('is-flipped');
      if (Number(item.rotation)) node.style.rotate = `${Number(item.rotation)}deg`;
      if (item.smooth) node.classList.add('is-smooth');
      const seed = decorSeed(index, item.x);
      if (item.flower) {
        // Stem and head: the whole flower sways from its base while the head
        // nods a little more on its own, each on its own timing.
        node.classList.add('is-flower', 'anim-sway');
        node.style.setProperty('--sway-duration', `${(2.6 + seed * 1.8).toFixed(2)}s`);
        node.style.setProperty('--sway-delay', `${(-seed * 3).toFixed(2)}s`);
        node.style.setProperty('--sway-angle', `${(2 + seed * 2.5).toFixed(1)}deg`);
        const stem = document.createElement('img');
        stem.className = 'platformer-flower-stem';
        stem.src = item.stem;
        stem.alt = '';
        const head = document.createElement('img');
        head.className = 'platformer-flower-head';
        head.src = item.flower;
        head.alt = '';
        head.style.setProperty('--nod-duration', `${(1.7 + seed * 1.2).toFixed(2)}s`);
        head.style.setProperty('--nod-delay', `${(-seed * 2).toFixed(2)}s`);
        node.append(stem, head);
      } else {
        const img = document.createElement('img');
        img.src = item.asset;
        img.alt = '';
        img.onerror = () => console.error(`Could not load scenery image: ${item.asset}`);
        node.appendChild(img);
        if (item.anim) {
          node.classList.add(`anim-${item.anim}`);
          node.style.setProperty('--anim-duration', `${((Number(item.duration) || 3) * (0.8 + seed * 0.5)).toFixed(2)}s`);
          node.style.setProperty('--anim-delay', `${(-seed * 4).toFixed(2)}s`);
        }
      }
      layer.appendChild(node);
      if (item.from || item.until) timedDecor.push({ node, from: item.from, until: item.until });
      // Its reach either side of its x (a wide tree or banner reaches further).
      const reach = Math.max(10, (Number(item.h) || 10) * 1.2, Number(item.width || 0) / 2);
      cullableDecor.push({ node, left: Number(item.x) - reach, right: Number(item.x) + reach, offscreen: false });
    });
    syncDecor();
  }

  function renderPlatforms() {
    if (!platformsLayer) return;
    platformsLayer.innerHTML = '';
    platforms().forEach((platform) => {
      if (platform.tiles) {
        const box = tiledPlatformRect(platform);
        const node = document.createElement('div');
        node.className = 'platformer-story-platform is-tiled';
        node.dataset.id = platform.id || '';
        node.style.left = `${toLayerPercent(box.left)}%`;
        node.style.top = `${toLayerYPercent(Number(platform.y) - Number(platform.height) / 2)}%`;
        node.style.width = `${toLayerPercent(Number(platform.width))}%`;
        node.style.height = `${toLayerYPercent(Number(platform.height))}%`;
        renderTiles(node, platform.tiles, Number(platform.width), Number(platform.height), platform.tileWidth, platform.tileHeight);
        platformsLayer.appendChild(node);
        return;
      }
      const rect = platformRect(platform);
      const typeDef = blockTypeDef(platform.type);
      const asset = String(platform.imageAsset || typeDef.img || '');
      const def = asset === typeDef.img
        ? typeDef
        : { ...typeDef, id: `asset:${asset}`, img: asset };
      const node = document.createElement('div');
      node.className = 'platformer-story-platform';
      node.dataset.type = typeDef.id;
      loadPlatformImageParts(def);
      node.style.left = `${toLayerPercent(rect.cx)}%`;
      node.style.top = `${toLayerYPercent(rect.cy)}%`;
      node.style.width = `${clamp(Number(platform.width) || 28, 0.5, 1000) / WORLD_WIDTH * 100}%`;
      node.style.height = `${(clamp(Number(platform.height) || 7, 0.5, 300) / WORLD_LAYER_HEIGHT) * 100}%`;
      if (platform.flip) node.classList.add('is-flipped');
      if (platform.hazard) node.classList.add('is-hazard');
      if (platform.pixelArt) node.classList.add('is-pixel-art');
      if (platform.anim) node.classList.add(`anim-${platform.anim}`);
      node.style.backgroundColor = asset ? 'transparent' : (def.color || 'transparent');
      if (asset) {
        const img = document.createElement('img');
        img.alt = '';
        img.src = asset;
        img.onerror = () => console.error(`Could not load platform image: ${asset}`);
        node.appendChild(img);
      }
      node.style.transform = `translate(-50%, -50%) rotate(${platform.rotation || 0}deg)`;
      platformsLayer.appendChild(node);
    });
  }

  // Paints a box with whole tiles of pixel art: `fill` repeats over the box,
  // `cap` replaces its top row (grass on dirt), and the *Left/*Right variants
  // replace the end columns so outlined edges sit on the box's real edges.
  // Every size is a percentage of the box, and the box is a whole number of
  // tiles wide, so the tiles line up exactly with the collision box.
  function renderTiles(node, tiles, width, height, tileWidth, tileHeight) {
    const sx = (Number(tileWidth) || width) / width * 100;
    const sy = (Number(tileHeight) || height) / height * 100;
    const layer = (asset, style) => {
      if (!asset) return;
      const part = document.createElement('span');
      part.className = 'platformer-tile-layer';
      Object.assign(part.style, style, { backgroundImage: `url('${asset}')` });
      node.appendChild(part);
    };
    // An outlined edge runs down only the exposed part of a side (`leftDepth` /
    // `rightDepth`, in units; 0 = no edge, unset = the full height).
    const depthOf = (value) => (value === undefined || value === null ? height : Number(value));
    const leftDepth = depthOf(tiles.leftDepth);
    const rightDepth = depthOf(tiles.rightDepth);
    const column = (side, depth) => ({
      [side]: '0', top: '0', width: `${sx}%`, height: `${Math.min(100, depth / height * 100)}%`,
      // Keep the tile size relative to the whole box, not the shorter column.
      backgroundSize: `100% ${(Number(tileHeight) || height) / depth * 100}%`, backgroundRepeat: 'repeat-y'
    });
    const corner = (side) => ({ [side]: '0', top: '0', width: `${sx}%`, height: `${sy}%`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' });
    layer(tiles.fill, { inset: '0', backgroundSize: `${sx}% ${sy}%`, backgroundRepeat: 'repeat' });
    if (leftDepth > 0) layer(tiles.fillLeft, column('left', leftDepth));
    if (rightDepth > 0) layer(tiles.fillRight, column('right', rightDepth));
    layer(tiles.cap, { left: '0', right: '0', top: '0', height: `${sy}%`, backgroundSize: `${sx}% 100%`, backgroundRepeat: 'repeat-x' });
    if (leftDepth > 0) layer(tiles.capLeft, corner('left'));
    if (rightDepth > 0) layer(tiles.capRight, corner('right'));
  }

  function renderNpcs() {
    if (!npcLayer) return;
    npcLayer.innerHTML = '';
    npcs().forEach((npc) => {
      const rect = npcRect(npc);
      const state = npcStates.get(npc.id);
      const node = document.createElement('button');
      node.type = 'button';
      node.className = npc.animationAsset ? 'platformer-npc is-animated' : 'platformer-npc';
      // A character can be drawn smaller or larger (`scale`, e.g. a child).
      // The box itself is resized, so the hitbox, feet alignment and name tag -
      // all measured from the box - follow the visible size.
      if (Number(npc.scale) > 0 && Number(npc.scale) !== 1) node.style.setProperty('--npc-scale', String(Number(npc.scale)));
      node.style.left = `${toLayerPercent(rect.cx)}%`;
      node.style.bottom = `calc(${entityBottomPct(rect.feet)}% + env(safe-area-inset-bottom))`;
      const image = document.createElement('img');
      image.alt = npc.name || 'NPC';
      image.src = npc.animationAsset || npc.asset || '';
      if (npc.animationAsset) image.classList.add('platformer-sprite-sheet');
      image.onerror = () => console.error(`Could not load NPC image for ${npc.name || npc.id}: ${image.src}`);
      const label = document.createElement('span');
      label.className = 'platformer-npc-name';
      label.setAttribute('translate', 'no');
      label.textContent = npc.name || 'Friend';
      if (npc.animationAsset) {
        // The sprite sheet holds every pose; this frame-sized window shows one
        // and casts the shadow, so only the visible pose throws a shadow (a
        // shadow on the whole sheet let the neighbouring row's shadow fall
        // into the frame as a dark smudge under the name). The name sits
        // outside the window, so nothing clips or shades it.
        const frame = document.createElement('span');
        frame.className = 'platformer-npc-sprite';
        frame.appendChild(image);
        node.append(frame, label);
      } else {
        node.append(image, label);
      }
      if (state) state.node = node;
      node.addEventListener('click', () => {
        if (suppressWorldClick) return;
        if (Math.abs(playerX - rect.cx) <= NPC_TALK_RANGE && hasConversation(npc)) {
          openDialogue(npc);
        }
      });
      npcLayer.appendChild(node);
      measureNpcSize(npc, node);
      if (!image.complete) image.addEventListener('load', () => measureNpcSize(npc, node), { once: true });
    });
    refreshNpcPresence(true);
  }

  function hasConversation(npc) {
    const turns = npc && Array.isArray(npc.dialogue) ? npc.dialogue : [];
    if (turns.length && typeof turns[0] === 'object') return turns.some((turn) => String(turn?.text || '').trim());
    return Boolean(npc && String(npc.dialogue || '').trim());
  }

  function npcTurns(npc) {
    const turns = npc && Array.isArray(npc.dialogue) ? npc.dialogue : [];
    // A storyboard frame has a picture and no text, and is kept like a line.
    if (turns.length && typeof turns[0] === 'object') return turns.filter((turn) => String(turn?.text || '').trim() || (turn?.choices || []).length || (turn?.type === 'frame' && turn.image));
    const text = String(npc?.dialogue || '').trim();
    return text ? [{ speaker: 'npc', text, choices: [] }] : [];
  }

  function renderWorld(resetPosition = false) {
    if (resetPosition) {
      playerX = clamp(isPreview ? spawn().x : (Number(config.initialPlayerX) || spawn().x), 2, WORLD_WIDTH - 2);
      if (activeStoryScene) {
        // A resumed position always lands inside the scene being shown.
        const bounds = scenePlayerBounds();
        playerX = clamp(playerX, bounds.min + SCENE_ENTRY_OFFSET, Math.max(bounds.min + SCENE_ENTRY_OFFSET, bounds.max - SCENE_ENTRY_OFFSET));
      }
      playerY = Math.max(clamp(spawn().y, 0, groundTop), standingFeetAt(playerX));
      velocityY = 0;
      lastSafeX = playerX;
      lastSafeY = playerY;
      checkpointX = null;
      noteCheckpointReached();
      computePlayerSize();
      resetNpcs();
    }
    if (worldLayer) {
      worldLayer.style.width = `${WORLD_WIDTH}%`;
      worldLayer.style.height = `${WORLD_LAYER_HEIGHT}%`;
      worldLayer.style.right = 'auto';
      worldLayer.style.bottom = 'auto';
    }
    if (ground) {
      ground.style.width = '100%';
      ground.style.right = 'auto';
      // The band is GROUND_BAND of WORLD_HEIGHT scene units tall.
      ground.style.height = `${(GROUND_BAND / WORLD_LAYER_HEIGHT) * 100}%`;
    }
    backgroundStyle();
    renderDecor();
    renderPlatforms();
    renderNpcs();
    renderStaticHitboxes();
    cameraSnapped = false;
    updatePlayer();
    updateCamera(0);
    saveProgress();
  }

  // Picks the sprite-sheet frame from the current player state. Row 0 is the
  // provided 4-frame idle loop (wall-clock based so it keeps cycling whenever
  // it runs), row 1 the 6-frame walk cycle, row 2 the jump poses.
  // The jump row of every provided sprite sheet draws its poses higher inside
  // the 32x46 cell (by these many pixels: take-off 3, rising 9, apex 12,
  // falling 6), a hop baked in for the sheet's own preview, which subtracts it
  // again when playing. The game moves the character itself, so it lowers the
  // character's frame window by the same amount (the cell is empty below a
  // lifted pose). Moving the sheet inside the window instead would pull the
  // row above - the walk cycle's feet - into view over the character's head.
  const JUMP_FRAME_LIFT = [0, 3, 9, 12, 6, 0];
  function setJumpShift(element, row, column) {
    if (!element) return;
    const lift = row === 2 ? (JUMP_FRAME_LIFT[column] || 0) : 0;
    setStyle(element, '--jump-shift', lift ? `${((lift / SPRITE_FRAME_HEIGHT) * 100).toFixed(3)}%` : '0px');
  }
  // Jump pose for the vertical speed, as the sheets' own previews choose it:
  // rising, apex, falling.
  function jumpFrameFor(vy) {
    return vy > 25 ? 2 : vy < -25 ? 4 : 3;
  }
  const LANDING_POSE_MS = 120;
  let playerAirborneSince = 0;
  let playerLandingUntil = 0;

  function setPlayerAnimationFrame() {
    if (!playerUsesSpriteSheet) return;
    const now = performance.now();
    let row = 0;
    let column = Math.floor(now / 200) % 4;
    const paused = dialogueOpen || sceneTransitioning;
    // Standing always has zero vertical speed, so this ignores the moment
    // before the first physics step.
    const airborne = !grounded && !paused && velocityY !== 0;
    if (airborne && !playerAirborneSince) playerAirborneSince = now;
    if (!airborne && playerAirborneSince) {
      // A real jump or fall ends on the landing (squash) pose for a moment.
      if (now - playerAirborneSince > 150 && !paused) playerLandingUntil = now + LANDING_POSE_MS;
      playerAirborneSince = 0;
    }
    if (paused) {
      column = 0;
    } else if (airborne && (now - playerAirborneSince > 50 || Math.abs(velocityY) > 25)) {
      row = 2;
      column = jumpFrameFor(velocityY);
    } else if (now < playerLandingUntil) {
      row = 2;
      column = 5;
    } else if (direction !== 0) {
      row = 1;
      column = Math.floor(playerWalkAnimationTime / 0.09) % 6;
    }
    // Idle, walk and jump all keep the last direction travelled.
    setSpriteFrameFacing(playerSprite, row, column, lastDirection < 0);
    setJumpShift(player, row, column);
  }

  function updatePlayer() {
    setStyle(player, 'left', `${toLayerPercent(playerX).toFixed(4)}%`);
    // The sprite's transparent bottom padding leaves the visible feet ABOVE
    // the element's bottom edge, so the element must sit LOWER by that amount
    // for the visible feet to touch the ground / block surface (the editor
    // compensates the same way by shifting the sprite down inside its box).
    setStyle(player, 'bottom', `calc(${entityBottomPct(playerY - playerBottomTrim).toFixed(4)}% + env(safe-area-inset-bottom))`);
    player.classList.toggle('is-moving', direction !== 0);
    // Facing follows the last direction moved, so releasing the key leaves the
    // character idling the way it was walking instead of snapping to the right.
    if (direction !== 0) lastDirection = direction;
    player.classList.toggle('is-facing-left', lastDirection < 0);
    setPlayerAnimationFrame();
    updateActorHitboxes();
    updateProximity();
  }

  // Vertical target with a GD-style dead-zone. Grounded: always reframe to
  // the baseline (feet CAMERA_ANCHOR_Y below the view top) so the ground band
  // returns after a fall. Airborne: hold the camera while the feet stay
  // between the dead-zone edges, and only chase them once they approach the
  // top (rise) or bottom (fall) of the view.
  function verticalCameraTarget(feetSceneY, camY, isGrounded) {
    const top = backdropTop;
    if (isGrounded) return clamp(feetSceneY - CAMERA_ANCHOR_Y, top, MAX_CAMERA_Y);
    const feetView = feetSceneY - camY;
    if (feetView < CAMERA_DEADZONE_TOP) return clamp(feetSceneY - CAMERA_DEADZONE_TOP, top, MAX_CAMERA_Y);
    if (feetView > CAMERA_DEADZONE_BOTTOM) return clamp(feetSceneY - CAMERA_DEADZONE_BOTTOM, top, MAX_CAMERA_Y);
    return clamp(camY, top, MAX_CAMERA_Y);
  }

  function updateCamera(dt) {
    if (manualCamera) return;
    if (cameraHeldForPage) { applyCamera(); return; }
    const anchor = lastDirection < 0 ? CAMERA_ANCHOR_BACKWARD : CAMERA_ANCHOR_FORWARD;
    const bounds = sceneCameraBounds();
    let targetX = clamp(playerX - anchor, bounds.min, bounds.max);
    // Feet scene y is groundTop - playerY.
    let feetSceneY = groundTop - playerY;
    const focus = cutscene && cameraSnapped ? cutsceneFocusPoint() : null;
    if (focus) {
      // Cutscene: frame the characters acting it out, centred, at a gentle pace.
      targetX = clamp(focus.x - SCENE_VIEW_WIDTH / 2, bounds.min, bounds.max);
      feetSceneY = groundTop - focus.feet;
      const ease = 1 - Math.exp(-CUTSCENE_LERP_RATE * dt);
      cameraX += (targetX - cameraX) * ease;
      cameraY += (clamp(feetSceneY - CAMERA_ANCHOR_Y, backdropTop, MAX_CAMERA_Y) - cameraY) * ease;
      applyCamera();
      return;
    }
    if (!cameraSnapped) {
      cameraX = targetX;
      // First frame uses the baseline formula so the spawn always opens on
      // the ground band regardless of the dead-zone.
      cameraY = clamp(feetSceneY - CAMERA_ANCHOR_Y, backdropTop, MAX_CAMERA_Y);
      cameraSnapped = true;
    } else {
      // Just after a cutscene the camera glides back to the player instead of
      // snapping.
      const rate = performance.now() < cameraReturnUntil ? CUTSCENE_LERP_RATE : CAMERA_LERP_RATE;
      const ease = 1 - Math.exp(-rate * dt);
      cameraX += (targetX - cameraX) * ease;
      const targetY = verticalCameraTarget(feetSceneY, cameraY, grounded);
      cameraY += (targetY - cameraY) * ease;
      if (Math.abs(targetX - cameraX) < 0.05) cameraX = targetX;
      if (Math.abs(targetY - cameraY) < 0.05) cameraY = targetY;
    }
    applyCamera();
  }

  function applyCamera() {
    if (!worldLayer) return;
    const shiftX = (cameraX / WORLD_WIDTH) * 100;
    const shiftY = (cameraY / WORLD_LAYER_HEIGHT) * 100;
    setStyle(worldLayer, 'transformOrigin', 'top left');
    setStyle(worldLayer, 'transform', `scale(${WORLD_VIEW_SCALE}) translate(-${shiftX.toFixed(4)}%, -${shiftY.toFixed(4)}%)`);
    const progressText = completed
      ? 'Finished'
      : `World · ${Math.min(100, Math.max(0, Math.round((playerX / WORLD_WIDTH) * 100)))}%`;
    const progress = completed ? 100 : Math.min(100, Math.max(0, (playerX / WORLD_WIDTH) * 100));
    if (progressBar && progressFill) {
      const shown = `${progress.toFixed(2)}%`;
      if (styleCache.get(progressFill)?.width !== shown) progressBar.setAttribute('aria-valuenow', String(Math.round(progress)));
      setStyle(progressFill, 'width', shown);
      if (progressThumb) setStyle(progressThumb, 'left', shown);
    }
    if (modeLabel && progressText !== lastModeText) {
      modeLabel.textContent = progressText;
      lastModeText = progressText;
    }
  }

  // Measure how much transparent padding the sprite image has at its top and
  // bottom (scan a downscaled copy's alpha channel). Returns fractions
  // (0..1) of the drawn sprite height, or zeroes if it can't be measured.
  function measureSpriteTrims(img, frameSize = null) {
    try {
      const w = 48;
      const sourceWidth = frameSize?.width || img.naturalWidth;
      const sourceHeight = frameSize?.height || img.naturalHeight;
      const h = Math.max(1, Math.round(w * sourceHeight / sourceWidth));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { top: 0, bottom: 0, left: 0, right: 0 };
      ctx.drawImage(img, 0, 0, sourceWidth, sourceHeight, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let top = 0;
      let bottom = 0;
      scanTop: for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 16) {
            // First row with visible pixels; rows above are transparent.
            top = y / h;
            break scanTop;
          }
        }
      }
      for (let y = h - 1; y >= 0; y--) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 16) {
            // Last row with visible pixels; rows below are transparent.
            bottom = (h - 1 - y) / h;
            y = -1;
          }
        }
      }
      // Empty columns at each side (the character's body is narrower than
      // its picture).
      let left = 0;
      let right = 0;
      scanLeft: for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          if (data[(y * w + x) * 4 + 3] > 16) { left = x / w; break scanLeft; }
        }
      }
      scanRight: for (let x = w - 1; x >= 0; x--) {
        for (let y = 0; y < h; y++) {
          if (data[(y * w + x) * 4 + 3] > 16) { right = (w - 1 - x) / w; break scanRight; }
        }
      }
      return { top, bottom, left, right };
    } catch (err) {
      // Cross-origin images taint the canvas; fall back to no trim.
    }
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }

  // Character sizes are measured from their layout boxes (offsetWidth/Height),
  // which the camera's zoom does not affect, so a hitbox is the same size as
  // the body on screen whenever it is measured - including before the camera
  // has applied its zoom on the first frame (screen rectangles measured then
  // came out 1/WORLD_VIEW_SCALE too small once divided by the zoom).
  function computePlayerSize() {
    const stageRect = { width: stage.clientWidth, height: stage.clientHeight };
    // The player box can also be drawn at a CSS scale (default 0.7).
    const boxScale = parseFloat(getComputedStyle(player).getPropertyValue('--platformer-player-scale')) || 0.7;
    const box = { width: player.offsetWidth * boxScale, height: player.offsetHeight * boxScale };
    if (stageRect.width <= 0 || stageRect.height <= 0) return;
    // Measure the *visible* sprite, not the element box: with object-fit the
    // drawn image can be much smaller than the box, and the hitbox must match
    // what the player sees or the character will visibly overlap blocks.
    let visW = box.width;
    let visH = box.height;
    const img = player.tagName === 'IMG' ? player : player.querySelector('img');
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0 && box.width > 0 && box.height > 0) {
      const aspect = playerUsesSpriteSheet
        ? SPRITE_FRAME_WIDTH / SPRITE_FRAME_HEIGHT
        : img.naturalWidth / img.naturalHeight;
      if (box.width / box.height > aspect) {
        visH = box.height;
        visW = box.height * aspect;
      } else {
        visW = box.width;
        visH = box.width / aspect;
      }
      const frameSize = playerUsesSpriteSheet
        ? { width: SPRITE_FRAME_WIDTH, height: SPRITE_FRAME_HEIGHT }
        : null;
      playerBodyTrim = measureSpriteTrims(img, frameSize);
      playerBottomTrim = (playerBodyTrim.bottom * visH) / stageRect.height * 100;
    } else {
      playerBottomTrim = 0;
      playerBodyTrim = { top: 0, bottom: 0, left: 0, right: 0 };
    }
    playerHeight = Math.max(6, (visH / stageRect.height) * 100 * HITBOX_HEIGHT_SCALE);
    playerHalfWidth = Math.max(1.5, (visW / stageRect.width) * 100 / 2 * HITBOX_WIDTH_SCALE);
  }

  function measureNpcSize(npc, node) {
    if (!stage) return;
    // Layout sizes, unaffected by the camera's zoom (see computePlayerSize).
    const stageRect = { width: stage.clientWidth, height: stage.clientHeight };
    const nodeRect = { width: node.offsetWidth, height: node.offsetHeight };
    if (stageRect.width <= 0 || stageRect.height <= 0) return;
    // Align the NPC's visible feet with its coordinate bottom (same sprite
    // padding compensation the player uses), so NPCs touch the ground/blocks.
    const img = node.querySelector('img');
    if (img && img.naturalWidth > 0 && nodeRect.height > 0) {
      const usesSpriteSheet = Boolean(npc.animationAsset);
      const aspect = usesSpriteSheet
        ? SPRITE_FRAME_WIDTH / SPRITE_FRAME_HEIGHT
        : img.naturalWidth / img.naturalHeight;
      const drawnH = nodeRect.width / nodeRect.height > aspect ? nodeRect.height : nodeRect.width / aspect;
      const trims = measureSpriteTrims(img, usesSpriteSheet
        ? { width: SPRITE_FRAME_WIDTH, height: SPRITE_FRAME_HEIGHT }
        : null);
      const trimPx = trims.bottom * drawnH;
      img.style.transform = trimPx > 0.5 ? `translateY(${trimPx.toFixed(1)}px)` : '';
      img.dataset.trimShift = trimPx > 0.5 ? `${trimPx.toFixed(1)}px` : '';
      // Pin the name tag to the sprite's visible top with a constant gap,
      // whatever the box size or sprite padding. The feet shift moves the
      // sprite down, so it shrinks the distance to the visible top.
      const label = node.querySelector('.platformer-npc-name');
      if (label) {
        const shift = trimPx > 0.5 ? trimPx : 0;
        const visibleTopPx = drawnH - (trims.bottom * drawnH) - trims.top * drawnH;
        label.style.bottom = `${(visibleTopPx + 6).toFixed(1)}px`;
      }
    }
    npcSizes.set(npc.id, {
      height: Math.max(6, (nodeRect.height / stageRect.height) * 100 * HITBOX_HEIGHT_SCALE),
      halfWidth: Math.max(1.5, (nodeRect.width / stageRect.width) * 100 / 2 * HITBOX_WIDTH_SCALE)
    });
  }

  function resetNpcs() {
    npcStates.clear();
    npcSizes.clear();
    npcs().forEach((npc) => {
      if (!npc || !npc.id) return;
      const rawX = Number(npc.x);
      const rawFeet = Number(npc.y);
      npcStates.set(npc.id, {
        x: clamp(Number.isFinite(rawX) ? rawX : 60, 0, WORLD_WIDTH),
        feet: clamp(Number.isFinite(rawFeet) ? rawFeet : 0, -GROUND_BAND, groundTop),
        velocityY: 0,
        node: null,
        homeX: clamp(Number.isFinite(rawX) ? rawX : 60, 0, WORLD_WIDTH),
        wanderTargetX: clamp(Number.isFinite(rawX) ? rawX : 60, 0, WORLD_WIDTH),
        wanderPause: 0.6 + Math.random() * 1.6,
        facing: 1
      });
    });
    npcs().forEach((npc) => {
      if (isScripted(npc)) placeScriptedNpc(npc, npcStates.get(npc.id));
    });
  }

  // --- Scripted story characters ---------------------------------------------
  // A story world can direct its characters by story event instead of letting
  // them wander: when they arrive (`appear`), where they walk after an event
  // (`moves`), when and how they leave (`leave`), and when they travel with the
  // player (`follow`). `actsIn` lists the events a character takes part in: it
  // supplies their dialogue figure and holds that conversation until they have
  // arrived. Everything is derived from the story position, so a resumed game
  // puts each character exactly where the story left them.
  const SCRIPTED_WALK_SPEED = 24;
  // A run is a little quicker than CubeBot (38), so a chase still pulls away,
  // but slow enough that the run cycle reads clearly on screen.
  const SCRIPTED_RUN_SPEED = 46;
  // Run/walk cycle frames per second at CubeBot's walking pace; characters'
  // cycles scale with their own speed so their feet keep up with the ground.
  const STRIDE_FPS_AT_PLAYER_SPEED = 11;
  const FOLLOW_GAP = 13;
  const EXIT_FADE_MS = 500;
  // Storyboard frames load a little ahead of the story (this event and the
  // next two), so each is ready when its line comes, without fetching them
  // all at the start.
  const preloadedFrameEvents = new Set();
  function preloadStoryFrames(fromIndex) {
    for (let index = Math.max(0, fromIndex); index < Math.min(storyEvents.length, fromIndex + 3); index += 1) {
      if (preloadedFrameEvents.has(index)) continue;
      preloadedFrameEvents.add(index);
      (storyEvents[index].turns || []).forEach((turn) => {
        if (turn && turn.image) new Image().src = turn.image;
      });
    }
  }
  preloadStoryFrames(storyEventIndex);
  const eventIndexById = new Map(storyEvents.map((event, index) => [event.id, index]));
  const STAGE_ORDER = { pending: 0, current: 1, started: 2, done: 3 };

  function isScripted(npc) {
    return Boolean(npc && (npc.appear || npc.leave || npc.moves || npc.follow || npc.actsIn || npc.routine || npc.lead));
  }

  function eventStage(eventId) {
    const index = eventIndexById.get(eventId);
    if (index === undefined) return 'pending';
    if (storyEventIndex > index) return 'done';
    if (dialogueOpen && conversationNpc?.isStoryEvent && Number(conversationNpc.storyEventIndex) === index) return 'started';
    return storyEventIndex === index ? 'current' : 'pending';
  }

  function reached(eventId, stage) {
    return STAGE_ORDER[eventStage(eventId)] >= STAGE_ORDER[stage];
  }

  // 'hidden' (not arrived yet), 'present', 'leaving' or 'gone'.
  function npcPresence(npc, state) {
    if (!isScripted(npc)) return 'present';
    if (state?.gone) return 'gone';
    if (npc.appear && !reached(npc.appear.event, npc.appear.at === 'start' ? 'started' : 'current')) return 'hidden';
    if (npc.leave && reached(npc.leave.event, npc.leave.at === 'start' ? 'started' : 'done')) return 'leaving';
    return 'present';
  }

  function followActive(npc) {
    const follow = npc.follow;
    if (!follow) return false;
    if (follow.from && !reached(follow.from, 'done')) return false;
    if (follow.until && reached(follow.until, 'done')) return false;
    return true;
  }

  // The latest move whose event has finished - or, with `at: 'start'`, begun;
  // with `at: 'near'`, the move starts once that event is the next one and the
  // player comes within `distance` of the character (and then stays made).
  const nearMovesMade = new Set();
  function currentMove(npc) {
    return (npc.moves || []).filter((move, index) => {
      if (move.at === 'near') {
        const key = `${npc.id}:${index}`;
        if (!nearMovesMade.has(key) && reached(move.after, 'current')
          && Math.abs(playerX - Number(npc.x)) <= (Number(move.distance) || 30)) nearMovesMade.add(key);
        return nearMovesMade.has(key);
      }
      return reached(move.after, move.at === 'start' ? 'started' : 'done');
    }).pop() || null;
  }

  // Feet height of the highest solid footing under `x`, or null over a gap.
  function surfaceFeetUnder(x, halfWidth = 1.5) {
    const depth = groundSurfaceDepth(x, halfWidth);
    let feet = depth === null ? null : -depth;
    platforms().forEach((platform) => {
      if (!platform.tiles) return;
      const rect = tiledPlatformRect(platform);
      if (x + halfWidth <= rect.left || x - halfWidth >= rect.right) return;
      const top = groundTop - rect.top;
      if (feet === null || top > feet) feet = top;
    });
    return feet;
  }

  function followTargetX() {
    let target = playerX - FOLLOW_GAP * (lastDirection < 0 ? -1 : 1);
    // Never wait over a gap: step the spot toward the player until it is on
    // solid footing (the player is always standing somewhere solid).
    for (let guard = 0; guard < 40 && surfaceFeetUnder(target) === null; guard++) {
      target += playerX > target ? 1 : -1;
    }
    return target;
  }

  // --- Character jumps ---------------------------------------------------------
  // Scripted characters move along the level the way CubeBot does: they jump
  // up onto steps and roofs, leap gaps, and fall when the ground drops away,
  // showing the jump row of their sprite sheet (rising / apex / falling).
  const NPC_LOOKAHEAD = 5;
  const NPC_JUMP_CLEARANCE = 5;
  const NPC_GAP_JUMP_RISE = 12;
  const NPC_HOP_VELOCITY = 45;

  function launchNpc(state, rise) {
    // Never more than a full jump - the same one the player has.
    state.vy = Math.sqrt(2 * gravity * clamp(rise, 2, CHARACTER_JUMP_RISE));
    state.airborne = true;
  }

  function stepNpcVertical(state, dt, moving) {
    if (state.perched) return;
    const here = surfaceFeetUnder(state.x);
    if (state.airborne) {
      state.vy -= gravity * (state.vy < 0 ? FALL_GRAVITY_SCALE : 1) * dt;
      if (state.vy < -MAX_FALL_SPEED) state.vy = -MAX_FALL_SPEED;
      state.feet += state.vy * dt;
      if (here !== null && state.vy <= 0 && state.feet <= here) {
        state.feet = here;
        state.vy = 0;
        state.airborne = false;
      }
      return;
    }
    if (here === null || here < state.feet - 0.5) {
      // Walked off an edge: fall (or, over a gap while moving, leap it).
      if (here === null && moving) launchNpc(state, NPC_GAP_JUMP_RISE);
      else { state.vy = 0; state.airborne = true; }
      return;
    }
    // Standing: anything a little higher underfoot is stepped onto.
    state.feet = here;
    if (!moving) return;
    const ahead = surfaceFeetUnder(state.x + state.facing * NPC_LOOKAHEAD);
    if (ahead === null) launchNpc(state, NPC_GAP_JUMP_RISE);
    else if (ahead > state.feet + 0.5) launchNpc(state, ahead - state.feet + NPC_JUMP_CLEARANCE);
  }

  // A character that somehow drops below the world lands back on its footing.
  function recoverFallenNpc(npc, state) {
    if (state.feet > -GROUND_BAND - 6) return;
    state.x = followActive(npc) ? followTargetX() : state.homeX;
    const feet = surfaceFeetUnder(state.x);
    state.feet = feet === null ? 0 : feet;
    state.vy = 0;
    state.airborne = false;
  }

  // Puts a scripted character straight into its current place - used when a
  // scene is built or resumed, so nothing replays and nobody pops in late.
  function placeScriptedNpc(npc, state) {
    if (!state) return;
    state.scripted = true;
    state.walking = false;
    state.airborne = false;
    state.vy = 0;
    state.perched = Boolean(npc.perched);
    const presence = npcPresence(npc, state);
    if (presence === 'leaving') { state.gone = true; return; }
    const move = currentMove(npc);
    if (followActive(npc)) {
      state.x = followTargetX();
      state.following = true;
    } else if (move) {
      state.x = Number(move.toX);
    } else if (npc.lead) {
      state.x = leadTargetX(npc, Number(npc.x));
    }
    if (move || state.following) state.perched = false;
    if (!state.perched) {
      const feet = surfaceFeetUnder(state.x);
      if (feet !== null) state.feet = feet;
    }
    state.homeX = state.x;
    state.facing = playerX < state.x ? -1 : 1;
  }

  // Shows/hides scripted characters for the current story position. A
  // character arriving mid-scene makes its entrance; one leaving by vanishing
  // or sinking plays that before it is gone.
  function refreshNpcPresence(instant = false) {
    npcs().forEach((npc) => {
      const state = npcStates.get(npc.id);
      if (!state || !isScripted(npc)) return;
      const presence = npcPresence(npc, state);
      const node = state.node;
      if (presence === 'leaving') {
        const action = npc.leave.action || 'hide';
        if (instant || action === 'hide') state.gone = true;
        else if ((action === 'vanish' || action === 'sink') && !state.exiting && !cutsceneHolding()) {
          state.exiting = true;
          node?.classList.add(action === 'sink' ? 'is-sinking' : 'is-vanishing');
          window.setTimeout(() => {
            state.gone = true;
            refreshNpcPresence();
          }, EXIT_FADE_MS);
        }
      }
      const visible = !state.gone && npcPresence(npc, state) !== 'hidden';
      if (!node) return;
      if (visible && state.hiddenBefore && !instant && npc.appear?.enter) {
        node.classList.add(npc.appear.enter === 'rise' ? 'is-rising' : 'is-appearing');
      }
      state.hiddenBefore = !visible;
      node.style.display = visible ? '' : 'none';
      node.setAttribute('aria-hidden', visible ? 'false' : 'true');
    });
  }

  // Story routines for characters that keep busy in the background:
  //   drill  - knights training: hold their spot, leap and turn on a beat.
  //   patrol - soldiers rushing through the streets between two points.
  //   stand  - holds their post (a gate guard, the King at the bedside).
  function routineTarget(npc, state, dt, speed) {
    const routine = npc.routine;
    state.routineTimer = (state.routineTimer ?? (0.4 + Math.random() * 1.2)) - dt;
    if (routine.type === 'patrol') {
      const ends = [Number(routine.from), Number(routine.to)];
      state.patrolLeg = state.patrolLeg ?? 1;
      const target = ends[state.patrolLeg];
      if (Math.abs(target - state.x) < 0.5 && state.routineTimer <= 0) {
        state.patrolLeg = 1 - state.patrolLeg;
        state.routineTimer = Number(routine.pause) || 0.8;
      }
      const resting = Math.abs(target - state.x) < 0.5;
      return { targetX: resting ? state.x : target, speed: routine.run ? SCRIPTED_RUN_SPEED : speed };
    }
    if (routine.type === 'drill' && state.routineTimer <= 0 && !state.airborne) {
      state.routineTimer = 1.3 + Math.random() * 1.1;
      state.drillFacing = -(state.drillFacing || 1);
      state.facing = state.drillFacing;
      launchNpc(state, Number(routine.leap) || 9);
    }
    return { targetX: state.homeX, speed };
  }

  // A guide (`lead: { to, gap }`) walks ahead of CubeBot: she keeps `gap`
  // ahead of him as he comes on, waits while he hangs back, and stops at `to`
  // (FlowerGirl showing him through the castle to her room).
  function leadTargetX(npc, fromX) {
    const end = Number(npc.lead.to);
    return Math.min(end, Math.max(fromX, playerX + Number(npc.lead.gap || 30)));
  }

  function stepScriptedNpc(npc, state, dt) {
    const presence = npcPresence(npc, state);
    if (presence === 'hidden' || presence === 'gone') { state.walking = false; return; }
    let targetX = state.homeX;
    let speed = Number(npc.speed) || SCRIPTED_WALK_SPEED;
    if (presence === 'leaving') {
      const action = npc.leave.action || 'hide';
      if (action !== 'walk' && action !== 'run') {
        refreshNpcPresence();
        state.walking = false;
        return;
      }
      targetX = Number(npc.leave.toX);
      speed = action === 'run' ? SCRIPTED_RUN_SPEED : (Number(npc.leave.speed) || speed);
    } else if (followActive(npc)) {
      state.following = true;
      targetX = followTargetX();
      // Keep pace with the player, and catch up quickly after a long jump.
      speed = Math.min(SCRIPTED_RUN_SPEED, Math.max(moveSpeed, Math.abs(targetX - state.x) * 3));
      if (Math.abs(targetX - state.x) < 2.5) targetX = state.x;
    } else {
      if (state.following) {
        // Stops travelling with the player and stays where they are.
        state.following = false;
        state.homeX = state.x;
      }
      const move = currentMove(npc);
      if (move) {
        targetX = Number(move.toX);
        speed = move.action === 'run' ? SCRIPTED_RUN_SPEED : (Number(move.speed) || speed);
      } else if (npc.lead) {
        const ahead = leadTargetX(npc, state.x) - state.x;
        // Her pace follows how far behind her lead she is: she keeps step with
        // CubeBot while he walks and eases to a stop when he does - no
        // stop-start, and her stride (scaled by speed) matches her movement.
        if (!state.leading && ahead > 3) state.leading = true;
        if (state.leading && ahead < 0.3) state.leading = false;
        targetX = state.leading ? leadTargetX(npc, state.x) : state.x;
        speed = Math.min(SCRIPTED_RUN_SPEED, Math.max(6, ahead * 5));
        state.leadFacing = Math.sign(Number(npc.lead.to) - state.x) || 1;
      } else if (npc.routine) {
        ({ targetX, speed } = routineTarget(npc, state, dt, speed));
      }
    }
    if (state.airborne) speed = Math.max(speed, moveSpeed * 1.3);
    const delta = targetX - state.x;
    const stride = speed * dt;
    const arrived = Math.abs(delta) <= stride;
    const wasPerched = state.perched;
    if (arrived) {
      state.x = targetX;
      state.walking = false;
      state.running = false;
      // At rest, characters turn to face CubeBot - unless busy with a routine.
      // A guide still leading the way keeps looking where she is going.
      const guiding = npc.lead && !currentMove(npc) && state.x < Number(npc.lead.to) - 0.5;
      state.facing = npc.routine?.type === 'drill' ? (state.drillFacing || 1)
        : guiding ? state.leadFacing || 1
        : (playerX < state.x ? -1 : 1);
    } else {
      state.x += Math.sign(delta) * stride;
      state.walking = true;
      state.running = speed >= SCRIPTED_RUN_SPEED * 0.8;
      state.facing = Math.sign(delta);
      state.perched = false;
    }
    // Hopping down from a perch (Twigg leaving Mr. Golem's head).
    if (wasPerched && !state.perched) {
      state.vy = NPC_HOP_VELOCITY;
      state.airborne = true;
    }
    stepNpcVertical(state, dt, !arrived);
    recoverFallenNpc(npc, state);
    // updateNpcs plays 5 frames per unit of animationTime.
    state.animationTime = (state.animationTime || 0)
      + dt * (state.walking ? (speed / moveSpeed) * (STRIDE_FPS_AT_PLAYER_SPEED / 5) : 1);
    if (presence === 'leaving' && arrived) {
      if (npc.leave.fade && !state.exiting) {
        state.exiting = true;
        state.node?.classList.add('is-vanishing');
        window.setTimeout(() => {
          state.gone = true;
          refreshNpcPresence();
        }, EXIT_FADE_MS);
      } else if (!npc.leave.fade) {
        state.gone = true;
        refreshNpcPresence();
      }
    }
  }

  // The character a story event belongs to, if the world names one.
  function actorForEvent(event) {
    if (!event) return null;
    return npcs().find((npc) => Array.isArray(npc.actsIn) && npc.actsIn.includes(event.id))
      || npcs().find((npc) => npc.id === event.npcId)
      || null;
  }

  // A conversation waits for its character to be there and standing still.
  function actorSettled(npc) {
    if (!npc || !isScripted(npc)) return true;
    const state = npcStates.get(npc.id);
    return Boolean(state) && npcPresence(npc, state) === 'present' && !state.walking && !state.airborne;
  }

  function storyConversation(event, index) {
    const actor = actorForEvent(event);
    return {
      id: event.id || `story-event-${index + 1}`,
      name: event.name || event.pageTitle || 'Story',
      asset: event.asset || '',
      actor: actor ? { name: actor.name, asset: actor.asset, animationAsset: actor.animationAsset } : null,
      dialogue: Array.isArray(event.turns) ? event.turns : [],
      isStoryEvent: true,
      storyEventIndex: index,
      nextScene: event.nextScene || '',
      // A scene the story moves to once this dialogue is finished (with a fade
      // through black, but no narration of its own).
      thenScene: event.thenScene || '',
      endsStory: Boolean(event.endsStory),
      cutscene: event.cutscene || null,
      goto: event.goto || null,
    };
  }

  // Characters and CubeBot hold one still frame while the story is paused for
  // dialogue or a page turn.
  function freezeActors() {
    npcStates.forEach((state) => { state.walking = false; state.running = false; });
    updateNpcs();
    setPlayerAnimationFrame();
  }

  function updateNpcs() {
    npcs().forEach((npc) => {
      const state = npcStates.get(npc.id);
      if (!state || !state.node) return;
      const rawX = Number(state.x ?? npc.x);
      setStyle(state.node, 'left', `${toLayerPercent(clamp(Number.isFinite(rawX) ? rawX : 60, 0, WORLD_WIDTH)).toFixed(4)}%`);
      setStyle(state.node, 'bottom', `calc(${entityBottomPct(state.feet).toFixed(4)}% + env(safe-area-inset-bottom))`);
      if (npc.animationAsset) {
        // The sheet is looked up once per character node, not every frame.
        if (state.sheetNode === undefined || (state.sheetNode && !state.node.contains(state.sheetNode))) {
          state.sheetNode = state.node.querySelector('.platformer-sprite-sheet');
        }
        const image = state.sheetNode;
        if (image) {
          // `still`: the author turned this character's animation off; it keeps
          // its first standing pose while it moves.
          const paused = dialogueOpen || sceneTransitioning || Boolean(npc.still);
          let row = state.walking && !paused ? 1 : 0;
          const columns = row === 1 ? 6 : 4;
          let column = paused ? 0 : Math.floor((state.animationTime || 0) * 5) % columns;
          if (state.airborne && !paused) {
            // Jump row: rising, apex, falling - the same poses CubeBot uses.
            row = 2;
            column = jumpFrameFor(state.vy);
          }
          // Face the direction of travel while preserving the ground-trim shift
          // (and, in the air, undoing the jump row's baked-in lift).
          const trimShift = image.dataset.trimShift ? ` translateY(${image.dataset.trimShift})` : '';
          setSpriteFrameFacing(image, row, column, state.facing < 0, trimShift);
          setJumpShift(state.node, row, column);
        }
      }
    });
    updateActorHitboxes();
  }

  // A character with a conversation of their own (not a story event) can be
  // talked to whenever they are there (busy or not - the world holds still
  // while they talk) once any story event they take part in is over, so a
  // side chat never comes before their part in the story.
  function sideChatAvailable(npc) {
    if (!hasConversation(npc)) return false;
    const state = npcStates.get(npc.id);
    if (state && npcPresence(npc, state) !== 'present') return false;
    const acts = Array.isArray(npc.actsIn) ? npc.actsIn : [];
    return acts.every((id) => {
      const index = storyEvents.findIndex((event) => event.id === id);
      return index < 0 || index < storyEventIndex;
    });
  }

  function npcX(npc) {
    const state = npcStates.get(npc.id);
    return Number.isFinite(Number(state?.x)) ? Number(state.x) : npcRect(npc).cx;
  }

  // A "!" over the name of everyone the player can talk to by pressing the
  // talk button: the character a manual story event is waiting on, and anyone
  // with a side conversation (dimmer once they have been heard).
  function updateTalkMarkers() {
    const event = storyEvents[storyEventIndex];
    const waiting = event?.requiresInteraction && (!world.autoTalk || event.manual) && !dialogueOpen
      ? actorForEvent(event) : null;
    const waitingReady = waiting && actorSettled(waiting);
    npcStates.forEach((state, id) => {
      const npc = npcs().find((item) => item.id === id);
      const story = Boolean(waitingReady && waiting.id === id);
      const missed = !story && !dialogueOpen && !cutscene && missedTalkFor(id);
      const side = !story && !missed && !dialogueOpen && !cutscene && npc && sideChatAvailable(npc);
      state.node?.classList.toggle('is-talkable', Boolean(story || missed || side));
      state.node?.classList.toggle('is-talked', Boolean((missed && missed.heard) || (side && state.talked)));
    });
  }

  function updateProximity() {
    const event = storyEvents[storyEventIndex];
    const eventIsReady = event?.requiresInteraction && (!world.autoTalk || event.manual)
      && Math.abs(playerX - Number(event.x || 0)) <= NPC_TALK_RANGE
      && actorSettled(actorForEvent(event));
    const eventConversation = eventIsReady ? storyConversation(event, storyEventIndex) : null;
    const nearby = npcs()
      .filter((npc) => (missedTalkFor(npc.id) || sideChatAvailable(npc)) && Math.abs(playerX - npcX(npc)) <= NPC_TALK_RANGE)
      .sort((a, b) => Math.abs(playerX - npcX(a)) - Math.abs(playerX - npcX(b)));
    // A story talk the player walked past is still there to be heard.
    const nearest = nearby[0] ? (missedTalkFor(nearby[0].id) || nearby[0]) : null;
    activeNpc = cutscene ? null : eventConversation || nearest || null;
    if (chatButton) {
      chatButton.classList.toggle('hidden', !activeNpc || dialogueOpen);
      chatButton.disabled = !activeNpc || dialogueOpen;
    }
  }

  function stopChoiceTimer() {
    if (choiceTimerFrame) {
      cancelAnimationFrame(choiceTimerFrame);
      choiceTimerFrame = 0;
    }
    if (choiceTimer) {
      choiceTimer.classList.add('hidden');
      choiceTimer.setAttribute('aria-hidden', 'true');
    }
    if (choiceTimerFill) {
      choiceTimerFill.style.transform = 'scaleX(1)';
      choiceTimerFill.style.background = 'linear-gradient(90deg, #6277c3, #74ddb1)';
    }
  }

  function startChoiceTimer(choices) {
    stopChoiceTimer();
    if (!choiceTimer || !choiceTimerFill || !choices.length) return;

    choiceTimer.classList.remove('hidden');
    choiceTimer.setAttribute('aria-hidden', 'false');
    const deadline = performance.now() + CHOICE_TIMER_MS;
    const tick = (now) => {
      if (!dialogueOpen || !dialogueChoices.childElementCount) {
        stopChoiceTimer();
        return;
      }
      const remaining = Math.max(0, deadline - now);
      const ratio = remaining / CHOICE_TIMER_MS;
      const urgency = 1 - ratio;
      const red = Math.round(98 + (214 - 98) * urgency);
      const green = Math.round(119 + (87 - 119) * urgency);
      const blue = Math.round(195 + (110 - 195) * urgency);
      choiceTimerFill.style.transform = `scaleX(${ratio})`;
      choiceTimerFill.style.background = `linear-gradient(90deg, rgb(${red}, ${green}, ${blue}), #74ddb1)`;
      if (remaining <= 0) {
        // Time is up: the first choice is taken.
        chooseChoice(choices[0]);
        return;
      }
      choiceTimerFrame = requestAnimationFrame(tick);
    };
    choiceTimerFrame = requestAnimationFrame(tick);
  }

  // Dialogue figures show the character's 2D design (its portrait art); the
  // pixel sprite sheet is for gameplay, and is only used here as a first idle
  // frame for a character that has no portrait. Either way the figure is a
  // single still picture for as long as it is on screen - no idle, walk or run
  // cycle plays during dialogue. A right-hand sprite is mirrored to face the
  // player.
  function setFigureSprite(figure, asset, animationAsset, flip, name) {
    if (!figure) return;
    const image = figure.querySelector('img');
    if (!image) return;
    image.alt = name || '';
    if (animationAsset && !asset) {
      figure.classList.add('is-animated');
      image.classList.add('platformer-sprite-sheet');
      if (image.getAttribute('src') !== animationAsset) image.src = animationAsset;
      setSpriteFrameFacing(image, 0, 0, flip);
    } else {
      figure.classList.remove('is-animated');
      image.classList.remove('platformer-sprite-sheet');
      image.style.transform = '';
      image.style.left = '';
      image.style.top = '';
      if (asset) image.src = asset;
      else image.removeAttribute('src');
    }
  }

  // Story worlds can name the model behind a speaker label used in turns
  // ("thief", "old man", ...). A label with no model (a guard, the seer) shows
  // no figure rather than borrowing someone else's.
  const speakerModels = new Map(Object.entries(world.speakerModels || {})
    .map(([key, model]) => [key.toLowerCase(), model]));

  // Whoever last spoke opposite CubeBot in this conversation: when CubeBot
  // answers someone who isn't the event's own character (the Seer, a guard),
  // they stay on the right while he replies.
  let dialoguePartner = null;

  function figureForTurn(npc, turn) {
    const speaker = String(turn?.speaker || '').toLowerCase();
    if (speaker === 'player') return npc?.actor || dialoguePartner || npc;
    if (!speaker || speaker === 'npc' || speaker === 'narrator') {
      return npc?.actor || npc;
    }
    if (speakerModels.has(speaker)) return speakerModels.get(speaker);
    return world.speakerModels ? null : (npc?.actor || npc);
  }

  function setDialogueFigures(npc, turn) {
    setFigureSprite(dialogueFigureLeft, playerProfile.asset, playerProfile.animationAsset, false, playerProfile.name || 'You');
    const model = figureForTurn(npc, turn);
    setFigureSprite(dialogueFigureRight, model?.asset, model?.animationAsset, true, model?.name || npc?.name || 'Friend');
    if (turn?.speaker !== 'player' && (model?.asset || model?.animationAsset)) dialoguePartner = model;
    return model;
  }

  const TITLE_FADE_MS = 450;

  // The story card is a full-bleed black screen, used for the opening title and
  // for narration: both are introductions to the story rather than dialogue
  // between characters, so both are centred on black with the gameplay hidden
  // behind them. `mode` only picks the typography ('title' vs 'narration').
  //
  // The backdrop never animates: it switches on discretely via `visibility` so it
  // is instantly opaque and the gameplay is never seen through it. Only the text
  // fades. Fading out is two-step - the text fades first, and the backdrop is
  // dropped only once that has finished - so the gameplay reveal is clean.
  function setTitleCard(show) {
    if (!titleCard) return;
    titleCard.classList.toggle('visible', show);
    titleCard.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  // Text on the black card always moves with a transition: when the card comes
  // up the text fades in, and when the next line replaces the one showing
  // (the title giving way to the narration) the old text fades out first.
  const STORY_CARD_SWAP_MS = 250;
  // Storyboard frames: keep in step with .vn-story-card.is-frame in
  // teacher-stories.css (the picture's fade-out, and the pause into it).
  const STORY_FRAME_OUT_MS = 350;
  const STORY_FRAME_IN_DELAY_MS = 150;
  // Keep in step with .vn-story-card.backdrop-out in teacher-stories.css.
  const STORY_CARD_BACKDROP_MS = 300;
  let storyCardSwapTimer = 0;

  const cardImageOf = () => (titleCard?.classList.contains('has-image') ? titleCardImage.getAttribute('src') || '' : '');

  // How a storyboard frame arrives (`turn.transition`):
  //   from gameplay - always a dissolve: the picture fades in over the scene;
  //   from another frame - 'crossfade' (the default: one picture melts into the
  //     next), 'dip' (through black, for a change of time or place) or 'flash'
  //     (through white, for a blinding light);
  //   from narration - the line fades, a breath of black, the picture rises in.
  const FRAME_DISSOLVE_MS = 450;
  const FRAME_CROSSFADE_MS = 500;
  const FRAME_FLASH_MS = 600;
  let crossfadeTimer = 0;

  function crossfadeFrame(nextImage, apply, flash) {
    // The old picture stays underneath while the new one fades in over it.
    titleCardFrame.querySelectorAll('.vn-story-card-under').forEach((node) => node.remove());
    const under = document.createElement('img');
    under.className = 'vn-story-card-under';
    under.alt = '';
    under.src = titleCardImage.getAttribute('src') || '';
    titleCardFrame.insertBefore(under, titleCardImage);
    titleCard.classList.remove('is-crossfading', 'is-flashing');
    void titleCard.offsetWidth;
    const start = () => {
      apply();
      titleCard.classList.add(flash ? 'is-flashing' : 'is-crossfading');
      window.clearTimeout(crossfadeTimer);
      crossfadeTimer = window.setTimeout(() => {
        under.remove();
        titleCard.classList.remove('is-crossfading', 'is-flashing');
      }, flash ? FRAME_FLASH_MS : FRAME_CROSSFADE_MS);
    };
    // Start once the next picture is ready - or after a moment regardless, so
    // a slow decode can never hold the story up.
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      start();
    };
    const probe = new Image();
    probe.src = nextImage;
    (probe.decode ? probe.decode() : Promise.resolve()).then(go, go);
    window.setTimeout(go, 250);
  }

  // `rich`: the line's formatting (js/rich-text.js), if it has any.
  function showStoryCard(text, mode = 'title', image = '', transition = '', rich = '') {
    if (!titleCard) return;
    window.clearTimeout(storyCardSwapTimer);
    const nextText = text || '';
    const nextImage = image || '';
    const apply = () => {
      if (window.KoobdRichText) window.KoobdRichText.render(titleCardText, rich, nextText);
      else titleCardText.textContent = nextText;
      titleCard.classList.toggle('is-narration', mode === 'narration');
      titleCard.classList.toggle('is-frame', mode === 'frame');
      if (titleCardImage) {
        if (nextImage) titleCardImage.src = nextImage;
        titleCard.classList.toggle('has-image', Boolean(nextImage));
      }
      titleCard.classList.remove('is-swapping');
    };
    const alreadyShowing = titleCard.classList.contains('visible') && !titleCard.classList.contains('hiding');
    // Clears any pending fade-out so the card cannot be removed mid-show.
    titleCard.classList.remove('hiding', 'backdrop-out', 'is-dissolving');
    setTitleCard(true);
    // Covers the world from the first frame, so gameplay is never visible
    // behind or before the text. A storyboard frame instead dissolves in over
    // the scene, so it is not blacked out first.
    if (!(mode === 'frame' && !alreadyShowing)) stage.classList.add('is-title-intro');
    const switchingFrames = alreadyShowing && mode === 'frame' && titleCard.classList.contains('is-frame')
      && cardImageOf() && cardImageOf() !== nextImage && transition !== 'dip';
    if (switchingFrames) {
      crossfadeFrame(nextImage, apply, transition === 'flash');
    } else if (!alreadyShowing) {
      // Coming up: start from hidden text (no transition), then fade it in.
      titleCard.classList.add('text-pending');
      apply();
      void titleCard.offsetWidth;
      const reveal = () => titleCard.classList.remove('text-pending');
      requestAnimationFrame(() => requestAnimationFrame(reveal));
      window.setTimeout(reveal, 80);
    } else if (titleCardText.textContent !== nextText || cardImageOf() !== nextImage) {
      // Out with the old, in with the new. A storyboard frame gets a slower
      // crossfade: the line fades out, a breath of black, then the picture
      // fades in and settles; leaving a picture, it fades fully before the
      // next line rises in.
      const leavingFrame = titleCard.classList.contains('is-frame');
      const enteringFrame = mode === 'frame';
      const swapMs = leavingFrame ? STORY_FRAME_OUT_MS : (enteringFrame ? STORY_FRAME_IN_DELAY_MS : STORY_CARD_SWAP_MS);
      titleCard.classList.add('is-swapping');
      storyCardSwapTimer = window.setTimeout(() => {
        // Start the new content from its "before" state, then let it come in.
        titleCard.classList.add('text-pending');
        apply();
        // Commit the "before" state (the picture has only just stopped being
        // display:none), so the change after it is animated, not jumped to.
        void titleCard.offsetWidth;
        const reveal = () => titleCard.classList.remove('text-pending');
        requestAnimationFrame(() => requestAnimationFrame(reveal));
        window.setTimeout(reveal, 60);
      }, swapMs);
    } else {
      apply();
    }
  }

  // A video storyboard beat plays over the frame (sound and all), and is
  // removed with it.
  const BLANK_FRAME = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  function setCardVideo(src) {
    if (!titleCardFrame) return;
    titleCardFrame.querySelectorAll('.vn-story-card-video').forEach((node) => node.remove());
    if (!src) return;
    const video = document.createElement('video');
    video.className = 'vn-story-card-video';
    video.src = src;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    titleCardFrame.appendChild(video);
    video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
  }

  function hideStoryCard() {
    if (!titleCard || !titleCard.classList.contains('visible')) return;
    window.clearTimeout(storyCardSwapTimer);
    if (titleCard.classList.contains('is-frame')) {
      // A storyboard picture dissolves straight into the scene behind it.
      stage.classList.remove('is-title-intro');
      titleCard.classList.add('hiding', 'is-dissolving');
      window.setTimeout(() => {
        if (!titleCard.classList.contains('hiding')) return;
        window.clearTimeout(crossfadeTimer);
        titleCardFrame.querySelectorAll('.vn-story-card-under').forEach((node) => node.remove());
        titleCard.classList.remove('is-crossfading', 'is-flashing');
        setTitleCard(false);
        titleCard.classList.remove('hiding', 'is-dissolving', 'is-narration', 'is-frame', 'backdrop-out', 'has-image');
        titleCardText.textContent = '';
        setCardVideo('');
      }, FRAME_DISSOLVE_MS);
      return;
    }
    titleCard.classList.add('hiding');
    window.setTimeout(() => {
      // A re-show during the fade cancels the hide.
      if (!titleCard.classList.contains('hiding')) return;
      // Text is gone: now fade the black page itself away to the gameplay.
      stage.classList.remove('is-title-intro');
      titleCard.classList.add('backdrop-out');
      window.setTimeout(() => {
        if (!titleCard.classList.contains('hiding')) return;
        setTitleCard(false);
        titleCard.classList.remove('hiding', 'is-narration', 'is-frame', 'backdrop-out', 'has-image');
        titleCardText.textContent = '';
      }, STORY_CARD_BACKDROP_MS);
    }, TITLE_FADE_MS);
  }

  // Move the scene behind an open conversation to another place: straight away
  // when a story card already covers the screen, otherwise through black.
  // Stand CubeBot at `x` in the current scene (on whatever footing is there),
  // with the companions travelling with him just behind, and frame the camera
  // on him - used while a story card covers the screen, so the journey moves
  // on between the storyboard and the next line.
  function placePartyAt(x) {
    const bounds = scenePlayerBounds();
    playerX = clamp(Number(x), bounds.min + playerHalfWidth + 0.5, bounds.max - playerHalfWidth - 0.5);
    playerY = standingFeetAt(playerX);
    velocityY = 0;
    direction = 0;
    lastDirection = 1;
    lastSafeX = playerX;
    lastSafeY = playerY;
    groundedSince = performance.now() - LANDING_SETTLE_MS;
    npcs().forEach((npc) => {
      const state = npcStates.get(npc.id);
      if (!state || !followActive(npc)) return;
      state.x = followTargetX();
      const feet = surfaceFeetUnder(state.x);
      if (feet !== null) state.feet = feet;
      state.vy = 0;
      state.airborne = false;
      state.walking = false;
      state.facing = 1;
    });
    cameraSnapped = false;
    updatePlayer();
    updateNpcs();
    updateCamera(0);
  }

  // A line can take the story somewhere else before it is shown: `scene` moves
  // to another scene, `at` to a place within it (both happen behind black).
  function changeSceneDuringDialogue(sceneId, then, at = null) {
    const covered = titleCard?.classList.contains('visible') && !titleCard.classList.contains('hiding');
    const swap = () => {
      const nextScene = storyScenes.find((scene) => scene.id === sceneId);
      if (!nextScene) { then(); return; }
      if (nextScene !== activeStoryScene) {
        activeStoryScene = nextScene;
        cameraHeldForPage = false;
        placePlayerAtSceneStart(nextScene);
        backgroundStyle();
        renderDecor();
        renderPlatforms();
        resetNpcs();
        renderNpcs();
        renderStaticHitboxes();
        cameraSnapped = false;
        updatePlayer();
        updateNpcs();
        updateCamera(0);
      }
      if (at !== null) placePartyAt(at);
      then();
    };
    if (covered) { swap(); return; }
    sceneTransitioning = true;
    stage.classList.add('is-scene-transitioning');
    window.setTimeout(() => {
      swap();
      window.setTimeout(() => {
        stage.classList.remove('is-scene-transitioning');
        window.setTimeout(() => { sceneTransitioning = false; }, SCENE_FADE_MS);
      }, PAGE_HOLD_MS);
    }, SCENE_FADE_MS);
  }

  const hasPlace = (turn) => turn?.at !== undefined && turn.at !== null && Number.isFinite(Number(turn.at));

  function showTurn(npc, index) {
    const turns = npcTurns(npc);
    const turn = turns[index];
    if (!turn) { closeDialogue(true); return; }
    if (turn.scene && activeStoryScene && activeStoryScene.id !== turn.scene) {
      changeSceneDuringDialogue(turn.scene, () => showTurn(npc, index), hasPlace(turn) ? Number(turn.at) : null);
      return;
    }
    if (hasPlace(turn) && activeStoryScene && Math.abs(playerX - Number(turn.at)) > 1) {
      changeSceneDuringDialogue(activeStoryScene.id, () => showTurn(npc, index), Number(turn.at));
      return;
    }
    stopChoiceTimer();
    playLineSound(turn.audio || '');
    const isTitle = turn.type === 'title';
    const isNarratorTurn = turn.speaker === 'narrator';
    // Titles and narration are both introductions shown as centred text on a
    // black card, not as dialogue between characters.
    if (isTitle || isNarratorTurn) {
      dialogueNameLeft.textContent = '';
      dialogueNameRight.textContent = '';
      dialogueNameLeft.classList.remove('active');
      dialogueNameRight.classList.remove('active');
      dialogueFigureLeft.classList.add('hidden');
      dialogueFigureRight.classList.add('hidden');
      dialogueText.classList.remove('visible');
      dialogueText.textContent = '';
      dialogueChoices.innerHTML = '';
      dialogue.classList.toggle('is-story-card', true);
      // A storyboard frame (`type: 'frame'`) is a beat of its own: the
      // picture alone, filling the screen, after the line it illustrates.
      const mode = isTitle ? 'title' : (turn.type === 'frame' ? 'frame' : 'narration');
      setCardVideo(mode === 'frame' ? turn.video || '' : '');
      // A title card can have its own font and size (otherwise the story's).
      stage.querySelectorAll('.vn-story-card-text').forEach((node) => {
        node.style.fontFamily = isTitle && turn.font ? turn.font : '';
        if (isTitle && turn.size) node.dataset.titleSize = turn.size; else delete node.dataset.titleSize;
      });
      showStoryCard(turn.text || '', mode, turn.image || (turn.video ? BLANK_FRAME : ''), turn.transition || '', mode === 'frame' ? '' : turn.rich || '');
      return;
    }
    hideStoryCard();
    dialogue.classList.toggle('is-story-card', false);
    const isPlayerSpeaking = turn.speaker === 'player';
    const customSpeaker = turn.speaker && !['npc', 'narrator', 'player'].includes(turn.speaker)
      ? turn.speaker
      : '';
    const speakerModel = setDialogueFigures(npc, turn);
    const titleCase = (label) => label.replace(/\b\w/g, (letter) => letter.toUpperCase());
    const speakerName = isPlayerSpeaking
      ? (playerProfile.name || 'You')
      : (customSpeaker
        ? (speakerModels.get(customSpeaker.toLowerCase())?.name || titleCase(customSpeaker))
        : (npc.name || 'Friend'));
    const leftSpeaking = isPlayerSpeaking;
    dialogueNameLeft.textContent = leftSpeaking ? speakerName : '';
    dialogueNameRight.textContent = leftSpeaking ? '' : speakerName;
    dialogueNameLeft.classList.toggle('active', leftSpeaking);
    dialogueNameRight.classList.toggle('active', !leftSpeaking);
    dialogueFigureLeft.classList.toggle('active-left', leftSpeaking);
    dialogueFigureRight.classList.toggle('active-right', !leftSpeaking);
    dialogueFigureLeft.classList.toggle('hidden', !(playerProfile.asset || playerProfile.animationAsset));
    dialogueFigureRight.classList.toggle('hidden', !(speakerModel?.asset || speakerModel?.animationAsset));
    window.clearTimeout(dialogueTextTimer);
    dialogueText.classList.remove('visible');
    if (window.KoobdRichText) window.KoobdRichText.render(dialogueText, turn.rich, turn.text || '');
    else dialogueText.textContent = turn.text || '';
    dialogueTextTimer = window.setTimeout(() => dialogueText.classList.add('visible'), 50);
    dialogueChoices.innerHTML = '';
    const choices = Array.isArray(turn.choices) ? turn.choices.filter((choice) => String(choice?.text || '').trim()) : [];
    if (choices.length) {
      choices.forEach((choice) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'choice-btn';
        button.textContent = choice.text;
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          chooseChoice(choice);
        });
        dialogueChoices.appendChild(button);
      });
      startChoiceTimer(choices);
    }
  }

  // Ends this stage and hands the story on: `action` is { type: 'next' } (on
  // to the following page), { type: 'page', page } (a chosen page) or
  // { type: 'end', label } (the story's ending). The world fades to black
  // first, as at every ending.
  // True while a story moment the player must not skip is still to come
  // (optional talks, and moments already passed, do not hold the end).
  function requiredEventsPending() {
    return storyEvents.slice(storyEventIndex).some((event) => !event.optional);
  }

  function finishStage(action) {
    if (completed) return;
    completed = true;
    direction = 0;
    stopChoiceTimer();
    saveProgress(true);
    stage.classList.add('is-story-ended');
    fadeToBlack().then(() => {
      if (typeof onComplete === 'function') onComplete(action || { type: 'next' });
    });
  }

  // A choice that leads somewhere else (another page, or the ending) ends the
  // conversation there; one that carries on simply continues it.
  function chooseChoice(choice) {
    stopChoiceTimer();
    const goto = choice && choice.goto;
    if (goto && (goto.type === 'page' || goto.type === 'end')) {
      closeDialogue(false);
      finishStage(goto);
      return;
    }
    advanceDialogue();
  }

  // A story line can wait for a place (`turn.waitX`): the conversation pauses,
  // the player plays on, and it resumes there - so narration about a climb
  // comes as the player climbs.
  let pausedConversation = null;

  function advanceDialogue() {
    if (!conversationNpc) return;
    const turns = npcTurns(conversationNpc);
    const next = turnIndex + 1;
    const waitX = Number(turns[next]?.waitX);
    if (next < turns.length && Number.isFinite(waitX) && playerX < waitX) {
      pausedConversation = { npc: conversationNpc, index: next, waitX };
      closeDialogue(false);
      return;
    }
    if (next < turns.length) {
      turnIndex = next;
      showTurn(conversationNpc, turnIndex);
      return;
    }
    closeDialogue(true);
  }

  function openDialogue(npc, duringBlackTransition = false, startIndex = 0) {
    // A page turn opens its narration while the black overlay is already up, so
    // it is allowed in here even though the scene is mid-transition.
    if (!npc || dialogueOpen || (sceneTransitioning && !duringBlackTransition)) return;
    const turns = npcTurns(npc);
    if (!turns.length) return;
    if (npc.isStoryEvent) preloadStoryFrames(Number(npc.storyEventIndex) + 1);
    else if ('heard' in npc) npc.heard = true;
    else if (npcStates.has(npc.id)) npcStates.get(npc.id).talked = true;
    dialogueOpen = true;
    direction = 0;
    activeNpc = npc;
    conversationNpc = npc;
    turnIndex = startIndex;
    dialoguePartner = null;
    // The world holds still for the whole conversation (see tick), and so do
    // the two dialogue figures.
    freezeActors();
    // Characters whose part begins with this event (an entrance, a departure
    // the moment it starts) update before anything is drawn.
    refreshNpcPresence();
    showTurn(npc, startIndex);
    dialogue.classList.remove('hidden');
    // Everything behind the conversation softens out of focus; only the
    // dialogue box and the two speaking figures stay sharp.
    stage.classList.add('is-dialogue-open');
    dialogue.setAttribute('aria-hidden', 'false');
    if (chatButton) chatButton.classList.add('hidden');
    applyCamera();
  }

  function closeDialogue(advanceLevel, afterClose) {
    if (!dialogueOpen) { if (typeof afterClose === 'function') afterClose(); return; }
    const closedConversation = conversationNpc;
    dialogueOpen = false;
    conversationNpc = null;
    turnIndex = 0;
    stopChoiceTimer();
    window.clearTimeout(dialogueTextTimer);
    if (advanceLevel && closedConversation?.isStoryEvent) {
      storyEventIndex = Math.max(storyEventIndex, Number(closedConversation.storyEventIndex) + 1);
    }
    if (advanceLevel && closedConversation?.cutscene && !closedConversation?.nextScene) {
      // If the scene ended on narration, its black page is still fading out:
      // the cast waits for it, so the moment itself is never hidden behind it.
      const pageShowing = Boolean(titleCard?.classList.contains('visible') && !titleCard.classList.contains('hiding'));
      startCutscene(closedConversation.cutscene, null, pageShowing ? TITLE_FADE_MS + STORY_CARD_BACKDROP_MS : 0);
    }
    refreshNpcPresence();
    const turnsPage = Boolean(advanceLevel && closedConversation?.nextScene);
    if (turnsPage) {
      // Page turn: the black transition overlay is still fully opaque under the
      // story card, so hold the scene paused while the narration text fades
      // off the black page. Only then is the next scene built (still behind
      // black) and faded in - it is never visible behind the dialogue.
      sceneTransitioning = true;
    }
    hideStoryCard();
    dialogue.classList.remove('is-story-card');
    dialogue.classList.add('hidden');
    stage.classList.remove('is-dialogue-open');
    dialogue.setAttribute('aria-hidden', 'true');
    dialogueChoices.innerHTML = '';
    if (typeof afterClose === 'function') { afterClose(); }
    updateProximity();
    applyCamera();
    if (turnsPage) {
      window.setTimeout(() => revealStoryScene(closedConversation.nextScene), TITLE_FADE_MS);
      return;
    }
    const afterwards = () => {
      if (advanceLevel && (closedConversation?.endsStory || closedConversation?.goto)) {
        // The story's last scene (or a scene that leads to another page):
        // after the final words the world fades to black and stays dark -
        // the ending is shown on that black page, like the title, never over
        // the gameplay.
        finishStage(closedConversation.goto || { type: 'end' });
      } else if (advanceLevel && closedConversation?.thenScene) {
        // The next part of the story happens somewhere else: fade to black,
        // change the scene behind it, and fade into the new one.
        fadeToBlack().then(() => revealStoryScene(closedConversation.thenScene));
      } else if (advanceLevel) {
        saveProgress();
      }
    };
    if (cutscene && advanceLevel && closedConversation?.cutscene) {
      // The scene's characters now act it out (running away, being escorted
      // off, vanishing) while the player watches; whatever follows waits.
      cutscene.then = afterwards;
    } else {
      afterwards();
    }
  }

  // --- Cutscenes ------------------------------------------------------------
  // A story event can end with a cutscene: `cutscene: { focus: [ids] }` names
  // the characters whose story action plays out next (an exit, a walk to
  // somewhere, a vanishing). While it runs the player has no control, the
  // camera eases over to those characters and follows them, letterbox bars
  // frame the shot, and the story waits. When they have finished, the camera
  // eases back to the player, control returns, and anything the event leads to
  // (a scene change, the next event) carries on.
  const CUTSCENE_LERP_RATE = 3.2;
  const CUTSCENE_MIN_MS = 700;
  const CUTSCENE_MAX_MS = 12000;
  const CUTSCENE_SETTLE_MS = 450;
  const CAMERA_RETURN_MS = 650;
  let cutscene = null;
  let cameraReturnUntil = 0;
  let cameraHeldForPage = false;
  let controlsLockedUntil = 0;
  let pageHoldUntil = 0;
  const PAGE_SETTLE_MS = 350;
  const cutsceneBars = document.createElement('div');
  cutsceneBars.className = 'platformer-cutscene-bars';
  cutsceneBars.setAttribute('aria-hidden', 'true');
  cutsceneBars.innerHTML = '<span></span><span></span>';
  stage.appendChild(cutsceneBars);

  // `holdMs` keeps the cast still at first (while a narration page clears).
  function startCutscene(spec, then, holdMs = 0) {
    const focus = (Array.isArray(spec.focus) ? spec.focus : [spec.focus]).filter(Boolean);
    const now = performance.now();
    cutscene = { focus, then, startedAt: now, readyAt: now + holdMs, settledAt: 0, lastX: null, lastY: null,
      holdCamera: Boolean(spec.holdCamera) };
    direction = 0;
    jumpBufferTimer = 0;
    stage.classList.add('is-cutscene');
    updateProximity();
  }

  // Where the camera looks during a cutscene: the middle of the characters it
  // follows that are still on screen, or the last place they were. With
  // `holdCamera` it frames them where the moment begins and stays there, so
  // they can walk out of the shot.
  function cutsceneFocusPoint() {
    if (cutscene.holdCamera && cutscene.lastX !== null) return { x: cutscene.lastX, feet: cutscene.lastY };
    const points = cutscene.focus.map((id) => {
      const state = npcStates.get(id);
      if (!state || state.gone || state.node?.style.display === 'none') return null;
      return { x: state.x, feet: state.feet };
    }).filter(Boolean);
    if (points.length) {
      cutscene.lastX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      cutscene.lastY = Math.max(...points.map((point) => point.feet));
    }
    return cutscene.lastX === null ? null : { x: cutscene.lastX, feet: cutscene.lastY };
  }

  function cutsceneHolding(now = performance.now()) {
    return Boolean(cutscene) && now < cutscene.readyAt;
  }

  function cutsceneFinished(now) {
    if (cutsceneHolding(now)) return false;
    const busy = cutscene.focus.some((id) => {
      const state = npcStates.get(id);
      return state && !state.gone && (state.walking || state.airborne || state.exiting);
    });
    return !busy && now - cutscene.readyAt > CUTSCENE_MIN_MS;
  }

  function updateCutscene(now) {
    if (!cutscene) {
      if (controlsLockedUntil) {
        if (now < controlsLockedUntil || cameraHeldForPage) {
          direction = 0;
          jumpBufferTimer = 0;
        } else {
          controlsLockedUntil = 0;
          stage.classList.remove('is-cutscene');
          updateProximity();
        }
      }
      return;
    }
    direction = 0;
    const done = cutsceneFinished(now) || now - cutscene.startedAt > CUTSCENE_MAX_MS;
    if (!done) { cutscene.settledAt = 0; return; }
    if (!cutscene.settledAt) { cutscene.settledAt = now; return; }
    if (now - cutscene.settledAt < CUTSCENE_SETTLE_MS) return;
    const then = cutscene.then;
    cutscene = null;
    cameraReturnUntil = now + CAMERA_RETURN_MS;
    // The player takes over only once the camera has glided back to them; the
    // letterbox bars stay until then.
    controlsLockedUntil = now + CAMERA_RETURN_MS;
    // A page that follows on at once waits for the moment to settle first.
    pageHoldUntil = now + PAGE_SETTLE_MS;
    cameraHeldForPage = Boolean(storyEvents[storyEventIndex]?.immediate && storyEvents[storyEventIndex]?.nextScene);
    if (typeof then === 'function') then();
  }

  // Keep in step with the stage ::after transition in teacher-stories.css.
  const SCENE_FADE_MS = 400;
  // A short hold on the fully black page before narration appears and before
  // the next scene starts fading in, so the turn reads as a page change.
  const PAGE_HOLD_MS = 120;

  // Fade the stage fully to black. Resolves once the overlay is opaque, so the
  // caller can put work behind it without the new scene ever being seen.
  function fadeToBlack() {
    sceneTransitioning = true;
    direction = 0;
    stage.classList.add('is-scene-transitioning');
    return new Promise((resolve) => window.setTimeout(resolve, SCENE_FADE_MS + PAGE_HOLD_MS));
  }

  // Swap the world while the overlay is opaque, then fade back in from the new
  // scene's own starting camera and player position.
  function revealStoryScene(sceneId) {
    const nextScene = storyScenes.find((scene) => scene.id === sceneId);
    if (!nextScene) {
      console.error(`Could not find platformer story scene: ${sceneId}`);
      sceneTransitioning = false;
      stage.classList.remove('is-scene-transitioning');
      saveProgress();
      return;
    }
    // Fading back into the scene the player is already in (time passing in the
    // same place, e.g. after the guards take FlowerGirl from the forest)
    // keeps CubeBot exactly where he stood when the cutscene ended.
    const sameScene = Boolean(activeStoryScene && activeStoryScene.id === nextScene.id);
    const kept = sameScene ? { x: playerX, y: playerY, facing: lastDirection } : null;
    activeStoryScene = nextScene;
    cameraHeldForPage = false;
    controlsLockedUntil = 0;
    stage.classList.remove('is-cutscene');
    if (kept) {
      playerX = kept.x;
      playerY = Math.max(kept.y, standingFeetAt(kept.x));
      velocityY = 0;
      direction = 0;
      lastDirection = kept.facing;
      lastSafeX = playerX;
      lastSafeY = playerY;
    } else {
      // Start the new scene at its own entry point: standing on the ground near
      // its left edge, facing right, with the camera at the scene's start.
      placePlayerAtSceneStart(nextScene);
    }
    backgroundStyle();
    renderDecor();
    renderPlatforms();
    resetNpcs();
    renderNpcs();
    renderStaticHitboxes();
    cameraSnapped = false;
    updatePlayer();
    updateCamera(0);
    // Hold on black a moment so the new scene's art has painted, then fade in.
    window.setTimeout(() => {
      stage.classList.remove('is-scene-transitioning');
      window.setTimeout(() => {
        sceneTransitioning = false;
        updateProximity();
        saveProgress();
      }, SCENE_FADE_MS);
    }, PAGE_HOLD_MS);
  }

  function placePlayerAtSceneStart(scene) {
    const bounds = scenePlayerBounds(scene);
    playerX = clamp(bounds.min + SCENE_ENTRY_OFFSET, bounds.min + 2, Math.max(bounds.min + 2, bounds.max - 2));
    playerY = 0;
    velocityY = 0;
    direction = 0;
    lastDirection = 1;
    lastSafeX = playerX;
    lastSafeY = playerY;
    checkpointX = null;
    // In a new place he lands first; nothing begins before that.
    groundedSince = 0;
  }

  function sceneCheckpoints() {
    if (!activeStoryScene) return checkpoints;
    const bounds = scenePlayerBounds();
    return checkpoints.filter((checkpoint) => Number(checkpoint.x) >= bounds.min && Number(checkpoint.x) < bounds.max);
  }

  // The furthest checkpoint the player has reached in this scene.
  function noteCheckpointReached() {
    sceneCheckpoints().forEach((checkpoint) => {
      const x = Number(checkpoint.x);
      if (playerX >= x && (checkpointX === null || x > checkpointX)) checkpointX = x;
    });
  }

  // A hazard (spikes, thorns, a saw, or an uploaded picture placed as one)
  // touched by the player. Its geometry is in the same world units as the
  // solid blocks (resolveActor): x across the world, y down from the top, the
  // player's feet at groundTop - playerY. The hazard's own drawn shape counts
  // (the parts traced from its picture, or a hand-set hitbox), tested with
  // the same separating-axis check as solid blocks, so rotated and flipped
  // hazards are exact. Until a picture has been traced - or if it could not
  // be - its whole box counts, so a hazard is never harmless.
  const HAZARD_INSET = 0.85;
  function hazardParts(platform) {
    const rect = platformRect(platform);
    return rect.parts.length ? rect.parts : [{ corners: rect.corners }];
  }
  function touchingHazard() {
    const hazards = hazardPlatforms();
    if (!hazards.length) return false;
    // The character's visible body (its picture minus the transparent
    // margins), a little inside at the sides and head so a near miss is a
    // miss, but down to the soles, so landing on spikes counts.
    const bodyHalfWidth = playerHalfWidth * Math.max(0.3, 1 - playerBodyTrim.left - playerBodyTrim.right) * HAZARD_INSET;
    const bodyHeight = playerHeight * Math.max(0.3, 1 - playerBodyTrim.top - playerBodyTrim.bottom);
    const left = playerX - bodyHalfWidth;
    const right = playerX + bodyHalfWidth;
    const bottom = groundTop - playerY + 0.25;
    const top = bottom - bodyHeight * 0.92;
    return hazards.some((platform) => hazardParts(platform).some((part) => {
      const xs = part.corners.map((point) => point.x);
      const ys = part.corners.map((point) => point.y);
      if (Math.min(...xs) >= right || Math.max(...xs) <= left || Math.min(...ys) >= bottom || Math.max(...ys) <= top) return false;
      return Boolean(satResolve(part, left, right, top, bottom));
    }));
  }
  // Touching one is the character's failure: it stops, flashes, and the
  // existing respawn fades back to the last checkpoint (or the scene start).
  function checkHazards() {
    if (completed || sceneTransitioning || dialogueOpen || hazardHit) return false;
    if (!touchingHazard()) return false;
    hazardHit = true;
    direction = 0;
    velocityY = 0;
    player.classList.add('is-hurt');
    returnToCheckpoint();
    return true;
  }

  function respawnPoint() {
    if (checkpointX !== null) return checkpointX;
    if (activeStoryScene) return scenePlayerBounds().min + SCENE_ENTRY_OFFSET;
    return lastSafeX;
  }

  // Fades out, stands the player on top of the checkpoint's footing (never
  // inside a block), brings travelling companions along, re-frames the
  // camera, and fades back in. The story position is untouched.
  function returnToCheckpoint() {
    if (sceneTransitioning || dialogueOpen || completed) {
      hazardHit = false;
      player.classList.remove('is-hurt');
      return;
    }
    fadeToBlack().then(() => {
      const x = respawnPoint();
      playerX = x;
      const groundDepth = groundSurfaceDepth(x, playerHalfWidth);
      playerY = Math.max(groundDepth === null ? 0 : -groundDepth, standingFeetAt(x));
      velocityY = 0;
      direction = 0;
      lastDirection = 1;
      lastSafeX = playerX;
      lastSafeY = playerY;
      grounded = true;
      player.classList.remove('is-jumping', 'is-hurt');
      npcs().forEach((npc) => {
        const state = npcStates.get(npc.id);
        if (state?.scripted && followActive(npc)) placeScriptedNpc(npc, state);
      });
      cameraSnapped = false;
      updatePlayer();
      updateNpcs();
      updateCamera(0);
      saveProgress(false, true);
      window.setTimeout(() => {
        stage.classList.remove('is-scene-transitioning');
        window.setTimeout(() => {
          sceneTransitioning = false;
          hazardHit = false;
          updateProximity();
        }, SCENE_FADE_MS);
      }, PAGE_HOLD_MS);
    });
  }

  function transitionToStoryScene(sceneId) {
    fadeToBlack().then(() => revealStoryScene(sceneId));
  }

  // A page-turn event: fade to black first, show the narrator line against the
  // black screen, and only then reveal the next scene. The dialogue therefore
  // reads as a storybook page change rather than narration floating over the
  // outgoing (or the still-hidden incoming) background.
  const TALK_LEAD = 16;
  // A story moment begins only once CubeBot has landed and stood a moment.
  const LANDING_SETTLE_MS = 150;
  let groundedSince = 0;
  const playerLanded = () => Boolean(groundedSince) && performance.now() - groundedSince >= LANDING_SETTLE_MS;

  // Optional story talks (`optional: true` - a passing remark, not a turn in
  // the story) never hold the player back: walk past one and the story moves
  // on without it. The talk stays with its character, who keeps the "!" until
  // it is heard, so it can still be had by turning back.
  function missedTalkFor(actorId) {
    const talk = missedTalks.get(actorId);
    if (!talk) return null;
    const actor = npcs().find((npc) => npc.id === actorId);
    const state = actor && npcStates.get(actor.id);
    return state && npcPresence(actor, state) === 'present' ? talk : null;
  }
  function skipPassedOptionalEvents() {
    let skipped = false;
    let event = storyEvents[storyEventIndex];
    while (event?.optional && playerX > Number(event.x || 0) + NPC_TALK_RANGE) {
      const actor = actorForEvent(event);
      if (actor) {
        const talk = {
          ...storyConversation(event, storyEventIndex),
          isStoryEvent: false,
          nextScene: '',
          thenScene: '',
          endsStory: false,
          cutscene: null,
          heard: false,
        };
        missedTalks.set(actor.id, talk);
      }
      storyEventIndex += 1;
      skipped = true;
      event = storyEvents[storyEventIndex];
    }
    if (skipped) {
      refreshNpcPresence();
      updateProximity();
      saveProgress();
    }
  }

  function openNextStoryEventIfReady() {
    if (dialogueOpen || sceneTransitioning || cutscene) return;
    skipPassedOptionalEvents();
    if (!playerLanded()) return;
    if (performance.now() < pageHoldUntil && storyEvents[storyEventIndex]?.immediate) return;
    if (pausedConversation) {
      if (playerX < pausedConversation.waitX) return;
      const { npc, index } = pausedConversation;
      pausedConversation = null;
      direction = 0;
      openDialogue(npc, false, index);
      return;
    }
    const event = storyEvents[storyEventIndex];
    if (event?.requiresInteraction && world.autoTalk && !event.manual) {
      // Stop in front of the character - never inside them - once they are
      // there and standing still, and the conversation begins.
      if (controlsLockedUntil) return;
      const actor = actorForEvent(event);
      const state = actor && npcStates.get(actor.id);
      const present = Boolean(state) && npcPresence(actor, state) === 'present';
      const standX = (present ? state.x : Number(event.x || 0)) - Number(event.talkLead ?? TALK_LEAD);
      if (playerX < standX) return;
      if (present && !actorSettled(actor)) return;
      direction = 0;
      lastDirection = 1;
      openDialogue(storyConversation(event, storyEventIndex));
      return;
    }
    // Most story events wait for the player to reach their place; one marked
    // `immediate` follows straight on from the event before it.
    if (!event || (!event.immediate && playerX < Number(event.x || 0))) return;
    if (event.requiresInteraction) return;
    const narrative = storyConversation(event, storyEventIndex);
    if (!narrative.nextScene) {
      openDialogue(narrative);
      return;
    }
    // Claim the event up front so it cannot re-trigger while the fade runs.
    // closeDialogue's Math.max(...) advance stays consistent with this.
    storyEventIndex += 1;
    fadeToBlack().then(() => {
      // The dialogue opens on the black screen and stays up for its whole
      // duration; closeDialogue reveals the next scene, which removes the class.
      openDialogue(narrative, true);
    });
  }

  function jump() {
    if (dialogueOpen || sceneTransitioning || exitPromptOpen || cutscene) return;
    // Queue the jump; physicsStep consumes it during coyote time or on landing.
    jumpBufferTimer = JUMP_BUFFER;
  }

  function resolveActor(actor) {
    const obstacles = solidPlatforms().map(platformRect);
    for (let pass = 0; pass < 24; pass++) {
      let any = false;

      obstacles.forEach((rect) => {
        if (!rect.parts.length) return;
        if (actor.x + actor.halfWidth <= rect.left || actor.x - actor.halfWidth >= rect.right) return;
        if (groundTop - actor.feet <= rect.top || groundTop - actor.feet - actor.height >= rect.bottom) return;

        rect.parts.forEach((part) => {
          const feet = groundTop - actor.feet;
          const top = feet - actor.height;
          const left = actor.x - actor.halfWidth;
          const right = actor.x + actor.halfWidth;
          if (right <= part.left || left >= part.right || feet <= part.top || top >= part.bottom) return;

          const hit = satResolve(part, left, right, top, feet);
          if (!hit) return;

          // Scene y grows downward, so feet height changes by -dy.
          actor.x += hit.dx;
          actor.feet -= hit.dy;
          if (hit.ny < -0.4 && actor.velocityY <= 0.5) {
            actor.velocityY = 0;
            actor.grounded = true;
          } else if (hit.ny > 0.4 && actor.velocityY > 0) {
            actor.velocityY = 0;
          }
          actor.x = clamp(actor.x, actor.halfWidth + 0.5, WORLD_WIDTH - actor.halfWidth - 0.5);
          any = true;
        });
      });

      if (!any) break;
    }
    return actor;
  }

  function physicsStep(dt) {
    if (direction !== 0) lastDirection = direction;
    playerX += direction * moveSpeed * dt;
    const currentGravity = velocityY < 0 ? gravity * FALL_GRAVITY_SCALE : gravity;
    velocityY -= currentGravity * dt;
    if (velocityY < -MAX_FALL_SPEED) velocityY = -MAX_FALL_SPEED;
    playerY += velocityY * dt;
    // Only the active scene is built, so the player stays inside it: walking
    // past either edge would step off the rendered ground. (A scene's page
    // turn waits just inside its right edge, and a conversation the player
    // starts may still be waiting when they reach that edge.)
    const sceneBounds = activeStoryScene ? scenePlayerBounds() : { min: 0, max: WORLD_WIDTH };
    playerX = clamp(
      playerX,
      Math.max(playerHalfWidth + 0.5, sceneBounds.min + playerHalfWidth + 0.5),
      Math.min(WORLD_WIDTH - playerHalfWidth - 0.5, sceneBounds.max - playerHalfWidth - 0.5, nextInteractionGateX())
    );

    const resolved = resolveActor({
      x: playerX, feet: playerY, velocityY: velocityY,
      height: playerHeight, halfWidth: playerHalfWidth, grounded: false
    });
    playerX = resolved.x;
    playerY = resolved.feet;
    velocityY = resolved.velocityY;
    if (resolved.grounded) {
      grounded = true;
      player.classList.remove('is-jumping');
    }

    const groundDepth = groundSurfaceDepth(playerX, playerHalfWidth);
    const groundFeet = groundDepth === null ? null : -groundDepth;
    if (groundFeet !== null && velocityY <= 0 && playerY <= groundFeet) {
      playerY = groundFeet;
      velocityY = 0;
      grounded = true;
      player.classList.remove('is-jumping');
    }
    if (grounded) {
      lastSafeX = playerX;
      lastSafeY = playerY;
    } else if (hasGround && playerY < -FALL_RESPAWN_DEPTH) {
      if (checkpoints.length || activeStoryScene) {
        // Fell into a gap: restart the obstacle from its checkpoint.
        velocityY = 0;
        returnToCheckpoint();
        return;
      }
      // Fell into a gap: put the player back on the footing they jumped from.
      playerX = lastSafeX;
      playerY = lastSafeY + 0.5;
      velocityY = 0;
      cameraSnapped = false;
    }
    if (grounded) noteCheckpointReached();

    // Coyote time / jump buffering for responsive, forgiving jumps.
    if (grounded) coyoteTimer = COYOTE_TIME;
    else coyoteTimer = Math.max(0, coyoteTimer - dt);
    jumpBufferTimer = Math.max(0, jumpBufferTimer - dt);
    if (jumpBufferTimer > 0 && coyoteTimer > 0) {
      jumpBufferTimer = 0;
      coyoteTimer = 0;
      velocityY = jumpVelocity;
      grounded = false;
      player.classList.remove('is-jumping');
      player.classList.add('is-jumping');
    }
  }

  function stepNpcs(dt) {
    npcs().forEach((npc) => {
      const state = npcStates.get(npc.id);
      const size = npcSizes.get(npc.id);
      if (!state || !size) return;
      if (state.scripted) { stepScriptedNpc(npc, state, dt); return; }
      state.velocityY -= gravity * dt;
      // Same terminal velocity as the player so long drops stay consistent.
      if (state.velocityY < -MAX_FALL_SPEED) state.velocityY = -MAX_FALL_SPEED;
      state.animationTime = (state.animationTime || 0) + dt;
      state.feet += state.velocityY * dt;
      const resolved = resolveActor({
        x: state.x, feet: state.feet, velocityY: state.velocityY,
        height: size.height, halfWidth: size.halfWidth, grounded: false
      });
      state.x = resolved.x;
      state.feet = resolved.feet;
      state.velocityY = resolved.velocityY;
      const groundDepth = groundSurfaceDepth(state.x, size.halfWidth);
      const groundFeet = groundDepth === null ? null : -groundDepth;
      if (groundFeet !== null && state.velocityY <= 0 && state.feet <= groundFeet) {
        state.feet = groundFeet;
        state.velocityY = 0;
      }
      if (npc.animationAsset) {
        // Wander: walk to a nearby target, pause, pick a new one.
        const groundedNow = groundFeet !== null && Math.abs(state.feet - groundFeet) < 0.5;
        if (groundedNow) {
          if (state.wanderPause > 0) {
            state.wanderPause -= dt;
            if (state.wanderPause <= 0) {
              // A character standing on a ledge or by a gap keeps to its own
              // footing by giving a smaller radius.
              const radius = Number.isFinite(Number(npc.wanderRadius)) ? Number(npc.wanderRadius) : NPC_WANDER_RADIUS;
              state.wanderTargetX = clamp(state.homeX + (Math.random() * 2 - 1) * radius, 0, WORLD_WIDTH);
            }
          } else {
            const delta = state.wanderTargetX - state.x;
            if (Math.abs(delta) <= NPC_WALK_SPEED * dt) {
              state.x = state.wanderTargetX;
              state.wanderPause = 0.8 + Math.random() * 2.4;
              state.walking = false;
            } else {
              state.x += Math.sign(delta) * NPC_WALK_SPEED * dt;
              state.facing = Math.sign(delta);
              state.walking = true;
            }
          }
        }
        if (!groundedNow) state.walking = false;
      }
    });
  }

  // Area names (`world.areas`: { id, x, name, time }, in world order): when the
  // player first enters an area - after any page turn, narration or dialogue
  // has cleared - its name rises in at the top centre of the screen, holds
  // long enough to read, and fades away. Each area is announced once.
  const AREA_TITLE_SETTLE_MS = 300;
  const AREA_TITLE_HOLD_MS = 3400;
  const areas = (Array.isArray(world.areas) ? world.areas : [])
    .filter((area) => area && area.name)
    .slice()
    .sort((a, b) => Number(a.x) - Number(b.x));
  let areaTitle = null;
  if (areas.length) {
    stage.querySelectorAll('.platformer-area-title').forEach((node) => node.remove());
    areaTitle = document.createElement('div');
    areaTitle.className = 'platformer-area-title';
    areaTitle.setAttribute('translate', 'no');
    areaTitle.setAttribute('role', 'status');
    areaTitle.setAttribute('aria-live', 'polite');
    areaTitle.innerHTML = '<span class="platformer-area-name"></span><span class="platformer-area-time"></span>';
    stage.appendChild(areaTitle);
  }
  const announcedAreas = new Set();
  let areaPending = null;
  let areaPendingSince = 0;
  let areaHideTimer = 0;
  let areaShowing = null;
  function areaAt(x) {
    let found = null;
    areas.forEach((area) => {
      if (Number(area.x) <= x + 0.5 && belongsToActiveScene({ x: area.x, width: 1 })) found = area;
    });
    return found;
  }
  function updateAreaTitle(now) {
    if (!areaTitle) return;
    const area = areaAt(playerX);
    const calm = !dialogueOpen && !sceneTransitioning && !completed && !exitPromptOpen
      && !(titleCard && titleCard.classList.contains('visible'));
    if (areaShowing && !calm) {
      // A conversation or page turn cut the name short: hide it, and show it
      // again once the player is back in control, if they are still there.
      announcedAreas.delete(areaShowing);
      areaShowing = null;
      window.clearTimeout(areaHideTimer);
      areaTitle.classList.remove('is-visible');
    }
    if (!area || announcedAreas.has(area.id) || !calm) {
      areaPending = null;
      return;
    }
    // Wait for the screen to settle (a page turn fading out, the camera
    // arriving) before announcing where the player now is.
    if (areaPending !== area.id) {
      areaPending = area.id;
      areaPendingSince = now;
      return;
    }
    if (now - areaPendingSince < AREA_TITLE_SETTLE_MS) return;
    announcedAreas.add(area.id);
    areaPending = null;
    areaTitle.querySelector('.platformer-area-name').textContent = area.name;
    areaTitle.querySelector('.platformer-area-time').textContent = area.time || '';
    areaTitle.classList.toggle('has-time', Boolean(area.time));
    areaTitle.classList.add('is-visible');
    areaShowing = area.id;
    window.clearTimeout(areaHideTimer);
    areaHideTimer = window.setTimeout(() => {
      areaShowing = null;
      areaTitle.classList.remove('is-visible');
    }, AREA_TITLE_HOLD_MS);
  }

  // --- Sound -------------------------------------------------------------
  // The stage's music (`world.music`: { src, volume }) loops while it plays,
  // pauses with the story, and stops when the stage ends. A story line can
  // carry its own sound (`turn.audio`), played as the line appears.
  let stageMusic = null;
  let lineSound = null;
  function startMusic() {
    if (!world.music || !world.music.src || stageMusic) return;
    stageMusic = new Audio(world.music.src);
    stageMusic.loop = true;
    stageMusic.volume = clamp(Number(world.music.volume) || 0.6, 0, 1);
    const play = () => stageMusic && stageMusic.play().catch(() => {});
    play();
    // Browsers only allow sound after the reader has interacted with the page.
    ['pointerdown', 'keydown', 'touchstart'].forEach((type) => window.addEventListener(type, play, { once: true, signal: eventController.signal }));
  }
  function playLineSound(src) {
    if (lineSound) { lineSound.pause(); lineSound = null; }
    if (!src) return;
    lineSound = new Audio(src);
    lineSound.play().catch(() => {});
  }
  document.addEventListener('koobd:pause', () => { stageMusic?.pause(); lineSound?.pause(); }, { signal: eventController.signal });
  document.addEventListener('koobd:resume', () => { stageMusic?.play().catch(() => {}); }, { signal: eventController.signal });
  startMusic();

  function tick(now) {
    const elapsed = Math.min(.04, (now - lastTime) / 1000);
    lastTime = now;
    if (!dialogueOpen && !sceneTransitioning && !completed && !exitPromptOpen) {
      // Still handing back from a cutscene: no input moves CubeBot yet.
      if (controlsLockedUntil && (now < controlsLockedUntil || cameraHeldForPage)) {
        direction = 0;
        jumpBufferTimer = 0;
      }
      grounded = false;
      const maxSpeed = Math.max(1, Math.abs(velocityY), moveSpeed);
      const step = Math.min(elapsed, 0.6 / maxSpeed);
      let remaining = elapsed;
      while (remaining > 0.0001 && !sceneTransitioning) {
        const dt = Math.min(step, remaining);
        physicsStep(dt);
        if (sceneTransitioning || checkHazards()) break;
        if (!cutsceneHolding(now)) stepNpcs(dt);
        remaining -= dt;
      }
      // How long CubeBot has stood still-footed on solid ground: story moments
      // wait for it, so none ever begins with him floating or mid-fall.
      if (grounded && Math.abs(velocityY) < 0.01) {
        if (!groundedSince) groundedSince = now;
      } else {
        groundedSince = 0;
      }
      if (direction !== 0 && grounded) playerWalkAnimationTime += elapsed;
      else if (direction === 0) playerWalkAnimationTime = 0;
      updatePlayer();
      updateNpcs();
      updateCutscene(now);
      openNextStoryEventIfReady();
      if (!dialogueOpen && !completed && playerX >= WORLD_WIDTH - FINISH_MARGIN && !requiredEventsPending()) {
        finishStage({ type: 'next' });
      }
    } else if (!completed) {
      // Paused for dialogue or a page turn: every character holds one still
      // frame until gameplay resumes, when their animations pick up again.
      freezeActors();
    }
    if (completed) return;
    updateTalkMarkers();
    syncDecor();
    updateAreaTitle(now);
    updateCamera(elapsed);
    cullOffscreenDecor();
    frameId = requestAnimationFrame(tick);
  }

  function saveProgress(forceCompleted = false, force = false) {
    if (config.mode === 'preview' || !config.storyId) return;
    const now = performance.now();
    if (!forceCompleted && !force) {
      // Throttle: the world is continuous now, so persist position at a
      // coarse interval instead of on every movement tick.
      if (now - lastSaveAt < 3000 && Math.abs(playerX - lastSavedX) < 25) return;
    }
    lastSaveAt = now;
    lastSavedX = playerX;
    const storyPageCount = Math.max(1, Number(config.storyPageCount) || 1);
    const pageProgress = clamp(playerX / WORLD_WIDTH, 0, 1);
    const progress = Math.max(1, Math.min(100, Math.round(
      ((Number(config.storyPageIndex) || 0) + (forceCompleted || completed ? 1 : pageProgress))
      / storyPageCount * 100
    )));
    // With checkpoints, a resumed story starts at the last one reached: a safe
    // spot before the obstacle ahead, never mid-jump or inside a gap.
    const resumeX = checkpoints.length && activeStoryScene ? respawnPoint() : playerX;
    const payload = {
      storyId: config.storyId,
      title: config.title || 'Platformer story',
      progress,
      progressContext,
      updatedAt: Date.now(),
      state: {
        platformer: true,
        currentPage: Math.max(0, storyScenes.findIndex((scene) => scene.id === activeStoryScene?.id)),
        currentElement: 0,
        playerX: Math.round(resumeX),
        storyEventIndex,
        storySceneId: activeStoryScene?.id || null
      }
    };
    // The home page's "last read" card (Continue / Start over) reads this,
    // exactly as it does for The Hare and the Tortoise.
    if (config.userId && progressContext === 'global') {
      try {
        window.localStorage.setItem(`koobd-last-read:${config.userId}`, JSON.stringify(payload));
      } catch (error) {
        // Storage can be unavailable; the server copy still resumes the story.
      }
    }
    fetch('save_story_progress.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify(payload)
    }).catch(() => {});
  }

  function navigateProgressTo(ratio) {
    // The progress bar can never jump out of the current scene: the camera
    // and backgrounds are clamped to the scene, so skipping ahead would land
    // the player in unpainted space.
    const progressBounds = scenePlayerBounds();
    const targetX = clamp(ratio * WORLD_WIDTH, progressBounds.min + 4, Math.max(progressBounds.min + 4, progressBounds.max - 8));
    const interactionGate = nextInteractionGateX();
    playerX = clamp(targetX, playerHalfWidth + 0.5, Math.min(WORLD_WIDTH - playerHalfWidth - 0.5, interactionGate));
    direction = 0;
    if (playerX < WORLD_WIDTH - FINISH_MARGIN) completed = false;
    cameraX = clamp(playerX - (lastDirection < 0 ? CAMERA_ANCHOR_BACKWARD : CAMERA_ANCHOR_FORWARD), 0, MAX_CAMERA);
    manualCamera = true;
    updatePlayer();
    applyCamera();
  }

  if (progressBar && allowProgressNavigation) {
    const updateFromPointer = (event) => {
      const rect = progressBar.getBoundingClientRect();
      if (rect.width <= 0) return;
      navigateProgressTo(clamp((event.clientX - rect.left) / rect.width, 0, 1));
    };
    progressBar.addEventListener('pointerdown', (event) => {
      if (dialogueOpen) return;
      event.preventDefault();
      progressBar.setPointerCapture(event.pointerId);
      updateFromPointer(event);
    }, { signal: eventController.signal });
    progressBar.addEventListener('pointermove', (event) => {
      if (progressBar.hasPointerCapture(event.pointerId)) updateFromPointer(event);
    }, { signal: eventController.signal });
    const finishProgressNavigation = (event) => {
      if (!progressBar.hasPointerCapture(event.pointerId)) return;
      progressBar.releasePointerCapture(event.pointerId);
      manualCamera = false;
      saveProgress();
    };
    progressBar.addEventListener('pointerup', finishProgressNavigation, { signal: eventController.signal });
    progressBar.addEventListener('pointercancel', finishProgressNavigation, { signal: eventController.signal });
    progressBar.addEventListener('keydown', (event) => {
      if (dialogueOpen || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const current = playerX / WORLD_WIDTH;
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? 1
          : current + (event.key === 'ArrowRight' ? 0.01 : -0.01);
      navigateProgressTo(clamp(next, 0, 1));
      manualCamera = false;
      saveProgress();
    }, { signal: eventController.signal });
  }

  // Touch controls. Every finger is tracked on its own, so holding Left or
  // Right with one thumb while tapping Jump with the other works (phones send
  // no "click" for a second finger, so Jump fires on touch-down), a finger can
  // slide from Left to Right without lifting, and a long press never turns
  // into text selection or a context menu. A mouse works the same way.
  const movePointers = new Map(); // pointerId -> -1 | 1
  let ignoreDialogueClickUntil = 0;
  const moveButtons = [leftButton, rightButton].filter(Boolean);
  const canMove = () => !dialogueOpen && !sceneTransitioning && !exitPromptOpen && !cutscene;
  let touchDirection = 0;

  function directionAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    if (!hit) return 0;
    if (leftButton && leftButton.contains(hit)) return -1;
    if (rightButton && rightButton.contains(hit)) return 1;
    return 0;
  }

  function syncTouchDirection() {
    // The most recent finger still on a button decides the way.
    const held = Array.from(movePointers.values()).filter(Boolean);
    const next = held.length ? held[held.length - 1] : 0;
    leftButton?.classList.toggle('is-pressed', held.includes(-1));
    rightButton?.classList.toggle('is-pressed', held.includes(1));
    if (next !== touchDirection) {
      // Only take over the direction the touch controls set themselves, so
      // the keyboard keeps working alongside them.
      if (next) {
        if (canMove()) direction = next;
      } else if (direction === touchDirection) {
        direction = 0;
      }
      touchDirection = next;
    } else if (next && canMove() && direction !== next) {
      direction = next;
    }
  }

  moveButtons.forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      // Let the finger's later moves be tested against whatever is under it.
      if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
      movePointers.delete(event.pointerId);
      movePointers.set(event.pointerId, button === leftButton ? -1 : 1);
      syncTouchDirection();
    }, { signal: eventController.signal });
  });
  window.addEventListener('pointermove', (event) => {
    if (!movePointers.has(event.pointerId)) return;
    const next = directionAt(event.clientX, event.clientY);
    if (next !== movePointers.get(event.pointerId)) {
      movePointers.set(event.pointerId, next);
      syncTouchDirection();
    }
  }, { signal: eventController.signal });
  const releasePointer = (event) => {
    if (!movePointers.has(event.pointerId)) return;
    movePointers.delete(event.pointerId);
    syncTouchDirection();
  };
  window.addEventListener('pointerup', releasePointer, { signal: eventController.signal });
  window.addEventListener('pointercancel', releasePointer, { signal: eventController.signal });
  window.addEventListener('blur', () => { movePointers.clear(); syncTouchDirection(); }, { signal: eventController.signal });

  // Jump and Talk act the moment a finger lands; the keyboard (Enter / Space
  // on a focused button) still goes through "click".
  function bindTap(button, action) {
    if (!button) return;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.classList.add('is-pressed');
      // The same tap's trailing click must not also advance a conversation
      // this tap just opened.
      ignoreDialogueClickUntil = performance.now() + 450;
      action();
    }, { signal: eventController.signal });
    const release = () => button.classList.remove('is-pressed');
    button.addEventListener('pointerup', release, { signal: eventController.signal });
    button.addEventListener('pointercancel', release, { signal: eventController.signal });
    button.addEventListener('pointerleave', release, { signal: eventController.signal });
    button.addEventListener('click', (event) => {
      if (event.detail === 0) action(); // keyboard activation only
    }, { signal: eventController.signal });
  }

  // No long-press menus or selection on the controls.
  const controlsPanel = document.querySelector('.platformer-story-controls');
  controlsPanel?.addEventListener('contextmenu', (event) => event.preventDefault(), { signal: eventController.signal });

  // Idle controls. On a PC the on-screen buttons fade right out after 5
  // seconds without control input (keyboard keeps working); on a phone or
  // tablet they only dim, slowly, and stay visible and touchable. Any control
  // input - a key, a button, the mouse over the buttons - brings them back at
  // once. Nothing here ever turns their pointer events off.
  const PC_IDLE_MS = 5000;
  const TOUCH_IDLE_MS = 3000;
  const primaryTouch = window.matchMedia('(pointer: coarse)');
  let touchControlsMode = primaryTouch.matches;
  let lastControlInput = performance.now();
  let controlsIdle = false;
  let chatWasShown = false;

  function applyControlsMode() {
    controlsPanel?.classList.toggle('is-touch-mode', touchControlsMode);
    controlsPanel?.classList.toggle('is-pc-mode', !touchControlsMode);
  }
  function wakeControls() {
    lastControlInput = performance.now();
    if (controlsIdle) {
      controlsIdle = false;
      controlsPanel?.classList.remove('is-idle');
    }
  }
  function checkControlsIdle() {
    if (!controlsPanel || controlsIdle) return;
    const busy = direction !== 0 || movePointers.size > 0;
    if (busy) {
      lastControlInput = performance.now();
      return;
    }
    if (performance.now() - lastControlInput >= (touchControlsMode ? TOUCH_IDLE_MS : PC_IDLE_MS)) {
      controlsIdle = true;
      controlsPanel.classList.add('is-idle');
    }
  }
  applyControlsMode();
  primaryTouch.addEventListener?.('change', () => { touchControlsMode = primaryTouch.matches; applyControlsMode(); });
  // Any press on the controls wakes them (and a finger means touch mode).
  controlsPanel?.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' && !touchControlsMode) {
      touchControlsMode = true;
      applyControlsMode();
    }
    wakeControls();
  }, { capture: true, signal: eventController.signal });
  controlsPanel?.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse') wakeControls();
  }, { signal: eventController.signal });
  const CONTROL_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'a', 'A', 'd', 'D', 'w', 'W', ' ', 'e', 'E'];
  window.addEventListener('keydown', (event) => {
    if (CONTROL_KEYS.includes(event.key)) wakeControls();
  }, { signal: eventController.signal });
  window.addEventListener('keyup', (event) => {
    if (CONTROL_KEYS.includes(event.key)) wakeControls();
  }, { signal: eventController.signal });
  const idleTimer = window.setInterval(() => {
    // A character to talk to just came near: show the Talk button clearly.
    const chatShown = Boolean(chatButton && !chatButton.classList.contains('hidden'));
    if (chatShown && !chatWasShown) wakeControls();
    chatWasShown = chatShown;
    checkControlsIdle();
  }, 250);
  eventController.signal.addEventListener('abort', () => window.clearInterval(idleTimer));

  // No drag-to-pan during gameplay: the camera stays player-followed. Screen
  // dragging for scene building is editor-only (teacher-story-editor.js).

  // Pausing. Whatever opens KoobD's shared pause page (KoobdStory in
  // js/story-shared.js) tells the document "koobd:pause" / "koobd:resume";
  // the world holds still in between, whichever page the engine is on.
  document.addEventListener('koobd:pause', () => {
    exitPromptOpen = true;
    direction = 0;
    movePointers.clear?.();
  }, { signal: eventController.signal });
  document.addEventListener('koobd:resume', () => {
    exitPromptOpen = false;
    lastTime = performance.now();
  }, { signal: eventController.signal });

  // A story with its own exit button (config.confirmExit) opens the pause
  // page from it: Continue, Restart (config.restartUrl, or the page afresh),
  // or Home - leaving saves progress (at the last checkpoint reached) and
  // exits through the shared story-reading helper, so Continue on the home
  // page resumes from there.
  const exitButton = config.confirmExit ? document.getElementById('backHomeBtn') : null;
  if (exitButton && window.KoobdStory) {
    const pause = window.KoobdStory.createPauseScreen({
      onRestart: () => { window.location.href = config.restartUrl || window.location.href; },
      onHome: () => {
        saveProgress(completed, true);
        const home = config.exitUrl || 'home.php';
        if (window.storyReadingMode && typeof window.storyReadingMode.exitToMain === 'function') {
          window.storyReadingMode.exitToMain(home);
        } else {
          window.location.href = home;
        }
      },
    });
    exitButton.addEventListener('click', (event) => {
      event.stopPropagation();
      pause.open();
    }, { signal: eventController.signal });
    eventController.signal.addEventListener('abort', () => pause.element.remove());
  }

  bindTap(jumpButton, jump);
  bindTap(chatButton, () => { if (playerLanded()) openDialogue(activeNpc); });
  dialogue?.addEventListener('click', (event) => {
    if (performance.now() < ignoreDialogueClickUntil) return;
    if (event.target.closest('.choice-btn')) return;
    if (dialogueChoices && dialogueChoices.childElementCount) return;
    advanceDialogue();
  }, { signal: eventController.signal });

  window.addEventListener('keydown', (event) => {
    if (debugHitboxes && event.key.toLowerCase() === 'h' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      setHitboxesVisible(!hitboxesVisible);
      return;
    }
    if (exitPromptOpen || cutscene) return;
    if (dialogueOpen || sceneTransitioning) {
      if (event.key === 'Enter' && (!dialogueChoices || !dialogueChoices.childElementCount)) advanceDialogue();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') direction = -1;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') direction = 1;
    if (event.key === ' ' || event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') { event.preventDefault(); jump(); }
    if ((event.key === 'e' || event.key === 'Enter') && activeNpc && !dialogueOpen && playerLanded()) openDialogue(activeNpc);
  }, { signal: eventController.signal });
  window.addEventListener('keyup', (event) => {
    if (['ArrowLeft', 'a', 'A', 'ArrowRight', 'd', 'D'].includes(event.key)) direction = 0;
  }, { signal: eventController.signal });
  window.addEventListener('beforeunload', () => { if (frameId) cancelAnimationFrame(frameId); }, { signal: eventController.signal });

  // The opening event is usually a title. Cover the stage before the world is
  // first painted so the player never sees gameplay before the title card.
  const opensWithTitle = storyEventIndex === 0
    && (storyEvents[0]?.turns || []).some((turn) => turn.type === 'title');
  if (!opensWithTitle) stage.classList.remove('is-title-intro');

  renderWorld(true);
  if (opensWithTitle) {
    // The story opens on its title at once - not when the player first walks
    // to the opening event - so the title card is a live conversation from
    // the first frame and Enter or a click moves on, like any dialogue.
    // (The page may already be black from the server; only the text fades in.)
    openDialogue(storyConversation(storyEvents[0], 0));
  }
  window.addEventListener('pageshow', (event) => {
    if (!isPreview || !event.persisted) return;
    direction = 0;
    lastDirection = 1;
    velocityY = 0;
    grounded = false;
    completed = false;
    manualCamera = false;
    cameraSnapped = false;
    lastTime = performance.now();
    renderWorld(true);
  }, { signal: eventController.signal });
  // Keep hitboxes and rotated-block geometry in sync with the stage size
  // (NPC label offsets and feet-alignment shifts are px-based and re-measure
  // with the nodes), and re-measure once the character sprite has actually
  // loaded (its natural aspect ratio determines the visible hitbox size).
  window.addEventListener('resize', () => { measureStage(); computePlayerSize(); renderNpcs(); }, { signal: eventController.signal });
  // The stage can also change size without the window doing so (full screen,
  // the browser's toolbars, a rotated tablet): its size is measured again then.
  if (window.ResizeObserver) {
    const stageObserver = new ResizeObserver(() => measureStage());
    stageObserver.observe(stage);
    eventController.signal.addEventListener('abort', () => stageObserver.disconnect());
  }
  const playerImg = player.tagName === 'IMG' ? player : player.querySelector('img');
  if (playerImg && !playerImg.complete) playerImg.addEventListener('load', computePlayerSize, { signal: eventController.signal });
  Promise.all(platformImageLoads.values()).then(() => {
    if (eventController.signal.aborted) return;
    lastTime = performance.now();
    frameId = requestAnimationFrame(tick);
  });
  return () => {
    eventController.abort();
    if (stageMusic) { stageMusic.pause(); stageMusic = null; }
    if (lineSound) { lineSound.pause(); lineSound = null; }
    setCardVideo('');
    if (frameId) cancelAnimationFrame(frameId);
    stopChoiceTimer();
    window.clearTimeout(dialogueTextTimer);
    direction = 0;
    if (dialogue) dialogue.classList.add('hidden');
    if (dialogue) dialogue.setAttribute('aria-hidden', 'true');
    completed = true;
    platformImageParts.clear();
    platformImageLoads.clear();
    hitboxSvg.remove();
    hitboxToggle.remove();
  };
  };
})();
