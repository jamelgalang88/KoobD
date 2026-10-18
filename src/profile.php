<?php
// The reader's profile (the profile card in the sidebar opens it): their
// character and details, a few numbers, a button to change their character,
// and the stories they marked as favourites (the heart in the story pop-up).
require_once('auth.php');
$user = koobdRequireAuth(true);
$userId = (int)$user['id'];
$username = $user['username'];
$profile = koobdResolvedProfile($user);
$isTeacher = koobdIsTeacher($user);
$classroomPath = 'classroom.php';
$profileEditPath = 'profile.php';
$characterName = koobdReaderProfileDefaults($profile['key'])['display'] ?? $profile['name'];

// Edit Profile: the account's details from the About card - the name shown on
// the profile, the username and the email (which signs them in, so changing it
// asks for the current password). The character has its own button.
$accountErrors = [];
$accountForm = [
    'name' => $profile['name'],
    'username' => $username,
    'email' => (string)($user['email'] ?? ''),
];
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'update_account') {
    $cut = static fn(string $text, int $max): string => function_exists('mb_substr') ? mb_substr($text, 0, $max) : substr($text, 0, $max);
    $length = static fn(string $text): int => function_exists('mb_strlen') ? mb_strlen($text) : strlen($text);
    $accountForm = [
        'name' => $cut(trim(preg_replace('/\s+/', ' ', (string)($_POST['display_name'] ?? ''))), 40),
        'username' => $cut(trim(preg_replace('/\s+/', ' ', (string)($_POST['username'] ?? ''))), 60),
        'email' => $cut(trim((string)($_POST['email'] ?? '')), 255),
    ];
    $currentPassword = (string)($_POST['current_password'] ?? '');

    if ($accountForm['name'] === '') {
        $accountErrors['display_name'] = 'Enter the name to show on your profile.';
    }
    if ($length($accountForm['username']) < 3) {
        $accountErrors['username'] = 'Your username needs at least 3 characters.';
    } else {
        $check = $conn->prepare("SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1");
        $check->bind_param('si', $accountForm['username'], $userId);
        $check->execute();
        if ($check->get_result()->fetch_assoc()) {
            $accountErrors['username'] = 'That username is already taken. Try another one.';
        }
        $check->close();
    }
    if (!filter_var($accountForm['email'], FILTER_VALIDATE_EMAIL)) {
        $accountErrors['email'] = 'Enter a valid email address.';
    } else {
        $check = $conn->prepare("SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1");
        $check->bind_param('si', $accountForm['email'], $userId);
        $check->execute();
        if ($check->get_result()->fetch_assoc()) {
            $accountErrors['email'] = 'Another account already uses that email.';
        }
        $check->close();
    }
    // Change password (optional): a new password of 8 to 72 characters, typed
    // twice, different from the current one.
    $newPassword = (string)($_POST['new_password'] ?? '');
    $confirmPassword = (string)($_POST['confirm_password'] ?? '');
    $passwordChanging = $newPassword !== '' || $confirmPassword !== '';
    if ($passwordChanging) {
        if (strlen($newPassword) < 8) {
            $accountErrors['new_password'] = 'Your new password needs at least 8 characters.';
        } elseif (strlen($newPassword) > 72) {
            $accountErrors['new_password'] = 'Your new password can be at most 72 characters.';
        } elseif (!hash_equals($newPassword, $confirmPassword)) {
            $accountErrors['confirm_password'] = 'The two new passwords do not match.';
        }
    }

    // The email signs them in, and the password protects the account: changing
    // either needs the current password, to confirm it is really them.
    $emailChanged = strcasecmp($accountForm['email'], (string)($user['email'] ?? '')) !== 0;
    if (($emailChanged && !isset($accountErrors['email'])) || $passwordChanging) {
        if (!koobdCheckPassword($user, $currentPassword)) {
            $accountErrors['current_password'] = $passwordChanging
                ? 'Enter your current password to change your password.'
                : 'Enter your current password to change your email.';
        } elseif ($passwordChanging && !isset($accountErrors['new_password']) && hash_equals($currentPassword, $newPassword)) {
            $accountErrors['new_password'] = 'Choose a password different from your current one.';
        }
    }

    if (!$accountErrors) {
        $update = $conn->prepare("UPDATE users SET profile_reader_name = ?, username = ?, email = ? WHERE id = ?");
        $update->bind_param('sssi', $accountForm['name'], $accountForm['username'], $accountForm['email'], $userId);
        $update->execute();
        $update->close();
        if ($passwordChanging) {
            // Only the hash is stored (auth.php).
            $hash = koobdHashPassword($newPassword);
            $savePassword = $conn->prepare("UPDATE users SET password = ? WHERE id = ?");
            $savePassword->bind_param('si', $hash, $userId);
            $savePassword->execute();
            $savePassword->close();
            session_regenerate_id(true);
        }
        $_SESSION['username'] = $accountForm['username'];
        header('Location: profile.php?updated=' . ($passwordChanging ? 'password' : '1'));
        exit();
    }
}
$accountUpdated = isset($_GET['updated']);
$passwordUpdated = ($_GET['updated'] ?? '') === 'password';
// The Change password section stays open when there is something in it to fix.
$passwordSectionOpen = isset($accountErrors['new_password']) || isset($accountErrors['confirm_password'])
    || (isset($accountErrors['current_password']) && (($_POST['new_password'] ?? '') !== '' || ($_POST['confirm_password'] ?? '') !== ''));
