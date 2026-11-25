<?php
require_once('teacher_auth.php');

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
  <link rel="stylesheet" href="<?= koobdAsset('css/auth.css') ?>">
</head>
<body class="auth-bg auth-split auth-register-page">
  <main class="auth-scene" aria-label="Teacher register">
    <section class="auth-stage">
      <?php require_once __DIR__ . '/auth_layout.php'; koobdAuthCarousel(); ?>


      <div class="auth-shell">
        <?php koobdAuthCard('register', 'teacher', $error ?? ''); ?>
      </div>
    </section>
  </main>
</body>
</html>
