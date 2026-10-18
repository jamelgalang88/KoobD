// The story editor: the pages of a teacher's story, in order, each either a
// Story Mode page (a picture with characters and lines, plus choices) or a
// Platform Mode page (a stage the reader plays through; edited by
// js/platform-editor.js). It also keeps where each page leads (the next page,
// a chosen page or the end), the Story Map of all those links, the story's
// text style, undo, and saving.
(function () {
  'use strict';

  const config = window.KOOBD_STORY_EDITOR || {};
  const UI = window.KoobdEditorUI;
  const RT = window.KoobdRichText;
  const LIB = window.KoobdPlatformLibrary;
  const PE = window.KoobdPlatformEditor;
  const { el } = UI;
  const $ = (id) => document.getElementById(id);

  const form = $('teacherStoryEditorForm');
  if (!form) return;
  const pagesPayloadInput = $('pagesPayload');
  const settingsPayloadInput = $('settingsPayload');
  const previewPageInput = $('previewPage');
  const submitActionInput = $('submitAction');
  const storyModePayload = $('storyModePayload');
  const storyTitleInput = $('storyTitleInput');
  const headingTitle = document.querySelector('.story-builder-heading h1');
  const storyBuilderLayout = $('storyBuilderLayout');
  const storyBuilderSidebar = $('storyBuilderSidebar');
  const toggleStorySidebarBtn = $('toggleStorySidebarBtn');
  const showStorySidebarBtn = $('showStorySidebarBtn');
  const assetsHeading = $('assetsHeading');
  const storyAssetGrid = $('storyAssetGrid');
  const backgroundColorInput = $('backgroundColorInput');
  const backgroundColorField = $('backgroundColorField');
  const characterTargetWrap = $('characterTargetWrap');
  const pageChipList = $('pageChipList');
  const previousPageBtn = $('previousPageBtn');
  const nextPageBtn = $('nextPageBtn');
  const addPageBtn = $('addPageBtn');
  const storyMapBtn = $('storyMapBtn');
  const contentElementList = $('contentElementList');
  const pageSummaryText = $('pageSummaryText');
  const pageFlowRoot = $('pageFlowRoot');
  const pageTypeModal = $('platformerPageTypeModal');
  const storyCanvas = $('storyCanvas');
  const storyCanvasView = $('storyCanvasView');
  const canvasBackground = $('canvasBackground');
  const canvasLeftCharacter = $('canvasLeftCharacter');
  const canvasRightCharacter = $('canvasRightCharacter');
  const canvasTitleCard = $('canvasTitleCard');
  const canvasTitleText = $('canvasTitleText');
  const canvasDialogueWrap = $('canvasDialogueWrap');
  const canvasPageText = $('canvasPageText');
  const canvasNameLeft = $('canvasNameLeft');
  const canvasNameRight = $('canvasNameRight');
  const canvasChoices = $('canvasChoices');
  const canvasZoomLevel = $('canvasZoomLevel');
  const editorExitModal = $('editorExitModal');
  const toastNode = $('editorToast');

  const backgrounds = Array.isArray(config.backgrounds) ? config.backgrounds : [];
  const characters = Array.isArray(config.characters) ? config.characters : [];
  const backgroundMap = new Map(backgrounds.map((item) => [item.id, item]));
  const characterMap = new Map(characters.map((item) => [item.id, item]));
  // A regular story is Story pages only; Platform pages belong to Platform Mode stories.
  const PLATFORM_STORY = config.storyMode === 'platformer';
  const defaultPageType = PLATFORM_STORY ? 'platformer' : 'normal';
  const voiceUploadEndpoint = String(config.voiceUploadEndpoint || 'teacher_upload_voiceover.php');
  const SIDEBAR_KEY = 'koobd-story-editor-sidebar-collapsed';
  const TRANSITIONS = ['none', 'fade-in', 'fade-out', 'fade-both'];
  const UNDO_LIMIT = 100;

  // --- Page model --------------------------------------------------------------
  function newKey(taken) {
    let key;
    do { key = `pg-${Math.random().toString(36).slice(2, 8)}`; } while (taken.has(key));
    return key;
  }

  function normalizeGoto(goto, types) {
    const type = goto && types.includes(goto.type) ? goto.type : types[0];
    if (type === 'page') return goto.page ? { type, page: String(goto.page) } : { type: types[0] };
    if (type === 'end') return { type, label: String(goto.label || '') };
    return { type };
  }

  function normalizeElement(element) {
    if (!element || !['title', 'narration', 'dialogue', 'choices'].includes(element.type)) return null;
    // `rich`: the line's formatting (js/rich-text.js); '' when it has none.
    const base = { id: element.id || UI.makeId('element'), type: element.type, text: String(element.text || ''), rich: String(element.rich || '') };
    if (element.type === 'choices') {
      const choices = (Array.isArray(element.choices) ? element.choices : []).slice(0, 4)
        .map((choice) => ({ text: String(choice.text || ''), goto: normalizeGoto(choice.goto, ['continue', 'page', 'end']) }));
      while (choices.length < 2) choices.push({ text: '', goto: { type: 'continue' } });
      return { ...base, choices };
    }
    const voiceOverUrl = String(element.voiceOverUrl || '');
    return {
      ...base,
      speaker: element.type === 'dialogue' ? String(element.speaker || '') : '',
      side: element.type === 'dialogue' && element.side === 'right' ? 'right' : (element.type === 'dialogue' ? 'left' : ''),
      voiceOverEnabled: Boolean(element.voiceOverEnabled),
      voiceOverUrl: voiceOverUrl.startsWith('data:') ? '' : voiceOverUrl,
      voiceOverName: String(element.voiceOverName || ''),
      ...(element.type === 'title' ? { font: String(element.font || ''), size: String(element.size || '') } : {})
    };
  }

  // The fonts a title can use ('' = the story's own font).
  const titleFontOptions = () => [['', 'Story font'], ...LIB.fonts.filter((font) => font.id !== 'default').map((font) => [font.id, font.label]), ['default', 'KoobD (default)']];
  const fontStack = (id) => ((id && LIB.get('fonts', id)) || {}).stack || '';
  function titleFontSelect(current, onChange) {
    const select = UI.select(titleFontOptions(), current || '', onChange);
    select.classList.add('title-font-select');
    select.setAttribute('aria-label', 'Title font');
    select.title = 'Title font';
    Array.from(select.options).forEach((option) => { option.style.fontFamily = fontStack(option.value); });
    select.style.fontFamily = fontStack(current);
    return select;
  }
  // The sizes a title can be ('' = the normal size).
  function titleSizeSelect(current, onChange) {
    const select = UI.select([['', 'Normal size'], ...LIB.titleSizes.map((size) => [size.id, size.label])], current || '', onChange);
    select.classList.add('title-font-select', 'title-size-select');
    select.setAttribute('aria-label', 'Title size');
    select.title = 'Title size';
    return select;
  }

  function normalizePage(page, index, taken) {
    let key = String(page.key || '');
    if (!key || taken.has(key)) key = newKey(taken);
    taken.add(key);
    const pageType = !PLATFORM_STORY ? 'normal' : (['normal', 'platformer'].includes(page.pageType) ? page.pageType : defaultPageType);
    const clean = {
      id: page.id || `page-${index + 1}`,
      key,
      next: normalizeGoto(page.next, ['next', 'page', 'end']),
      pageTitle: page.pageTitle || `Page ${index + 1}`,
      stageName: String(page.stageName || ''),
      stageSubtitle: String(page.stageSubtitle || ''),
      pageType,
      transition: TRANSITIONS.includes(page.transition) ? page.transition : 'none',
      background: page.background || '',
      backgroundAsset: String(page.backgroundAsset || ''),
      backgroundColor: page.backgroundColor || '#ffffff',
      leftCharacter: page.leftCharacter || '',
      rightCharacter: page.rightCharacter || '',
      // A library or uploaded picture for a side, or a library scene, instead
      // of the built-in profile characters and backgrounds.
      leftCharacterAsset: String(page.leftCharacterAsset || ''),
      rightCharacterAsset: String(page.rightCharacterAsset || ''),
      backgroundLibrary: String(page.backgroundLibrary || ''),
      elements: (Array.isArray(page.elements) ? page.elements : []).map(normalizeElement).filter(Boolean),
      platformer: PLATFORM_STORY ? page.platformer || null : null
    };
    if (pageType === 'platformer') PE.normalizeScene(clean, backgrounds);
    return clean;
  }

  function blankPage(pageType) {
    return normalizePage({ pageType, platformer: pageType === 'platformer' ? PE.newScene() : null }, state.pages.length, new Set(state.pages.map((page) => page.key)));
  }

  const state = {
    pages: [],
    current: 0,
    currentElement: 0,
    assetTab: 'characters',
    characterSlot: 'auto',
    zoom: 1,
    // How far the zoomed canvas is moved (pixels), from pinching or Ctrl + scroll.
    panX: 0,
    panY: 0,
    settings: { font: 'default', textSize: 'medium', ...(config.settings || {}) }
  };
  {
    const taken = new Set();
    const source = Array.isArray(config.pages) && config.pages.length ? config.pages : [{ pageType: defaultPageType }];
    state.pages = source.map((page, index) => normalizePage(page, index, taken));
  }

  const currentPage = () => state.pages[state.current];
  const isPlatform = (page = currentPage()) => page && page.pageType === 'platformer';

  function firstText(page) {
    if (isPlatform(page)) {
      const beat = (page.platformer.events || []).flatMap((event) => event.beats || []).find((item) => String(item.text || '').trim());
      return beat ? beat.text.trim() : '';
    }
    const element = page.elements.find((item) => String(item.text || '').trim());
    return element ? element.text.trim() : '';
  }
  function pageLabel(page, index) {
    const name = page.stageName.trim() || firstText(page) || (isPlatform(page) ? 'Platform page' : 'Story page');
    return `${index + 1}. ${name.length > 38 ? `${name.slice(0, 36)}…` : name}`;
  }
  const pageOptions = () => state.pages.map((page, index) => ({ key: page.key, label: pageLabel(page, index) }));

  // --- Saving and undo --------------------------------------------------------
  const undoStack = [];
  let lastSnapshot = null;
  let restoring = false;

  let storyMap = null;
  function serialize() {
    const snapshot = JSON.stringify(state.pages.map((page, displayOrder) => ({ ...page, displayOrder })));
    if (!restoring && lastSnapshot !== null && snapshot !== lastSnapshot) {
      undoStack.push(lastSnapshot);
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    }
    lastSnapshot = snapshot;
    pagesPayloadInput.value = snapshot;
    settingsPayloadInput.value = JSON.stringify(state.settings);
    storyModePayload.value = PLATFORM_STORY ? 'platformer' : 'regular';
    if (storyMap) storyMap.update();
  }

  function undo() {
    const previous = undoStack.pop();
    if (!previous) return false;
    restoring = true;
    try {
      state.pages = JSON.parse(previous);
      state.current = Math.min(state.current, state.pages.length - 1);
      lastSnapshot = previous;
      renderAll({ keepView: true });
    } finally {
      restoring = false;
    }
    toast('Undone.');
    return true;
  }

  function submitStory(action, previewKey = '') {
    submitActionInput.value = action;
    previewPageInput.value = previewKey;
    $('currentPage').value = currentPage().key;
    serialize();
    form.submit();
  }

  let toastTimer = null;
  function toast(message) {
    if (!toastNode) return;
    toastNode.textContent = message;
    toastNode.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastNode.classList.remove('is-visible'), 2600);
  }

  // --- Platform Mode editor ------------------------------------------------------
  let chipTimer = null;
  const platformEditor = PLATFORM_STORY ? PE.create({
    stageRoot: $('platformStageRoot'),
    inspectorRoot: $('platformInspectorRoot'),
    libraryRoot: $('platformLibraryRoot'),
    playerAsset: config.playerAsset || 'assets/images/characters/CUBEBOT.png',
    legacyBackgrounds: backgrounds,
    getPages: pageOptions,
    onChange() {
      serialize();
      clearTimeout(chipTimer);
      chipTimer = setTimeout(renderPageChips, 300);
    },
    onTest: () => submitStory('preview', currentPage().key),
    notify: toast,
    onRevealInspector() {
      const root = $('platformInspectorRoot');
      const rect = root.getBoundingClientRect();
      if (rect.top > window.innerHeight - 80) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    onRevealLibrary() {
      toggleSidebar(false);
      $('platformLibraryRoot').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }) : null;

  // --- Story Mode canvas -----------------------------------------------------------
  // The title and the text box on the canvas can be written in (and formatted)
  // where they are; the part's text box below shows the same words.
  const canvasTextEdit = RT.attach(canvasPageText);
  const canvasTitleEdit = RT.attach(canvasTitleText);
  const partEditors = new Map(); // part id -> its text box below the canvas
  function bindCanvasText(edit, element, placeholder) {
    edit.bind({
      rich: element.rich, text: element.text, placeholder, label: 'Text on the canvas',
      singleLine: element.type === 'title', maxLength: element.type === 'title' ? 120 : 600,
      onChange(rich, plain) {
        element.rich = rich;
        element.text = plain;
        const box = partEditors.get(element.id);
        if (box) box.load(rich, plain);
        changed({ quiet: true });
      }
    });
  }
  // A Story page's background: a library scene (layers, front to back), a
  // picture, or one of the built-in backgrounds.
  function storyBackground(page) {
    const scene = page.backgroundLibrary ? LIB.get('backgrounds', page.backgroundLibrary) : null;
    if (scene) return { color: scene.color, layers: scene.layers.map((layer) => LIB.url(layer)), scene: true };
    const background = backgroundMap.get(page.background);
    const image = page.backgroundAsset ? LIB.url(page.backgroundAsset) : (background && background.asset);
    return { color: page.backgroundColor || '#ffffff', layers: image ? [image] : [], scene: false };
  }
  // The picture on one side of a Story page: a library or uploaded picture, or a profile character.
  function sideCharacter(page, side) {
    const asset = page[`${side}CharacterAsset`];
    if (asset) return { src: LIB.url(asset), label: (LIB.characters.find((item) => item.portrait === asset) || {}).label || 'Character' };
    const character = characterMap.get(page[`${side}Character`]);
    return character ? { src: character.asset, label: character.label } : null;
  }
  function paintBackground(node, page) {
    const bg = storyBackground(page);
    node.style.backgroundColor = bg.color;
    node.style.backgroundImage = bg.layers.map((layer) => `url('${layer}')`).join(',');
    node.style.backgroundSize = bg.scene ? bg.layers.map(() => 'cover').join(',') : '';
    node.style.backgroundPosition = bg.scene ? bg.layers.map(() => 'center bottom').join(',') : '';
    node.style.imageRendering = bg.scene ? 'pixelated' : ''; // library scenes are pixel art
  }

  function setCharacterNode(target, page, side, active) {
    const character = sideCharacter(page, side);
    target.replaceChildren();
    target.classList.toggle('active-left', active === 'left');
    target.classList.toggle('active-right', active === 'right');
    if (!character && state.pickedSide === side) state.pickedSide = null;
    target.classList.toggle('has-character', Boolean(character));
    target.classList.toggle('is-picked', Boolean(character) && state.pickedSide === side);
    target.title = character ? 'Click to select (Delete removes it), or drag to the other side' : '';
    if (character) target.appendChild(el('img', { src: character.src, alt: character.label }));
  }

  // Clicking a character on the canvas selects it; Delete removes it.
  function pickSide(side) {
    state.pickedSide = side;
    [[canvasLeftCharacter, 'left'], [canvasRightCharacter, 'right']].forEach(([node, nodeSide]) => {
      node.classList.toggle('is-picked', side === nodeSide && node.classList.contains('has-character'));
    });
  }
  function removePickedCharacter() {
    const side = state.pickedSide;
    if (!side || isPlatform()) return false;
    const page = currentPage();
    if (!sideCharacter(page, side)) return false;
    page[`${side}Character`] = '';
    page[`${side}CharacterAsset`] = '';
    state.pickedSide = null;
    changed();
    toast('Character removed.');
    return true;
  }

  function renderStoryCanvas() {
    const page = currentPage();
    const element = page.elements[state.currentElement] || null;
    paintBackground(canvasBackground, page);
    backgroundColorInput.value = page.backgroundColor || '#ffffff';
    const activeSide = element && element.type === 'dialogue' ? element.side : '';
    setCharacterNode(canvasLeftCharacter, page, 'left', activeSide === 'left' ? 'left' : '');
    setCharacterNode(canvasRightCharacter, page, 'right', activeSide === 'right' ? 'right' : '');
    canvasLeftCharacter.parentElement.classList.toggle('is-narrating', !(element && element.type === 'dialogue'));
    canvasNameLeft.textContent = '';
    canvasNameRight.textContent = '';
    canvasNameLeft.classList.remove('active');
    canvasNameRight.classList.remove('active');
    canvasNameLeft.parentElement.classList.add('hidden');
    canvasTitleCard.classList.add('hidden');
    canvasDialogueWrap.classList.remove('hidden');
    canvasPageText.classList.remove('story-builder-canvas-text-narration');
    canvasChoices.replaceChildren();
    applyTextStyle(storyCanvas);

    if (!element) {
      canvasDialogueWrap.classList.add('hidden');
      pageSummaryText.textContent = `Page ${state.current + 1} of ${state.pages.length} is empty. Add a title, narration, dialogue or a choice below.`;
      return;
    }
    if (element.type === 'title') {
      canvasTitleCard.classList.remove('hidden');
      canvasDialogueWrap.classList.add('hidden');
      bindCanvasText(canvasTitleEdit, element, 'Untitled screen');
      canvasTitleText.style.fontFamily = fontStack(element.font);
      if (element.size) canvasTitleText.dataset.titleSize = element.size; else delete canvasTitleText.dataset.titleSize;
    } else if (element.type === 'narration') {
      bindCanvasText(canvasTextEdit, element, 'Add narration for this page.');
      canvasPageText.classList.add('story-builder-canvas-text-narration');
    } else if (element.type === 'choices') {
      bindCanvasText(canvasTextEdit, element, 'What will the reader choose?');
      canvasPageText.classList.add('story-builder-canvas-text-narration');
      element.choices.forEach((choice, index) => canvasChoices.appendChild(el('span', { class: 'story-canvas-choice', translate: choice.text ? 'no' : null, text: choice.text || `Answer ${String.fromCharCode(65 + index)}` })));
    } else {
      canvasNameLeft.parentElement.classList.remove('hidden');
      const nameNode = element.side === 'right' ? canvasNameRight : canvasNameLeft;
      nameNode.textContent = element.speaker || 'Character';
      nameNode.classList.add('active');
      bindCanvasText(canvasTextEdit, element, 'Add dialogue text for this character.');
    }
    pageSummaryText.textContent = `Page ${state.current + 1} of ${state.pages.length} · showing part ${state.currentElement + 1} of ${page.elements.length}. Click “Preview” on a part to show it here.`;
  }

  // --- Canvas zoom ------------------------------------------------------------------
  // The canvas view is scaled around its centre and can be moved (panX/panY)
  // while zoomed in; it never moves so far that its edge leaves the canvas,
  // and at 100% or less it is always centred, so the page is never lost.
  const CANVAS_MIN_ZOOM = 0.5;
  const CANVAS_MAX_ZOOM = 3;
  function clampCanvasPan() {
    const width = storyCanvas.clientWidth;
    const height = storyCanvas.clientHeight;
    const maxX = Math.max(0, (state.zoom - 1) * width / 2);
    const maxY = Math.max(0, (state.zoom - 1) * height / 2);
    state.panX = Math.max(-maxX, Math.min(maxX, state.panX));
    state.panY = Math.max(-maxY, Math.min(maxY, state.panY));
  }
  function applyCanvasZoom() {
    clampCanvasPan();
    storyCanvasView.style.transform = `translate(${state.panX.toFixed(1)}px, ${state.panY.toFixed(1)}px) scale(${state.zoom.toFixed(3)})`;
    canvasZoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
  }
  // `focus` (screen x, y): the point that stays put while zooming - the
  // fingers of a pinch or the mouse pointer. Without it, the canvas centre.
  function setZoom(zoom, focus = null, round = true) {
    const before = state.zoom;
    const next = Math.max(CANVAS_MIN_ZOOM, Math.min(CANVAS_MAX_ZOOM, round ? Math.round(zoom * 10) / 10 : zoom));
    const rect = storyCanvas.getBoundingClientRect();
    const fx = focus ? focus.x - (rect.left + rect.width / 2) : 0;
    const fy = focus ? focus.y - (rect.top + rect.height / 2) : 0;
    // The canvas point under the focus stays under it.
    state.panX = fx - (fx - state.panX) * (next / before);
    state.panY = fy - (fy - state.panY) * (next / before);
    state.zoom = next;
    applyCanvasZoom();
  }

  // Two fingers on the canvas: pinch to zoom toward them, move them to pan.
  // One finger keeps working as before (picking, dragging a character across,
  // editing text); a pinch cancels whatever the first finger had started.
  const canvasTouches = new Map();
  const canvasIgnored = new Set();
  let canvasPinch = null;
  let canvasPinchHappened = false;
  let canvasPinchFrame = 0;
  const touchPair = () => Array.from(canvasTouches.values()).slice(0, 2);
  function startCanvasPinch() {
    const [a, b] = touchPair();
    const rect = storyCanvas.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - (rect.left + rect.width / 2);
    const my = (a.y + b.y) / 2 - (rect.top + rect.height / 2);
    canvasPinch = {
      distance: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
      zoom: state.zoom,
      // The canvas point between the fingers (in unzoomed canvas pixels).
      qx: (mx - state.panX) / state.zoom,
      qy: (my - state.panY) / state.zoom
    };
    canvasPinchHappened = true;
    // A frame still pending from an earlier pinch (e.g. a tab put away mid-pinch) is dropped.
    window.cancelAnimationFrame(canvasPinchFrame);
    canvasPinchFrame = 0;
    storyCanvasView.style.transition = 'none';
    // A character the first finger was dragging goes back to its place.
    storyCanvas.querySelectorAll('.is-dragging').forEach((node) => { node.classList.remove('is-dragging'); node.style.translate = ''; });
    storyCanvas.classList.remove('is-drop-left', 'is-drop-right');
  }
  function moveCanvasPinch() {
    canvasPinchFrame = 0;
    if (!canvasPinch || canvasTouches.size < 2) return;
    const [a, b] = touchPair();
    const rect = storyCanvas.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - (rect.left + rect.width / 2);
    const my = (a.y + b.y) / 2 - (rect.top + rect.height / 2);
    const zoom = Math.max(CANVAS_MIN_ZOOM, Math.min(CANVAS_MAX_ZOOM, canvasPinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / canvasPinch.distance)));
    state.zoom = zoom;
    state.panX = mx - canvasPinch.qx * zoom;
    state.panY = my - canvasPinch.qy * zoom;
    applyCanvasZoom();
  }
  storyCanvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    canvasTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (canvasTouches.size === 2) {
      event.preventDefault();
      event.stopImmediatePropagation();
      canvasTouches.forEach((touch, id) => canvasIgnored.add(id));
      startCanvasPinch();
    } else if (canvasTouches.size > 2) {
      event.stopImmediatePropagation();
      canvasIgnored.add(event.pointerId);
    }
  }, true);
  storyCanvas.addEventListener('pointermove', (event) => {
    if (!canvasTouches.has(event.pointerId)) return;
    canvasTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!canvasIgnored.has(event.pointerId)) return;
    // Pinch fingers (and a finger left down after a pinch) move nothing else.
    event.stopImmediatePropagation();
    if (canvasPinch && !canvasPinchFrame) canvasPinchFrame = window.requestAnimationFrame(moveCanvasPinch);
  }, true);
  const endCanvasTouch = (event) => {
    if (!canvasTouches.has(event.pointerId)) return;
    canvasTouches.delete(event.pointerId);
    canvasIgnored.delete(event.pointerId);
    if (canvasPinch && canvasTouches.size < 2) {
      canvasPinch = null;
      window.cancelAnimationFrame(canvasPinchFrame);
      canvasPinchFrame = 0;
      storyCanvasView.style.transition = '';
    }
    if (!canvasTouches.size) {
      // After the other listeners have seen this last lift.
      window.setTimeout(() => { canvasPinchHappened = false; }, 0);
    }
  };
  storyCanvas.addEventListener('pointerup', endCanvasTouch, true);
  storyCanvas.addEventListener('pointercancel', endCanvasTouch, true);
  // Ctrl + scroll (and a trackpad pinch) zoom toward the pointer.
  storyCanvas.addEventListener('wheel', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    storyCanvasView.style.transition = 'none';
    setZoom(state.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), { x: event.clientX, y: event.clientY }, false);
    window.clearTimeout(storyCanvas.wheelTimer);
    storyCanvas.wheelTimer = window.setTimeout(() => { storyCanvasView.style.transition = ''; }, 150);
  }, { passive: false });
  // A rotated tablet or full screen changes the canvas size: keep the page in view.
  window.addEventListener('resize', () => applyCanvasZoom());

  // --- Assets panel (Story Mode) -------------------------------------------------------
  // The Story Mode assets: KoobD's own characters and backgrounds, The False
  // Knight's (the same as the Platform Mode library), and the teacher's uploads.
  let assetsToken = 0;
  function renderAssets() {
    document.querySelectorAll('[data-editor-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.editorTab === state.assetTab));
    backgroundColorField.classList.toggle('hidden', state.assetTab !== 'backgrounds');
    characterTargetWrap.classList.toggle('hidden', state.assetTab !== 'characters');
    const page = currentPage();
    const forBackgrounds = state.assetTab === 'backgrounds';
    const token = ++assetsToken;

    const heading = (text) => el('h4', { class: 'story-asset-section', text });
    const tile = ({ label, selected, media, onClick, keepName }) => el('button', {
      type: 'button', class: `story-builder-asset ${forBackgrounds ? 'background' : 'character'}${selected ? ' is-selected' : ''}`,
      'aria-pressed': selected ? 'true' : 'false', title: label, on: { click: onClick }
    }, [media, el('span', { text: label, translate: keepName ? 'no' : null })]);
    const picture = (src) => el('div', { class: 'story-builder-asset-media' }, [el('img', { src, alt: '', loading: 'lazy' })]);
    const scene = (layers, color) => {
      const media = el('div', { class: 'story-builder-asset-media' });
      media.style.backgroundColor = color || '';
      media.style.backgroundImage = layers.map((layer) => `url('${layer}')`).join(',');
      media.style.backgroundSize = layers.map(() => 'cover').join(',');
      media.style.backgroundPosition = layers.map(() => 'center bottom').join(',');
      return media;
    };

    // Which side a character goes on: the chosen one, or the first empty side.
    const placeCharacter = (pick) => {
      const leftEmpty = !page.leftCharacter && !page.leftCharacterAsset;
      const side = state.characterSlot === 'left' || (state.characterSlot === 'auto' && leftEmpty) ? 'left' : 'right';
      page[`${side}Character`] = pick.id || '';
      page[`${side}CharacterAsset`] = pick.asset || '';
      changed();
    };
    const setBackground = (pick) => {
      const same = (pick.id && page.background === pick.id) || (pick.scene && page.backgroundLibrary === pick.scene) || (pick.asset && page.backgroundAsset === pick.asset);
      page.background = same ? '' : (pick.id || '');
      page.backgroundLibrary = same ? '' : (pick.scene || '');
      page.backgroundAsset = same ? '' : (pick.asset || '');
      changed();
    };
    const isOnPage = (pick) => (forBackgrounds
      ? (pick.id && page.background === pick.id) || (pick.scene && page.backgroundLibrary === pick.scene) || (pick.asset && page.backgroundAsset === pick.asset)
      : ['left', 'right'].some((side) => (pick.id && page[`${side}Character`] === pick.id) || (pick.asset && page[`${side}CharacterAsset`] === pick.asset)));
    const choose = forBackgrounds ? setBackground : placeCharacter;

    // The teacher's own uploads for this tab come first (newest first, each
    // with a bin), then KoobD's and The False Knight's.
    const section = forBackgrounds ? 'background' : 'character';
    const status = el('span', { class: 'pe-lib-status', role: 'status' });
    const uploadsList = el('div', { class: 'story-asset-uploads' }, [
      UI.uploadButton(forBackgrounds ? 'Upload a background' : 'Upload a character', 'image/png,image/jpeg,image/webp,image/gif',
        (item) => choose({ asset: item.url }), status, { section, aspect: forBackgrounds ? 16 / 9 : null }),
      status
    ]);
    const uploadsHeading = heading('My uploads');
    uploadsHeading.classList.add('is-uploads');
    const items = [uploadsHeading, uploadsList];
    if (forBackgrounds) {
      items.push(heading('KoobD'));
      backgrounds.forEach((item) => items.push(tile({ label: item.label, selected: isOnPage({ id: item.id }), media: scene([item.asset]), onClick: () => choose({ id: item.id }) })));
      items.push(heading('The False Knight'));
      LIB.backgrounds.forEach((item) => items.push(tile({ label: item.label, selected: isOnPage({ scene: item.id }), media: scene(item.layers.map((layer) => LIB.url(layer)), item.color), onClick: () => choose({ scene: item.id }) })));
    } else {
      items.push(heading('KoobD'));
      characters.forEach((item) => items.push(tile({ label: item.label, selected: isOnPage({ id: item.id }), media: picture(item.asset), keepName: true, onClick: () => choose({ id: item.id }) })));
      items.push(heading('The False Knight'));
      LIB.characters.filter((item) => item.animated).forEach((item) => items.push(tile({ label: item.label, selected: isOnPage({ asset: item.portrait }), media: picture(LIB.url(item.portrait)), keepName: true, onClick: () => choose({ asset: item.portrait }) })));
    }
    storyAssetGrid.replaceChildren(...items);
    filterAssets();

    UI.uploads.forSection(section).then((uploads) => {
      if (token !== assetsToken) return;
      // An uploaded asset: a tile (not a button, so its bin can sit inside it).
      const tiles = uploads.map((item) => {
        const node = el('div', {
          class: `story-builder-asset is-upload ${forBackgrounds ? 'background' : 'character'}${isOnPage({ asset: item.url }) ? ' is-selected' : ''}`,
          role: 'button', tabindex: '0', 'aria-pressed': isOnPage({ asset: item.url }) ? 'true' : 'false', title: item.name,
          on: {
            click: () => choose({ asset: item.url }),
            keydown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose({ asset: item.url }); } }
          }
        }, [
          forBackgrounds ? scene([LIB.url(item.url)]) : picture(LIB.url(item.url)),
          el('span', { text: item.name, translate: 'no' }),
          UI.deleteUploadButton(item)
        ]);
        return node;
      });
      uploadsList.after(...tiles);
      filterAssets();
    });
  }
  // Uploads added or deleted anywhere in the editor show here too.
  UI.uploads.onChange(() => { if (!isPlatform()) renderAssets(); });

  // Shows only the tiles whose name matches the search; a group with no
  // matches hides its heading too (the upload button always stays).
  const assetSearch = $('storyAssetSearch');
  function filterAssets() {
    const query = assetSearch.value.trim().toLowerCase();
    let heading = null;
    let shown = 0;
    const closeGroup = () => { if (heading) heading.classList.toggle('hidden', Boolean(query) && shown === 0 && !heading.classList.contains('is-uploads')); };
    Array.from(storyAssetGrid.children).forEach((node) => {
      if (node.classList.contains('story-asset-section')) {
        closeGroup();
        heading = node;
        shown = 0;
        return;
      }
      if (!node.classList.contains('story-builder-asset')) return;
      const match = !query || String(node.title || '').toLowerCase().includes(query);
      node.classList.toggle('hidden', !match);
      if (match) shown += 1;
    });
    closeGroup();
  }
  assetSearch.addEventListener('input', filterAssets);

  // --- Story Mode content list ------------------------------------------------------
  async function uploadVoiceOver(file) {
    const body = new FormData();
    body.append('voiceOver', file);
    const response = await fetch(voiceUploadEndpoint, { method: 'POST', body, credentials: 'same-origin' });
    let payload = null;
    try { payload = await response.json(); } catch (error) { payload = null; }
    if (!response.ok || !payload || !payload.success || !payload.url) throw new Error((payload && payload.message) || 'The voice-over upload failed.');
    return { url: String(payload.url), name: String(payload.name || file.name) };
  }

  const ELEMENT_LABELS = { title: 'Title', narration: 'Narration', dialogue: 'Dialogue', choices: 'Choice' };

  // The editor's popups (voice-over, page settings): redrawn after every change
  // so they always show the current values.
  let shellModal = null;
  function openShellModal(title, render, size = 'sm') {
    shellModal = UI.openModal({ title, size, render, onClose() { shellModal = null; renderPageSettings(); } });
    return shellModal;
  }

  function voicePopup(element) {
    const status = el('span', { class: 'story-builder-voiceover-status', text: element.voiceOverUrl ? `Selected: ${element.voiceOverName || 'Audio file'}` : 'No audio file' });
    const fileInput = el('input', { type: 'file', accept: 'audio/*', disabled: !element.voiceOverEnabled });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (file.size > 7 * 1024 * 1024) { status.textContent = 'Please choose an audio file smaller than 7 MB.'; fileInput.value = ''; return; }
      status.textContent = 'Uploading audio…';
      fileInput.disabled = true;
      try {
        const uploaded = await uploadVoiceOver(file);
        element.voiceOverUrl = uploaded.url;
        element.voiceOverName = uploaded.name;
        changed({ content: true });
      } catch (error) {
        status.textContent = error.message;
        fileInput.disabled = false;
      }
    });
    return el('div', { class: 'pe-popup' }, [
      UI.toggle('Play a voice over for this part', element.voiceOverEnabled, (value) => { element.voiceOverEnabled = value; changed({ content: true }); }),
      UI.field('Voice over audio file', el('div', { class: 'pe-popup' }, [fileInput, status]), { full: true }),
      element.voiceOverUrl ? el('audio', { controls: true, preload: 'none', src: element.voiceOverUrl, class: 'story-voice-preview' }) : null,
      el('div', { class: 'ed-modal-actions' }, [
        el('button', { type: 'button', class: 'ed-btn ed-btn-ghost ed-btn-small', text: 'Clear audio', disabled: !element.voiceOverUrl, on: { click() { element.voiceOverUrl = ''; element.voiceOverName = ''; changed({ content: true }); } } })
      ])
    ]);
  }

  function choicesEditor(element) {
    const wrap = el('div', { class: 'sc-editor' });
    element.choices.forEach((choice, index) => {
      wrap.appendChild(el('div', { class: 'sc-choice' }, [
        el('span', { class: 'pe-choice-num', text: String.fromCharCode(65 + index) }),
        UI.input(choice.text, (value) => { choice.text = value; changed({ canvasOnly: true }); }, { maxlength: 120, placeholder: 'Answer text' }),
        el('span', { class: 'sc-then', text: 'Then' }),
        UI.gotoEditor(choice.goto, {
          types: ['continue', 'page', 'end'], continueLabel: 'Carry on with this page',
          pages: pageOptions().filter((page) => page.key !== currentPage().key),
          onChange(goto) { choice.goto = goto; changed({ quiet: true }); }
        }),
        element.choices.length > 2 ? UI.iconButton('trash', 'Remove answer', () => { element.choices.splice(index, 1); changed({ content: true }); }, { class: 'is-danger' }) : el('span', { class: 'sc-spacer' })
      ]));
    });
    if (element.choices.length < 4) {
      wrap.appendChild(el('button', {
        type: 'button', class: 'ed-btn ed-btn-ghost ed-btn-small sc-add',
        title: '“Jump to a page” starts a branch. Readers can take each path; see them all in the Story Map.',
        on: { click() { element.choices.push({ text: '', goto: { type: 'continue' } }); changed({ content: true }); } }
      }, [UI.icon('plus'), el('span', { text: 'Add an answer' })]));
    }
    return wrap;
  }

  function renderContentList() {
    const page = currentPage();
    contentElementList.replaceChildren();
    partEditors.clear();
    if (!page.elements.length) {
      contentElementList.appendChild(el('div', { class: 'story-builder-content-empty', text: 'This page is empty. Add a title, narration, dialogue or a choice.' }));
      return;
    }
    page.elements.forEach((element, index) => {
      const move = (delta) => {
        const target = index + delta;
        if (target < 0 || target >= page.elements.length) return;
        [page.elements[index], page.elements[target]] = [page.elements[target], page.elements[index]];
        state.currentElement = target;
        changed({ content: true });
      };
      const card = el('div', { class: `story-builder-element-card${index === state.currentElement ? ' is-active' : ''}` }, [
        el('div', { class: 'story-builder-element-head' }, [
          el('div', { class: 'story-builder-element-meta' }, [
            el('div', { class: 'story-builder-element-type', text: ELEMENT_LABELS[element.type] }),
            el('div', { class: 'story-builder-element-order', text: `Part ${index + 1}` })
          ]),
          el('div', { class: 'story-builder-element-actions' }, [
            element.type === 'choices' ? null : UI.iconButton('mic', element.voiceOverEnabled && element.voiceOverUrl ? 'Voice over: on' : 'Voice over', () => openShellModal('Voice over', () => voicePopup(element)), { class: element.voiceOverEnabled && element.voiceOverUrl ? 'is-active' : '' }),
            UI.iconButton('duplicate', 'Duplicate this part (Ctrl+D)', () => duplicatePart(index)),
            UI.iconButton('clipboard', 'Copy this part (Ctrl+C)', () => copyPart(index)),
            UI.iconButton('up', 'Move up', () => move(-1)),
            UI.iconButton('down', 'Move down', () => move(1)),
            UI.iconButton('eye', 'Show on the canvas', () => { state.currentElement = index; renderStoryCanvas(); renderContentList(); }),
            UI.iconButton('trash', 'Remove', () => { page.elements.splice(index, 1); state.currentElement = Math.max(0, Math.min(state.currentElement, page.elements.length - 1)); changed({ content: true }); }, { class: 'is-danger' })
          ])
        ])
      ]);
      const onText = (value) => { element.text = value; if (index === state.currentElement) renderStoryCanvas(); changed({ quiet: true }); };
      if (element.type === 'dialogue') {
        const speaker = UI.input(element.speaker, (value) => { element.speaker = value; if (index === state.currentElement) renderStoryCanvas(); changed({ quiet: true }); }, { placeholder: 'Speaker (character name)', maxlength: 60 });
        speaker.setAttribute('aria-label', 'Speaker');
        card.appendChild(el('div', { class: 'story-part-speaker' }, [
          speaker,
          UI.segmented([['left', 'Left'], ['right', 'Right']], element.side, (value) => { element.side = value; changed({ canvasOnly: true }); })
        ]));
      }
      const label = { title: 'Title text', narration: 'Narration text', dialogue: 'Dialogue text', choices: 'Question (optional)' }[element.type];
      const placeholder = { title: 'A title that appears on screen.', narration: 'Narration for the page.', dialogue: 'What this character says.', choices: 'Question (optional), e.g. Should the tortoise keep going?' }[element.type];
      // The words and their formatting (select words, then use the toolbar).
      const text = RT.editor({
        rich: element.rich, text: element.text, placeholder, label,
        singleLine: element.type === 'title', maxLength: element.type === 'title' ? 120 : 600,
        onChange(rich, plain) { element.rich = rich; onText(plain); }
      });
      text.classList.add('story-part-text');
      partEditors.set(element.id, text.richText);
      if (element.type === 'title') text.querySelector('.rt-editable').style.fontFamily = fontStack(element.font);
      if (element.type === 'title') {
        // The title's text box, its font and its size side by side.
        card.appendChild(el('div', { class: 'story-title-row' }, [text, titleFontSelect(element.font, (value) => {
          element.font = value;
          changed({ content: true });
        }), titleSizeSelect(element.size, (value) => {
          element.size = value;
          changed({ content: true });
        })]));
      } else {
        card.appendChild(text);
      }
      if (element.type === 'choices') card.appendChild(choicesEditor(element));
      card.addEventListener('focusin', () => {
        if (state.currentElement !== index) {
          state.currentElement = index;
          renderStoryCanvas();
          contentElementList.querySelectorAll('.story-builder-element-card').forEach((node, nodeIndex) => node.classList.toggle('is-active', nodeIndex === index));
        }
      });
      contentElementList.appendChild(card);
    });
  }

  function addElement(type) {
    const page = currentPage();
    const element = normalizeElement({ type, speaker: type === 'dialogue' ? 'Character' : '', side: 'left' });
    page.elements.push(element);
    state.currentElement = page.elements.length - 1;
    changed({ content: true });
    requestAnimationFrame(() => {
      const card = contentElementList.lastElementChild;
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const field = card.querySelector('.rt-editable, textarea, input[type=text]');
        if (field) field.focus({ preventScroll: true });
      }
    });
  }

  // --- Copy and paste parts (Ctrl+C / Ctrl+V, or the part's copy button) -------------
  // The copied part stays available on every Story page until another is copied.
  let partClipboard = null;
  const pasteBtn = $('pastePartBtn');
  function updatePasteButton() {
    pasteBtn.disabled = !partClipboard;
    pasteBtn.title = partClipboard ? `Paste the copied ${ELEMENT_LABELS[partClipboard.type].toLowerCase()} part (Ctrl+V)` : 'Copy a part first';
  }
  function copyPart(index = state.currentElement) {
    const element = currentPage().elements[index];
    if (!element) return false;
    partClipboard = JSON.parse(JSON.stringify(element));
    updatePasteButton();
    toast(`${ELEMENT_LABELS[element.type]} part copied.`);
    return true;
  }
  // Puts a copy of a part straight after it (the clipboard is left as it is).
  function duplicatePart(index = state.currentElement) {
    const element = currentPage().elements[index];
    if (!element) return false;
    state.currentElement = index;
    return insertPart(element, 'duplicated');
  }
  // Pastes after the selected part (or at the end of an empty page).
  function pastePart() {
    if (!partClipboard) return false;
    return insertPart(partClipboard, 'pasted');
  }
  function insertPart(source, verb) {
    if (isPlatform()) return false;
    const page = currentPage();
    const copy = normalizeElement({ ...JSON.parse(JSON.stringify(source)), id: UI.makeId('element') });
    const at = page.elements.length ? Math.min(state.currentElement + 1, page.elements.length) : 0;
    page.elements.splice(at, 0, copy);
    state.currentElement = at;
    changed({ content: true });
    requestAnimationFrame(() => {
      const card = contentElementList.children[at];
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    toast(`${ELEMENT_LABELS[copy.type]} part ${verb}.`);
    return true;
  }
  pasteBtn.addEventListener('click', pastePart);
  updatePasteButton();

  // --- Page settings: stage name, transition, what comes next ----------------------
  const TRANSITION_LABELS = { none: 'No transition', 'fade-in': 'Fade in', 'fade-out': 'Fade out', 'fade-both': 'Fade in and out' };
  function pageSettingsPopup(page) {
    return el('div', { class: 'pe-popup' }, [
      UI.field('Stage name (optional)', UI.input(page.stageName, (value) => { page.stageName = value.slice(0, 60); changed({ quiet: true }); }, { placeholder: 'e.g. The Deep Forest', maxlength: 60 }), { full: true }),
      UI.field('Stage subtitle (optional)', UI.input(page.stageSubtitle, (value) => { page.stageSubtitle = value.slice(0, 60); changed({ quiet: true }); }, { placeholder: 'e.g. Late Afternoon', maxlength: 60 }), { full: true }),
      el('p', { class: 'pe-hint', text: 'Shown to readers as they arrive at the page, like a place name. Left blank, nothing is shown.' }),
      UI.field('Page transition', UI.select(TRANSITIONS.map((value) => [value, TRANSITION_LABELS[value]]), page.transition, (value) => { page.transition = value; changed({ quiet: true }); }), { full: true })
    ]);
  }

  function renderPageSettings() {
    const page = currentPage();
    const isLast = state.current === state.pages.length - 1;
    const tr = (text) => (window.KoobdI18n ? window.KoobdI18n.t(text) : text);
    const summary = [page.stageName.trim(), tr(TRANSITION_LABELS[page.transition])].filter(Boolean).join(' · ');
    $('pageQuickHead').replaceChildren(
      el('strong', { text: `Page ${state.current + 1} of ${state.pages.length}` }),
      el('span', { text: isPlatform(page) ? 'Platform page' : 'Story page' })
    );
    pageFlowRoot.replaceChildren(
      el('div', { class: 'page-flow-label' }, [
        el('span', { class: 'ed-field-label', text: 'After this page' }),
        UI.gotoEditor(page.next, {
          types: ['next', 'page', 'end'],
          nextLabel: isLast ? 'The story ends' : `Go on to page ${state.current + 2}`,
          pages: pageOptions().filter((item) => item.key !== page.key),
          onChange(goto) { page.next = goto; changed({ quiet: true }); }
        })
      ]),
      el('div', { class: 'page-flow-actions' }, [
        UI.popupButton('Page settings', summary, () => openShellModal('Page settings', () => pageSettingsPopup(page)), 'settings'),
        el('button', { type: 'button', class: 'ed-btn ed-btn-soft', title: 'Save, then play the story starting from this page', on: { click: () => submitStory('preview', page.key) } }, [UI.icon('play'), el('span', { text: 'Play from this page' })])
      ])
    );
  }

  // --- Page chips ---------------------------------------------------------------------
  let draggedPage = null;
  // What a page's thumbnail shows (used by the page chips and the Story Map):
  // { color, layers: [front ... back image URLs], platform, characters: [{ src, side }] }
  function pageThumbData(page) {
    if (isPlatform(page)) {
      const bg = page.platformer.background;
      const def = bg.id ? LIB.get('backgrounds', bg.id) : null;
      const layers = (def ? def.layers : bg.asset ? [bg.asset] : []).map((layer) => LIB.url(layer));
      return { color: bg.color, layers, platform: true, characters: [] };
    }
    const bg = storyBackground(page);
    return {
      color: bg.color,
      layers: bg.layers,
      platform: false,
      characters: ['left', 'right'].map((side) => {
        const character = sideCharacter(page, side);
        return character ? { src: character.src, side } : null;
      }).filter(Boolean)
    };
  }

  function pageThumb(page) {
    const data = pageThumbData(page);
    const thumb = el('div', { class: `story-builder-pagechip-thumb${data.platform ? ' is-platform' : ''}` });
    thumb.style.backgroundColor = data.color;
    thumb.style.backgroundImage = data.layers.map((layer) => `url('${layer}')`).join(',');
    if (data.platform) {
      thumb.style.backgroundSize = 'auto 120%';
      thumb.style.backgroundPosition = 'left bottom';
      thumb.appendChild(el('span', { class: 'story-builder-pagechip-ground' }));
    }
    data.characters.forEach((character) => thumb.appendChild(el('img', { class: `story-builder-pagechip-char is-${character.side}`, src: character.src, alt: '' })));
    return thumb;
  }

  function renderPageChips() {
    pageChipList.replaceChildren();
    state.pages.forEach((page, index) => {
      const links = linksOf(page).filter((link) => link.kind !== 'next');
      const chip = el('button', {
        type: 'button', class: `story-builder-pagechip${index === state.current ? ' is-active' : ''}`, draggable: true,
        title: pageLabel(page, index),
        on: {
          click() { goToPage(index); },
          contextmenu(event) { event.preventDefault(); openPageMenu(index, event); },
          dragstart(event) { draggedPage = index; chip.classList.add('is-dragging'); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); },
          dragover(event) { event.preventDefault(); if (draggedPage !== null && draggedPage !== index) chip.classList.add('is-drop-target'); },
          dragleave() { chip.classList.remove('is-drop-target'); },
          drop(event) {
            event.preventDefault();
            chip.classList.remove('is-drop-target');
            if (draggedPage === null || draggedPage === index) return;
            const current = currentPage();
            const [moved] = state.pages.splice(draggedPage, 1);
            state.pages.splice(index, 0, moved);
            state.current = state.pages.indexOf(current);
            changed({ structure: true });
          },
          dragend() { draggedPage = null; pageChipList.querySelectorAll('.story-builder-pagechip').forEach((item) => item.classList.remove('is-dragging', 'is-drop-target')); }
        }
      }, [
        pageThumb(page),
        el('div', { class: 'story-builder-pagechip-copy' }, [
          el('div', { class: 'story-builder-pagechip-title', translate: 'no', text: pageLabel(page, index) }),
          el('div', { class: 'story-builder-pagechip-type' }, [
            PLATFORM_STORY ? el('span', { text: isPlatform(page) ? 'Platform' : 'Story' }) : null,
            links.length ? el('span', { class: 'story-builder-pagechip-branch', title: 'This page has choices or links to other pages', text: `⑂ ${links.length}` }) : null
          ])
        ])
      ]);
      pageChipList.appendChild(chip);
    });
    previousPageBtn.disabled = state.current === 0;
    nextPageBtn.disabled = state.current >= state.pages.length - 1;
    // Bring the current page's chip into view by scrolling the chip strip
    // sideways only, and only when the page changed, so editing never moves
    // the window.
    const active = pageChipList.querySelector('.is-active');
    if (active && lastChipPage !== state.current) {
      const strip = pageChipList.getBoundingClientRect();
      const chip = active.getBoundingClientRect();
      if (chip.left < strip.left) pageChipList.scrollLeft -= strip.left - chip.left + 12;
      else if (chip.right > strip.right) pageChipList.scrollLeft += chip.right - strip.right + 12;
    }
    lastChipPage = state.current;
  }
  let lastChipPage = -1;

  function goToPage(index, keepView = false) {
    state.current = Math.max(0, Math.min(state.pages.length - 1, index));
    state.currentElement = 0;
    state.pickedSide = null;
    renderAll({ keepView });
  }

  function insertPage(index, pageType) {
    const page = blankPage(pageType);
    const neighbour = state.pages[Math.min(index, state.pages.length - 1)];
    if (pageType === 'platformer' && neighbour && isPlatform(neighbour)) {
      // A new stage starts with the neighbouring stage's look.
      page.platformer.background = { ...neighbour.platformer.background };
      page.platformer.ground = { ...neighbour.platformer.ground, gaps: [] };
    }
    state.pages.splice(index, 0, page);
    goToPage(index);
  }

  function duplicatePage(index) {
    const copy = JSON.parse(JSON.stringify(state.pages[index]));
    copy.id = `page-${Date.now()}`;
    copy.key = newKey(new Set(state.pages.map((page) => page.key)));
    copy.elements.forEach((element) => { element.id = UI.makeId('element'); });
    state.pages.splice(index + 1, 0, copy);
    goToPage(index + 1);
  }

  async function deletePage(index) {
    if (state.pages.length <= 1) return;
    const page = state.pages[index];
    const incoming = state.pages.filter((other) => other !== page && linksOf(other).some((link) => link.target === page.key)).length;
    const message = incoming
      ? `Delete page ${index + 1}? ${incoming} other page${incoming > 1 ? 's link' : ' links'} to it; ${incoming > 1 ? 'those links' : 'that link'} will go to the next page instead.`
      : `Delete page ${index + 1}?`;
    if (!(await UI.confirmDialog(message))) return;
    state.pages.splice(index, 1);
    // Links to the deleted page now simply carry on.
    state.pages.forEach((other) => {
      const fix = (goto, fallback) => (goto && goto.type === 'page' && goto.page === page.key ? { type: fallback } : goto);
      other.next = fix(other.next, 'next');
      other.elements.forEach((element) => (element.choices || []).forEach((choice) => { choice.goto = fix(choice.goto, 'continue'); }));
      if (isPlatform(other)) {
        other.platformer.events.forEach((event) => {
          event.after = fix(event.after, 'continue');
          event.beats.forEach((beat) => (beat.choices || []).forEach((choice) => { choice.goto = fix(choice.goto, 'continue'); }));
        });
      }
    });
    goToPage(Math.min(state.current >= index ? state.current - 1 : state.current, state.pages.length - 1));
  }

  let pageMenu = null;
  function closePageMenu() { if (pageMenu) { pageMenu.remove(); pageMenu = null; } }
  function openPageMenu(index, event) {
    closePageMenu();
    const item = (label, run, enabled = true, danger = false) => el('button', {
      type: 'button', class: `pe-menu-item${danger ? ' is-danger' : ''}`, text: label, disabled: !enabled, on: { click() { closePageMenu(); run(); } }
    });
    pageMenu = el('div', { class: 'pe-menu', role: 'menu' }, [
      item('Add a page to the left', () => addPageAt(index)),
      item('Add a page to the right', () => addPageAt(index + 1)),
      item('Duplicate page', () => duplicatePage(index)),
      item('Play from this page', () => submitStory('preview', state.pages[index].key)),
      item(state.pages.length > 1 ? 'Delete page' : 'A story needs one page', () => deletePage(index), state.pages.length > 1, true)
    ]);
    document.body.appendChild(pageMenu);
    const rect = pageMenu.getBoundingClientRect();
    pageMenu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - rect.width - 8))}px`;
    pageMenu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - rect.height - 8))}px`;
  }
  document.addEventListener('pointerdown', (event) => { if (pageMenu && !pageMenu.contains(event.target)) closePageMenu(); });

  let pendingInsert = null;
  // Platform Mode stories ask which kind of page; regular stories add a Story page.
  function addPageAt(index) {
    if (PLATFORM_STORY) openPageTypeModal(index);
    else insertPage(index, 'normal');
  }
  function openPageTypeModal(index) {
    pendingInsert = index;
    pageTypeModal.classList.remove('hidden');
    pageTypeModal.setAttribute('aria-hidden', 'false');
    pageTypeModal.querySelector('button').focus();
  }
  function closePageTypeModal() {
    if (!pageTypeModal) return;
    pageTypeModal.classList.add('hidden');
    pageTypeModal.setAttribute('aria-hidden', 'true');
  }

  // --- Links between pages and the Story Map ----------------------------------------
  // Every way a page can lead on: { kind: next | jump | choice | end, target, label }.
  function linksOf(page) {
    const links = [];
    const add = (goto, kind, label) => {
      if (!goto) return;
      if (goto.type === 'page') links.push({ kind, target: goto.page, label });
      if (goto.type === 'end') links.push({ kind: 'end', target: '', label: goto.label || label || 'The end' });
    };
    if (isPlatform(page)) {
      page.platformer.events.forEach((event) => {
        add(event.after, 'jump', event.label || 'After an event');
        event.beats.forEach((beat) => (beat.choices || []).forEach((choice) => add(choice.goto, 'choice', choice.text)));
      });
    } else {
      page.elements.forEach((element) => (element.choices || []).forEach((choice) => add(choice.goto, 'choice', choice.text)));
    }
    if (page.next.type === 'page') add(page.next, 'jump', 'Then');
    else if (page.next.type === 'end') add(page.next, 'end', 'The end');
    else links.push({ kind: 'next', target: '', label: '' });
    return links;
  }

  // --- Story Map (docked on the right; js/story-map.js) ---------------------------------
  function pageMapPopup(index) {
    const page = state.pages[index];
    const isLast = index === state.pages.length - 1;
    return el('div', { class: 'pe-popup' }, [
      UI.field('After this page', UI.gotoEditor(page.next, {
        types: ['next', 'page', 'end'],
        nextLabel: isLast ? 'The story ends' : `Go on to page ${index + 2}`,
        pages: pageOptions().filter((item) => item.key !== page.key),
        onChange(goto) { page.next = goto; renderPageSettings(); changed({ quiet: true }); }
      }), { full: true }),
      pageSettingsPopup(page),
      el('div', { class: 'ed-modal-actions' }, [
        el('button', { type: 'button', class: 'ed-btn ed-btn-soft', on: { click: () => submitStory('preview', page.key) } }, [UI.icon('play'), el('span', { text: 'Play from this page' })])
      ])
    ]);
  }

  function endingPopup(ending) {
    const name = ending.name === 'The end' ? '' : ending.name;
    return el('div', { class: 'pe-popup' }, [
      UI.field('Ending name', UI.input(name, (value) => {
        // Renames the ending everywhere it is reached from.
        ending.sources.forEach((source) => {
          if (source.goto) source.goto.label = value;
          else state.pages[source.pageIndex].next = { type: 'end', label: value };
        });
        changed({ quiet: true });
      }, { placeholder: 'e.g. The Happy Ending', maxlength: 80 }), { full: true }),
      el('p', { class: 'pe-hint', text: 'Shown on the last screen when a reader reaches this ending.' }),
      UI.field('Reached from', el('div', { class: 'pe-link-list' }, ending.sources.map((source) => el('button', {
        type: 'button', class: 'pe-link', translate: 'no',
        on: { click() { if (UI.activeModal()) UI.activeModal().close(); goToPage(source.pageIndex); } }
      }, [UI.icon('map'), el('span', { text: pageLabel(state.pages[source.pageIndex], source.pageIndex) })]))), { full: true })
    ]);
  }

  // Opens the Story Map popup; while it is open it is redrawn after every change.
  function openStoryMap() {
    storyMap = window.KoobdStoryMap.open({
      getPages: () => state.pages,
      pageLabel,
      pageThumb: pageThumbData,
      currentIndex: () => state.current,
      onPage(index) {
        goToPage(index);
        return pageMapPopup(index);
      },
      onChoice(index, ref) {
        goToPage(index);
        if (ref.eventId) {
          platformEditor.ed.openEvent(ref.eventId);
        } else if (ref.elementIndex !== undefined) {
          state.currentElement = ref.elementIndex;
          renderStoryCanvas();
          renderContentList();
          const card = contentElementList.children[ref.elementIndex];
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      },
      onEnding(ending) {
        const first = ending.sources[0];
        if (first) goToPage(first.pageIndex);
        return endingPopup(ending);
      },
      onClose() { storyMap = null; }
    });
  }

  // --- Story text style ----------------------------------------------------------------
  function applyTextStyle(node) {
    const font = LIB.get('fonts', state.settings.font);
    node.style.setProperty('--story-font', font && font.stack ? font.stack : '');
    node.dataset.textSize = state.settings.textSize;
  }
  function renderSettings() {
    const root = $('storySettingsRoot');
    const preview = el('div', { class: 'story-settings-preview', 'data-size': state.settings.textSize, text: 'Once upon a time, a little tortoise set off on a long journey.' });
    const font = LIB.get('fonts', state.settings.font);
    preview.style.fontFamily = font && font.stack ? font.stack : '';
    root.replaceChildren(
      el('div', { class: 'pe-row' }, [
        UI.field('Story font', UI.select(LIB.fonts.map((item) => [item.id, item.label]), state.settings.font, (value) => { state.settings.font = value; renderSettings(); renderStoryCanvas(); serialize(); })),
        UI.field('Text size', UI.select(LIB.textSizes.map((item) => [item.id, item.label]), state.settings.textSize, (value) => { state.settings.textSize = value; renderSettings(); renderStoryCanvas(); serialize(); }))
      ]),
      preview
    );
  }

  // --- Rendering --------------------------------------------------------------------------
  // What changed decides how much is redrawn.
  function changed(what = {}) {
    const scrollY = window.scrollY;
    redraw(what);
    if (shellModal && !what.quiet && !what.canvasOnly) shellModal.refresh();
    if (window.scrollY !== scrollY) window.scrollTo(window.scrollX, scrollY);
  }
  function redraw(what) {
    if (what.structure) { renderAll({ keepView: true }); return; }
    if (what.quiet) { serialize(); clearTimeout(chipTimer); chipTimer = setTimeout(renderPageChips, 400); return; }
    if (what.canvasOnly) { renderStoryCanvas(); serialize(); return; }
    renderStoryCanvas();
    renderAssets();
    if (what.content) renderContentList();
    renderPageChips();
    serialize();
  }

  function renderAll(options = {}) {
    closePageMenu();
    const page = currentPage();
    const platform = isPlatform(page);
    document.body.classList.toggle('is-platform-page', platform);
    document.body.classList.toggle('story-builder-page-platformer', platform);
    document.body.classList.toggle('story-builder-page-regular', !platform);
    assetsHeading.textContent = platform ? 'Library' : 'Assets';
    if (platform) {
      platformEditor.load(page, Boolean(options.keepView));
    } else {
      if (platformEditor) platformEditor.hide();
      state.currentElement = Math.min(state.currentElement, Math.max(0, page.elements.length - 1));
      renderAssets();
      renderStoryCanvas();
      renderContentList();
    }
    renderPageSettings();
    renderPageChips();
    serialize();
  }

  // --- Sidebar -----------------------------------------------------------------------------
  let sidebarCollapsed = false;
  try { sidebarCollapsed = window.localStorage.getItem(SIDEBAR_KEY) === '1'; } catch (error) { sidebarCollapsed = false; }
  function toggleSidebar(force) {
    sidebarCollapsed = typeof force === 'boolean' ? force : !sidebarCollapsed;
    storyBuilderLayout.classList.toggle('is-sidebar-collapsed', sidebarCollapsed);
    storyBuilderSidebar.setAttribute('aria-hidden', sidebarCollapsed ? 'true' : 'false');
    const label = sidebarCollapsed ? 'Show the side panel' : 'Hide the side panel';
    toggleStorySidebarBtn.setAttribute('aria-label', label);
    toggleStorySidebarBtn.setAttribute('aria-expanded', sidebarCollapsed ? 'false' : 'true');
    toggleStorySidebarBtn.title = label;
    try { window.localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? '1' : '0'); } catch (error) { /* stays usable without storage */ }
  }

  // --- Events -------------------------------------------------------------------------------
  toggleStorySidebarBtn.addEventListener('click', () => toggleSidebar());
  showStorySidebarBtn.addEventListener('click', () => toggleSidebar(false));
  storyTitleInput.addEventListener('input', () => { headingTitle.textContent = storyTitleInput.value.trim() || 'Untitled Story'; });
  previousPageBtn.addEventListener('click', () => goToPage(state.current - 1));
  nextPageBtn.addEventListener('click', () => goToPage(state.current + 1));
  addPageBtn.addEventListener('click', () => addPageAt(state.pages.length));
  storyMapBtn.addEventListener('click', openStoryMap);
  if (pageTypeModal) {
    $('addNormalPageBtn').addEventListener('click', () => { closePageTypeModal(); insertPage(pendingInsert ?? state.pages.length, 'normal'); });
    $('addPlatformerPageBtn').addEventListener('click', () => { closePageTypeModal(); insertPage(pendingInsert ?? state.pages.length, 'platformer'); });
    $('cancelPageTypeBtn').addEventListener('click', closePageTypeModal);
    pageTypeModal.addEventListener('click', (event) => { if (event.target === pageTypeModal) closePageTypeModal(); });
  }
  $('addDialogueBtn').addEventListener('click', () => addElement('dialogue'));
  $('addNarrationBtn').addEventListener('click', () => addElement('narration'));
  $('addTitleBtn').addEventListener('click', () => addElement('title'));
  $('addChoiceBtn').addEventListener('click', () => addElement('choices'));
  $('canvasZoomOutBtn').addEventListener('click', () => setZoom(state.zoom - 0.1));
  $('canvasZoomInBtn').addEventListener('click', () => setZoom(state.zoom + 0.1));
  document.querySelectorAll('[data-editor-tab]').forEach((button) => button.addEventListener('click', () => { state.assetTab = button.dataset.editorTab; assetSearch.value = ''; renderAssets(); }));
  document.querySelectorAll('[data-character-slot]').forEach((button) => button.addEventListener('click', () => {
    state.characterSlot = button.dataset.characterSlot;
    document.querySelectorAll('[data-character-slot]').forEach((item) => item.classList.toggle('is-active', item === button));
  }));
  backgroundColorInput.addEventListener('input', () => { currentPage().backgroundColor = backgroundColorInput.value; changed({ canvasOnly: true }); });

  // Moves the character on `side` to the other side (swapping with whoever is
  // there). The page's dialogue lines flip with them, so each line stays with
  // the same character.
  function switchSides(side) {
    const page = currentPage();
    ['Character', 'CharacterAsset'].forEach((field) => {
      [page[`left${field}`], page[`right${field}`]] = [page[`right${field}`], page[`left${field}`]];
    });
    page.elements.forEach((element) => {
      if (element.type === 'dialogue') element.side = element.side === 'left' ? 'right' : 'left';
    });
    const other = side === 'left' ? 'right' : 'left';
    state.pickedSide = other;
    changed({ content: true });
    toast(sideCharacter(page, side) ? 'Characters swapped.' : `Character moved to the ${other}.`);
  }

  // Drag a character across the middle of the canvas to move it to the other side.
  let suppressCharacterClick = false;
  [[canvasLeftCharacter, 'left'], [canvasRightCharacter, 'right']].forEach(([node, side]) => {
    node.addEventListener('pointerdown', (event) => {
      if (!node.classList.contains('has-character') || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      const start = { x: event.clientX, y: event.clientY };
      let moved = false;
      let across = false;
      node.setPointerCapture(event.pointerId);
      const onMove = (moveEvent) => {
        if (canvasPinchHappened) return;
        const dx = moveEvent.clientX - start.x;
        const dy = moveEvent.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) < 6) return;
        moved = true;
        node.classList.add('is-dragging');
        node.style.translate = `${dx / state.zoom}px ${dy / state.zoom}px`;
        const rect = storyCanvas.getBoundingClientRect();
        const middle = rect.left + rect.width / 2;
        across = side === 'left' ? moveEvent.clientX > middle : moveEvent.clientX < middle;
        storyCanvas.classList.toggle('is-drop-left', across && side === 'right');
        storyCanvas.classList.toggle('is-drop-right', across && side === 'left');
      };
      const onUp = () => {
        node.removeEventListener('pointermove', onMove);
        node.removeEventListener('pointerup', onUp);
        node.removeEventListener('pointercancel', onUp);
        node.classList.remove('is-dragging');
        node.style.translate = '';
        storyCanvas.classList.remove('is-drop-left', 'is-drop-right');
        if (!moved || canvasPinchHappened) return;
        // The click that follows a drag must not also select or deselect.
        suppressCharacterClick = true;
        setTimeout(() => { suppressCharacterClick = false; }, 0);
        if (across) switchSides(side);
      };
      node.addEventListener('pointermove', onMove);
      node.addEventListener('pointerup', onUp);
      node.addEventListener('pointercancel', onUp);
    });
    node.addEventListener('click', (event) => {
      if (!node.classList.contains('has-character')) return;
      event.stopPropagation();
      if (suppressCharacterClick) return;
      pickSide(state.pickedSide === side ? null : side);
    });
  });
  storyCanvas.addEventListener('click', () => { if (state.pickedSide) pickSide(null); });

  // Right-click a character or the background on a Story Mode page to remove it.
  [[canvasLeftCharacter, 'leftCharacter', 'Remove the left character'], [canvasRightCharacter, 'rightCharacter', 'Remove the right character'], [canvasBackground, 'background', 'Remove the background picture']].forEach(([node, key, label]) => {
    node.addEventListener('contextmenu', (event) => {
      const page = currentPage();
      const hasIt = key === 'background' ? page.background || page.backgroundAsset || page.backgroundLibrary : page[key] || page[`${key}Asset`];
      if (!hasIt) return;
      event.preventDefault();
      closePageMenu();
      pageMenu = el('div', { class: 'pe-menu', role: 'menu' }, [el('button', {
        type: 'button', class: 'pe-menu-item is-danger', text: label,
        on: { click() { closePageMenu(); page[key] = ''; if (key === 'background') { page.backgroundAsset = ''; page.backgroundLibrary = ''; } else page[`${key}Asset`] = ''; changed(); } }
      })]);
      document.body.appendChild(pageMenu);
      pageMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 230)}px`;
      pageMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 60)}px`;
    });
  });

  $('saveDraftBtn').addEventListener('click', () => submitStory('save_draft'));
  $('previewStoryBtn').addEventListener('click', () => submitStory('preview'));
  $('publishStoryBtn').addEventListener('click', () => submitStory('publish'));
  form.addEventListener('submit', serialize);
  // Story details (title, description, lesson, cover, text style) live in a
  // popup that is part of the form, so they are saved with the story.
  const detailsModal = $('storyDetailsModal');
  const openDetails = () => {
    if (UI.activeModal()) UI.activeModal().close();
    detailsModal.classList.remove('hidden');
    detailsModal.setAttribute('aria-hidden', 'false');
    $('storyTitleInput').focus({ preventScroll: true });
  };
  const closeDetails = () => { detailsModal.classList.add('hidden'); detailsModal.setAttribute('aria-hidden', 'true'); };
  $('storyDetailsBtn').addEventListener('click', openDetails);

  // Keyboard shortcuts: the ones that work everywhere, then the Platform stage's.
  const SHORTCUTS = [
    ['Everywhere', [['Ctrl + S', 'save'], ['Ctrl + Z', 'undo'], ['Esc', 'close a popup']]],
    ['Writing', [['Click the text on the canvas', 'write in it there'], ['Select words, then Aa', 'format only those words'], ['Ctrl + B / I / U', 'bold / italic / underline'], ['Ctrl + Z / Ctrl + Y in a text box', 'undo / redo the writing']]],
    ['Story page', [['Ctrl + C', 'copy the selected part'], ['Ctrl + V', 'paste it after the selected part'], ['Ctrl + D', 'duplicate the selected part'], ['Click a character, then Delete', 'remove it from the page'], ['Drag a character across', 'move it to the other side']]],
    ['Platform stage', [
      ['Drag empty space', 'move around'], ['Shift + scroll', 'move along the stage'], ['Ctrl + scroll', 'zoom'], ['Shift + drag', 'select several'],
      ['Ctrl + C / Ctrl + V', 'copy / paste'], ['Ctrl + D', 'duplicate'], ['R / F', 'rotate / flip'], ['Arrow keys', 'nudge'], ['Delete', 'remove'],
      ['Alt while dragging', 'place freely, off the grid'], ['V / H / G / C', 'select, move around, gap, checkpoint tools'], ['Esc', 'stop placing / deselect']
    ]]
  ];
  $('shortcutsBtn').addEventListener('click', () => openShellModal('Keyboard shortcuts', () => el('div', { class: 'pe-popup' }, SHORTCUTS.filter(([group]) => PLATFORM_STORY || group !== 'Platform stage').map(([group, keys]) => el('section', { class: 'pe-section' }, [
    el('h4', { class: 'pe-section-title', text: group }),
    el('ul', { class: 'pe-shortcuts' }, keys.map(([combo, what]) => el('li', {}, [el('kbd', { text: combo }), el('span', { text: what })])))
  ]))), 'md'));
  $('closeStoryDetailsBtn').addEventListener('click', closeDetails);
  $('doneStoryDetailsBtn').addEventListener('click', closeDetails);
  detailsModal.addEventListener('pointerdown', (event) => { if (event.target === detailsModal) closeDetails(); });

  const openExit = () => { editorExitModal.classList.remove('hidden'); editorExitModal.setAttribute('aria-hidden', 'false'); };
  const closeExit = () => { editorExitModal.classList.add('hidden'); editorExitModal.setAttribute('aria-hidden', 'true'); };
  $('exitEditorBtn').addEventListener('click', openExit);
  $('stayInEditorBtn').addEventListener('click', closeExit);
  editorExitModal.addEventListener('click', (event) => { if (event.target === editorExitModal) closeExit(); });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closeExit(); closePageTypeModal(); closePageMenu(); closeDetails(); }
    const target = event.target;
    const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || ''));
    const popupOpen = Boolean(document.querySelector('.ed-modal:not(.hidden)'));
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'z' && !typing && !popupOpen) {
      if (undo()) event.preventDefault();
    }
    // Copy and paste parts on Story pages (text selected on the page copies as usual).
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !typing && !popupOpen && !isPlatform()) {
      const key = event.key.toLowerCase();
      const textSelected = String(window.getSelection ? window.getSelection() : '').trim() !== '';
      if (key === 'c' && !textSelected && copyPart()) event.preventDefault();
      if (key === 'v' && pastePart()) event.preventDefault();
      if (key === 'd' && duplicatePart()) event.preventDefault();
    }
    // Delete (or Backspace) removes the character picked on the canvas.
    if ((event.key === 'Delete' || event.key === 'Backspace') && !event.ctrlKey && !event.metaKey && !event.altKey && !typing && !popupOpen && !isPlatform()) {
      if (removePickedCharacter()) event.preventDefault();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      submitStory('save_draft');
    }
  });

  // Open at a given page (back from testing it, or after saving).
  if (config.startPageKey) {
    const start = state.pages.findIndex((page) => page.key === config.startPageKey);
    if (start >= 0) state.current = start;
  }
  toggleSidebar(sidebarCollapsed);
  renderSettings();
  setZoom(1);
  renderAll();
  if (config.savedMessage) toast(config.savedMessage);
})();
