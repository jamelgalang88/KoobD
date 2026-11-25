<?php
// Receives a student page's active seconds (js/screen-time.js), in 30-second
// slots, and stores them (screen_time_lib.php). Signed-in students only;
// anything else is quietly ignored. POST, JSON:
//   { page, activity, classroom, slots: [[slot, secs, kind], ...] }
// Answers with the server's time, so the page numbers slots by its clock.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/screen_time_lib.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || (!isset($_SESSION['user_id']) && !isset($_SESSION['username']))) {
    http_response_code(204);
    exit();
}
$user = koobdCurrentUser($conn);
if (!$user || koobdIsTeacher($user)) {
    http_response_code(204);
    exit();
}
// Sessions are not held open while the slots are written.
session_write_close();
$payload = json_decode((string)file_get_contents('php://input', false, null, 0, 16384), true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['success' => false]);
    exit();
}
echo json_encode(['success' => true, 'kept' => stRecord($user, $payload), 'now' => (int)round(microtime(true) * 1000)]);
