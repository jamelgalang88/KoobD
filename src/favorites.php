<?php
require_once('auth.php');
$user = koobdRequireAuth(true);
header("Location: home.php");
exit();

