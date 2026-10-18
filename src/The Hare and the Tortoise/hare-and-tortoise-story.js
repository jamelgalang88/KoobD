// The Hare and the Tortoise - a Story Mode story on KoobD's shared story
// system (js/story-shared.js, css/story-shared.css), the same one The False
// Knight uses: the black title page, narration on black, full-screen
// storyboard frames, the fade through black when the story moves somewhere
// new, the pause page (Continue / Restart / Home), and the ending page (The
// End, the lesson, Play Again / Home). It uses no stage names.
// It is read, not played: no movement, physics or platforms - the characters
// follow the script through its scenes, lines, choices and frames.
const session = window.KOOBD_SESSION || {};
const progressContext =
  typeof session.progressContext === "string" && session.progressContext.trim() !== ""
    ? session.progressContext.trim()
    : "global";
const isGlobalProgress = progressContext === "global";

const storyRoot = document.getElementById("storyRoot");
const bg = document.getElementById("sceneBg");
const charLeft = document.getElementById("charLeft");
const charRight = document.getElementById("charRight");
const vnDialogue = document.querySelector(".vn-dialogue");
const dialogueText = document.getElementById("dialogueText");
const choiceButtons = document.getElementById("choiceButtons");
const choiceTimer = document.getElementById("choiceTimer");
const choiceTimerFill = document.getElementById("choiceTimerFill");
const nameLeft = document.getElementById("nameLeft");
const nameRight = document.getElementById("nameRight");
const backHomeBtn = document.getElementById("backHomeBtn");

// Home, or back to the classroom when read as a classroom activity.
const homeHref = (window.KOOBD_SESSION && window.KOOBD_SESSION.returnHref) || "home.php";
const goHome = () => {
  if (window.storyReadingMode && typeof window.storyReadingMode.exitToMain === "function") {
    window.storyReadingMode.exitToMain(homeHref);
    return;
  }
  window.location.href = homeHref;
};

// In Tagalog (KoobD's language set to Tagalog) the story is told in Tagalog,
// from hare-and-tortoise-story.tl.js; its title stays as it is.
const storyTagalog = window.KoobdI18n && window.KoobdI18n.lang === "tl" ? window.KOOBD_HARE_TL || null : null;
const told = (text) => (storyTagalog && Object.prototype.hasOwnProperty.call(storyTagalog, text) ? storyTagalog[text] : text);

const STORY_META = {
  id: "book1",
  title: "The Hare and the Tortoise",
  lesson: "Steady effort, humility, and kindness can change the outcome of any race."
};

const storageKey = session.userId ? `koobd-progress:${session.userId}:${progressContext}:${STORY_META.id}` : null;
const lastReadStorageKey = session.userId ? `koobd-last-read:${session.userId}` : null;

const ENDINGS = {
  tortoiseWon: { title: "Ending 1: Tortoise Won", lesson: "Overconfidence can fail, but patience and consistency carry you forward." },
  tie: { title: "Ending 2: Tie", lesson: "Kindness and effort together can create a fair and joyful ending for everyone." },
  hareWon: { title: "Ending 3: Hare Won", lesson: "Winning means more when you choose to help others along the way." },
  tortoiseAndEagleWon: { title: "Ending 4: Tortoise and Eagle Won", lesson: "Ignoring someone in need can cost more than speed can recover." }
};

const storyParams = new URLSearchParams(window.location.search);
const resumeRequested = storyParams.get("resume") === "1";
const activityQuery = Number(session.activityId) > 0 ? `activity_id=${Number(session.activityId)}` : "";
const storyUrl = (extra) => "book1.php" + ([activityQuery, extra].filter(Boolean).length ? "?" + [activityQuery, extra].filter(Boolean).join("&") : "");

let storyState = { helpedEagle: null, slept: null };
let storyQueue = [];
let currentStep = 0;
let waitingForChoice = false;
let storyLocked = false;
let busy = false;
let finished = false;
let choiceTimerFrame = 0;
let choiceTimerDeadline = 0;

const CHOICE_TIMER_MS = 8000;

// --- Art ----------------------------------------------------------------------
const STORY_FOLDER = "The%20Hare%20and%20the%20Tortoise";
const ART_VERSION = "4";
const art = (path) => `${STORY_FOLDER}/${path}?v=${ART_VERSION}`;

