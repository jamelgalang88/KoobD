<?php
// Deletes one of the teacher's own uploads (the bin on an uploaded asset in the
// story editor's libraries). Only the teacher's own files can be deleted.
//
//   POST url=uploads/platformer-assets/teacher-<id>-...  -> { success }
require_once('teacher_auth.php');
require_once('platformer_upload_index.php');

header('Content-Type: application/json; charset=UTF-8');
$teacher = koobdTeacherRequireAuth(true);
$teacherId = (int)$teacher['id'];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Invalid request method.']);
    exit();
}

$name = koobdOwnedUploadName(trim((string)($_POST['url'] ?? '')), $teacherId);
if ($name === '') {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'That upload could not be found.']);
    exit();
}

if (!@unlink(koobdUploadFolder() . DIRECTORY_SEPARATOR . $name)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'The upload could not be deleted.']);
    exit();
}
koobdUploadIndexUpdate($teacherId, function (array $index) use ($name) {
    unset($index[$name]);
    return $index;
});

echo json_encode(['success' => true]);
