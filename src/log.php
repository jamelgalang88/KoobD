<?php
require_once('auth.php');

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $email = $_POST['email'] ?? '';
    $password = $_POST['password'] ?? '';

    // Checked against the stored hash (koobdFindLogin, auth.php).
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
  <link rel="stylesheet" href="<?= koobdAsset('css/auth.css') ?>">
</head>
<body class="auth-bg auth-split auth-login-page">
  <main class="auth-scene" aria-label="Login">
    <section class="auth-stage">
      <?php require_once __DIR__ . '/auth_layout.php'; koobdAuthCarousel(); ?>


      <div class="auth-shell">
        <?php koobdAuthCard('login', 'student', $error ?? ''); ?>
      </div>
    </section>
  </main>
</body>
</html>
