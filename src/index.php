<?php
require_once('auth.php');
if (isset($_SESSION["username"]) || isset($_SESSION["user_id"])) {
    $user = koobdCurrentUser($conn);
    if ($user) {
        header("Location: " . koobdProfileRedirectPath($user));
        exit();
    }
}
header("Location: log.php");
exit();
?>
