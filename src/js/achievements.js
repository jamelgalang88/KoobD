(() => {
  const config = window.KOOBD_ACHIEVEMENTS || {};
  if (!config.url || !config.csrf) return;

  const queue = [];
  const queuedIds = new Set();
  let activeToast = null;
  let polling = false;
  let retryTimer = 0;
  let toastTimer = 0;
  const stack = document.createElement('div');
  stack.className = 'achievement-toast-stack';
  stack.setAttribute('aria-label', 'New achievements');
  document.body.appendChild(stack);

  async function request(action, payload, keepalive = false) {
    const response = await fetch(config.url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-KOOBD-CSRF': config.csrf
      },
      body: JSON.stringify({ action, ...payload }),
      keepalive
    });
    const result = await response.json();
    if (!response.ok || !result || result.ok !== true) {
      throw new Error(result && result.error ? result.error : `Achievement request failed (${response.status}).`);
    }
    return result;
  }

  function acknowledge(id) {
    return request('ack', { ids: [id] }, true)
      .catch((error) => console.error('Unable to acknowledge achievement notice:', error))
      .finally(() => queuedIds.delete(id));
  }

  function hasBlockingDialog() {
    return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]:not([aria-hidden="true"])'));
  }

  function hideToast(id, toast) {
    if (toast.classList.contains('is-leaving')) return;
    window.clearTimeout(toastTimer);
    toast.classList.add('is-leaving');
    window.setTimeout(() => {
      toast.remove();
      activeToast = null;
      acknowledge(id);
      showNext();
    }, 240);
  }

  function showNext() {
    if (activeToast || queue.length === 0) return;
    if (hasBlockingDialog()) {
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(showNext, 1500);
      return;
    }

    const notice = queue.shift();
    const toast = document.createElement('article');
    toast.className = `achievement-toast${config.role === 'teacher' ? ' is-teacher' : ''}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toast.setAttribute('aria-label', `${notice.title}. New achievement unlocked.`);

    const medal = document.createElement('div');
    medal.className = 'achievement-toast-art';
    medal.setAttribute('aria-hidden', 'true');
    medal.innerHTML = notice.art;

    const copy = document.createElement('div');
    copy.className = 'achievement-toast-copy';
    const congratulations = document.createElement('span');
    congratulations.textContent = 'Congratulations!';
    const title = document.createElement('strong');
    title.textContent = notice.title;
    const description = document.createElement('p');
    description.textContent = notice.description;
    const badge = document.createElement('span');
    badge.className = 'achievement-toast-badge';
    badge.textContent = 'New Achievement Unlocked';
    copy.append(congratulations, title, description, badge);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'achievement-toast-close';
    close.setAttribute('aria-label', 'Dismiss achievement notification');
    close.textContent = '×';

    const actions = document.createElement('div');
    actions.className = 'achievement-toast-actions';
    const rarity = document.createElement('span');
    rarity.className = 'achievement-toast-rarity';
    rarity.textContent = `${notice.rarity} medal`;
    const view = document.createElement('a');
    view.href = 'profile.php#achievements';
    view.textContent = 'View medal';
    actions.append(rarity, view);
    toast.append(medal, copy, close, actions);
    stack.appendChild(toast);
    activeToast = toast;
    window.requestAnimationFrame(() => toast.classList.add('is-visible'));

    if (document.visibilityState === 'visible' && window.KoobdAudio && typeof window.KoobdAudio.sfx === 'function') {
      window.KoobdAudio.sfx('success');
    }
    toastTimer = window.setTimeout(() => hideToast(notice.id, toast), 8500);
    close.addEventListener('click', () => hideToast(notice.id, toast));
    view.addEventListener('click', (event) => {
      event.preventDefault();
      const href = view.href;
      acknowledge(notice.id).finally(() => window.location.assign(href));
    });
  }

  async function poll() {
    if (polling || document.visibilityState === 'hidden') return;
    polling = true;
    try {
      const result = await request('poll', {});
      if (!Array.isArray(result.notices)) {
        throw new Error('Achievement response did not contain a notice list.');
      }
      result.notices.forEach((notice) => {
        if (!notice || !Number.isInteger(notice.id) || queuedIds.has(notice.id)) return;
        queuedIds.add(notice.id);
        queue.push(notice);
      });
      showNext();
    } catch (error) {
      console.error('Unable to check achievement progress:', error);
    } finally {
      polling = false;
    }
  }

  poll();
  window.setInterval(poll, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') poll();
  });
  window.addEventListener('focus', poll);
})();
