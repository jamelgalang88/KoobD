<?php
require_once('auth.php');
$user = koobdRequireAuth(true);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header("Location: create_story.php");
    exit();
}

$title = trim((string)($_POST['title'] ?? ''));
$subtitle = trim((string)($_POST['subtitle'] ?? ''));

if ($title === '' || $subtitle === '') {
    $query = http_build_query([
        'error' => 1,
        'message' => 'Please add both a title and a subtitle before sharing your story.',
        'title' => $title,
        'subtitle' => $subtitle,
    ]);
    header("Location: create_story.php?" . $query);
    exit();
}

$coverImage = koobdUploadSharedStoryCover($_FILES['cover_image'] ?? [], (int)$user['id']) ?? null;
$sharedStoryFile = koobdUploadSharedStoryFile($_FILES['story_file'] ?? [], (int)$user['id']);
$storyFilePath = $sharedStoryFile['path'] ?? null;
$storyFileName = $sharedStoryFile['name'] ?? null;

$stmt = $conn->prepare(
    "INSERT INTO stories (creator_user_id, teacher_story_id, title, subtitle, source_file, source_file_name, cover_image)
     VALUES (?, NULL, ?, ?, ?, ?, ?)"
);
$stmt->bind_param("isssss", $user['id'], $title, $subtitle, $storyFilePath, $storyFileName, $coverImage);
$stmt->execute();
$storyId = (int)$stmt->insert_id;
$stmt->close();

header("Location: home.php?shared_story_created=1&story_id=" . $storyId);
exit();
?>
