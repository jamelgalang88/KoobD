<?php
// Minigames (profile menu > Minigames): Word Catch (word_catch.php), Fix the
// Story (fix_story.php), Hint Hunt (hint_hunt.php), Word Pairs (word_pairs.php),
// Letter Mix (letter_mix.php) and Sentence Builder (sentence_builder.php). Shared here: the games, and each player's
// best scores (table minigame_scores, saved by minigames_api.php).
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/missions_lib.php';

const KOOBD_MINIGAMES = ['wordcatch', 'fixstory', 'hinthunt', 'wordpairs', 'lettermix', 'sentence'];

function koobdMinigameCatalog(): array
{
    return [
        'wordcatch' => ['title' => 'Word Catch', 'href' => 'word_catch.php', 'unlock_score' => 250],
        'fixstory' => ['title' => 'Fix the Story', 'href' => 'fix_story.php', 'unlock_score' => 40],
        'hinthunt' => ['title' => 'Hint Hunt', 'href' => 'hint_hunt.php', 'unlock_score' => 100],
        'wordpairs' => ['title' => 'Word Pairs', 'href' => 'word_pairs.php', 'unlock_score' => 90],
        'lettermix' => ['title' => 'Letter Mix', 'href' => 'letter_mix.php', 'unlock_score' => 75],
        'sentence' => ['title' => 'Sentence Builder', 'href' => 'sentence_builder.php', 'unlock_score' => null],
    ];
}

function koobdMinigameUnlockedSet(array $user): array
{
    global $conn;

    if (koobdIsTeacher($user)) {
        return array_fill_keys(KOOBD_MINIGAMES, true);
    }

    $userId = (int)($user['id'] ?? 0);
    if ($userId <= 0) {
        return [];
    }

    $stmt = $conn->prepare("INSERT IGNORE INTO user_minigame_unlocks (user_id, game) VALUES (?, 'wordcatch')");
    if (!$stmt) {
        error_log('Unable to prepare initial minigame unlock.');
        throw new RuntimeException('Unable to load minigame progression.');
    }
    $stmt->bind_param('i', $userId);
    if (!$stmt->execute()) {
        $stmt->close();
        error_log('Unable to initialize the first minigame unlock.');
        throw new RuntimeException('Unable to load minigame progression.');
    }
    $stmt->close();

    $stmt = $conn->prepare("SELECT game FROM user_minigame_unlocks WHERE user_id = ?");
    if (!$stmt) {
        error_log('Unable to prepare minigame unlock lookup.');
        throw new RuntimeException('Unable to load minigame progression.');
    }
    $stmt->bind_param('i', $userId);
    if (!$stmt->execute()) {
        $stmt->close();
        error_log('Unable to load minigame unlocks.');
        throw new RuntimeException('Unable to load minigame progression.');
    }
    $unlocked = [];
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $unlocked[(string)$row['game']] = true;
    }
    $stmt->close();
    return $unlocked;
}

function koobdMinigameIsUnlocked(array $user, string $game): bool
{
    if (!in_array($game, KOOBD_MINIGAMES, true)) {
        return false;
    }
    $unlocked = koobdMinigameUnlockedSet($user);
    return isset($unlocked[$game]);
}

function koobdRequireMinigameUnlocked(array $user, string $game): void
{
    if (koobdMinigameIsUnlocked($user, $game)) {
        return;
    }

    header('Location: minigames.php?locked=' . rawurlencode($game));
    exit();
}

