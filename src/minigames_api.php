<?php
// Minigames: saves a finished game's score (the best one is kept), and gives
// Hint Hunt and Letter Mix their words.
//   POST { action: 'save', game, variant, score } -> { best, plays, newBest, newUnlock }
//   POST { action: 'words', game, lang: 'en'|'tl', level } -> { words: [{ w, h }] }
//        (words and hints from Versus Mode's list, never its questions)
require_once __DIR__ . '/minigames_lib.php';
require_once __DIR__ . '/versus_words.php';
header('Content-Type: application/json; charset=utf-8');

function mgDone(int $code, array $data): void
{
    http_response_code($code);
    echo json_encode($data);
    exit();
}

$user = koobdCurrentUser($conn);
if (!$user) {
    mgDone(401, ['success' => false, 'message' => 'Please sign in again.']);
}
koobdMissionRequireFeature($user, 'minigames', true);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    mgDone(405, ['success' => false, 'message' => 'Invalid request.']);
}
$input = json_decode((string)file_get_contents('php://input'), true);
if (is_array($input) && ($input['action'] ?? '') === 'words') {
    $game = (string)($input['game'] ?? '');
    if (!in_array($game, ['hinthunt', 'lettermix'], true)) {
        mgDone(422, ['success' => false, 'message' => 'Choose a valid minigame.']);
    }
    if (!koobdMinigameIsUnlocked($user, $game)) {
        mgDone(403, ['success' => false, 'message' => 'Unlock this minigame before loading its words.']);
    }
    $level = (string)($input['level'] ?? '');
    if (!in_array($level, ['easy', 'medium', 'hard'], true)) {
        mgDone(422, ['success' => false, 'message' => 'Choose a level.']);
    }
    $list = array_values(array_filter(
        koobdVersusWords(($input['lang'] ?? 'en') === 'tl' ? 'fil' : 'en'),
        static fn($item) => ($item['lv'] ?? '') === $level
    ));
    shuffle($list);
    $words = array_map(static fn($item) => ['w' => $item['w'], 'h' => $item['h']], array_slice($list, 0, 20));
    mgDone(200, ['success' => true, 'words' => $words]);
}
if (!is_array($input) || ($input['action'] ?? '') !== 'save') {
    mgDone(400, ['success' => false, 'message' => 'Invalid request.']);
}
$game = (string)($input['game'] ?? '');
$variant = (string)($input['variant'] ?? '');
$score = is_numeric($input['score'] ?? null) ? (int)$input['score'] : -1;
if (!in_array($game, KOOBD_MINIGAMES, true) || !preg_match('/^[a-z0-9-]{1,40}$/', $variant) || $score < 0 || $score > 100000) {
    mgDone(422, ['success' => false, 'message' => 'That score could not be saved.']);
}
if (!koobdMinigameIsUnlocked($user, $game)) {
    mgDone(403, ['success' => false, 'message' => 'Unlock this minigame before playing it.']);
}
$userId = (int)$user['id'];
$before = koobdMinigameBests($userId, $game)[$variant]['best'] ?? null;
$stmt = $conn->prepare(
    "INSERT INTO minigame_scores (user_id, game, variant, best, last_score, plays) VALUES (?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE best = GREATEST(best, VALUES(best)), last_score = VALUES(last_score), plays = plays + 1"
);
if (!$stmt) {
    error_log('Unable to prepare minigame score save.');
    mgDone(500, ['success' => false, 'message' => 'Your score could not be saved. Please try again.']);
}
$stmt->bind_param('issii', $userId, $game, $variant, $score, $score);
if (!$stmt->execute()) {
    $stmt->close();
    error_log('Unable to save minigame score.');
    mgDone(500, ['success' => false, 'message' => 'Your score could not be saved. Please try again.']);
}
$stmt->close();
$now = koobdMinigameBests($userId, $game)[$variant];
$newUnlock = null;
if (!koobdIsTeacher($user)) {
    try {
        $newUnlock = koobdMinigameUnlockNext($userId, $game, $score);
    } catch (RuntimeException $error) {
        mgDone(500, ['success' => false, 'message' => 'Your score was saved, but the next unlock could not be recorded. Please retry.']);
    }
}
mgDone(200, [
    'success' => true,
    'best' => $now['best'],
    'plays' => $now['plays'],
    'newBest' => $before === null ? $score > 0 : $score > $before,
    'newUnlock' => $newUnlock,
]);
