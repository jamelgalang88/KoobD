// Plays a story made in KoobD's story editor (teacher_story_reader.php,
// shared_story_reader.php, teacher_story_preview.php): Story Mode pages
// (backgrounds, characters, titles, narration, dialogue, choices) and Platform
// Mode pages (worlds built by js/platform-story-compiler.js and played by the
// platform engine). Pages follow one another, or branch: a choice, a story
// event or a page's "what happens next" can lead to any page, or to the
// story's ending.
(function () {
  const config = window.KOOBD_TEACHER_STORY || {};
  const pages = Array.isArray(config.pages) ? config.pages : [];
  if (!pages.length) return;

  const byId = (preferred, fallback = '') =>
    document.getElementById(preferred) || (fallback ? document.getElementById(fallback) : null);

  const bg = byId('teacherStoryPlayerBg', 'sceneBg');
  const charLeft = byId('teacherStoryPlayerLeft', 'charLeft');
  const charRight = byId('teacherStoryPlayerRight', 'charRight');
  const titleWrap = byId('teacherStoryTitleWrap');
  const titleText = byId('teacherStoryTitle');
  const dialogueWrap = byId('teacherStoryDialogueWrap');
  const dialogueText = byId('teacherStoryText', 'dialogueText');
  const nameLeft = byId('teacherStoryNameLeft', 'nameLeft');
  const nameRight = byId('teacherStoryNameRight', 'nameRight');
  const modeLabel = byId('teacherStoryMode');
  const normalPageView = document.querySelector('.vn-wrapper');
  const platformerPageView = document.getElementById('platformerStoryStage');
  const fadeTargets = [charLeft, charRight, titleWrap, dialogueWrap].filter(Boolean);
  const transitionOverlay = document.createElement('div');
  transitionOverlay.className = 'story-page-transition-overlay';
  transitionOverlay.setAttribute('aria-hidden', 'true');
  document.body.appendChild(transitionOverlay);

  // Story Mode choices: the answers to the question on screen.
  const choiceBox = document.createElement('div');
  choiceBox.className = 'vn-choices teacher-story-choices';
  choiceBox.setAttribute('translate', 'no');
  normalPageView?.appendChild(choiceBox);

  const keyIndex = new Map(pages.map((page, index) => [String(page.key || `pg${index + 1}`), index]));
  const pageKeys = Array.from(keyIndex.keys());
  const startIndex = (() => {
    if (config.startPageKey && keyIndex.has(String(config.startPageKey))) return keyIndex.get(String(config.startPageKey));
    if (config.mode === 'preview') return 0;
    return Math.max(0, Math.min(pages.length - 1, parseInt(config.initialPage || 0, 10)));
  })();
  let pageIndex = startIndex;
  let elementIndex = config.mode === 'preview' ? 0 : Math.max(0, parseInt(config.initialElement || 0, 10));
  let isTransitioning = false;
  let waitingForChoice = false;
  let ended = false;
  let voiceOverAudio = null;
  let stopPlatformerPage = null;
  const progressContext =
    typeof config.progressContext === 'string' && config.progressContext.trim() !== ''
      ? config.progressContext.trim()
      : 'global';

  // The story's text style (font and size), chosen by its creator.
  const textStyle = config.textStyle || {};
  if (normalPageView) {
    normalPageView.classList.add('koobd-story');
    if (textStyle.font) normalPageView.style.setProperty('--story-font', textStyle.font);
    if (textStyle.size) normalPageView.dataset.textSize = textStyle.size;
  }

  // A page's optional stage name (and subtitle), set in the story editor:
  // shown as readers arrive at the page, the way The False Knight names its
  // places. A page without one shows nothing.
  const stageTitle = normalPageView && window.KoobdStory ? window.KoobdStory.createAreaTitle(normalPageView) : null;
  function stageNameOf(page) {
    const name = String(page?.stageName || '').trim();
    return name ? { name, time: String(page.stageSubtitle || '').trim() } : null;
  }
  function announceStage(page) {
    const stage = stageNameOf(page);
    if (stage && stageTitle && !isPlatformerPage(page)) stageTitle.show(stage.name, stage.time);
  }

  function isPlatformerPage(page) {
    return page?.pageType === 'platformer';
  }

  function setPageView(page) {
    const platformer = isPlatformerPage(page);
    normalPageView?.classList.toggle('hidden', platformer);
    platformerPageView?.classList.toggle('hidden', !platformer);
    document.body.classList.toggle('has-platformer-story-view', platformer);
  }

  function pageElements(page) {
    return Array.isArray(page.elements) ? page.elements : [];
  }

  function currentPage() {
    return pages[pageIndex];
  }

  function currentElement() {
    const elements = pageElements(currentPage());
    if (!elements.length) {
      return null;
    }
    if (elementIndex >= elements.length) {
      elementIndex = elements.length - 1;
    }
    return elements[elementIndex];
  }

  function hasVisibleText(value) {
    return String(value || '').trim() !== '';
  }

  // --- Sound (js/koobd-audio.js) ----------------------------------------------
  // A Story Mode page's music and surroundings (`page.audio`):
  //   music: '' carries on from the page before, 'none' is silence, a track
  //          id (KoobdAudio.tracks) or an uploaded file; musicVolume for a file;
  //   ambience: '' carries on, 'none' stops it, or layers ['rain', 'birds'...]
  //          at ambienceVolume.
  // A line can play an effect as it appears (`element.sfx`, repeated
  // `element.sfxRepeat` times). Stories without any of this read to gentle
  // music. Platform Mode pages set their own (js/platformer-story-player.js).
  const sound = window.KoobdAudio || null;
  let storyMusic = { track: 'reading' };
  let storyAmbience = null;
  let audioPage = -1;
  let audioElement = '';
  function pageAudio(page) {
    if (!sound) return;
    const audio = page.audio || {};
    const music = String(audio.music || '');
    if (music === 'none') storyMusic = null;
    else if (music && sound.hasTrack(music)) storyMusic = { track: music };
    else if (music && /^(uploads\/|[a-z0-9_-]+\/|https?:)/i.test(music)) storyMusic = { file: music, volume: Math.max(0, Math.min(1, Number(audio.musicVolume ?? 0.7))) };
    if (audio.ambience === 'none') storyAmbience = null;
    else if (Array.isArray(audio.ambience) && audio.ambience.length) {
      const volume = Math.max(0, Math.min(1, Number(audio.ambienceVolume ?? 0.7)));
      storyAmbience = Object.fromEntries(audio.ambience.map((name) => [name, volume]));
    }
    if (!storyMusic) sound.stopMusic();
    else if (storyMusic.file) sound.musicFile(storyMusic.file, storyMusic.volume);
    else sound.music(storyMusic.track);
    sound.ambience(storyAmbience);
  }
  function lineAudio(element) {
    if (!sound || !element || !element.sfx) return;
    const times = Math.max(1, Math.min(5, Math.round(Number(element.sfxRepeat) || 1)));
    for (let i = 0; i < times; i++) window.setTimeout(() => sound.sfx(element.sfx), i * 700);
  }
  document.addEventListener('koobd:pause', () => { if (sound) sound.pause(); voiceOverAudio?.pause(); });
  document.addEventListener('koobd:resume', () => { if (sound) sound.resume(); });

  function stopVoiceOver() {
    if (!voiceOverAudio) {
      return;
    }
    voiceOverAudio.pause();
    voiceOverAudio.currentTime = 0;
  }

  function syncVoiceOver(element) {
    stopVoiceOver();

    if (!element || !element.voiceOverEnabled || !hasVisibleText(element.voiceOverUrl)) {
      return;
    }

    if (!voiceOverAudio) {
      voiceOverAudio = new Audio();
      voiceOverAudio.preload = 'auto';
      if (sound) sound.bindMedia(voiceOverAudio, 'voice');
    }

    voiceOverAudio.src = element.voiceOverUrl;
    voiceOverAudio.currentTime = 0;
    voiceOverAudio.play().catch(() => {});
  }

  function totalUnits() {
    return pages.reduce((sum, page) => {
      const count = pageElements(page).length;
      return sum + (count > 0 ? count : 1);
    }, 0);
  }

  function completedUnits() {
    let total = 0;
    for (let i = 0; i < pageIndex; i += 1) {
      total += Math.max(1, pageElements(pages[i]).length);
    }
    total += Math.min(Math.max(1, pageElements(currentPage()).length), elementIndex + 1);
    return total;
  }

  function progressPercent() {
    if (ended) return 100;
    return Math.max(0, Math.min(99, Math.round((completedUnits() / totalUnits()) * 100)));
  }

  function saveProgress() {
    if (config.mode === 'preview' || !config.storyId || !config.title) {
      return;
    }

    fetch('save_story_progress.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storyId: config.storyId,
        progressContext,
        title: config.title,
        progress: progressPercent(),
        state: {
          currentPage: pageIndex,
          currentElement: elementIndex
        }
      }),
      credentials: 'same-origin',
      keepalive: true
    }).catch(() => {});
  }

  function setSceneCharacters(page, activeSide) {
    if (!charLeft || !charRight) {
      return;
    }
    charLeft.className = 'vn-char left';
    charRight.className = 'vn-char right';
    // Paths may have spaces (The False Knight's art), so they are encoded.
    const src = (path) => (path ? encodeURI(path).replace(/#/g, '%23') : '');
    charLeft.src = src(page.leftCharacterAsset);
    charRight.src = src(page.rightCharacterAsset);

    if (activeSide === 'left' && page.leftCharacterAsset) {
      charLeft.classList.add('active-left');
    } else if (activeSide === 'right' && page.rightCharacterAsset) {
      charRight.classList.add('active-right');
    }
  }

  // Story Mode choice buttons for the current element (or none).
  function renderChoices(element) {
    choiceBox.replaceChildren();
    waitingForChoice = false;
    const choices = element && element.type === 'choices' && Array.isArray(element.choices)
      ? element.choices.filter((choice) => hasVisibleText(choice.text))
      : [];
    if (!choices.length) return;
    waitingForChoice = true;
    choices.forEach((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice-btn';
      button.textContent = choice.text;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!waitingForChoice) return;
        waitingForChoice = false;
        choiceBox.replaceChildren();
        followLink(choice.goto, true);
      });
      choiceBox.appendChild(button);
    });
  }

  // A line in its box, with its formatting (js/rich-text.js) when it has some.
  function showLine(node, element, fallback) {
    if (window.KoobdRichText) window.KoobdRichText.render(node, element.rich, element.text || fallback);
    else node.textContent = element.text || fallback;
  }

  function render() {
    const page = currentPage();
    const element = currentElement();
    // A new page: its music and surroundings; a new line: its effect.
    if (audioPage !== pageIndex) { audioPage = pageIndex; pageAudio(page); }
    const elementKey = `${pageIndex}:${elementIndex}`;
    if (elementKey !== audioElement) { audioElement = elementKey; lineAudio(element); }
    if (bg) {
      bg.style.backgroundColor = page.backgroundColor || '#ffffff';
      const libraryBg = page.backgroundLibrary && window.KoobdPlatformLibrary ? window.KoobdPlatformLibrary.get('backgrounds', page.backgroundLibrary) : null;
      if (libraryBg) {
        bg.style.backgroundColor = libraryBg.color;
        bg.style.backgroundImage = libraryBg.layers.map((layer) => `url('${window.KoobdPlatformLibrary.url(layer)}')`).join(',');
        bg.style.backgroundSize = libraryBg.layers.map(() => 'cover').join(',');
        bg.style.backgroundPosition = libraryBg.layers.map(() => 'center bottom').join(',');
        bg.style.imageRendering = 'pixelated'; // The False Knight's scenes are pixel art
      } else {
        bg.style.imageRendering = '';
        bg.style.backgroundImage = page.backgroundAsset ? `url('${encodeURI(page.backgroundAsset).replace(/#/g, '%23')}')` : '';
        bg.style.backgroundSize = '';
        bg.style.backgroundPosition = '';
      }
    }

    if (nameLeft) {
      nameLeft.classList.remove('active');
      nameLeft.textContent = '';
    }
    if (nameRight) {
      nameRight.classList.remove('active');
      nameRight.textContent = '';
    }
    if (titleText) {
      titleText.textContent = '';
      titleText.classList.remove('rt-content');
    }
    if (dialogueText) {
      dialogueText.textContent = '';
      dialogueText.classList.remove('rt-content');
      dialogueText.classList.remove('teacher-story-text-narration');
    }
    if (titleWrap) {
      titleWrap.classList.add('hidden');
    }
    if (dialogueWrap) {
      dialogueWrap.classList.remove('hidden');
    }

    // The characters are on screen while someone speaks; narration, title
    // cards and questions fade them out (and dialogue fades them back in).
    const charLayer = charLeft && charLeft.parentElement;
    if (charLayer) charLayer.classList.toggle('is-narrating', !(element && element.type === 'dialogue' && hasVisibleText(element.text)));

    if (!element || (!hasVisibleText(element.text) && element.type !== 'choices')) {
      setSceneCharacters(page, '');
      if (dialogueWrap) {
        dialogueWrap.classList.add('hidden');
      }
    } else if (element.type === 'dialogue') {
      setSceneCharacters(page, element.side);
      if (element.side === 'left') {
        if (nameLeft) {
          nameLeft.textContent = element.speaker || 'Character';
          nameLeft.classList.add('active');
        }
      } else {
        if (nameRight) {
          nameRight.textContent = element.speaker || 'Character';
          nameRight.classList.add('active');
        }
      }
      if (dialogueText) {
        showLine(dialogueText, element, '...');
      }
    } else if (element.type === 'title') {
      setSceneCharacters(page, '');
      if (titleWrap) {
        titleWrap.classList.remove('hidden');
      }
      if (dialogueWrap) {
        dialogueWrap.classList.add('hidden');
      }
      if (titleText) {
        showLine(titleText, element, config.title || 'Untitled Story');
        const titleFont = element.font && window.KoobdPlatformLibrary ? window.KoobdPlatformLibrary.get('fonts', element.font) : null;
        titleText.style.fontFamily = titleFont && titleFont.stack ? titleFont.stack : '';
        if (element.size) titleText.dataset.titleSize = element.size; else delete titleText.dataset.titleSize;
      }
    } else {
      // Narration, and the question of a choice.
      setSceneCharacters(page, '');
      if (dialogueText) {
        showLine(dialogueText, element, element.type === 'choices' ? '' : '...');
        dialogueText.classList.add('teacher-story-text-narration');
      }
      if (element.type === 'choices' && !hasVisibleText(element.text) && dialogueWrap) {
        dialogueWrap.classList.add('hidden');
      }
    }
    renderChoices(element);

    syncVoiceOver(element && hasVisibleText(element.text) ? element : null);

    if (modeLabel) {
      modeLabel.textContent = ['Page ' + (pageIndex + 1), 'Block ' + Math.max(1, elementIndex + 1), progressPercent() + '%'].join(' • ');
    }
  }

  function setSceneOpacity(opacity, duration) {
    fadeTargets.forEach((target) => {
      if (!target) return;
      target.style.transition = duration > 0 ? `opacity ${duration}ms ease` : 'none';
      target.style.opacity = String(opacity);
    });
  }

  const PAGE_VIEW_TRANSITION_MS = 220;

  function waitForOverlayTransition() {
    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        transitionOverlay.removeEventListener('transitionend', onTransitionEnd);
        window.clearTimeout(timeoutId);
        resolve();
      };
      const onTransitionEnd = (event) => {
        if (event.target === transitionOverlay && event.propertyName === 'opacity') finish();
      };
      transitionOverlay.addEventListener('transitionend', onTransitionEnd);
      const timeoutId = window.setTimeout(finish, PAGE_VIEW_TRANSITION_MS + 80);
    });
  }

  async function fadeToBlack() {
    transitionOverlay.classList.add('is-visible');
    await waitForOverlayTransition();
  }

  async function fadeFromBlack() {
    const transition = waitForOverlayTransition();
    window.requestAnimationFrame(() => transitionOverlay.classList.remove('is-visible'));
    await transition;
  }

  function stopPlatformer() {
    if (stopPlatformerPage) {
      stopPlatformerPage();
      stopPlatformerPage = null;
    }
  }

  // --- Where the story goes next ----------------------------------------------
  // `link`: { type: 'continue' | 'next' } (the page's own "what happens next"),
  // { type: 'page', page: key } or { type: 'end', label }. `fromChoice`: a
  // choice that just carries on goes to the next block of this page.
  function followLink(link, fromChoice = false) {
    const type = link && link.type;
    if (type === 'page' && keyIndex.has(String(link.page))) {
      moveToPage(keyIndex.get(String(link.page)));
      return;
    }
    if (type === 'end') {
      showStoryEnding(link.label || '');
      return;
    }
    if (fromChoice) {
      advance(true);
      return;
    }
    afterPage();
  }

  // The page is over: its "what happens next", or simply the next page.
  function afterPage() {
    const next = currentPage().next || { type: 'next' };
    if (next.type === 'page' && keyIndex.has(String(next.page))) {
      moveToPage(keyIndex.get(String(next.page)));
      return;
    }
    if (next.type === 'end' || pageIndex >= pages.length - 1) {
      showStoryEnding(next.type === 'end' ? next.label || '' : '');
      return;
    }
    moveToPage(pageIndex + 1);
  }

  // The ending page, as in every KoobD story: The End, which ending it was,
  // the story's lesson, and Play Again / Home.
  let endingRoot = null;
  async function showStoryEnding(label) {
    if (ended) return;
    ended = true;
    stopVoiceOver();
    waitingForChoice = false;
    choiceBox.replaceChildren();
    stageTitle?.hide();
    await fadeToBlack();
    stopPlatformer();
    await askStoryQuestions('end');
    saveProgress();
    let reviewRecorded = false;
    if (config.reviewMode && config.reviewStatus === 'pending_approval') {
      try {
        const reviewResponse = await fetch(config.approvalHref || 'approve_stories.php', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: new URLSearchParams({
            action: 'mark_reviewed',
            csrf_token: config.approvalCsrfToken || '',
            submission_code: config.submissionCode || '',
            version_number: String(config.versionNumber || 1)
          })
        });
        const reviewResult = await reviewResponse.json();
        reviewRecorded = reviewResponse.ok && reviewResult.ok === true;
      } catch (error) {
        console.error('Unable to record the completed story review.', error);
      }
    }
    const home = config.reviewMode ? (config.exitReviewHref || 'approve_stories.php') : (config.returnHref || 'home.php');
    endingRoot = document.createElement('div');
    endingRoot.className = 'koobd-story story-ending-root is-story-ended';
    if (config.reviewMode) endingRoot.classList.add('is-approval-review');
    document.body.appendChild(endingRoot);
    if (window.KoobdStory) {
      const postButtons = [];
      if (config.reviewMode && config.reviewStatus === 'pending_approval' && reviewRecorded) {
        postButtons.push(
          { label: 'Approve Story', decision: 'approve', className: 'review-approve' },
          { label: 'Reject Story', decision: 'reject', className: 'review-reject' }
        );
      } else if (config.reviewMode && config.reviewStatus === 'published') {
        postButtons.push({ label: 'Cancel Publication', decision: 'unpublish', className: 'review-reject' });
      } else if (config.reviewMode && config.reviewStatus === 'unpublished') {
        postButtons.push({ label: 'Approve Story', decision: 'approve', className: 'review-approve' });
      }
      const reviewStatusLabels = {
        pending_approval: 'Awaiting your decision',
        published: 'Currently published',
        unpublished: 'Approved · publication paused',
        rejected: 'Previously rejected'
      };
      const reviewPrompts = {
        pending_approval: config.isUpdatedVersion
          ? 'This story has changed since its previous approval. Review the updated version before publishing it.'
          : 'Based on your review, should this story be approved?',
        published: 'This story is currently available to readers.',
        unpublished: 'This story was approved and is not currently published.',
        rejected: 'This submission was previously rejected.'
      };
      if (config.reviewMode && config.reviewStatus === 'pending_approval' && !reviewRecorded) {
        reviewPrompts.pending_approval = 'Your review could not be recorded. Exit to the approval page and preview the complete story again before deciding.';
      }
      window.KoobdStory.showEnding(endingRoot, {
        title: config.reviewMode && config.reviewStatus === 'pending_approval' && !reviewRecorded
          ? 'Review not recorded'
          : (config.reviewMode ? 'Review complete' : 'The End'),
        kicker: config.reviewMode ? (reviewPrompts[config.reviewStatus] || 'Review this story submission.') : label,
        reviewMode: Boolean(config.reviewMode),
        reviewStatusLabel: config.reviewMode && config.reviewStatus === 'pending_approval' && !reviewRecorded
          ? 'Decision locked until the review is recorded'
          : (config.isUpdatedVersion
          ? 'Updated Version - Pending Approval'
          : (reviewStatusLabels[config.reviewStatus] || 'Submission review')),
        reviewStoryTitle: config.title || '',
        lesson: config.lesson || '',
        onPlayAgain: () => restartStory(),
        extraButtons: config.reviewMode ? [] : (config.editorHref ? [{ label: 'Back to Editor', href: config.editorHref }] : []),
        postButtons: postButtons.map((action) => ({
          ...action,
          href: config.approvalHref,
          code: config.submissionCode,
          csrfToken: config.approvalCsrfToken
        })),
        homeHref: home,
        homeLabel: config.reviewMode ? 'Exit Preview' : 'Home',
        onHome: () => {
          if (window.storyReadingMode && typeof window.storyReadingMode.exitToMain === 'function') {
            window.storyReadingMode.exitToMain(home);
          } else {
            window.location.href = home;
          }
        },
      });
    }
    transitionOverlay.classList.remove('is-visible');
  }

  async function restartStory() {
    if (endingRoot) {
      endingRoot.remove();
      endingRoot = null;
    }
    ended = false;
    isTransitioning = false;
    await goToPage(startIndex, true);
  }

  async function moveToPage(nextPageIndex) {
    if (isTransitioning || ended) {
      return;
    }
    if (!pages[nextPageIndex]) {
      return;
    }
    isTransitioning = true;
    stageTitle?.hide();
    await fadeToBlack();
    // A teacher's question placed before this page is asked on the black
    // screen; the page starts once it is answered.
    await askStoryQuestions(`page:${String(pages[nextPageIndex].key || `pg${nextPageIndex + 1}`)}`);
    await goToPage(nextPageIndex, false);
  }

  // Questions a classroom activity places in the story (js/story-questions.js).
  function askStoryQuestions(point) {
    const questions = window.KoobdStoryQuestions;
    return questions && questions.has(point) ? questions.at(point) : Promise.resolve();
  }

  // Shows page `nextPageIndex` (the screen is already black when it is called
  // from moveToPage) and fades it in.
  async function goToPage(nextPageIndex, fadeOutFirst) {
    const nextPage = pages[nextPageIndex];
    if (!nextPage) return;
    isTransitioning = true;
    if (fadeOutFirst) await fadeToBlack();
    stopPlatformer();
    stopVoiceOver();
    if (sound && !isPlatformerPage(nextPage)) sound.sfx('page');
    pageIndex = nextPageIndex;
    elementIndex = 0;
    audioPage = -1;
    setPageView(nextPage);
    if (isPlatformerPage(nextPage)) {
      choiceBox.replaceChildren();
      waitingForChoice = false;
      startPlatformerPage(pageIndex);
    } else {
      setSceneOpacity(1, 0);
      render();
    }
    saveProgress();
    await fadeFromBlack();
    announceStage(nextPage);
    isTransitioning = false;
  }

  function startPlatformerPage(index) {
    const page = pages[index];
    if (!page) return;
    if (!platformerPageView || typeof window.startKoobdPlatformerPage !== 'function' || !window.KoobdPlatformCompiler) {
      console.error('Could not start the Platformer Page because its stage or runtime is unavailable.');
      return;
    }
    const isResumingThisPage = index === pageIndex && index === Number(config.initialPage || 0) && config.mode !== 'preview';
    const runtimeConfig = {
      ...config,
      page,
      platformerWorld: window.KoobdPlatformCompiler.compile(page, { pageKeys }),
      storyPageIndex: index,
      storyPageCount: pages.length,
      initialPlayerX: isResumingThisPage ? config.initialPlayerX : undefined,
      initialStoryEventIndex: isResumingThisPage ? config.initialStoryEventIndex : 0
    };
    stopPlatformerPage = window.startKoobdPlatformerPage(runtimeConfig, (action) => {
      stopPlatformer();
      // The engine hands back where to go: a page, the ending, or onward.
      followLink(action && action.type !== 'next' ? action : { type: 'continue' });
    });
  }

  async function advance(force = false) {
    if (isTransitioning || ended || (waitingForChoice && !force)) {
      return;
    }

    const elements = pageElements(currentPage());
    const pageLength = Math.max(1, elements.length);

    if (elementIndex < pageLength - 1) {
      elementIndex += 1;
      render();
      saveProgress();
      return;
    }
    afterPage();
  }

  document.addEventListener('click', (event) => {
    if (isPlatformerPage(currentPage()) || ended) return;
    if (event.target.closest('a, button, .koobd-pause')) {
      return;
    }
    advance();
  });

  document.addEventListener('keydown', (event) => {
    if (isPlatformerPage(currentPage()) || ended) return;
    if (event.target.closest && event.target.closest('button, a, input, textarea')) return;
    if (event.key === 'Enter' || event.key === 'ArrowRight' || event.key === ' ') {
      event.preventDefault();
      advance();
    }
  });

  setPageView(currentPage());
  if (isPlatformerPage(currentPage())) {
    startPlatformerPage(pageIndex);
  } else {
    render();
    setSceneOpacity(1, 0);
    window.setTimeout(() => announceStage(currentPage()), 400);
  }
  saveProgress();
  window.addEventListener('pageshow', (event) => {
    if (config.mode !== 'preview' || !event.persisted) return;
    restartStory();
  });
})();
