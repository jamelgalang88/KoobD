<?php
require_once('auth.php');

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit();
}

$user = koobdRequireAuth(true);
$rawInput = file_get_contents('php://input');
$payload = json_decode($rawInput ?: '{}', true);

if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid payload']);
    exit();
}

$storyId = trim((string)($payload['storyId'] ?? ''));
$progressContext = trim((string)($payload['progressContext'] ?? 'global'));
$storyTitle = trim((string)($payload['title'] ?? ''));
$progress = max(0, min(100, (int)($payload['progress'] ?? 0)));
$progressState = isset($payload['state']) ? json_encode($payload['state']) : null;

if ($progressContext === '' || !preg_match('/^[a-z0-9:_-]{1,80}$/i', $progressContext)) {
    $progressContext = 'global';
}

if ($storyId === '' || $storyTitle === '') {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Missing story data']);
    exit();
}

$stmt = $conn->prepare(
    "INSERT INTO story_progress (user_id, story_id, progress_context, story_title, progress, progress_state)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       story_title = VALUES(story_title),
       progress = VALUES(progress),
       progress_state = VALUES(progress_state),
       last_read_at = CURRENT_TIMESTAMP"
);
$stmt->bind_param(
    "isssis",
    $user['id'],
    $storyId,
    $progressContext,
    $storyTitle,
    $progress,
    $progressState
);
$stmt->execute();
$stmt->close();

echo json_encode(['ok' => true]);
