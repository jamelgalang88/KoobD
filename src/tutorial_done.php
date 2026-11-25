<?php
// Marks the signed-in user's first-time tutorial (js/koobd-tutorial.js) as
// finished or skipped, so Home does not show it again by itself. POST only,
// and only ever the signed-in user's own row.
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

$userId = (int)($_SESSION['user_id'] ?? 0);
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || $userId <= 0) {
    http_response_code($userId <= 0 ? 401 : 405);
    echo json_encode(['success' => false]);
    exit();
}
session_write_close();
$stmt = $conn->prepare("UPDATE users SET tutorial_done_at = NOW() WHERE id = ? AND tutorial_done_at IS NULL");
$stmt->bind_param('i', $userId);
$stmt->execute();
$stmt->close();
echo json_encode(['success' => true]);
