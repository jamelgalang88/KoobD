<?php
// A teacher's own recording of how a "Say it" question's phrase is said
// (js/quiz-editor.js records it in the browser). Students hear it instead of
// the computer voice (js/koobd-speech.js). The file is kept in
// uploads/question-audio under a name starting with the teacher's id; it
// belongs to a question once the activity is saved (teacher_quiz_save.php).
//   POST multipart, header X-Koobd-Request: upload, field "audio"
//     -> { success, url }
require_once('teacher_auth.php');

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');
$teacher = koobdTeacherRequireAuth(true);
$teacherId = (int)$teacher['id'];

function questionAudioFail(int $code, string $message): void
{
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $message]);
    exit();
}

// Only from the editor's own upload (a form on another site cannot set the header).
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || ($_SERVER['HTTP_X_KOOBD_REQUEST'] ?? '') !== 'upload') {
    questionAudioFail(400, 'Invalid request.');
}
$upload = $_FILES['audio'] ?? null;
if (!is_array($upload) || ($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string)$upload['tmp_name'])) {
    questionAudioFail(400, 'The recording could not be uploaded. Please try again.');
}
// A few seconds of speech is far below 2 MB.
$size = (int)filesize($upload['tmp_name']);
if ($size <= 0 || $size > 2 * 1024 * 1024) {
    questionAudioFail(413, 'The recording is too long. Keep it under 10 seconds.');
}
$types = [
    'audio/webm' => 'webm', 'video/webm' => 'webm', 'audio/ogg' => 'ogg', 'application/ogg' => 'ogg',
    'audio/mp4' => 'm4a', 'video/mp4' => 'm4a', 'audio/x-m4a' => 'm4a', 'audio/mpeg' => 'mp3', 'audio/wav' => 'wav', 'audio/x-wav' => 'wav',
];
$mime = (new finfo(FILEINFO_MIME_TYPE))->file($upload['tmp_name']) ?: '';
if (!isset($types[$mime])) {
    questionAudioFail(415, 'That recording could not be read. Please record it again.');
}

$folder = __DIR__ . '/uploads/question-audio';
if (!is_dir($folder) && !mkdir($folder, 0755, true) && !is_dir($folder)) {
    questionAudioFail(500, 'The recording could not be saved.');
}
$name = 't' . $teacherId . '-' . bin2hex(random_bytes(16)) . '.' . $types[$mime];
if (!move_uploaded_file($upload['tmp_name'], $folder . '/' . $name)) {
    questionAudioFail(500, 'The recording could not be saved.');
}

// Recordings this teacher made but never saved with a question (recorded
// again, or the editor closed without saving) are cleared after two days.
foreach (glob($folder . '/t' . $teacherId . '-*') ?: [] as $old) {
    if (filemtime($old) > time() - 2 * 86400) {
        continue;
    }
    $path = 'uploads/question-audio/' . basename($old);
    $used = $conn->prepare("SELECT 1 FROM activity_questions WHERE audio_path = ? LIMIT 1");
    $used->bind_param('s', $path);
    $used->execute();
    if (!$used->get_result()->fetch_row()) {
        @unlink($old);
    }
    $used->close();
}

echo json_encode(['success' => true, 'url' => 'uploads/question-audio/' . $name]);