// The places the race moves through, in the script's order (painted by
// _make_backgrounds.py in this folder). This story has no stage names: the
// pictures say where the race is.
const places = {
  meadow: { src: art("backgrounds/meadow.jpg") },
  startLine: { src: art("backgrounds/start-line.jpg") },
  racePath: { src: art("backgrounds/race-path.jpg") },
  deepWoods: { src: art("backgrounds/deep-woods.jpg") },
  restingTree: { src: art("backgrounds/resting-tree.jpg") },
  finishLine: { src: art("backgrounds/finish-line.jpg") }
};
// The storyboard frames at the story's turning points.
const frames = {
  eagleTrapped: art("frames/eagle-trapped.jpg"),
  hareFreesEagle: art("frames/hare-frees-eagle.jpg"),
  hareSleeps: art("frames/hare-sleeps.jpg")
};
const characters = {
  Tortoise: `${STORY_FOLDER}/characters/tortoise.png`,
  Hare: `${STORY_FOLDER}/characters/hare.png`,
  Eagle: `${STORY_FOLDER}/characters/eagle.png`
};
// Load every picture up front so nothing is ever blank when it is needed.
[...Object.values(places).map((place) => place.src), ...Object.values(frames), ...Object.values(characters)]
  .forEach((src) => { const image = new Image(); image.src = src; });

// --- The shared story system ----------------------------------------------------
const storyCard = KoobdStory.createStoryCard(storyRoot, () => advance());
let currentPlace = "";

// The story moves to `key`. Behind a story card (title, narration, frame) the
// background simply changes; otherwise the scene fades through black.
async function moveTo(key) {
  const place = places[key];
  if (!place || key === currentPlace) {
    return;
  }
  const first = !currentPlace;
  currentPlace = key;
  if (first || storyCard.isShowing()) {
    bg.style.backgroundImage = `url(${place.src})`;
    return;
  }
  await KoobdStory.fadeToBlack(storyRoot);
  bg.style.backgroundImage = `url(${place.src})`;
  await new Promise((resolve) => KoobdStory.whenImageReady(place.src, resolve, 300));
  await KoobdStory.fadeFromBlack(storyRoot);
}

// --- Progress ---------------------------------------------------------------------
function syncProgressToServer(payload) {
  try {
    fetch("save_story_progress.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
      keepalive: true
    }).catch(() => {});
  } catch (error) {
    // Keep the story readable even if the sync request fails.
  }
}

function saveReadingProgress(progress) {
  const boundedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const payload = {
    storyId: STORY_META.id,
    progressContext,
    title: STORY_META.title,
    progress: boundedProgress,
    updatedAt: Date.now(),
    state: { helpedEagle: storyState.helpedEagle, slept: storyState.slept }
  };
  try {
    if (storageKey) {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    }
    if (isGlobalProgress && lastReadStorageKey) {
      window.localStorage.setItem(lastReadStorageKey, JSON.stringify(payload));
      window.localStorage.removeItem("koobd-last-read");
    }
  } catch (error) {
    // Ignore storage failures and keep the story readable.
  }
  syncProgressToServer(payload);
}

// The newer of this device's copy and the server's (another device, or this
// one after its storage was cleared).
function readSavedProgress() {
  let local = null;
  try {
    const payload = JSON.parse(window.localStorage.getItem(storageKey || "null") || "null");
    local = payload && payload.storyId === STORY_META.id && (payload.progressContext || "global") === progressContext ? payload : null;
  } catch (error) {
    local = null;
  }
  const server = session.savedProgress && session.savedProgress.storyId === STORY_META.id ? session.savedProgress : null;
  if (!local) return server;
  if (!server) return local;
  return (Number(server.updatedAt) || 0) > (Number(local.updatedAt) || 0) + 2000 ? server : local;
}