function koobdMinigameProgress(array $user): array
{
    $catalog = koobdMinigameCatalog();
    $userId = (int)($user['id'] ?? 0);
    $teacher = koobdIsTeacher($user);
    $unlocked = koobdMinigameUnlockedSet($user);
    $summaries = [];
    foreach (KOOBD_MINIGAMES as $game) {
        $summaries[$game] = koobdMinigameSummary($userId, $game);
    }

    $progress = [];
    foreach (KOOBD_MINIGAMES as $index => $game) {
        $isUnlocked = $teacher || isset($unlocked[$game]);
        $gateGame = $isUnlocked ? $game : KOOBD_MINIGAMES[$index - 1];
        $gateBest = $summaries[$gateGame]['best'];
        $nextGame = $index + 1 < count(KOOBD_MINIGAMES) ? KOOBD_MINIGAMES[$index + 1] : null;
        $requirementScore = $teacher ? null : $catalog[$gateGame]['unlock_score'];
        $percent = $requirementScore
            ? min(100, (int)floor(($gateBest / $requirementScore) * 100))
            : 100;

        $progress[$game] = [
            'game' => $game,
            'title' => $catalog[$game]['title'],
            'href' => $catalog[$game]['href'],
            'unlocked' => $isUnlocked,
            'best' => $summaries[$game]['best'],
            'plays' => $summaries[$game]['plays'],
            'requirement_score' => $requirementScore,
            'gate_game' => $gateGame,
            'gate_title' => $catalog[$gateGame]['title'],
            'gate_best' => $gateBest,
            'progress_percent' => $percent,
            'next_game' => $nextGame,
            'next_title' => $nextGame ? $catalog[$nextGame]['title'] : null,
            'requirement_met' => $teacher || ($nextGame !== null && isset($unlocked[$nextGame])),
        ];
    }

    return $progress;
}

function koobdMinigameUnlockNext(int $userId, string $game, int $score): ?array
{
    global $conn;

    $index = array_search($game, KOOBD_MINIGAMES, true);
    if ($index === false || $index + 1 >= count(KOOBD_MINIGAMES)) {
        return null;
    }

    $catalog = koobdMinigameCatalog();
    $requiredScore = $catalog[$game]['unlock_score'];
    if ($requiredScore === null || $score < $requiredScore) {
        return null;
    }

    $nextGame = KOOBD_MINIGAMES[$index + 1];
    $stmt = $conn->prepare("INSERT IGNORE INTO user_minigame_unlocks (user_id, game) VALUES (?, ?)");
    if (!$stmt) {
        error_log('Unable to prepare next minigame unlock.');
        throw new RuntimeException('Unable to save minigame progression.');
    }
    $stmt->bind_param('is', $userId, $nextGame);
    if (!$stmt->execute()) {
        $stmt->close();
        error_log('Unable to save the next minigame unlock.');
        throw new RuntimeException('Unable to save minigame progression.');
    }
    $inserted = $stmt->affected_rows === 1;
    $stmt->close();

    return $inserted
        ? ['game' => $nextGame, 'title' => $catalog[$nextGame]['title'], 'href' => $catalog[$nextGame]['href']]
        : null;
}

// A player's best scores for one game: [variant => ['best' => n, 'plays' => n]].
function koobdMinigameBests(int $userId, string $game): array
{
    global $conn;
    $stmt = $conn->prepare("SELECT variant, best, plays FROM minigame_scores WHERE user_id = ? AND game = ?");
    if (!$stmt) {
        error_log('Unable to prepare minigame score lookup.');
        throw new RuntimeException('Unable to load minigame scores.');
    }
    $stmt->bind_param('is', $userId, $game);
    if (!$stmt->execute()) {
        $stmt->close();
        error_log('Unable to load minigame scores.');
        throw new RuntimeException('Unable to load minigame scores.');
    }
    $bests = [];
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $bests[$row['variant']] = ['best' => (int)$row['best'], 'plays' => (int)$row['plays']];
    }
    $stmt->close();
    return $bests;
}

// The highest score in any variant of a game, and how many times it was played.
function koobdMinigameSummary(int $userId, string $game): array
{
    $bests = koobdMinigameBests($userId, $game);
    return [
        'best' => $bests ? max(array_column($bests, 'best')) : 0,
        'plays' => array_sum(array_column($bests, 'plays')),
    ];
}
