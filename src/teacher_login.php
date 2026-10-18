<?php
require_once('teacher_auth.php');
$leftMascot = 'assets/images/characters/CUBEBOT.png';
$rightMascot = 'assets/images/characters/WATER MAIN.png';

$existingTeacher = koobdTeacherCurrentUser();
if ($existingTeacher) {
    header("Location: " . koobdTeacherProfileRedirectPath($existingTeacher));
    exit();
}

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $email = $_POST['email'] ?? '';
    $password = $_POST['password'] ?? '';

    // Checked against the stored hash (koobdFindLogin, auth.php).
    $teacher = koobdFindLogin(trim($email), $password, 'teacher');

    if ($teacher) {
        session_regenerate_id(true);
        koobdTeacherSessionFromRow($teacher);
        header("Location: " . koobdTeacherProfileRedirectPath($teacher));
        exit();
    }

    $error = "Invalid teacher email or password.";
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script src="<?= koobdAsset('js/i18n-tl.js') ?>"></script>
  <script src="<?= koobdAsset('js/i18n.js') ?>"></script>
  <script src="<?= koobdAsset('js/performance-mode.js') ?>"></script>
  <link rel="stylesheet" href="<?= koobdAsset('css/scrollbar.css') ?>">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KoobD - Teacher Login</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/koobd-ui.css') ?>">
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
<body class="auth-bg auth-login-page">
  <main class="auth-scene" aria-label="Teacher login">
    <section class="auth-stage">
      <div class="auth-pattern auth-pattern-diamond"></div>
      <div class="auth-pattern auth-pattern-star auth-pattern-star-left"></div>
      <div class="auth-pattern auth-pattern-circle auth-pattern-circle-right"></div>
      <div class="auth-pattern auth-pattern-circle auth-pattern-circle-bottom"></div>

      <img class="auth-mascot auth-mascot-left" src="<?= htmlspecialchars($leftMascot) ?>" alt="" aria-hidden="true">
      <img class="auth-mascot auth-mascot-right" src="<?= htmlspecialchars($rightMascot) ?>" alt="" aria-hidden="true">

      <div class="auth-shell">
        <div class="auth-card">
          <div class="auth-role-switch" aria-label="Choose account type">
            <a class="auth-role-pill" href="log.php">Student</a>
            <a class="auth-role-pill is-active" href="teacher_login.php">Teacher</a>
          </div>

          <div class="auth-title">
            <div class="auth-brandmark">
              <div class="auth-infinity">
                <img src="assets/images/icons/LOGO 1.png" alt="KoobD logo">
              </div>
            </div>
            <div class="auth-h1">TEACHER LOGIN</div>
            <div class="auth-subtitle">Manage classroom cards and view student reading progress from the teacher side.</div>
          </div>

          <form action="" method="post" class="auth-form" aria-label="Teacher login form">
            <input class="auth-input" type="email" name="email" placeholder="Teacher email" autocomplete="email" required>
            <input class="auth-input" type="password" name="password" placeholder="Password" autocomplete="current-password" required>

            <?php if (!empty($error)) : ?>
              <div class="auth-error"><?php echo htmlspecialchars($error); ?></div>
            <?php endif; ?>

            <div class="auth-actions-row">
              <button type="submit" class="auth-btn primary">LOGIN</button>
              <a class="auth-btn" href="teacher_register.php">REGISTER</a>
            </div>
          </form>

          <div class="auth-switch">
            Need a teacher account? <a href="teacher_register.php">Register here</a>
          </div>
        </div>
      </div>
    </section>
  </main>
</body>
</html>