// --- Choices -------------------------------------------------------------------------
function stopChoiceTimer() {
  if (choiceTimerFrame) {
    cancelAnimationFrame(choiceTimerFrame);
    choiceTimerFrame = 0;
  }
  choiceTimerDeadline = 0;
  if (choiceTimer) {
    choiceTimer.classList.add("hidden");
    choiceTimer.setAttribute("aria-hidden", "true");
  }
  if (choiceTimerFill) {
    choiceTimerFill.style.transform = "scaleX(1)";
    choiceTimerFill.style.background = "linear-gradient(90deg, #6277c3, #74ddb1)";
  }
}

function timerColor(progress) {
  const start = { r: 98, g: 119, b: 195 };
  const end = { r: 214, g: 87, b: 110 };
  const mix = Math.max(0, Math.min(1, progress));
  return `rgb(${Math.round(start.r + (end.r - start.r) * mix)}, ${Math.round(start.g + (end.g - start.g) * mix)}, ${Math.round(start.b + (end.b - start.b) * mix)})`;
}

function startChoiceTimer(choices) {
  stopChoiceTimer();
  if (!choiceTimer || !choiceTimerFill || !choices.length) {
    return;
  }
  choiceTimer.classList.remove("hidden");
  choiceTimer.setAttribute("aria-hidden", "false");
  choiceTimerDeadline = performance.now() + CHOICE_TIMER_MS;
  const tick = (now) => {
    if (!waitingForChoice) {
      stopChoiceTimer();
      return;
    }
    if (storyLocked) {
      // The story is paused: the clock waits too.
      choiceTimerDeadline += 16;
    }
    const remaining = Math.max(0, choiceTimerDeadline - now);
    const ratio = remaining / CHOICE_TIMER_MS;
    choiceTimerFill.style.transform = `scaleX(${ratio})`;
    choiceTimerFill.style.background = `linear-gradient(90deg, ${timerColor(1 - ratio)}, #74ddb1)`;
    if (remaining <= 0) {
      stopChoiceTimer();
      choose(choices[0]);
      return;
    }
    choiceTimerFrame = requestAnimationFrame(tick);
  };
  choiceTimerFrame = requestAnimationFrame(tick);
}

function choose(choice) {
  if (!waitingForChoice) {
    return;
  }
  waitingForChoice = false;
  stopChoiceTimer();
  choiceButtons.innerHTML = "";
  choice.action();
}

// --- Presenting the story ----------------------------------------------------------
function setFigure(figure, src) {
  if (src) {
    if (figure.getAttribute("src") !== src) figure.setAttribute("src", src);
  } else {
    figure.removeAttribute("src");
  }
  figure.classList.toggle("is-empty", !src);
}

function setDialogue(line) {
  charLeft.className = "vn-char left";
  charRight.className = "vn-char right";
  setFigure(charLeft, line.left || "");
  setFigure(charRight, line.right || "");
  nameLeft.classList.toggle("active", line.side === "left");
  nameRight.classList.toggle("active", line.side === "right");
  if (line.side === "left") charLeft.classList.add("active-left");
  if (line.side === "right") charRight.classList.add("active-right");
  nameLeft.textContent = line.side === "left" ? line.name : "";
  nameRight.textContent = line.side === "right" ? line.name : "";
  dialogueText.classList.remove("visible");
  window.setTimeout(() => {
    dialogueText.innerHTML = line.text;
    dialogueText.classList.add("visible");
  }, 50);
  vnDialogue.classList.remove("is-under-card");
}

// One beat of the story:
//   { type: 'title' | 'narration', text, place }
//   { type: 'frame', image, place }   (the picture alone, as in The False Knight)
//   { type: 'dialogue', name, side, text, left, right, place }
//   { type: 'choice', choices: [{ text, action }] }
// `progress` (0-100) is saved as the beat is shown.
let beatToken = 0;
async function present(beat) {
  busy = true;
  const token = ++beatToken;
  if (typeof beat.progress === "number") {
    saveReadingProgress(beat.progress);
  }
  if (beat.type === "title" || beat.type === "narration" || beat.type === "frame") {
    vnDialogue.classList.add("is-under-card");
    storyCard.show(beat.type === "frame" ? "" : beat.text, beat.type, beat.image || "", beat.transition || "");
    // Once the card covers the scene, the place can change behind it.
    // (Skipped if the reader has already moved on to a later beat.)
    window.setTimeout(() => { if (token === beatToken) moveTo(beat.place); }, beat.type === "frame" ? 500 : 60);
  } else if (beat.type === "dialogue") {
    if (storyCard.isShowing()) {
      await moveTo(beat.place);
      setDialogue(beat);
      await storyCard.hide();
    } else {
      if (beat.place && beat.place !== currentPlace) {
        // Into the new place first, then the line.
        vnDialogue.classList.add("is-under-card");
        await moveTo(beat.place);
      }
      setDialogue(beat);
    }
  } else if (beat.type === "choice") {
    waitingForChoice = true;
    choiceButtons.innerHTML = "";
    beat.choices.forEach((choice) => {
      const button = document.createElement("button");
      button.textContent = told(choice.text);
      button.classList.add("choice-btn");
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        choose(choice);
      });
      choiceButtons.appendChild(button);
    });
    startChoiceTimer(beat.choices);
  }
  busy = false;
}

