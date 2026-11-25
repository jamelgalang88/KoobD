// KOOB'D's first-time tutorial: Flowergirl walks a new student or teacher
// through Home, one feature at a time. auth.php adds this script (with
// window.KOOBD_TUTORIAL) to every signed-in page:
//   - "Replay tutorial" goes in the profile menu, below Sound settings;
//   - on Home it starts by itself until the user has finished or skipped it
//     once (users.tutorial_done_at, saved by tutorial_done.php);
//   - home.php?tutorial=1 starts it (the replay item on any other page).
//
// While she speaks, a gray overlay darkens the page and a spotlight cuts out
// the feature she is explaining; her dialogue box (with her standing right
// beside it) is placed next to the spotlight, never over it, and follows it
// when the page scrolls, resizes or turns. The page itself waits until the
// tutorial is over. Nothing is built until it starts; its styles
// (css/koobd-tutorial.css) and her animation (js/character-animation.js) are
// loaded then.
(function () {
  const config = window.KOOBD_TUTORIAL;
  if (!config) return;
  const HOME = 'home.php';
  const onHome = /(^|\/)home\.php$/.test(window.location.pathname);
  const currentPage = window.location.pathname.split('/').pop() || 'home.php';
  const teacher = config.role === 'teacher';
  const M = 12;       // the least space kept between the box and the screen's edges
  const GAP = 14;     // between the spotlight and the box
  const PAD = 6;      // around a spotlit feature
  const SHEET_W = 192;
  const SHEET_H = 138;
  const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const lite = () => document.documentElement.classList.contains('koobd-lite');
  // Finished in this tab: not shown again even before the server has saved it.
  const DONE_KEY = `koobd_tutorial_done_${(window.KOOBD_AUDIO && window.KOOBD_AUDIO.user) || 0}`;

  // --- The steps -------------------------------------------------------------------------------------
  // target: what the spotlight cuts out (the first visible match of each
  // selector, together). A step whose feature is not on the page is left out.
  const STEPS = [
    {
      title: 'Hi, I\'m Flowergirl!',
      text: 'Welcome to KOOB\'D. Let me show you around - it only takes a minute.'
    },
    {
      target: ['.sidebar-link[href="home.php"]'],
      title: 'Home',
      text: 'This is Home. Tap it any time to come back to your stories.'
    },
    {
      target: ['.dash-search-wrap'],
      title: 'Search',
      text: 'Looking for a story? Type its name here to find it fast.'
    },
    {
      target: ['.dash-category-wrap'],
      title: 'Story shelves',
      text: teacher
        ? 'Every story to read or play is on these shelves. Use the arrows to see more, or Show all for the whole shelf.'
        : 'Pick a story to read or play. Use the arrows to see more, or Show all for the whole shelf.'
    },
    {
      target: ['.dash-whatsnew'],
      title: 'What\'s New',
      text: 'New stories and features show up here first.'
    },
    {
      target: ['.sidebar-link[href*="classroom"]'],
      title: 'Classroom',
      text: teacher
        ? 'Create classes and share each class code with your students. Give them stories and quizzes, then follow their progress and screen time.'
        : 'Join your class with the code from your teacher. The stories and quizzes your teacher gives you are waiting there.'
    },
    {
      target: ['.sidebar-link-stories'],
      title: 'My Stories',
      text: teacher
        ? 'Every story you make is kept here, ready to edit, preview and publish for your classes.'
        : 'Every story you make is kept here, ready to read again, edit or share.'
    },
    {
      target: ['.sidebar-link-versus'],
      title: 'Versus Mode',
      text: teacher
        ? 'A 1-on-1 word race. Students can challenge each other - and you can try it too.'
        : 'Challenge a friend to a 1-on-1 word race. The faster reader wins!'
    },
    {
      target: ['.sidebar-link-add'],
      title: 'Create',
      text: 'Make a story of your own: write pages in Story Mode, or build levels to play in Platform Mode.'
    },
    {
      target: ['.sidebar-profile-link', '.sidebar-profile-popover:not([hidden])'],
      menu: true,
      title: 'Your profile menu',
      text: 'Open My Profile, the Dictionary or Writing Practice, change your language or Sound settings, or watch this tutorial again. Log out is here too.'
    },
    {
      title: 'You\'re all set!',
      text: teacher
        ? 'Have fun teaching with KOOB\'D! You can replay this tour any time from your profile menu.'
        : 'Have fun reading! You can replay this tour any time from your profile menu.'
    }
  ];

  // Journey tours reuse the same Flowergirl dialog and spotlight. A step's
  // page may differ from the launch page; Next carries the tour to that route.
  const MISSION_TOURS = {
    profile: [
      { page: 'profile.php', target: ['.pf-header'], title: 'Make your profile yours', student: 'Your profile keeps your name and character together. Explore it to make KOOB\'D feel like your own space.' }
    ],
    join_class: [
      { page: 'classroom.php', target: ['#join-classroom .classroom-join-input'], title: 'Enter your class code', student: 'Ask your teacher for the code, then enter it here to join your classroom.' },
      { page: 'classroom.php', target: ['#join-classroom .classroom-join-btn'], title: 'Join your class', student: 'When your code is ready, select Join. Your teacher’s activities and class conversations will appear in your classroom.' }
    ],
    read_story: [
      { page: 'home.php', target: ['.story-shelf .dash-story-tile', '.dash-shared-card'], title: 'Choose a story', student: 'Pick a story that interests you. Reading helps you explore new ideas and grow your understanding.' },
      { page: 'home.php', target: ['.story-details-play'], title: 'Open the story', student: 'Choose Read Story to begin. Flowergirl will show you how to move through each page.' },
      { page: 'book1.php', target: ['#storyRoot'], title: 'Start reading', student: 'Follow the story one page at a time. Your reading progress is saved as you go.' },
      { page: 'false_knight.php', target: ['#storyRoot', 'main'], title: 'Explore the story', student: 'Read or play through the story and notice what happens as the characters make their choices.' },
      { page: 'false_knight_page.php', target: ['#storyRoot', 'main'], title: 'Explore the story', student: 'Read or play through the story and notice what happens as the characters make their choices.' }
    ],
    finish_story: [
      { page: 'book1.php', target: ['#storyRoot'], title: 'Read to the ending', student: 'Keep moving through the story until you reach its final page. Finishing the story completes this reading goal.' },
      { page: 'book1.php', target: ['#backHomeBtn'], title: 'You can pause and return', student: 'If you need a break, pause here. Continue the story later and reach the ending to finish this mission.' },
      { page: 'false_knight.php', target: ['#backHomeBtn', 'main'], title: 'Finish the adventure', student: 'Keep exploring until you reach the story’s ending. The system will record your progress when the story is complete.' }
    ],
    class_activity: [
      { page: 'classroom_room.php', target: ['.activity-open-btn', '.classroom-stream-card'], title: 'Choose an activity', student: 'Open an activity your teacher assigned. Read its instructions, complete the work, and submit it so your teacher can follow your progress.' },
      { page: 'classroom.php', target: ['#join-classroom'], title: 'Join your classroom first', student: 'Ask your teacher for a class code and join. Your activities will appear inside your classroom when they are assigned.' }
    ],
    dictionary: [
      { page: 'dictionary.php', target: ['#dictInput'], title: 'Find a word', student: 'Type an unfamiliar English or Tagalog word. Looking up its meaning builds vocabulary and reading confidence.' },
      { page: 'dictionary.php', target: ['.dict-go'], title: 'Look it up', student: 'Select Search to see the meaning or translation.', advanceOnClick: true },
      { page: 'dictionary.php', target: ['#dictResults'], title: 'Explore the meaning', student: 'Read the result and notice how the word is used. A successful lookup records this mission.' }
    ],
    writing: [
      { page: 'writing.php', target: ['#wpNewNote'], title: 'Start a notepad', student: 'Choose New notepad to make a space for your own words and ideas.', advanceOnClick: true },
      { page: 'writing.php', target: ['#wpNewDialog .wp-lang-card'], title: 'Choose a language', student: 'Pick English or Tagalog, then write a few lines. Practising both languages helps you express yourself.', advanceOnClick: true },
      { page: 'writing.php', target: ['#wpStage'], title: 'Write your ideas', student: 'Add your own words to the notepad. Your writing saves as you work.' }
    ],
    create_story: [
      { page: 'teacher_create_story.php', target: ['#ssTitle'], title: 'Give your story a title', student: 'Start with a title and a short description for your original story.' },
      { page: 'teacher_create_story.php', target: ['#ssType'], title: 'Choose how to tell it', student: 'Story Mode uses illustrated pages; Platform Mode turns your ideas into a level to explore.' },
      { page: 'teacher_create_story.php', target: ['#ssForm [type="submit"]'], title: 'Build your story', student: 'Continue to the editor to add pages, characters, and your own ideas. Your story is counted only after you create it.' }
    ],
    submit_story: [
      { page: 'teacher_story_editor.php', target: ['#storyCanvas'], title: 'Review your story', student: 'Check the pages and make any final changes before sharing your work with your teacher.' },
      { page: 'teacher_story_editor.php', target: ['#publishStoryBtn'], title: 'Send it for feedback', student: 'Choose Submit for Approval to send this version to your teacher. Your mission updates after the system records the submission.' }
    ],
    versus_match: [
      { page: 'versus.php', target: ['#vsChoices'], title: 'Choose how to play', student: 'Versus is a friendly word race. Create a lobby or join a classmate to begin.', advanceOnClick: true },
      { page: 'versus.php', target: ['#vsCreate:not([hidden])', '#vsJoin:not([hidden])'], title: 'Set up your match', student: 'Choose the match settings or enter your classmate’s lobby code, then finish the match to complete this mission.' }
    ],
    minigame: [
      { page: 'word_catch.php', target: ['main', '.word-catch'], title: 'Play a quick word game', student: 'Read the words and follow the game instructions. Your first recorded play unlocks the minigame mission.' }
    ],
    message_class: [
      { page: 'classroom_room.php', target: ['[data-social-chat]'], title: 'Talk with your class', student: 'Use the classroom conversation to ask a question or share your progress with your teacher.' },
      { page: 'teacher_classroom.php', target: ['[data-social-inbox]'], title: 'Open classroom messages', teacher: 'Use Messages to open a student conversation and send instructions or support.' }
    ],
    create_classroom: [
      { page: 'classroom.php', target: ['#classroomFormModal .cr-modal-head'], title: 'Set up a classroom', teacher: 'Give the classroom a recognizable name. It becomes the home for your roster, activities, reports, and messages.' },
      { page: 'classroom.php', target: ['#classroom_title'], title: 'Name your classroom', teacher: 'Enter a class name, then choose Create Classroom. The system records the classroom when it is saved.' },
      { page: 'classroom.php', target: ['#classroomFormModal [type="submit"]'], title: 'Create the class', teacher: 'Create the classroom to generate its class code and continue setting up your group.' }
    ],
    add_students: [
      { page: 'teacher_classroom.php', target: ['#class-code'], title: 'Welcome students', teacher: 'Share this classroom’s code with your students so they can join your roster.' },
      { page: 'teacher_classroom.php', target: ['.tr-code-copy'], title: 'Share the class code', teacher: 'Copy the code and give it to your class. Student accounts appear here after they join.' }
    ],
    assign_reading: [
      { page: 'teacher_classroom.php', target: ['#activity-form'], title: 'Choose a story activity', teacher: 'Select a story, add any instructions or due date, and add the activity to this classroom.' },
      { page: 'teacher_classroom.php', target: ['#activity_story'], title: 'Select the reading', teacher: 'Choose the story students should read, then add it. A published story activity is required for this mission.' },
      { page: 'teacher_classroom.php', target: ['#activity-form [type="submit"]'], title: 'Add the activity', teacher: 'Save the activity so students can find it in their classroom.' }
    ],
    create_quiz: [
      { page: 'teacher_quiz_editor.php', target: ['#quizTitle'], title: 'Create a classroom quiz', teacher: 'Name the quiz and add a question that checks what students understood.' },
      { page: 'teacher_quiz_editor.php', target: ['#quizAddMc', '#quizAddTf', '#quizAddId'], title: 'Add a question', teacher: 'Choose a question type and prepare its answer choices or expected response.' },
      { page: 'teacher_quiz_editor.php', target: ['#quizPublish'], title: 'Publish for your class', teacher: 'Publish the quiz when it is ready. A published quiz with a question completes this mission.' }
    ],
    review_progress: [
      { page: 'teacher_activity_progress.php', target: ['.progress-list', '.quiz-results'], title: 'Review student progress', teacher: 'This report shows how students are moving through the activity. Use it to decide who may need follow-up or support.' },
      { page: 'teacher_quiz_results.php', target: ['.quiz-results', '.progress-list'], title: 'Review quiz results', teacher: 'Review student responses and scores to understand what the class has learned.' },
      { page: 'teacher_classroom.php', target: ['#activities'], title: 'Choose an activity report', teacher: 'Open a classroom activity and choose its progress or results view to learn more about student participation.' }
    ],
    screen_time: [
      { page: 'teacher_screen_time.php', target: ['.st-page'], title: 'Explore screen-time insights', teacher: 'Review the student’s totals and timeline to understand how classroom device time is being used.' },
      { page: 'teacher_classroom.php', target: ['#viewTab-screen-time'], title: 'Open Screen Time', teacher: 'Choose the Screen Time tab to review the classroom’s usage overview.' }
    ],
    create_class_story: [
      { page: 'teacher_create_story.php', target: ['#ssTitle'], title: 'Create a classroom story', teacher: 'Add a title and description to give your students a clear introduction to this story.' },
      { page: 'teacher_create_story.php', target: ['#ssType'], title: 'Choose the story format', teacher: 'Choose Story Mode or Platform Mode based on how you want students to engage with the content.' },
      { page: 'teacher_create_story.php', target: ['#ssForm [type="submit"]'], title: 'Continue to the editor', teacher: 'Add the story content in the editor and publish it when it is ready for classroom use.' }
    ],
    approve_story: [
      { page: 'approve_stories.php', target: ['#submissionCode'], title: 'Find a submission', teacher: 'Enter the student’s submission code to open the story that needs your review.' },
      { page: 'approve_stories.php', target: ['.approval-preview-button'], title: 'Read before deciding', teacher: 'Preview the complete story before you make a decision or send feedback.' },
      { page: 'approve_stories.php', target: ['.approval-feedback-form'], title: 'Guide the student', teacher: 'Share encouraging, specific feedback. You can approve and publish, request a revision, reject with an explanation, or send feedback on its own.' }
    ]
  };

  // --- Replay ------------------------------------------------------------------------------------------
  const ICON_REPLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 108-8 8.2 8.2 0 00-5.7 2.3L4 8.5M4 4v4.5h4.5"/><path d="M10.5 9.2v5.6l4.4-2.8z"/></svg>';
  function addMenuItems() {
    document.querySelectorAll('.sidebar-profile-popover').forEach((menu) => {
      if (menu.querySelector('[data-replay-tutorial]')) return;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'sidebar-profile-menu-item koobd-tutorial-menu-item';
      item.dataset.replayTutorial = '';
      item.innerHTML = `${ICON_REPLAY}<span>Replay tutorial</span>`;
      item.addEventListener('click', () => {
        menu.hidden = true;
        document.querySelectorAll('.sidebar-profile-link[aria-expanded="true"]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
        if (onHome) start(); else window.location.href = `${HOME}?tutorial=1`;
      });
      const logout = menu.querySelector('form, .is-logout');
      menu.insertBefore(item, logout ? logout.closest('form') || logout : null);
    });
  }

  // --- Loading -----------------------------------------------------------------------------------------
  let loading = null;
  function load() {
    if (loading) return loading;
    const css = new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = config.css;
      link.onload = link.onerror = resolve;
      document.head.appendChild(link);
    });
    const animation = window.KoobdCharacterAnimation ? Promise.resolve() : new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = config.animation;
      script.onload = script.onerror = resolve;
      document.head.appendChild(script);
    });
    const sheet = new Promise((resolve) => {
      const image = new Image();
      image.onload = image.onerror = resolve;
      image.src = config.sheet;
    });
    loading = Promise.all([css, animation, sheet]);
    return loading;
  }

  // --- The tutorial ------------------------------------------------------------------------------------
  let root = null;
  let ui = null;
  let steps = [];
  let index = 0;
  let open = false;
  let activeMissionKey = null;
  let scrolledFor = -1;   // the step the page was last scrolled for
  let refitFor = -1;      // ...and scrolled again to make room for the box
  let placeQueued = false;
  let returnFocus = null;

  function build() {
    root = document.createElement('div');
    root.className = 'kt';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'ktTitle');
    root.setAttribute('aria-describedby', 'ktText');
    root.innerHTML = `
      <div class="kt-block"></div>
      <div class="kt-spot" aria-hidden="true"></div>
      <div class="kt-bubble">
        <div class="kt-card">
          <div class="kt-head">
            <span class="kt-name" translate="no">Flowergirl</span>
            <span class="kt-count" aria-live="polite"></span>
            <button type="button" class="kt-skip" data-kt="skip" aria-label="Skip tutorial"><span class="kt-skip-long">Skip tutorial</span><span class="kt-skip-short">Skip</span></button>
          </div>
          <h2 class="kt-title" id="ktTitle"></h2>
          <p class="kt-text" id="ktText"></p>
          <div class="kt-foot">
            <button type="button" class="kt-btn kt-prev" data-kt="prev">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>Previous</span>
            </button>
            <button type="button" class="kt-btn kt-next" data-kt="next">
              <span class="kt-next-label">Next</span><span class="kt-finish-label">Finish</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
            </button>
          </div>
        </div>
        <div class="kt-guide" aria-hidden="true"><div class="kt-sprite"></div></div>
      </div>`;
    document.body.appendChild(root);
    ui = {
      spot: root.querySelector('.kt-spot'),
      bubble: root.querySelector('.kt-bubble'),
      card: root.querySelector('.kt-card'),
      sprite: root.querySelector('.kt-sprite'),
      count: root.querySelector('.kt-count'),
      title: root.querySelector('.kt-title'),
      text: root.querySelector('.kt-text'),
      skip: root.querySelector('[data-kt="skip"]'),
      prev: root.querySelector('[data-kt="prev"]'),
      next: root.querySelector('[data-kt="next"]')
    };
    ui.sprite.style.backgroundImage = `url("${config.sheet}")`;
    ui.skip.addEventListener('click', () => finish());
    ui.prev.addEventListener('click', () => go(index - 1));
    ui.next.addEventListener('click', () => (index >= steps.length - 1 ? finish() : go(index + 1)));
    ui.spot.addEventListener('click', onMissionSpotClick);
    root.addEventListener('keydown', onKey);
  }

  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(); return; }
    if (event.key === 'ArrowRight' && !event.target.matches('input, textarea')) { event.preventDefault(); ui.next.click(); return; }
    if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); go(index - 1); return; }
    if (event.key === 'Tab') {
      // Focus stays in the box while the tutorial is open.
      const items = [ui.skip, ui.prev, ui.next].filter((item) => !item.hidden && !item.disabled);
      const at = items.indexOf(document.activeElement);
      event.preventDefault();
      items[(at + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    }
  }

  function visible(element) {
    if (!element || !element.getClientRects().length) return false;
    const style = window.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }
  function targetsOf(step) {
    if (!step.target) return [];
    return step.target.map((selector) => Array.from(document.querySelectorAll(selector)).find(visible)).filter(Boolean);
  }
  // The area a step's spotlight covers (with a little room around it), or null.
  function areaOf(step) {
    const elements = targetsOf(step);
    if (!elements.length) return null;
    let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
    elements.forEach((element) => {
      [element, element.querySelector('.sidebar-icon-box')].filter(Boolean).forEach((part) => {
        const rect = part.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        top = Math.min(top, rect.top); left = Math.min(left, rect.left);
        right = Math.max(right, rect.right); bottom = Math.max(bottom, rect.bottom);
      });
    });
    if (top === Infinity) return null;
    // Kept on screen, so its outline is never cut off (the phone tab bar
    // sits right at the screen's edges).
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    return {
      top: Math.max(3, top - PAD), left: Math.max(3, left - PAD),
      right: Math.min(vw - 3, right + PAD), bottom: Math.min(vh - 3, bottom + PAD)
    };
  }

  function start(sequence = STEPS, startAt = 0, missionKey = null) {
    if (open) return;
    load().then(() => {
      if (open) return;
      if (!root) build();
      activeMissionKey = missionKey;
      root.classList.toggle('is-mission', Boolean(missionKey));
      steps = missionKey
        ? sequence.map((step) => ({ ...step, text: teacher ? step.teacher : step.student }))
        : sequence.filter((step) => !step.target || targetsOf(step).length || step.menu);
      if (!steps.length) {
        console.error('Flowergirl could not find a tutorial sequence for this mission.');
        return;
      }
      index = Math.max(0, Math.min(startAt, steps.length - 1));
      open = true;
      returnFocus = document.activeElement;
      root.hidden = false;
      document.documentElement.classList.add('kt-open');
      window.addEventListener('resize', queuePlace);
      window.addEventListener('scroll', queuePlace, { capture: true, passive: true });
      if (window.KoobdAudio) window.KoobdAudio.ui('open');
      go(index);
      animate();
      // Shown once laid out, so it never appears in the wrong place.
      window.requestAnimationFrame(() => root.classList.add('is-shown'));
    });
  }

  function finish() {
    if (!open) return;
    const step = steps[index];
    if (activeMissionKey) saveMissionProgress(index, true);
    if (step && step.menu) closeMenu();
    open = false;
    root.classList.remove('is-shown');
    root.hidden = true;
    document.documentElement.classList.remove('kt-open');
    window.removeEventListener('resize', queuePlace);
    window.removeEventListener('scroll', queuePlace, { capture: true });
    stopAnimation();
    if (window.KoobdAudio) window.KoobdAudio.ui('confirm');
    if (config.auto) {
      // Shown once: finishing or skipping it is remembered for this account.
      config.auto = false;
      try { sessionStorage.setItem(DONE_KEY, '1'); } catch (error) { /* fine */ }
      try { fetch('tutorial_done.php', { method: 'POST', credentials: 'same-origin', keepalive: true }); } catch (error) { /* fine */ }
    }
    if (returnFocus && returnFocus.focus && document.contains(returnFocus)) returnFocus.focus();
    activeMissionKey = null;
  }

  // The profile step opens the profile menu (Sound settings, Replay tutorial).
  function profileMenu() {
    const button = Array.from(document.querySelectorAll('.sidebar-profile-link')).find(visible);
    const menu = button && document.getElementById(button.getAttribute('aria-controls') || '');
    return button && menu ? { button, menu } : null;
  }
  function openMenu() {
    // After this click is over: the page closes its menus on any click.
    window.setTimeout(() => {
      const found = profileMenu();
      if (!open || !steps[index] || !steps[index].menu || !found) return;
      if (found.menu.hidden) found.button.click();
      ui.next.focus({ preventScroll: true });
      place();
    }, 0);
  }
  function closeMenu() {
    const found = profileMenu();
    if (!found || found.menu.hidden) return;
    found.menu.hidden = true;
    found.button.setAttribute('aria-expanded', 'false');
  }

  function go(to) {
    if (to < 0 || to >= steps.length) return;
    const requestedStep = steps[to];
    if (activeMissionKey && requestedStep.page && requestedStep.page !== currentPage) {
      const destination = new URL(requestedStep.route || requestedStep.page, window.location.href);
      destination.searchParams.set('mission_tutorial', activeMissionKey);
      destination.searchParams.set('tutorial_step', String(to));
      saveMissionProgress(to, false);
      window.location.href = destination.toString();
      return;
    }
    if (steps[index] && steps[index].menu && to !== index) closeMenu();
    index = to;
    const step = steps[index];
    if (activeMissionKey) saveMissionProgress(index, false);
    const last = index === steps.length - 1;
    ui.count.textContent = `${index + 1} of ${steps.length}`;
    ui.title.textContent = step.title;
    ui.text.textContent = step.text;
    ui.prev.disabled = index === 0;
    ui.skip.hidden = last;
    ui.next.classList.toggle('is-finish', last);
    talkUntil = performance.now() + Math.min(2600, 500 + step.text.length * 22);
    scrolledFor = -1;
    refitFor = -1;
    place();
    // Again once the text has settled (js/i18n.js swaps in Tagalog just after).
    queuePlace();
    if (step.menu) openMenu();
    ui.next.focus({ preventScroll: true });
  }

  function missionProgressRequest(action, step = 0, completed = false) {
    if (!activeMissionKey) return Promise.resolve(null);
    return fetch(config.missionProgressUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        action,
        mission: activeMissionKey,
        step,
        completed,
        csrf: config.missionTutorialCsrf
      })
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Tutorial progress request failed.');
      return result;
    });
  }

  function saveMissionProgress(step, completed) {
    missionProgressRequest('save', step, completed).catch((error) => {
      console.error('Unable to save Flowergirl tutorial progress:', error);
    });
  }

  function onMissionSpotClick(event) {
    if (!activeMissionKey || !open || !steps[index] || !steps[index].target) return;
    event.preventDefault();
    event.stopPropagation();

    root.hidden = true;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    root.hidden = false;
    if (!hit) return;

    const targetElements = targetsOf(steps[index]);
    const action = hit.closest('a,button,input,select,textarea,[role="button"]');
    const selected = action || hit;
    if (!targetElements.some((target) => target === hit || target.contains(hit) || target === selected || target.contains(selected))) return;

    const nextIndex = index + 1;
    const hasNext = nextIndex < steps.length;
    if (action instanceof HTMLAnchorElement && action.href) {
      if (hasNext && action.target !== '_blank') {
        const link = new URL(action.href, window.location.href);
        if (link.origin === window.location.origin) {
          link.searchParams.set('mission_tutorial', activeMissionKey);
          link.searchParams.set('tutorial_step', String(nextIndex));
          action.href = link.toString();
        }
      }
      saveMissionProgress(hasNext ? nextIndex : index, false);
      const currentUrl = window.location.href;
      root.hidden = true;
      action.click();
      root.hidden = false;
      if (hasNext && action.matches('[data-story-title]') && action.dataset.storyHref) {
        window.setTimeout(() => {
          const storyPlay = document.querySelector('.story-details-play');
          if (!storyPlay) return;
          const storyUrl = new URL(action.dataset.storyHref, window.location.href);
          storyUrl.searchParams.set('mission_tutorial', activeMissionKey);
          storyUrl.searchParams.set('tutorial_step', String(nextIndex + 1));
          storyPlay.href = storyUrl.toString();
          if (open && nextIndex < steps.length && steps[nextIndex].page === currentPage) go(nextIndex);
        }, 0);
      } else if (window.location.href === currentUrl && hasNext) {
        window.setTimeout(() => {
          if (open && activeMissionKey && index < nextIndex) go(nextIndex);
        }, 80);
      }
      return;
    }

    root.hidden = true;
    selected.click();
    if (selected.matches('input,select,textarea,button,[role="button"]') && selected.focus) selected.focus();
    root.hidden = false;
    if (steps[index].advanceOnClick && hasNext) {
      window.setTimeout(() => {
        if (open && activeMissionKey && index < nextIndex) go(nextIndex);
      }, 80);
    }
  }

  // --- Placing the box and the spotlight --------------------------------------------------------------
  function queuePlace() {
    if (placeQueued || !open) return;
    placeQueued = true;
    window.requestAnimationFrame(() => { placeQueued = false; if (open) place(); });
  }

  // Sizes for this screen: Flowergirl's pixel scale and the card's width.
  // She stays on the card's right; on the narrowest screens she stands on
  // its top corner instead (compact).
  function size() {
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    const scale = vw >= 600 && vh >= 480 ? 3 : 2;
    const guideW = 32 * scale;
    const avail = vw - M * 2;
    const max = vw >= 1024 ? 400 : vw >= 600 ? 380 : 340;
    let card = Math.min(max, avail - guideW - 8);
    const compact = card < 236;
    if (compact) card = Math.min(max, avail);
    const bubble = ui.bubble;
    bubble.classList.toggle('is-compact', compact);
    bubble.classList.toggle('is-short', vh < 480);
    bubble.classList.toggle('is-narrow', card < 300);
    bubble.style.setProperty('--kt-card-w', `${Math.floor(card)}px`);
    bubble.style.setProperty('--kt-s', String(scale));
    ui.sprite.style.width = `${32 * scale}px`;
    ui.sprite.style.height = `${46 * scale}px`;
    ui.sprite.style.backgroundSize = `${SHEET_W * scale}px ${SHEET_H * scale}px`;
    spriteScale = scale;
    lastColumn = -1;
    return { vw, vh, card, guide: compact ? 0 : guideW + 6 };
  }
  // A narrower card (beside a feature when there is no room above or below).
  function narrowCard(card) {
    ui.bubble.style.setProperty('--kt-card-w', `${Math.floor(card)}px`);
    ui.bubble.classList.toggle('is-narrow', card < 300);
  }

  function setSpot(area) {
    const spot = ui.spot;
    if (!area) {
      spot.classList.add('is-empty');
      const vw = document.documentElement.clientWidth || window.innerWidth;
      spot.style.left = `${vw / 2}px`; spot.style.top = `${window.innerHeight / 2}px`;
      spot.style.width = spot.style.height = '0px';
      return;
    }
    spot.classList.remove('is-empty');
    spot.style.left = `${area.left}px`;
    spot.style.top = `${area.top}px`;
    spot.style.width = `${Math.max(0, area.right - area.left)}px`;
    spot.style.height = `${Math.max(0, area.bottom - area.top)}px`;
  }

  // Where the box fits beside the spotlight: each side, with the room left
  // over there; the side with the most room that takes the whole box wins.
  // beside: a feature in the side rail, so the box goes next to the rail
  // when it fits there, rather than over the rail's other items.
  function bestSide(area, w, h, vw, vh, beside) {
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    const cx = (area.left + area.right) / 2;
    const cy = (area.top + area.bottom) / 2;
    const fitX = clamp(cx - w / 2, M, vw - w - M);
    const fitY = clamp(cy - h / 2, M, vh - h - M);
    const sides = [
      { room: area.left - GAP - M - w, x: area.left - GAP - w, y: fitY },
      { room: vw - area.right - GAP - M - w, x: area.right + GAP, y: fitY },
      { room: area.top - GAP - M - h, x: fitX, y: area.top - GAP - h },
      { room: vh - area.bottom - GAP - M - h, x: fitX, y: area.bottom + GAP }
    ].map((side, at) => ({ ...side, across: at < 2 }))
      .filter((side) => side.room >= 0 && side.x >= M - 0.5 && side.y >= M - 0.5 && h <= vh - M * 2);
    sides.sort((a, b) => (beside && a.across !== b.across ? (a.across ? -1 : 1) : b.room - a.room));
    return sides[0] || null;
  }

  function place() {
    if (!open) return;
    const step = steps[index];
    const { vw, vh, card, guide } = size();
    const elements = targetsOf(step);
    // The feature is brought into view first (once per step).
    if (elements.length && scrolledFor !== index) {
      scrolledFor = index;
      const rect = elements[0].getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > vh || rect.left < 0 || rect.right > vw) scrollTo(elements[0], 'center');
    }
    const bubble = ui.bubble;
    let w = bubble.offsetWidth;
    let h = bubble.offsetHeight;
    let area = areaOf(step);
    let x, y;
    if (!area) {
      setSpot(null);
      x = (vw - w) / 2; y = (vh - h) / 2;
    } else {
      const rail = elements[0].closest('.sidebar');
      const railRect = rail && rail.getBoundingClientRect();
      const beside = Boolean(railRect && railRect.height > railRect.width * 2);
      const bestSideFor = () => bestSide(area, w, h, vw, vh, beside);
      let side = bestSideFor();
      // No room: a narrower card beside the feature...
      if (!side) {
        const room = Math.max(area.left, vw - area.right) - GAP - M - guide;
        if (room >= 240 && room < card) {
          narrowCard(room);
          w = bubble.offsetWidth; h = bubble.offsetHeight;
          side = bestSideFor();
          if (!side) { narrowCard(card); w = bubble.offsetWidth; h = bubble.offsetHeight; }
        }
      }
      // ...or a tall feature scrolled to the top of the screen, to make room
      // below it (once per step).
      if (!side && refitFor !== index && elements.length) {
        refitFor = index;
        scrollTo(elements[0], 'start');
        area = areaOf(step);
        side = bestSideFor();
      }
      if (side) {
        x = side.x; y = side.y;
        setSpot(area);
      } else {
        // Still no room (a phone turned sideways): the box goes to the
        // screen's bottom edge (or the top, for a feature starting low) and
        // the spotlight shows the part of the feature left in view - its
        // top, with its title, when it can.
        const cx = (area.left + area.right) / 2;
        x = Math.max(M, Math.min(vw - w - M, cx - w / 2));
        const below = area.top < vh / 2;
        y = below ? vh - h - M : M;
        const clipped = below
          ? { ...area, bottom: Math.min(area.bottom, y - GAP) }
          : { ...area, top: Math.max(area.top, y + h + GAP) };
        setSpot(clipped.bottom - clipped.top >= 24 ? clipped : null);
      }
    }
    bubble.style.left = `${Math.round(x)}px`;
    bubble.style.top = `${Math.round(y)}px`;
  }

  function scrollTo(element, block) {
    try { element.scrollIntoView({ block, inline: 'nearest', behavior: 'instant' }); }
    catch (error) { element.scrollIntoView(block === 'start'); }
    if (block !== 'start') return;
    // Something pinned at the top (the phone's search bar) would hide the
    // feature's top: it is scrolled down past it.
    const rect = element.getBoundingClientRect();
    if (!document.elementsFromPoint) return;
    let covered = 0;
    [2, 14, 28].forEach((down) => {
      const hit = document.elementsFromPoint(rect.left + rect.width / 2, Math.max(0, rect.top) + down).find((found) => !root.contains(found));
      if (hit && !element.contains(hit) && !hit.contains(element)) covered = Math.max(covered, Math.ceil(hit.getBoundingClientRect().bottom - rect.top));
    });
    if (covered <= 0) return;
    element.style.scrollMarginTop = `${covered + PAD * 2}px`;
    try { element.scrollIntoView({ block, inline: 'nearest', behavior: 'instant' }); } catch (error) { /* fine */ }
    element.style.scrollMarginTop = '';
  }

  // --- Flowergirl ---------------------------------------------------------------------------------------
  // Her idle loop (row 0 of her sheet) through the shared character
  // animation; she talks for a moment each time a step appears. Low-end
  // devices and reduced motion get the frames without the gentle breathing.
  let animState = null;
  let talkUntil = 0;
  let timer = 0;
  let frameRequest = 0;
  let spriteScale = 3;
  let lastColumn = -1;
  let lastShape = '';
  function drawFrame(now) {
    const A = window.KoobdCharacterAnimation;
    let column = 0;
    let shape = '';
    if (A) {
      if (!animState) animState = A.create();
      const look = A.update(animState, { paused: true, talking: now < talkUntil }, now);
      column = look.column;
      if (!reducedMotion && !lite()) shape = `scale(${look.sx.toFixed(3)}, ${look.sy.toFixed(3)})`;
    }
    if (column !== lastColumn) {
      lastColumn = column;
      ui.sprite.style.backgroundPosition = `${-column * 32 * spriteScale}px 0px`;
    }
    if (shape !== lastShape) {
      lastShape = shape;
      ui.sprite.style.transform = shape;
    }
  }
  function animate() {
    stopAnimation();
    lastColumn = -1;
    if (lite() || reducedMotion) {
      // A few frames a second are all her idle loop needs.
      drawFrame(performance.now());
      timer = window.setInterval(() => { if (!document.hidden) drawFrame(performance.now()); }, 110);
      return;
    }
    const loop = (now) => { drawFrame(now); frameRequest = window.requestAnimationFrame(loop); };
    frameRequest = window.requestAnimationFrame(loop);
  }
  function stopAnimation() {
    window.clearInterval(timer);
    window.cancelAnimationFrame(frameRequest);
    timer = frameRequest = 0;
  }

  // --- Start -------------------------------------------------------------------------------------------
  let started = false;
  function ready() {
    if (started) return;
    started = true;
    addMenuItems();
    const url = new URL(window.location.href);
    const missionKey = url.searchParams.get('mission_tutorial');
    if (missionKey) {
      const missionTour = MISSION_TOURS[missionKey];
      let sequence = missionTour
        ? missionTour.filter((step) => teacher ? Boolean(step.teacher) : Boolean(step.student))
        : [];
      const replay = url.searchParams.get('tutorial_replay') === '1';
      const requestedStep = Number.parseInt(url.searchParams.get('tutorial_step') || '', 10);
      const clearMissionQuery = () => {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('mission_tutorial');
        cleanUrl.searchParams.delete('tutorial_replay');
        cleanUrl.searchParams.delete('tutorial_step');
        window.history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      };
      if (!sequence.length) {
        console.error('Flowergirl has no tutorial sequence for journey mission:', missionKey);
        clearMissionQuery();
        return;
      }
      activeMissionKey = missionKey;
      missionProgressRequest('load').then((progress) => {
        if (progress.completed && !replay) {
          activeMissionKey = null;
          clearMissionQuery();
          return;
        }
        let startAt = replay ? 0 : (
          Number.isInteger(requestedStep) && requestedStep >= 0
            ? requestedStep
            : progress.step
        );
        if (missionKey === 'class_activity' && currentPage === 'classroom.php' && sequence[1]) {
          sequence = sequence.slice(1);
          startAt = 0;
        } else if (missionKey === 'class_activity' && currentPage === 'classroom_room.php') {
          sequence = sequence.slice(0, 1);
          startAt = 0;
        } else if (missionKey === 'screen_time' && currentPage === 'teacher_classroom.php' && sequence[1]) {
          sequence = sequence.slice(1);
          startAt = 0;
        } else if (missionKey === 'review_progress') {
          if (currentPage === 'teacher_activity_progress.php') {
            sequence = sequence.slice(0, 1);
            startAt = 0;
          } else if (currentPage === 'teacher_quiz_results.php') {
            sequence = sequence.slice(1, 2);
            startAt = 0;
          } else if (currentPage === 'teacher_classroom.php') {
            sequence = sequence.slice(2);
            startAt = 0;
          }
        }
        if (missionKey === 'read_story' && startAt === 2 && currentPage !== 'home.php') {
          const readerTarget = currentPage === 'shared_story_reader.php'
            ? ['#teacherStoryDialogueWrap', '#platformerStoryStage']
            : currentPage === 'story.php'
              ? ['.shared-story-detail-card', '.shared-story-file-link']
              : null;
          if (readerTarget) {
            sequence = sequence.slice(0, 3);
            sequence[2] = {
              ...sequence[2],
              page: currentPage,
              target: readerTarget,
              title: currentPage === 'story.php' ? 'Open the shared story' : 'Start reading',
              student: currentPage === 'story.php'
                ? 'Review the story details, then open the story file if one is available. You can return here to continue your journey.'
                : 'Read or play through the story. Your progress is saved as you go.'
            };
          }
        }
        if ((replay || (!Number.isInteger(requestedStep) && progress.step === 0)) && sequence[startAt]?.page !== currentPage) {
          const pageStep = sequence.findIndex((step) => step.page === currentPage);
          if (pageStep >= 0) startAt = pageStep;
        }
        if (replay) saveMissionProgress(0, false);
        clearMissionQuery();
        window.setTimeout(() => start(sequence, startAt, missionKey), 160);
      }).catch((error) => {
        console.error('Unable to load Flowergirl tutorial progress:', error);
        clearMissionQuery();
        window.setTimeout(() => start(sequence, Number.isInteger(requestedStep) && requestedStep >= 0 ? requestedStep : 0, missionKey), 160);
      });
      return;
    }
    if (!onHome) return;
    const asked = /[?&]tutorial=1\b/.test(window.location.search);
    if (asked) {
      try { window.history.replaceState(null, '', window.location.pathname + window.location.hash); } catch (error) { /* fine */ }
    }
    let doneHere = false;
    try { doneHere = sessionStorage.getItem(DONE_KEY) === '1'; } catch (error) { /* fine */ }
    if (asked || (config.auto && !doneHere)) {
      // A moment for the page to settle (shelves, sidebar) before she speaks.
      window.setTimeout(start, asked ? 150 : 450);
    }
  }
  // Once the page is ready (after Sound settings has joined the profile menu,
  // so Replay tutorial goes below it).
  if (document.readyState === 'complete') ready();
  else {
    document.addEventListener('DOMContentLoaded', ready);
    window.addEventListener('load', ready);
  }

  window.KoobdTutorial = { start, finish, get open() { return open; } };
})();
