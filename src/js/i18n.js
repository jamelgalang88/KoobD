// KoobD's interface language (English or Tagalog), the same on every page.
//
// The choice is kept in the `koobd_lang` cookie (with localStorage as a
// fallback), so it follows the reader from page to page and across visits.
// In Tagalog the interface text - buttons, labels, menus, messages, prompts,
// placeholders, tooltips, pop-ups, page titles - is shown from the dictionary
// in js/i18n-tl.js, including text the page's scripts add later.
//
// Story content is never translated: anything inside an element marked
// translate="no" (dialogue, narration, story and stage titles, names, what
// users write) is left exactly as written, and only exact interface phrases
// from the dictionary are ever replaced.
//
// Load it first in <head>, after js/i18n-tl.js:
//   <script src="js/i18n-tl.js"></script><script src="js/i18n.js"></script>
(function () {
  const COOKIE = 'koobd_lang';
  const LANGS = ['en', 'tl'];

  function readLang() {
    const match = document.cookie.match(/(?:^|;\s*)koobd_lang=(en|tl)\b/);
    if (match) return match[1];
    try {
      const stored = window.localStorage.getItem(COOKIE);
      if (LANGS.includes(stored)) return stored;
    } catch (error) { /* storage blocked */ }
    return 'en';
  }

  const lang = readLang();
  const dict = (window.KOOBD_I18N_TL && window.KOOBD_I18N_TL.strings) || {};
  const patterns = ((window.KOOBD_I18N_TL && window.KOOBD_I18N_TL.patterns) || [])
    .map(([source, replacement]) => [new RegExp(source), replacement]);
  // Case-insensitive lookup, for text the page writes in capitals.
  const lowerDict = {};
  Object.keys(dict).forEach((key) => { lowerDict[key.toLowerCase()] = dict[key]; });
  // The classic stories' own text that appears outside them (their lessons
  // on the home page and in classrooms): translated wherever it shows, even
  // among protected story content. User stories are never in it.
  const classic = (window.KOOBD_I18N_TL && window.KOOBD_I18N_TL.classic) || {};
  const missing = new Set();
  // Text that is already Tagalog (translated a moment ago) is left alone.
  const tagalog = new Set(Object.values(dict).map((value) => value.toLowerCase()));
  const debug = (() => { try { return window.localStorage.getItem('koobd_i18n_debug') === '1'; } catch (e) { return false; } })();

  // The Tagalog for one interface phrase, or null when it isn't one.
  function lookup(text) {
    if (Object.prototype.hasOwnProperty.call(classic, text)) return classic[text];
    if (Object.prototype.hasOwnProperty.call(dict, text)) return dict[text];
    const lower = text.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(lowerDict, lower)) {
      const found = lowerDict[lower];
      // Keep the page's own capitals: ALL CAPS stays all caps.
      return text === text.toUpperCase() && /[A-Z]/.test(text) ? found.toLocaleUpperCase('fil') : found;
    }
    for (const [regex, replacement] of patterns) {
      const match = text.match(regex);
      if (match) {
        // The filled-in parts (names, codes, numbers) go in exactly as written;
        // $T1 marks one that is itself interface text, translated in turn.
        return replacement.replace(/\$(T?)(\d)/g, (all, tr, n) => {
          const part = match[Number(n)] || '';
          return tr ? (lookup(part) || part) : part;
        });
      }
    }
    return null;
  }

  function translate(raw) {
    if (lang !== 'tl' || raw == null) return null;
    const text = String(raw).replace(/\s+/g, ' ').trim();
    if (!text || !/[A-Za-z]/.test(text) || tagalog.has(text.toLowerCase())) return null;
    const found = lookup(text);
    if (found == null) {
      if (debug && text.length > 1) missing.add(text);
      return null;
    }
    // Keep the spacing around the phrase (it separates it from its neighbours).
    const lead = String(raw).match(/^\s*/)[0];
    const trail = String(raw).match(/\s*$/)[0];
    return (lead ? ' ' : '') + found + (trail ? ' ' : '');
  }

  // Public: the Tagalog (or the English back) for code that builds text.
  function t(text) {
    return translate(text) || text;
  }

  function setLang(next) {
    if (!LANGS.includes(next) || next === lang) return;
    document.cookie = `${COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    try { window.localStorage.setItem(COOKIE, next); } catch (error) { /* storage blocked */ }
    window.location.reload();
  }

  window.KoobdI18n = {
    lang,
    setLang,
    t,
    missing: () => Array.from(missing).sort(),
  };
  document.documentElement.lang = lang === 'tl' ? 'tl' : 'en';
  if (lang !== 'tl') return;

  // --- Tagalog: translate the page, and everything added to it later --------
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'SVG']);
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'data-tooltip'];

  // Inside translate="no" nothing is translated - unless a nearer element
  // says translate="yes" (interface text, like a hint, inside story content).
  function protectedNode(element) {
    if (!element || !element.closest) return false;
    if (element.closest('[contenteditable="true"]')) return true;
    const marked = element.closest('[translate]');
    return Boolean(marked && marked.getAttribute('translate') === 'no');
  }

  function translateElementAttrs(element) {
    if (protectedNode(element)) return;
    ATTRS.forEach((name) => {
      if (!element.hasAttribute(name)) return;
      const value = element.getAttribute(name);
      const done = translate(value);
      if (done != null && done.trim() !== value.trim()) element.setAttribute(name, done.trim());
    });
    // Button-like inputs show their value; text inputs hold what users type.
    if (element.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(element.type)) {
      const done = translate(element.value);
      if (done != null) element.value = done.trim();
    }
  }

  // A classic story's text (see `classic`) inside protected content.
  function translateClassic(node) {
    const text = node.nodeValue.replace(/\s+/g, ' ').trim();
    if (Object.prototype.hasOwnProperty.call(classic, text)) node.nodeValue = classic[text];
  }

  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      const parent = root.parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName)) return;
      if (protectedNode(parent)) { translateClassic(root); return; }
      const done = translate(root.nodeValue);
      if (done != null && done !== root.nodeValue) root.nodeValue = done;
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) {
      if (SKIP_TAGS.has(root.tagName)) return;
      translateElementAttrs(root);
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (SKIP_TAGS.has(node.tagName) || node.isContentEditable) return NodeFilter.FILTER_REJECT;
          return protectedNode(node) ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT;
        }
        if (protectedNode(node.parentElement)) {
          translateClassic(node);
          return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const done = translate(node.nodeValue);
        if (done != null && done !== node.nodeValue) node.nodeValue = done;
      } else {
        translateElementAttrs(node);
      }
      node = walker.nextNode();
    }
  }

  // Hide the page for the moment it takes to translate it, so English never
  // flashes up first (never longer than a second, whatever happens).
  const hide = document.createElement('style');
  hide.textContent = 'html.koobd-i18n-pending body{visibility:hidden !important;}';
  document.head.appendChild(hide);
  document.documentElement.classList.add('koobd-i18n-pending');
  const reveal = () => document.documentElement.classList.remove('koobd-i18n-pending');
  window.setTimeout(reveal, 1000);

  // Pop-ups the scripts open.
  ['alert', 'confirm', 'prompt'].forEach((name) => {
    const original = window[name];
    if (typeof original !== 'function') return;
    window[name] = function (message, ...rest) {
      return original.call(window, t(message), ...rest);
    };
  });

  function start() {
    const title = translate(document.title);
    if (title) document.title = title.trim();
    translateTree(document.body);
    reveal();
    new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === 'childList') {
          record.addedNodes.forEach((node) => translateTree(node));
        } else if (record.type === 'characterData') {
          translateTree(record.target);
        } else if (record.type === 'attributes' && record.target.nodeType === Node.ELEMENT_NODE) {
          translateElementAttrs(record.target);
        }
      });
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS.concat(['value']),
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
