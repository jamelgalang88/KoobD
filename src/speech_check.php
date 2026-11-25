<?php
// A quick check of what this browser allows for KoobD's listening and
// speaking practice (js/koobd-speech.js): open it on a tablet or phone to see
// whether the address counts as secure, and whether the microphone, speech
// recognition and voices are there. Nothing is saved or sent anywhere.
header('Cache-Control: no-store');
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KoobD - Speech check</title>
  <style>
    body{margin:0;padding:16px;background:#e9edf5;color:#1b2440;font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}
    main{max-width:640px;margin:0 auto;padding:18px;border:1px solid #cfd7e6;border-radius:18px;background:#fff;}
    h1{margin:0 0 4px;font-size:22px;}
    p{margin:0 0 14px;color:#46527a;}
    ul{margin:0;padding:0;list-style:none;}
    li{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid #e3e8f3;}
    .mark{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:900;}
    .ok{background:#1d8f6a;} .no{background:#c0394f;}
    .label{font-weight:800;} .detail{display:block;color:#56607f;font-size:14px;overflow-wrap:anywhere;}
    button{min-height:48px;margin-top:14px;padding:0 18px;border:0;border-radius:12px;background:#4f63d6;color:#fff;font:inherit;font-weight:900;}
    #mic{margin-top:10px;font-weight:800;}
  </style>
</head>
<body>
  <main>
    <h1>Speech check</h1>
    <p>What this browser allows for listening and speaking practice. Show this screen to your teacher if something is red.</p>
    <ul id="list"></ul>
    <button type="button" id="test">Test the microphone</button>
    <p id="mic" role="status"></p>
  </main>
  <script>
    (function () {
      const list = document.getElementById('list');
      const ua = navigator.userAgent;
      const browser = /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /EdgA?\//.test(ua) ? 'Microsoft Edge' : /Firefox/.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Google Chrome' : 'Another browser';
      const version = (ua.match(/(?:Chrome|SamsungBrowser|Firefox|EdgA?)\/([\d.]+)/) || [])[1] || '';
      const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
      function row(ok, label, detail) {
        const item = document.createElement('li');
        item.innerHTML = '<span class="mark ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓' : '!') + '</span><span><span class="label"></span><span class="detail"></span></span>';
        item.querySelector('.label').textContent = label;
        item.querySelector('.detail').textContent = detail;
        list.appendChild(item);
      }
      // Inside the KoobD Android app, Android's own speech services are used
      // (the browser lines below do not matter there).
      const cap = window.Capacitor;
      const inApp = Boolean(cap && cap.isNativePlatform && cap.isNativePlatform());
      const plugins = inApp && cap.Plugins ? cap.Plugins : {};
      function draw() {
        list.textContent = '';
        if (inApp) {
          row(Boolean(plugins.SpeechRecognition), 'KoobD app: speech recognition', plugins.SpeechRecognition ? 'Android speech recognition is used for "Say it" (needs internet when used).' : 'Missing: update the KoobD app.');
          row(Boolean(plugins.TextToSpeech), 'KoobD app: reading aloud', plugins.TextToSpeech ? 'Android voices are used for Listen and tap-a-word.' : 'Missing: update the KoobD app.');
        }
        row(browser === 'Google Chrome' || browser === 'Microsoft Edge', 'Browser: ' + browser + (version ? ' ' + version : ''), browser === 'Samsung Internet' ? 'Open KoobD in Google Chrome instead: the Chrome setting does not apply to Samsung Internet.' : ua);
        row(window.isSecureContext, 'Address counts as secure: ' + (window.isSecureContext ? 'yes' : 'no'), location.origin + (window.isSecureContext ? '' : ' - the microphone is blocked here. In Chrome, add exactly this address to chrome://flags/#unsafely-treat-insecure-origin-as-secure, enable it and relaunch.'));
        row(Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia), 'Microphone access available', navigator.mediaDevices ? 'yes' : 'no (blocked because the address is not secure)');
        row(Boolean(window.MediaRecorder), 'Recording available', window.MediaRecorder ? 'yes' : 'no');
        row(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition), 'Speech recognition ("Say it")', (window.SpeechRecognition || window.webkitSpeechRecognition) ? 'yes (needs internet when used)' : 'no - use Google Chrome');
        const filipino = voices.filter((voice) => /^(fil|tl)/i.test(voice.lang));
        row(voices.length > 0, 'Voices for reading aloud: ' + voices.length, filipino.length ? 'Filipino voice: ' + filipino.map((voice) => voice.name).join(', ') : 'No Filipino voice (Tagalog is read by the closest one)');
        row(navigator.onLine, 'Internet: ' + (navigator.onLine ? 'connected' : 'offline'), 'Speaking practice needs the internet; everything else works without it.');
      }
      draw();
      if (window.speechSynthesis) speechSynthesis.addEventListener('voiceschanged', () => { voices.splice(0, voices.length, ...speechSynthesis.getVoices()); draw(); });
      document.getElementById('test').addEventListener('click', async () => {
        const out = document.getElementById('mic');
        if (inApp && plugins.SpeechRecognition) {
          // In the app: ask Android to listen once and show what it heard.
          try {
            await plugins.SpeechRecognition.requestPermissions();
            out.textContent = 'Listening… say something.';
            const result = await plugins.SpeechRecognition.start({ language: 'en-US', maxResults: 1, partialResults: false, popup: false });
            out.textContent = '✓ The microphone works here. Heard: "' + ((result && result.matches && result.matches[0]) || '') + '"';
          } catch (error) {
            out.textContent = 'Listening did not work: ' + ((error && error.message) || error);
          }
          return;
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { out.textContent = 'The browser does not allow the microphone on this address.'; return; }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
          out.textContent = '✓ The microphone works here.';
        } catch (error) {
          out.textContent = 'The microphone did not start: ' + error.name + (error.message ? ' - ' + error.message : '');
        }
      });
    })();
  </script>
</body>
</html>
