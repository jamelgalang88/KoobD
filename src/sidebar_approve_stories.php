<?php if (isset($user) && koobdIsTeacher($user)): ?>
  <a href="approve_stories.php" class="sidebar-link sidebar-link-approve-stories" aria-label="Approve Stories">
    <div class="sidebar-icon-box">
      <svg class="sidebar-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v14l-3.5-2-3.5 2-3.5-2L6.5 20 3.5 18V6A1.5 1.5 0 0 1 5 4.5z"/><path d="m8 11 2.5 2.5L16 8"/></svg>
    </div>
  </a>
<?php endif; ?>
