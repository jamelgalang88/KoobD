<?php
$sidebarLastRead = isset($user['id']) ? koobdLastReadStoryDetails((int)$user['id']) : null;
$sidebarLastReadDetails = $sidebarLastRead['details'] ?? [];
$sidebarLastReadTitle = trim((string)($sidebarLastReadDetails['title'] ?? ''));
$sidebarLastReadHref = (string)($sidebarLastReadDetails['href'] ?? 'home.php');
$sidebarLastReadProgress = isset($sidebarLastRead['progress'])
  ? max(0, min(100, (int)$sidebarLastRead['progress']))
  : null;
$sidebarLastReadDescription = trim((string)($sidebarLastReadDetails['description'] ?? ''));
$sidebarLastReadLesson = trim((string)($sidebarLastReadDetails['lesson'] ?? ''));
?>
<div class="sidebar-lastread-wrap">
  <a
    href="<?= htmlspecialchars($sidebarLastReadHref, ENT_QUOTES, 'UTF-8') ?>"
    class="sidebar-link sidebar-link-lastread"
    aria-label="<?= htmlspecialchars($sidebarLastReadTitle !== '' ? 'Last Read: ' . $sidebarLastReadTitle : 'Last Read', ENT_QUOTES, 'UTF-8') ?>"
    <?= $sidebarLastRead ? 'data-last-read-href' : '' ?>
  >
    <div class="sidebar-icon-box">
      <svg class="sidebar-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 2.64-6.36"/><path d="M3 4v4h4"/><path d="M12 7v5l3 2"/></svg>
    </div>
  </a>
  <section class="sidebar-lastread-preview story-details-card" aria-label="Last Read story preview" tabindex="-1">
    <div class="story-details-hero<?= empty($sidebarLastReadDetails['cover']) ? ' no-cover' : '' ?>">
      <?php if (!empty($sidebarLastReadDetails['cover'])): ?>
        <img class="story-details-cover" src="<?= htmlspecialchars((string)$sidebarLastReadDetails['cover'], ENT_QUOTES, 'UTF-8') ?>" alt="" loading="lazy">
      <?php endif; ?>
      <span class="sidebar-lastread-label">LAST READ</span>
      <div class="story-details-hero-copy">
        <?php if ($sidebarLastReadTitle !== ''): ?>
          <span class="story-mode-badge is-<?= ($sidebarLastReadDetails['mode'] ?? '') === 'platform' ? 'platform' : 'story' ?>">
            <?php if (($sidebarLastReadDetails['mode'] ?? '') === 'platform'): ?>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9h12a4 4 0 014 4v1a3 3 0 01-5.4 1.8L15 14H9l-1.6 1.8A3 3 0 012 14v-1a4 4 0 014-4zM8 11v3M6.5 12.5h3M16 12h.01M18 13.5h.01"/></svg>
              <span>Platform Mode</span>
            <?php else: ?>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/></svg>
              <span>Story Mode</span>
            <?php endif; ?>
          </span>
        <?php endif; ?>
        <h2 class="story-details-title" translate="no"><?= htmlspecialchars($sidebarLastReadTitle !== '' ? $sidebarLastReadTitle : 'No recent story', ENT_QUOTES, 'UTF-8') ?></h2>
        <?php if ($sidebarLastRead): ?>
          <div class="story-details-actions">
            <a class="story-details-play" href="<?= htmlspecialchars($sidebarLastReadHref, ENT_QUOTES, 'UTF-8') ?>">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>
              <span><?= htmlspecialchars((string)($sidebarLastReadDetails['play'] ?? 'Continue Reading'), ENT_QUOTES, 'UTF-8') ?></span>
            </a>
            <?php if (!empty($sidebarLastReadDetails['alt-href'])): ?>
              <a class="story-details-alt" href="<?= htmlspecialchars((string)$sidebarLastReadDetails['alt-href'], ENT_QUOTES, 'UTF-8') ?>">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v5h5M4.6 14a8 8 0 102-8.4L4 10"/></svg>
                <span><?= htmlspecialchars((string)($sidebarLastReadDetails['alt-label'] ?? 'Restart'), ENT_QUOTES, 'UTF-8') ?></span>
              </a>
            <?php endif; ?>
            <span class="story-details-fav sidebar-lastread-favorite" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.4-9.3C1.2 7.7 3.3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3.1 1.7-2 3.2-3.1 5.3-3.1 3.4 0 5.5 3.2 4.1 6.7-1.9 4.7-9.4 9.3-9.4 9.3z"/></svg>
            </span>
          </div>
        <?php endif; ?>
      </div>
    </div>
    <div class="story-details-body">
      <?php if ($sidebarLastReadTitle !== ''): ?>
        <p class="story-details-creator"><?= htmlspecialchars((string)($sidebarLastReadDetails['creator'] ?? ''), ENT_QUOTES, 'UTF-8') ?></p>
        <?php if ($sidebarLastReadProgress !== null): ?>
          <div class="story-details-progress">
            <span class="story-details-progress-label">Your progress</span>
            <span class="story-details-progress-bar"><span style="width:<?= $sidebarLastReadProgress ?>%"></span></span>
            <span class="story-details-progress-text"><?= $sidebarLastReadProgress ?>%</span>
          </div>
        <?php endif; ?>
      <?php endif; ?>
      <p class="story-details-description"><?= htmlspecialchars($sidebarLastReadDescription !== '' ? $sidebarLastReadDescription : 'Your latest story will appear here after you start reading.', ENT_QUOTES, 'UTF-8') ?></p>
      <?php if ($sidebarLastReadLesson !== ''): ?>
        <div class="story-details-lesson">
          <span class="story-details-lesson-label">Lesson</span>
          <p><?= htmlspecialchars($sidebarLastReadLesson, ENT_QUOTES, 'UTF-8') ?></p>
        </div>
      <?php endif; ?>
    </div>
  </section>
</div>
