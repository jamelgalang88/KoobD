<?php
// Uploads for the story editor's Platform Mode library ("My uploads"):
// pictures (PNG, JPG, WEBP, GIF - including animated GIFs and sprite sheets),
// music and sounds (MP3) and short video cutscenes (MP4, WEBM). Each file is
// checked by its real content type, kept in uploads/platformer-assets with the
// teacher's id in its name, and returned as a path the editor can use.
//
//   POST image=<file> [section=character|background|block|hazard|scenery] [sheet=1]
//        -> { success, url, name, kind: image|audio|video, section, sheet }
// The section is the library section it was uploaded to (platformer_upload_index.php).
require_once('teacher_auth.php');
require_once('platformer_upload_index.php');

header('Content-Type: application/json; charset=UTF-8');
$teacher = koobdTeacherRequireAuth(true);

function koobdPlatformerUploadError(int $status, string $message): void
{
    http_response_code($status);
    echo json_encode(['success' => false, 'message' => $message]);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    koobdPlatformerUploadError(405, 'Invalid request method.');
}

$file = $_FILES['image'] ?? ($_FILES['file'] ?? null);
if (!is_array($file) || !isset($file['error'])) {
    koobdPlatformerUploadError(400, 'Choose a file to upload.');
}
if ((int)$file['error'] !== UPLOAD_ERR_OK) {
    $message = ((int)$file['error'] === UPLOAD_ERR_INI_SIZE || (int)$file['error'] === UPLOAD_ERR_FORM_SIZE)
        ? 'The file is too large.'
        : 'The upload failed.';
    koobdPlatformerUploadError(400, $message);
}

$tmpPath = (string)($file['tmp_name'] ?? '');
$size = (int)($file['size'] ?? 0);
if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
    koobdPlatformerUploadError(400, 'The uploaded file could not be verified.');
}

// What each kind of file may be, by its real content type.
$types = [
    'image/png' => ['png', 'image', 10],
    'image/jpeg' => ['jpg', 'image', 10],
    'image/webp' => ['webp', 'image', 10],
    'image/gif' => ['gif', 'image', 10],
    'audio/mpeg' => ['mp3', 'audio', 15],
    'audio/mp3' => ['mp3', 'audio', 15],
    'video/mp4' => ['mp4', 'video', 40],
    'video/webm' => ['webm', 'video', 40],
];
$mime = (string)(new finfo(FILEINFO_MIME_TYPE))->file($tmpPath);
if (!isset($types[$mime])) {
    koobdPlatformerUploadError(400, 'Use a PNG, JPG, WEBP or GIF picture, an MP3 sound, or an MP4 / WEBM video.');
}
[$extension, $kind, $maxMb] = $types[$mime];
if ($size <= 0 || $size > $maxMb * 1024 * 1024) {
    koobdPlatformerUploadError(400, sprintf('This file must be smaller than %d MB.', $maxMb));
}
if ($kind === 'image') {
    $imageInfo = @getimagesize($tmpPath);
    if (!is_array($imageInfo) || $imageInfo[0] < 1 || $imageInfo[0] > 10000 || $imageInfo[1] > 10000) {
        koobdPlatformerUploadError(400, 'The picture could not be read, or is larger than 10,000 pixels.');
    }
}

$uploadDir = __DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'platformer-assets';
if (!is_dir($uploadDir) && !mkdir($uploadDir, 0777, true) && !is_dir($uploadDir)) {
    koobdPlatformerUploadError(500, 'Could not prepare the upload folder.');
}

$originalName = trim((string)($file['name'] ?? $kind));
$safeBase = preg_replace('/[^a-z0-9\-]+/i', '-', pathinfo($originalName, PATHINFO_FILENAME));
$safeBase = substr(trim((string)$safeBase, '-'), 0, 40);
if ($safeBase === '') {
    $safeBase = $kind;
}
$storedName = sprintf(
    'teacher-%d-%s-%s.%s',
    (int)$teacher['id'],
    bin2hex(random_bytes(8)),
    strtolower($safeBase),
    $extension
);
$destination = $uploadDir . DIRECTORY_SEPARATOR . $storedName;
if (!move_uploaded_file($tmpPath, $destination)) {
    koobdPlatformerUploadError(500, 'The file could not be saved.');
}

// The library section it belongs to (pictures only), and for a character
// whether it is an animated sprite sheet.
$section = $kind === 'image' ? trim((string)($_POST['section'] ?? '')) : '';
if (!in_array($section, KOOBD_UPLOAD_SECTIONS, true)) {
    $section = '';
}
$sheet = $section === 'character' && !empty($_POST['sheet']);
if ($section !== '') {
    koobdUploadIndexUpdate((int)$teacher['id'], function (array $index) use ($storedName, $section, $sheet) {
        $index[$storedName] = ['section' => $section, 'sheet' => $sheet];
        return $index;
    });
}

echo json_encode([
    'success' => true,
    'url' => 'uploads/platformer-assets/' . $storedName,
    'name' => $originalName,
    'kind' => $kind,
    'section' => $section,
    'sheet' => $sheet,
]);
