<?php
require_once('teacher_auth.php');
$teacher = koobdTeacherRequireAuth(true);

header("Location: classroom.php");
exit();
?>
