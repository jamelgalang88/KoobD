<?php
require_once __DIR__ . '/auth.php';

function koobdTeacherSessionFromRow(array $teacher): void
{
    koobdSessionUserFromRow($teacher);
}

function koobdTeacherCurrentUser(?mysqli $unused = null): ?array
{
    global $conn;
    $user = koobdCurrentUser($conn);
    return ($user && koobdIsTeacher($user)) ? $user : null;
}

function koobdTeacherProfileRedirectPath(array $teacher): string
{
    return koobdProfileRedirectPath($teacher);
}

function koobdTeacherRequireAuth(bool $requireProfile = true): array
{
    return koobdRequireTeacherAuth($requireProfile);
}

function koobdResolvedTeacherProfile(array $teacher): array
{
    return koobdResolvedProfile($teacher);
}
?>
