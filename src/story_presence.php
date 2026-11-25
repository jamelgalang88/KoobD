<?php
// Play together (js/story-multiplayer.js): each student playing a multiplayer
// story activity reports where they are - a few times a second while
// classmates are near, with the movement since the last report as timed
// samples - and hears back where their classmates in the same activity are,
// with their latest movement to replay smoothly. Only students of the
// activity's classroom, only for an activity with "Play together" on, and
// each one only ever writes their own row - positions never touch anyone's
// saved progress, answers or score. Players not heard from for a while have
// left (closed the page, lost the connection) and are not shown.
//
//   POST JSON { activity, page, scene, x, y, facing, progress, state,
//               trail: [[msBeforeSending, x, y, facing, running 0|1, grounded 0|1, verticalSpeed], ...] }
//     -> { success, now (server ms), me: { color },
//          players: [{ id, name, asset, color, page, scene, x, y, facing, progress, state, at (server ms), trail }] }
//   POST JSON { activity, leave: true }   (the page closing)
require_once('teacher_auth.php');

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');
$user = koobdRequireStudentAuth(true);
$userId = (int)$user['id'];

function presenceFail(int $code, string $message): void
{
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $message]);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    presenceFail(405, 'Invalid request.');
}
// sendBeacon (leaving the page) cannot set a JSON content type; it only ever leaves.
$input = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($input)) {
    presenceFail(400, 'Invalid request.');
}
$activity = koobdStudentActivity((int)($input['activity'] ?? 0), $userId);
if (!$activity || ($activity['activity_type'] ?? 'story') !== 'story' || (int)($activity['multiplayer'] ?? 0) !== 1) {
    presenceFail(404, 'This activity is not played together.');
}
if (koobdActivityClosed($activity) && empty($input['leave'])) {
    presenceFail(403, 'This activity is closed: its due date has passed.');
}
$activityId = (int)$activity['id'];

if (!empty($input['leave'])) {
    $conn->query("DELETE FROM story_presence WHERE activity_id = $activityId AND user_id = $userId");
    echo json_encode(['success' => true]);
    exit();
}
if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) {
    presenceFail(415, 'Invalid request.');
}

// This player's place, kept within sensible bounds.
$number = static fn($value, float $min, float $max): float => is_numeric($value) ? max($min, min($max, (float)$value)) : $min;
$page = (int)$number($input['page'] ?? 0, 0, 500);
$scene = preg_match('/^[A-Za-z0-9_:-]{0,80}$/', (string)($input['scene'] ?? '')) ? (string)($input['scene'] ?? '') : '';
$x = $number($input['x'] ?? 0, -1000, 100000);
$y = $number($input['y'] ?? 0, -1000, 100000);
$facing = ($input['facing'] ?? 1) < 0 ? -1 : 1;
$progress = $number($input['progress'] ?? 0, 0, 100);
$state = in_array($input['state'] ?? '', ['playing', 'paused', 'question', 'reading', 'finished'], true) ? (string)$input['state'] : 'playing';
// The movement since the last report: at most 24 samples, each checked and rounded.
$trail = [];
foreach (is_array($input['trail'] ?? null) ? array_slice($input['trail'], -24) : [] as $sample) {
    if (!is_array($sample) || count($sample) < 7) {
        continue;
    }
    $trail[] = [
        (int)$number($sample[0], 0, 5000),
        round($number($sample[1], -1000, 100000), 2),
        round($number($sample[2], -1000, 100000), 2),
        ($sample[3] ?? 1) < 0 ? -1 : 1,
        empty($sample[4]) ? 0 : 1,
        empty($sample[5]) ? 0 : 1,
        round($number($sample[6], -5000, 5000), 1),
    ];
}
$trailJson = json_encode($trail);
$nowMs = (int)round(microtime(true) * 1000);

$write = $conn->prepare(
    "INSERT INTO story_presence (activity_id, user_id, page_index, scene_id, pos_x, pos_y, facing, progress, state, trail, sample_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE page_index = VALUES(page_index), scene_id = VALUES(scene_id), pos_x = VALUES(pos_x), pos_y = VALUES(pos_y),
       facing = VALUES(facing), progress = VALUES(progress), state = VALUES(state), trail = VALUES(trail), sample_ms = VALUES(sample_ms),
       updated_at = CURRENT_TIMESTAMP"
);
$write->bind_param('iiisddidssi', $activityId, $userId, $page, $scene, $x, $y, $facing, $progress, $state, $trailJson, $nowMs);
$write->execute();
$write->close();

// Everyone heard from in the last 12 seconds who is still in the classroom.
$read = $conn->prepare(
    "SELECT p.user_id, p.page_index, p.scene_id, p.pos_x, p.pos_y, p.facing, p.progress, p.state, p.trail, p.sample_ms,
            u.username, u.selected_reader, u.profile_reader_name, u.profile_badge_label, u.profile_top_color, u.profile_bottom_color,
            u.profile_accent_color, u.profile_card_style, u.profile_scale, u.user_role
     FROM story_presence p
     INNER JOIN users u ON u.id = p.user_id
     INNER JOIN classroom_students cs ON cs.student_user_id = p.user_id AND cs.classroom_id = ?
     WHERE p.activity_id = ? AND p.updated_at >= NOW() - INTERVAL 12 SECOND
     ORDER BY p.user_id ASC"
);
$classroomId = (int)$activity['classroom_id'];
$read->bind_param('ii', $classroomId, $activityId);
$read->execute();
$rows = $read->get_result()->fetch_all(MYSQLI_ASSOC);
$read->close();

// Each player gets a different colour, in a fixed order, while they play.
$palette = ['#ff5a5f', '#2bb3ff', '#ffc531', '#36d399', '#b56cff', '#ff8a3d', '#ff6fb5', '#19c2b0', '#8fd14f', '#6c7cff'];
$players = [];
$myColor = $palette[0];
foreach (array_values($rows) as $index => $row) {
    $color = $palette[$index % count($palette)];
    if ((int)$row['user_id'] === $userId) {
        $myColor = $color;
        continue;
    }
    $profile = koobdResolvedProfile($row);
    $players[] = [
        'id' => (int)$row['user_id'],
        'name' => $profile['name'],
        'asset' => $profile['asset'],
        'color' => $color,
        'page' => (int)$row['page_index'],
        'scene' => (string)$row['scene_id'],
        'x' => (float)$row['pos_x'],
        'y' => (float)$row['pos_y'],
        'facing' => (int)$row['facing'],
        'progress' => (float)$row['progress'],
        'state' => (string)$row['state'],
        'at' => (int)$row['sample_ms'],
        // Movement older than a few seconds has already been replayed.
        'trail' => $nowMs - (int)$row['sample_ms'] < 4000 ? (json_decode((string)$row['trail'], true) ?: []) : [],
    ];
}
echo json_encode(['success' => true, 'now' => (int)round(microtime(true) * 1000), 'me' => ['color' => $myColor], 'players' => $players]);
