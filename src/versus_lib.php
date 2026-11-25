<?php
// Versus Mode's shared rules (versus_api.php, versus_play.php,
// versus_match.php): the arena, how fast players may move, how a round's word
// and letters are chosen, and who may see a lobby.
//
// The arena is 1600 x 900 units with a fixed camera. The ground is solid; the
// floating platforms can be jumped up through and landed on, as in a platform
// fighter. Letters sit on fixed spots above the platforms (all reachable from
// the ground by jumping platform to platform). The browser simulates the
// player's own movement; the server checks every movement report against the
// same limits, and decides every letter, answer, round and score itself.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/missions_lib.php';
require_once __DIR__ . '/versus_words.php';

// A compact arena, so the characters show large on a phone or tablet: a jump
// (about 268 high) clears one level of platforms (115 apart) with room to spare.
const VS_W = 1120;
const VS_H = 630;
const VS_GROUND = 570;           // the ground's top (feet stand at this y)
const VS_GRAVITY = 2600;         // units / s^2
const VS_JUMP = 1180;            // jump speed, units / s (a jump rises about 268)
const VS_MAX_RUN = 430;          // top running speed, units / s
const VS_MAX_FALL = 1500;        // top falling speed
const VS_PLAYER_W = 60;
const VS_PLAYER_H = 86;
const VS_REACH = 100;            // how close a player's middle must be to a letter
const VS_COUNTDOWN_MS = 3500;    // before each round starts
const VS_BREAK_MS = 4500;        // between a round's end and the next
const VS_WRONG_LOCK_MS = 3000;   // after a wrong answer, before the next question
const VS_RECONNECT_MS = 60000;   // how long a player may be gone before forfeiting
const VS_AWAY_MS = 8000;         // gone this long: shown as disconnected
const VS_HEARTS = 3;             // each player's hearts in a round: a wrong letter costs one
// The live relay (relay/versus-relay.js, compose.yaml): ws and wss ports, and
// the secret it shares with this server (in the never-served certificates folder).
const VS_RELAY_PORT = 8090;
const VS_RELAY_TLS_PORT = 8091;
const VS_RELAY_SECRET_FILE = '/etc/koobd-certs/relay-secret';

function koobdVersusArena(): array
{
    // Floating platforms: x (left), y (top), w. Mirrored left/right, four
    // levels 115 apart, each a short run and jump from the one below.
    $platforms = [
        ['x' => 80, 'y' => 455, 'w' => 250], ['x' => 790, 'y' => 455, 'w' => 250],
        ['x' => 410, 'y' => 340, 'w' => 300],
        ['x' => 60, 'y' => 225, 'w' => 230], ['x' => 830, 'y' => 225, 'w' => 230],
        ['x' => 430, 'y' => 120, 'w' => 260],
    ];
    // Where letters may appear (their middles): above each platform, and on
    // the open ground between the two low side platforms.
    $spots = [];
    $add = static function (array $xs, int $top) use (&$spots) {
        foreach ($xs as $x) {
            $spots[] = ['x' => $x, 'y' => $top - 42];
        }
    };
    $add([135, 205, 275], 455);
    $add([845, 915, 985], 455);
    $add([455, 525, 595, 665], 340);
    $add([105, 175, 245], 225);
    $add([875, 945, 1015], 225);
    $add([490, 560, 630], 120);
    $add([390, 470, 550, 630, 710], VS_GROUND);
    return [
        'w' => VS_W, 'h' => VS_H, 'ground' => VS_GROUND,
        'platforms' => $platforms,
        'spots' => $spots,
        // In from the corners, clear of a tablet's touch buttons.
        'starts' => ['host' => ['x' => 200, 'y' => VS_GROUND], 'guest' => ['x' => VS_W - 200, 'y' => VS_GROUND]],
        'physics' => ['gravity' => VS_GRAVITY, 'jump' => VS_JUMP, 'run' => VS_MAX_RUN, 'fall' => VS_MAX_FALL, 'pw' => VS_PLAYER_W, 'ph' => VS_PLAYER_H, 'reach' => VS_REACH],
        'timing' => ['countdown' => VS_COUNTDOWN_MS, 'break' => VS_BREAK_MS, 'lock' => VS_WRONG_LOCK_MS],
    ];
}

