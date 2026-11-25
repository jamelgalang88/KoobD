<?php
// Screen-time reports for a classroom's teacher (screen_time_lib.php). Every
// request checks, on the server, that the classroom is the signed-in
// teacher's own and - for one student - that the student is in it now.
//
//   GET  ?action=classroom&classroom=<id>&range=day|week|month|custom[&from=&to=][&format=csv]
//   GET  ?action=student&classroom=<id>&student=<id>&range=...[&format=csv]
//   POST {action: 'limit', classroom, minutes}   - the classroom's daily threshold
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/screen_time_lib.php';

header('Cache-Control: no-store');

function stFail(int $status, string $message): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => $message]);
    exit();
}

if (!isset($_SESSION['user_id']) && !isset($_SESSION['username'])) {
    stFail(401, 'Please sign in again.');
}
$teacher = koobdCurrentUser($conn);
if (!$teacher || !koobdIsTeacher($teacher)) {
    stFail(403, 'Only the classroom\'s teacher can see its screen time.');
}
session_write_close();

$isPost = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
$input = $isPost ? (json_decode((string)file_get_contents('php://input'), true) ?: []) : $_GET;
$action = (string)($input['action'] ?? '');
$classroom = stTeacherClassroom($teacher, (int)($input['classroom'] ?? 0));
if (!$classroom) {
    stFail(404, 'That classroom was not found among your classrooms.');
}

if ($isPost) {
    if ($action !== 'limit') {
        stFail(400, 'Unknown request.');
    }
    $minutes = stSetDailyLimit((int)$classroom['id'], (int)($input['minutes'] ?? ST_DEFAULT_LIMIT_MIN));
    header('Content-Type: application/json');
    echo json_encode(['success' => true, 'limitMin' => $minutes]);
    exit();
}

$range = stRange((string)($input['range'] ?? 'week'), (string)($input['from'] ?? ''), (string)($input['to'] ?? ''));
$csv = ($input['format'] ?? '') === 'csv';
$labels = stCategories();

if ($action === 'classroom') {
    $report = stClassroomReport($classroom, $range);
    if ($csv) {
        $rows = [array_merge(['Student', 'Character', 'Estimated active time (minutes)'], array_map(static fn($label) => $label . ' (minutes)', array_values($labels)), ['Days over ' . $report['limitMin'] . ' min', 'Last active', 'Last activity'])];
        foreach ($report['students'] as $student) {
            $rows[] = array_merge(
                [$student['name'], $student['character'], round($student['secs'] / 60, 1)],
                array_map(static fn($key) => round($student['categories'][$key] / 60, 1), array_keys($labels)),
                [$student['daysOver'], $student['last']['at'] ?? 'No activity', $student['last']['label'] ?? '']
            );
        }
        stSendCsv('screen-time-' . $classroom['title'] . '-' . $range['from'] . '-to-' . $range['to'] . '.csv', $rows);
        exit();
    }
    header('Content-Type: application/json');
    echo json_encode(['success' => true] + $report);
    exit();
}

if ($action === 'student') {
    $student = stClassroomStudent((int)$classroom['id'], (int)($input['student'] ?? 0));
    if (!$student) {
        stFail(404, 'That student is not in this classroom.');
    }
    $report = stStudentReport($classroom, $student, $range);
    if ($csv) {
        $rows = [array_merge(['Date', 'Start', 'End', 'Estimated active time (minutes)', 'Main activity'], array_map(static fn($label) => $label . ' (minutes)', array_values($labels)), ['Pages'])];
        foreach ($report['sessions'] as $session) {
            $rows[] = array_merge(
                [$session['day'], $session['start'], $session['end'], round($session['secs'] / 60, 1), $labels[$session['main']] ?? ''],
                array_map(static fn($key) => round($session['categories'][$key] / 60, 1), array_keys($labels)),
                [implode('; ', $session['what'])]
            );
        }
        stSendCsv('screen-time-' . $student['name'] . '-' . $range['from'] . '-to-' . $range['to'] . '.csv', $rows);
        exit();
    }
    header('Content-Type: application/json');
    echo json_encode(['success' => true] + $report);
    exit();
}

stFail(400, 'Unknown request.');
