<?php
require_once('auth.php');
koobdRequireAuth(true);
header("Location: teacher_create_story.php");
exit();
?>