const title = () => ({ type: "title", text: STORY_META.title, place: "meadow" });
const narration = (progress, text, place) => ({ type: "narration", progress, text: told(text), place });
const frame = (progress, image, place) => ({ type: "frame", progress, image, place });
const say = (progress, name, side, text, place, left = "", right = "") => ({ type: "dialogue", progress, name: told(name), side, text: told(text), place, left, right });

// --- The script -------------------------------------------------------------------------
function mainBeats() {
  return [
    narration(5, "Once upon a time, a Tortoise and a Hare competed in a race.", "meadow"),
    say(10, "Hare", "left", "I've always been the fastest animal in the forest...", "meadow", characters.Hare),
    say(15, "Tortoise", "right", "I challenge you to a race, Hare.", "meadow", characters.Hare, characters.Tortoise),
    say(20, "Hare", "left", "You? Against me? You do know I'm faster than you, right?", "meadow", characters.Hare, characters.Tortoise),
    say(25, "Tortoise", "right", "Probably, but I'm more careful than you.", "meadow", characters.Hare, characters.Tortoise),
    say(30, "Hare", "left", "Oh yeah? Let's settle this!", "meadow", characters.Hare, characters.Tortoise),
    narration(35, "The fox raised his tail. Ready... set... GO!", "startLine"),
    narration(40, "The race begins!", "startLine"),
    say(45, "Hare", "left", "I bolted off, my paws kicking up dust...", "racePath", characters.Hare),
    say(50, "Hare", "left", "Halfway through the race, I heard a loud cry...", "deepWoods", characters.Hare),
    frame(52, frames.eagleTrapped, "deepWoods"),
    say(55, "Eagle", "right", "Help! Someone help me!", "deepWoods", characters.Hare, characters.Eagle),
    { type: "choice", progress: 60, choices: [
      { text: "Help the Eagle", action: decisionHelpEagle },
      { text: "Continue the Race", action: decisionIgnoreEagle }
    ] }
  ];
}

function decisionHelpEagle() {
  storyState.helpedEagle = true;
  runBeats([
    say(68, "Hare", "left", "*sigh* Hang on, I'll get you out.", "deepWoods", characters.Hare, characters.Eagle),
    frame(70, frames.hareFreesEagle, "deepWoods"),
    ...napBeats()
  ]);
}

function decisionIgnoreEagle() {
  storyState.helpedEagle = false;
  runBeats([
    say(68, "Hare", "left", "Sorry, birdie, I've got a race to win!", "deepWoods", characters.Hare, characters.Eagle),
    ...napBeats()
  ]);
}

function napBeats() {
  return [
    say(76, "Hare", "left", "A short nap doesn't hurt, right?", "restingTree", characters.Hare),
    { type: "choice", progress: 82, choices: [
      { text: "Hare Sleeps", action: decisionSleep },
      { text: "Continue the Race", action: decisionNoSleep }
    ] }
  ];
}

function decisionSleep() {
  storyState.slept = true;
  runBeats([
    frame(86, frames.hareSleeps, "restingTree"),
    ...endingBeats()
  ]);
}

function decisionNoSleep() {
  storyState.slept = false;
  runBeats(endingBeats());
}

