<?php
// A photo or video sent in a private classroom message (classroom_social.php).
// The files live in uploads/private-messages, which the web server never
// serves directly (docker/apache/legacy-assets.conf); this page sends one
// only to the two people in its conversation - the student and the
// classroom's teacher - and only while the message is not deleted. Videos
// can be streamed in parts (Range requests), so they start quickly and can
// be skipped through, also on slower tablets.
//   message_media.php?id=<message id>
require_once('teacher_auth.php');

$user = koobdCurrentUser($conn);
$messageId = (int)($_GET['id'] ?? 0);
$deny = static function (int $code): void {
    http_response_code($code);
    header('Content-Type: text/plain; charset=UTF-8');
    header('Cache-Control: no-store');
    exit($code === 404 ? 'Not found.' : 'Not allowed.');
};
if (!$user || $messageId <= 0) {
    $deny(404);
}

$stmt = $conn->prepare(
    "SELECT m.classroom_id, m.student_user_id, m.attachment_path, m.attachment_mime, m.deleted_at, c.teacher_id, c.status
     FROM classroom_messages m INNER JOIN classrooms c ON c.id = m.classroom_id WHERE m.id = ? LIMIT 1"
);
$stmt->bind_param('i', $messageId);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$row || $row['attachment_path'] === null || $row['deleted_at'] !== null || $row['status'] !== 'active') {
    $deny(404);
}

// Only the student of the conversation (still in the classroom) or its teacher.
$userId = (int)$user['id'];
$allowed = false;
if ((int)$row['teacher_id'] === $userId) {
    $allowed = true;
} elseif ((int)$row['student_user_id'] === $userId && !koobdIsTeacher($user)) {
    $member = $conn->prepare("SELECT 1 FROM classroom_students WHERE classroom_id = ? AND student_user_id = ? LIMIT 1");
    $member->bind_param('ii', $row['classroom_id'], $userId);
    $member->execute();
    $allowed = (bool)$member->get_result()->fetch_row();
    $member->close();
}
if (!$allowed) {
    $deny(404);
}

$path = (string)$row['attachment_path'];
$file = realpath(__DIR__ . '/' . $path);
$folder = realpath(__DIR__ . '/uploads/private-messages');
if (!$file || !$folder || strpos($file, $folder . DIRECTORY_SEPARATOR) !== 0 || !is_file($file)) {
    $deny(404);
}
$mime = in_array($row['attachment_mime'], ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'], true) ? $row['attachment_mime'] : 'application/octet-stream';

$size = filesize($file);
$start = 0;
$end = $size - 1;
header('Content-Type: ' . $mime);
header('X-Content-Type-Options: nosniff');
header('Content-Disposition: inline');
// Kept by this person's browser only (never by shared caches).
header('Cache-Control: private, max-age=86400');
header('Accept-Ranges: bytes');
if (isset($_SERVER['HTTP_RANGE']) && preg_match('/^bytes=(\d*)-(\d*)$/', (string)$_SERVER['HTTP_RANGE'], $range)) {
    if ($range[1] === '' && $range[2] !== '') {
        $start = max(0, $size - (int)$range[2]);
    } else {
        $start = (int)$range[1];
        $end = $range[2] !== '' ? min((int)$range[2], $size - 1) : $end;
    }
    if ($start > $end || $start >= $size) {
        http_response_code(416);
        header('Content-Range: bytes */' . $size);
        exit();
    }
    http_response_code(206);
    header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
}
header('Content-Length: ' . ($end - $start + 1));
if ($_SERVER['REQUEST_METHOD'] === 'HEAD') {
    exit();
}
$handle = fopen($file, 'rb');
fseek($handle, $start);
$left = $end - $start + 1;
while ($left > 0 && !feof($handle)) {
    $chunk = fread($handle, (int)min(65536, $left));
    if ($chunk === false) {
        break;
    }
    echo $chunk;
    $left -= strlen($chunk);
    flush();
}
fclose($handle);
