<?php
require_once('teacher_auth.php');

header('Content-Type: application/json; charset=UTF-8');

$teacher = koobdTeacherRequireAuth(true);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid request method.'
    ]);
    exit();
}

if (!isset($_FILES['voiceOver'])) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'No audio file was uploaded.'
    ]);
    exit();
}

$file = $_FILES['voiceOver'];
if (!is_array($file) || !isset($file['error'])) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid upload payload.'
    ]);
    exit();
}

if ((int)$file['error'] !== UPLOAD_ERR_OK) {
    $message = 'Unable to upload the audio file.';
    if ((int)$file['error'] === UPLOAD_ERR_INI_SIZE || (int)$file['error'] === UPLOAD_ERR_FORM_SIZE) {
        $message = 'The audio file is too large. Please choose a smaller file.';
    }

    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => $message
    ]);
    exit();
}

$tmpPath = (string)($file['tmp_name'] ?? '');
if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'The uploaded audio file could not be verified.'
    ]);
    exit();
}

$originalName = trim((string)($file['name'] ?? 'audio'));
$extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
$allowedExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'webm'];
if (!in_array($extension, $allowedExtensions, true)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Please upload an MP3, WAV, OGG, M4A, AAC, or WEBM audio file.'
    ]);
    exit();
}

$maxBytes = 7 * 1024 * 1024;
$size = (int)($file['size'] ?? 0);
if ($size <= 0 || $size > $maxBytes) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'The audio file must be smaller than 7 MB.'
    ]);
    exit();
}

$uploadDir = __DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'voiceovers';
if (!is_dir($uploadDir) && !mkdir($uploadDir, 0777, true) && !is_dir($uploadDir)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Could not prepare the voice-over upload folder.'
    ]);
    exit();
}

$safeBase = preg_replace('/[^a-z0-9\-]+/i', '-', pathinfo($originalName, PATHINFO_FILENAME));
$safeBase = trim((string)$safeBase, '-');
if ($safeBase === '') {
    $safeBase = 'voiceover';
}

$storedName = sprintf(
    'teacher-%d-%d-%s-%s.%s',
    (int)$teacher['id'],
    time(),
    bin2hex(random_bytes(4)),
    $safeBase,
    $extension
);

$destination = $uploadDir . DIRECTORY_SEPARATOR . $storedName;
if (!move_uploaded_file($tmpPath, $destination)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'The audio file could not be saved.'
    ]);
    exit();
}

echo json_encode([
    'success' => true,
    'url' => 'uploads/voiceovers/' . $storedName,
    'name' => $originalName
]);
exit();
