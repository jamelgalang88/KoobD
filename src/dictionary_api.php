<?php
// The Dictionary's look-ups (dictionary.php): GET ?word=forest&from=en|tl.
// Returns the word's meanings and its translations into the other language
// (English -> Tagalog from Wiktionary's translation tables, Tagalog ->
// English from the Tagalog word's English meanings). A word with nothing in
// the chosen language is tried in the other one (switched: true). See
// dictionary_lib.php. Signed-in users only.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/dictionary_lib.php';
require_once __DIR__ . '/missions_lib.php';
require_once __DIR__ . '/achievements_lib.php';

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

$from = ($_GET['from'] ?? 'en') === 'tl' ? 'tl' : 'en';
$word = koobdDictionaryWord((string)($_GET['word'] ?? ''));
if ($word === '') {
    http_response_code(400);
    echo json_encode(['found' => false, 'invalid' => true]);
    exit();
}

// [meanings, translations] for one direction; null when Wiktionary could not be reached.
$lookUp = static function (string $from) use ($word): ?array {
    $senses = koobdWordSenses($word, $from);
    if ($senses === null) {
        return null;
    }
    if ($from === 'tl') {
        return [$senses, koobdTagalogToEnglish($senses)];
    }
    $translations = koobdWordTranslations($word);
    // "knights" has no translations of its own: those of "knight".
    $base = $senses[0]['base'] ?? '';
    if ($translations === [] && $base !== '' && mb_strtolower($base) !== mb_strtolower($word)) {
        $translations = koobdWordTranslations($base);
    }
    return $translations === null ? null : [$senses, $translations];
};

$result = $lookUp($from);
$switched = false;
if ($result !== null && !$result[0] && !$result[1]) {
    $other = $from === 'en' ? 'tl' : 'en';
    $otherResult = $lookUp($other);
    if ($otherResult !== null && ($otherResult[0] || $otherResult[1])) {
        [$result, $from, $switched] = [$otherResult, $other, true];
    }
}
if ($result === null) {
    http_response_code(503);
    header('Cache-Control: no-store');
    echo json_encode(['found' => false, 'offline' => true]);
    exit();
}
[$senses, $translations] = $result;
$found = (bool)($senses || $translations);
if ($found) {
    koobdMissionRecord($user, 'dictionary_lookup');
    koobdAchievementRecordEvent($user, 'dictionary_word', $from . ':' . mb_strtolower($word));
}
echo json_encode([
    'found' => $found,
    'word' => $word,
    'from' => $from,
    'to' => $from === 'en' ? 'tl' : 'en',
    'switched' => $switched,
    'senses' => $senses,
    'translations' => $translations,
], JSON_UNESCAPED_UNICODE);
