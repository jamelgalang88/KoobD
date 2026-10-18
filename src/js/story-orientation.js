// Story pages are made for landscape. On a phone or tablet held upright, a
// friendly "turn your device sideways" card covers the story until the device
// is rotated; it disappears by itself the moment it is, and the story carries
// on where it was. Only story pages load this script, so Home and the rest of
// the app work in either orientation.
//
// Stories also play full screen (no address bar): on a phone or tablet from the
// reader's first tap (browsers only allow it after a tap), and anywhere with
// the full-screen button under the page's top-right button. When KoobD is
// installed as an app (manifest.webmanifest) it already has no address bar, so
// none of this is needed there.
(function () {
  const coarsePointer = window.matchMedia("(pointer: coarse)");
  const portraitMedia = window.matchMedia("(orientation: portrait)");
  let initialized = false;
  let gestureBound = false;

  // Phones and tablets (touch screens); a desktop browser window is never
  // asked to rotate, whatever its shape.
  function isCompactDevice() {
    return coarsePointer.matches || navigator.maxTouchPoints > 0;
  }

  // Opened from the home screen as an installed app: there is no address bar.
  function isInstalledApp() {
    return window.matchMedia("(display-mode: fullscreen)").matches
      || window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
  }

  // Whether this browser lets a page go full screen (iPhone Safari does not).
  function canFullscreen() {
    const root = document.documentElement;
    return Boolean(document.fullscreenEnabled && root && typeof root.requestFullscreen === "function") && !isInstalledApp();
  }

  // The card is part of every story page: built here once if the page does
  // not already have it.
  function ensureRotatePrompt() {
    if (!document.body || document.getElementById("storyRotatePrompt")) {
      return;
    }
    const prompt = document.createElement("div");
    prompt.className = "story-rotate-prompt";
    prompt.id = "storyRotatePrompt";
    prompt.setAttribute("role", "dialog");
    prompt.setAttribute("aria-modal", "true");
    prompt.setAttribute("aria-labelledby", "storyRotateTitle");
    prompt.setAttribute("aria-hidden", "true");
    prompt.innerHTML =
      '<div class="story-rotate-card">' +
        '<div class="story-rotate-icon" aria-hidden="true"></div>' +
        '<h2 id="storyRotateTitle">Please rotate your device</h2>' +
        '<p>Stories are made for landscape. Turn your phone or tablet sideways and the story will carry on right where you are.</p>' +
        '<a class="story-rotate-home" href="home.php">Back to home</a>' +
      '</div>';
    prompt.querySelector(".story-rotate-home").addEventListener("click", function (event) {
      event.preventDefault();
      exitToMain("home.php");
    });
    document.body.appendChild(prompt);
  }

  function syncBodyClasses() {
    if (!document.body) {
      return;
    }

    ensureRotatePrompt();
    const compact = isCompactDevice();
    const portrait = compact && portraitMedia.matches;
    document.body.classList.toggle("story-compact-device", compact);
    document.body.classList.toggle("story-portrait-active", portrait);
    const prompt = document.getElementById("storyRotatePrompt");
    if (prompt) {
      prompt.setAttribute("aria-hidden", portrait ? "false" : "true");
    }
  }

  async function lockOrientation(target) {
    if (!screen.orientation || typeof screen.orientation.lock !== "function") {
      return false;
    }

    try {
      await screen.orientation.lock(target);
      return true;
    } catch (error) {
      return false;
    }
  }

  async function requestFullscreen() {
    const root = document.documentElement;
    if (!root || typeof root.requestFullscreen !== "function" || document.fullscreenElement) {
      return false;
    }

    try {
      await root.requestFullscreen({ navigationUI: "hide" });
      return true;
    } catch (error) {
      return false;
    }
  }

  async function requestLandscape(mode) {
    if (!isCompactDevice()) {
      syncBodyClasses();
      return false;
    }

    syncBodyClasses();

    // The first tap on a phone or tablet: the story goes full screen.
    if (mode === "gesture" && canFullscreen() && !document.fullscreenElement) {
      await requestFullscreen();
    }

    if (!portraitMedia.matches) {
      return true;
    }

    let locked = await lockOrientation("landscape");
    if (locked) {
      syncBodyClasses();
      return true;
    }

    if (mode === "gesture" && document.fullscreenElement) {
      // Some browsers only lock the orientation while full screen.
      locked = await lockOrientation("landscape");
      if (locked) {
        syncBodyClasses();
        return true;
      }
    }

    syncBodyClasses();
    return false;
  }

  function bindGestureAttempt() {
    if (gestureBound) {
      return;
    }

    gestureBound = true;

    const tryLandscape = (event) => {
      // Never on a game control: switching to fullscreen mid-press would
      // cancel that press. The next tap anywhere else does it instead. (The
      // full-screen button does its own thing.)
      if (event && event.target && event.target.closest && event.target.closest(".platformer-story-controls, .story-fullscreen-btn")) {
        return;
      }
      requestLandscape("gesture");
      document.removeEventListener("pointerdown", tryLandscape, true);
      document.removeEventListener("touchstart", tryLandscape, true);
      document.removeEventListener("keydown", tryLandscape, true);
    };

    document.addEventListener("pointerdown", tryLandscape, true);
    document.addEventListener("touchstart", tryLandscape, true);
    document.addEventListener("keydown", tryLandscape, true);
  }

  // The full-screen button: just under the page's top-right button (pause,
  // back to class, continue editing), so it never covers the story's own
  // labels; it shows whether the story is full screen, and switches it.
  let fullscreenButton = null;
  function placeFullscreenButton() {
    if (!fullscreenButton) {
      return;
    }
    const corner = document.querySelector(".top-right");
    const rect = corner && corner.getClientRects().length ? corner.getBoundingClientRect() : null;
    if (!rect || !rect.width) {
      fullscreenButton.style.top = "";
      fullscreenButton.style.right = "";
      return;
    }
    // Centred under a round button; lined up with the right end of a wide one.
    const inset = rect.width < 60 ? (rect.width - 38) / 2 : 0;
    fullscreenButton.style.top = Math.round(rect.bottom + 8) + "px";
    fullscreenButton.style.right = Math.max(8, Math.round(window.innerWidth - rect.right + inset)) + "px";
  }
  function syncFullscreenButton() {
    if (!fullscreenButton) {
      return;
    }
    const on = Boolean(document.fullscreenElement);
    const label = on ? "Exit full screen" : "Full screen";
    fullscreenButton.classList.toggle("is-on", on);
    fullscreenButton.setAttribute("aria-pressed", on ? "true" : "false");
    fullscreenButton.setAttribute("aria-label", label);
    fullscreenButton.title = label;
    placeFullscreenButton();
  }
  function ensureFullscreenButton() {
    if (fullscreenButton || !document.body || !canFullscreen()) {
      return;
    }
    fullscreenButton = document.createElement("button");
    fullscreenButton.type = "button";
    fullscreenButton.className = "story-fullscreen-btn";
    fullscreenButton.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" class="story-fullscreen-enter"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true" class="story-fullscreen-exit"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
    fullscreenButton.addEventListener("click", function (event) {
      event.stopPropagation();
      if (document.fullscreenElement) {
        releaseFullscreen();
      } else {
        // Full screen first (it must start from the tap itself), then landscape on phones.
        requestFullscreen().then(function () { requestLandscape("gesture"); });
      }
    });
    // A tap on the button is not a tap on the story (it does not turn the page).
    ["pointerdown", "touchstart"].forEach(function (type) {
      fullscreenButton.addEventListener(type, function (event) { event.stopPropagation(); });
    });
    document.body.appendChild(fullscreenButton);
    document.addEventListener("fullscreenchange", syncFullscreenButton);
    window.addEventListener("resize", placeFullscreenButton);
    syncFullscreenButton();
    // The top-right button can appear or move after the story starts.
    window.setTimeout(placeFullscreenButton, 300);
  }

  function releaseFullscreen() {
    if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
      document.exitFullscreen().catch(() => {});
    }
  }

  function cleanupStoryMode() {
    try {
      if (screen.orientation && typeof screen.orientation.unlock === "function") {
        screen.orientation.unlock();
      }
    } catch (error) {
      // Ignore browsers that do not support manual unlock.
    }

    releaseFullscreen();
  }

  async function exitToMain(url) {
    if (isCompactDevice()) {
      await lockOrientation("portrait");
    }

    releaseFullscreen();
    window.location.href = url;
  }

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;
    syncBodyClasses();
    ensureFullscreenButton();
    requestLandscape("initial");
    bindGestureAttempt();

    window.addEventListener("resize", syncBodyClasses);
    window.addEventListener("orientationchange", syncBodyClasses);
    [portraitMedia, coarsePointer].forEach(function (media) {
      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", syncBodyClasses);
      }
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", syncBodyClasses);
    }
    // Some phone browsers and app webviews report a turn late or not at all:
    // a light check keeps the card in step with the device regardless.
    let lastState = "";
    window.setInterval(function () {
      const state = String(isCompactDevice()) + String(portraitMedia.matches);
      if (state !== lastState) {
        lastState = state;
        syncBodyClasses();
      }
    }, 500);
    window.addEventListener("pageshow", syncBodyClasses);
    window.addEventListener("pagehide", cleanupStoryMode);
  }

  window.storyReadingMode = {
    init,
    requestLandscape,
    exitToMain
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
