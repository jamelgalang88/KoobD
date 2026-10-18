// The story editor's Story Map: the whole story as a horizontal flowchart in
// a large popup window. Start -> pages -> choices (diamonds) ->
// the pages and endings each answer leads to, with labelled arrows. It is
// redrawn whenever the story changes, can be zoomed, panned and fitted.
// Clicking a page or an ending shows its settings in the same popup (with a
// Back button to the map); clicking a choice takes the editor to it.
//
//   const map = KoobdStoryMap.open({ getPages, pageLabel, currentIndex,
//     onPage(i) -> content, onChoice(i, ref), onEnding(ending) -> content, onClose });
//   map.update();   // after any change while it is open
(function () {
  'use strict';

  const UI = window.KoobdEditorUI;
  const { el } = UI;
  const SVG = 'http://www.w3.org/2000/svg';
  const tr = (text) => (window.KoobdI18n ? window.KoobdI18n.t(text) : text);
  // A page is a thumbnail of the page with its title in a bar underneath.
  const SIZE = { start: [92, 38], page: [210, 158], choice: [92, 76], end: [168, 42] };
  const PAGE_BAR = 40;
  const GAP_X = 64;
  const GAP_Y = 24;
  const MIN_FIT = 0.85; // "fit" never shrinks the map below a readable size

  const svgEl = (tag, attrs = {}, children = []) => {
    const node = document.createElementNS(SVG, tag);
    Object.entries(attrs).forEach(([key, value]) => { if (value !== null && value !== undefined) node.setAttribute(key, value); });
    children.forEach((child) => child && node.appendChild(child));
    return node;
  };
  const short = (text, max) => {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  };

  // --- The story as nodes and edges --------------------------------------------------
  // Endings with the same name are the same ending, however many paths reach it.
  function buildGraph(pages, pageLabel) {
    const nodes = new Map();
    const edges = [];
    const keys = pages.map((page) => page.key);
    const add = (node) => { nodes.set(node.id, node); return node; };
    add({ id: 'start', kind: 'start', label: tr('Start') });
    pages.forEach((page, index) => add({ id: `p${index}`, kind: 'page', index, page, label: pageLabel(page, index), platform: page.pageType === 'platformer' }));

    const ending = (label, source) => {
      const name = String(label || '').trim() || 'The end';
      const id = `end:${name.toLowerCase()}`;
      const node = nodes.get(id) || add({ id, kind: 'end', label: name === 'The end' ? tr('The end') : name, name, sources: [] });
      node.sources.push(source);
      return id;
    };
    const edge = (from, to, label = '', kind = 'flow') => {
      if (!to || edges.some((item) => item.from === from && item.to === to && item.label === label)) return;
      edges.push({ from, to, label, kind });
    };

    if (pages.length) edge('start', 'p0');
    pages.forEach((page, index) => {
      const id = `p${index}`;
      const next = page.next || { type: 'next' };
      // Where the page goes on its own (and where "carry on" answers lead).
      let naturalId;
      const natural = () => naturalId || (naturalId = (() => {
        if (next.type === 'page' && keys.includes(next.page)) return `p${keys.indexOf(next.page)}`;
        if (next.type === 'end') return ending(next.label, { pageIndex: index, goto: next, via: 'next' });
        if (index < pages.length - 1) return `p${index + 1}`;
        return ending('', { pageIndex: index, goto: null, via: 'next' });
      })());
      const target = (goto, source) => {
        if (goto && goto.type === 'page') return keys.includes(goto.page) ? `p${keys.indexOf(goto.page)}` : null;
        if (goto && goto.type === 'end') return ending(goto.label, source);
        return natural();
      };
      // A choice whose every answer leads somewhere else ends the page there.
      let pageEndsAtChoice = false;
      const choiceNode = (key, question, answers, ref) => {
        if (answers.length && answers.every((answer) => answer.goto && (answer.goto.type === 'page' || answer.goto.type === 'end'))) pageEndsAtChoice = true;
        const choiceId = `c${index}-${key}`;
        add({ id: choiceId, kind: 'choice', index, label: question || tr('Choice'), ref });
        edge(id, choiceId);
        answers.forEach((answer, n) => edge(choiceId, target(answer.goto, { pageIndex: index, goto: answer.goto, via: 'choice' }), short(answer.text, 18) || `${tr('Answer')} ${String.fromCharCode(65 + n)}`, 'choice'));
      };
      if (page.pageType === 'platformer' && page.platformer) {
        (page.platformer.events || []).forEach((event) => {
          (event.beats || []).forEach((beat) => {
            if (beat.type === 'choices') choiceNode(beat.id, beat.text, beat.choices || [], { eventId: event.id });
          });
          const after = event.after || {};
          if (after.type === 'page' || after.type === 'end') edge(id, target(after, { pageIndex: index, goto: after, via: 'event' }), short(event.label, 18) || tr('After an event'), 'jump');
        });
      } else {
        (page.elements || []).forEach((element, elementIndex) => {
          if (element.type === 'choices') choiceNode(element.id, element.text, element.choices || [], { elementIndex });
        });
      }
      if (!pageEndsAtChoice) edge(id, natural(), next.type === 'page' ? tr('Then') : '', next.type === 'page' ? 'jump' : 'flow');
    });
    return { nodes, edges };
  }

  // --- Layout: columns from left to right by how soon the reader reaches them ----------
  function layout(graph) {
    const { nodes, edges } = graph;
    const out = new Map(); // node -> the nodes it leads to
    const pos = new Map(); // node -> its box
    edges.forEach((item) => { (out.get(item.from) || out.set(item.from, []).get(item.from)).push(item.to); });
    // Lines that go back to an earlier point (a loop, e.g. "go back to page 1")
    // are found by walking the story from Start; every other line points
    // forward, and each node goes one column after the furthest node that
    // leads to it, so the story always reads left to right.
    const back = new Set();
    const seen = new Set();
    const onPath = new Set();
    const walk = (id) => {
      seen.add(id);
      onPath.add(id);
      (out.get(id) || []).forEach((to) => {
        if (!nodes.has(to)) return;
        if (onPath.has(to)) back.add(`${id}>${to}`);
        else if (!seen.has(to)) walk(to);
      });
      onPath.delete(id);
    };
    walk('start');
    const reached = new Set(seen);
    // Pages no path reaches yet start their own row of columns, drawn dashed.
    nodes.forEach((node, id) => { if (!seen.has(id) && node.kind === 'page') walk(id); });
    nodes.forEach((node, id) => { if (!seen.has(id)) walk(id); });
    nodes.forEach((node, id) => { if (!reached.has(id)) node.orphan = true; });
    const forward = edges.filter((item) => nodes.has(item.to) && !back.has(`${item.from}>${item.to}`));
    const depth = new Map();
    nodes.forEach((node, id) => depth.set(id, 0));
    for (let round = 0; round < nodes.size; round += 1) {
      let moved = false;
      forward.forEach((item) => {
        const want = depth.get(item.from) + 1;
        if (depth.get(item.to) < want) { depth.set(item.to, want); moved = true; }
      });
      if (!moved) break;
    }
    // Unreached parts go after the rest of the story.
    const mainDepth = Math.max(0, ...[...reached].map((id) => depth.get(id)));
    nodes.forEach((node, id) => { if (node.orphan) depth.set(id, depth.get(id) + mainDepth + 1); });
    const order = [...reached, ...[...nodes.keys()].filter((id) => !reached.has(id))];
    const maxDepth = Math.max(...depth.values());
    const columns = Array.from({ length: maxDepth + 1 }, () => []);
    order.forEach((id) => columns[depth.get(id)].push(id));
    // Keep each node near the nodes that lead to it (fewer crossing lines).
    const rowOf = new Map();
    columns.forEach((column, c) => {
      if (c > 0) {
        const score = (id) => {
          const parents = edges.filter((item) => item.to === id && rowOf.has(item.from)).map((item) => rowOf.get(item.from));
          return parents.length ? parents.reduce((a, b) => a + b, 0) / parents.length : Infinity;
        };
        column.sort((a, b) => score(a) - score(b));
      }
      column.forEach((id, row) => rowOf.set(id, row));
    });
    const labelRoom = columns.map((column) => {
      const longest = Math.max(0, ...edges.filter((item) => column.includes(item.from) && item.label).map((item) => item.label.length));
      return Math.max(GAP_X, longest * 7.6 + 30);
    });
    let x = 0;
    columns.forEach((column, c) => {
      const width = Math.max(...column.map((id) => SIZE[nodes.get(id).kind][0]));
      const height = column.reduce((sum, id) => sum + SIZE[nodes.get(id).kind][1], 0) + GAP_Y * (column.length - 1);
      let y = -height / 2;
      column.forEach((id) => {
        const [w, h] = SIZE[nodes.get(id).kind];
        pos.set(id, { x: x + (width - w) / 2, y, w, h, col: depth.get(id) });
        y += h + GAP_Y;
      });
      x += width + labelRoom[c];
    });
    return pos;
  }

  // --- The map --------------------------------------------------------------------------
  function open(options) {
    const state = { view: null, autoFit: true, bounds: null, timer: null };
    const svg = svgEl('svg', { class: 'smap-svg', role: 'img', 'aria-label': 'Story Map' });
    const viewport = el('div', { class: 'smap-viewport' }, [svg]);
    const zoomBy = (factor) => { state.autoFit = false; zoomAt(factor); };
    const header = el('div', { class: 'smap-head' }, [
      el('p', { class: 'smap-hint', text: 'Every path a reader can take. Click a page or an ending to change it; drag to move around; Ctrl + scroll to zoom.' }),
      el('div', { class: 'smap-tools' }, [
        UI.iconButton('zoomOut', 'Zoom out', () => zoomBy(1 / 1.25)),
        UI.iconButton('zoomIn', 'Zoom in', () => zoomBy(1.25)),
        UI.iconButton('fit', 'Fit the whole story', () => { state.autoFit = true; fit(); })
      ])
    ]);
    const legend = el('div', { class: 'smap-legend' }, [
      el('span', {}, [el('i', { class: 'is-page' }), 'Story page']),
      el('span', {}, [el('i', { class: 'is-platform' }), 'Platform page']),
      el('span', {}, [el('i', { class: 'is-choice' }), 'Choice']),
      el('span', {}, [el('i', { class: 'is-end' }), 'Ending'])
    ]);
    const panel = el('div', { class: 'smap-panel' }, [header, viewport, legend]);
    const modal = UI.openModal({
      title: 'Story Map', size: 'xl', render: () => panel,
      onClose() { clearTimeout(state.timer); if (options.onClose) options.onClose(); }
    });
    // A page's or an ending's settings open in this popup; Back returns to the map.
    function showDetails(content, title) {
      if (!content) return;
      const sub = modal.showSubview(el('div', { class: 'smap-details' }, [
        el('button', { type: 'button', class: 'ed-btn ed-btn-ghost ed-btn-small ed-back-btn', on: { click() { sub.back(); } } }, [el('span', { text: '← Back to the Story Map' })]),
        content
      ]), title, render);
    }

    // --- View box: zoom and pan ---------------------------------------------------------
    function size() {
      const rect = viewport.getBoundingClientRect();
      return { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
    }
    function applyView() {
      if (!state.view) return;
      const { x, y, w, h } = state.view;
      svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    }
    function fit() {
      if (!state.bounds) return;
      const { w, h } = size();
      const b = state.bounds;
      const pad = 28;
      // (A phone's map is narrow, so there it may shrink further.) A small story
      // keeps its natural size; it is never blown up to fill the map.
      const scale = Math.max(w < 520 ? 0.45 : MIN_FIT, Math.min(w / (b.w + pad * 2), h / (b.h + pad * 2), 1));
      const vw = w / scale;
      const vh = h / scale;
      // A story wider than the map starts at the beginning (Start), on the left.
      const x = b.w + pad * 2 > vw ? b.x - pad : b.x + b.w / 2 - vw / 2;
      state.view = { x, y: b.y + b.h / 2 - vh / 2, w: vw, h: vh };
      applyView();
    }
    function zoomAt(factor, clientX, clientY) {
      if (!state.view) return;
      const rect = viewport.getBoundingClientRect();
      const fx = clientX === undefined ? 0.5 : (clientX - rect.left) / rect.width;
      const fy = clientY === undefined ? 0.5 : (clientY - rect.top) / rect.height;
      const v = state.view;
      const nw = Math.min(Math.max(v.w / factor, 120), 6000);
      const nh = nw * (v.h / v.w);
      state.view = { x: v.x + (v.w - nw) * fx, y: v.y + (v.h - nh) * fy, w: nw, h: nh };
      applyView();
    }
    viewport.addEventListener('wheel', (event) => {
      event.preventDefault();
      state.autoFit = false;
      if (event.ctrlKey || event.metaKey) { zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX, event.clientY); return; }
      const { w } = size();
      const k = state.view.w / w;
      state.view.x += (event.shiftKey ? event.deltaY : event.deltaX) * k;
      state.view.y += (event.shiftKey ? 0 : event.deltaY) * k;
      applyView();
    }, { passive: false });
    let drag = null;
    viewport.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      drag = { x: event.clientX, y: event.clientY, view: { ...state.view }, moved: false, target: event.target.closest('[data-node]') };
      viewport.setPointerCapture(event.pointerId);
    });
    viewport.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      drag.moved = true;
      state.autoFit = false;
      viewport.classList.add('is-panning');
      const k = state.view.w / size().w;
      state.view.x = drag.view.x - dx * k;
      state.view.y = drag.view.y - dy * k;
      applyView();
    });
    const endDrag = () => {
      if (drag && !drag.moved && drag.target) activate(drag.target.dataset.node);
      drag = null;
      viewport.classList.remove('is-panning');
    };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', () => { drag = null; viewport.classList.remove('is-panning'); });
    svg.addEventListener('keydown', (event) => {
      const target = event.target.closest('[data-node]');
      if (target && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); activate(target.dataset.node); }
    });
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => { if (state.autoFit) fit(); else if (state.view) { const { w, h } = size(); state.view.h = state.view.w * (h / w); applyView(); } }).observe(viewport);
    }

    let graph = null;
    function activate(id) {
      const node = graph && graph.nodes.get(id);
      if (!node) return;
      if (node.kind === 'page' || node.kind === 'start') {
        const index = node.kind === 'start' ? 0 : node.index;
        showDetails(options.onPage(index), `${tr('Page')} ${index + 1}`);
      } else if (node.kind === 'end') {
        showDetails(options.onEnding(node), tr('Ending'));
      } else if (node.kind === 'choice') {
        // A choice is edited where it is: the map closes on it.
        modal.close();
        options.onChoice(node.index, node.ref);
      }
    }

    // --- Drawing ---------------------------------------------------------------------------
    function render() {
      const pages = options.getPages();
      graph = buildGraph(pages, options.pageLabel);
      const boxes = layout(graph);
      const current = options.currentIndex();
      svg.replaceChildren();
      const defs = svgEl('defs');
      ['flow', 'choice', 'jump'].forEach((kind) => defs.appendChild(svgEl('marker', { id: `smap-arrow-${kind}`, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, [
        svgEl('path', { d: 'M0 0L10 5L0 10z', class: `smap-arrow is-${kind}` })
      ])));
      svg.appendChild(defs);
      const lines = svgEl('g', { class: 'smap-lines' });
      const labels = svgEl('g', { class: 'smap-labels' });
      const shapes = svgEl('g', { class: 'smap-nodes' });
      svg.append(lines, labels, shapes);

      // Lines: forward ones run left to right; ones that go back loop over the top.
      const top = Math.min(...[...boxes.values()].map((b) => b.y));
      let loops = 0;
      graph.edges.forEach((item) => {
        const a = boxes.get(item.from);
        const b = boxes.get(item.to);
        if (!a || !b) return;
        let d;
        let mid;
        if (b.col > a.col) {
          const x1 = a.x + a.w;
          const y1 = a.y + a.h / 2;
          const x2 = b.x - 2;
          const y2 = b.y + b.h / 2;
          const c = Math.max(24, (x2 - x1) / 2);
          d = `M${x1} ${y1} C${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
          mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
        } else {
          loops += 1;
          const lift = top - 34 - loops * 30;
          const x1 = a.x + a.w / 2;
          const x2 = b.x + b.w / 2;
          d = `M${x1} ${a.y} C${x1} ${lift}, ${x2} ${lift}, ${x2} ${b.y - 2}`;
          mid = { x: (x1 + x2) / 2, y: lift + (Math.min(a.y, b.y) - lift) * 0.25 };
        }
        lines.appendChild(svgEl('path', { d, class: `smap-line is-${item.kind}`, 'marker-end': `url(#smap-arrow-${item.kind})` }));
        if (item.label) {
          const text = svgEl('text', { x: mid.x, y: mid.y + 5, class: 'smap-label', 'text-anchor': 'middle', translate: item.kind === 'choice' ? 'no' : null });
          text.textContent = item.label;
          labels.appendChild(text);
        }
      });

      graph.nodes.forEach((node, id) => {
        const b = boxes.get(id);
        if (!b) return;
        const isCurrent = node.kind === 'page' && node.index === current;
        const group = svgEl('g', {
          class: `smap-node is-${node.kind}${node.platform ? ' is-platform' : ''}${isCurrent ? ' is-current' : ''}${node.orphan ? ' is-orphan' : ''}`,
          'data-node': id, tabindex: '0', role: 'button'
        });
        const title = svgEl('title');
        title.textContent = node.kind === 'page'
          ? `${node.label}${node.orphan ? ` — ${tr('No path leads here yet')}` : ''}`
          : node.label;
        group.appendChild(title);
        if (node.kind === 'choice') {
          const cx = b.x + b.w / 2;
          const cy = b.y + b.h / 2;
          group.appendChild(svgEl('polygon', { points: `${cx},${b.y} ${b.x + b.w},${cy} ${cx},${b.y + b.h} ${b.x},${cy}`, class: 'smap-shape' }));
          const text = svgEl('text', { x: cx, y: cy + 5, 'text-anchor': 'middle', class: 'smap-text is-small', translate: 'no' });
          text.textContent = short(node.label, 10);
          group.appendChild(text);
        } else if (node.kind === 'page') {
          drawPage(group, node, b, id);
        } else {
          const radius = b.h / 2;
          group.appendChild(svgEl('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: radius, class: 'smap-shape' }));
          const text = svgEl('text', { x: b.x + b.w / 2, y: b.y + b.h / 2 + 6, 'text-anchor': 'middle', class: 'smap-text', translate: node.kind === 'page' || (node.kind === 'end' && node.name !== 'The end') ? 'no' : null });
          text.textContent = short(node.label, node.kind === 'page' ? 22 : 17);
          group.appendChild(text);
        }
        shapes.appendChild(group);
      });

      const all = [...boxes.values()];
      const minX = Math.min(...all.map((b) => b.x));
      const maxX = Math.max(...all.map((b) => b.x + b.w));
      const minY = Math.min(top - 34 - loops * 30, ...all.map((b) => b.y));
      const maxY = Math.max(...all.map((b) => b.y + b.h));
      state.bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      if (state.autoFit || !state.view) fit(); else applyView();
    }

    // A page: its thumbnail (background, characters or stage scenery), then
    // its title in a coloured bar, all inside one rounded outline.
    function drawPage(group, node, b, id) {
      const thumb = options.pageThumb ? options.pageThumb(node.page) : { color: '#ffffff', layers: [], characters: [] };
      const thumbH = b.h - PAGE_BAR;
      const clipId = `smap-clip-${id}`;
      group.appendChild(svgEl('clipPath', { id: clipId }, [svgEl('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 10 })]));
      const inside = svgEl('g', { 'clip-path': `url(#${clipId})` });
      inside.appendChild(svgEl('rect', { x: b.x, y: b.y, width: b.w, height: thumbH, fill: thumb.color || '#ffffff' }));
      // Back layers first (the list runs front to back, like CSS backgrounds).
      thumb.layers.slice().reverse().forEach((src) => {
        inside.appendChild(thumb.platform
          ? svgEl('image', { href: src, x: b.x, y: b.y + thumbH - thumbH * 1.2, width: b.w * 4, height: thumbH * 1.2, preserveAspectRatio: 'xMinYMax meet' })
          : svgEl('image', { href: src, x: b.x, y: b.y, width: b.w, height: thumbH, preserveAspectRatio: 'xMidYMid slice' }));
      });
      if (thumb.platform) {
        const groundH = thumbH * 0.16;
        inside.appendChild(svgEl('rect', { x: b.x, y: b.y + thumbH - groundH, width: b.w, height: groundH, fill: '#7a5233' }));
        inside.appendChild(svgEl('rect', { x: b.x, y: b.y + thumbH - groundH, width: b.w, height: groundH * 0.35, fill: '#6dbb4a' }));
      }
      (thumb.characters || []).forEach((character) => {
        const h = thumbH * 0.8;
        const w = b.w * 0.42;
        const x = character.side === 'left' ? b.x + b.w * 0.05 : b.x + b.w * 0.53;
        const image = svgEl('image', { href: character.src, x, y: b.y + thumbH - h, width: w, height: h, preserveAspectRatio: 'xMidYMax meet' });
        // The right-hand character faces left, as on the page.
        if (character.side === 'right') image.setAttribute('transform', `translate(${2 * x + w} 0) scale(-1 1)`);
        inside.appendChild(image);
      });
      inside.appendChild(svgEl('rect', { x: b.x, y: b.y + thumbH, width: b.w, height: PAGE_BAR, class: 'smap-bar' }));
      inside.appendChild(svgEl('line', { x1: b.x, y1: b.y + thumbH, x2: b.x + b.w, y2: b.y + thumbH, class: 'smap-divider' }));
      group.appendChild(inside);
      group.appendChild(svgEl('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 10, class: 'smap-shape is-outline' }));
      const text = svgEl('text', { x: b.x + b.w / 2, y: b.y + thumbH + PAGE_BAR / 2 + 6, 'text-anchor': 'middle', class: 'smap-text', translate: 'no' });
      text.textContent = short(node.label, 22);
      group.appendChild(text);
    }

    function update() {
      clearTimeout(state.timer);
      state.timer = setTimeout(() => { if (!modal.subview) render(); }, 60);
    }

    // Drawn once the popup is on screen (it needs the popup's size).
    requestAnimationFrame(render);
    setTimeout(() => { if (!state.bounds) render(); }, 50);
    return { update, close: () => modal.close() };
  }

  window.KoobdStoryMap = { open, buildGraph };
})();
