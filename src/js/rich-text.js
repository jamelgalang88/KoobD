// Rich text for story lines (titles, narration, dialogue, questions), shared by
// the Story Mode and Platform Mode editors and by the readers.
//
// A line keeps its plain `text` and, once it has any formatting, a `rich`
// copy: a small, cleaned piece of HTML. Only these survive cleaning (here and
// on the server, koobdCleanRichText in platform_story_data.php):
//   <b> <i> <u> <br> <ul> <ol> <li>
//   <div style="text-align:...">             alignment
//   <span style="font-family | font-size (em) | color | background-color">
// Sizes are in em, so a line scales with the box it is shown in.
(function () {
  const LIB = () => window.KoobdPlatformLibrary;

  // --- Fonts and sizes ---------------------------------------------------------------------
  const FALLBACK_FONTS = [
    { id: 'storybook', label: 'Storybook', stack: "Georgia, 'Times New Roman', serif" },
    { id: 'rounded', label: 'Rounded', stack: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif" },
    { id: 'handwritten', label: 'Handwritten', stack: "'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', cursive" },
    { id: 'typewriter', label: 'Typewriter', stack: "'Courier New', Courier, monospace" },
    { id: 'clean', label: 'Clean', stack: 'Arial, Helvetica, sans-serif' },
    { id: 'display', label: 'Bold Display', stack: "Impact, 'Arial Black', 'Haettenschweiler', sans-serif" },
    { id: 'elegant', label: 'Elegant', stack: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif" }
  ];
  // The font a family name in the menu stands for (shown as e.g. "Arial").
  const FONT_NAMES = { storybook: 'Georgia', rounded: 'Trebuchet', handwritten: 'Comic', typewriter: 'Courier', clean: 'Arial', display: 'Impact', elegant: 'Palatino' };
  function fonts() {
    const list = LIB() && Array.isArray(LIB().fonts) ? LIB().fonts.filter((font) => font.id !== 'default' && font.stack) : FALLBACK_FONTS;
    return list.map((font) => ({ ...font, name: FONT_NAMES[font.id] || font.label }));
  }
  const squash = (value) => String(value || '').replace(/["'\s]/g, '').toLowerCase();
  function fontFor(family) {
    const key = squash(family);
    return key ? fonts().find((font) => squash(font.stack) === key) || null : null;
  }
  // Sizes as shown (like a word processor's points; 16 = the box's normal size).
  const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];
  const NORMAL_SIZE = 16;
  const emOf = (size) => `${Math.round((size / NORMAL_SIZE) * 1000) / 1000}em`;
  function cleanSize(value) {
    const match = /^(\d+(?:\.\d+)?)em$/.exec(String(value || '').trim());
    if (!match) return '';
    const em = Number(match[1]);
    return em >= 0.5 && em <= 3.5 ? `${Math.round(em * 1000) / 1000}em` : '';
  }
  function cleanColor(value) {
    const text = String(value || '').trim().toLowerCase();
    if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(text)) return text;
    const rgb = /^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})(?:,\s*(0|1|0?\.\d+))?\)$/.exec(text);
    if (!rgb) return '';
    if (rgb[4] !== undefined && Number(rgb[4]) === 0) return '';
    const hex = rgb.slice(1, 4).map((part) => Math.min(255, Number(part)).toString(16).padStart(2, '0')).join('');
    return `#${hex}`;
  }
  const ALIGNS = ['left', 'center', 'right', 'justify'];

  // --- Cleaning ------------------------------------------------------------------------------
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'svg', 'SVG', 'MATH', 'IMG', 'VIDEO', 'AUDIO', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'LINK', 'META', 'HEAD', 'TITLE', 'NOSCRIPT']);
  const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  function spanStyle(node) {
    const style = node.style || {};
    const parts = [];
    const font = fontFor(style.fontFamily || (node.tagName === 'FONT' ? node.getAttribute('face') : ''));
    if (font) parts.push(`font-family:${font.stack}`);
    const size = cleanSize(style.fontSize);
    if (size) parts.push(`font-size:${size}`);
    const color = cleanColor(style.color || (node.tagName === 'FONT' ? node.getAttribute('color') : ''));
    if (color) parts.push(`color:${color}`);
    const background = cleanColor(style.backgroundColor);
    if (background) parts.push(`background-color:${background}`);
    if (/bold|[6-9]00/.test(style.fontWeight || '')) parts.push('font-weight:bold');
    if (style.fontStyle === 'italic') parts.push('font-style:italic');
    if (/underline/.test(style.textDecoration || style.textDecorationLine || '')) parts.push('text-decoration:underline');
    return parts;
  }

  // HTML -> cleaned HTML (a string). Unknown tags keep their text. `keepMarks`
  // keeps the invisible character that holds the style for the next words
  // typed (only inside the editor; never saved).
  function clean(html, keepMarks = false) {
    const source = String(html || '');
    if (!source.trim()) return '';
    const doc = new DOMParser().parseFromString(`<body>${source}</body>`, 'text/html');
    const walk = (node) => {
      let out = '';
      node.childNodes.forEach((child) => {
        if (child.nodeType === 3) { out += escapeHtml(keepMarks ? child.nodeValue : child.nodeValue.replace(/​/g, '')); return; }
        if (child.nodeType !== 1 || DROP.has(child.tagName)) return;
        const tag = child.tagName;
        const inner = walk(child);
        if (tag === 'BR') { out += '<br>'; return; }
        if (tag === 'B' || tag === 'STRONG') { out += inner ? `<b>${inner}</b>` : ''; return; }
        if (tag === 'I' || tag === 'EM') { out += inner ? `<i>${inner}</i>` : ''; return; }
        if (tag === 'U' || tag === 'INS') { out += inner ? `<u>${inner}</u>` : ''; return; }
        if (tag === 'UL' || tag === 'OL') { out += inner ? `<${tag.toLowerCase()}>${inner}</${tag.toLowerCase()}>` : ''; return; }
        if (tag === 'LI') { out += `<li>${inner}</li>`; return; }
        if (tag === 'DIV' || tag === 'P' || /^H[1-6]$/.test(tag) || tag === 'BLOCKQUOTE') {
          const align = String(child.style.textAlign || child.getAttribute('align') || '').toLowerCase();
          out += ALIGNS.includes(align) ? `<div style="text-align:${align}">${inner}</div>` : `<div>${inner}</div>`;
          return;
        }
        if (tag === 'SPAN' || tag === 'FONT') {
          const parts = spanStyle(child);
          // Bold, italic and underline written as styles become the plain tags.
          let wrapped = inner;
          const keep = parts.filter((part) => {
            if (part === 'font-weight:bold') { wrapped = `<b>${wrapped}</b>`; return false; }
            if (part === 'font-style:italic') { wrapped = `<i>${wrapped}</i>`; return false; }
            if (part === 'text-decoration:underline') { wrapped = `<u>${wrapped}</u>`; return false; }
            return true;
          });
          out += keep.length && inner ? `<span style="${escapeHtml(keep.join(';'))}">${wrapped}</span>` : (inner ? wrapped : '');
          return;
        }
        out += inner;
      });
      return out;
    };
    return walk(doc.body);
  }

  // Cleaned HTML -> plain text (blocks and <br> become line breaks).
  function toPlain(html) {
    const cleaned = clean(html);
    if (!cleaned) return '';
    const doc = new DOMParser().parseFromString(`<body>${cleaned}</body>`, 'text/html');
    const lines = [];
    let line = '';
    const flush = () => { lines.push(line); line = ''; };
    const walk = (node) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === 3) { line += child.nodeValue; return; }
        if (child.nodeType !== 1) return;
        const block = ['DIV', 'LI', 'UL', 'OL'].includes(child.tagName);
        if (child.tagName === 'BR') { flush(); return; }
        if (block && line) flush();
        walk(child);
        if (block && line) flush();
      });
    };
    walk(doc.body);
    if (line) flush();
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Plain text -> HTML for the editor.
  const fromPlain = (text) => escapeHtml(String(text || '')).replace(/\r?\n/g, '<br>');

  // The HTML worth saving: '' when the line has no formatting at all.
  function forSaving(html) {
    const cleaned = clean(html);
    const bare = cleaned.replace(/<br>/g, '').replace(/<\/?div>/g, '');
    return /</.test(bare) ? cleaned : '';
  }

  // Shows a line in a box: its formatting when it has some, else the text.
  function render(node, rich, text) {
    if (!node) return;
    const cleaned = rich ? clean(rich) : '';
    node.classList.toggle('rt-content', Boolean(cleaned));
    if (cleaned) node.innerHTML = cleaned;
    else node.textContent = text == null ? '' : String(text);
  }

  // --- Editing: the selection as character positions ---------------------------------------
  // (So a change can be undone, and the same words stay selected after it.)
  function textNodes(root) {
    const list = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) list.push(walker.currentNode);
    return list;
  }
  // The number of characters before a point in the box.
  function offsetOf(root, container, offset) {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(container, offset);
    return range.toString().length;
  }
  function saveSelection(root) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    return { start: offsetOf(root, range.startContainer, range.startOffset), end: offsetOf(root, range.endContainer, range.endOffset) };
  }
  // `forward`: at the edge between two runs of text, take the start of the
  // next one (so a selection starts inside the words it selects).
  function pointAt(root, offset, forward = false) {
    const nodes = textNodes(root);
    let total = 0;
    for (const node of nodes) {
      if (forward ? offset < total + node.length : offset <= total + node.length) return [node, offset - total];
      total += node.length;
    }
    const last = nodes[nodes.length - 1];
    return last ? [last, last.length] : [root, root.childNodes.length];
  }
  function restoreSelection(root, saved) {
    if (!saved) return;
    const range = document.createRange();
    const [startNode, startOffset] = pointAt(root, saved.start, saved.end > saved.start);
    const [endNode, endOffset] = pointAt(root, saved.end);
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // --- Editing: styling the selected words ------------------------------------------------

  // Splits each element that runs past the selection, so the part inside the
  // selection is an element of its own (the rest keeps a copy of it).
  function isolate(range, elements) {
    elements.forEach((element) => {
      if (!element.isConnected) return;
      if (element.contains(range.endContainer) && element.lastChild) {
        const after = document.createRange();
        after.setStart(range.endContainer, range.endOffset);
        after.setEndAfter(element.lastChild);
        const rest = after.extractContents();
        if (rest.textContent) { const copy = element.cloneNode(false); copy.appendChild(rest); element.after(copy); }
      }
      if (element.contains(range.startContainer) && element.firstChild) {
        const before = document.createRange();
        before.setStartBefore(element.firstChild);
        before.setEnd(range.startContainer, range.startOffset);
        const lead = before.extractContents();
        if (lead.textContent) { const copy = element.cloneNode(false); copy.appendChild(lead); element.before(copy); }
      }
    });
  }
  const unwrap = (element) => element.replaceWith(...element.childNodes);

  // Removes one style (e.g. the colour) from the selected text only: a styled
  // span that runs past the selection is split, so the rest keeps its style.
  function clearStyle(root, range, prop) {
    const spans = Array.from(root.querySelectorAll('span, font')).filter((span) => span.style[prop] && range.intersectsNode(span));
    isolate(range, spans);
    spans.forEach((span) => {
      span.style[prop] = '';
      if (!span.getAttribute('style') || !span.getAttribute('style').trim()) unwrap(span);
    });
  }

  // The selected runs of text, split where the selection starts and ends.
  function selectedTexts(root, range) {
    return textNodes(root).filter((node) => node.length && range.intersectsNode(node)).map((node) => {
      let target = node;
      if (node === range.endContainer && range.endOffset < node.length) target.splitText(range.endOffset);
      if (node === range.startContainer && range.startOffset > 0) target = target.splitText(range.startOffset);
      return target;
    }).filter((node) => node.nodeValue);
  }

  // Bold, italic and underline (B, I, U) are toggled by the formatting the
  // words have, not by how they look: a story's text may already be shown
  // bold or italic by its design.
  const TAGS = { B: ['B', 'STRONG'], I: ['I', 'EM'], U: ['U', 'INS'] };
  function tagAbove(node, root, tag) {
    for (let walk = node.nodeType === 3 ? node.parentNode : node; walk && walk !== root; walk = walk.parentNode) {
      if (TAGS[tag].includes(walk.tagName)) return walk;
    }
    return null;
  }
  function toggleTag(root, tag) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    if (range.collapsed) {
      // Nothing selected: the next words typed are (or stop being) bold, etc.
      const mark = document.createTextNode('\u200B');
      const holder = tagAbove(range.startContainer, root, tag);
      if (holder) {
        const after = document.createRange();
        after.setStart(range.startContainer, range.startOffset);
        after.setEndAfter(holder.lastChild || holder);
        const rest = holder.lastChild ? after.extractContents() : null;
        holder.after(mark);
        if (rest && rest.textContent) { const copy = holder.cloneNode(false); copy.appendChild(rest); mark.after(copy); }
      } else {
        const wrap = document.createElement(tag.toLowerCase());
        wrap.appendChild(mark);
        range.insertNode(wrap);
      }
      const caret = document.createRange();
      caret.setStart(mark, 1);
      caret.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caret);
      return;
    }
    const saved = saveSelection(root);
    const texts = selectedTexts(root, range);
    restoreSelection(root, saved);
    if (texts.length && texts.every((node) => tagAbove(node, root, tag))) {
      const live = selection.getRangeAt(0);
      const holders = Array.from(root.querySelectorAll(TAGS[tag].join(','))).filter((node) => live.intersectsNode(node));
      isolate(live, holders);
      holders.forEach(unwrap);
    } else {
      texts.forEach((node) => {
        if (tagAbove(node, root, tag)) return;
        const wrap = document.createElement(tag.toLowerCase());
        node.parentNode.insertBefore(wrap, node);
        wrap.appendChild(node);
      });
    }
    restoreSelection(root, saved);
  }

  // Gives the selected text a style; with nothing selected, the next words typed get it.
  function applyStyle(root, prop, value) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    let range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    if (range.collapsed) {
      if (!value) return;
      const span = document.createElement('span');
      span.style[prop] = value;
      span.textContent = '​';
      range.insertNode(span);
      const caret = document.createRange();
      caret.setStart(span.firstChild, 1);
      caret.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caret);
      return;
    }
    const saved = saveSelection(root);
    clearStyle(root, range, prop);
    restoreSelection(root, saved);
    range = selection.getRangeAt(0);
    if (value) {
      // Each selected run of text gets the style.
      selectedTexts(root, range).forEach((target) => {
        const parent = target.parentNode;
        if (parent.tagName === 'SPAN' && parent.childNodes.length === 1 && parent !== root) {
          parent.style[prop] = value;
        } else {
          const span = document.createElement('span');
          span.style[prop] = value;
          parent.insertBefore(span, target);
          span.appendChild(target);
        }
      });
    }
    restoreSelection(root, saved);
  }

  // --- The toolbar ---------------------------------------------------------------------------
  const ICONS = {
    bold: 'M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z',
    italic: 'M10 5h8M6 19h8M14 5l-4 14',
    underline: 'M7 4v7a5 5 0 0010 0V4M5 20h14',
    left: 'M4 6h16M4 10h10M4 14h16M4 18h10',
    center: 'M4 6h16M7 10h10M4 14h16M7 18h10',
    right: 'M4 6h16M10 10h10M4 14h16M10 18h10',
    justify: 'M4 6h16M4 10h16M4 14h16M4 18h16',
    bullets: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
    numbers: 'M10 6h10M10 12h10M10 18h10M4 5l1.5-1V9M3.5 13.5a1.4 1.4 0 012.6.7c0 1.2-2.6 2-2.6 3.3h2.8',
    undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
    redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
    clear: 'M6 5h12M12 5l-3 14M15 13l5 5M20 13l-5 5',
    highlight: 'M15 5l4 4-9 9H6v-4zM4 21h16',
    noHighlight: 'M15 5l4 4-9 9H6v-4zM4 21h16M3 3l18 18',
    more: 'M5 12h.01M12 12h.01M19 12h.01'
  };
  function svgIcon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[name]);
    svg.appendChild(path);
    return svg;
  }
  function make(tag, className, attrs = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  let active = null; // the editor being written in: { box, field, singleLine, record, undo, redo, emit, saved }
  let bar = null;
  const controls = {};

  function button(name, label, run, extraClass = '') {
    const node = make('button', `rt-btn ${extraClass}`.trim(), { type: 'button', title: label, 'aria-label': label });
    node.appendChild(svgIcon(name));
    // Keep the words selected: the editor never loses focus to a toolbar button.
    node.addEventListener('pointerdown', (event) => event.preventDefault());
    node.addEventListener('click', () => { if (active) run(active); });
    return node;
  }

  // Runs a change on the active editor: the selection is put back, the change
  // is recorded for undo, and the line is saved.
  function change(editor, run) {
    // The words selected now; or, when a menu or colour picker took the focus,
    // the words that were selected before it.
    const live = document.activeElement === editor.box ? saveSelection(editor.box) : null;
    editor.box.focus({ preventScroll: true });
    restoreSelection(editor.box, live || editor.saved);
    editor.record(true);
    run(editor.box);
    // The browser's own commands leave extra styles behind: keep only the allowed ones.
    const saved = saveSelection(editor.box);
    const tidy = clean(editor.box.innerHTML, true);
    if (tidy !== editor.box.innerHTML) {
      editor.box.innerHTML = tidy;
      restoreSelection(editor.box, saved);
    }
    editor.saved = saveSelection(editor.box);
    editor.emit();
    editor.record(true);
    updateBar();
  }
  const toggle = (tag) => (editor) => change(editor, (box) => toggleTag(box, tag));
  const command = (name, value) => (editor) => change(editor, () => {
    document.execCommand('styleWithCSS', false, false);
    document.execCommand(name, false, value);
  });

  function buildBar() {
    bar = make('div', 'rt-toolbar', { role: 'toolbar', 'aria-label': 'Text formatting' });
    bar.addEventListener('pointerdown', (event) => { if (event.target === bar) event.preventDefault(); });

    const fontSelect = make('select', 'rt-select rt-font', { 'aria-label': 'Font', title: 'Font' });
    controls.font = fontSelect;
    fontSelect.addEventListener('change', () => {
      const font = fonts().find((item) => item.id === fontSelect.value);
      if (active) change(active, (box) => applyStyle(box, 'fontFamily', font ? font.stack : ''));
    });

    const sizeSelect = make('select', 'rt-select rt-size', { 'aria-label': 'Font size', title: 'Font size' });
    controls.size = sizeSelect;
    SIZES.forEach((size) => {
      const option = make('option', '', { value: String(size) });
      option.textContent = String(size);
      sizeSelect.appendChild(option);
    });
    sizeSelect.addEventListener('change', () => {
      const size = Number(sizeSelect.value);
      if (active) change(active, (box) => applyStyle(box, 'fontSize', size === NORMAL_SIZE ? '' : emOf(size)));
    });

    const colorPicker = (label, prop, swatchClass, fallback) => {
      const wrap = make('label', `rt-color ${swatchClass}`, { title: label });
      const input = make('input', '', { type: 'color', 'aria-label': label, value: fallback });
      const mark = make('span', 'rt-color-mark');
      mark.textContent = prop === 'color' ? 'A' : '';
      if (prop !== 'color') mark.appendChild(svgIcon('highlight'));
      const swatch = make('span', 'rt-color-swatch');
      swatch.style.background = fallback;
      wrap.append(mark, swatch, input);
      input.addEventListener('pointerdown', () => { if (active) active.saved = saveSelection(active.box) || active.saved; });
      input.addEventListener('input', () => { swatch.style.background = input.value; });
      input.addEventListener('change', () => { swatch.style.background = input.value; if (active) change(active, (box) => applyStyle(box, prop, input.value)); });
      return wrap;
    };
    const textColor = colorPicker('Text color', 'color', 'is-text', '#d23c3c');
    const highlight = colorPicker('Highlight', 'backgroundColor', 'is-highlight', '#ffe066');
    const noHighlight = button('noHighlight', 'Remove highlight', (editor) => change(editor, (box) => applyStyle(box, 'backgroundColor', '')), 'rt-no-highlight');

    const sep = () => make('span', 'rt-sep', { 'aria-hidden': 'true' });
    const main = make('div', 'rt-group rt-main');
    controls.bold = button('bold', 'Bold (Ctrl+B)', toggle('B'));
    controls.italic = button('italic', 'Italic (Ctrl+I)', toggle('I'));
    controls.underline = button('underline', 'Underline (Ctrl+U)', toggle('U'));
    main.append(fontSelect, sizeSelect, sep(), controls.bold, controls.italic, controls.underline, sep(), textColor, highlight);

    // Less-used tools: always shown on wide screens, behind "More" on small ones.
    const extra = make('div', 'rt-group rt-extra');
    controls.left = button('left', 'Align left', command('justifyLeft'), 'rt-block');
    controls.center = button('center', 'Align center', command('justifyCenter'), 'rt-block');
    controls.right = button('right', 'Align right', command('justifyRight'), 'rt-block');
    controls.justify = button('justify', 'Justify', command('justifyFull'), 'rt-block');
    controls.bullets = button('bullets', 'Bulleted list', command('insertUnorderedList'), 'rt-block rt-list');
    controls.numbers = button('numbers', 'Numbered list', command('insertOrderedList'), 'rt-block rt-list');
    const clearAll = button('clear', 'Clear formatting', (editor) => change(editor, (box) => {
      document.execCommand('removeFormat');
      const selection = window.getSelection();
      if (selection.rangeCount && !selection.getRangeAt(0).collapsed) {
        ['fontFamily', 'fontSize', 'color', 'backgroundColor'].forEach((prop) => applyStyle(box, prop, ''));
      }
    }));
    extra.append(noHighlight, sep(), controls.left, controls.center, controls.right, controls.justify, sep(), controls.bullets, controls.numbers, sep(), clearAll);

    const history = make('div', 'rt-group rt-history');
    controls.undo = button('undo', 'Undo (Ctrl+Z)', (editor) => editor.undo());
    controls.redo = button('redo', 'Redo (Ctrl+Y)', (editor) => editor.redo());
    const more = button('more', 'More formatting', () => { bar.classList.toggle('is-open'); placeBar(); }, 'rt-more');
    history.append(controls.undo, controls.redo, more);

    bar.append(main, extra, history);
  }

  function fillFonts(singleLine) {
    const select = controls.font;
    select.replaceChildren();
    const normal = make('option', '', { value: '' });
    normal.textContent = singleLine ? 'Title font' : 'Story font';
    select.appendChild(normal);
    fonts().forEach((font) => {
      const option = make('option', '', { value: font.id });
      option.textContent = font.name;
      option.style.fontFamily = font.stack;
      select.appendChild(option);
    });
  }

  // Shows what the caret is in: its font, size, and bold / italic / underline.
  function updateBar() {
    if (!bar || !active) return;
    const selection = window.getSelection();
    const inBox = selection.rangeCount && active.box.contains(selection.anchorNode);
    let node = inBox ? selection.anchorNode : null;
    if (node && node.nodeType === 3) node = node.parentNode;
    let family = '';
    let size = '';
    for (let walk = node; walk && walk !== active.box; walk = walk.parentNode) {
      if (!family && walk.style && walk.style.fontFamily) family = walk.style.fontFamily;
      if (!size && walk.style && walk.style.fontSize) size = walk.style.fontSize;
    }
    const font = fontFor(family);
    controls.font.value = font ? font.id : '';
    // The size relative to the line's own (nested sizes multiply).
    let scale = 1;
    for (let walk = node; walk && walk !== active.box; walk = walk.parentNode) {
      const em = walk.style && cleanSize(walk.style.fontSize);
      if (em) scale *= parseFloat(em);
    }
    const shown = Math.round(scale * NORMAL_SIZE);
    if (!SIZES.includes(shown)) {
      let custom = controls.size.querySelector('.rt-size-custom');
      if (!custom) { custom = make('option', 'rt-size-custom'); controls.size.appendChild(custom); }
      custom.value = String(shown);
      custom.textContent = String(shown);
    }
    controls.size.value = String(shown);
    [['bold', 'B'], ['italic', 'I'], ['underline', 'U']].forEach(([name, tag]) => {
      controls[name].classList.toggle('is-on', Boolean(inBox && tagAbove(selection.anchorNode, active.box, tag)));
    });
    controls.undo.disabled = !active.canUndo();
    controls.redo.disabled = !active.canRedo();
  }
  // --- Showing the toolbar ---------------------------------------------------------------
  // The toolbar is hidden until asked for: the "Aa" button on a text box, or
  // the "Aa" chip that appears beside selected words. It then floats above the
  // text (it takes no room on the page) until you click elsewhere.
  let chip = null;
  let opener = null;
  function buildChip() {
    chip = make('button', 'rt-chip', { type: 'button', title: 'Format the selected words', 'aria-label': 'Format the selected words' });
    chip.textContent = 'Aa';
    chip.addEventListener('pointerdown', (event) => event.preventDefault());
    chip.addEventListener('click', () => { if (active) openBar(active); });
    document.body.appendChild(chip);
  }
  const isOpen = () => Boolean(bar && bar.classList.contains('is-shown'));

  // Puts a floating node above `rect` (or below, if there is no room), on screen.
  function place(node, rect, gap = 8) {
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const above = rect.top - height - gap;
    const top = above >= 8 ? above : Math.min(window.innerHeight - height - 8, rect.bottom + gap);
    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(top)}px`;
  }
  function placeBar() {
    if (!isOpen() || !active) return;
    if (!active.box.isConnected) { closeBar(); return; }
    place(bar, active.box.getBoundingClientRect());
  }
  function openBar(editor) {
    if (!bar) buildBar();
    active = editor;
    fillFonts(editor.singleLine);
    bar.classList.toggle('is-single-line', editor.singleLine);
    bar.classList.remove('is-open');
    if (!bar.isConnected) document.body.appendChild(bar);
    bar.classList.add('is-shown');
    if (opener) opener.classList.remove('is-on');
    opener = editor.toggle || null;
    if (opener) opener.classList.add('is-on');
    hideChip();
    updateBar();
    placeBar();
  }
  function closeBar() {
    if (bar) bar.classList.remove('is-shown', 'is-open');
    if (opener) opener.classList.remove('is-on');
    opener = null;
  }
  function hideChip() { if (chip) chip.classList.remove('is-shown'); }
  // The chip shows beside selected words while the toolbar is closed.
  function updateChip() {
    if (!active || isOpen()) { hideChip(); return; }
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed || !active.box.contains(selection.anchorNode) || document.activeElement !== active.box) { hideChip(); return; }
    if (!chip) buildChip();
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    chip.classList.add('is-shown');
    place(chip, { left: rect.right - 14, right: rect.right, top: rect.top, bottom: rect.bottom }, 6);
  }

  document.addEventListener('selectionchange', () => {
    if (!active) return;
    const saved = saveSelection(active.box);
    if (saved) { active.saved = saved; updateBar(); }
    updateChip();
  });
  // Clicking anywhere else closes the toolbar.
  document.addEventListener('pointerdown', (event) => {
    if (!isOpen()) return;
    const target = event.target;
    if (bar.contains(target) || (active && active.box.contains(target)) || (opener && opener.contains(target)) || (chip && chip.contains(target))) return;
    closeBar();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) { closeBar(); event.stopPropagation(); }
  }, true);
  window.addEventListener('scroll', () => { placeBar(); hideChip(); }, true);
  window.addEventListener('resize', placeBar);

  // Writing in a box makes it the toolbar's box (and moves an open toolbar to it).
  function useEditor(editor) {
    if (active === editor) return;
    active = editor;
    if (isOpen()) openBar(editor);
  }

  // --- Editing a box ---------------------------------------------------------------------------
  // Makes `box` editable: undo / redo, shortcuts, plain-text pasting, a length
  // limit. `getOptions()` gives the current { singleLine, maxLength, onChange }.
  function makeEditable(box, getOptions) {
    box.setAttribute('contenteditable', 'true');
    box.setAttribute('translate', 'no');
    box.setAttribute('spellcheck', 'true');
    box.setAttribute('role', 'textbox');
    const past = [];
    const future = [];
    let lastHtml = box.innerHTML;
    let typingTimer = 0;
    const state = {
      box, saved: null, toggle: null,
      get singleLine() { return Boolean(getOptions().singleLine); },
      // Keeps the line's state for undo (typing is grouped into short bursts).
      record(force) {
        clearTimeout(typingTimer);
        const take = () => {
          if (box.innerHTML === lastHtml) return;
          past.push({ html: lastHtml, selection: state.lastSelection || null });
          if (past.length > 100) past.shift();
          future.length = 0;
          lastHtml = box.innerHTML;
          state.lastSelection = saveSelection(box);
          updateBar();
        };
        if (force) take(); else typingTimer = setTimeout(take, 500);
      },
      step(from, to) {
        const entry = from.pop();
        if (!entry) return;
        to.push({ html: box.innerHTML, selection: saveSelection(box) });
        box.innerHTML = entry.html;
        lastHtml = entry.html;
        box.focus({ preventScroll: true });
        restoreSelection(box, entry.selection);
        state.emit();
        updateBar();
      },
      undo() { state.record(true); state.step(past, future); },
      redo() { state.step(future, past); },
      canUndo: () => past.length > 0 || box.innerHTML !== lastHtml,
      canRedo: () => future.length > 0,
      markEmpty() { box.classList.toggle('is-empty', !box.textContent.replace(/\u200B/g, '').trim() && !box.querySelector('li')); },
      emit() {
        state.markEmpty();
        const { onChange } = getOptions();
        if (typeof onChange === 'function') onChange(forSaving(box.innerHTML), toPlain(box.innerHTML));
      },
      // New content from outside (another part chosen, or the same line edited elsewhere).
      load(rich, text) {
        const html = rich ? clean(rich) : fromPlain(text);
        if (box.innerHTML !== html) box.innerHTML = html;
        past.length = 0;
        future.length = 0;
        lastHtml = box.innerHTML;
        state.saved = null;
        state.markEmpty();
      }
    };
    state.markEmpty();

    box.addEventListener('focus', () => useEditor(state));
    box.addEventListener('pointerdown', () => useEditor(state));
    box.addEventListener('input', () => { state.emit(); state.record(false); });
    box.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;
      if (mod && !event.altKey) {
        if (key === 'z' && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); state.undo(); return; }
        if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); event.stopPropagation(); state.redo(); return; }
        if (key === 'b' || key === 'i' || key === 'u') {
          event.preventDefault();
          event.stopPropagation();
          useEditor(state);
          toggle({ b: 'B', i: 'I', u: 'U' }[key])(state);
          return;
        }
      }
      if (key === 'enter' && state.singleLine) { event.preventDefault(); return; }
      if (key === 'enter' && !event.shiftKey && !box.closest('li') && !box.querySelector('li') && !mod) {
        // A new line inside the same box (lists keep their own Enter).
        event.preventDefault();
        state.record(true);
        document.execCommand('insertLineBreak');
      }
    });
    box.addEventListener('beforeinput', (event) => {
      const maxLength = Number(getOptions().maxLength) || 0;
      if (!maxLength || !/^insert/.test(event.inputType || '') || event.inputType === 'insertParagraph') return;
      const selection = window.getSelection();
      const selected = selection.rangeCount ? selection.toString().length : 0;
      const adding = String(event.data || '').length || 1;
      if (box.textContent.replace(/\u200B/g, '').length - selected + adding > maxLength) event.preventDefault();
    });
    // Pasting brings in the words only (the formatting is set with the toolbar).
    box.addEventListener('paste', (event) => {
      event.preventDefault();
      const maxLength = Number(getOptions().maxLength) || 0;
      let text = (event.clipboardData || window.clipboardData).getData('text/plain') || '';
      if (state.singleLine) text = text.replace(/\s*\n\s*/g, ' ');
      if (maxLength) text = text.slice(0, Math.max(0, maxLength - box.textContent.length));
      state.record(true);
      document.execCommand('insertText', false, text);
    });
    box.addEventListener('drop', (event) => event.preventDefault());
    return state;
  }

  // editor({ rich, text, placeholder, singleLine, maxLength, label, onChange(rich, text) })
  // -> a text box with an "Aa" button for its formatting toolbar.
  // `field.richText.load(rich, text)` changes what it shows.
  function editor(options = {}) {
    const field = make('div', `rt-field${options.singleLine ? ' is-single-line' : ''}`);
    const box = make('div', 'rt-editable', {
      'aria-multiline': options.singleLine ? 'false' : 'true', 'aria-label': options.label || options.placeholder || 'Text',
      'data-placeholder': options.placeholder || ''
    });
    box.innerHTML = options.rich ? clean(options.rich) : fromPlain(options.text);
    const state = makeEditable(box, () => options);
    const toggle = make('button', 'rt-toggle', { type: 'button', title: 'Text formatting', 'aria-label': 'Text formatting' });
    toggle.textContent = 'Aa';
    toggle.addEventListener('pointerdown', (event) => event.preventDefault());
    toggle.addEventListener('click', () => {
      if (isOpen() && active === state) { closeBar(); return; }
      box.focus({ preventScroll: true });
      openBar(state);
    });
    state.toggle = toggle;
    field.append(box, toggle);
    field.richText = state;
    return field;
  }

  // Makes a box that is already on the page (e.g. the text on the story canvas)
  // editable in place. `bind(options)` says which line it shows and edits:
  // { rich, text, placeholder, singleLine, maxLength, label, onChange(rich, text) }.
  function attach(node) {
    let options = {};
    node.classList.add('rt-inline-edit', 'rt-content');
    const state = makeEditable(node, () => options);
    return {
      state,
      bind(next) {
        options = next || {};
        node.setAttribute('data-placeholder', options.placeholder || '');
        node.setAttribute('aria-label', options.label || options.placeholder || 'Text');
        node.setAttribute('aria-multiline', options.singleLine ? 'false' : 'true');
        // While it is being written in, the box keeps its own content (and caret).
        if (document.activeElement === node) return;
        state.load(options.rich, options.text);
      }
    };
  }

  window.KoobdRichText = { editor, attach, render, clean, toPlain, fromPlain, forSaving, fonts, SIZES };
})();
