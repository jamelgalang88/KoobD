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
require_once __DIR__ . '/missions_lib.php';
require_once __DIR__ . '/achievements_lib.php';
if (!$isTeacher) {
    koobdMissionRecord($user, 'profile');
    $journeyOverview = koobdMissionOverview($user);
    $missionUnlocks = $journeyOverview['unlocks'];
} else {
    $journeyOverview = koobdMissionOverview($user);
    $missionUnlocks = [];
}
$achievementOverview = koobdAchievementOverview($user, $journeyOverview);
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
// Edit Banner: the character's colours, a plain colour, a gradient, or a picture of their
// own. A picture that is replaced or no longer used is deleted.
$banner = koobdProfileBanner($user);
$bannerError = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'update_banner') {
    $choice = (string)($_POST['banner_choice'] ?? 'default');
    $saved = null;
    if ($choice === 'color') {
        $color = strtolower(trim((string)($_POST['banner_color'] ?? '')));
        $saved = preg_match('/^#[0-9a-f]{6}$/', $color) ? 'color:' . $color : null;
        if ($saved === null) $bannerError = 'Choose a colour for your banner.';
    } elseif ($choice === 'gradient') {
        $from = strtolower(trim((string)($_POST['banner_from'] ?? '')));
        $to = strtolower(trim((string)($_POST['banner_to'] ?? '')));
        $angle = (int)($_POST['banner_angle'] ?? 135);
        $valid = preg_match('/^#[0-9a-f]{6}$/', $from) && preg_match('/^#[0-9a-f]{6}$/', $to) && in_array($angle, [45, 90, 135, 180], true);
        $saved = $valid ? "gradient:{$from},{$to},{$angle}" : null;
        if ($saved === null) $bannerError = 'Choose two colours for your gradient.';
    } elseif ($choice === 'image') {
        $file = $_FILES['banner_image'] ?? ['error' => UPLOAD_ERR_NO_FILE];
        if ((int)($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            // Keeping the picture they already have.
            $saved = $banner['type'] === 'image' ? $banner['value'] : null;
            if ($saved === null) $bannerError = 'Choose a picture for your banner.';
        } else {
            $uploaded = koobdUploadProfileBanner($file, $userId);
            if (str_starts_with($uploaded, '!')) $bannerError = substr($uploaded, 1);
            else $saved = $uploaded;
        }
    } else {
        $saved = '';
    }
    if ($bannerError === '' && $saved !== null) {
        $stmt = $conn->prepare("UPDATE users SET profile_banner = ? WHERE id = ?");
        $stored = $saved === '' ? null : $saved;
        if ($choice === 'image' && $stored !== null) {
            // The part of the picture they chose to show (dragged and zoomed).
            $framing = koobdBannerFraming((string)($_POST['banner_framing'] ?? ''));
            $stored .= '#' . $framing['x'] . ',' . $framing['y'] . ',' . $framing['zoom'];
        }
        $stmt->bind_param('si', $stored, $userId);
        $stmt->execute();
        $stmt->close();
        if ($banner['type'] === 'image' && $banner['value'] !== $saved) {
            @unlink(__DIR__ . '/' . $banner['value']);
        }
        header('Location: profile.php?banner=1');
        exit();
    }
}
$bannerUpdated = isset($_GET['banner']);
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
<body class="app-bg profile-page<?= $isTeacher ? ' is-teacher-profile' : '' ?>">
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
            <a href="home.php" class="sidebar-link" aria-label="Home">
              <div class="sidebar-icon-box">
                <img src="assets/images/icons/HOME 1.png" alt="">
              </div>
            </a>

            <a href="<?= htmlspecialchars($classroomPath) ?>" class="sidebar-link" aria-label="Classroom">
              <div class="sidebar-icon-box">
                <img src="assets/images/icons/classroom 1.png" alt="">
              </div>
            </a>
            <a href="teacher_stories.php" class="sidebar-link sidebar-link-stories" aria-label="My Stories">
              <div class="sidebar-icon-box">
                <svg class="sidebar-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H19v-5"/><path d="M8.5 7.5h6M8.5 11h4"/></svg>
              </div>
            </a>
            <?php include __DIR__ . '/sidebar_approve_stories.php'; ?>
            <?php include __DIR__ . '/sidebar_last_read.php'; ?>
            <a href="versus.php" class="sidebar-link sidebar-link-versus" aria-label="Versus Mode">
              <div class="sidebar-icon-box">
                <svg class="sidebar-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 6h9A5.5 5.5 0 0 1 22 11.5v1.5a4 4 0 0 1-7.2 2.4L14 14.5h-4l-.8.9A4 4 0 0 1 2 13v-1.5A5.5 5.5 0 0 1 7.5 6z"/><path d="M6 10v4M4 12h4"/><circle cx="16" cy="11" r=".6"/><circle cx="18" cy="13" r=".6"/></svg>
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
            <span class="sidebar-profile-visible-name" translate="no"><?= htmlspecialchars($profile['name']) ?></span>
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
        <?php if ($bannerUpdated): ?>
          <div class="pf-notice" role="status">Your banner was saved.</div>
        <?php endif; ?>
        <?php // Header: a cover band in the reader's colours, their character, name and numbers. ?>
        <section class="pf-header pf-card" style="--profile-top:<?= htmlspecialchars($profile['top']) ?>; --profile-bottom:<?= htmlspecialchars($profile['bottom']) ?>;">
          <?php // The banner: the character's colours, a colour, or their own picture (tap it to see all of it). ?>
          <div class="pf-cover<?= $banner['type'] === 'image' ? ' has-image' : '' ?>"<?= in_array($banner['type'], ['color', 'gradient'], true) ? ' style="--pf-banner-color:' . htmlspecialchars($banner['value']) . '"' : '' ?>>
            <?php if ($banner['type'] === 'image'): ?>
              <button type="button" class="pf-cover-view" data-view-image="<?= htmlspecialchars($banner['value']) ?>" data-view-alt="Your banner" aria-label="View your banner">
                <img src="<?= htmlspecialchars($banner['value']) ?>" alt="" decoding="async" style="<?= htmlspecialchars(koobdBannerFramingStyle($banner['framing'])) ?>">
              </button>
            <?php endif; ?>
            <button type="button" class="pf-cover-edit" id="pfEditBanner" aria-haspopup="dialog" aria-controls="pfBannerModal">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3v13H4zM12 17a4 4 0 100-8 4 4 0 000 8z"/></svg>
              <span>Edit Banner</span>
            </button>
          </div>
          <div class="pf-header-body">
            <button type="button" class="pf-avatar" data-view-image="<?= htmlspecialchars($profile['asset']) ?>" data-view-alt="<?= htmlspecialchars($characterName) ?>" data-view-kind="character" aria-label="View <?= htmlspecialchars($characterName) ?>">
              <img src="<?= htmlspecialchars($profile['asset']) ?>" alt="<?= htmlspecialchars($characterName) ?>">
            </button>
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
          <div class="pf-side">
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
          </div>

          <div class="pf-main">
          <?php if (!$isTeacher): ?>
          <?php if (!empty($missionUnlocks['learning_tools'])): ?>
          <?php // Learning tools: the Dictionary and Writing Practice, side by side. ?>
          <section class="pf-tools" aria-labelledby="pfToolsTitle">
            <h2 class="pf-section-title" id="pfToolsTitle">Learning tools</h2>
            <div class="pf-tools-grid">
          <?php // Dictionary: look up a word straight from here (dictionary.php). ?>
          <section class="pf-dict pf-card" aria-labelledby="pfDictTitle">
            <div class="pf-dict-head">
              <span class="pf-dict-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/></svg></span>
              <div>
                <h2 class="pf-card-title" id="pfDictTitle">Dictionary</h2>
              </div>
              <a class="pf-tool-link" href="dictionary.php"><span>Open Dictionary</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
            </div>
            <form class="pf-dict-form" action="dictionary.php" method="get" role="search">
              <input type="search" name="q" maxlength="40" placeholder="Type a word" aria-label="Word to look up" autocomplete="off" enterkeyhint="search" spellcheck="false">
              <select name="from" aria-label="Language of the word">
                <option value="en">English</option>
                <option value="tl">Tagalog</option>
              </select>
              <button type="submit" class="pf-dict-go">Look up</button>
            </form>
          </section>

          <?php // Writing Practice: the latest notepads, and a way in (writing.php). ?>
          <?php
          $writingStmt = $conn->prepare("SELECT id, title, lang, kind, challenge_status FROM writing_notes WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 2");
          $writingUserId = (int)$user['id'];
          $writingStmt->bind_param('i', $writingUserId);
          $writingStmt->execute();
          $writingRecent = $writingStmt->get_result()->fetch_all(MYSQLI_ASSOC);
          $writingStmt->close();
          ?>
          <section class="pf-dict pf-card pf-writing" aria-labelledby="pfWritingTitle">
            <div class="pf-dict-head">
              <span class="pf-dict-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></span>
              <div>
                <h2 class="pf-card-title" id="pfWritingTitle">Writing Practice</h2>
              </div>
            </div>
            <?php if ($writingRecent): ?>
              <ul class="pf-writing-list">
                <?php foreach ($writingRecent as $writingNote): ?>
                  <li>
                    <a href="writing.php?note=<?= (int)$writingNote['id'] ?>">
                      <span class="pf-writing-lang is-<?= $writingNote['lang'] === 'tl' ? 'tl' : 'en' ?>"><?= $writingNote['lang'] === 'tl' ? 'TL' : 'EN' ?></span>
                      <span class="pf-writing-title" translate="no"><?= htmlspecialchars($writingNote['title'] ?: 'Untitled notepad') ?></span>
                      <?php if ($writingNote['kind'] === 'challenge'): ?><span class="pf-writing-kind">Challenge</span><?php endif; ?>
                    </a>
                  </li>
                <?php endforeach; ?>
              </ul>
            <?php else: ?>
              <p class="pf-tool-empty">No notepads yet.</p>
            <?php endif; ?>
            <div class="pf-tool-foot">
              <a class="pf-dict-go pf-writing-go" href="writing.php<?= $writingRecent ? '' : '?new=1' ?>"><?= $writingRecent ? 'Open notepads' : 'New notepad' ?></a>
              <a class="pf-tool-link" href="writing.php?challenge=1"><span>Writing challenge</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
            </div>
          </section>
            </div>
          </section>
          <?php else: ?>
          <section class="pf-tools pf-tools-locked" aria-labelledby="pfToolsTitle">
            <h2 class="pf-section-title" id="pfToolsTitle">Learning tools</h2>
            <div class="pf-tools-lock-card">
              <span class="pf-tools-lock-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>
              <div><strong>Learning tools are locked</strong><p>Start and finish a story in the Reading and Understanding stage to unlock Dictionary and Writing Practice.</p><a href="home.php#goalsMissions">View your journey</a></div>
            </div>
          </section>
          <?php endif; ?>
          <?php endif; ?>

          <?php // Minigames: the way in (minigames.php). ?>
          <?php if (!$isTeacher): ?>
          <?php if (!empty($missionUnlocks['minigames'])): ?>
          <a class="pf-games" href="minigames.php">
            <span class="pf-games-art" aria-hidden="true"><span>A</span><span>B</span><span>C</span></span>
            <span class="pf-games-text"><strong>Minigames</strong><small>6 games to play</small></span>
            <span class="pf-games-go">Play<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
          </a>
          <?php else: ?>
          <div class="pf-games is-locked" aria-disabled="true">
            <span class="pf-games-art pf-games-lock-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>
            <span class="pf-games-text"><strong>Minigames</strong><small>Unlock after you complete a Versus match</small></span>
            <span class="pf-games-go">Locked</span>
          </div>
          <?php endif; ?>
          <?php endif; ?>
          </div>

          <section class="pf-achievements pf-card" id="achievements" aria-labelledby="pfAchievementsTitle">
            <div class="pf-achievements-head">
              <div class="pf-achievements-title">
                <span class="pf-achievements-title-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="m12 3 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z"/><path d="m9 12 2 2 4-4"/></svg>
                </span>
                <div>
                  <h2 class="pf-card-title" id="pfAchievementsTitle">Achievements &amp; Medals</h2>
                  <p><?= $isTeacher ? 'A record of the classrooms you lead and the students you support.' : 'Every medal celebrates a step in your learning adventure.' ?></p>
                </div>
              </div>
              <div class="pf-achievements-total">
                <strong><?= (int)$achievementOverview['earned_count'] ?><span>/<?= (int)$achievementOverview['total_count'] ?></span></strong>
                <span>medals · <?= (int)$achievementOverview['completion_percent'] ?>%</span>
              </div>
            </div>
            <div class="pf-achievements-progress" role="progressbar" aria-label="Achievement collection progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="<?= (int)$achievementOverview['completion_percent'] ?>">
              <span style="width:<?= (int)$achievementOverview['completion_percent'] ?>%"></span>
            </div>

            <div class="pf-achievements-recent">
              <div class="pf-achievements-recent-head">
                <h3>Recently Earned</h3>
                <span><?= count($achievementOverview['recent']) ?> latest</span>
              </div>
              <?php if ($achievementOverview['recent']): ?>
                <div class="pf-achievements-recent-list">
                  <?php foreach ($achievementOverview['recent'] as $achievement): ?>
                    <article class="pf-achievement-recent">
                      <?= koobdAchievementMedalSvg($achievement) ?>
                      <div>
                        <strong><?= htmlspecialchars($achievement['title']) ?></strong>
                        <time datetime="<?= htmlspecialchars(date('c', strtotime($achievement['earned_at']))) ?>"><?= htmlspecialchars(date('M j, Y · g:i A', strtotime($achievement['earned_at']))) ?></time>
                      </div>
                    </article>
                  <?php endforeach; ?>
                </div>
              <?php else: ?>
                <p class="pf-achievements-empty">Your medals will appear here as you reach new milestones.</p>
              <?php endif; ?>
            </div>

            <div class="pf-achievement-categories">
              <?php foreach ($achievementOverview['categories'] as $categoryKey => $categoryTitle): ?>
                <?php
                  $categoryMedals = $achievementOverview['groups'][$categoryKey] ?? [];
                  $categoryEarned = count(array_filter($categoryMedals, static fn(array $achievement): bool => $achievement['is_earned']));
                ?>
                <section class="pf-achievement-category" aria-labelledby="pfAchievementCategory-<?= htmlspecialchars($categoryKey) ?>">
                  <div class="pf-achievement-category-head">
                    <h3 id="pfAchievementCategory-<?= htmlspecialchars($categoryKey) ?>"><?= htmlspecialchars($categoryTitle) ?></h3>
                    <span><?= $categoryEarned ?> / <?= count($categoryMedals) ?> earned</span>
                  </div>
                  <div class="pf-achievement-grid">
                    <?php foreach ($categoryMedals as $achievement): ?>
                      <article class="pf-achievement-medal <?= $achievement['is_earned'] ? 'is-earned' : 'is-locked' ?>" data-category="<?= htmlspecialchars($achievement['category']) ?>" data-rarity="<?= htmlspecialchars($achievement['rarity']) ?>">
                        <div class="pf-achievement-medal-top">
                          <?= koobdAchievementMedalSvg($achievement) ?>
                          <span class="pf-achievement-rarity is-<?= htmlspecialchars($achievement['rarity']) ?>"><?= ucfirst(htmlspecialchars($achievement['rarity'])) ?></span>
                        </div>
                        <div class="pf-achievement-medal-copy">
                          <h4><?= htmlspecialchars($achievement['title']) ?></h4>
                          <p><?= htmlspecialchars($achievement['description']) ?></p>
                        </div>
                        <?php if ($achievement['is_earned']): ?>
                          <div class="pf-achievement-earned">
                            <span class="pf-achievement-status is-earned"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>Earned</span>
                            <time datetime="<?= htmlspecialchars(date('c', strtotime($achievement['earned_at']))) ?>"><?= htmlspecialchars(date('M j, Y · g:i A', strtotime($achievement['earned_at']))) ?></time>
                          </div>
                        <?php else: ?>
                          <div class="pf-achievement-progress-copy">
                            <span class="pf-achievement-status">Locked</span>
                            <span><?= htmlspecialchars($achievement['progress_label']) ?></span>
                          </div>
                          <div class="pf-achievement-progress" role="progressbar" aria-label="<?= htmlspecialchars($achievement['title']) ?> progress" aria-valuemin="0" aria-valuemax="<?= (int)$achievement['target'] ?>" aria-valuenow="<?= (int)$achievement['progress'] ?>">
                            <span style="width:<?= (int)$achievement['progress_percent'] ?>%"></span>
                          </div>
                        <?php endif; ?>
                      </article>
                    <?php endforeach; ?>
                  </div>
                </section>
              <?php endforeach; ?>
            </div>
          </section>

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
                    </div>
                    <div class="profile-fav-body">
                      <span class="profile-fav-title" translate="no"><?= htmlspecialchars($story['title']) ?></span>
                      <span class="profile-fav-meta" translate="no"><?= htmlspecialchars($story['creator']) ?></span>
                      <?= koobdStoryModeBadge($story['mode']) ?>
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
  <?php // Edit Banner: the character's colours, a colour, a gradient, or a picture of their own. ?>
  <?php
  $bannerSwatches = ['#4f63d6', '#2f9e8f', '#e0614a', '#f2a93b', '#8e5bd6', '#d6538f', '#3d8bd9', '#2b3550'];
  $bannerChoice = $bannerError !== '' ? (string)($_POST['banner_choice'] ?? $banner['type']) : $banner['type'];
  if (!in_array($bannerChoice, ['default', 'color', 'gradient', 'image'], true)) $bannerChoice = 'default';
  $bannerColor = $banner['type'] === 'color' ? $banner['value'] : $bannerSwatches[0];
  if ($bannerError !== '' && preg_match('/^#[0-9a-f]{6}$/i', (string)($_POST['banner_color'] ?? ''))) $bannerColor = strtolower($_POST['banner_color']);
  $bannerFraming = $banner['framing'] ?? ['x' => 50, 'y' => 50, 'zoom' => 1];
  $bannerGradients = [['#4f63d6', '#16966e'], ['#72d9b4', '#3d8bd9'], ['#3d8bd9', '#8e5bd6'], ['#2f9e8f', '#a4efc5'], ['#f2a93b', '#e0614a'], ['#d6538f', '#8e5bd6'], ['#e0614a', '#d6538f'], ['#2b3550', '#4f63d6']];
  $bannerFrom = $banner['from'] ?? $bannerGradients[0][0];
  $bannerTo = $banner['to'] ?? $bannerGradients[0][1];
  $bannerAngle = $banner['angle'] ?? 135;
  ?>
  <div class="pf-modal<?= $bannerError !== '' ? ' is-open' : '' ?>" id="pfBannerModal" aria-hidden="<?= $bannerError !== '' ? 'false' : 'true' ?>">
    <form class="pf-modal-card pf-banner-form" method="post" action="profile.php" enctype="multipart/form-data" role="dialog" aria-modal="true" aria-labelledby="pfBannerTitle" novalidate>
      <input type="hidden" name="action" value="update_banner">
      <input type="hidden" name="banner_framing" id="pfBannerFraming" value="<?= $bannerFraming['x'] . ',' . $bannerFraming['y'] . ',' . $bannerFraming['zoom'] ?>">
      <header class="pf-banner-head">
        <div>
          <h2 class="pf-modal-title" id="pfBannerTitle">Edit banner</h2>
          <p class="pf-modal-copy">Choose how the top of your profile looks.</p>
        </div>
        <button type="button" class="pf-modal-close" data-close-banner aria-label="Close">&times;</button>
      </header>

      <?php // The cropper: the banner's exact shape is the bright frame; with a picture, the rest of it shows dimmed around the frame, and dragging moves it. ?>
      <div class="pf-cropper" id="pfBannerPreview" style="--profile-top:<?= htmlspecialchars($profile['top']) ?>; --profile-bottom:<?= htmlspecialchars($profile['bottom']) ?>;" role="img" aria-label="Banner preview">
        <img class="pf-cropper-image" alt="" hidden draggable="false">
        <div class="pf-cropper-frame" aria-hidden="true"></div>
      </div>
      <p class="pf-cropper-caption" id="pfBannerCaption">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/></svg>
        <span>Drag the picture to choose what shows inside the frame.</span>
      </p>

      <?php if ($bannerError !== ''): ?><p class="pf-banner-error" role="alert"><?= htmlspecialchars($bannerError) ?></p><?php endif; ?>

      <div class="pf-segmented" role="radiogroup" aria-label="Banner style">
        <label>
          <input type="radio" name="banner_choice" value="default"<?= $bannerChoice === 'default' ? ' checked' : '' ?>>
          <span><i class="pf-seg-dot is-default" style="--profile-top:<?= htmlspecialchars($profile['top']) ?>; --profile-bottom:<?= htmlspecialchars($profile['bottom']) ?>;"></i>Default</span>
        </label>
        <label>
          <input type="radio" name="banner_choice" value="color"<?= $bannerChoice === 'color' ? ' checked' : '' ?>>
          <span><i class="pf-seg-dot" id="pfBannerColorSwatch" style="background:<?= htmlspecialchars($bannerColor) ?>"></i>Colour</span>
        </label>
        <label>
          <input type="radio" name="banner_choice" value="gradient"<?= $bannerChoice === 'gradient' ? ' checked' : '' ?>>
          <span><i class="pf-seg-dot" id="pfBannerGradientSwatch" style="background:linear-gradient(<?= $bannerAngle ?>deg,<?= htmlspecialchars($bannerFrom) ?>,<?= htmlspecialchars($bannerTo) ?>)"></i>Gradient</span>
        </label>
        <label>
          <input type="radio" name="banner_choice" value="image"<?= $bannerChoice === 'image' ? ' checked' : '' ?>>
          <span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/></svg>
            Picture
          </span>
        </label>
      </div>

      <div class="pf-banner-panel" data-banner-panel="default"<?= $bannerChoice === 'default' ? '' : ' hidden' ?>>
        <p class="pf-banner-note">Uses the colours of your character. It changes with them when you change character.</p>
      </div>

      <div class="pf-banner-panel" data-banner-panel="color"<?= $bannerChoice === 'color' ? '' : ' hidden' ?>>
        <div class="pf-banner-row">
          <span class="pf-banner-label">Colour</span>
          <div class="pf-banner-colors">
            <?php foreach ($bannerSwatches as $swatch): ?>
              <button type="button" class="pf-banner-color<?= $swatch === $bannerColor ? ' is-selected' : '' ?>" data-banner-color="<?= $swatch ?>" style="background:<?= $swatch ?>" aria-label="Colour <?= $swatch ?>"></button>
            <?php endforeach; ?>
            <label class="pf-banner-custom" title="Any colour">
              <input type="color" name="banner_color" id="pfBannerColor" value="<?= htmlspecialchars($bannerColor) ?>" aria-label="Pick any colour">
            </label>
          </div>
        </div>
      </div>

      <div class="pf-banner-panel" data-banner-panel="gradient"<?= $bannerChoice === 'gradient' ? '' : ' hidden' ?>>
        <div class="pf-banner-row">
          <span class="pf-banner-label">Style</span>
          <div class="pf-banner-colors">
            <?php foreach ($bannerGradients as [$gradFrom, $gradTo]): ?>
              <button type="button" class="pf-banner-grad" data-banner-from="<?= $gradFrom ?>" data-banner-to="<?= $gradTo ?>" style="background:linear-gradient(135deg,<?= $gradFrom ?>,<?= $gradTo ?>)" aria-label="Gradient <?= $gradFrom ?> to <?= $gradTo ?>"></button>
            <?php endforeach; ?>
          </div>
        </div>
        <div class="pf-banner-row">
          <span class="pf-banner-label">Colours</span>
          <div class="pf-banner-picks">
            <input type="color" name="banner_from" id="pfBannerFrom" value="<?= htmlspecialchars($bannerFrom) ?>" aria-label="First colour">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            <input type="color" name="banner_to" id="pfBannerTo" value="<?= htmlspecialchars($bannerTo) ?>" aria-label="Second colour">
          </div>
        </div>
        <div class="pf-banner-row">
          <span class="pf-banner-label">Direction</span>
          <div class="pf-banner-angles" role="radiogroup" aria-label="Gradient direction">
            <?php foreach ([90 => 'Left to right', 135 => 'Diagonal down', 180 => 'Top to bottom', 45 => 'Diagonal up'] as $angleValue => $angleName): ?>
              <label title="<?= $angleName ?>">
                <input type="radio" name="banner_angle" value="<?= $angleValue ?>"<?= $bannerAngle === $angleValue ? ' checked' : '' ?> aria-label="<?= $angleName ?>">
                <span><svg viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(<?= $angleValue - 90 ?>deg)"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
              </label>
            <?php endforeach; ?>
          </div>
        </div>
      </div>

      <div class="pf-banner-panel" data-banner-panel="image"<?= $bannerChoice === 'image' ? '' : ' hidden' ?>>
        <div class="pf-banner-row">
          <span class="pf-banner-label">Picture</span>
          <label class="pf-banner-upload">
            <input type="file" name="banner_image" id="pfBannerFile" accept="image/jpeg,image/png,image/webp,image/gif">
            <span class="pf-btn">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/></svg>
              <span id="pfBannerUploadLabel"><?= $banner['type'] === 'image' ? 'Replace picture' : 'Upload picture' ?></span>
            </span>
            <span class="pf-banner-file" id="pfBannerFileName"><?= $banner['type'] === 'image' ? 'Current picture' : 'JPG, PNG, WebP or GIF · up to 8 MB' ?></span>
          </label>
        </div>
        <div class="pf-banner-row pf-banner-zoom-row" id="pfBannerZoomRow">
          <label class="pf-banner-label" for="pfBannerZoom">Zoom</label>
          <div class="pf-banner-zoom">
            <input type="range" id="pfBannerZoom" min="1" max="3" step="0.01" value="<?= $bannerFraming['zoom'] ?>">
            <output id="pfBannerZoomValue" for="pfBannerZoom"><?= number_format($bannerFraming['zoom'], 1) ?>×</output>
          </div>
          <button type="button" class="pf-banner-reset" id="pfBannerReset">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 108-8 8.2 8.2 0 00-5.7 2.3L4 8.5M4 4v4.5h4.5"/></svg>
            Reset
          </button>
        </div>
      </div>

      <footer class="pf-banner-foot">
        <button type="button" class="pf-btn" data-close-banner>Cancel</button>
        <button type="submit" class="pf-btn pf-btn-primary">Save banner</button>
      </footer>
    </form>
  </div>

  <?php // Picture viewer: the banner or the character, whole, over a darkened page. ?>
  <div class="pf-viewer" id="pfViewer" role="dialog" aria-modal="true" aria-label="Picture" hidden>
    <button type="button" class="pf-viewer-close" aria-label="Close">&times;</button>
    <img class="pf-viewer-image" alt="">
  </div>
  <script>
    (() => {
      // Edit Banner. The preview is a cropper: the frame has the banner's own
      // shape on this screen, so what is inside it is exactly what the banner
      // shows; with a picture, the rest of it shows dimmed around the frame.
      const modal = document.getElementById('pfBannerModal');
      if (!modal) return;
      document.body.appendChild(modal);
      const form = modal.querySelector('form');
      const stage = document.getElementById('pfBannerPreview');
      const frame = stage.querySelector('.pf-cropper-frame');
      const picture = stage.querySelector('.pf-cropper-image');
      const caption = document.getElementById('pfBannerCaption');
      const colorInput = document.getElementById('pfBannerColor');
      const colorSwatch = document.getElementById('pfBannerColorSwatch');
      const fromInput = document.getElementById('pfBannerFrom');
      const toInput = document.getElementById('pfBannerTo');
      const gradientSwatch = document.getElementById('pfBannerGradientSwatch');
      const fileInput = document.getElementById('pfBannerFile');
      const fileName = document.getElementById('pfBannerFileName');
      const uploadLabel = document.getElementById('pfBannerUploadLabel');
      const fileNameText = fileName.textContent;
      const uploadLabelText = uploadLabel.textContent;
      const zoomRow = document.getElementById('pfBannerZoomRow');
      const zoomInput = document.getElementById('pfBannerZoom');
      const zoomValue = document.getElementById('pfBannerZoomValue');
      const framingInput = document.getElementById('pfBannerFraming');
      const cover = document.querySelector('.pf-cover');
      const currentImage = <?= json_encode($banner['type'] === 'image' ? $banner['value'] : '') ?>;
      // What part of the picture shows: the point kept in view (% across and
      // down) and how far in. The page's banner is framed the same way.
      const saved = framingInput.value.split(',').map(Number);
      const savedFraming = { x: saved[0], y: saved[1], zoom: saved[2] };
      let framing = { ...savedFraming };
      let pickedUrl = '';
      let opener = null;
      let box = null; // the frame's place in the stage, in pixels

      const choice = () => form.querySelector('[name="banner_choice"]:checked')?.value || 'default';
      const showingPicture = () => choice() === 'image' && Boolean(pickedUrl || currentImage);

      // The frame: as wide as the stage allows (with a margin), in the shape of
      // the banner on this screen, centred.
      function layoutFrame() {
        const stageW = stage.clientWidth;
        const stageH = stage.clientHeight;
        if (!stageW || !stageH) return;
        const ratio = cover && cover.offsetWidth ? cover.offsetWidth / cover.offsetHeight : 1062 / 120;
        const margin = Math.max(16, Math.round(stageW * 0.04));
        let w = stageW - margin * 2;
        let h = w / ratio;
        if (h > stageH - margin * 2) { h = stageH - margin * 2; w = h * ratio; }
        box = { x: (stageW - w) / 2, y: (stageH - h) / 2, w, h };
        frame.style.left = `${box.x}px`;
        frame.style.top = `${box.y}px`;
        frame.style.width = `${w}px`;
        frame.style.height = `${h}px`;
      }

      // The picture covers the frame, scaled by the zoom; the chosen point (x%,
      // y%) of the picture lines up with the same point of the frame - the
      // same rule the page banner follows (object-position, then the zoom
      // about that point).
      function placePicture() {
        framingInput.value = `${framing.x.toFixed(2)},${framing.y.toFixed(2)},${framing.zoom.toFixed(2)}`;
        zoomInput.value = framing.zoom;
        zoomValue.textContent = `${framing.zoom.toFixed(1)}×`;
        if (!box || !picture.naturalWidth) return;
        const scale = Math.max(box.w / picture.naturalWidth, box.h / picture.naturalHeight) * framing.zoom;
        const w = picture.naturalWidth * scale;
        const h = picture.naturalHeight * scale;
        const left = box.x + (box.w - w) * framing.x / 100;
        const top = box.y + (box.h - h) * framing.y / 100;
        picture.style.width = `${w}px`;
        picture.style.height = `${h}px`;
        picture.style.transform = `translate(${left}px, ${top}px)`;
      }

      function render() {
        const kind = choice();
        modal.querySelectorAll('[data-banner-panel]').forEach((panel) => { panel.hidden = panel.dataset.bannerPanel !== kind; });
        const image = kind === 'image' ? (pickedUrl || currentImage) : '';
        stage.dataset.mode = image ? 'image' : (kind === 'image' ? 'empty' : kind);
        stage.style.setProperty('--pf-banner-color', colorInput.value);
        const angle = form.querySelector('[name="banner_angle"]:checked')?.value || 135;
        const gradient = `linear-gradient(${angle}deg,${fromInput.value},${toInput.value})`;
        stage.style.setProperty('--pf-banner-gradient', gradient);
        gradientSwatch.style.background = gradient;
        picture.hidden = !image;
        caption.hidden = !image;
        zoomRow.hidden = !image;
        if (image && picture.getAttribute('src') !== image) picture.src = image;
        colorSwatch.style.background = colorInput.value;
        modal.querySelectorAll('[data-banner-color]').forEach((button) => button.classList.toggle('is-selected', button.dataset.bannerColor === colorInput.value));
        modal.querySelectorAll('[data-banner-from]').forEach((button) => button.classList.toggle('is-selected', button.dataset.bannerFrom === fromInput.value && button.dataset.bannerTo === toInput.value));
        layoutFrame();
        placePicture();
      }
      picture.addEventListener('load', placePicture);
      window.addEventListener('resize', () => { if (modal.classList.contains('is-open')) { layoutFrame(); placePicture(); } });

      // Moving the picture by (dx, dy) screen pixels.
      const clampPct = (value) => Math.max(0, Math.min(100, value));
      function movePicture(dx, dy) {
        if (!box || !picture.naturalWidth) return;
        const scale = Math.max(box.w / picture.naturalWidth, box.h / picture.naturalHeight) * framing.zoom;
        const spareW = picture.naturalWidth * scale - box.w;
        const spareH = picture.naturalHeight * scale - box.h;
        if (spareW > 0.5) framing.x = clampPct(framing.x - (dx * 100) / spareW);
        if (spareH > 0.5) framing.y = clampPct(framing.y - (dy * 100) / spareH);
        placePicture();
      }
      let drag = null;
      stage.addEventListener('pointerdown', (event) => {
        if (!showingPicture()) return;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
        stage.setPointerCapture?.(event.pointerId);
        stage.classList.add('is-dragging');
        event.preventDefault();
      });
      stage.addEventListener('pointermove', (event) => {
        if (!drag || event.pointerId !== drag.id) return;
        movePicture(event.clientX - drag.x, event.clientY - drag.y);
        drag.x = event.clientX;
        drag.y = event.clientY;
      });
      const endDrag = () => { drag = null; stage.classList.remove('is-dragging'); };
      stage.addEventListener('pointerup', endDrag);
      stage.addEventListener('pointercancel', endDrag);
      // The arrow keys move it too, and the mouse wheel zooms.
      stage.tabIndex = 0;
      stage.addEventListener('keydown', (event) => {
        const steps = { ArrowLeft: [8, 0], ArrowRight: [-8, 0], ArrowUp: [0, 8], ArrowDown: [0, -8] };
        if (!steps[event.key] || !showingPicture()) return;
        event.preventDefault();
        movePicture(...steps[event.key]);
      });
      stage.addEventListener('wheel', (event) => {
        if (!showingPicture()) return;
        event.preventDefault();
        framing.zoom = Math.max(1, Math.min(3, framing.zoom - event.deltaY * 0.0015));
        placePicture();
      }, { passive: false });
      zoomInput.addEventListener('input', () => {
        framing.zoom = Math.max(1, Math.min(3, Number(zoomInput.value) || 1));
        placePicture();
      });
      document.getElementById('pfBannerReset').addEventListener('click', () => {
        framing = { x: 50, y: 50, zoom: 1 };
        placePicture();
      });

      form.addEventListener('change', (event) => { if (event.target !== fileInput) render(); });
      [colorInput, fromInput, toInput].forEach((input) => input.addEventListener('input', render));
      // Picking a colour or a picture also selects that kind of banner.
      const select = (kind) => { form.querySelector(`[name="banner_choice"][value="${kind}"]`).checked = true; };
      modal.querySelectorAll('[data-banner-color]').forEach((button) => button.addEventListener('click', () => {
        colorInput.value = button.dataset.bannerColor;
        select('color');
        render();
      }));
      modal.querySelectorAll('[data-banner-from]').forEach((button) => button.addEventListener('click', () => {
        fromInput.value = button.dataset.bannerFrom;
        toInput.value = button.dataset.bannerTo;
        render();
      }));
      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (file && file.size > 8 * 1024 * 1024) {
          fileInput.value = '';
          fileName.textContent = 'That picture is too big. Choose one under 8 MB.';
          fileName.classList.add('is-error');
          return;
        }
        if (!file) return;
        if (pickedUrl) URL.revokeObjectURL(pickedUrl);
        pickedUrl = URL.createObjectURL(file);
        fileName.textContent = file.name;
        fileName.classList.remove('is-error');
        uploadLabel.textContent = 'Replace picture';
        // A new picture starts centred.
        framing = { x: 50, y: 50, zoom: 1 };
        select('image');
        render();
      });

      const open = (trigger) => {
        opener = trigger || null;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('pf-modal-open');
        render();
        window.setTimeout(() => form.querySelector('[name="banner_choice"]:checked')?.focus(), 30);
      };
      const close = () => {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('pf-modal-open');
        // Unsaved changes are dropped: the next time it opens as saved.
        form.reset();
        fileName.textContent = fileNameText;
        fileName.classList.remove('is-error');
        uploadLabel.textContent = uploadLabelText;
        if (pickedUrl) URL.revokeObjectURL(pickedUrl);
        pickedUrl = '';
        framing = { ...savedFraming };
        opener?.focus();
      };
      document.getElementById('pfEditBanner')?.addEventListener('click', (event) => open(event.currentTarget));
      modal.querySelectorAll('[data-close-banner]').forEach((button) => button.addEventListener('click', close));
      modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal.classList.contains('is-open')) close(); });
      form.addEventListener('submit', () => { form.querySelector('[type="submit"]').disabled = true; });
      if (modal.classList.contains('is-open')) open(null);
    })();

    (() => {
      // The picture viewer: tap the banner picture or the character to see it
      // whole; tap anywhere, the x, or press Esc to close.
      const viewer = document.getElementById('pfViewer');
      if (!viewer) return;
      document.body.appendChild(viewer);
      const image = viewer.querySelector('img');
      let opener = null;
      const close = () => {
        if (viewer.hidden) return;
        viewer.hidden = true;
        document.body.classList.remove('pf-modal-open');
        image.removeAttribute('src');
        opener?.focus();
      };
      document.querySelectorAll('[data-view-image]').forEach((trigger) => trigger.addEventListener('click', () => {
        opener = trigger;
        image.src = trigger.dataset.viewImage;
        image.alt = trigger.dataset.viewAlt || '';
        viewer.classList.toggle('is-character', trigger.dataset.viewKind === 'character');
        viewer.hidden = false;
        document.body.classList.add('pf-modal-open');
        viewer.querySelector('.pf-viewer-close').focus();
      }));
      viewer.addEventListener('click', close);
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    })();
  </script>
  <script src="<?= koobdAsset('js/profile.js') ?>"></script>
</body>
</html>