function endingKey() {
  if (storyState.helpedEagle === true && storyState.slept === true) return "tie";
  if (storyState.helpedEagle === true && storyState.slept === false) return "hareWon";
  if (storyState.helpedEagle === false && storyState.slept === true) return "tortoiseWon";
  return "tortoiseAndEagleWon";
}

function endingBeats() {
  const key = endingKey();
  const last = {
    tie: say(92, "Eagle", "right", "I promised to help whoever helped me!", "finishLine", "", characters.Eagle),
    hareWon: say(92, "Eagle", "right", "Kindness and effort bring victory, Hare!", "finishLine", characters.Hare, characters.Eagle),
    tortoiseWon: narration(92, "When I opened my eyes, the crowd was cheering - the Tortoise had won!", "finishLine"),
    tortoiseAndEagleWon: say(92, "Eagle", "right", "He may be slow, but he's kind!", "finishLine", characters.Hare, characters.Eagle)
  }[key];
  return [last, { type: "end" }];
}

// --- Running the story -------------------------------------------------------------------
function runBeats(beats) {
  storyQueue = beats;
  currentStep = 0;
  advance();
}

function advance() {
  if (storyLocked || busy || waitingForChoice || finished || currentStep >= storyQueue.length) {
    return;
  }
  const beat = storyQueue[currentStep];
  currentStep += 1;
  if (beat.type === "end") {
    finishStory();
    return;
  }
  present(beat);
}

// The ending, as in every KoobD story: the scene fades to black and the
// ending page rises out of it.
async function finishStory() {
  finished = true;
  busy = true;
  stopChoiceTimer();
  saveReadingProgress(100);
  const ending = ENDINGS[endingKey()];
  storyCard.hide();
  await KoobdStory.fadeToBlack(storyRoot);
  KoobdStory.showEnding(storyRoot, {
    title: "The End",
    kicker: told(ending.title),
    lesson: told(ending.lesson),
    onPlayAgain: () => { window.location.href = storyUrl(""); },
    homeHref,
    onHome: goHome
  });
}

// Start the main beats at the beat saved with `progress`.
function startAt(progress, withTitle) {
  const beats = mainBeats();
  const index = Math.max(0, beats.findIndex((beat) => beat.progress === progress));
  storyQueue = withTitle ? [title(), ...beats] : beats;
  currentStep = withTitle ? 0 : index;
  advance();
}

function resumeStory(saved) {
  const progress = Math.max(0, Math.min(100, Math.round(saved.progress || 0)));
  storyState = Object.assign({ helpedEagle: null, slept: null }, saved.state || {});
  if (progress >= 100) {
    startAt(5, true);
    return;
  }
  if (progress <= 60) {
    const beats = mainBeats();
    const index = beats.findIndex((beat) => beat.progress === progress);
    storyQueue = beats;
    currentStep = index >= 0 ? index : 0;
    advance();
    return;
  }
  if (progress <= 70 && storyState.helpedEagle !== null) {
    runBeats(storyState.helpedEagle ? [frame(70, frames.hareFreesEagle, "deepWoods"), ...napBeats()] : napBeats());
    return;
  }
  if (progress <= 82) {
    runBeats(napBeats());
    return;
  }
  runBeats(storyState.slept === true ? [frame(86, frames.hareSleeps, "restingTree"), ...endingBeats()] : endingBeats());
}

// --- Reader input -------------------------------------------------------------------------
document.addEventListener("click", (event) => {
  if (event.target.closest("button, a, .koobd-pause")) {
    return;
  }
  advance();
});

document.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && !event.target.closest("button, a")) {
    event.preventDefault();
    advance();
  }
});

// The exit button opens KoobD's shared pause page: Continue, Restart, or
// Home (progress is saved). The story - and a choice's timer - wait meanwhile.
const pause = KoobdStory.createPauseScreen({
  onOpen: () => { storyLocked = true; },
  onResume: () => { storyLocked = false; },
  onRestart: () => { window.location.href = storyUrl(""); },
  onHome: goHome
});
backHomeBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  pause.open();
});

// --- Begin ----------------------------------------------------------------------------------
const savedStory = readSavedProgress();
if (resumeRequested && savedStory) {
  storyRoot.classList.remove("is-title-intro");
  resumeStory(savedStory);
} else {
  saveReadingProgress(0);
  startAt(5, true);
}
