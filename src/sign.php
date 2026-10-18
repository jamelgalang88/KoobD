<?php
require_once('auth.php');
$topMascot = 'assets/images/characters/CUBEBOT.png';
$bottomMascot = 'assets/images/characters/FLOWER.png';

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $firstName = $_POST['firstName'] ?? '';
    $lastName = $_POST['lastName'] ?? '';
    $email = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';
    $confirmPassword = $_POST['confirmPassword'] ?? '';

    if ($password !== $confirmPassword) {
        $error = "Passwords do not match.";
    } else {
        $username = trim($firstName . ' ' . $lastName);
        if ($username === '') {
            $username = $email;
        }

        $emailCheck = $conn->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
        $emailCheck->bind_param("s", $email);
        $emailCheck->execute();
        $emailResult = $emailCheck->get_result();
        $emailExists = $emailResult ? $emailResult->fetch_assoc() : null;
        $emailCheck->close();

        if ($emailExists) {
            $error = "That email is already registered. Try logging in instead.";
        } else {
            $usernameCheck = $conn->prepare("SELECT id FROM users WHERE username = ? LIMIT 1");
            $usernameCheck->bind_param("s", $username);
            $usernameCheck->execute();
            $usernameResult = $usernameCheck->get_result();
            $usernameExists = $usernameResult ? $usernameResult->fetch_assoc() : null;
            $usernameCheck->close();

            if ($usernameExists) {
                $error = "That username is already in use. Try a different name.";
            } else {
                $sql = "INSERT INTO users (username, email, password, user_role, profile_badge_label) VALUES (?, ?, ?, 'student', 'Student')";
                $stmt = $conn->prepare($sql);
                $passwordHash = koobdHashPassword($password);
                $stmt->bind_param("sss", $username, $email, $passwordHash);

                if ($stmt->execute()) {
                    $_SESSION["user_id"] = (int)$stmt->insert_id;
                    $_SESSION["username"] = $username;
                    $_SESSION["profile_completed"] = 0;
                    $_SESSION["selected_reader"] = null;
                    header("Location: reader.php?setup=1");
                    exit();
                } else {
                    $error = "Could not create account. Try again.";
                }

                $stmt->close();
            }
        }
    }

    $conn->close();
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
    <title>KoobD - Register</title>
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
<body class="auth-bg auth-register-page">
  <main class="auth-scene" aria-label="Register">
    <section class="auth-stage">
      <div class="auth-pattern auth-pattern-diamond"></div>
      <div class="auth-pattern auth-pattern-star auth-pattern-star-left"></div>
      <div class="auth-pattern auth-pattern-circle auth-pattern-circle-right"></div>
      <div class="auth-pattern auth-pattern-circle auth-pattern-circle-bottom"></div>

      <img class="auth-mascot auth-mascot-top" src="<?= htmlspecialchars($topMascot) ?>" alt="" aria-hidden="true">
      <img class="auth-mascot auth-mascot-bottom" src="<?= htmlspecialchars($bottomMascot) ?>" alt="" aria-hidden="true">

      <div class="auth-shell">
        <div class="auth-card auth-card-register">
          <div class="auth-role-switch" aria-label="Choose account type">
            <a class="auth-role-pill is-active" href="sign.php">Student</a>
            <a class="auth-role-pill" href="teacher_register.php">Teacher</a>
          </div>

          <div class="auth-title">
            <div class="auth-brandmark">
              <div class="auth-infinity">
                <img src="assets/images/icons/LOGO 1.png" alt="KoobD logo">
              </div>
            </div>
            <div class="auth-h1">REGISTER</div>
            <div class="auth-subtitle">Create your account, then choose the reader profile you want to customize.</div>
          </div>

          <form action="" method="post" class="auth-form" aria-label="Register form">
            <div class="two-cols">
              <input class="auth-input" type="text" name="firstName" placeholder="First Name" autocomplete="given-name" required>
              <input class="auth-input" type="text" name="lastName" placeholder="Last Name" autocomplete="family-name" required>
            </div>

            <input class="auth-input" type="email" name="email" placeholder="Email" autocomplete="email" required>
            <input class="auth-input" type="password" name="password" placeholder="Password" autocomplete="new-password" required>
            <input class="auth-input" type="password" name="confirmPassword" placeholder="Confirm Password" autocomplete="new-password" required>

            <?php if (!empty($error)) : ?>
              <div class="auth-error">
                <?php echo htmlspecialchars($error); ?>
              </div>
            <?php endif; ?>

            <div class="auth-actions-row">
              <button type="submit" class="auth-btn primary" name="register_submit">REGISTER</button>
              <a class="auth-btn" href="log.php" role="button" aria-label="Login">LOGIN</a>
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
            Already registered? <a href="log.php">Log in</a>
          </div>
        </div>
      </div>
    </section>
  </main>
</body>
</html>
