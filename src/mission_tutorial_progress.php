<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/missions_lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Invalid request method.']);
    exit();
}

$user = koobdCurrentUser($conn);
if (!$user) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Please sign in again.']);
    exit();
}

$input = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid tutorial progress data.']);
    exit();
}

$csrf = (string)($_SESSION['mission_tutorial_csrf'] ?? '');
$postedCsrf = (string)($input['csrf'] ?? '');
if ($csrf === '' || $postedCsrf === '' || !hash_equals($csrf, $postedCsrf)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'The tutorial request could not be verified.']);
    exit();
}

$missionKey = (string)($input['mission'] ?? '');
$role = koobdIsTeacher($user) ? 'teacher' : 'student';
$allowedMissions = [];
foreach (koobdMissionSpecs($role === 'teacher') as $stage) {
    foreach ($stage['missions'] as $mission) {
        $allowedMissions[(string)$mission['key']] = true;
    }
}
if (!isset($allowedMissions[$missionKey])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Unknown journey mission.']);
    exit();
}

$action = (string)($input['action'] ?? '');
if ($action === 'load') {
    $stmt = $conn->prepare(
        "SELECT step_index, completed_at
         FROM user_mission_tutorial_progress
         WHERE user_id = ? AND role = ? AND mission_key = ?
         LIMIT 1"
    );
    if (!$stmt) {
        error_log('Unable to prepare Flowergirl tutorial progress lookup.');
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Unable to load tutorial progress.']);
        exit();
    }
    $userId = (int)$user['id'];
    $stmt->bind_param('iss', $userId, $role, $missionKey);
    if (!$stmt->execute()) {
        $stmt->close();
        error_log('Unable to load Flowergirl tutorial progress.');
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Unable to load tutorial progress.']);
        exit();
    }
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    echo json_encode([
        'success' => true,
        'step' => (int)($row['step_index'] ?? 0),
        'completed' => !empty($row['completed_at']),
    ]);
    exit();
}

if ($action !== 'save') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Unknown tutorial progress action.']);
    exit();
}

$step = filter_var($input['step'] ?? null, FILTER_VALIDATE_INT);
$completed = !empty($input['completed']);
if ($step === false || $step < 0 || $step > 100) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid tutorial step.']);
    exit();
}

$stmt = $conn->prepare(
    "INSERT INTO user_mission_tutorial_progress (user_id, role, mission_key, step_index, completed_at)
     VALUES (?, ?, ?, ?, IF(?, CURRENT_TIMESTAMP, NULL))
     ON DUPLICATE KEY UPDATE
       step_index = VALUES(step_index),
       completed_at = IF(VALUES(completed_at) IS NULL, NULL, CURRENT_TIMESTAMP)"
);
if (!$stmt) {
    error_log('Unable to prepare Flowergirl tutorial progress save.');
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to save tutorial progress.']);
    exit();
}
$userId = (int)$user['id'];
$completedValue = $completed ? 1 : 0;
$stmt->bind_param('issii', $userId, $role, $missionKey, $step, $completedValue);
$saved = $stmt->execute();
$stmt->close();
if (!$saved) {
    error_log('Unable to save Flowergirl tutorial progress.');
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to save tutorial progress.']);
    exit();
}

echo json_encode(['success' => true]);
