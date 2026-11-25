<?php
// Saves the signed-in user's sound settings (js/koobd-audio.js): master,
// music, effects and click volumes (0-100) and mute. POST, JSON. Only ever the
// signed-in user's own row; signed out, settings stay on the device.
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
$prefs = koobdCleanAudioPrefs(json_decode((string)file_get_contents('php://input', false, null, 0, 2048), true)['prefs'] ?? null);
if ($prefs === null) {
    http_response_code(400);
    echo json_encode(['success' => false]);
    exit();
}
$json = json_encode($prefs);
$stmt = $conn->prepare("UPDATE users SET audio_prefs = ? WHERE id = ?");
$stmt->bind_param('si', $json, $userId);
$stmt->execute();
$stmt->close();
echo json_encode(['success' => true, 'prefs' => $prefs]);
