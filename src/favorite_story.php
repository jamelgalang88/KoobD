<?php
// A reader's favourite stories (the heart in the story pop-up, js/story-details.js).
//
//   GET  favorite_story.php?key=book1           -> { "key": "book1", "favorite": true }
//   POST favorite_story.php  key=book1&favorite=1 (or 0)
//                                               -> { "key": "book1", "favorite": true }
//
// Keys: a classic story's id (book1, false_knight) or "shared-<id>" for a story
// made by others (see koobdStoryForFavoriteKey in auth.php).
require_once('auth.php');

header('Content-Type: application/json');
header('Cache-Control: no-store');

$user = koobdRequireAuth(false);
$userId = (int)$user['id'];
$key = trim((string)($_POST['key'] ?? $_GET['key'] ?? ''));

if (koobdStoryForFavoriteKey($key) === null) {
    http_response_code(400);
    echo json_encode(['error' => 'Unknown story.']);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    koobdSetFavorite($userId, $key, ($_POST['favorite'] ?? '') === '1');
}

echo json_encode(['key' => $key, 'favorite' => koobdIsFavorite($userId, $key)]);
