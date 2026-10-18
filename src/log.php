<?php
require_once('auth.php');
$leftMascot = 'assets/images/characters/CUBEBOT.png';
$rightMascot = 'assets/images/characters/WATER MAIN.png';

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $email = $_POST['email'] ?? '';
    $password = $_POST['password'] ?? '';

    // Checked against the stored hash                    (koobdFindLogin, auth.php).
    $row = koobdFindLogin(trim($email), $password, 'student');
    if ($row) {
        session_regenerate_id(true);
        koobdSessionUserFromRow($row);
        header("Location: " . koobdProfileRedirectPath($row));
        exit();
    }
    $error = "Invalid email or password.";
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
    <title>KoobD - Login</title>
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
  <main class="auth-scene" aria-label="Login">
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
            <a class="auth-role-pill is-active" href="log.php">Student</a>
            <a class="auth-role-pill" href="teacher_login.php">Teacher</a>
          </div>

          <div class="auth-title">
            <div class="auth-brandmark">
              <div class="auth-infinity">
                <img src="assets/images/icons/LOGO 1.png" alt="KoobD logo">
              </div>
            </div>
            <div class="auth-h1">USER LOGIN</div>
            <div class="auth-subtitle">Pick up your story and jump back into your reading world.</div>
          </div>

          <form action="" method="post" class="auth-form" aria-label="Login form">
            <input class="auth-input" type="email" name="email" placeholder="Email" autocomplete="email" required>
            <input class="auth-input" type="password" name="password" placeholder="Password" autocomplete="current-password" required>

            <div class="forgot-row">
              <span>Forgot Password?</span>
            </div>

            <?php if (!empty($error)) : ?>
              <div class="auth-error">
                <?php echo htmlspecialchars($error); ?>
              </div>
            <?php endif; ?>

            <div class="auth-actions-row">
              <button type="submit" class="auth-btn primary" name="login_submit">LOG IN</button>
              <a class="auth-btn" href="sign.php" role="button" aria-label="Register">REGISTER</a>
            </div>
          </form>

          <div class="auth-socials">
            <a class="social-circle" href="https://twitter.com/Ikoolaii" aria-label="X">
              <img src="assets/images/social/X.jpg" alt="X">
            </a>
            <a class="social-circle" href="https://www.instagram.com/ikoolaii" aria-label="Instagram">
              <img src="assets/images/social/instagram.jpg" alt="Instagram">
            </a>
            <a class="social-circle" href="https://www.facebook.com/juliane.delacruz.7" aria-label="Facebook">
              <img src="assets/images/social/facebook.jpg" alt="Facebook">
            </a>
          </div>

          <div class="auth-switch">
            Don't have an account? <a href="sign.php">Sign Up</a>
          </div>
        </div>
      </div>
    </section>
  </main>
</body>
</html>
