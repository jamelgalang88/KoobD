<?php
// Which library section each of a teacher's uploads belongs to (so a picture
// uploaded under Characters is a character, under Backgrounds a background...).
// Kept as one small JSON file per teacher:
//   uploads/platformer-assets/meta/teacher-<id>.json
//   { "<stored file name>": { "section": "character", "sheet": true }, ... }
// Uploads from before sections existed have no entry (section '').

const KOOBD_UPLOAD_SECTIONS = ['character', 'background', 'block', 'hazard', 'scenery'];

function koobdUploadFolder(): string
{
    return __DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'platformer-assets';
}

function koobdUploadIndexPath(int $teacherId): string
{
    return koobdUploadFolder() . DIRECTORY_SEPARATOR . 'meta' . DIRECTORY_SEPARATOR . 'teacher-' . $teacherId . '.json';
}

function koobdUploadIndexRead(int $teacherId): array
{
    $path = koobdUploadIndexPath($teacherId);
    if (!is_file($path)) {
        return [];
    }
    $data = json_decode((string)file_get_contents($path), true);
    return is_array($data) ? $data : [];
}

// Changes the index under a lock: $change receives the index and returns it changed.
function koobdUploadIndexUpdate(int $teacherId, callable $change): bool
{
    $path = koobdUploadIndexPath($teacherId);
    $folder = dirname($path);
    if (!is_dir($folder) && !mkdir($folder, 0777, true) && !is_dir($folder)) {
        return false;
    }
    $handle = fopen($path, 'c+');
    if (!$handle) {
        return false;
    }
    flock($handle, LOCK_EX);
    $data = json_decode((string)stream_get_contents($handle), true);
    $data = $change(is_array($data) ? $data : []);
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($data, JSON_UNESCAPED_SLASHES));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
    return true;
}

// A stored upload's file name, if it is one of this teacher's uploads (else '').
function koobdOwnedUploadName(string $url, int $teacherId): string
{
    $name = basename(str_replace('\\', '/', $url));
    if (strpos($url, 'uploads/platformer-assets/') !== 0 || $name !== substr($url, strlen('uploads/platformer-assets/'))) {
        return '';
    }
    if (!preg_match('/^teacher-' . $teacherId . '-[a-f0-9]+-[a-z0-9-]+\.[a-z0-9]+$/i', $name)) {
        return '';
    }
    return is_file(koobdUploadFolder() . DIRECTORY_SEPARATOR . $name) ? $name : '';
}
