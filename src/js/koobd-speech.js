// Listening and speaking practice, in English or Filipino (window.KoobdSpeech).
//
//   Listen:  a 🔊 button reads text aloud with the device's own voice (no
//            internet needed when the voice is installed - Windows' voices,
//            Android's downloaded Google voices).
//   Words:   tap a word in a question to hear just that word.
//   Say it:  the student says a word or phrase; the browser turns their speech
//            into text (Chrome sends the audio to Google, so this one needs
//            internet and a secure https address) and it is compared with
//            what they were asked to say, allowing small slips. It checks the
//            words, not the accent.
//
// Languages: 'en-US', 'fil-PH', or 'auto' (Filipino when the text reads as
// Tagalog, else English). Nothing here is required: when a device cannot
// speak or listen, the buttons say so and the activity carries on.
(function () {
  if (window.KoobdSpeech) return;
  const synth = window.speechSynthesis || null;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  // Inside the KoobD Android app (mobile-app, Capacitor) the page runs in
  // Android's web view, which has neither the browser's speech recognition
  // nor dependable voices, and no microphone on a plain http address. There,
  // Android's own speech services are used instead, through the app's
  // plugins (@capacitor-community/speech-recognition and text-to-speech):
  // they need no https address and no browser setting.
  const capacitor = window.Capacitor;
  const inApp = Boolean(capacitor && typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform() && capacitor.Plugins);
  const NativeTTS = inApp ? capacitor.Plugins.TextToSpeech || null : null;
  const NativeSR = inApp ? capacitor.Plugins.SpeechRecognition || null : null;
  const PASS = 0.8;   // how close what was heard must be to count as right
  const CLOSE = 0.55; // "almost": worth another try

  // --- Language -----------------------------------------------------------------------------
  // Whether text is Tagalog or English, word by word: known common words of
  // either language count most; then how the word is built. Tagalog words
  // take prefixes (pag-, mag-, pagka-, naka-...), mark a glottal stop with a
  // hyphen (pagka-isa, mag-aral), repeat a syllable (kakain, lalaki), and
  // alternate consonants and vowels with letters Tagalog uses. English words
  // use c, f, j, q, v, x or z, pairs like th, sh, ck, and endings like -tion
  // or -er. A tie reads as English. Teachers can always choose the language.
  const TAGALOG = new Set(('ang ng mga sa si ni ay ako ikaw ka siya kami tayo kayo sila ko mo niya namin natin ninyo nila ito iyan iyon '
    + 'na pa po opo hindi oo at kung para nang may mayroon wala ano sino saan bakit paano kailan magandang maganda salamat ba din '
    + 'rin lang lamang kaya dahil pero tapos ngayon bukas kahapon araw gabi umaga hapon tanghali bata nanay tatay kuya ate lola lolo bahay '
    + 'kumain kain tubig mahal kita gusto ayaw tayong tara sige pagkatapos habang upang sapagkat subalit ating aming inyong kanilang '
    + 'aso pusa ibon isda puno bulaklak dahon buwan bituin ulan hangin langit lupa dagat ilog bundok bayan paaralan guro aklat libro '
    + 'lapis papel mesa upuan pinto bintana kama damit sapatos pagkain kanin tinapay gatas prutas saging mangga gulay itlog manok '
    + 'baboy baka isa dalawa tatlo apat lima anim pito walo siyam sampu pula puti itim berde dilaw asul malaki maliit mabuti masama '
    + 'masaya malungkot mabait matalino mataas mababa mainit malamig bago luma maganda pangit kaibigan pamilya anak kapatid tao '
    + 'puso isip mata ilong bibig tainga kamay paa ulo katawan laro takbo lakad tulog gising basa sulat awit sayaw tawa iyak '
    + 'pagmamahal kalayaan katapatan kabaitan pagkakaisa bayanihan paggalang pasasalamat').split(' '));
  const ENGLISH = new Set(('the a an and or of to in is are was were be been it its this that these those what which who whom you your he she '
    + 'they we i my me our his her their him them say word words read tell write answer question choose correct pronounce sound '
    + 'good morning afternoon evening night hello thank thanks please yes no not do does did how why where when can will would '
    + 'with for from on at by as if but so all one two three four five six seven eight nine ten dog cat sun moon tree book '
    + 'water paper house school friend family love happy sad big small red blue green yellow black white '
    + 'banana lemon mango melon tomato potato apple orange grape papaya coconut rice bread milk egg fish bird river lake').split(' '));
  function wordLean(word) {
    if (TAGALOG.has(word)) return 3;
    if (ENGLISH.has(word)) return -3;
    let lean = 0;
    const plain = word.replace(/-/g, '');
    if (/[cfjqvxz]/.test(plain)) lean -= 2;
    if (/(th|sh|ch|ph|wh|ck|ee|ea|tion|ght|ould)/.test(plain)) lean -= 2;
    if (/(ing|ed|ly|ness|ment|able|er)$/.test(plain) && plain.length > 4) lean -= 1.5;
    if (/([^aeiou]y|ey)$/.test(plain)) lean -= 1.5;
    if (/^[a-z]{2,6}-[a-z]/.test(word)) lean += 3; // pagka-isa, mag-aral, pag-ibig
    if (/^(pagka|pakiki|nakiki|pinaka|ipinag|ipag|pinag|nagka|magka|maka|naka|maki|naki|paki|pag|nag|mag|mang|nang|pang)/.test(plain) && plain.length > 4) lean += 2;
    if (/([bdghklmnprstwy][aeiou])\1/.test(plain)) lean += 1.5; // kakain, lalaki, bibili
    if (/ng[aeiou]/.test(plain) || /^ng/.test(plain)) lean += 1;
    if (/^[abdeghiklmnoprstuwy]+$/.test(plain) && !/[bdghklmprstwy]{2}/.test(plain.replace(/ng/g, 'N'))
      && (plain.length >= 4 || /[aeiou]$/.test(plain))) lean += 2;
    return lean;
  }
  function detectLang(text) {
    const words = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z]+(?:-[a-z]+)*/g) || [];
    if (!words.length) return 'en-US';
    const lean = words.reduce((sum, word) => sum + wordLean(word), 0);
    return lean > 0 ? 'fil-PH' : 'en-US';
  }
  function resolveLang(lang, text) {
    if (lang === 'en-US' || lang === 'fil-PH') return lang;
    return detectLang(text);
  }
  const langName = (lang) => (lang === 'fil-PH' ? 'Filipino' : 'English');

  // --- Speaking (text to speech) ----------------------------------------------------------
  let voices = [];
  function loadVoices() { voices = synth ? synth.getVoices() : []; }
  if (synth) {
    loadVoices();
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', loadVoices);
    else synth.onvoiceschanged = loadVoices;
  }
  // A voice for the language: one installed on the device first (works
  // without internet), else any that speaks it. Many computers have no
  // Filipino voice (Chrome on Windows has none; Microsoft Edge and Android's
  // Google voices do): Tagalog is then read by the closest-sounding voice -
  // Indonesian, then Malay, then Spanish - with the same clear vowels,
  // instead of with an English accent.
  const FALLBACKS = { 'fil-PH': [['fil', 'tl'], ['id'], ['ms'], ['es']], 'en-US': [['en-ph', 'en-us', 'en-gb', 'en']] };
  function voiceChoice(lang) {
    if (!voices.length) loadVoices();
    const steps = FALLBACKS[lang] || FALLBACKS['en-US'];
    for (let step = 0; step < steps.length; step += 1) {
      for (const prefix of steps[step]) {
        const matches = voices.filter((voice) => String(voice.lang || '').toLowerCase().replace('_', '-').startsWith(prefix));
        if (matches.length) return { voice: matches.find((voice) => voice.localService) || matches[0], exact: step === 0 };
      }
    }
    return { voice: null, exact: false };
  }
  const voiceFor = (lang) => voiceChoice(lang).voice;
  const hasVoice = (lang) => voiceChoice(lang).exact;
  // For teachers: which voice reads this language on this device, and how to
  // get the real one when it is missing ('' when all is well).
  function voiceNote(lang) {
    if (!synth || NativeTTS || lang !== 'fil-PH') return '';
    const choice = voiceChoice(lang);
    if (choice.exact) return '';
    const stand = choice.voice ? `It reads Tagalog with ${String(choice.voice.name).replace(/^(Google|Microsoft)\s+/, '')}, the closest-sounding voice it has.` : 'It reads Tagalog with its default voice.';
    return `This device has no Filipino voice. ${stand} For the real Filipino accent, use Microsoft Edge, or on Android install Filipino in Settings → Text-to-speech (Google).`;
  }

  let speakingButton = null;
  // A teacher's recording playing now (see playRecording()).
  let recording = null;
  function stop() {
    if (synth) synth.cancel();
    if (NativeTTS) NativeTTS.stop().catch(() => {});
    if (recording) { recording.pause(); recording = null; }
    if (speakingButton) speakingButton.classList.remove('is-speaking');
    speakingButton = null;
  }
  // Reads text aloud. Resolves when it ends (or at once when it cannot).
  function speak(text, lang = 'auto', { button = null, rate = 0.9 } = {}) {
    const words = String(text || '').trim();
    if ((!synth && !NativeTTS) || !words) return Promise.resolve(false);
    stop();
    const resolved = resolveLang(lang, words);
    if (NativeTTS) return nativeSpeak(words, resolved, button, rate);
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(words);
      const voice = voiceFor(resolved);
      // A stand-in voice (Indonesian for Tagalog) speaks in its own language.
      utterance.lang = voice ? voice.lang : resolved;
      if (voice) utterance.voice = voice;
      // A little slower than normal, for learners.
      utterance.rate = rate;
      // Read aloud at the reader's master volume (Sound settings; silent when muted).
      if (window.KoobdAudio) utterance.volume = window.KoobdAudio.level('voice');
      if (button) { speakingButton = button; button.classList.add('is-speaking'); }
      const done = () => {
        if (button) button.classList.remove('is-speaking');
        if (speakingButton === button) speakingButton = null;
        resolve(true);
      };
      utterance.onend = done;
      utterance.onerror = done;
      synth.speak(utterance);
    });
  }

  // In the app: Android's voice for the language. Filipino when the tablet has
  // it (Google's Filipino voice), else the closest-sounding one, as above.
  const nativeTags = {};
  async function nativeTag(lang) {
    if (nativeTags[lang]) return nativeTags[lang];
    const tries = lang === 'fil-PH' ? ['fil-PH', 'tl-PH', 'id-ID', 'ms-MY', 'es-ES'] : ['en-US', 'en-GB'];
    for (const tag of tries) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const { supported } = await NativeTTS.isLanguageSupported({ lang: tag });
        if (supported) { nativeTags[lang] = tag; return tag; }
      } catch (error) { /* try the next one */ }
    }
    nativeTags[lang] = lang;
    return lang;
  }
  async function nativeSpeak(words, lang, button, rate) {
    if (button) { speakingButton = button; button.classList.add('is-speaking'); }
    try {
      await NativeTTS.speak({ text: words, lang: await nativeTag(lang), rate });
    } catch (error) {
      // Stopped, or no voice: nothing more to do.
    }
    if (button) button.classList.remove('is-speaking');
    if (speakingButton === button) speakingButton = null;
    return true;
  }

  // Plays a teacher's own recording (a "Say it" phrase). Resolves false when
  // it cannot play, so the computer voice can read the text instead.
  function playRecording(url, button) {
    stop();
    return new Promise((resolve) => {
      const audio = new Audio(url);
      if (window.KoobdAudio) window.KoobdAudio.bindMedia(audio, 'voice');
      recording = audio;
      if (button) { speakingButton = button; button.classList.add('is-speaking'); }
      const done = (played) => {
        if (button) button.classList.remove('is-speaking');
        if (speakingButton === button) speakingButton = null;
        if (recording === audio) recording = null;
        resolve(played);
      };
      audio.addEventListener('ended', () => done(true));
      audio.addEventListener('error', () => done(false));
      audio.play().catch(() => done(false));
    });
  }

  // --- Listening (speech to text) ---------------------------------------------------------
  // Why the microphone cannot be used here, or '' when it can.
  function micProblem() {
    if (NativeSR) return navigator.onLine === false ? 'Speaking practice needs the internet. Connect, then try again.' : '';
    if (!Recognition) return 'This browser cannot listen. Use Google Chrome or Microsoft Edge to practise speaking.';
    if (!window.isSecureContext) return 'Speaking practice needs the secure (https) address of KoobD. Ask your teacher for it.';
    if (navigator.onLine === false) return 'Speaking practice needs the internet. Connect, then try again.';
    return '';
  }
  // Listens once. Resolves with what may have been said (best guesses first);
  // rejects with a message a student can act on.
  function hear(lang, { onStart } = {}) {
    if (NativeSR) return nativeHear(lang);
    return new Promise((resolve, reject) => {
      const problem = micProblem();
      if (problem) { reject(new Error(problem)); return; }
      stop();
      const recognition = new Recognition();
      recognition.lang = lang === 'fil-PH' ? 'fil-PH' : 'en-US';
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.maxAlternatives = 5;
      let settled = false;
      const finish = (fn, value) => { if (!settled) { settled = true; fn(value); } };
      recognition.onstart = () => onStart && onStart();
      recognition.onresult = (event) => {
        const result = event.results[0];
        const alternatives = [];
        for (let index = 0; index < result.length; index += 1) alternatives.push(result[index].transcript);
        finish(resolve, alternatives);
      };
      recognition.onerror = (event) => {
        const messages = {
          'no-speech': 'No voice was heard. Tap the microphone and speak clearly.',
          'audio-capture': 'No microphone was found on this device.',
          'not-allowed': 'The microphone is blocked. Allow the microphone for KoobD in the browser, then try again.',
          'service-not-allowed': 'The microphone is blocked. Allow the microphone for KoobD in the browser, then try again.',
          network: 'Speaking practice needs the internet. Connect, then try again.',
          'language-not-supported': `This device cannot listen in ${langName(lang)} yet.`
        };
        finish(reject, new Error(messages[event.error] || 'Listening stopped. Tap the microphone to try again.'));
      };
      recognition.onend = () => finish(reject, new Error('No voice was heard. Tap the microphone and speak clearly.'));
      try {
        recognition.start();
      } catch (error) {
        finish(reject, new Error('The microphone could not start. Try again.'));
      }
      // Never listen for more than 10 seconds.
      window.setTimeout(() => { try { recognition.stop(); } catch (error) { /* already stopped */ } }, 10000);
    });
  }

  // In the app: Android's speech recognition (Google's, which understands
  // Filipino). The first time, Android asks to allow the microphone.
  async function nativeHear(lang) {
    const problem = micProblem();
    if (problem) throw new Error(problem);
    stop();
    let permission = null;
    try { permission = await NativeSR.requestPermissions(); } catch (error) { permission = null; }
    if (permission && permission.speechRecognition && permission.speechRecognition !== 'granted') {
      throw new Error('The microphone is not allowed. Allow it in Settings → Apps → KoobD → Permissions, then try again.');
    }
    let available = true;
    try { ({ available } = await NativeSR.available()); } catch (error) { available = false; }
    if (!available) throw new Error('This device has no speech recognition. Install or update the Google app, then try again.');
    let result;
    try {
      result = await NativeSR.start({ language: lang === 'fil-PH' ? 'fil-PH' : 'en-US', maxResults: 5, partialResults: false, popup: false });
    } catch (error) {
      const text = String((error && error.message) || error || '');
      if (/network|server/i.test(text)) throw new Error('Speaking practice needs the internet. Connect, then try again.');
      if (/permission|insufficient/i.test(text)) throw new Error('The microphone is not allowed. Allow it in Settings → Apps → KoobD → Permissions, then try again.');
      if (/language/i.test(text)) throw new Error(`This device cannot listen in ${langName(lang)} yet.`);
      throw new Error('No voice was heard. Tap the microphone and speak clearly.');
    }
    const matches = ((result && result.matches) || []).filter(Boolean);
    if (!matches.length) throw new Error('No voice was heard. Tap the microphone and speak clearly.');
    return matches;
  }

  // --- Comparing ------------------------------------------------------------------------------
  // Text as it is compared: lower case, no accents or punctuation, single spaces.
  function normalize(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function distance(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const kept = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = kept;
      }
    }
    return row[b.length];
  }
  const letters = (a, b) => (a === b ? 1 : Math.max(0, 1 - distance(a, b) / Math.max(a.length, b.length, 1)));
  // 0..1: how close what was heard is to what was asked (the same rule as
  // the server's koobdSpeechScore()): how few letters differ, and how many of
  // the words were said (a word counts when it is nearly right), whichever is
  // lower - so a slip inside a word passes, but a different word does not.
  function similarity(target, heard) {
    const a = normalize(target);
    const b = normalize(heard);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const asked = a.split(' ');
    const said = b.split(' ');
    const used = new Set();
    let matched = 0;
    asked.forEach((word) => {
      const index = said.findIndex((other, position) => !used.has(position) && letters(word, other) >= 0.7);
      if (index >= 0) { used.add(index); matched += 1; }
    });
    return Math.min(letters(a, b), matched / Math.max(asked.length, said.length));
  }
  // The closest of what may have been said to any of the accepted phrases.
  function best(targets, alternatives) {
    let top = { heard: alternatives[0] || '', score: 0, target: targets[0] || '' };
    targets.forEach((target) => alternatives.forEach((heard) => {
      const score = similarity(target, heard);
      if (score > top.score) top = { heard, score, target };
    }));
    return top;
  }

  // --- Building blocks for pages ------------------------------------------------------------
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    [].concat(children).forEach((child) => child && node.append(child));
    return node;
  }
  function icon(paths) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = paths;
    return svg;
  }
  const ICONS = {
    speaker: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7"/>'
  };

  // A 🔊 button that reads `text` aloud (text and lang can be functions, read when tapped).
  // With `audio` (a URL, or a function giving one), the teacher's recording
  // plays instead, and the computer voice only when it cannot.
  function listenButton(text, lang = 'auto', { label = 'Listen', compact = false, audio = null } = {}) {
    const button = el('button', {
      type: 'button', class: `ks-listen${compact ? ' is-compact' : ''}`,
      'aria-label': `${label}${typeof text === 'string' ? `: ${text}` : ''}`, title: label
    }, [icon(ICONS.speaker), compact ? null : el('span', { text: label })]);
    if (!synth && !NativeTTS && !audio) { button.disabled = true; button.title = 'This device cannot read text aloud.'; }
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.classList.contains('is-speaking')) { stop(); return; }
      const url = typeof audio === 'function' ? audio() : audio;
      if (url && await playRecording(url, button)) return;
      speak(typeof text === 'function' ? text() : text, typeof lang === 'function' ? lang() : lang, { button });
    });
    return button;
  }

  // Words in `node` (its text) become tappable: a tap reads that word aloud.
  function wordify(node, text, lang = 'auto') {
    const resolved = resolveLang(lang, text);
    node.textContent = '';
    node.classList.add('ks-words');
    String(text || '').split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) { node.append(part); return; }
      const word = part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      if (!word) { node.append(part); return; }
      const start = part.indexOf(word);
      if (start > 0) node.append(part.slice(0, start));
      node.append(el('span', { class: 'ks-word', role: 'button', tabindex: '0', 'aria-label': `Hear "${word}"`, 'data-word': word, text: word }));
      if (start + word.length < part.length) node.append(part.slice(start + word.length));
    });
    const play = (target) => {
      node.querySelectorAll('.ks-word.is-speaking').forEach((item) => item.classList.remove('is-speaking'));
      speak(target.dataset.word, resolved, { button: target, rate: 0.8 });
    };
    node.addEventListener('click', (event) => {
      const target = event.target.closest('.ks-word');
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      play(target);
    });
    node.addEventListener('keydown', (event) => {
      const target = event.target.closest('.ks-word');
      if (!target || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      play(target);
    });
    return node;
  }

  // The "Say it" card: the phrase (tap words to hear them, 🔊 for all of it),
  // a big microphone button, then what was heard and whether it matched.
  //   sayIt({ phrase, accepted, lang, onResult(result), onUnavailable(), attemptsNote })
  // onResult gets { heard, score, passed, close } after each try; the page
  // decides what to keep (the best try is a fine answer).
  function sayIt({ phrase, accepted = [], lang = 'auto', audio = null, onResult, onUnavailable, previous = '' }) {
    const resolved = resolveLang(lang, phrase);
    const targets = [phrase].concat(accepted).filter((item) => String(item || '').trim());
    const status = el('p', { class: 'ks-say-status', role: 'status', 'aria-live': 'polite' });
    const heardLine = el('p', { class: 'ks-say-heard', hidden: true });
    const mic = el('button', { type: 'button', class: 'ks-mic', 'aria-label': `Say it in ${langName(resolved)}` }, [icon(ICONS.mic)]);
    const micLabel = el('span', { class: 'ks-mic-label', text: 'Tap and say it' });
    const phraseNode = wordify(el('p', { class: 'ks-say-phrase', translate: 'no' }), phrase, resolved);
    const card = el('div', { class: 'ks-say' }, [
      el('div', { class: 'ks-say-top' }, [
        el('span', { class: 'ks-say-lang', text: langName(resolved) }),
        // The teacher's recording when there is one, else the computer voice.
        listenButton(phrase, resolved, { label: audio ? 'Hear your teacher' : 'Hear it', audio })
      ]),
      phraseNode,
      el('div', { class: 'ks-mic-wrap' }, [mic, micLabel]),
      status,
      heardLine
    ]);
    const problem = micProblem();
    if (problem) {
      mic.disabled = true;
      micLabel.textContent = 'Microphone unavailable';
      status.textContent = problem;
      status.classList.add('is-warning');
      if (onUnavailable) onUnavailable(problem);
    }
    if (previous) {
      heardLine.hidden = false;
      heardLine.textContent = `Last time you said: "${previous}"`;
    }
    let listening = false;
    mic.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (listening) return;
      listening = true;
      card.classList.remove('is-pass', 'is-close', 'is-miss');
      card.classList.add('is-listening');
      micLabel.textContent = 'Listening…';
      status.classList.remove('is-warning');
      status.textContent = 'Say it now.';
      try {
        const alternatives = await hear(resolved);
        const top = best(targets, alternatives);
        const passed = top.score >= PASS;
        const close = !passed && top.score >= CLOSE;
        card.classList.add(passed ? 'is-pass' : close ? 'is-close' : 'is-miss');
        heardLine.hidden = false;
        heardLine.textContent = `You said: "${top.heard}"`;
        status.textContent = passed ? 'Great! That was right.' : close ? 'Almost! Listen again and try once more.' : 'Not quite. Listen, then try again.';
        if (onResult) onResult({ heard: top.heard, score: top.score, passed, close });
      } catch (problemMessage) {
        status.textContent = problemMessage.message;
        status.classList.add('is-warning');
      } finally {
        listening = false;
        card.classList.remove('is-listening');
        micLabel.textContent = 'Tap and say it again';
      }
    });
    return card;
  }

  window.KoobdSpeech = {
    canSpeak: Boolean(synth || NativeTTS),
    inApp,
    canListen: () => !micProblem(),
    micProblem, detectLang, resolveLang, langName, hasVoice, voiceNote,
    onVoicesChanged: (fn) => { if (synth && typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', fn); },
    speak, stop, hear, similarity, best, normalize, playRecording,
    listenButton, wordify, sayIt,
    PASS
  };
})();
