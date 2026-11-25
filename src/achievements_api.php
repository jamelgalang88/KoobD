<?php
require_once __DIR__ . '/achievements_lib.php';
$user = koobdRequireAuth(true);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Use POST for achievement updates.']);
    exit();
}
$csrf = (string)($_SERVER['HTTP_X_KOOBD_CSRF'] ?? '');
if ($csrf === '' || empty($_SESSION['achievement_csrf']) || !hash_equals((string)$_SESSION['achievement_csrf'], $csrf)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'The achievement request could not be verified.']);
    exit();
}
$input = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'The achievement request is invalid.']);
    exit();
}
session_write_close();

if (($input['action'] ?? '') === 'poll') {
    koobdAchievementSync($user);
    echo json_encode(['ok' => true, 'notices' => koobdAchievementPendingNotices($user)], JSON_UNESCAPED_UNICODE);
    exit();
}
if (($input['action'] ?? '') === 'ack') {
    koobdAchievementAcknowledgeNotices($user, (array)($input['ids'] ?? []));
    echo json_encode(['ok' => true]);
    exit();
}
http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'Unknown achievement action.']);
