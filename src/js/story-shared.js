// KoobD shared story system - the parts of a story every story shares,
// whatever its mode (styles in css/story-shared.css):
//   - the story card: the black title page, narration on black, and
//     full-screen storyboard frames, with the same transitions everywhere
//     (dissolve in from the scene, crossfade / dip / flash between frames,
//     dissolve back out);
//   - the fade through black when the story moves to another place;
//   - the place name shown at the top centre on arrival;
//   - the ending page: "The End", the lesson, and Play Again / Choose Stage /
//     Home, with the list of stages to start from.
// Platform Mode (js/platformer-story-player.js) adds its world and controls on
// top of the same system; Story Mode pages use this file directly.
(function () {
  // Timings - keep in step with css/story-shared.css.
  const TITLE_FADE_MS = 450;
  const STORY_CARD_SWAP_MS = 250;
  const STORY_FRAME_OUT_MS = 350;
  const STORY_FRAME_IN_DELAY_MS = 150;
  const STORY_CARD_BACKDROP_MS = 300;
  const FRAME_DISSOLVE_MS = 450;
  const FRAME_CROSSFADE_MS = 500;
  const FRAME_FLASH_MS = 600;
  const SCENE_FADE_MS = 400;
  const PAGE_HOLD_MS = 120;
  const AREA_TITLE_HOLD_MS = 3400;

  function whenImageReady(src, ready, waitMs) {
    let done = false;
    const go = () => {
      if (!done) {
        done = true;
        ready();
      }
    };
    if (!src) {
      go();
      return;
    }
    const probe = new Image();
    probe.src = src;
    if (probe.complete && probe.naturalWidth) {
      go();
      return;
    }
    (probe.decode ? probe.decode() : Promise.resolve()).then(go, go);
    probe.addEventListener("load", go, { once: true });
    probe.addEventListener("error", go, { once: true });
    window.setTimeout(go, waitMs);
  }

  // The story card. `root` is the story's root element (it gets
  // `is-title-intro` while a black page covers it); `onAdvance` is called
  // when the reader taps the card.
  function createStoryCard(root, onAdvance) {
    const card = document.createElement("div");
    card.className = "vn-story-card is-stage-title";
    card.setAttribute("translate", "no");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-hidden", "true");
    const frame = document.createElement("figure");
    frame.className = "vn-story-card-frame";
    const image = document.createElement("img");
    image.alt = "";
    frame.appendChild(image);
    const text = document.createElement("p");
    text.className = "vn-story-card-text";
    card.append(frame, text);
    root.appendChild(card);
    card.addEventListener("click", (event) => {
      event.stopPropagation();
      if (typeof onAdvance === "function") onAdvance();
    });

    let swapTimer = 0;
    let crossfadeTimer = 0;
    const imageOf = () => (card.classList.contains("has-image") ? image.getAttribute("src") || "" : "");
    const setVisible = (show) => {
      card.classList.toggle("visible", show);
      card.setAttribute("aria-hidden", show ? "false" : "true");
    };

    function crossfade(nextImage, apply, flash) {
      frame.querySelectorAll(".vn-story-card-under").forEach((node) => node.remove());
      const under = document.createElement("img");
      under.className = "vn-story-card-under";
      under.alt = "";
      under.src = image.getAttribute("src") || "";
      frame.insertBefore(under, image);
      card.classList.remove("is-crossfading", "is-flashing");
      void card.offsetWidth;
      whenImageReady(nextImage, () => {
        apply();
        card.classList.add(flash ? "is-flashing" : "is-crossfading");
        window.clearTimeout(crossfadeTimer);
        crossfadeTimer = window.setTimeout(() => {
          under.remove();
          card.classList.remove("is-crossfading", "is-flashing");
        }, flash ? FRAME_FLASH_MS : FRAME_CROSSFADE_MS);
      }, 250);
    }

    // mode: 'title' | 'narration' | 'frame'; transition (frame to frame):
    // 'crossfade' (default), 'dip' (through black) or 'flash' (through white).
    function show(content, mode, imageSrc, transition) {
      window.clearTimeout(swapTimer);
      const nextText = content || "";
      const nextImage = imageSrc || "";
      const apply = () => {
        text.textContent = nextText;
        card.classList.toggle("is-narration", mode === "narration");
        card.classList.toggle("is-frame", mode === "frame");
        if (nextImage) image.src = nextImage;
        image.alt = mode === "frame" ? nextText : "";
        card.classList.toggle("has-image", Boolean(nextImage));
        card.classList.remove("is-swapping");
      };
      const alreadyShowing = card.classList.contains("visible") && !card.classList.contains("hiding");
      card.classList.remove("hiding", "backdrop-out", "is-dissolving");
      setVisible(true);
      // A black page covers the scene at once; a frame instead dissolves in
      // over the scene, so it is not blacked out first.
      if (!(mode === "frame" && !alreadyShowing)) root.classList.add("is-title-intro");
      const switchingFrames = alreadyShowing && mode === "frame" && card.classList.contains("is-frame")
        && imageOf() && imageOf() !== nextImage && transition !== "dip";
      if (switchingFrames) {
        crossfade(nextImage, apply, transition === "flash");
      } else if (!alreadyShowing) {
        card.classList.add("text-pending");
        const reveal = () => card.classList.remove("text-pending");
        const begin = () => {
          apply();
          void card.offsetWidth;
          requestAnimationFrame(() => requestAnimationFrame(reveal));
          window.setTimeout(reveal, 80);
        };
        if (mode === "frame") whenImageReady(nextImage, begin, 300); else begin();
      } else if (text.textContent !== nextText || imageOf() !== nextImage) {
        const leavingFrame = card.classList.contains("is-frame");
        const swapMs = leavingFrame ? STORY_FRAME_OUT_MS : (mode === "frame" ? STORY_FRAME_IN_DELAY_MS : STORY_CARD_SWAP_MS);
        card.classList.add("is-swapping");
        swapTimer = window.setTimeout(() => {
          card.classList.add("text-pending");
          apply();
          void card.offsetWidth;
          const reveal = () => card.classList.remove("text-pending");
          requestAnimationFrame(() => requestAnimationFrame(reveal));
          window.setTimeout(reveal, 60);
        }, swapMs);
      } else {
        apply();
      }
    }

    // Back to the scene: a frame dissolves straight into it; a black page
    // fades its text, then the page itself.
    function hide() {
      if (!card.classList.contains("visible")) return Promise.resolve();
      window.clearTimeout(swapTimer);
      return new Promise((resolve) => {
        if (card.classList.contains("is-frame")) {
          root.classList.remove("is-title-intro");
          card.classList.add("hiding", "is-dissolving");
          window.setTimeout(() => {
            if (card.classList.contains("hiding")) {
              window.clearTimeout(crossfadeTimer);
              frame.querySelectorAll(".vn-story-card-under").forEach((node) => node.remove());
              setVisible(false);
              card.classList.remove("hiding", "is-dissolving", "is-narration", "is-frame", "backdrop-out", "has-image", "is-crossfading", "is-flashing");
              text.textContent = "";
            }
            resolve();
          }, FRAME_DISSOLVE_MS);
          return;
        }
        card.classList.add("hiding");
        window.setTimeout(() => {
          if (!card.classList.contains("hiding")) {
            resolve();
            return;
          }
          root.classList.remove("is-title-intro");
          card.classList.add("backdrop-out");
          window.setTimeout(() => {
            if (card.classList.contains("hiding")) {
              setVisible(false);
              card.classList.remove("hiding", "is-narration", "is-frame", "backdrop-out", "has-image");
              text.textContent = "";
            }
            resolve();
          }, STORY_CARD_BACKDROP_MS);
        }, TITLE_FADE_MS);
      });
    }

    return {
      show,
      hide,
      isShowing: () => card.classList.contains("visible") && !card.classList.contains("hiding"),
      element: card
    };
  }

  // Through black and back: the story changes place behind the black page.
  function fadeToBlack(root) {
    root.classList.add("is-scene-transitioning");
    return new Promise((resolve) => window.setTimeout(resolve, SCENE_FADE_MS + PAGE_HOLD_MS));
  }
  function fadeFromBlack(root) {
    root.classList.remove("is-scene-transitioning");
    return new Promise((resolve) => window.setTimeout(resolve, SCENE_FADE_MS));
  }

  // The place name, at the top centre, on arriving somewhere new.
  function createAreaTitle(root) {
    const node = document.createElement("div");
    node.className = "platformer-area-title";
    node.setAttribute("translate", "no");
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.innerHTML = '<span class="platformer-area-name"></span><span class="platformer-area-time"></span>';
    root.appendChild(node);
    let hideTimer = 0;
    return {
      show(name, time) {
        node.querySelector(".platformer-area-name").textContent = name || "";
        node.querySelector(".platformer-area-time").textContent = time || "";
        node.classList.toggle("has-time", Boolean(time));
        node.classList.add("is-visible");
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => node.classList.remove("is-visible"), AREA_TITLE_HOLD_MS);
      },
      hide() {
        window.clearTimeout(hideTimer);
        node.classList.remove("is-visible");
      }
    };
  }

  // The ending page. `options`: { title, kicker, lesson, playAgainHref,
  // homeHref, stages: [{ name, href }] }. The story fades to black first.
  function showEnding(root, options) {
    const opts = options || {};
    root.querySelectorAll(".ending-screen").forEach((node) => node.remove());
    root.classList.add("is-story-ended");
    const screen = document.createElement("div");
    screen.className = "ending-screen";
    screen.setAttribute("role", "dialog");
    screen.setAttribute("aria-modal", "true");
    screen.setAttribute("aria-labelledby", "koobdEndingTitle");
    const content = document.createElement("div");
    content.className = "ending-content";
    const heading = document.createElement("h1");
    heading.id = "koobdEndingTitle";
    heading.textContent = opts.title || "The End";
    content.appendChild(heading);
    if (opts.kicker) {
      const kicker = document.createElement("p");
      kicker.className = "ending-kicker";
      kicker.setAttribute("translate", "no");
      kicker.textContent = opts.kicker;
      content.appendChild(kicker);
    }
    if (opts.lesson) {
      const lesson = document.createElement("p");
      lesson.className = "ending-lesson";
      lesson.setAttribute("translate", "no");
      lesson.textContent = opts.lesson;
      content.appendChild(lesson);
    }
    const buttons = document.createElement("div");
    buttons.className = "ending-buttons";
    const playAgain = document.createElement("a");
    playAgain.className = "choice-btn blue-btn";
    playAgain.href = opts.playAgainHref || "#";
    playAgain.textContent = "Play Again";
    if (typeof opts.onPlayAgain === "function") {
      playAgain.addEventListener("click", (event) => {
        event.preventDefault();
        opts.onPlayAgain();
      });
    }
    buttons.appendChild(playAgain);
    // Extra links, e.g. "Back to Editor" when a teacher is testing a story.
    (Array.isArray(opts.extraButtons) ? opts.extraButtons : []).forEach((extra) => {
      const link = document.createElement("a");
      link.className = `choice-btn ${extra.className || "gray-btn"}`;
      link.href = extra.href;
      link.textContent = extra.label;
      buttons.appendChild(link);
    });
    const stages = Array.isArray(opts.stages) ? opts.stages : [];
    let stageList = null;
    if (stages.length) {
      const choose = document.createElement("button");
      choose.type = "button";
      choose.className = "choice-btn gray-btn";
      choose.textContent = "Choose Stage";
      choose.addEventListener("click", () => content.classList.add("is-choosing-stage"));
      buttons.appendChild(choose);
      stageList = document.createElement("div");
      stageList.className = "ending-stages";
      stageList.innerHTML = '<p class="ending-stages-title">Choose a stage</p><div class="ending-stage-grid"></div>';
      const grid = stageList.querySelector(".ending-stage-grid");
      stages.forEach((stage, index) => {
        const link = document.createElement("a");
        link.className = "ending-stage";
        link.href = stage.href;
        const number = document.createElement("span");
        number.className = "ending-stage-number";
        number.textContent = String(index + 1);
        const name = document.createElement("span");
        name.className = "ending-stage-name";
        name.setAttribute("translate", "no");
        name.textContent = stage.name;
        link.append(number, name);
        grid.appendChild(link);
      });
      const back = document.createElement("button");
      back.type = "button";
      back.className = "ending-stages-back";
      back.innerHTML = "&larr; Back";
      back.addEventListener("click", () => content.classList.remove("is-choosing-stage"));
      stageList.appendChild(back);
    }
    const home = document.createElement("a");
    home.className = "choice-btn gray-btn";
    home.href = opts.homeHref || "home.php";
    home.textContent = "Home";
    if (typeof opts.onHome === "function") {
      home.addEventListener("click", (event) => {
        event.preventDefault();
        opts.onHome();
      });
    }
    buttons.appendChild(home);
    content.appendChild(buttons);
    if (stageList) content.appendChild(stageList);
    screen.appendChild(content);
    root.appendChild(screen);
    return screen;
  }

  // The pause page every KoobD story shares, opened by the story's exit
  // button: the story blurred and dimmed behind "Paused", a line saying progress
  // is kept, and Continue / Restart / Home. `options`: { onOpen, onResume,
  // onRestart, onHome, message }. While it is open the document gets
  // "koobd:pause" (and "koobd:resume" when it closes), so a game behind it
  // (the platform engine) holds still. Escape pauses, and Escape again continues.
  function createPauseScreen(options) {
    const opts = options || {};
    let open = false;
    const screen = document.createElement("div");
    screen.className = "koobd-pause";
    screen.hidden = true;
    screen.setAttribute("role", "dialog");
    screen.setAttribute("aria-modal", "true");
    screen.setAttribute("aria-labelledby", "koobdPauseTitle");
    screen.innerHTML =
      '<div class="koobd-pause-content">' +
        '<h1 id="koobdPauseTitle">Paused</h1>' +
        '<p class="koobd-pause-copy"></p>' +
        '<div class="koobd-pause-buttons">' +
          '<button type="button" class="koobd-pause-btn is-primary" data-act="resume">Continue</button>' +
          '<button type="button" class="koobd-pause-btn" data-act="restart">Restart</button>' +
          '<button type="button" class="koobd-pause-btn" data-act="home">Home</button>' +
        '</div>' +
      '</div>';
    screen.querySelector(".koobd-pause-copy").textContent =
      opts.message || "Your progress is saved, so you can come back to the story anytime.";
    if (typeof opts.onRestart !== "function") screen.querySelector('[data-act="restart"]').remove();
    // Clicks on the page never reach the story beneath it.
    ["click", "pointerdown", "touchstart"].forEach((type) =>
      screen.addEventListener(type, (event) => event.stopPropagation()));
    screen.addEventListener("click", (event) => {
      const act = event.target.closest("[data-act]")?.dataset.act;
      if (act === "resume") close();
      else if (act === "restart") opts.onRestart();
      else if (act === "home") {
        if (typeof opts.onHome === "function") opts.onHome();
        else window.location.href = "home.php";
      }
    });
    document.addEventListener("keydown", (event) => {
      if (!open) {
        // Escape pauses, as the exit button does - except on the ending page.
        if (event.key === "Escape" && !event.repeat && !document.querySelector(".is-story-ended")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          show();
        }
        return;
      }
      // The story's own keys (move, jump, advance) wait while paused.
      // (A focused pause button still works: its default action is untouched.)
      if (event.key === "Escape" && !event.repeat) { event.preventDefault(); close(); }
      event.stopImmediatePropagation();
    }, true);
    document.body.appendChild(screen);

    function show() {
      if (open) return;
      open = true;
      screen.hidden = false;
      document.body.classList.add("is-koobd-paused");
      document.dispatchEvent(new CustomEvent("koobd:pause"));
      if (typeof opts.onOpen === "function") opts.onOpen();
      window.setTimeout(() => screen.querySelector(".is-primary")?.focus({ preventScroll: true }), 60);
    }
    function close() {
      if (!open) return;
      open = false;
      screen.hidden = true;
      document.body.classList.remove("is-koobd-paused");
      document.dispatchEvent(new CustomEvent("koobd:resume"));
      if (typeof opts.onResume === "function") opts.onResume();
    }
    return { open: show, close, isOpen: () => open, element: screen };
  }

  window.KoobdStory = { createStoryCard, createAreaTitle, fadeToBlack, fadeFromBlack, showEnding, whenImageReady, createPauseScreen };
})();