// A player's pass to the live relay for this match: "lobby.user.side.expiry.
// signature". Null when the relay is not set up (the game then uses polling).
function vsRelayPass(int $lobbyId, int $userId, string $side): ?array
{
    static $secret = null;
    if ($secret === null) {
        $secret = is_readable(VS_RELAY_SECRET_FILE) ? trim((string)file_get_contents(VS_RELAY_SECRET_FILE)) : '';
    }
    if ($secret === '') {
        return null;
    }
    $payload = $lobbyId . '.' . $userId . '.' . $side . '.' . (time() + 6 * 3600);
    return [
        'token' => $payload . '.' . hash_hmac('sha256', $payload, $secret),
        'port' => VS_RELAY_PORT,
        'tlsPort' => VS_RELAY_TLS_PORT,
    ];
}

function vsNowMs(): int
{
    return (int)round(microtime(true) * 1000);
}

// A short code that is easy to read aloud and type (no 0/O or 1/I/L).
function vsNewCode(): string
{
    $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    $code = '';
    for ($i = 0; $i < 6; $i++) {
        $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    return $code;
}

function vsToken(int $bytes = 8): string
{
    return bin2hex(random_bytes($bytes));
}

// What the page shows of a player: name, character and colours (never more).
function vsPlayer(?int $userId): ?array
{
    global $conn;
    if (!$userId) {
        return null;
    }
    $stmt = $conn->prepare("SELECT id, username, selected_reader, profile_reader_name, profile_top_color, profile_bottom_color, profile_accent_color, profile_card_style, profile_scale, user_role FROM users WHERE id = ?");
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) {
        return null;
    }
    $profile = koobdResolvedProfile($row);
    return [
        'id' => (int)$row['id'],
        'username' => (string)$row['username'],
        'name' => $profile['name'],
        'asset' => $profile['asset'],
        // Each reader character's animation sheet (idle, walk and jump rows).
        'sheet' => koobdCharacterSheet($profile['key']),
        'top' => $profile['top'],
        'bottom' => $profile['bottom'],
    ];
}

