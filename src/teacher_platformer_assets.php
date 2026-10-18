<?php
// The teacher's own uploads for the story editor's library ("My uploads"),
// newest first: { assets: [{ url, name, kind: image|audio|video, section, sheet }] }.
// `section` is the library section a picture was uploaded to ('' for files
// from before sections, which show in every picture section).
require_once('teacher_auth.php');
require_once('platformer_upload_index.php');

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');
$teacher = koobdTeacherRequireAuth(true);

$kinds = ['png' => 'image', 'jpg' => 'image', 'webp' => 'image', 'gif' => 'image', 'mp3' => 'audio', 'mp4' => 'video', 'webm' => 'video'];
$folder = __DIR__ . '/uploads/platformer-assets';
$files = glob($folder . '/teacher-' . (int)$teacher['id'] . '-*') ?: [];
usort($files, fn($a, $b) => filemtime($b) <=> filemtime($a));

$index = koobdUploadIndexRead((int)$teacher['id']);
$assets = [];
foreach (array_slice($files, 0, 300) as $path) {
    $name = basename($path);
    if (!preg_match('/^teacher-[0-9]+-[a-f0-9]+-([a-z0-9-]+)\.([a-z0-9]+)$/i', $name, $match)) continue;
    $extension = strtolower($match[2]);
    if (!isset($kinds[$extension])) continue;
    $assets[] = [
        'url' => 'uploads/platformer-assets/' . $name,
        'name' => str_replace('-', ' ', $match[1]),
        'kind' => $kinds[$extension],
        'section' => (string)($index[$name]['section'] ?? ''),
        'sheet' => !empty($index[$name]['sheet']),
    ];
}
echo json_encode(['assets' => $assets]);
