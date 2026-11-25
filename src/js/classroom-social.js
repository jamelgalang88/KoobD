// Classroom conversations (classroom_social.php checks every request):
//   - Notifications: a bell ([data-social-bell]) with the unread count, also
//     shown on the side menu's Classroom link, and a list that opens from it.
//   - Private messages: a student's "Message Teacher" button
//     ([data-social-chat]) opens their conversation with the teacher; the
//     teacher's "Messages" button ([data-social-inbox]) opens an inbox of
//     every student's conversation. Both open as a panel at the side (a sheet
//     from the bottom on phones), Messenger-style: replies, reactions, photos
//     and videos, edit (5 minutes), forward, select, delete for everyone or
//     for me, search and clear. See "Private messages" below.
//   - Activity comments: under each activity ([data-activity-comments="<id>"])
//     a "Class comments" row opens the discussion; "Add comment" shows the
//     comment bar (Post Comment / Cancel); comments can be answered, and edited
//     or deleted by their author or the teacher.
// window.KOOBD_SOCIAL = { classroom, role: 'student'|'teacher', openChat, openComments }
// is set on a classroom's page; other pages only get the bell and the badge.
(function () {
  const config = window.KOOBD_SOCIAL || {};
  const ENDPOINT = 'classroom_social.php';
  const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  // --- Small helpers ------------------------------------------------------------------------------
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key === 'value') node.value = value;
      else node.setAttribute(key, value === true ? '' : value);
    });
    [].concat(children).forEach((child) => child !== null && child !== undefined && child !== false && node.append(child));
    return node;
  }
  function icon(path) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = path;
    return svg;
  }
  const ICONS = {
    bell: '<path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15zM10 20a2 2 0 004 0"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    comments: '<path d="M4 5h12v8H8l-4 3zM8 16v1h8l4 3V10h-2"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14.5a6.5 6.5 0 013.5 5.5"/>',
    more: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
    reply: '<path d="M10 8l-5 4 5 4M5 12h9a5 5 0 015 5v1"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 011-1h9"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
    forward: '<path d="M14 8l5 4-5 4M19 12h-9a5 5 0 00-5 5v1"/>',
    select: '<circle cx="12" cy="12" r="8"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
    hide: '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><path d="M4 4l16 16"/>',
    attach: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 16l-5-5-8 8"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    retry: '<path d="M4 12a8 8 0 0114-5.3M18 3v4h-4M20 12a8 8 0 01-14 5.3M6 21v-4h4"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    exitFullscreen: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'
  };
  const token = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

  async function api(action, params = {}, body = null) {
    let response;
    if (body) {
      response = await fetch(ENDPOINT, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body })
      });
    } else {
      const query = new URLSearchParams({ action, ...params });
      response = await fetch(`${ENDPOINT}?${query}`, { credentials: 'same-origin', cache: 'no-store' });
    }
    const result = await response.json().catch(() => ({ success: false, message: 'The server did not answer.' }));
    if (!result.success) throw new Error(result.message || 'Something went wrong. Please try again.');
    return result;
  }

  // "just now", "5 min ago", "3 h ago", then the date and time (local time).
  function when(seconds) {
    const date = new Date(seconds * 1000);
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400 && date.getDate() === new Date().getDate()) return `${Math.floor(diff / 3600)} h ago`;
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function timeTag(seconds) {
    const date = new Date(seconds * 1000);
    return el('time', { datetime: date.toISOString(), title: date.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' }), text: when(seconds) });
  }
  function avatar(person, size = '') {
    return el('span', {
      class: `sc-avatar${size ? ` is-${size}` : ''}`,
      style: `--sc-top:${person.top || '#dfe6ff'};--sc-bottom:${person.bottom || '#d3f5e6'}`,
      'aria-hidden': 'true'
    }, person.asset ? [el('img', { src: person.asset, alt: '', loading: 'lazy', decoding: 'async' })] : []);
  }
  function badge(node, count) {
    let mark = node.querySelector(':scope > .sc-badge');
    if (!count) { mark?.remove(); return; }
    if (!mark) { mark = el('span', { class: 'sc-badge' }); node.append(mark); }
    mark.textContent = count > 99 ? '99+' : String(count);
  }
  // A text box that grows with what is typed (up to a few lines).
  function grow(textarea, max = 160) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, max)}px`;
    textarea.style.overflowY = textarea.scrollHeight > max ? 'auto' : 'hidden';
  }
  // On phones and tablets the keyboard can cover a field: bring it into view.
  function keepInView(node) {
    if (!touch) return;
    window.setTimeout(() => node.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
  }

  // --- Panels (side panel on wide screens, bottom sheet on phones) -------------------------
  let openSheet = null;
  function sheet({ title, subtitle, lockIcon }) {
    const titleNode = el('h2', { class: 'sc-sheet-title', id: `sc-title-${token()}`, text: title });
    const subtitleNode = el('p', { class: 'sc-sheet-sub' }, [lockIcon ? icon(ICONS.lock) : null, el('span', { text: subtitle })]);
    const back = el('button', { type: 'button', class: 'sc-icon-btn sc-sheet-back', 'aria-label': 'Back', hidden: true }, [icon(ICONS.back)]);
    const close = el('button', { type: 'button', class: 'sc-icon-btn', 'aria-label': 'Close' }, [icon(ICONS.close)]);
    const face = el('span', { class: 'sc-sheet-face', hidden: true });
    const tools = el('div', { class: 'sc-sheet-tools' });
    const body = el('div', { class: 'sc-sheet-body' });
    const foot = el('div', { class: 'sc-sheet-foot' });
    const panel = el('section', { class: 'sc-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleNode.id }, [
      el('header', { class: 'sc-sheet-head' }, [back, face, el('div', { class: 'sc-sheet-heading' }, [titleNode, subtitleNode]), tools, close]),
      body, foot
    ]);
    const backdrop = el('div', { class: 'sc-backdrop' });
    const api = {
      panel, body, foot, back, face, tools, titleNode, subtitleNode,
      onClose: null,
      onEscape: null,
      open() {
        if (openSheet && openSheet !== api) openSheet.close();
        document.body.append(backdrop, panel);
        document.body.classList.add('has-sc-sheet');
        openSheet = api;
        fitKeyboard();
        window.requestAnimationFrame(() => panel.classList.add('is-open'));
        close.focus({ preventScroll: true });
      },
      close() {
        panel.remove();
        backdrop.remove();
        document.body.classList.remove('has-sc-sheet');
        if (openSheet === api) openSheet = null;
        if (api.onClose) api.onClose();
      }
    };
    close.addEventListener('click', () => api.close());
    backdrop.addEventListener('click', () => api.close());
    return api;
  }
  // Things open over a panel (a menu, a question, a photo): Escape closes the
  // top one first.
  const layers = [];
  function overlay(nodes, onClose = null) {
    const entry = {
      onClose,
      close() {
        const at = layers.indexOf(entry);
        if (at < 0) return;
        layers.splice(at, 1);
        nodes.forEach((node) => node.remove());
        if (entry.onClose) entry.onClose();
      }
    };
    layers.push(entry);
    return entry;
  }
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (layers.length) { layers[layers.length - 1].close(); return; }
    if (openSheet && openSheet.onEscape && openSheet.onEscape()) return;
    if (openSheet) openSheet.close();
  });
  // Keeps an open sheet above an on-screen keyboard where the browser does not
  // move it itself.
  function fitKeyboard() {
    if (!openSheet || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    openSheet.panel.style.setProperty('--sc-keyboard', `${covered}px`);
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitKeyboard);
    window.visualViewport.addEventListener('scroll', fitKeyboard);
  }

  // --- Notifications -----------------------------------------------------------------------------
  const bells = Array.from(document.querySelectorAll('[data-social-bell]'));
  const navLinks = Array.from(document.querySelectorAll('.sidebar a[href^="classroom.php"]'));
  let notifications = { unread: 0, items: [] };
  let bellPanel = null;

  async function loadNotifications() {
    try {
      notifications = await api('notifications');
    } catch (problem) {
      return;
    }
    bells.forEach((bell) => {
      badge(bell, notifications.unread);
      bell.setAttribute('aria-label', notifications.unread ? `Notifications, ${notifications.unread} unread` : 'Notifications');
    });
    navLinks.forEach((link) => {
      const holder = link.querySelector('.sidebar-link-icon, .sidebar-icon, img, svg')?.parentElement || link;
      holder.classList.add('sc-badge-holder');
      badge(holder, notifications.unread);
    });
    if (bellPanel && !bellPanel.hidden) renderBellPanel();
  }

  function renderBellPanel() {
    const items = notifications.items || [];
    bellPanel.replaceChildren(
      el('div', { class: 'sc-pop-head' }, [
        el('h2', { text: 'Notifications' }),
        notifications.unread ? el('button', { type: 'button', class: 'sc-text-btn', text: 'Mark all as read', onclick: async () => {
          await api('notifications_read', {}, { all: true }).catch(() => null);
          loadNotifications();
        } }) : null
      ]),
      items.length
        ? el('ul', { class: 'sc-pop-list' }, items.map((item) => el('li', {}, [
          el('a', {
            class: `sc-note${item.read ? '' : ' is-unread'}`, href: item.link,
            onclick: (event) => {
              if (item.read) return;
              event.preventDefault();
              api('notifications_read', {}, { ids: [item.id] }).catch(() => null).finally(() => { window.location.href = item.link; });
            }
          }, [
            item.actor ? avatar(item.actor, 'sm') : el('span', { class: 'sc-avatar is-sm' }),
            el('span', { class: 'sc-note-text' }, [
              el('span', { class: 'sc-note-kind', text: item.kind === 'story_feedback' ? 'Story feedback' : (item.kind === 'message' ? 'Private message' : (item.kind === 'reply' ? 'Reply to your comment' : 'Activity comment')) }),
              el('span', { text: item.text }),
              timeTag(item.at)
            ]),
            item.read ? null : el('span', { class: 'sc-dot', 'aria-label': 'Unread' })
          ])
        ])))
        : el('p', { class: 'sc-empty', text: 'No notifications yet. Classroom messages, comment replies, and story feedback show up here.' })
    );
  }

  bells.forEach((bell) => {
    bell.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!bellPanel) {
        bellPanel = el('div', { class: 'sc-pop', role: 'dialog', 'aria-label': 'Notifications', hidden: true });
        document.body.append(bellPanel);
        bellPanel.addEventListener('click', (inside) => inside.stopPropagation());
      }
      const opening = bellPanel.hidden;
      bellPanel.hidden = !opening;
      bell.setAttribute('aria-expanded', opening ? 'true' : 'false');
      if (!opening) return;
      renderBellPanel();
      // Under the bell, kept on screen.
      const rect = bell.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 24);
      bellPanel.style.width = `${width}px`;
      bellPanel.style.top = `${rect.bottom + window.scrollY + 8}px`;
      bellPanel.style.left = `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)) + window.scrollX}px`;
      loadNotifications();
    });
  });
  document.addEventListener('click', () => {
    if (bellPanel && !bellPanel.hidden) {
      bellPanel.hidden = true;
      bells.forEach((bell) => bell.setAttribute('aria-expanded', 'false'));
    }
  });

  // --- Private messages -------------------------------------------------------------------------
  // A Messenger-style conversation between a student and the teacher: their
  // messages on the left, one's own on the right, newest at the bottom. Older
  // messages load when scrolled to the top; while open, only new and changed
  // messages are fetched every few seconds. Each message has a menu - the ⋯
  // button beside it, a long press on a touch screen, or a right click - with
  // reactions, Reply, Copy, Edit (own text, within 5 minutes of sending; the
  // server keeps the time), Forward, Select (for several at once), Delete for
  // everyone (own messages) and Delete for me. Photos and videos are previewed
  // before sending and upload with a progress bar.
  const classroomId = Number(config.classroom) || 0;
  const chatButtons = Array.from(document.querySelectorAll('[data-social-chat], [data-social-inbox]'));
  // What can be sent, and how large (MB) - the server checks the same.
  const MEDIA = { 'image/jpeg': ['image', 10], 'image/png': ['image', 10], 'image/webp': ['image', 10], 'video/mp4': ['video', 40], 'video/webm': ['video', 40] };
  const POLL_MS = 5000;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let chat = null; // the open panel and, in a conversation, its messages (see openChat)
  let menu = null; // the open message menu

  const threadParams = () => (config.role === 'teacher' ? { classroom: classroomId, student: chat.studentId } : { classroom: classroomId });
  function sizeText(bytes) {
    return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  function clock(seconds) {
    return new Date(seconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  function dayLabel(seconds) {
    const date = new Date(seconds * 1000);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  }
  function snippetOf(message) {
    if (message.deleted) return 'Message deleted';
    const text = message.body.trim();
    if (text) return text.length > 90 ? `${text.slice(0, 90)}…` : text;
    return message.attachment && message.attachment.kind === 'video' ? 'Video' : 'Photo';
  }
  // Text with each match of the search wrapped in <mark>.
  function marked(text, query) {
    const parts = [];
    const lower = text.toLowerCase();
    const needle = query.toLowerCase();
    let from = 0;
    for (let at = lower.indexOf(needle); needle && at >= 0; at = lower.indexOf(needle, from)) {
      parts.push(text.slice(from, at), el('mark', { text: text.slice(at, at + needle.length) }));
      from = at + needle.length;
    }
    parts.push(text.slice(from));
    return parts;
  }

  // A short note over the bottom of the conversation ("Copied").
  function flash(text, tone = '') {
    if (!chat) return;
    chat.sheet.panel.querySelector('.sc-toast')?.remove();
    const note = el('p', { class: `sc-toast${tone ? ` is-${tone}` : ''}`, role: 'status', text });
    chat.sheet.panel.append(note);
    window.setTimeout(() => note.remove(), tone === 'error' ? 4800 : 2600);
  }

  // A question inside the panel ("Delete for everyone?"): resolves true or false.
  function ask({ title, text, confirm, danger = true }) {
    return new Promise((resolve) => {
      let entry = null;
      const done = (answer) => { resolve(answer); entry.close(); };
      const yes = el('button', { type: 'button', class: `sc-dialog-btn ${danger ? 'is-danger' : 'is-primary'}`, text: confirm, onclick: () => done(true) });
      const node = el('div', { class: 'sc-layer', onclick: (event) => { if (event.target === node) done(false); } }, [
        el('div', { class: 'sc-dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title }, [
          el('h3', { class: 'sc-dialog-title', text: title }),
          el('p', { class: 'sc-dialog-text', text }),
          el('div', { class: 'sc-dialog-actions' }, [el('button', { type: 'button', class: 'sc-dialog-btn', text: 'Cancel', onclick: () => done(false) }), yes])
        ])
      ]);
      chat.sheet.panel.append(node);
      entry = overlay([node], () => resolve(false));
      yes.focus({ preventScroll: true });
    });
  }

  // --- The message menu ----------------------------------------------------------------
  // A small menu next to what opened it, always kept inside the screen.
  function popMenu(anchor, trigger, children, alignEnd) {
    closeMenu();
    const node = el('div', { class: 'sc-menu', role: 'menu' }, children);
    const shield = el('div', { class: 'sc-menu-shield', onclick: () => closeMenu(), oncontextmenu: (event) => { event.preventDefault(); closeMenu(); } });
    document.body.append(shield, node);
    const rect = anchor.getBoundingClientRect();
    const width = window.innerWidth;
    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const box = { w: node.offsetWidth, h: node.offsetHeight };
    const left = Math.max(8, Math.min(alignEnd ? rect.right - box.w : rect.left, width - box.w - 8));
    let top = rect.bottom + 6;
    if (top + box.h > height - 8) top = rect.top - box.h - 6;
    if (top < 8) top = Math.max(8, height - box.h - 8);
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    menu = overlay([shield, node], () => {
      menu = null;
      if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
        if (trigger.isConnected) trigger.focus({ preventScroll: true });
      }
    });
    node.querySelector('button')?.focus({ preventScroll: true });
    // Arrow keys move through the menu.
    node.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const buttons = Array.from(node.querySelectorAll('button'));
      const at = buttons.indexOf(document.activeElement);
      buttons[(at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
    });
    return menu;
  }
  function closeMenu() { if (menu) menu.close(); }
  function menuItem(label, iconName, run, danger = false) {
    return el('button', { type: 'button', role: 'menuitem', class: `sc-menu-item${danger ? ' is-danger' : ''}`, onclick: () => { closeMenu(); run(); } }, [icon(ICONS[iconName]), el('span', { text: label })]);
  }

  function openMessageMenu(message, anchor, trigger) {
    if (menu && menu.messageId === message.id) return;
    const live = !message.deleted;
    const left = Math.max(0, Math.round((message.editUntil - Date.now()) / 1000));
    const canEdit = message.mine && live && Boolean(message.body.trim()) && left > 0;
    const mineReaction = (message.reactions || []).find((reaction) => reaction.mine);
    const children = [
      live ? el('div', { class: 'sc-menu-reacts', role: 'group', 'aria-label': 'React' }, chat.reactions.map((emoji) => el('button', {
        type: 'button', class: `sc-react-pick${mineReaction && mineReaction.emoji === emoji ? ' is-on' : ''}`, text: emoji,
        'aria-label': mineReaction && mineReaction.emoji === emoji ? `Remove your ${emoji} reaction` : `React with ${emoji}`,
        onclick: () => { closeMenu(); react(message, emoji); }
      }))) : null,
      live ? menuItem('Reply', 'reply', () => startReply(message)) : null,
      live && message.body.trim() ? menuItem('Copy text', 'copy', () => copyText(message.body)) : null,
      canEdit ? menuItem('Edit', 'edit', () => startEdit(message)) : null,
      live ? menuItem('Forward', 'forward', () => openForward(message)) : null,
      menuItem('Select', 'select', () => startSelect(message)),
      message.mine && live ? menuItem('Delete for everyone', 'trash', () => deleteForEveryone([message.id]), true) : null,
      menuItem('Delete for me', 'hide', () => deleteForMe([message.id]), true),
      canEdit ? el('p', { class: 'sc-menu-note', text: `You can edit this for ${left >= 60 ? `${Math.ceil(left / 60)} more min` : `${left} more s`}.` }) : null
    ];
    const opened = popMenu(anchor, trigger, children, message.mine);
    opened.messageId = message.id;
    opened.node = anchor;
    anchor.classList.add('is-pressed');
    const previous = opened.onClose;
    opened.onClose = () => { anchor.classList.remove('is-pressed'); previous(); };
  }

  // Touch screens: a long press (about half a second) opens the menu. The
  // browser's own long-press menu is turned off on messages.
  function bindPress(target, message) {
    let timer = 0;
    let fired = false;
    let start = null;
    const cancel = () => { window.clearTimeout(timer); timer = 0; };
    target.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' || (chat && chat.selected)) return;
      fired = false;
      start = [event.clientX, event.clientY];
      cancel();
      timer = window.setTimeout(() => {
        fired = true;
        if (navigator.vibrate) navigator.vibrate(12);
        openMessageMenu(message, target, null);
      }, 500);
    });
    target.addEventListener('pointermove', (event) => {
      if (timer && start && Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 10) cancel();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => target.addEventListener(type, cancel));
    target.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      if (chat && chat.selected) return;
      cancel();
      openMessageMenu(message, target, null);
    });
    // The tap that ends a long press does not also open a photo.
    target.addEventListener('click', (event) => {
      if (!fired) return;
      fired = false;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  // --- Drawing the conversation ------------------------------------------------------
  // Full screen where the browser allows it (on iPhones only videos, through
  // their own player). Resolves whether it worked - false too when the
  // browser has not answered within a moment (some in-app browsers never do).
  function enterFullscreen(node) {
    const request = node.requestFullscreen || node.webkitRequestFullscreen;
    if (request) {
      try {
        const asked = Promise.resolve(request.call(node)).then(() => true, () => false);
        const late = new Promise((resolve) => window.setTimeout(() => resolve(fullscreenNode() === node), 1200));
        return Promise.race([asked, late]);
      } catch (problem) {
        return Promise.resolve(false);
      }
    }
    if (node.webkitEnterFullscreen) {
      node.webkitEnterFullscreen();
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }
  const fullscreenNode = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  function leaveFullscreen() {
    if (!fullscreenNode()) return;
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }

  // A photo (opens large when tapped) or a video (plays in place), each with a
  // full-screen button in its corner.
  function mediaNode(message) {
    const file = message.attachment;
    const fullButton = (label, run) => el('button', {
      type: 'button', class: 'sc-media-full', 'aria-label': label, title: 'Full screen',
      onclick: (event) => { event.stopPropagation(); run(); }
    }, [icon(ICONS.fullscreen)]);
    if (file.kind === 'video') {
      // The first frame shows as its picture until it plays.
      const video = el('video', { class: 'sc-video', controls: true, preload: 'metadata', playsinline: true, src: message.local ? file.url : `${file.url}#t=0.1`, 'aria-label': file.name || 'Video' });
      video.addEventListener('loadedmetadata', settle);
      return el('div', { class: 'sc-media is-video' }, [video, fullButton('Play video full screen', () => {
        enterFullscreen(video).then((ok) => {
          if (ok) {
            if (video.paused) video.play().catch(() => null);
            return;
          }
          // Full screen refused: the viewer, filling the window, instead.
          video.pause();
          if (!message.local) openViewer(message, false, video.currentTime);
        });
      })]);
    }
    const image = el('img', { src: file.url, alt: file.name || 'Photo', loading: 'lazy', decoding: 'async' });
    const holder = el('div', { class: 'sc-media is-image' }, [
      el('button', {
        type: 'button', class: 'sc-media-open', 'aria-label': `Open photo${file.name ? ` ${file.name}` : ''}`,
        onclick: () => { if (!message.local) openViewer(message); }
      }, [image]),
      message.local ? null : fullButton('Show photo full screen', () => openViewer(message, true))
    ]);
    image.addEventListener('load', settle);
    image.addEventListener('error', () => holder.classList.add('is-broken'));
    return holder;
  }
  // A photo or video that finished loading keeps the newest message in view.
  function settle() { if (chat && chat.stick) scrollToBottom(); }

  function messageNode(message, info) {
    const live = !message.deleted;
    const parts = [];
    if (!live) {
      parts.push(el('p', { class: 'sc-msg-text', text: message.mine ? 'You deleted this message' : 'This message was deleted' }));
    } else {
      if (message.attachment) parts.push(mediaNode(message));
      if (message.body) parts.push(el('p', { class: 'sc-msg-text', text: message.body }));
    }
    if (message.local && message.file && message.status === 'sending') {
      // The upload's progress, over the photo or video.
      message.bar = el('span', { class: 'sc-upload-fill' });
      message.bar.style.transform = `scaleX(${message.progress || 0})`;
      parts.push(el('div', { class: 'sc-upload', 'aria-hidden': 'true' }, [message.bar]));
    }
    const date = new Date(message.at * 1000);
    const bubble = el('div', {
      class: `sc-bubble${live ? '' : ' is-deleted'}${live && message.attachment && !message.body ? ' is-media' : ''}`,
      title: date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    }, parts);
    const row = el('div', { class: 'sc-msg-row' }, [bubble]);
    if (!message.local) {
      const more = el('button', {
        type: 'button', class: 'sc-more-btn', 'aria-label': 'Message options', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
        onclick: (event) => { event.stopPropagation(); openMessageMenu(message, bubble, more); }
      }, [icon(ICONS.more)]);
      row.append(more);
      bindPress(bubble, message);
    }

    let quote = null;
    if (live && message.reply) {
      const reply = message.reply;
      let label = 'Reply';
      if (reply.name) {
        if (message.mine) label = reply.name === 'You' ? 'You replied to yourself' : `You replied to ${reply.name}`;
        else label = reply.name === 'You' ? 'Replied to you' : `Replied to ${reply.name}`;
      }
      quote = el('button', {
        type: 'button', class: 'sc-quote', 'aria-label': `${label}: ${reply.text}. Show that message`,
        onclick: () => { if (reply.id && !message.local) jumpTo(reply.id); }
      }, [el('span', { class: 'sc-quote-name' }, [icon(ICONS.reply), el('span', { text: label })]), el('span', { class: 'sc-quote-text', text: reply.text })]);
    }

    const reactions = live && message.reactions && message.reactions.length
      ? el('div', { class: 'sc-reactions' }, message.reactions.map((reaction) => el('button', {
        type: 'button', class: `sc-reaction${reaction.mine ? ' is-mine' : ''}`, 'aria-pressed': reaction.mine ? 'true' : 'false',
        'aria-label': `${reaction.emoji} ${reaction.count}${reaction.mine ? ', yours. Remove it' : `. React with ${reaction.emoji}`}`,
        onclick: () => react(message, reaction.emoji)
      }, [el('span', { text: reaction.emoji }), reaction.count > 1 ? el('span', { class: 'sc-reaction-count', text: String(reaction.count) }) : null])))
      : null;

    // Under the message: its time (at the end of a group), Edited, and how far it got.
    const foot = [];
    if (info.last || message.local) foot.push(el('time', { datetime: date.toISOString(), text: clock(message.at) }));
    if (live && message.edited) foot.push(el('span', { text: 'Edited' }));
    if (info.status === 'seen') foot.push(el('span', { class: 'sc-status is-seen' }, [icon(ICONS.check), el('span', { text: 'Seen' })]));
    if (info.status === 'sent') foot.push(el('span', { class: 'sc-status' }, [el('span', { text: 'Sent' })]));
    if (info.status === 'sending') {
      foot.push(el('span', { class: 'sc-status is-sending', text: message.file ? `Uploading ${Math.round((message.progress || 0) * 100)}%` : 'Sending…' }));
      if (message.file) foot.push(el('button', { type: 'button', class: 'sc-foot-btn', text: 'Cancel', onclick: () => message.xhr && message.xhr.abort() }));
      message.label = foot[foot.length - (message.file ? 2 : 1)];
    }
    if (info.status === 'failed') {
      foot.push(el('span', { class: 'sc-status is-failed', role: 'alert', text: message.error || 'Not sent.' }));
      foot.push(el('button', { type: 'button', class: 'sc-foot-btn', onclick: () => deliver(message) }, [icon(ICONS.retry), el('span', { text: 'Retry' })]));
      foot.push(el('button', { type: 'button', class: 'sc-foot-btn', text: 'Remove', onclick: () => dropPending(message) }));
    }

    const selected = chat.selected && !message.local ? chat.selected.has(message.id) : false;
    const node = el('li', {
      class: `sc-msg${message.mine ? ' is-mine' : ''}${info.first ? ' is-first' : ''}${info.last ? ' is-last' : ''}${message.local ? ` is-${message.status}` : ''}${selected ? ' is-selected' : ''}`,
      'data-id': message.local ? message.localId : String(message.id)
    }, [
      chat.selected && !message.local ? el('span', { class: 'sc-check', 'aria-hidden': 'true' }, [icon(ICONS.check)]) : null,
      message.mine ? null : (info.last ? avatar(message.sender, 'sm') : el('span', { class: 'sc-avatar-space' })),
      el('div', { class: 'sc-msg-main' }, [
        live && message.forwarded ? el('span', { class: 'sc-forwarded' }, [icon(ICONS.forward), el('span', { text: 'Forwarded' })]) : null,
        quote, row, reactions,
        foot.length ? el('div', { class: 'sc-msg-foot' }, foot) : null
      ])
    ]);
    if (chat.selected && !message.local) {
      node.setAttribute('aria-selected', selected ? 'true' : 'false');
      // While selecting, a tap anywhere on a message picks it.
      node.addEventListener('click', (event) => {
        if (!chat || !chat.selected) return;
        event.preventDefault();
        event.stopPropagation();
        toggleSelect(message.id);
      }, true);
    }
    if (chat.editing && chat.editing.id === message.id) node.classList.add('is-editing');
    return node;
  }

  // Puts the given nodes in the list in order, moving only what has to move
  // (a playing video keeps playing while new messages arrive).
  function reconcile(parent, nodes) {
    nodes.forEach((node, index) => {
      const there = parent.children[index];
      if (there !== node) parent.insertBefore(node, there || null);
    });
    while (parent.children.length > nodes.length) parent.lastElementChild.remove();
  }

  function renderList() {
    if (!chat || !chat.listNode) return;
    const view = chat.sheet;
    const items = chat.order.map((id) => chat.messages.get(id)).concat(chat.pending);
    if (!items.length) {
      view.body.replaceChildren(el('div', { class: 'sc-empty sc-chat-empty' }, [
        icon(ICONS.lock),
        el('p', { text: config.role === 'teacher'
          ? 'No messages yet. Write to this student privately; only the two of you can see this conversation.'
          : 'No messages yet. Ask your teacher a question here; only you and your teacher can see it.' })
      ]));
      return;
    }
    if (chat.listNode.parentNode !== view.body) view.body.replaceChildren(chat.listNode);
    let lastSeen = 0;
    let lastMine = 0;
    chat.order.forEach((id) => {
      const message = chat.messages.get(id);
      if (!message.mine || message.deleted) return;
      lastMine = id;
      if (message.read) lastSeen = id;
    });
    const together = (a, b) => a && b && a.mine === b.mine && Math.abs(b.at - a.at) < 300 && dayLabel(a.at) === dayLabel(b.at) && !b.reply && !b.forwarded;
    const nodes = [];
    const used = new Set();
    if (chat.hasMore) {
      if (!chat.olderNode) {
        chat.olderNode = el('li', { class: 'sc-older' }, [el('button', { type: 'button', class: 'sc-text-btn', text: 'Show earlier messages', onclick: () => loadOlder() })]);
      }
      nodes.push(chat.olderNode);
    }
    let day = '';
    items.forEach((message, index) => {
      const label = dayLabel(message.at);
      if (label !== day) {
        day = label;
        if (!chat.days.has(label)) chat.days.set(label, el('li', { class: 'sc-day' }, [el('span', { text: label })]));
        nodes.push(chat.days.get(label));
      }
      const info = { first: !together(items[index - 1], message), last: !together(message, items[index + 1]), status: '' };
      if (message.local) info.status = message.status;
      else if (message.id === lastSeen) info.status = 'seen';
      else if (message.id === lastMine && !message.read) info.status = 'sent';
      const key = message.local ? message.localId : message.id;
      const signature = JSON.stringify([
        message.changed, message.read, message.edited, message.deleted, message.body, message.reactions, info,
        message.error || '', chat.selected ? chat.selected.has(message.id) : null, chat.editing ? chat.editing.id === message.id : false
      ]);
      let cached = chat.nodes.get(key);
      if (!cached || cached.signature !== signature) {
        cached = { node: messageNode(message, info), signature };
        chat.nodes.set(key, cached);
      }
      used.add(key);
      nodes.push(cached.node);
    });
    chat.nodes.forEach((value, key) => { if (!used.has(key)) chat.nodes.delete(key); });
    reconcile(chat.listNode, nodes);
  }

  const nearBottom = () => {
    const body = chat.sheet.body;
    return body.scrollHeight - body.scrollTop - body.clientHeight < 80;
  };
  function scrollToBottom(smooth = false) {
    if (!chat) return;
    const body = chat.sheet.body;
    body.scrollTo({ top: body.scrollHeight, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
    chat.stick = true;
    if (chat.pill) chat.pill.hidden = true;
  }

  // --- Loading -------------------------------------------------------------------------
  function upsert(message) {
    message.editUntil = message.canEdit ? Date.now() + message.editSecondsLeft * 1000 : 0;
    const known = chat.messages.has(message.id);
    chat.messages.set(message.id, message);
    if (!known) {
      chat.order.push(message.id);
      chat.order.sort((a, b) => a - b);
    }
    chat.lastId = Math.max(chat.lastId, message.id);
    chat.firstId = chat.firstId ? Math.min(chat.firstId, message.id) : message.id;
    return !known;
  }

  // New messages and changes (read, edited, deleted, reactions) since the last look.
  async function poll() {
    if (!chat || !chat.inThread || chat.polling || !chat.listNode) return;
    const generation = chat.generation;
    chat.polling = true;
    let data;
    try {
      data = await api('thread', chat.lastId ? { ...threadParams(), since: chat.lastId, changed: chat.serverTime } : threadParams());
    } catch (problem) {
      data = null;
    }
    if (!chat || chat.generation !== generation) return;
    chat.polling = false;
    if (!data) return;
    const atBottom = nearBottom();
    let fresh = 0;
    let changed = data.messages.length;
    data.messages.forEach((message) => { if (upsert(message) && !message.mine) fresh++; });
    // The server sends recent changes again for a moment (clocks can differ):
    // only a real change redraws.
    data.changedMessages.forEach((message) => {
      const known = chat.messages.get(message.id);
      const state = (item) => JSON.stringify([item.changed, item.read, item.deleted, item.edited, item.body, item.reactions]);
      if (!known || state(known) === state(message)) return;
      upsert(message);
      changed++;
    });
    chat.serverTime = data.serverTime;
    if (!changed) return;
    renderList();
    if (atBottom) scrollToBottom();
    else if (fresh) chat.pill.hidden = false;
    if (fresh) { loadSummary(); loadNotifications(); }
  }

  // The page of messages before the first one shown, keeping the view where it was.
  function loadOlder() {
    if (!chat || !chat.hasMore) return Promise.resolve(false);
    if (chat.older) return chat.older;
    const generation = chat.generation;
    const button = chat.olderNode && chat.olderNode.firstChild;
    if (button) { button.textContent = 'Loading earlier messages…'; button.disabled = true; }
    chat.older = api('thread', { ...threadParams(), before: chat.firstId }).then((data) => {
      if (!chat || chat.generation !== generation) return false;
      const body = chat.sheet.body;
      const fromBottom = body.scrollHeight - body.scrollTop;
      data.messages.forEach(upsert);
      chat.hasMore = data.hasMore;
      renderList();
      body.scrollTop = body.scrollHeight - fromBottom;
      return true;
    }).catch((problem) => {
      flash(problem.message, 'error');
      return false;
    }).finally(() => {
      if (!chat || chat.generation !== generation) return;
      chat.older = null;
      if (button) { button.textContent = 'Show earlier messages'; button.disabled = false; }
    });
    return chat.older;
  }

  // Shows a message (loading older pages until it is there) and marks it for a moment.
  async function jumpTo(id) {
    for (let pages = 0; chat && !chat.messages.has(id) && chat.hasMore && pages < 50; pages++) {
      if (!(await loadOlder())) break;
    }
    const node = chat && chat.nodes.get(id) && chat.nodes.get(id).node;
    if (!node || !node.isConnected) { flash('That message is no longer in this conversation.', 'error'); return; }
    const body = chat.sheet.body;
    const place = node.getBoundingClientRect();
    const frame = body.getBoundingClientRect();
    chat.stick = false;
    body.scrollTo({ top: body.scrollTop + place.top - frame.top - (frame.height - place.height) / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
    node.classList.remove('is-found');
    void node.offsetWidth;
    node.classList.add('is-found');
    window.setTimeout(() => node.classList.remove('is-found'), 2200);
  }

  // --- Sending -------------------------------------------------------------------------
  function pendingMessage(body) {
    const reply = chat.reply;
    return {
      local: true, localId: `local-${token()}`, token: token(), mine: true, sender: {}, body, at: Date.now() / 1000, status: 'sending',
      replyId: reply ? reply.id : 0,
      reply: reply ? { id: reply.id, name: reply.mine ? 'You' : reply.sender.name, text: snippetOf(reply) } : null,
      reactions: [], read: false, edited: false, deleted: false, changed: 0
    };
  }

  function upload(item) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('action', 'send');
      Object.entries(threadParams()).forEach(([key, value]) => form.append(key, String(value)));
      form.append('body', item.body);
      form.append('token', item.token);
      if (item.replyId) form.append('reply', String(item.replyId));
      form.append('file', item.file, item.file.name || 'file');
      const xhr = new XMLHttpRequest();
      item.xhr = xhr;
      xhr.open('POST', ENDPOINT);
      xhr.setRequestHeader('X-Koobd-Request', 'upload');
      xhr.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) return;
        item.progress = Math.min(1, event.loaded / event.total);
        if (item.bar) item.bar.style.transform = `scaleX(${item.progress})`;
        if (item.label) item.label.textContent = `Uploading ${Math.round(item.progress * 100)}%`;
      });
      xhr.addEventListener('load', () => {
        let result = null;
        try { result = JSON.parse(xhr.responseText); } catch (problem) { result = null; }
        if (result && result.success) resolve(result.message);
        else reject(new Error((result && result.message) || (xhr.status === 413 ? 'That file is too large.' : 'The upload did not finish. Please try again.')));
      });
      xhr.addEventListener('error', () => reject(new Error('The upload did not finish. Check your connection and try again.')));
      xhr.addEventListener('abort', () => { const stop = new Error('Cancelled'); stop.name = 'AbortError'; reject(stop); });
      xhr.send(form);
    });
  }

  // Sends a waiting message (again, after a failure: the same token means it is
  // never saved twice).
  async function deliver(item) {
    if (!chat) return;
    const generation = chat.generation;
    item.status = 'sending';
    item.error = '';
    item.progress = 0;
    renderList();
    try {
      const message = item.file
        ? await upload(item)
        : (await api('send', {}, { ...threadParams(), body: item.body, token: item.token, reply: item.replyId || undefined })).message;
      if (!chat || chat.generation !== generation) return;
      chat.pending = chat.pending.filter((other) => other !== item);
      upsert(message);
      renderList();
      scrollToBottom();
      if (item.preview) window.setTimeout(() => URL.revokeObjectURL(item.preview), 4000);
    } catch (problem) {
      if (!chat || chat.generation !== generation) return;
      if (problem.name === 'AbortError') { dropPending(item); return; }
      item.status = 'failed';
      item.error = problem.message;
      renderList();
    } finally {
      item.xhr = null;
    }
  }
  function dropPending(item) {
    chat.pending = chat.pending.filter((other) => other !== item);
    if (item.preview) URL.revokeObjectURL(item.preview);
    renderList();
  }

  // --- Message actions ----------------------------------------------------------------
  async function react(message, emoji) {
    try {
      const result = await api('message_react', {}, { id: message.id, emoji });
      if (!chat) return;
      upsert(result.message);
      renderList();
    } catch (problem) {
      flash(problem.message, 'error');
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (problem) {
      const area = el('textarea', { value: text, 'aria-hidden': 'true' });
      area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    flash('Copied.');
  }

  function startReply(message) {
    stopEdit();
    chat.reply = message;
    renderContext();
    chat.ui.input.focus({ preventScroll: true });
    keepInView(chat.ui.form);
  }
  function clearReply() {
    if (!chat || !chat.reply) return;
    chat.reply = null;
    renderContext();
  }

  // Editing happens in the message bar: the text goes into it, Send becomes Save.
  function startEdit(message) {
    stopSelect();
    clearReply();
    clearFile();
    chat.editing = message;
    chat.ui.input.value = message.body;
    grow(chat.ui.input);
    renderContext();
    refreshSend();
    renderList();
    chat.ui.input.focus({ preventScroll: true });
    chat.ui.input.setSelectionRange(chat.ui.input.value.length, chat.ui.input.value.length);
  }
  function stopEdit() {
    if (!chat || !chat.editing) return;
    chat.editing = null;
    window.clearInterval(chat.editTimer);
    chat.ui.input.value = '';
    grow(chat.ui.input);
    chat.ui.error.hidden = true;
    renderContext();
    refreshSend();
    renderList();
  }
  async function saveEdit(text) {
    const message = chat.editing;
    if (!text) { showError('A message cannot be empty. To remove it, use Delete in its menu.'); return; }
    if (text === message.body.trim()) { stopEdit(); return; }
    chat.ui.send.disabled = true;
    try {
      const result = await api('message_edit', {}, { id: message.id, body: text });
      if (!chat) return;
      upsert(result.message);
      stopEdit();
      flash('Message edited.');
    } catch (problem) {
      if (!chat) return;
      showError(problem.message);
      // Past the 5 minutes: editing is over for this message.
      if (/no longer be edited/.test(problem.message)) {
        message.editUntil = 0;
        window.setTimeout(() => { if (chat && chat.editing === message) stopEdit(); }, 2800);
      }
    } finally {
      if (chat) refreshSend();
    }
  }

  function startSelect(message) {
    stopEdit();
    clearReply();
    chat.selected = new Set([message.id]);
    chat.sheet.panel.classList.add('is-selecting');
    renderSelectBar();
    renderList();
  }
  function stopSelect() {
    if (!chat || !chat.selected) return;
    chat.selected = null;
    chat.sheet.panel.classList.remove('is-selecting');
    renderSelectBar();
    renderList();
  }
  function toggleSelect(id) {
    if (chat.selected.has(id)) chat.selected.delete(id);
    else chat.selected.add(id);
    renderSelectBar();
    renderList();
  }
  function renderSelectBar() {
    const ui = chat.ui;
    const ids = chat.selected ? chat.order.filter((id) => chat.selected.has(id)) : [];
    ui.form.hidden = Boolean(chat.selected);
    ui.selectBar.hidden = !chat.selected;
    if (!chat.selected) { ui.selectBar.replaceChildren(); return; }
    const chosen = ids.map((id) => chat.messages.get(id));
    const texts = chosen.filter((message) => !message.deleted && message.body.trim()).map((message) => message.body);
    const allMine = chosen.length > 0 && chosen.every((message) => message.mine && !message.deleted);
    ui.selectBar.replaceChildren(
      el('div', { class: 'sc-select-top' }, [
        el('strong', { class: 'sc-select-count', text: ids.length ? `${ids.length} selected` : 'Tap messages to select them' }),
        el('button', { type: 'button', class: 'sc-text-btn', text: 'Cancel', onclick: () => stopSelect() })
      ]),
      el('div', { class: 'sc-select-actions' }, [
        el('button', { type: 'button', class: 'sc-select-btn', disabled: !texts.length, onclick: () => { copyText(texts.join('\n\n')); stopSelect(); } }, [icon(ICONS.copy), el('span', { text: 'Copy' })]),
        el('button', { type: 'button', class: 'sc-select-btn is-danger', disabled: !ids.length, onclick: () => deleteForMe(ids) }, [icon(ICONS.hide), el('span', { text: 'Delete for me' })]),
        allMine ? el('button', { type: 'button', class: 'sc-select-btn is-danger', onclick: () => deleteForEveryone(ids) }, [icon(ICONS.trash), el('span', { text: 'Delete for everyone' })]) : null
      ])
    );
  }

  async function deleteForEveryone(ids) {
    const many = ids.length > 1;
    const sure = await ask({
      title: many ? `Delete ${ids.length} messages for everyone?` : 'Delete for everyone?',
      text: `${many ? 'They' : 'It'} will be removed for you and the other person. This cannot be undone.`,
      confirm: 'Delete for everyone'
    });
    if (!sure || !chat) return;
    try {
      await api('message_delete', {}, { ids });
      if (!chat) return;
      ids.forEach((id) => {
        const message = chat.messages.get(id);
        if (message) upsert({ ...message, deleted: true, body: '', attachment: null, reply: null, reactions: [], edited: false, forwarded: false, canEdit: false, editSecondsLeft: 0, changed: message.changed + 1 });
        if (chat.editing && chat.editing.id === id) stopEdit();
        if (chat.reply && chat.reply.id === id) clearReply();
      });
      stopSelect();
      renderList();
      flash(many ? 'Messages deleted.' : 'Message deleted.');
    } catch (problem) {
      flash(problem.message, 'error');
    }
  }

  async function deleteForMe(ids) {
    const many = ids.length > 1;
    const other = config.role === 'teacher' ? 'Your student' : 'Your teacher';
    const sure = await ask({
      title: many ? `Delete ${ids.length} messages for you?` : 'Delete for you?',
      text: `${many ? 'They' : 'It'} will be removed from your view only. ${other} will still see ${many ? 'them' : 'it'}.`,
      confirm: 'Delete for me'
    });
    if (!sure || !chat) return;
    try {
      await api('message_hide', {}, { ids });
      if (!chat) return;
      ids.forEach((id) => {
        chat.messages.delete(id);
        if (chat.editing && chat.editing.id === id) stopEdit();
        if (chat.reply && chat.reply.id === id) clearReply();
      });
      chat.order = chat.order.filter((id) => chat.messages.has(id));
      stopSelect();
      renderList();
      flash(many ? 'Messages deleted for you.' : 'Message deleted for you.');
    } catch (problem) {
      flash(problem.message, 'error');
    }
  }

  async function clearConversation() {
    const sure = await ask({
      title: 'Clear this conversation?',
      text: `All messages so far will be removed from your view. ${config.role === 'teacher' ? 'Your student' : 'Your teacher'} keeps their copy.`,
      confirm: 'Clear conversation'
    });
    if (!sure || !chat) return;
    try {
      await api('conversation_clear', {}, threadParams());
      if (!chat) return;
      chat.messages.clear();
      chat.order = [];
      chat.hasMore = false;
      stopEdit();
      clearReply();
      stopSelect();
      renderList();
      flash('Conversation cleared.');
    } catch (problem) {
      flash(problem.message, 'error');
    }
  }

  // Forwarding goes only to this person's other private conversations.
  async function openForward(message) {
    const chosen = new Set();
    const list = el('ul', { class: 'sc-pick-list' }, [el('li', { class: 'sc-loading', text: 'Loading…' })]);
    const error = el('p', { class: 'sc-error', role: 'alert', hidden: true });
    const send = el('button', { type: 'button', class: 'sc-dialog-btn is-primary', text: 'Forward', disabled: true });
    let entry = null;
    const node = el('div', { class: 'sc-layer', onclick: (event) => { if (event.target === node) entry.close(); } }, [
      el('div', { class: 'sc-dialog sc-forward', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Forward message' }, [
        el('h3', { class: 'sc-dialog-title', text: 'Forward to' }),
        el('p', { class: 'sc-dialog-text', text: config.role === 'teacher'
          ? 'Your students. Each gets it in their private conversation with you.'
          : 'Your teachers in your other classrooms.' }),
        el('div', { class: 'sc-forward-preview' }, [message.attachment ? icon(ICONS.attach) : null, el('span', { text: snippetOf(message) })]),
        list, error,
        el('div', { class: 'sc-dialog-actions' }, [el('button', { type: 'button', class: 'sc-dialog-btn', text: 'Cancel', onclick: () => entry.close() }), send])
      ])
    ]);
    chat.sheet.panel.append(node);
    entry = overlay([node]);
    let targets = [];
    try {
      targets = (await api('forward_targets', threadParams())).targets;
    } catch (problem) {
      list.replaceChildren(el('li', { class: 'sc-error', text: problem.message }));
      return;
    }
    if (!targets.length) {
      list.replaceChildren(el('li', { class: 'sc-empty', text: 'There is no one else to forward this to.' }));
      return;
    }
    list.replaceChildren(...targets.map((target, index) => {
      const box = el('input', { type: 'checkbox', class: 'sc-pick-box' });
      box.addEventListener('change', () => {
        if (box.checked) chosen.add(index); else chosen.delete(index);
        send.disabled = !chosen.size;
        send.textContent = chosen.size > 1 ? `Forward to ${chosen.size}` : 'Forward';
      });
      return el('li', {}, [el('label', { class: 'sc-pick' }, [
        box, avatar(target.person, 'sm'),
        el('span', { class: 'sc-pick-text' }, [el('strong', { translate: 'no', text: target.name }), el('span', { text: target.detail })])
      ])]);
    }));
    list.querySelector('input')?.focus({ preventScroll: true });
    send.addEventListener('click', async () => {
      send.disabled = true;
      error.hidden = true;
      try {
        const result = await api('message_forward', {}, { id: message.id, targets: [...chosen].map((index) => ({ classroom: targets[index].classroom, student: targets[index].student })) });
        entry.close();
        flash(`Forwarded to ${result.sent} ${result.sent === 1 ? 'conversation' : 'conversations'}.`);
      } catch (problem) {
        error.hidden = false;
        error.textContent = problem.message;
        send.disabled = false;
      }
    });
  }

  // A photo (or a video, playing) at full size, over everything; a tap
  // outside it closes it. Its full-screen button also hides the browser's
  // bars (fullscreen = true opens it that way). startAt: where a video
  // continues from.
  function openViewer(message, fullscreen = false, startAt = 0) {
    let entry = null;
    const video = message.attachment.kind === 'video';
    const what = video ? 'video' : 'photo';
    const media = video
      ? el('video', { src: message.attachment.url, controls: true, autoplay: true, playsinline: true, 'aria-label': message.attachment.name || 'Video' })
      : el('img', { src: message.attachment.url, alt: message.attachment.name || 'Photo' });
    if (video && startAt) media.addEventListener('loadedmetadata', () => { media.currentTime = startAt; }, { once: true });
    const close = el('button', { type: 'button', class: 'sc-icon-btn sc-viewer-close', 'aria-label': `Close ${what}`, onclick: () => entry.close() }, [icon(ICONS.close)]);
    const toggle = el('button', { type: 'button', class: 'sc-icon-btn', 'aria-label': 'Full screen', title: 'Full screen' }, [icon(ICONS.fullscreen)]);
    const stage = el('div', { class: 'sc-viewer-stage' }, [media]);
    const node = el('div', { class: 'sc-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': video ? 'Video' : 'Photo' }, [
      el('div', { class: 'sc-viewer-bar' }, [
        el('span', { class: 'sc-viewer-name', text: `${message.mine ? 'You' : message.sender.name} · ${dayLabel(message.at)}, ${clock(message.at)}` }),
        el('div', { class: 'sc-viewer-tools' }, [toggle, close])
      ]),
      stage
    ]);
    const sync = () => {
      const on = fullscreenNode() === node;
      toggle.replaceChildren(icon(on ? ICONS.exitFullscreen : ICONS.fullscreen));
      toggle.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
      toggle.title = on ? 'Exit full screen' : 'Full screen';
    };
    toggle.addEventListener('click', () => { if (fullscreenNode() === node) leaveFullscreen(); else enterFullscreen(node).then(sync); });
    // Where pages cannot go full screen (iPhones), the viewer already fills the window.
    toggle.hidden = !(node.requestFullscreen || node.webkitRequestFullscreen);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    node.addEventListener('click', (event) => { if (event.target === stage || event.target === node) entry.close(); });
    document.body.append(node);
    entry = overlay([node], () => {
      if (video) media.pause();
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
      if (fullscreenNode() === node) leaveFullscreen();
    });
    if (fullscreen && !toggle.hidden) enterFullscreen(node).then(sync);
    close.focus({ preventScroll: true });
  }

  // Search: matching messages; picking one scrolls to it.
  function openSearch() {
    if (chat.search) { chat.search.input.focus(); return; }
    const input = el('input', { type: 'search', class: 'sc-search-input', placeholder: 'Search this conversation', 'aria-label': 'Search messages', enterkeyhint: 'search', autocomplete: 'off' });
    const results = el('ul', { class: 'sc-search-results', hidden: true });
    const bar = el('div', { class: 'sc-search', role: 'search' }, [
      el('div', { class: 'sc-search-row' }, [icon(ICONS.search), input, el('button', { type: 'button', class: 'sc-icon-btn is-sm', 'aria-label': 'Close search', onclick: () => closeSearch() }, [icon(ICONS.close)])]),
      results
    ]);
    let timer = 0;
    let asked = 0;
    async function run() {
      const query = input.value.trim();
      const mine = ++asked;
      if (query.length < 2) { results.hidden = true; return; }
      let data;
      try {
        data = await api('message_search', { ...threadParams(), q: query });
      } catch (problem) {
        data = { results: [], error: problem.message };
      }
      if (!chat || !chat.search || mine !== asked) return;
      results.hidden = false;
      results.replaceChildren(...(data.results.length ? data.results.map((hit) => el('li', {}, [el('button', {
        type: 'button', class: 'sc-search-hit',
        onclick: () => { results.hidden = true; jumpTo(hit.id); }
      }, [
        el('span', { class: 'sc-search-top' }, [el('strong', { translate: 'no', text: hit.name }), el('span', { text: `${dayLabel(hit.at)}, ${clock(hit.at)}` })]),
        el('span', { class: 'sc-search-text' }, marked(hit.text, query))
      ])])) : [el('li', { class: 'sc-empty', text: data.error || 'No messages found.' })]));
    }
    input.addEventListener('input', () => { window.clearTimeout(timer); timer = window.setTimeout(run, 280); });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); window.clearTimeout(timer); run(); }
    });
    input.addEventListener('focus', () => { if (input.value.trim().length >= 2) results.hidden = false; });
    chat.sheet.body.before(bar);
    chat.search = { bar, input };
    input.focus({ preventScroll: true });
  }
  function closeSearch() {
    if (!chat || !chat.search) return;
    chat.search.bar.remove();
    chat.search = null;
  }

  // --- The message bar ----------------------------------------------------------------
  function placeholder() {
    if (chat.file) return 'Add a caption (optional)';
    return config.role === 'teacher' ? 'Write a private message' : 'Message your teacher';
  }
  function showError(text) {
    chat.ui.error.hidden = false;
    chat.ui.error.textContent = text;
  }
  function refreshSend() {
    const ui = chat.ui;
    const editing = Boolean(chat.editing);
    ui.send.disabled = !(ui.input.value.trim() || (!editing && chat.file));
    ui.send.classList.toggle('is-save', editing);
    ui.send.setAttribute('aria-label', editing ? 'Save changes' : 'Send message');
    ui.send.replaceChildren(...[icon(editing ? ICONS.check : ICONS.send), editing ? el('span', { text: 'Save' }) : null].filter(Boolean));
    ui.attach.disabled = editing;
    ui.input.placeholder = editing ? 'Edit your message' : placeholder();
  }

  // Above the text box: what is being replied to, or the edit in progress.
  function renderContext() {
    const ui = chat.ui;
    const editing = chat.editing;
    const message = editing || chat.reply;
    window.clearInterval(chat.editTimer);
    ui.context.hidden = !message;
    ui.form.classList.toggle('is-editing', Boolean(editing));
    if (!message) { ui.context.replaceChildren(); return; }
    const note = el('span', { class: 'sc-context-text', text: editing ? '' : snippetOf(message) });
    ui.context.replaceChildren(
      el('span', { class: 'sc-context-icon' }, [icon(editing ? ICONS.edit : ICONS.reply)]),
      el('div', { class: 'sc-context-main' }, [
        el('strong', { text: editing ? 'Editing message' : `Replying to ${message.mine ? 'yourself' : message.sender.name}` }),
        note
      ]),
      editing
        ? el('button', { type: 'button', class: 'sc-text-btn', text: 'Cancel', 'aria-label': 'Cancel editing', onclick: () => stopEdit() })
        : el('button', { type: 'button', class: 'sc-icon-btn is-sm', 'aria-label': 'Cancel reply', onclick: () => clearReply() }, [icon(ICONS.close)])
    );
    if (editing) {
      const tick = () => {
        const left = Math.max(0, Math.round((editing.editUntil - Date.now()) / 1000));
        note.textContent = left
          ? `You can edit for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} more.`
          : 'The 5 minutes to edit this message are up.';
        if (!left) window.clearInterval(chat.editTimer);
      };
      tick();
      chat.editTimer = window.setInterval(tick, 1000);
    }
  }

  // The chosen photo or video, before it is sent.
  function renderTray() {
    const ui = chat.ui;
    const chosen = chat.file;
    ui.tray.hidden = !chosen;
    if (!chosen) { ui.tray.replaceChildren(); refreshSend(); return; }
    const kind = chosen.kind === 'video' ? 'Video' : 'Photo';
    ui.tray.replaceChildren(
      el('div', { class: 'sc-tray-thumb' }, [
        chosen.kind === 'video'
          ? el('video', { src: chosen.url, muted: true, preload: 'metadata', playsinline: true, 'aria-hidden': 'true' })
          : el('img', { src: chosen.url, alt: '' }),
        chosen.kind === 'video' ? el('span', { class: 'sc-tray-kind', text: 'Video' }) : null
      ]),
      el('div', { class: 'sc-tray-main' }, [
        el('strong', { text: chosen.file.name || kind }),
        el('span', { text: `${kind} · ${sizeText(chosen.file.size)}` })
      ]),
      el('button', { type: 'button', class: 'sc-icon-btn is-sm', 'aria-label': `Remove the ${kind.toLowerCase()}`, title: 'Remove', onclick: () => { clearFile(); ui.input.focus({ preventScroll: true }); } }, [icon(ICONS.close)])
    );
    refreshSend();
  }
  function chooseFile(file) {
    const type = MEDIA[file.type];
    chat.ui.error.hidden = true;
    if (!type) { showError('Only photos (JPEG, PNG, WebP) and videos (MP4, WebM) can be sent.'); return; }
    if (file.size > type[1] * 1048576) { showError(type[0] === 'image' ? 'Photos can be up to 10 MB.' : 'Videos can be up to 40 MB.'); return; }
    clearFile();
    chat.file = { file, kind: type[0], url: URL.createObjectURL(file) };
    renderTray();
    chat.ui.input.focus({ preventScroll: true });
  }
  function clearFile(keepUrl = false) {
    if (!chat || !chat.file) return;
    if (!keepUrl) URL.revokeObjectURL(chat.file.url);
    chat.file = null;
    renderTray();
  }

  function buildComposer() {
    const ui = {};
    ui.input = el('textarea', { class: 'sc-compose-input', rows: '1', maxlength: '2000', 'aria-label': 'Message', enterkeyhint: touch ? 'enter' : 'send' });
    ui.send = el('button', { type: 'submit', class: 'sc-send-btn', disabled: true, 'aria-label': 'Send message' }, [icon(ICONS.send)]);
    ui.picker = el('input', { type: 'file', accept: Object.keys(MEDIA).join(','), hidden: true, tabindex: '-1' });
    ui.attach = el('button', { type: 'button', class: 'sc-attach-btn', 'aria-label': 'Add a photo or video', title: 'Photo or video', onclick: () => ui.picker.click() }, [icon(ICONS.attach)]);
    ui.context = el('div', { class: 'sc-compose-context', hidden: true });
    ui.tray = el('div', { class: 'sc-compose-tray', hidden: true });
    ui.error = el('p', { class: 'sc-error', role: 'alert', hidden: true });
    ui.form = el('form', { class: 'sc-compose', novalidate: true }, [
      ui.context, ui.tray,
      el('div', { class: 'sc-compose-row' }, [ui.attach, ui.picker, ui.input, ui.send]),
      ui.error
    ]);
    ui.selectBar = el('div', { class: 'sc-select-bar', hidden: true });
    ui.picker.addEventListener('change', () => {
      if (ui.picker.files && ui.picker.files[0]) chooseFile(ui.picker.files[0]);
      ui.picker.value = '';
    });
    ui.input.addEventListener('input', () => { grow(ui.input); refreshSend(); ui.error.hidden = true; });
    ui.input.addEventListener('focus', () => keepInView(ui.form));
    ui.input.addEventListener('paste', (event) => {
      const file = Array.from((event.clipboardData && event.clipboardData.files) || []).find((item) => MEDIA[item.type]);
      if (file && !chat.editing) { event.preventDefault(); chooseFile(file); }
    });
    ui.input.addEventListener('keydown', (event) => {
      // Enter sends on a keyboard; Shift+Enter (or Enter on a phone) starts a new line.
      if (event.key === 'Enter' && !event.shiftKey && !touch && !event.isComposing) { event.preventDefault(); ui.form.requestSubmit(); }
      if (event.key === 'Escape' && (chat.editing || chat.reply)) {
        event.preventDefault();
        event.stopPropagation();
        if (chat.editing) stopEdit(); else clearReply();
      }
    });
    // Tapping Send keeps the keyboard open on phones.
    ui.send.addEventListener('mousedown', (event) => event.preventDefault());
    ui.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = ui.input.value.trim();
      if (chat.editing) { saveEdit(text); return; }
      if (!text && !chat.file) { showError('Type a message or add a photo or video.'); return; }
      const item = pendingMessage(text);
      if (chat.file) {
        item.file = chat.file.file;
        item.preview = chat.file.url;
        item.attachment = { kind: chat.file.kind, url: chat.file.url, name: item.file.name, size: item.file.size };
        clearFile(true);
      }
      ui.input.value = '';
      grow(ui.input);
      clearReply();
      refreshSend();
      chat.pending.push(item);
      deliver(item);
      scrollToBottom();
      if (!touch) ui.input.focus({ preventScroll: true });
    });
    return ui;
  }

  // --- Opening a conversation -----------------------------------------------------
  // Forgets the open conversation (switching to the inbox or another student).
  function resetThread() {
    chat.generation++;
    while (layers.length) layers[layers.length - 1].close();
    closeSearch();
    window.clearInterval(chat.editTimer);
    (chat.pending || []).forEach((item) => { if (item.xhr) item.xhr.abort(); });
    if (chat.file) URL.revokeObjectURL(chat.file.url);
    Object.assign(chat, {
      inThread: false, messages: new Map(), order: [], pending: [], nodes: new Map(), days: new Map(), listNode: null, olderNode: null,
      lastId: 0, firstId: 0, serverTime: 0, hasMore: false, older: null, polling: false, stick: true,
      reply: null, editing: null, selected: null, file: null, ui: null, pill: null
    });
    chat.sheet.panel.classList.remove('is-selecting');
    chat.sheet.tools.replaceChildren();
    chat.sheet.foot.replaceChildren();
  }

  async function showThread(studentId) {
    resetThread();
    const view = chat.sheet;
    const generation = chat.generation;
    chat.studentId = studentId;
    chat.inThread = true;
    view.back.hidden = config.role !== 'teacher';
    view.body.replaceChildren(el('p', { class: 'sc-loading', text: 'Loading…' }));
    chat.ui = buildComposer();
    chat.pill = el('button', { type: 'button', class: 'sc-new-pill', hidden: true, onclick: () => scrollToBottom(true) }, [el('span', { text: 'New messages' }), icon(ICONS.down)]);
    view.foot.replaceChildren(chat.pill, chat.ui.selectBar, chat.ui.form);
    refreshSend();
    const more = el('button', { type: 'button', class: 'sc-icon-btn', 'aria-label': 'Conversation options', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, [icon(ICONS.more)]);
    more.addEventListener('click', () => popMenu(more, more, [
      menuItem('Search messages', 'search', () => openSearch()),
      menuItem('Clear conversation', 'trash', () => clearConversation(), true),
      el('p', { class: 'sc-menu-note', text: 'Clearing removes messages from your view only.' })
    ], true));
    view.tools.replaceChildren(
      el('button', { type: 'button', class: 'sc-icon-btn', 'aria-label': 'Search this conversation', title: 'Search', onclick: () => openSearch() }, [icon(ICONS.search)]),
      more
    );
    let data;
    try {
      data = await api('thread', threadParams());
    } catch (problem) {
      if (chat && chat.generation === generation) view.body.replaceChildren(el('p', { class: 'sc-error', text: problem.message }));
      return;
    }
    if (!chat || chat.generation !== generation) return;
    const other = config.role === 'teacher' ? data.student : data.teacher;
    view.face.replaceChildren(avatar(other));
    view.face.hidden = false;
    if (config.role === 'teacher') {
      view.titleNode.textContent = data.student.name;
      view.subtitleNode.lastChild.textContent = `Private conversation · ${data.student.username}`;
    } else {
      view.titleNode.textContent = `Teacher ${data.teacher.name}`;
      // Short, so it fits beside the name on a phone; the full sentence on hover.
      view.subtitleNode.lastChild.textContent = 'Private · only you and your teacher';
      view.subtitleNode.title = 'Only you and your teacher can see these messages.';
    }
    chat.reactions = data.reactions;
    chat.serverTime = data.serverTime;
    chat.hasMore = data.hasMore;
    data.messages.forEach(upsert);
    chat.listNode = el('ol', { class: 'sc-messages', role: 'log', 'aria-label': 'Messages' });
    renderList();
    scrollToBottom();
    if (!touch) chat.ui.input.focus({ preventScroll: true });
    loadSummary();
    loadNotifications();
  }

  async function showInbox() {
    const view = chat.sheet;
    if (chat.inThread || chat.listNode) resetThread();
    const generation = chat.generation;
    chat.studentId = 0;
    view.back.hidden = true;
    view.face.hidden = true;
    view.titleNode.textContent = 'Messages';
    view.subtitleNode.lastChild.textContent = 'Private conversations with your students. Only you and each student can see them.';
    let data;
    try {
      data = await api('inbox', { classroom: classroomId });
    } catch (problem) {
      if (chat && chat.generation === generation) view.body.replaceChildren(el('p', { class: 'sc-error', text: problem.message }));
      return;
    }
    if (!chat || chat.generation !== generation || chat.inThread) return;
    if (!data.conversations.length) {
      view.body.replaceChildren(el('p', { class: 'sc-empty', text: 'No students have joined this classroom yet.' }));
      return;
    }
    view.body.replaceChildren(el('ul', { class: 'sc-inbox' }, data.conversations.map((conversation) => el('li', {}, [
      el('button', { type: 'button', class: `sc-convo${conversation.unread ? ' is-unread' : ''}`, onclick: () => showThread(conversation.student.id) }, [
        avatar(conversation.student),
        el('span', { class: 'sc-convo-text' }, [
          el('span', { class: 'sc-convo-top' }, [
            el('strong', { translate: 'no', text: conversation.student.name }),
            conversation.last ? timeTag(conversation.last.at) : null
          ]),
          el('span', { class: 'sc-convo-last', text: conversation.last ? `${conversation.last.mine ? 'You: ' : ''}${conversation.last.body}` : `No messages yet · ${conversation.student.username}` })
        ]),
        conversation.unread ? el('span', { class: 'sc-badge is-inline', text: String(conversation.unread), 'aria-label': `${conversation.unread} unread` }) : null
      ])
    ]))));
  }

  function openChat(studentId) {
    if (!classroomId) return;
    if (!chat) {
      const teacher = config.role === 'teacher';
      const view = sheet({
        title: teacher ? 'Messages' : 'Private Message to Teacher',
        subtitle: teacher ? 'Private conversations with your students.' : 'Only you and your teacher can see these messages.',
        lockIcon: true
      });
      view.panel.classList.add('sc-chat');
      chat = { sheet: view, studentId: 0, generation: 0, timer: 0, ticks: 0, reactions: [] };
      resetThread();
      view.back.addEventListener('click', () => showInbox());
      view.onEscape = () => {
        if (chat.selected) { stopSelect(); return true; }
        if (chat.search) { closeSearch(); return true; }
        return false;
      };
      view.onClose = () => {
        closeMenu();
        while (layers.length) layers[layers.length - 1].close();
        (chat.pending || []).forEach((item) => { if (item.xhr) item.xhr.abort(); });
        if (chat.file) URL.revokeObjectURL(chat.file.url);
        window.clearInterval(chat.timer);
        window.clearInterval(chat.editTimer);
        chat = null;
        chatButtons.forEach((button) => button.setAttribute('aria-expanded', 'false'));
      };
      view.body.addEventListener('scroll', () => {
        if (!chat || !chat.inThread) return;
        chat.stick = nearBottom();
        if (chat.stick && chat.pill) chat.pill.hidden = true;
        if (chat.hasMore && view.body.scrollTop < 160) loadOlder();
        if (menu) closeMenu();
      }, { passive: true });
      view.open();
      chatButtons.forEach((button) => button.setAttribute('aria-expanded', 'true'));
      // While open, new messages and changes arrive every few seconds (not while
      // the tab is hidden); the teacher's inbox refreshes less often.
      chat.timer = window.setInterval(() => {
        if (document.hidden || !chat) return;
        if (chat.inThread) poll();
        else if (config.role === 'teacher' && ++chat.ticks % 2 === 0) showInbox();
      }, POLL_MS);
    }
    chat.sheet.body.replaceChildren(el('p', { class: 'sc-loading', text: 'Loading…' }));
    if (config.role === 'teacher' && !studentId) showInbox();
    else showThread(config.role === 'teacher' ? studentId : 0);
  }
  chatButtons.forEach((button) => button.addEventListener('click', () => openChat(0)));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && chat && chat.inThread) poll(); });

  // --- Activity comments ------------------------------------------------------------------------
  const threads = new Map(); // activityId -> { root, toggle, panel, list, ... }

  function commentNode(comment, thread, isReply) {
    const item = el('li', { class: `ac-comment${isReply ? ' is-reply' : ''}${comment.deleted ? ' is-deleted' : ''}`, id: `comment-${comment.id}` });
    if (comment.deleted) {
      item.append(el('p', { class: 'ac-deleted', text: 'Comment deleted' }));
    } else {
      const text = el('p', { class: 'ac-text', text: comment.body });
      const actions = el('div', { class: 'ac-actions' }, [
        !isReply ? el('button', { type: 'button', class: 'sc-text-btn', text: 'Reply', onclick: () => openForm(thread, { parent: comment, after: item }) }) : null,
        comment.canEdit ? el('button', { type: 'button', class: 'sc-text-btn', text: 'Edit', onclick: () => editComment(thread, comment, item, text) }) : null,
        comment.canDelete ? el('button', { type: 'button', class: 'sc-text-btn is-danger', text: 'Delete', onclick: () => deleteComment(thread, comment) }) : null
      ]);
      item.append(
        avatar(comment.user, isReply ? 'sm' : ''),
        el('div', { class: 'ac-main' }, [
          el('div', { class: 'ac-meta' }, [
            el('strong', { translate: 'no', text: comment.user.name }),
            comment.user.role === 'teacher' ? el('span', { class: 'ac-teacher', text: 'Teacher' }) : null,
            timeTag(comment.at),
            comment.edited ? el('span', { class: 'ac-edited', text: comment.editedByTeacher ? 'edited by teacher' : 'edited' }) : null
          ]),
          text,
          actions
        ])
      );
    }
    if (!isReply && comment.replies && comment.replies.length) {
      item.append(el('ol', { class: 'ac-replies' }, comment.replies.map((reply) => commentNode(reply, thread, true))));
    }
    return item;
  }

  function setCount(thread, count, fresh) {
    thread.count = count;
    thread.countNode.textContent = count ? String(count) : '';
    thread.countNode.hidden = !count;
    thread.dot.hidden = !fresh;
    thread.toggle.setAttribute('aria-label', `Class comments${count ? `, ${count}` : ''}${fresh ? ', new comments' : ''}`);
  }

  async function loadComments(thread) {
    let data;
    try {
      data = await api('comments', { activity: thread.id });
    } catch (problem) {
      thread.list.replaceChildren(el('li', { class: 'sc-error', text: problem.message }));
      return;
    }
    thread.moderator = data.moderator;
    setCount(thread, data.count, false);
    thread.list.replaceChildren(...(data.comments.length
      ? data.comments.map((comment) => commentNode(comment, thread, false))
      : [el('li', { class: 'ac-empty', text: 'No comments yet. Start the discussion about this activity.' })]));
    loadNotifications();
  }

  // The comment bar: shown by "Add comment" (or Reply), with Post Comment and Cancel.
  function openForm(thread, { parent = null, after = null } = {}) {
    thread.panel.querySelectorAll('.ac-form').forEach((form) => form.remove());
    thread.add.hidden = Boolean(!parent);
    const input = el('textarea', {
      class: 'ac-input', rows: '2', maxlength: '2000',
      placeholder: parent ? `Reply to ${parent.user.name}` : 'Add a comment for your classroom',
      'aria-label': parent ? `Reply to ${parent.user.name}` : 'Comment'
    });
    const post = el('button', { type: 'submit', class: 'ac-post', text: parent ? 'Post Reply' : 'Post Comment', disabled: true });
    const error = el('p', { class: 'sc-error', role: 'alert', hidden: true });
    const requestToken = token();
    let busy = false;
    const form = el('form', { class: `ac-form${parent ? ' is-reply' : ''}`, novalidate: true }, [
      parent ? el('p', { class: 'ac-form-label', text: `Replying to ${parent.user.name}` }) : null,
      input,
      error,
      el('div', { class: 'ac-form-actions' }, [
        el('button', { type: 'button', class: 'ac-cancel', text: 'Cancel', onclick: () => closeForm() }),
        post
      ])
    ]);
    function closeForm() {
      form.remove();
      thread.add.hidden = false;
      (parent ? after.querySelector('.sc-text-btn') : thread.add)?.focus({ preventScroll: true });
    }
    input.addEventListener('input', () => { grow(input, 200); post.disabled = busy || !input.value.trim(); error.hidden = true; });
    input.addEventListener('focus', () => keepInView(form));
    input.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.stopPropagation(); closeForm(); } });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) { error.hidden = false; error.textContent = 'Write something before posting.'; return; }
      if (busy) return;
      busy = true;
      post.disabled = true;
      post.textContent = 'Posting…';
      try {
        // The same token on a retry: the server keeps only one copy.
        await api('comment', {}, { activity: thread.id, parent: parent ? parent.id : 0, body: text, token: requestToken });
        form.remove();
        thread.add.hidden = false;
        await loadComments(thread);
      } catch (problem) {
        busy = false;
        post.disabled = false;
        post.textContent = parent ? 'Post Reply' : 'Post Comment';
        error.hidden = false;
        error.textContent = `${problem.message} Your comment is still here.`;
      }
    });
    if (parent) after.append(form);
    else thread.add.after(form);
    input.focus({ preventScroll: true });
    keepInView(form);
  }

  function editComment(thread, comment, item, textNode) {
    if (item.querySelector('.ac-edit')) return;
    const input = el('textarea', { class: 'ac-input', rows: '2', maxlength: '2000', 'aria-label': 'Edit comment', value: comment.body });
    const error = el('p', { class: 'sc-error', role: 'alert', hidden: true });
    const save = el('button', { type: 'submit', class: 'ac-post', text: 'Save' });
    const form = el('form', { class: 'ac-form ac-edit', novalidate: true }, [input, error, el('div', { class: 'ac-form-actions' }, [
      el('button', { type: 'button', class: 'ac-cancel', text: 'Cancel', onclick: () => { form.remove(); textNode.hidden = false; } }),
      save
    ])]);
    textNode.hidden = true;
    textNode.after(form);
    grow(input, 200);
    input.addEventListener('input', () => { grow(input, 200); save.disabled = !input.value.trim(); });
    input.addEventListener('focus', () => keepInView(form));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!input.value.trim() || save.disabled) return;
      save.disabled = true;
      try {
        await api('comment_edit', {}, { id: comment.id, body: input.value });
        await loadComments(thread);
      } catch (problem) {
        save.disabled = false;
        error.hidden = false;
        error.textContent = problem.message;
      }
    });
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }

  async function deleteComment(thread, comment) {
    const others = comment.mine ? 'your comment' : `${comment.user.name}'s comment`;
    if (!window.confirm(`Delete ${others}? This cannot be undone.`)) return;
    try {
      await api('comment_delete', {}, { id: comment.id });
    } catch (problem) {
      window.alert(problem.message);
    }
    loadComments(thread);
  }

  function setUpThread(root) {
    const id = Number(root.dataset.activityComments);
    if (!id || threads.has(id)) return;
    const countNode = el('span', { class: 'ac-count', hidden: true });
    const dot = el('span', { class: 'sc-dot', hidden: true });
    const toggle = el('button', { type: 'button', class: 'ac-toggle', 'aria-expanded': 'false', 'aria-controls': `ac-panel-${id}` }, [
      icon(ICONS.people), el('span', { text: 'Class comments' }), countNode, dot
    ]);
    const list = el('ol', { class: 'ac-list' });
    const add = el('button', { type: 'button', class: 'ac-add' }, [icon(ICONS.comments), el('span', { text: 'Add comment' })]);
    const panel = el('div', { class: 'ac-panel', id: `ac-panel-${id}`, hidden: true }, [
      el('p', { class: 'ac-label' }, [icon(ICONS.people), el('span', { text: 'Activity Comments — Visible to Your Classroom' })]),
      list,
      add
    ]);
    const thread = { id, root, toggle, panel, list, add, countNode, dot, count: 0 };
    toggle.addEventListener('click', () => toggleThread(thread));
    add.addEventListener('click', () => openForm(thread));
    root.replaceChildren(toggle, panel);
    threads.set(id, thread);
  }

  function toggleThread(thread, open) {
    const opening = open === undefined ? thread.panel.hidden : open;
    thread.panel.hidden = !opening;
    thread.toggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
    thread.root.classList.toggle('is-open', opening);
    if (opening) {
      thread.list.replaceChildren(el('li', { class: 'sc-loading', text: 'Loading comments…' }));
      loadComments(thread);
    }
  }

  // --- Counts and badges on the page ------------------------------------------------------------
  async function loadSummary() {
    if (!classroomId) return;
    let data;
    try {
      data = await api('summary', { classroom: classroomId });
    } catch (problem) {
      return;
    }
    chatButtons.forEach((button) => badge(button, data.unreadMessages));
    // The number of students in the classroom, as students join or leave.
    if (typeof data.students === 'number') {
      document.querySelectorAll('[data-student-count]').forEach((node) => { node.textContent = String(data.students); });
      document.querySelectorAll('[data-student-label]').forEach((node) => { node.textContent = data.students === 1 ? 'student' : 'students'; });
    }
    threads.forEach((thread) => {
      const info = data.activities[thread.id];
      if (thread.panel.hidden) setCount(thread, info ? info.count : 0, info ? info.new : false);
    });
  }

  // --- Start -----------------------------------------------------------------------------------------
  document.querySelectorAll('[data-activity-comments]').forEach(setUpThread);
  loadNotifications();
  loadSummary();
  // Every minute while the page is in view (and on coming back to it).
  window.setInterval(() => { if (!document.hidden) { loadNotifications(); loadSummary(); } }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadNotifications(); loadSummary(); } });

  // Arriving from a notification: open what it is about.
  if (config.openComments && threads.has(Number(config.openComments))) {
    const thread = threads.get(Number(config.openComments));
    toggleThread(thread, true);
    window.setTimeout(() => thread.root.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150);
  }
  if (config.openChat) openChat(config.role === 'teacher' ? Number(config.openChat) : 0);
})();