function vsLobby(int $lobbyId, bool $forUpdate = false): ?array
{
    global $conn;
    $stmt = $conn->prepare("SELECT * FROM vs_lobbies WHERE id = ?" . ($forUpdate ? ' FOR UPDATE' : ''));
    $stmt->bind_param('i', $lobbyId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

// 'host', 'guest', or null when this user is not in the lobby.
function vsSide(array $lobby, int $userId): ?string
{
    if ((int)$lobby['host_id'] === $userId) {
        return 'host';
    }
    if ($lobby['guest_id'] !== null && (int)$lobby['guest_id'] === $userId) {
        return 'guest';
    }
    return null;
}

// Fair play: an action the server turned down, kept for review.
function vsFlag(int $lobbyId, int $userId, string $kind, string $detail = ''): void
{
    global $conn;
    $stmt = $conn->prepare("INSERT INTO vs_flags (lobby_id, user_id, kind, detail) VALUES (?, ?, ?, ?)");
    $detail = substr($detail, 0, 250);
    $stmt->bind_param('iiss', $lobbyId, $userId, $kind, $detail);
    $stmt->execute();
    $stmt->close();
}

// The word level for a round: the lobby's choice, or with "mixed" one that
// grows with the match (rounds 1-2 easy, 3-4 medium, then hard).
function vsRoundLevel(array $lobby, int $roundNo): string
{
    $level = (string)($lobby['level'] ?? 'mixed');
    if (in_array($level, ['easy', 'medium', 'hard'], true)) {
        return $level;
    }
    return $roundNo <= 2 ? 'easy' : ($roundNo <= 4 ? 'medium' : 'hard');
}

// A new round: a word of the round's level from the host's language - not
// used yet in this match, nor in these two players' recent matches - its
// letters (plus a few others) on random spots, and its two questions.
function vsNewRound(array $lobby, int $roundNo, int $startMs): void
{
    global $conn;
    $lobbyId = (int)$lobby['id'];
    $lang = $lobby['lang'] === 'fil' ? 'fil' : 'en';
    $level = vsRoundLevel($lobby, $roundNo);
    $used = array_column($conn->query("SELECT word FROM vs_rounds WHERE lobby_id = $lobbyId")->fetch_all(), 0);
    $players = implode(',', array_filter([(int)$lobby['host_id'], (int)$lobby['guest_id']]));
    $recent = $players === '' ? [] : array_column($conn->query(
        "SELECT r.word FROM vs_rounds r JOIN vs_lobbies l ON l.id = r.lobby_id
         WHERE (l.host_id IN ($players) OR l.guest_id IN ($players)) AND r.lang = '$lang' AND r.lobby_id <> $lobbyId
         ORDER BY r.id DESC LIMIT 40"
    )->fetch_all(), 0);
    $words = array_values(array_filter(koobdVersusWords($lang), static fn($item) => ($item['lv'] ?? 'medium') === $level));
    $fresh = static fn(array $avoid) => array_values(array_filter($words, static fn($item) => !in_array(strtoupper($item['w']), $avoid, true)));
    $pool = $fresh(array_merge($used, $recent));
    if (!$pool) {
        $pool = $fresh($used);   // all seen lately: at least not twice in one match
    }
    if (!$pool) {
        $pool = $words;          // every word of this level used: start again
    }
    $pick = $pool[random_int(0, count($pool) - 1)];
    $word = strtoupper($pick['w']);

    $arena = koobdVersusArena();
    $spots = $arena['spots'];
    shuffle($spots);
    $letters = [];
    foreach (str_split($word) as $index => $char) {
        $letters[] = ['ch' => $char];
    }
    // A few extra letters to choose between (the word is always completable:
    // every letter it needs is there).
    $extra = min(4, count($spots) - count($letters));
    $alphabet = $lobby['lang'] === 'fil' ? 'ABDEGHIKLMNOPRSTUWY' : 'ABCDEFGHIJKLMNOPRSTUVWY';
    for ($i = 0; $i < $extra; $i++) {
        $letters[] = ['ch' => $alphabet[random_int(0, strlen($alphabet) - 1)]];
    }
    shuffle($letters);
    $layout = [];
    foreach ($letters as $index => $letter) {
        $layout[] = ['id' => vsToken(4), 'ch' => $letter['ch'], 'x' => $spots[$index]['x'], 'y' => $spots[$index]['y']];
    }
    $questions = json_encode(['mc' => $pick['mc'], 'tf' => $pick['tf']]);
    $layoutJson = json_encode($layout);
    $hint = (string)($pick['h'] ?? '');
    $stmt = $conn->prepare("INSERT IGNORE INTO vs_rounds (lobby_id, round_no, word, lang, questions_json, layout_json, start_ms, hint, level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param('iissssiss', $lobbyId, $roundNo, $word, $lang, $questions, $layoutJson, $startMs, $hint, $level);
    $stmt->execute();
    $stmt->close();
    // Both players start the round at their own corner.
    $starts = $arena['starts'];
    foreach (['host' => (int)$lobby['host_id'], 'guest' => (int)$lobby['guest_id']] as $side => $userId) {
        if (!$userId) {
            continue;
        }
        $x = $starts[$side]['x'];
        $y = $starts[$side]['y'];
        $reset = $conn->prepare(
            "INSERT INTO vs_positions (lobby_id, user_id, pos_x, pos_y, trail, sample_ms) VALUES (?, ?, ?, ?, '[]', ?)
             ON DUPLICATE KEY UPDATE pos_x = VALUES(pos_x), pos_y = VALUES(pos_y), trail = '[]', sample_ms = VALUES(sample_ms)"
        );
        $reset->bind_param('iiddi', $lobbyId, $userId, $x, $y, $startMs);
        $reset->execute();
        $reset->close();
    }
}

// A question about the round's word for this player: the multiple choice
// first, the true or false after a wrong answer, and so on in turn. The
// right answer stays on the server.
function vsMakeQuestion(array $round, int $variant): array
{
    $questions = json_decode((string)$round['questions_json'], true);
    if ($variant % 2 === 0) {
        [$prompt, $choices] = $questions['mc'];
        $order = range(0, count($choices) - 1);
        shuffle($order);
        $shown = array_map(static fn($index) => $choices[$index], $order);
        return ['type' => 'mc', 'prompt' => $prompt, 'choices' => $shown, 'answer' => array_search(0, $order, true)];
    }
    [$statement, $truth] = $questions['tf'];
    return ['type' => 'tf', 'prompt' => $statement, 'choices' => ['True', 'False'], 'answer' => $truth ? 0 : 1];
}

// The match's record, for its two players: the summary and statistics.
function vsMatchSummary(array $lobby): array
{
    global $conn;
    $lobbyId = (int)$lobby['id'];
    $rounds = $conn->query("SELECT * FROM vs_rounds WHERE lobby_id = $lobbyId AND winner_id IS NOT NULL ORDER BY round_no")->fetch_all(MYSQLI_ASSOC);
    $players = ['host' => vsPlayer((int)$lobby['host_id']), 'guest' => vsPlayer((int)$lobby['guest_id'])];
    $stats = [];
    foreach ($players as $side => $player) {
        $stats[$side] = ['rounds' => 0, 'words' => 0, 'correct' => 0, 'wrong' => 0, 'letters' => 0, 'wrongPickups' => 0, 'wordMs' => [], 'answerMs' => [], 'totalMs' => []];
    }
    $roundRows = [];
    $ids = array_map(static fn($round) => (int)$round['id'], $rounds);
    $progress = [];
    if ($ids) {
        foreach ($conn->query("SELECT * FROM vs_progress WHERE round_id IN (" . implode(',', $ids) . ")")->fetch_all(MYSQLI_ASSOC) as $row) {
            $progress[(int)$row['round_id']][(int)$row['user_id']] = $row;
        }
    }
    foreach ($rounds as $round) {
        $entry = ['no' => (int)$round['round_no'], 'word' => $round['word'], 'lang' => $round['lang'], 'winner' => null, 'reason' => $round['end_reason'], 'players' => []];
        foreach ($players as $side => $player) {
            if (!$player) {
                continue;
            }
            $row = $progress[(int)$round['id']][$player['id']] ?? null;
            $wordMs = $row && $row['word_done_ms'] !== null ? max(0, (int)$row['word_done_ms'] - (int)$round['start_ms']) : null;
            $answerMs = $row && $row['correct_ms'] !== null && $row['word_done_ms'] !== null ? max(0, (int)$row['correct_ms'] - (int)$row['word_done_ms']) : null;
            $won = (int)$round['winner_id'] === $player['id'];
            if ($won) {
                $stats[$side]['rounds']++;
                $entry['winner'] = $side;
            }
            if ($row) {
                $stats[$side]['letters'] += (int)$row['letters_collected'];
                $stats[$side]['wrongPickups'] += (int)$row['wrong_pickups'];
                $stats[$side]['wrong'] += (int)$row['wrong_answers'];
                if ($row['correct_ms'] !== null) {
                    $stats[$side]['correct']++;
                }
            }
            if ($wordMs !== null) {
                $stats[$side]['words']++;
                $stats[$side]['wordMs'][] = $wordMs;
            }
            if ($answerMs !== null) {
                $stats[$side]['answerMs'][] = $answerMs;
                $stats[$side]['totalMs'][] = $wordMs + $answerMs;
            }
            $entry['players'][$side] = [
                'wordMs' => $wordMs,
                'hearts' => $row ? (int)$row['hearts'] : VS_HEARTS,
                'answered' => $row && $row['correct_ms'] !== null ? 'correct' : ($row && (int)$row['wrong_answers'] > 0 ? 'wrong' : ($wordMs !== null ? 'none' : null)),
                'wrongAnswers' => $row ? (int)$row['wrong_answers'] : 0,
                'answerMs' => $answerMs,
            ];
        }
        $roundRows[] = $entry;
    }
    $average = static fn(array $values) => $values ? (int)round(array_sum($values) / count($values)) : null;
    foreach ($stats as $side => $item) {
        $stats[$side]['avgWordMs'] = $average($item['wordMs']);
        $stats[$side]['avgAnswerMs'] = $average($item['answerMs']);
        $stats[$side]['avgTotalMs'] = $average($item['totalMs']);
        unset($stats[$side]['wordMs'], $stats[$side]['answerMs'], $stats[$side]['totalMs']);
    }
    $started = $lobby['started_at'] ? strtotime($lobby['started_at']) : null;
    $finished = $lobby['finished_at'] ? strtotime($lobby['finished_at']) : null;
    return [
        'players' => $players,
        'stats' => $stats,
        'rounds' => $roundRows,
        'durationS' => $started && $finished ? max(0, $finished - $started) : null,
    ];
}
