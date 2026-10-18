// Small building blocks shared by the story editor (js/teacher-story-editor.js)
// and its Platform Mode editor (js/platform-editor*.js): form fields, the
// "where does this lead" picker used by choices and pages, the media picker
// (storyboard illustrations and the teacher's uploads) and uploading.
(function () {
  const config = window.KOOBD_STORY_EDITOR || {};
  const uploadEndpoint = String(config.platformerUploadEndpoint || 'teacher_upload_platformer_asset.php');
  const uploadsEndpoint = String(config.platformerAssetsEndpoint || 'teacher_platformer_assets.php');
  const deleteEndpoint = String(config.platformerDeleteEndpoint || 'teacher_delete_platformer_asset.php');

  // el('div', { class: 'x', text: 'Hi', on: { click() {} } }, [children])
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'on') Object.entries(value).forEach(([name, handler]) => node.addEventListener(name, handler));
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key === 'style') Object.assign(node.style, value);
      else if (key in node && typeof value !== 'string') node[key] = value;
      else node.setAttribute(key, value === true ? '' : value);
    });
    (Array.isArray(children) ? children : [children]).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  // Simple line icons for buttons (24x24, drawn with currentColor).
  const ICONS = {
    select: 'M5 3l13 8-6 1.5L9 19z',
    pan: 'M8 11V5a1.5 1.5 0 013 0v5m0-6a1.5 1.5 0 013 0v6m0-4a1.5 1.5 0 013 0v7a6 6 0 01-6 6h-1a6 6 0 01-5-2.7L4 14a1.5 1.5 0 012.5-1.6L8 14',
    gap: 'M2 16h6v5M22 16h-6v5M8 16c1-2 2.5-3 4-3s3 1 4 3',
    flag: 'M6 21V4m0 1h11l-2.5 4L17 13H6',
    duplicate: 'M8 8h11v11H8zM5 16V5h11',
    rotateLeft: 'M4 5v5h5M4.6 14a8 8 0 102-8.4L4 10',
    rotateRight: 'M20 5v5h-5M19.4 14a8 8 0 11-2-8.4L20 10',
    flip: 'M12 3v18M9 7L4 17h5zM15 7l5 10h-5z',
    front: 'M4 14l8 4 8-4M12 4l8 4-8 4-8-4z',
    back: 'M4 10l8 4 8-4M12 20l8-4M12 20l-8-4',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    magnet: 'M6 4v8a6 6 0 0012 0V4h-4v8a2 2 0 01-4 0V4zM6 8h4M14 8h4',
    hitbox: 'M4 4h16v16H4zM4 4l16 16',
    zoomIn: 'M10.5 4a6.5 6.5 0 110 13 6.5 6.5 0 010-13zM15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6',
    zoomOut: 'M10.5 4a6.5 6.5 0 110 13 6.5 6.5 0 010-13zM15.5 15.5L21 21M7.5 10.5h6',
    fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    play: 'M7 4l13 8-13 8z',
    plus: 'M12 5v14M5 12h14',
    up: 'M12 19V5M6 11l6-6 6 6',
    down: 'M12 5v14M6 13l6 6 6-6',
    close: 'M6 6l12 12M18 6L6 18',
    upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
    music: 'M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z',
    map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
    person: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
    film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
    chat: 'M4 5h16v11H9l-5 4z',
    check: 'M5 12l5 5L20 7',
    settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z',
    sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
    mic: 'M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM5 11a7 7 0 0014 0M12 18v3',
    camera: 'M4 7h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
    info: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 16v-5M12 8h0',
    eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
    clipboard: 'M9 4h6v3H9zM9 5H6v15h12V5h-3M9 11h6M9 15h4'
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('ed-icon');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[name] || ICONS.plus);
    svg.appendChild(path);
    return svg;
  }

  function iconButton(name, label, onClick, extra = {}) {
    return el('button', {
      type: 'button',
      class: `ed-icon-btn ${extra.class || ''}`.trim(),
      title: extra.title || label,
      'aria-label': label,
      on: { click: onClick }
    }, [icon(name), extra.showLabel ? el('span', { text: label }) : null]);
  }

  // A compact button that opens a popup, showing what is set now:
  //   [icon  Label        summary  ›]
  function popupButton(label, summary, onClick, iconName = 'sliders') {
    return el('button', { type: 'button', class: 'ed-popup-btn', on: { click: onClick } }, [
      icon(iconName),
      el('span', { class: 'ed-popup-btn-label', text: label }),
      summary ? el('span', { class: 'ed-popup-btn-summary', text: summary }) : null,
      el('span', { class: 'ed-popup-btn-chevron', 'aria-hidden': 'true', text: '›' })
    ]);
  }

  // A labelled form row. `control` is any element.
  function field(label, control, options = {}) {
    return el('label', { class: `ed-field${options.full ? ' is-full' : ''}${options.inline ? ' is-inline' : ''}` }, [
      el('span', { class: 'ed-field-label', text: label }),
      control,
      options.hint ? el('span', { class: 'ed-field-hint', text: options.hint }) : null
    ]);
  }

  function input(value, onInput, options = {}) {
    const node = el('input', {
      type: options.type || 'text',
      value: value ?? '',
      placeholder: options.placeholder || '',
      maxLength: options.maxlength || 200,
      autocomplete: 'off'
    });
    node.addEventListener('input', () => onInput(node.value));
    if (options.onCommit) node.addEventListener('change', () => options.onCommit(node.value));
    return node;
  }

  function textarea(value, onInput, options = {}) {
    const node = el('textarea', { rows: options.rows || 3, placeholder: options.placeholder || '', maxLength: options.maxlength || 600 });
    node.value = value ?? '';
    node.addEventListener('input', () => onInput(node.value));
    if (options.onCommit) node.addEventListener('change', () => options.onCommit(node.value));
    return node;
  }

  // options: [{ value, label }] or [[value, label]]
  function select(options, value, onChange) {
    const node = el('select');
    options.forEach((option) => {
      const [optionValue, label] = Array.isArray(option) ? option : [option.value, option.label];
      node.appendChild(el('option', { value: optionValue, text: label, selected: String(optionValue) === String(value) }));
    });
    node.addEventListener('change', () => onChange(node.value));
    return node;
  }

  function number(value, onChange, options = {}) {
    const node = el('input', { type: 'number', value: String(value ?? 0), step: String(options.step ?? 1) });
    if (options.min !== undefined) node.min = String(options.min);
    if (options.max !== undefined) node.max = String(options.max);
    node.addEventListener('change', () => {
      let next = Number(node.value);
      if (!Number.isFinite(next)) next = Number(value) || 0;
      if (options.min !== undefined) next = Math.max(options.min, next);
      if (options.max !== undefined) next = Math.min(options.max, next);
      node.value = String(next);
      onChange(next);
    });
    return node;
  }

  function range(value, onChange, options = {}) {
    const node = el('input', { type: 'range', min: String(options.min ?? 0), max: String(options.max ?? 1), step: String(options.step ?? 0.05), value: String(value) });
    node.addEventListener('input', () => onChange(Number(node.value), false));
    node.addEventListener('change', () => onChange(Number(node.value), true));
    return node;
  }

  function toggle(label, checked, onChange, hint = '') {
    const box = el('input', { type: 'checkbox', checked: Boolean(checked) });
    box.addEventListener('change', () => onChange(box.checked));
    return el('label', { class: 'ed-toggle', title: hint || '' }, [box, el('span', { class: 'ed-toggle-track', 'aria-hidden': 'true' }), el('span', { text: label })]);
  }

  // A row of buttons where one is chosen.
  function segmented(options, value, onChange) {
    const wrap = el('div', { class: 'ed-segmented', role: 'group' });
    options.forEach(([optionValue, label]) => {
      const button = el('button', {
        type: 'button',
        class: optionValue === value ? 'is-active' : '',
        text: label,
        'aria-pressed': optionValue === value ? 'true' : 'false',
        on: {
          click() {
            wrap.querySelectorAll('button').forEach((item) => {
              item.classList.toggle('is-active', item === button);
              item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
            });
            onChange(optionValue);
          }
        }
      });
      wrap.appendChild(button);
    });
    return wrap;
  }

  // Where something leads. goto: { type: continue|next|page|end, page, label }.
  // options.pages: [{ key, label }]; options.types: which of the types to offer.
  function gotoEditor(goto, options) {
    const current = goto && typeof goto === 'object' ? goto : { type: options.types[0] };
    const labels = {
      continue: options.continueLabel || 'Keep going',
      next: options.nextLabel || 'The next page',
      page: 'Jump to a page',
      end: 'End the story'
    };
    const wrap = el('div', { class: 'ed-goto' });
    const render = () => {
      wrap.replaceChildren();
      wrap.appendChild(select(options.types.map((type) => [type, labels[type]]), current.type, (type) => {
        current.type = type;
        if (type === 'page' && !current.page) current.page = (options.pages[0] || {}).key || '';
        if (type !== 'page') delete current.page;
        if (type !== 'end') delete current.label;
        options.onChange({ ...current });
        render();
      }));
      if (current.type === 'page') {
        const pages = options.pages.length ? options.pages : [{ key: '', label: 'No other pages yet' }];
        wrap.appendChild(select(pages.map((page) => [page.key, page.label]), current.page, (key) => {
          current.page = key;
          options.onChange({ ...current });
        }));
      }
      if (current.type === 'end') {
        wrap.appendChild(input(current.label || '', (value) => {
          current.label = value;
          options.onChange({ ...current });
        }, { placeholder: 'Ending name (optional), e.g. The Happy Ending', maxlength: 80 }));
      }
    };
    render();
    return wrap;
  }

  // --- Uploads -------------------------------------------------------------
  const uploads = {
    items: null,
    loading: null,
    listeners: new Set(),
    async list() {
      if (this.items) return this.items;
      if (!this.loading) {
        this.loading = fetch(uploadsEndpoint, { credentials: 'same-origin' })
          .then((response) => (response.ok ? response.json() : { assets: [] }))
          .then((payload) => { this.items = Array.isArray(payload.assets) ? payload.assets : []; return this.items; })
          .catch(() => { this.items = []; return this.items; });
      }
      return this.loading;
    },
    add(item) {
      if (!this.items) this.items = [];
      this.items.unshift(item);
      this.listeners.forEach((listener) => listener());
    },
    remove(url) {
      if (this.items) this.items = this.items.filter((item) => item.url !== url);
      this.listeners.forEach((listener) => listener());
    },
    // The pictures uploaded to one library section (character, background,
    // block, hazard, scenery), newest first. Pictures from before sections
    // existed (no section) show in every picture section.
    async forSection(section) {
      return (await this.list()).filter((item) => item.kind === 'image' && (item.section === section || !item.section));
    },
    onChange(listener) { this.listeners.add(listener); }
  };

  // Deletes one of the teacher's uploads, after asking. Resolves true when deleted.
  async function deleteUpload(item) {
    const ok = await confirmDialog(`Delete “${item.name}” from your uploads? Anything in your stories that uses it will show an empty space instead.`);
    if (!ok) return false;
    const body = new FormData();
    body.append('url', item.url);
    let payload = null;
    try {
      const response = await fetch(deleteEndpoint, { method: 'POST', body, credentials: 'same-origin' });
      payload = await response.json();
    } catch (error) { payload = null; }
    if (!payload || !payload.success) {
      window.alert((payload && payload.message) || 'The upload could not be deleted.');
      return false;
    }
    uploads.remove(item.url);
    return true;
  }
  // The small bin shown on an uploaded asset.
  function deleteUploadButton(item, onDeleted) {
    return el('button', {
      type: 'button', class: 'ed-upload-delete', title: `Delete “${item.name}”`, 'aria-label': `Delete ${item.name}`,
      on: {
        click: async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (await deleteUpload(item) && onDeleted) onDeleted(item);
        }
      }
    }, [icon('trash')]);
  }

  // --- Cropping a picture before it is uploaded ------------------------------------------
  // cropImage(file, { aspect }) shows the picture with a crop box that can be
  // moved and resized (free, or held to a shape), and resolves with the
  // cropped picture as a new File - or the original with "Use whole picture",
  // or null if cancelled.
  const CROP_SHAPES = [['free', 'Free', null], ['square', 'Square', 1], ['4:3', '4:3', 4 / 3], ['16:9', '16:9', 16 / 9]];
  function cropImage(file, options = {}) {
    return new Promise((resolve) => {
      const source = URL.createObjectURL(file);
      const picture = new Image();
      picture.onerror = () => { URL.revokeObjectURL(source); resolve(file); };
      picture.onload = () => {
        const natural = { w: picture.naturalWidth, h: picture.naturalHeight };
        let aspect = options.aspect || null;
        const image = el('img', { class: 'ed-crop-image', src: source, alt: '', draggable: false });
        const box = el('div', { class: 'ed-crop-box', tabindex: '0', 'aria-label': 'Crop area: drag to move' },
          ['nw', 'ne', 'sw', 'se'].map((corner) => el('span', { class: `ed-crop-handle is-${corner}`, dataset: { corner } })));
        const frame = el('div', { class: 'ed-crop-frame' }, [image, box]);
        const sizeNote = el('span', { class: 'ed-crop-size' });
        let rect = { x: 0, y: 0, w: 0, h: 0 }; // in displayed pixels
        const shown = () => ({ w: image.clientWidth, h: image.clientHeight });

        function draw() {
          box.style.left = `${rect.x}px`;
          box.style.top = `${rect.y}px`;
          box.style.width = `${rect.w}px`;
          box.style.height = `${rect.h}px`;
          const scale = natural.w / Math.max(1, shown().w);
          sizeNote.textContent = `${Math.round(rect.w * scale)} × ${Math.round(rect.h * scale)} px`;
        }
        // The largest box of the chosen shape, centred (or the whole picture).
        function reset() {
          const { w, h } = shown();
          if (!aspect) rect = { x: 0, y: 0, w, h };
          else {
            let bw = w;
            let bh = w / aspect;
            if (bh > h) { bh = h; bw = h * aspect; }
            rect = { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
          }
          draw();
        }
        const shapes = el('div', { class: 'ed-crop-shapes', role: 'radiogroup', 'aria-label': 'Crop shape' }, CROP_SHAPES.map(([id, label, value]) => el('button', {
          type: 'button', class: `ed-crop-shape${(aspect || null) === value ? ' is-active' : ''}`, text: label, dataset: { shape: id },
          on: {
            click() {
              aspect = value;
              shapes.querySelectorAll('.ed-crop-shape').forEach((node) => node.classList.toggle('is-active', node.dataset.shape === id));
              reset();
            }
          }
        })));

        // Dragging the box moves it; dragging a corner resizes it (keeping the shape).
        box.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          const corner = event.target.dataset.corner || '';
          const start = { px: event.clientX, py: event.clientY, ...rect };
          const bounds = shown();
          const MIN = 24;
          box.setPointerCapture(event.pointerId);
          const move = (moveEvent) => {
            const dx = moveEvent.clientX - start.px;
            const dy = moveEvent.clientY - start.py;
            if (!corner) {
              rect.x = Math.max(0, Math.min(bounds.w - start.w, start.x + dx));
              rect.y = Math.max(0, Math.min(bounds.h - start.h, start.y + dy));
            } else {
              const west = corner.includes('w');
              const north = corner.includes('n');
              // The corner opposite the one being dragged stays put.
              const fixedX = west ? start.x + start.w : start.x;
              const fixedY = north ? start.y + start.h : start.y;
              let w = Math.max(MIN, west ? start.w - dx : start.w + dx);
              let h = Math.max(MIN, north ? start.h - dy : start.h + dy);
              w = Math.min(w, west ? fixedX : bounds.w - fixedX);
              h = Math.min(h, north ? fixedY : bounds.h - fixedY);
              if (aspect) {
                if (w / h > aspect) w = h * aspect; else h = w / aspect;
              }
              rect = { x: west ? fixedX - w : fixedX, y: north ? fixedY - h : fixedY, w, h };
            }
            draw();
          };
          const up = () => {
            box.removeEventListener('pointermove', move);
            box.removeEventListener('pointerup', up);
            box.removeEventListener('pointercancel', up);
          };
          box.addEventListener('pointermove', move);
          box.addEventListener('pointerup', up);
          box.addEventListener('pointercancel', up);
        });

        const finish = (value) => {
          overlay.remove();
          document.removeEventListener('keydown', onKey, true);
          window.removeEventListener('resize', reset);
          URL.revokeObjectURL(source);
          resolve(value);
        };
        // The cropped part, at full resolution (at most 4096 px across), as a new file.
        function crop() {
          const scale = natural.w / Math.max(1, shown().w);
          const sx = Math.round(rect.x * scale);
          const sy = Math.round(rect.y * scale);
          const sw = Math.max(1, Math.round(rect.w * scale));
          const sh = Math.max(1, Math.round(rect.h * scale));
          const fit = Math.min(1, 4096 / Math.max(sw, sh));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(sw * fit);
          canvas.height = Math.round(sh * fit);
          canvas.getContext('2d').drawImage(picture, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          const type = file.type === 'image/jpeg' ? 'image/jpeg' : file.type === 'image/webp' ? 'image/webp' : 'image/png';
          canvas.toBlob((blob) => {
            if (!blob) { finish(file); return; }
            const name = String(file.name || 'picture').replace(/\.[a-z0-9]+$/i, '') + (type === 'image/jpeg' ? '.jpg' : type === 'image/webp' ? '.webp' : '.png');
            finish(new File([blob], name, { type }));
          }, type, 0.92);
        }
        function onKey(event) {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(null); }
          if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); crop(); }
        }

        const overlay = el('div', { class: 'ed-crop', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Crop your picture' }, [
          el('div', { class: 'ed-crop-card' }, [
            el('div', { class: 'ed-crop-head' }, [
              el('h3', { text: options.title || 'Crop your picture' }),
              el('p', { text: 'Drag the box to choose the part to keep; drag a corner to resize it.' })
            ]),
            el('div', { class: 'ed-crop-stage' }, [frame]),
            el('div', { class: 'ed-crop-tools' }, [shapes, sizeNote]),
            el('div', { class: 'ed-crop-actions' }, [
              el('button', { type: 'button', class: 'ed-btn ed-btn-soft', text: 'Cancel', on: { click: () => finish(null) } }),
              el('button', { type: 'button', class: 'ed-btn ed-btn-soft', text: 'Use whole picture', on: { click: () => finish(file) } }),
              el('button', { type: 'button', class: 'ed-btn ed-btn-primary', text: 'Crop & Add', on: { click: crop } })
            ])
          ])
        ]);
        document.body.appendChild(overlay);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', reset);
        if (image.complete) requestAnimationFrame(reset); else image.onload = reset;
        setTimeout(reset, 60);
        box.focus({ preventScroll: true });
      };
      picture.src = source;
    });
  }

  // options: { section, sheet } - the library section it is uploaded to, and
  // for a character whether it is an animated sprite sheet.
  async function uploadFile(file, options = {}) {
    const limits = { image: 10, audio: 15, video: 40 };
    const kind = /^image\//.test(file.type) ? 'image' : /^audio\//.test(file.type) ? 'audio' : /^video\//.test(file.type) ? 'video' : '';
    if (!kind) throw new Error('Use a PNG, JPG, WEBP or GIF picture, an MP3 sound, or an MP4 / WEBM video.');
    if (file.size > limits[kind] * 1024 * 1024) throw new Error(`This file must be smaller than ${limits[kind]} MB.`);
    const body = new FormData();
    body.append('image', file);
    if (options.section) body.append('section', options.section);
    if (options.sheet) body.append('sheet', '1');
    const response = await fetch(uploadEndpoint, { method: 'POST', body, credentials: 'same-origin' });
    let payload = null;
    try { payload = await response.json(); } catch (error) { payload = null; }
    if (!response.ok || !payload || !payload.success) throw new Error((payload && payload.message) || 'The upload failed.');
    const item = {
      url: String(payload.url), name: String(payload.name || file.name), kind: String(payload.kind || kind),
      section: String(payload.section || ''), sheet: Boolean(payload.sheet)
    };
    uploads.add(item);
    return item;
  }

  // A file input styled as a button that uploads what is chosen. A picture is
  // first shown in the crop window (not an animated GIF or a sprite sheet,
  // which cropping would break).
  // options: { section, aspect (the crop shape to start with), sheet: () => boolean }
  function uploadButton(label, accept, onUploaded, statusNode, options = {}) {
    const fileInput = el('input', { type: 'file', accept, class: 'ed-visually-hidden' });
    const button = el('label', { class: 'ed-btn ed-btn-soft' }, [icon('upload'), el('span', { text: label }), fileInput]);
    fileInput.addEventListener('change', async () => {
      let file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const sheet = Boolean(options.sheet && options.sheet());
      if (/^image\/(png|jpeg|webp)$/.test(file.type) && !sheet) {
        const cropped = await cropImage(file, { aspect: options.aspect });
        if (!cropped) { fileInput.value = ''; return; }
        file = cropped;
      }
      button.classList.add('is-busy');
      if (statusNode) statusNode.textContent = 'Uploading…';
      try {
        const item = await uploadFile(file, { section: options.section, sheet });
        if (statusNode) statusNode.textContent = `Added “${item.name}”.`;
        onUploaded(item);
      } catch (error) {
        if (statusNode) statusNode.textContent = error.message;
        else window.alert(error.message);
      } finally {
        button.classList.remove('is-busy');
        fileInput.value = '';
      }
    });
    return button;
  }

  const LIB = () => window.KoobdPlatformLibrary;
  const assetUrl = (path) => (LIB() ? LIB().url(path) : encodeURI(String(path || '')));

  // --- Popups ------------------------------------------------------------------
  // openModal({ title, render, size: 'sm' | 'md' | 'lg', onClose }) shows one
  // popup; `render()` returns its content and runs again on refresh(), so the
  // popup stays in step with the editor after every change. Only one popup is
  // open at a time: anything a popup needs (the media picker) opens inside it.
  let activeModal = null;
  function openModal(options) {
    if (activeModal) activeModal.close();
    const title = el('h2', { text: options.title || '' });
    const body = el('div', { class: 'ed-modal-body' });
    const card = el('div', { class: `ed-modal-card is-${options.size || 'md'}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': options.title || '' }, [
      el('div', { class: 'ed-modal-head' }, [title, iconButton('close', 'Close', () => modal.close())]),
      body
    ]);
    const overlay = el('div', { class: 'ed-modal' }, [card]);
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (modal.subview) modal.subview.back(); else modal.close();
    };
    const modal = {
      card, body, subview: null,
      refresh() {
        if (modal.subview || !options.render) return;
        const scroll = body.scrollTop;
        body.replaceChildren(options.render(modal));
        body.scrollTop = scroll;
      },
      setTitle(text) { title.textContent = text; },
      close() {
        if (!overlay.isConnected) return;
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
        if (activeModal === modal) activeModal = null;
        if (options.onClose) options.onClose();
      },
      // Shows `node` in place of the popup's content until back() is called
      // (by its Back button or Esc); `onBack` runs after going back.
      showSubview(node, subTitle, onBack) {
        const saved = { nodes: Array.from(body.childNodes), title: title.textContent, scroll: body.scrollTop };
        body.replaceChildren(node);
        if (subTitle) title.textContent = subTitle;
        modal.subview = {
          back() {
            modal.subview = null;
            body.replaceChildren(...saved.nodes);
            title.textContent = saved.title;
            body.scrollTop = saved.scroll;
            if (onBack) onBack();
          }
        };
        return modal.subview;
      }
    };
    overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) modal.close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    activeModal = modal;
    modal.refresh();
    const first = card.querySelector('input:not([type=hidden]), select, textarea, button:not(.ed-icon-btn)');
    if (first && window.matchMedia('(pointer:fine)').matches) first.focus({ preventScroll: true });
    return modal;
  }

  // --- Media picker -----------------------------------------------------------
  // openMediaPicker({ kinds: ['image', 'video'], title, onPick(item) })
  // item: { url, name, kind }. Inside a popup it opens in that popup.
  function openMediaPicker(options) {
    const kinds = options.kinds || ['image'];
    const tabs = [];
    if (kinds.includes('image') && options.storyboards !== false) tabs.push(['storyboards', 'Storyboards']);
    tabs.push(['uploads', 'My uploads']);
    let tab = tabs[0][0];
    const grid = el('div', { class: 'ed-media-grid' });
    const status = el('span', { class: 'ed-media-status', role: 'status' });
    const accept = kinds.map((kind) => ({ image: 'image/png,image/jpeg,image/webp,image/gif', audio: 'audio/mpeg', video: 'video/mp4,video/webm' }[kind])).join(',');
    let leave = () => {};
    const pick = (item) => { leave(); options.onPick(item); };

    const tile = (item) => {
      let media;
      if (item.kind === 'audio') media = el('div', { class: 'ed-media-audio' }, [icon('music'), el('audio', { controls: true, preload: 'none', src: assetUrl(item.url) })]);
      else if (item.kind === 'video') media = el('video', { src: assetUrl(item.url), muted: true, preload: 'metadata', playsInline: true });
      else media = el('img', { src: assetUrl(item.url), alt: '', loading: 'lazy' });
      return el('div', { class: 'ed-media-tile' }, [
        el('button', { type: 'button', class: 'ed-media-pick', title: item.name, on: { click: () => pick(item) } }, [media, el('span', { text: item.name })])
      ]);
    };

    const render = async () => {
      tabBar.querySelectorAll('button').forEach((button) => button.classList.toggle('is-active', button.dataset.tab === tab));
      grid.replaceChildren();
      if (tab === 'storyboards') {
        (LIB() ? LIB().frames : []).forEach((frame) => grid.appendChild(tile({ url: frame.src, name: frame.label, kind: 'image' })));
        return;
      }
      grid.appendChild(el('div', { class: 'ed-media-empty', text: 'Loading…' }));
      const items = (await uploads.list()).filter((item) => kinds.includes(item.kind));
      grid.replaceChildren();
      if (!items.length) grid.appendChild(el('div', { class: 'ed-media-empty', text: 'Nothing uploaded yet. Use “Upload” to add your own file.' }));
      items.forEach((item) => grid.appendChild(tile(item)));
    };

    const tabBar = el('div', { class: 'ed-tabs' }, tabs.map(([id, label]) => el('button', {
      type: 'button', text: label, dataset: { tab: id }, on: { click() { tab = id; render(); } }
    })));
    const view = el('div', { class: 'ed-media-view' }, [
      el('div', { class: 'ed-media-bar' }, [tabBar, uploadButton('Upload', accept, (item) => { if (kinds.includes(item.kind)) pick(item); }, status), status]),
      grid
    ]);

    if (activeModal) {
      const subview = activeModal.showSubview(el('div', {}, [
        el('button', { type: 'button', class: 'ed-btn ed-btn-ghost ed-btn-small ed-back-btn', on: { click: () => subview.back() } }, [el('span', { text: '← Back' })]),
        view
      ]), options.title || 'Choose media');
      leave = () => subview.back();
    } else {
      const modal = openModal({ title: options.title || 'Choose media', size: 'lg', render: () => view });
      leave = () => modal.close();
    }
    render();
  }

  // A small "chosen file" row with a change and a remove button.
  function mediaField(label, value, options) {
    const name = value ? decodeURIComponent(String(value).split('/').pop()) : 'None';
    let preview = null;
    if (value && options.kinds.includes('image') && !/\.(mp3|mp4|webm)$/i.test(value)) preview = el('img', { src: assetUrl(value), alt: '' });
    return field(label, el('div', { class: 'ed-media-field' }, [
      preview,
      el('span', { class: 'ed-media-name', text: name, title: name }),
      el('button', { type: 'button', class: 'ed-btn ed-btn-soft ed-btn-small', text: value ? 'Change' : 'Choose', on: { click: () => openMediaPicker({ kinds: options.kinds, title: options.title || label, storyboards: options.storyboards, onPick: (item) => options.onChange(item.url, item) }) } }),
      value ? el('button', { type: 'button', class: 'ed-btn ed-btn-ghost ed-btn-small', text: 'Remove', on: { click: () => options.onChange('', null) } }) : null
    ]), { full: true });
  }

  function confirmDialog(message, confirmLabel = 'Delete') {
    return new Promise((resolve) => {
      const done = (value) => { overlay.remove(); resolve(value); };
      const overlay = el('div', { class: 'ed-modal', role: 'dialog', 'aria-modal': 'true' }, [
        el('div', { class: 'ed-modal-card ed-confirm-card' }, [
          el('p', { text: message }),
          el('div', { class: 'ed-modal-actions' }, [
            el('button', { type: 'button', class: 'ed-btn ed-btn-soft', text: 'Cancel', on: { click: () => done(false) } }),
            el('button', { type: 'button', class: 'ed-btn ed-btn-danger', text: confirmLabel, on: { click: () => done(true) } })
          ])
        ])
      ]);
      document.body.appendChild(overlay);
      overlay.querySelector('.ed-btn-danger').focus();
    });
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  window.KoobdEditorUI = {
    el, icon, iconButton, popupButton, field, input, textarea, select, number, range, toggle, segmented,
    gotoEditor, uploads, uploadFile, uploadButton, cropImage, deleteUpload, deleteUploadButton, openModal, activeModal: () => activeModal, openMediaPicker, mediaField, confirmDialog, makeId, assetUrl
  };
})();
