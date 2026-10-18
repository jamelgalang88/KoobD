// KoobD's lite mode for slower devices (e.g. the Samsung Galaxy Tab A7 Lite).
// Loaded in every page's <head>, before anything is drawn. It sets
// html.koobd-lite, which css/mobile.css uses to drop the effects that cost a
// weak graphics chip the most - background blurs, drop shadows, decorative
// sway and glow - while every character, hazard, platform, line of dialogue
// and story moment stays exactly as it is.
//
// Lite mode comes on by itself when the device says it has little memory
// (2 GB or less), when the reader asked for reduced motion or data saving,
// or when the page measures a low frame rate. A choice made with
// KoobdPerformance.set('lite' | 'full' | 'auto') is kept on this device.
(function () {
  var root = document.documentElement;
  var STORE = 'koobd-performance';
  var MEASURED = 'koobd-performance-measured';

  function read(storage, key) {
    try { return window[storage].getItem(key); } catch (error) { return null; }
  }
  function write(storage, key, value) {
    try {
      if (value === null) window[storage].removeItem(key);
      else window[storage].setItem(key, value);
    } catch (error) {
      // Storage can be unavailable (private windows); the mode still applies.
    }
  }

  var choice = read('localStorage', STORE); // 'lite' | 'full' | null (auto)
  var memory = Number(navigator.deviceMemory) || 0;
  var connection = navigator.connection || {};
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lowEndDevice = (memory > 0 && memory <= 2) || connection.saveData === true || reducedMotion;

  function apply(lite) {
    root.classList.toggle('koobd-lite', Boolean(lite));
  }

  apply(choice === 'lite' || (choice !== 'full' && (lowEndDevice || read('sessionStorage', MEASURED) === 'lite')));

  // Auto mode on a device that did not say it is slow: watch the frame rate
  // for a moment once the page has settled. Well under 40 frames a second
  // means the device is struggling, and lite mode stays on for this visit.
  function measure() {
    if (choice || root.classList.contains('koobd-lite') || !window.requestAnimationFrame) return;
    if (document.visibilityState !== 'visible') return;
    var gaps = [];
    var last = 0;
    function frame(now) {
      if (document.visibilityState !== 'visible') return; // a hidden tab is throttled; not a fair measure
      if (last) gaps.push(now - last);
      last = now;
      if (gaps.length < 90) { window.requestAnimationFrame(frame); return; }
      gaps.sort(function (a, b) { return a - b; });
      var median = gaps[gaps.length >> 1];
      if (median > 25) {
        write('sessionStorage', MEASURED, 'lite');
        apply(true);
      }
    }
    window.requestAnimationFrame(frame);
  }
  if (document.readyState === 'complete') window.setTimeout(measure, 1500);
  else window.addEventListener('load', function () { window.setTimeout(measure, 1500); }, { once: true });

  window.KoobdPerformance = {
    isLite: function () { return root.classList.contains('koobd-lite'); },
    // 'lite' or 'full' to choose, 'auto' to let the device decide again.
    set: function (mode) {
      choice = mode === 'lite' || mode === 'full' ? mode : null;
      write('localStorage', STORE, choice);
      write('sessionStorage', MEASURED, null);
      apply(choice === 'lite' || (choice !== 'full' && lowEndDevice));
    }
  };
})();
