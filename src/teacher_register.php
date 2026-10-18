<?php
require_once('teacher_auth.php');
$topMascot = 'assets/images/characters/CUBEBOT.png';
$bottomMascot = 'assets/images/characters/FLOWER.png';

$existingTeacher = koobdTeacherCurrentUser();
if ($existingTeacher) {
    header("Location: " . koobdTeacherProfileRedirectPath($existingTeacher));
    exit();
}

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $teacherName = trim($_POST['teacherName'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';
    $confirmPassword = $_POST['confirmPassword'] ?? '';

    if ($password !== $confirmPassword) {
        $error = "Passwords do not match.";
    } else {
        if ($teacherName === '') {
            $teacherName = $email;
        }

        $teacherEmailCheck = $conn->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
        $teacherEmailCheck->bind_param("s", $email);
        $teacherEmailCheck->execute();
        $teacherEmailResult = $teacherEmailCheck->get_result();
        $teacherEmailExists = $teacherEmailResult ? $teacherEmailResult->fetch_assoc() : null;
        $teacherEmailCheck->close();

        if ($teacherEmailExists) {
            $error = "That teacher email is already registered. Try logging in instead.";
        } else {
            $stmt = $conn->prepare(
                "INSERT INTO users (username, email, password, user_role, profile_badge_label)
                 VALUES (?, ?, ?, 'teacher', 'Teacher')"
            );
            $passwordHash = koobdHashPassword($password);
            $stmt->bind_param("sss", $teacherName, $email, $passwordHash);

            if ($stmt->execute()) {
                $teacher = [
                    'id' => (int)$stmt->insert_id,
                    'username' => $teacherName,
                    'profile_completed' => 0,
                    'selected_reader' => null,
                    'profile_reader_name' => null,
                    'user_role' => 'teacher',
                ];
                koobdTeacherSessionFromRow($teacher);
                header("Location: " . koobdTeacherProfileRedirectPath($teacher));
                exit();
            }

            $error = "Could not create teacher account. Try again.";
            $stmt->close();
        }
    }
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
  <title>KoobD - Teacher Register</title>
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
  <main class="auth-scene" aria-label="Teacher register">
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
            <a class="auth-role-pill" href="sign.php">Student</a>
            <a class="auth-role-pill is-active" href="teacher_register.php">Teacher</a>
          </div>

          <div class="auth-title">
            <div class="auth-brandmark">
              <div class="auth-infinity">
                <img src="assets/images/icons/LOGO 1.png" alt="KoobD logo">
              </div>
            </div>
            <div class="auth-h1">REGISTER</div>
            <div class="auth-subtitle">Create a teacher account, choose your classroom profile, and start building classes for students.</div>
          </div>

          <form action="" method="post" class="auth-form" aria-label="Teacher register form">
            <input class="auth-input" type="text" name="teacherName" placeholder="Teacher name" required>
            <input class="auth-input" type="email" name="email" placeholder="Teacher email" autocomplete="email" required>
            <input class="auth-input" type="password" name="password" placeholder="Password" autocomplete="new-password" required>
            <input class="auth-input" type="password" name="confirmPassword" placeholder="Confirm password" autocomplete="new-password" required>

            <?php if (!empty($error)) : ?>
              <div class="auth-error"><?php echo htmlspecialchars($error); ?></div>
            <?php endif; ?>

            <div class="auth-actions-row">
              <button type="submit" class="auth-btn primary">REGISTER</button>
              <a class="auth-btn" href="teacher_login.php">LOGIN</a>
            </div>
          </form>

          <div class="auth-switch">
            Already a teacher? <a href="teacher_login.php">Log in</a>
          </div>
        </div>
      </div>
    </section>
  </main>
</body>
</html>
