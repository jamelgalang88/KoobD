// Keep this script lightweight: banner carousel + active menu + reader carousel.
// Navigation between pages happens via normal anchor links in the sidebar.
(function () {
  const navItems = document.querySelectorAll('.menu-item, .sidebar-link');
  const sidebarProfileNames = Array.from(document.querySelectorAll('.sidebar-profile-name'));
  const logoutForms = Array.from(document.querySelectorAll('.sidebar-logout-form, .sidebar-menu-logout-form'));
  const sessionConfig = window.KOOBD_SESSION || {};
  let activeLogoutForm = null;
  let logoutCloseTimer = null;
  let lastLogoutMessageIndex = -1;

  const logoutMessages = {
    student: [
      'Heading out already? Your stories promise not to miss you too much.',
      'Poof. One click and you are out of KoobD land. Want to make it official?',
      'Logging out now will send your reader on a tiny snack break.',
      'Your books are staying put. They are just waiting dramatically for your return.'
    ],
    teacher: [
      'Clocking out of classroom duty for now? Your dashboard can hold the chalk.',
      'Logging out will give your classroom tools a well-earned coffee break.',
      'Your teacher workspace will stay right here, looking responsible until you return.',
      'Ready to step out? The classroom will behave... probably.'
    ]
  };

  function getRandomLogoutMessage() {
    const role = sessionConfig.role === 'teacher' ? 'teacher' : 'student';
    const messages = logoutMessages[role];
    if (!messages || messages.length === 0) {
      return 'Are you sure you want to log out?';
    }

    let nextIndex = 0;
    if (messages.length === 1) {
      nextIndex = 0;
    } else {
      do {
        nextIndex = Math.floor(Math.random() * messages.length);
      } while (nextIndex === lastLogoutMessageIndex);
    }

    lastLogoutMessageIndex = nextIndex;
    return messages[nextIndex];
  }

  function ensureLogoutModal() {
    let modal = document.getElementById('logoutConfirmModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'logout-confirm-modal hidden';
    modal.id = 'logoutConfirmModal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="logout-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="logoutConfirmTitle">
        <h2 id="logoutConfirmTitle">Log out of KoobD?</h2>
        <p id="logoutConfirmCopy"></p>
        <div class="logout-confirm-actions">
          <button type="button" class="logout-confirm-btn subtle" data-logout-action="cancel">Cancel</button>
          <button type="button" class="logout-confirm-btn primary" data-logout-action="confirm">Log Out</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeLogoutModal();
      }
    });

    const cancelBtn = modal.querySelector('[data-logout-action="cancel"]');
    const confirmBtn = modal.querySelector('[data-logout-action="confirm"]');

    if (cancelBtn) {
      cancelBtn.addEventListener('click', closeLogoutModal);
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        const formToSubmit = activeLogoutForm;
        closeLogoutModal();
        if (formToSubmit) {
          formToSubmit.submit();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        closeLogoutModal();
      }
    });

    return modal;
  }

  function openLogoutModal(form) {
    closeProfileMenus();
    activeLogoutForm = form;
    const modal = ensureLogoutModal();
    const copy = modal.querySelector('#logoutConfirmCopy');
    if (copy) {
      copy.textContent = getRandomLogoutMessage();
    }
    window.clearTimeout(logoutCloseTimer);
    modal.classList.remove('is-closing');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    const confirmBtn = modal.querySelector('[data-logout-action="confirm"]');
    if (confirmBtn) {
      confirmBtn.focus();
    }
  }

  function closeLogoutModal() {
    const modal = document.getElementById('logoutConfirmModal');
    if (!modal) return;
    if (modal.classList.contains('hidden') || modal.classList.contains('is-closing')) return;
    modal.classList.add('is-closing');
    modal.setAttribute('aria-hidden', 'true');
    logoutCloseTimer = window.setTimeout(() => {
      modal.classList.add('hidden');
      modal.classList.remove('is-closing');
      activeLogoutForm = null;
    }, 180);
  }

  function fitSidebarProfileNames() {
    sidebarProfileNames.forEach((nameEl) => {
      if (!nameEl || window.getComputedStyle(nameEl).display === 'none') {
        return;
      }

      const baseFontSize = parseFloat(nameEl.dataset.baseFontSize || window.getComputedStyle(nameEl).fontSize);
      if (!nameEl.dataset.baseFontSize) {
        nameEl.dataset.baseFontSize = String(baseFontSize);
      }

      let fontSize = parseFloat(nameEl.dataset.baseFontSize);
      nameEl.style.fontSize = `${fontSize}px`;

      const maxLines = 2;
      const maxHeight = Math.ceil(fontSize * 1.22 * maxLines);
      let attempts = 0;

      while ((nameEl.scrollHeight > maxHeight || nameEl.scrollWidth > nameEl.clientWidth + 1) && fontSize > 6.5 && attempts < 10) {
        fontSize -= 0.5;
        nameEl.style.fontSize = `${fontSize}px`;
        attempts += 1;
      }
    });
  }

  // Set active state based on current URL.
  const currentFile = window.location.pathname.split('/').pop();
  const teacherStoryFiles = ['create_story.php', 'teacher_create_story.php', 'teacher_story_editor.php', 'teacher_story_preview.php', 'shared_story_reader.php', 'story.php'];
  function updateSidebarActiveState() {
    const lastReadLink = document.querySelector('.sidebar-link-lastread[data-last-read-href]');
    const isLastReadPage = lastReadLink
      ? new URL(lastReadLink.href, window.location.href).pathname === window.location.pathname
      : false;
    navItems.forEach((item) => {
      const href = item.getAttribute('href') || '';
      if (!href || href === '#') return;
      const hrefFile = href.split(/[?#]/)[0].split('/').pop();
      const shouldActivate = item.classList.contains('sidebar-link-lastread')
        ? isLastReadPage
        : (hrefFile === currentFile && !isLastReadPage) || (item.classList.contains('sidebar-link-add') && !isLastReadPage && teacherStoryFiles.includes(currentFile));
      if (shouldActivate) item.classList.add('active');
      else item.classList.remove('active');
    });
  }
  updateSidebarActiveState();

  fitSidebarProfileNames();
  window.addEventListener('resize', fitSidebarProfileNames);

  const missionStatusUrl = new URL('../missions_status.php', document.currentScript.src);
  const missionStatusRequest = fetch(missionStatusUrl, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then((response) => {
      if (!response.ok) throw new Error(`Mission status request failed (${response.status}).`);
      return response.json();
    })
    .then((status) => {
      if (!status || typeof status.unlocks !== 'object') {
        throw new Error('Mission status response is invalid.');
      }
      return status;
    });

  // The profile menu's Dictionary (dictionary.php), Writing Practice
  // (writing.php) and Minigames (minigames.php), right under My Profile.
  document.querySelectorAll('.sidebar-profile-popover').forEach((menu) => {
    if (menu.querySelector('[data-dictionary]')) return;
    const profileItem = menu.querySelector('a.sidebar-profile-menu-item');
    let place = profileItem ? profileItem.nextSibling : menu.firstChild;
    [
      ['dictionary.php', 'dictionary', 'Dictionary', '<path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/>'],
      ['writing.php', 'writing', 'Writing Practice', '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'],
      ['minigames.php', 'minigames', 'Minigames', '<path d="M10 4a2 2 0 014 0v2h4a1 1 0 011 1v4h-2a2 2 0 000 4h2v4a1 1 0 01-1 1h-4v-2a2 2 0 00-4 0v2H6a1 1 0 01-1-1v-4H3a2 2 0 010-4h2V7a1 1 0 011-1h4z"/>']
    ].forEach(([href, key, label, path]) => {
      const item = document.createElement('a');
      item.dataset.destination = href;
      item.dataset.iconPath = path;
      item.className = 'sidebar-profile-menu-item';
      item.dataset[key] = '';
      item.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg><span>${label}</span>`;
      item.classList.add('is-locked');
      item.setAttribute('aria-disabled', 'true');
      item.setAttribute('tabindex', '-1');
      item.title = 'Checking mission requirements...';
      item.querySelector('svg').innerHTML = '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>';
      menu.insertBefore(item, place);
      place = item.nextSibling;
    });
    missionStatusRequest
      .then((status) => {
        menu.querySelectorAll('[data-dictionary], [data-writing], [data-minigames]').forEach((item) => {
          const feature = item.hasAttribute('data-minigames') ? 'minigames' : 'learning_tools';
          const icon = item.querySelector('svg');
          if (status.unlocks[feature] === true) {
            item.classList.remove('is-locked');
            item.href = item.dataset.destination;
            item.removeAttribute('aria-disabled');
            item.removeAttribute('tabindex');
            item.removeAttribute('title');
            if (icon) icon.innerHTML = item.dataset.iconPath;
            return;
          }
          item.removeAttribute('href');
          item.title = 'Complete the required missions to unlock this feature.';
        });
      })
      .catch((error) => console.error('Unable to load mission unlock status:', error));
  });

  document.querySelectorAll('.sidebar-profile-popover').forEach((menu) => {
    if (menu.querySelector('[data-achievements-menu]')) return;
    const item = document.createElement('a');
    item.href = 'profile.php#achievements';
    item.className = 'sidebar-profile-menu-item';
    item.dataset.achievementsMenu = '';
    item.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z"/><path d="m9 12 2 2 4-4"/></svg><span>Achievements &amp; Medals</span>';
    const logout = menu.querySelector('.sidebar-menu-logout-form');
    menu.insertBefore(item, logout || null);
  });

  missionStatusRequest
    .then((status) => {
      document.querySelectorAll('.sidebar-link-versus').forEach((item) => {
        const icon = item.querySelector('.sidebar-icon-svg');
        if (item.dataset.destination === undefined) item.dataset.destination = item.getAttribute('href') || '';
        if (icon && item.dataset.iconMarkup === undefined) item.dataset.iconMarkup = icon.innerHTML;
        if (status.unlocks.versus === true) {
          item.classList.remove('is-locked');
          item.href = item.dataset.destination;
          item.setAttribute('aria-label', 'Versus Mode');
          item.removeAttribute('aria-disabled');
          item.removeAttribute('title');
          if (icon) icon.innerHTML = item.dataset.iconMarkup;
          return;
        }
        item.classList.add('is-locked');
        item.removeAttribute('href');
        item.setAttribute('aria-label', 'Versus Mode is locked');
        item.setAttribute('aria-disabled', 'true');
        item.title = 'Complete Creativity and Expression to unlock Versus Mode.';
        if (icon) {
          icon.innerHTML = '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>';
        }
      });

      document.querySelectorAll('.sidebar-link-add').forEach((item) => {
        const icon = item.querySelector('.sidebar-icon-add');
        if (item.dataset.destination === undefined) item.dataset.destination = item.getAttribute('href') || '';
        if (status.unlocks.story_creation === true) {
          item.classList.remove('is-locked');
          item.href = item.dataset.destination;
          item.setAttribute('aria-label', 'Create story');
          item.removeAttribute('aria-disabled');
          item.removeAttribute('title');
          if (icon && icon.querySelector('svg')) icon.innerHTML = '+';
          return;
        }
        item.classList.add('is-locked');
        item.removeAttribute('href');
        item.setAttribute('aria-label', 'Create story is locked');
        item.setAttribute('aria-disabled', 'true');
        item.title = 'Complete Developing Language Skills to unlock story creation.';
        if (icon) {
          icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
        }
      });
    })
    .catch((error) => console.error('Unable to load story-creation unlock status:', error));

  // The profile button (bottom of the sidebar, or the portrait bar) opens its
  // menu: My Profile, role-specific tools and Log out.
  const profileMenus = Array.from(document.querySelectorAll('.sidebar-profile-menu')).map((wrap) => ({
    button: wrap.querySelector('.sidebar-profile-link'),
    popover: wrap.querySelector('.sidebar-profile-popover')
  })).filter((menu) => menu.button && menu.popover);
  const approveStoriesLink = document.querySelector('.sidebar-link-approve-stories');
  const approvalPortraitQuery = window.matchMedia(
    '(max-width: 768px) and (orientation: portrait), (orientation: portrait) and (pointer: coarse)'
  );
  const approvalMenuItems = [];
  if (approveStoriesLink) {
    profileMenus.forEach(({ popover }) => {
      let item = popover.querySelector('[data-approve-stories-menu]');
      if (!item) {
        item = document.createElement('a');
        item.href = approveStoriesLink.href;
        item.className = 'sidebar-profile-menu-item';
        item.dataset.approveStoriesMenu = '';
        item.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v14l-3.5-2-3.5 2-3.5-2L6.5 20 3.5 18V6A1.5 1.5 0 0 1 5 4.5z"/><path d="m8 11 2.5 2.5L16 8"/></svg><span>Approve Stories</span>';
        const logout = popover.querySelector('.sidebar-menu-logout-form');
        popover.insertBefore(item, logout || null);
      }
      approvalMenuItems.push(item);
    });
  }

  function updateApprovalStoriesPlacement() {
    if (!approveStoriesLink) return;
    const showInProfileMenu = approvalPortraitQuery.matches;
    approveStoriesLink.hidden = showInProfileMenu;
    approvalMenuItems.forEach((item) => {
      item.hidden = !showInProfileMenu;
    });
  }

  updateApprovalStoriesPlacement();
  if (typeof approvalPortraitQuery.addEventListener === 'function') {
    approvalPortraitQuery.addEventListener('change', updateApprovalStoriesPlacement);
  } else {
    approvalPortraitQuery.addListener(updateApprovalStoriesPlacement);
  }
  // The sidebar's backdrop blur would make it the menu's frame (a fixed
  // element inside it is placed, and clipped, relative to the sidebar), so
  // the menu lives at the end of the page instead.
  profileMenus.forEach((menu) => document.body.appendChild(menu.popover));

  function placeProfileMenu(menu) {
    const rect = menu.button.getBoundingClientRect();
    const { popover } = menu;
    popover.style.left = popover.style.right = popover.style.top = popover.style.bottom = '';
    if (approvalPortraitQuery.matches) {
      // Portrait bar: above the tab, kept inside the screen.
      popover.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
      popover.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    } else {
      // Side rail: beside the button, its bottom level with the button's.
      popover.style.left = `${rect.right + 10}px`;
      popover.style.bottom = `${Math.max(8, window.innerHeight - rect.bottom)}px`;
    }
  }

  function closeProfileMenus(returnFocus) {
    profileMenus.forEach((menu) => {
      if (menu.popover.hidden) return;
      menu.popover.hidden = true;
      menu.button.setAttribute('aria-expanded', 'false');
      if (returnFocus) menu.button.focus();
    });
  }

  profileMenus.forEach((menu) => {
    menu.button.addEventListener('click', (event) => {
      event.stopPropagation();
      const opening = menu.popover.hidden;
      closeProfileMenus();
      if (!opening) return;
      placeProfileMenu(menu);
      menu.popover.hidden = false;
      menu.button.setAttribute('aria-expanded', 'true');
      const first = menu.popover.querySelector('a, button');
      if (first && event.detail === 0) first.focus();
    });
    menu.popover.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const items = Array.from(menu.popover.querySelectorAll('a, button'));
      const index = items.indexOf(document.activeElement);
      event.preventDefault();
      items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    });
  });

  if (profileMenus.length) {
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.sidebar-profile-popover')) closeProfileMenus();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeProfileMenus(true);
    });
    // Turning the device closes the menu; the address bar sliding in and out
    // (a height-only change) does not.
    let menuWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      if (window.innerWidth === menuWidth) return;
      menuWidth = window.innerWidth;
      closeProfileMenus();
    });
  }

  // Banner carousel (only if elements exist).
  const track = document.querySelector('.banner-track');
  const slides = document.querySelectorAll('.banner-slide');
  const leftBtn = document.querySelector('.banner-arrow.left');
  const rightBtn = document.querySelector('.banner-arrow.right');

  if (track && slides.length >= 2) {
    let currentBanner = 0;
    const totalBanners = slides.length;

    function updateBanner() {
      track.style.transform = `translateX(-${currentBanner * 100}%)`;
      track.style.transition = 'transform 0.6s ease';
    }

    function nextBanner() {
      currentBanner = (currentBanner + 1) % totalBanners;
      updateBanner();
    }

    function prevBanner() {
      currentBanner = (currentBanner - 1 + totalBanners) % totalBanners;
      updateBanner();
    }

    if (rightBtn) rightBtn.addEventListener('click', nextBanner);
    if (leftBtn) leftBtn.addEventListener('click', prevBanner);

    // Auto-slide every 10 seconds.
    setInterval(nextBanner, 10000);
  }

  // Reader carousel
  const readerCards = Array.from(document.querySelectorAll('.reader-card'));
  const readerPrev = document.getElementById('readerPrev');
  const readerNext = document.getElementById('readerNext');
  const readerDots = Array.from(document.querySelectorAll('.reader-dot'));
  const readerSelectedName = document.getElementById('readerSelectedName');
  const readerSelectedAvatar = document.getElementById('readerSelectedAvatar');
  const readerSelectedLink = document.getElementById('readerSelectedLink');
  const readerSelectedCta = document.getElementById('readerSelectedCta');

  if (readerCards.length > 0) {
    const selectedIndex = readerCards.findIndex((card) => card.dataset.selected === 'true');
    let currentReader = selectedIndex >= 0 ? selectedIndex : 0;

    function wrappedIndex(index) {
      return (index + readerCards.length) % readerCards.length;
    }

    function formatReaderName(name) {
      const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
      if (parts.length <= 1) {
        return `<span class="reader-selected-name-plain">${parts[0] || ''}</span>`;
      }

      const lead = parts.slice(0, -1).join(' ');
      const accent = parts[parts.length - 1];
      return `<span class="reader-selected-name-plain">${lead}</span> <span class="reader-selected-name-accent">${accent}</span>`;
    }

    function updateReaderCarousel() {
      readerCards.forEach((card, index) => {
        card.classList.remove('is-active', 'is-prev', 'is-next', 'is-prev2', 'is-next2', 'is-hidden');

        if (index === currentReader) {
          card.classList.add('is-active');
        } else if (index === wrappedIndex(currentReader - 1)) {
          card.classList.add('is-prev');
        } else if (index === wrappedIndex(currentReader + 1)) {
          card.classList.add('is-next');
        } else if (index === wrappedIndex(currentReader - 2)) {
          card.classList.add('is-prev2');
        } else if (index === wrappedIndex(currentReader + 2)) {
          card.classList.add('is-next2');
        } else {
          card.classList.add('is-hidden');
        }
      });

      const activeCard = readerCards[currentReader];
      if (activeCard) {
        const readerName = activeCard.dataset.readerName || '';
        const readerAsset = activeCard.dataset.readerAsset || '';
        const readerHref = activeCard.dataset.readerHref || activeCard.getAttribute('href') || '#';

        if (readerSelectedName) {
          readerSelectedName.innerHTML = formatReaderName(readerName);
          readerSelectedName.setAttribute('href', readerHref);
        }

        if (readerSelectedAvatar) {
          readerSelectedAvatar.setAttribute('src', readerAsset);
          readerSelectedAvatar.setAttribute('alt', readerName);
        }

        if (readerSelectedLink) {
          readerSelectedLink.setAttribute('href', readerHref);
        }

        if (readerSelectedCta) {
          readerSelectedCta.setAttribute('href', readerHref);
        }
      }

      readerDots.forEach((dot, index) => {
        dot.classList.toggle('is-active', index === currentReader);
      });
    }

    function nextReader() {
      currentReader = wrappedIndex(currentReader + 1);
      updateReaderCarousel();
    }

    function prevReader() {
      currentReader = wrappedIndex(currentReader - 1);
      updateReaderCarousel();
    }

    if (readerNext) readerNext.addEventListener('click', nextReader);
    if (readerPrev) readerPrev.addEventListener('click', prevReader);

    readerCards.forEach((card, index) => {
      card.addEventListener('click', function (e) {
        if (index !== currentReader) {
          e.preventDefault();
        }
        currentReader = index;
        updateReaderCarousel();
      });
    });

    readerDots.forEach((dot, index) => {
      dot.addEventListener('click', function () {
        currentReader = index;
        updateReaderCarousel();
      });
    });

    // Touch screens: swipe the carousel left or right to browse readers.
    const readerStage = document.querySelector('.reader-stage');
    if (readerStage) {
      let swipeStartX = null;
      let swipeStartY = 0;
      readerStage.addEventListener('touchstart', function (event) {
        swipeStartX = event.touches[0].clientX;
        swipeStartY = event.touches[0].clientY;
      }, { passive: true });
      readerStage.addEventListener('touchend', function (event) {
        if (swipeStartX === null) return;
        const dx = event.changedTouches[0].clientX - swipeStartX;
        const dy = event.changedTouches[0].clientY - swipeStartY;
        swipeStartX = null;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) nextReader(); else prevReader();
        }
      }, { passive: true });
    }

    updateReaderCarousel();
  }

  // Prevent "#" navigation if any leftover anchors exist.
  navItems.forEach((item) => {
    if ((item.getAttribute('href') || '') === '#') {
      item.addEventListener('click', (e) => e.preventDefault());
    }
  });

  logoutForms.forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      openLogoutModal(form);
    });
  });

  // The interface language (English / Tagalog) lives in the Profile menu so it
  // does not take a place in the portrait navigation bar.
  profileMenus.forEach(({ popover }, index) => {
    if (popover.querySelector('.sidebar-profile-language') || !window.KoobdI18n) return;
    const current = window.KoobdI18n.lang;
    const languageMenu = document.createElement('div');
    languageMenu.className = 'sidebar-profile-language';
    const label = document.createElement('span');
    label.className = 'sidebar-profile-language-label';
    label.id = `sidebarLanguageLabel${index + 1}`;
    label.textContent = 'Change Language';
    const group = document.createElement('div');
    group.className = 'sidebar-language';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-labelledby', label.id);
    [['en', 'EN', 'English'], ['tl', 'TL', 'Tagalog']].forEach(([code, short, name]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sidebar-lang-btn' + (code === current ? ' is-active' : '');
      button.dataset.lang = code;
      button.textContent = short;
      button.title = name;
      button.setAttribute('aria-label', name);
      button.setAttribute('aria-pressed', code === current ? 'true' : 'false');
      button.setAttribute('translate', 'no');
      button.addEventListener('click', () => window.KoobdI18n.setLang(code));
      group.appendChild(button);
    });
    languageMenu.append(label, group);
    popover.insertBefore(languageMenu, popover.firstChild);
  });
})();
