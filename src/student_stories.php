<?php
require_once('auth.php');
koobdRequireAuth(true);
header("Location: teacher_stories.php");
exit();
?>