$favorites = koobdUserFavorites($userId);

// A few numbers about the reader.
$countOf = function (string $sql) use ($conn, $userId): int {
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_row();
    $stmt->close();
    return (int)($row[0] ?? 0);
};
$classroomCount = $isTeacher
    ? $countOf("SELECT COUNT(*) FROM classrooms WHERE teacher_id = ?")
    : $countOf("SELECT COUNT(*) FROM classroom_students WHERE student_user_id = ?");
$storyCount = $isTeacher
    ? $countOf("SELECT COUNT(*) FROM teacher_stories WHERE teacher_id = ?")
    : $countOf("SELECT COUNT(DISTINCT story_id) FROM story_progress WHERE user_id = ? AND progress >= 100");
$memberSince = !empty($user['created_at']) ? date('F Y', strtotime($user['created_at'])) : '';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <script src="<?= koobdAsset('js/i18n-tl.js') ?>"></script>
  <script src="<?= koobdAsset('js/i18n.js') ?>"></script>
  <script src="<?= koobdAsset('js/performance-mode.js') ?>"></script>
  <link rel="stylesheet" href="<?= koobdAsset('css/scrollbar.css') ?>">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KoobD - My Profile</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/app.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/profile.css') ?>">
  <link rel="icon" type="image/png" href="assets/images/icons/favicon.png">
  <?php // Installable as an app (manifest.webmanifest): opens without the address bar. ?>
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#f3f8ff">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="KoobD">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link rel="apple-touch-icon" href="assets/images/icons/app/apple-touch-icon.png">
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
</head>
<body class="app-bg profile-page">
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-inner">
        <div class="sidebar-top">
          <div class="sidebar-brand-mark">
            <img src="assets/images/logos/logo.png" alt="KoobD">
          </div>
          <div class="sidebar-brand-text">KoobD</div>
          <div class="sidebar-divider"></div>
          <nav class="sidebar-nav" aria-label="Main navigation">
            <a href="home.php" class="sidebar-link">
              <div class="sidebar-icon-box">
                <img src="assets/images/icons/HOME 1.png" alt="">
              </div>
            </a>

            <a href="<?= htmlspecialchars($classroomPath) ?>" class="sidebar-link">
              <div class="sidebar-icon-box">
                <img src="assets/images/icons/classroom 1.png" alt="">
              </div>
            </a>
            <a href="teacher_stories.php" class="sidebar-link sidebar-link-stories" aria-label="My Stories" title="My Stories">
              <div class="sidebar-icon-box">
                <svg class="sidebar-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H19v-5"/><path d="M8.5 7.5h6M8.5 11h4"/></svg>
              </div>
            </a>
            <a href="create_story.php" class="sidebar-link sidebar-link-add" aria-label="Create story">
              <div class="sidebar-icon-box sidebar-icon-add">+</div>
            </a>
          </nav>
        </div>

        <div class="sidebar-bottom">
          <div class="sidebar-account sidebar-profile-menu">
            <button type="button" class="sidebar-profile-link active" aria-haspopup="true" aria-expanded="false" aria-controls="sidebarProfileMenu" aria-label="Profile menu" title="Profile">
              <span
                class="sidebar-profile-card"
                style="--profile-top:<?= htmlspecialchars($profile['top']) ?>; --profile-bottom:<?= htmlspecialchars($profile['bottom']) ?>; --profile-accent:<?= htmlspecialchars($profile['accent']) ?>;"
              >
                <span class="sidebar-profile-avatar">
                  <img src="<?= htmlspecialchars($profile['asset']) ?>" alt="<?= htmlspecialchars($profile['name']) ?>">
                </span>
                <span class="sidebar-profile-name" translate="no"><?= htmlspecialchars($profile['name']) ?></span>
              </span>
              <span class="sidebar-user-text"><?= htmlspecialchars($username) ?></span>
            </button>
            <div class="sidebar-profile-popover" id="sidebarProfileMenu" hidden>
              <a href="<?= htmlspecialchars($profileEditPath) ?>" class="sidebar-profile-menu-item" aria-current="page">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
                <span>My Profile</span>
              </a>
              <form action="logout.php" method="post" class="sidebar-menu-logout-form">
                <button type="submit" class="sidebar-profile-menu-item is-logout">
                  <img src="assets/images/icons/LOGOUT 1.png" alt="">
                  <span>Log out</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <main class="main">
      <div class="main-inner profile-main">
        <?php if ($accountUpdated): ?>
          <div class="pf-notice" role="status"><?= $passwordUpdated ? 'Your profile details and new password were saved.' : 'Your profile details were saved.' ?></div>
        <?php endif; ?>
        <?php // Header: a cover band in the reader's colours, their character, name and numbers. ?>
        <section class="pf-header pf-card" style="--profile-top:<?= htmlspecialchars($profile['top']) ?>; --profile-bottom:<?= htmlspecialchars($profile['bottom']) ?>;">
          <div class="pf-cover" aria-hidden="true"></div>
          <div class="pf-header-body">
            <div class="pf-avatar">
              <img src="<?= htmlspecialchars($profile['asset']) ?>" alt="<?= htmlspecialchars($characterName) ?>">
            </div>
            <div class="pf-identity">
              <h1 class="pf-name">
                <span translate="no"><?= htmlspecialchars($profile['name']) ?></span>
                <span class="pf-role"><?= $isTeacher ? 'Teacher' : 'Student' ?></span>
              </h1>
              <p class="pf-handle">
                <span translate="no">@<?= htmlspecialchars($username) ?></span>
                <?php if ($memberSince !== ''): ?>
                  <span class="pf-dot" aria-hidden="true">&middot;</span>
                  <span>Member since <?= htmlspecialchars($memberSince) ?></span>
                <?php endif; ?>
              </p>
            </div>
            <div class="pf-actions">
              <button type="button" class="pf-btn pf-btn-primary" id="pfEditAccount" aria-haspopup="dialog" aria-controls="pfAccountModal">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>
                <span>Edit Profile</span>
              </button>
              <a class="pf-btn" href="reader.php?return=profile.php">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0113-6.2M17 14v6M14 17h6"/></svg>
                <span>Change Character</span>
              </a>
            </div>
          </div>
          <dl class="pf-stats">
            <div>
              <dt>Favorites</dt>
              <dd data-favorite-count id="profileFavoriteCount"><?= count($favorites) ?></dd>
            </div>
            <div>
              <dt><?= $isTeacher ? 'Classrooms' : 'Classes Joined' ?></dt>
              <dd><?= $classroomCount ?></dd>
            </div>
            <div>
              <dt><?= $isTeacher ? 'Stories Made' : 'Stories Finished' ?></dt>
              <dd><?= $storyCount ?></dd>
            </div>
          </dl>
        </section>

        <div class="pf-layout">
          <?php // About: the reader's details. ?>
          <aside class="pf-about pf-card">
            <div class="pf-about-head">
              <h2 class="pf-card-title">About</h2>
              <button type="button" class="pf-link-btn" data-open-account>Edit</button>
            </div>
            <ul class="pf-facts">
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0"/></svg>
                <div><span class="pf-fact-label">Name</span><span class="pf-fact-value" translate="no"><?= htmlspecialchars($profile['name']) ?></span></div>
              </li>
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 12a4 4 0 10-4 4M16 12v1.5a2.5 2.5 0 005 0V12a9 9 0 10-3.5 7.1"/></svg>
                <div><span class="pf-fact-label">Username</span><span class="pf-fact-value" translate="no"><?= htmlspecialchars($username) ?></span></div>
              </li>
              <?php if (!empty($user['email'])): ?>
                <li>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v12H3zM3 7l9 6 9-6"/></svg>
                  <div><span class="pf-fact-label">Email</span><span class="pf-fact-value" translate="no"><?= str_replace('@', '@<wbr>', htmlspecialchars($user['email'])) ?></span></div>
                </li>
              <?php endif; ?>
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z"/></svg>
                <div><span class="pf-fact-label">Character</span><span class="pf-fact-value" translate="no"><?= htmlspecialchars($characterName) ?></span></div>
              </li>
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9l9-5 9 5-9 5zM7 11.2V16c0 1.5 2.2 3 5 3s5-1.5 5-3v-4.8"/></svg>
                <div><span class="pf-fact-label">Role</span><span class="pf-fact-value"><?= $isTeacher ? 'Teacher' : 'Student' ?></span></div>
              </li>
              <?php if ($memberSince !== ''): ?>
                <li>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/></svg>
                  <div><span class="pf-fact-label">Member since</span><span class="pf-fact-value"><?= htmlspecialchars($memberSince) ?></span></div>
                </li>
              <?php endif; ?>
            </ul>
          </aside>

          <?php // Favourites: covers that open the story's pop-up; the × takes one out. ?>
          <section class="pf-favorites pf-card">
            <div class="pf-card-head">
              <h2 class="pf-card-title">My Favorites</h2>
              <span class="pf-card-count"><span data-favorite-count><?= count($favorites) ?></span> <span>saved</span></span>
            </div>
            <div class="profile-fav-empty<?= $favorites ? ' hidden' : '' ?>" id="profileFavoriteEmpty">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.4-9.3C1.2 7.7 3.3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3.1 1.7-2 3.2-3.1 5.3-3.1 3.4 0 5.5 3.2 4.1 6.7-1.9 4.7-9.4 9.3-9.4 9.3z"/></svg>
              <strong>No favorites yet</strong>
              <p>Open a story and tap the heart to keep it here.</p>
              <a class="pf-btn pf-btn-soft" href="home.php">Browse Stories</a>
            </div>
            <div class="profile-fav-grid" id="profileFavoriteGrid">
              <?php foreach ($favorites as $story): ?>
                <div class="profile-fav-item" data-fav-key="<?= htmlspecialchars($story['key']) ?>">
                  <a class="profile-fav-card" href="<?= htmlspecialchars($story['href']) ?>"<?= koobdStoryDetailsData([
                    'title' => $story['title'], 'href' => $story['href'], 'cover' => $story['cover'], 'mode' => $story['mode'],
                    'creator' => $story['creator'], 'description' => $story['description'], 'lesson' => $story['lesson'],
                    'key' => $story['key'],
                  ]) ?>>
                    <div class="profile-fav-cover<?= empty($story['cover']) ? ' no-cover' : '' ?>">
                      <?php if (!empty($story['cover'])): ?>
                        <img src="<?= htmlspecialchars($story['cover']) ?>" alt="" loading="lazy" decoding="async">
                      <?php endif; ?>
                      <?= koobdStoryModeBadge($story['mode']) ?>
                    </div>
                    <div class="profile-fav-body">
                      <span class="profile-fav-title" translate="no"><?= htmlspecialchars($story['title']) ?></span>
                      <span class="profile-fav-meta" translate="no"><?= htmlspecialchars($story['creator']) ?></span>
                    </div>
                  </a>
                  <button type="button" class="profile-fav-remove" data-remove-favorite aria-label="Remove from Favorites" title="Remove from Favorites">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
                  </button>
                </div>
              <?php endforeach; ?>
            </div>
          </section>
        </div>

        <div class="profile-fav-toast" id="profileFavoriteToast" role="status" aria-live="polite" hidden>
          <span>Removed from Favorites</span>
          <button type="button" id="profileFavoriteUndo">Undo</button>
        </div>
      </div>
    </main>
  </div>

  <script>
    window.KOOBD_SESSION = <?= json_encode([
      'role' => $isTeacher ? 'teacher' : 'student',
      'userId' => $userId,
      'username' => $username,
    ]) ?>;
  </script>
  <script src="<?= koobdAsset('js/sidebar.js') ?>"></script>
  <script src="<?= koobdAsset('js/story-details.js') ?>"></script>
  <?php // Edit Profile: the account's details. ?>
  <div class="pf-modal<?= $accountErrors ? ' is-open' : '' ?>" id="pfAccountModal" aria-hidden="<?= $accountErrors ? 'false' : 'true' ?>">
    <form class="pf-modal-card" method="post" action="profile.php" role="dialog" aria-modal="true" aria-labelledby="pfAccountTitle" novalidate>
      <input type="hidden" name="action" value="update_account">
      <button type="button" class="pf-modal-close" data-close-account aria-label="Close">&times;</button>
      <h2 class="pf-modal-title" id="pfAccountTitle">Edit profile</h2>
      <p class="pf-modal-copy">Your account details. To change how your character looks, use <strong>Change Character</strong>.</p>
      <?php $fieldError = static fn(string $key): string => isset($accountErrors[$key]) ? '<span class="pf-field-error" id="err-' . $key . '">' . htmlspecialchars($accountErrors[$key]) . '</span>' : ''; ?>
      <label class="pf-field<?= isset($accountErrors['display_name']) ? ' has-error' : '' ?>">
        <span class="pf-field-label">Name</span>
        <input type="text" name="display_name" maxlength="40" required autocomplete="nickname" value="<?= htmlspecialchars($accountForm['name']) ?>"<?= isset($accountErrors['display_name']) ? ' aria-invalid="true" aria-describedby="err-display_name"' : '' ?>>
        <span class="pf-field-hint">Shown on your profile card and in classrooms.</span>
        <?= $fieldError('display_name') ?>
      </label>
      <label class="pf-field<?= isset($accountErrors['username']) ? ' has-error' : '' ?>">
        <span class="pf-field-label">Username</span>
        <input type="text" name="username" maxlength="60" required autocomplete="username" value="<?= htmlspecialchars($accountForm['username']) ?>"<?= isset($accountErrors['username']) ? ' aria-invalid="true" aria-describedby="err-username"' : '' ?>>
        <?= $fieldError('username') ?>
      </label>
      <label class="pf-field<?= isset($accountErrors['email']) ? ' has-error' : '' ?>">
        <span class="pf-field-label">Email</span>
        <input type="email" name="email" maxlength="255" required autocomplete="email" value="<?= htmlspecialchars($accountForm['email']) ?>" data-original-email="<?= htmlspecialchars((string)($user['email'] ?? '')) ?>"<?= isset($accountErrors['email']) ? ' aria-invalid="true" aria-describedby="err-email"' : '' ?>>
        <span class="pf-field-hint">You sign in with this email.</span>
        <?= $fieldError('email') ?>
      </label>
      <section class="pf-password-box<?= $passwordSectionOpen ? ' is-open' : '' ?>" aria-labelledby="pfPasswordToggle">
        <button type="button" class="pf-password-toggle" id="pfPasswordToggle" aria-expanded="<?= $passwordSectionOpen ? 'true' : 'false' ?>" aria-controls="pfPasswordFields">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>
          <span>Change password</span>
          <span class="pf-password-chevron" aria-hidden="true"></span>
        </button>
        <div class="pf-password-fields" id="pfPasswordFields"<?= $passwordSectionOpen ? '' : ' hidden' ?>>
          <label class="pf-field<?= isset($accountErrors['new_password']) ? ' has-error' : '' ?>">
            <span class="pf-field-label">New password</span>
            <input type="password" name="new_password" minlength="8" maxlength="72" autocomplete="new-password"<?= isset($accountErrors['new_password']) ? ' aria-invalid="true" aria-describedby="err-new_password"' : ' aria-describedby="pfPasswordRule"' ?>>
            <span class="pf-field-hint" id="pfPasswordRule">At least 8 characters.</span>
            <?= $fieldError('new_password') ?>
          </label>
          <label class="pf-field<?= isset($accountErrors['confirm_password']) ? ' has-error' : '' ?>">
            <span class="pf-field-label">Confirm new password</span>
            <input type="password" name="confirm_password" maxlength="72" autocomplete="new-password"<?= isset($accountErrors['confirm_password']) ? ' aria-invalid="true" aria-describedby="err-confirm_password"' : '' ?>>
            <?= $fieldError('confirm_password') ?>
          </label>
          <label class="pf-show-passwords">
            <input type="checkbox" id="pfShowPasswords">
            <span>Show passwords</span>
          </label>
        </div>
      </section>
      <label class="pf-field pf-password-field<?= isset($accountErrors['current_password']) ? ' has-error' : '' ?>"<?= isset($accountErrors['current_password']) || $passwordSectionOpen ? '' : ' hidden' ?>>
        <span class="pf-field-label">Current password</span>
        <input type="password" name="current_password" autocomplete="current-password"<?= isset($accountErrors['current_password']) ? ' aria-invalid="true" aria-describedby="err-current_password"' : '' ?>>
        <span class="pf-field-hint" id="pfCurrentHint">Needed to change your email or password.</span>
        <?= $fieldError('current_password') ?>
      </label>
      <div class="pf-modal-facts">
        <span><strong>Role</strong> <?= $isTeacher ? 'Teacher' : 'Student' ?></span>
        <?php if ($memberSince !== ''): ?><span><strong>Member since</strong> <?= htmlspecialchars($memberSince) ?></span><?php endif; ?>
      </div>
      <div class="pf-modal-actions">
        <button type="button" class="pf-btn" data-close-account>Cancel</button>
        <button type="submit" class="pf-btn pf-btn-primary">Save changes</button>
      </div>
    </form>
  </div>
  <script>
    (() => {
      // Edit Profile (and the About card's Edit) open the account popup; it is
      // already open when the server sent it back with something to fix.
      const modal = document.getElementById('pfAccountModal');
      if (!modal) return;
      document.body.appendChild(modal);
      const form = modal.querySelector('form');
      const email = form.elements.email;
      const passwordField = modal.querySelector('.pf-password-field');
      let opener = null;
      const passwordBox = modal.querySelector('.pf-password-box');
      const passwordToggle = document.getElementById('pfPasswordToggle');
      const passwordFields = document.getElementById('pfPasswordFields');
      const newPassword = form.elements.new_password;
      const confirmPassword = form.elements.confirm_password;
      // The current password is asked for when the email or the password changes.
      const syncPassword = () => {
        const emailChanged = email.value.trim().toLowerCase() !== (email.dataset.originalEmail || '').toLowerCase();
        const passwordOpen = !passwordFields.hidden;
        passwordField.hidden = !emailChanged && !passwordOpen && !passwordField.classList.contains('has-error');
      };
      passwordToggle.addEventListener('click', () => {
        const opening = passwordFields.hidden;
        passwordFields.hidden = !opening;
        passwordBox.classList.toggle('is-open', opening);
        passwordToggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (!opening) {
          // Closing it cancels the change: nothing half-typed is sent.
          newPassword.value = '';
          confirmPassword.value = '';
        }
        syncPassword();
        if (opening) newPassword.focus();
      });
      document.getElementById('pfShowPasswords').addEventListener('change', (event) => {
        const type = event.target.checked ? 'text' : 'password';
        [newPassword, confirmPassword, form.elements.current_password].forEach((input) => { input.type = type; });
      });
      // The two new passwords are compared as they are typed.
      const checkMatch = () => {
        confirmPassword.setCustomValidity(confirmPassword.value && confirmPassword.value !== newPassword.value ? 'The two new passwords do not match.' : '');
      };
      newPassword.addEventListener('input', checkMatch);
      confirmPassword.addEventListener('input', checkMatch);
      const open = (trigger) => {
        opener = trigger || null;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('pf-modal-open');
        const first = modal.querySelector('[aria-invalid="true"]') || form.elements.display_name;
        window.setTimeout(() => first.focus(), 30);
      };
      const close = () => {
        // Passwords never stay behind in a closed popup.
        [newPassword, confirmPassword, form.elements.current_password].forEach((input) => { input.value = ''; });
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('pf-modal-open');
        opener?.focus();
      };
      document.querySelectorAll('#pfEditAccount, [data-open-account]').forEach((button) => button.addEventListener('click', () => open(button)));
      modal.querySelectorAll('[data-close-account]').forEach((button) => button.addEventListener('click', close));
      modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal.classList.contains('is-open')) close(); });
      email.addEventListener('input', syncPassword);
      form.addEventListener('submit', (event) => {
        if (!passwordFields.hidden && newPassword.value && confirmPassword.value !== newPassword.value) {
          event.preventDefault();
          confirmPassword.reportValidity();
          return;
        }
        form.querySelector('[type="submit"]').disabled = true;
      });
      if (modal.classList.contains('is-open')) open(null);
    })();
  </script>
  <script src="<?= koobdAsset('js/profile.js') ?>"></script>
</body>
</html>
