<?php
// A word's meaning for the story readers' Words panel (js/story-words.js):
// GET ?word=forest&lang=en|tl. See dictionary_lib.php: Wiktionary the first
// time, then kept in word_definitions. Signed-in readers only.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/dictionary_lib.php';
require_once __DIR__ . '/missions_lib.php';

header('Content-Type: application/json');
header('Cache-Control: private, max-age=86400');

$userId = (int)($_SESSION['user_id'] ?? 0);
if ($userId <= 0) {
    http_response_code(401);
    echo json_encode(['found' => false]);
    exit();
}
$user = koobdCurrentUser($conn);
if (!$user) {
    http_response_code(401);
    echo json_encode(['found' => false]);
    exit();
}
koobdMissionRequireFeature($user, 'learning_tools', true);
session_write_close();

$lang = ($_GET['lang'] ?? 'en') === 'tl' ? 'tl' : 'en';
$word = koobdDictionaryWord((string)($_GET['word'] ?? ''));
if ($word === '' || strpos($word, ' ') !== false) {
    http_response_code(400);
    echo json_encode(['found' => false]);
    exit();
}

$senses = koobdWordSenses($word, $lang);
if ($senses === null) {
    http_response_code(503);
    header('Cache-Control: no-store');
    echo json_encode(['found' => false, 'offline' => true]);
    exit();
}
echo json_encode(['found' => (bool)$senses, 'word' => $word, 'lang' => $lang, 'senses' => $senses], JSON_UNESCAPED_UNICODE);
