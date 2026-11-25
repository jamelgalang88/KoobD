<?php
// Versus Mode's server (js/versus-lobby.js, js/versus-game.js). Every request
// is a JSON POST from a signed-in player; every lobby action checks that the
// player belongs to that lobby. The server decides everything that counts:
// the word, which letters were collected (in order, within reach, once
// each), whether an answer is right, who won the round, the score and the
// end of the match. Players only ever learn their own progress - the
// opponent's letters, word and answers stay here until the round is over.
//
//   create  { win: 3|4|5, lang: en|fil }        -> { lobby }
//   join    { code }                            -> { lobby }
//   ready   { lobby, ready }   leave { lobby }   cancel { lobby }   start { lobby }
//   state   { lobby, trail: [[ageMs, x, y, facing, running, grounded, vy], ...] }
//   collect { lobby, round, letter, x, y, event }
//   answer  { lobby, round, token, choice, event }
//   forfeit { lobby }          rematch { lobby }  -> { lobby }
require_once __DIR__ . '/versus_lib.php';

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

function vsFail(int $code, string $message, array $extra = []): void
{
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $message] + $extra);
    exit();
}
function vsDone(array $data = []): void
{
    echo json_encode(['success' => true] + $data);
    exit();
}

$user = koobdCurrentUser($conn);
if (!$user) {
    vsFail(401, 'Please sign in again.');
}
koobdMissionRequireFeature($user, 'versus', true);
$me = (int)$user['id'];
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) {
    vsFail(400, 'Invalid request.');
}
$input = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($input)) {
    vsFail(400, 'Invalid request.');
}
$action = (string)($input['action'] ?? '');
$now = vsNowMs();

// The lobby this request is about, which this player must be in.
function vsMine(array $input, int $me, bool $forUpdate = false): array
{
    $lobby = vsLobby((int)($input['lobby'] ?? 0), $forUpdate);
    $side = $lobby ? vsSide($lobby, $me) : null;
    if (!$lobby || !$side) {
        if ($lobby) {
            vsFlag((int)$lobby['id'], $me, 'access', 'not a player of this lobby');
        }
        vsFail(404, 'That lobby is not available.');
    }
    return [$lobby, $side];
}

// A one-time id for an action: true the first time, false if already handled.
function vsFirstTime(int $lobbyId, int $me, $eventId): bool
{
    global $conn;
    $eventId = is_string($eventId) && preg_match('/^[A-Za-z0-9_-]{6,24}$/', $eventId) ? $eventId : '';
    if ($eventId === '') {
        vsFail(400, 'Invalid request.');
    }
    $stmt = $conn->prepare("INSERT IGNORE INTO vs_events (lobby_id, user_id, event_id) VALUES (?, ?, ?)");
    $stmt->bind_param('iis', $lobbyId, $me, $eventId);
    $stmt->execute();
    $first = $stmt->affected_rows === 1;
    $stmt->close();
    return $first;
}

// Old lobbies tidy themselves away: a waiting lobby whose host has gone (or
// that waited half an hour) expires; a match both players left is abandoned.
function vsTidyOld(): void
{
    global $conn, $now;
    $quiet = $now - 120000;
    $conn->query("UPDATE vs_lobbies SET status = 'expired' WHERE status IN ('waiting', 'ready') AND (host_seen_ms < $quiet OR created_at < NOW() - INTERVAL 30 MINUTE)");
    $gone = $now - 600000;
    $conn->query("UPDATE vs_lobbies SET status = 'abandoned', result = 'abandoned', finished_at = NOW() WHERE status = 'playing' AND host_seen_ms < $gone AND guest_seen_ms < $gone");
}

// This player's progress in a round (made on first use).
function vsProgress(int $roundId, int $userId): array
{
    global $conn;
    $conn->query("INSERT IGNORE INTO vs_progress (round_id, user_id, collected_json) VALUES ($roundId, $userId, '[]')");
    return $conn->query("SELECT * FROM vs_progress WHERE round_id = $roundId AND user_id = $userId")->fetch_assoc();
}

function vsCurrentRound(int $lobbyId): ?array
{
    global $conn;
    $row = $conn->query("SELECT * FROM vs_rounds WHERE lobby_id = $lobbyId ORDER BY round_no DESC LIMIT 1")->fetch_assoc();
    return $row ?: null;
}

// Ends the match: the winner, the reason ('win' or 'forfeit') and the time.
function vsFinish(int $lobbyId, ?int $winnerId, string $result): void
{
    global $conn;
    $stmt = $conn->prepare("UPDATE vs_lobbies SET status = 'finished', winner_id = ?, result = ?, finished_at = NOW() WHERE id = ? AND status = 'playing'");
    $stmt->bind_param('isi', $winnerId, $result, $lobbyId);
    $stmt->execute();
    $stmt->close();
}

// A player's public view of the lobby (both players' names and characters,
// the settings and the score - nothing private).
function vsLobbyView(array $lobby, string $side): array
{
    return [
        'id' => (int)$lobby['id'],
        'code' => $lobby['code'],
        'status' => $lobby['status'],
        'win' => (int)$lobby['win_target'],
        'lang' => $lobby['lang'],
        'level' => $lobby['level'] ?? 'mixed',
        'host' => vsPlayer((int)$lobby['host_id']),
        'guest' => vsPlayer($lobby['guest_id'] !== null ? (int)$lobby['guest_id'] : null),
        'guestReady' => (int)$lobby['guest_ready'] === 1,
        'score' => ['host' => (int)$lobby['host_score'], 'guest' => (int)$lobby['guest_score']],
        'me' => $side,
        'winner' => $lobby['winner_id'] === null ? null : ((int)$lobby['winner_id'] === (int)$lobby['host_id'] ? 'host' : 'guest'),
        'result' => $lobby['result'],
        'rematch' => $lobby['rematch_lobby_id'] === null ? null : (int)$lobby['rematch_lobby_id'],
    ];
}

// Movement reports, checked against the arena's limits (with room for
// network delay). Returns the position to put the player back at when a
// report was impossible, or null when all was accepted.
function vsAcceptTrail(array $lobby, int $me, $trail, int $now): ?array
{
    global $conn;
    if (!is_array($trail) || !$trail) {
        return null;
    }
    $lobbyId = (int)$lobby['id'];
    $last = $conn->query("SELECT pos_x, pos_y, sample_ms, rejected FROM vs_positions WHERE lobby_id = $lobbyId AND user_id = $me")->fetch_assoc();
    $px = $last ? (float)$last['pos_x'] : null;
    $py = $last ? (float)$last['pos_y'] : null;
    $pt = $last ? (int)$last['sample_ms'] : 0;
    $kept = [];
    $problem = '';
    foreach (array_slice($trail, -30) as $sample) {
        if (!is_array($sample) || count($sample) < 7 || !is_numeric($sample[0]) || !is_numeric($sample[1]) || !is_numeric($sample[2])) {
            $problem = 'bad sample';
            break;
        }
        $t = $now - max(0, min(5000, (int)$sample[0]));
        $x = (float)$sample[1];
        $y = (float)$sample[2];
        if ($x < 0 || $x > VS_W || $y < 0 || $y > VS_GROUND + 2) {
            $problem = 'outside the arena';
            break;
        }
        if ($px !== null && $t >= $pt) {
            $dt = max(40, $t - $pt) / 1000;
            if (abs($x - $px) > VS_MAX_RUN * $dt * 1.35 + 30) {
                $problem = sprintf('moved %.0f in %.2fs', abs($x - $px), $dt);
                break;
            }
            $up = $py - $y;
            if ($up > VS_JUMP * $dt * 1.25 + 30 || -$up > VS_MAX_FALL * $dt * 1.25 + 40) {
                $problem = sprintf('rose/fell %.0f in %.2fs', $up, $dt);
                break;
            }
        }
        if ($t >= $pt) {
            $px = $x;
            $py = $y;
            $pt = $t;
        }
        $kept[] = [max(0, min(5000, (int)$sample[0])), round($x, 1), round($y, 1), (int)$sample[3] < 0 ? -1 : 1, empty($sample[4]) ? 0 : 1, empty($sample[5]) ? 0 : 1, round(max(-3000, min(3000, (float)$sample[6])), 1)];
    }
    if ($kept) {
        $json = json_encode($kept);
        $stmt = $conn->prepare(
            "INSERT INTO vs_positions (lobby_id, user_id, pos_x, pos_y, trail, sample_ms) VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE pos_x = VALUES(pos_x), pos_y = VALUES(pos_y), trail = VALUES(trail), sample_ms = VALUES(sample_ms)"
        );
        $stmt->bind_param('iiddsi', $lobbyId, $me, $px, $py, $json, $now);
        $stmt->execute();
        $stmt->close();
    }
    if ($problem === '') {
        return null;
    }
    // Rejected: the player goes back to the last accepted place. Repeats are
    // noted for review (every fifth, so a laggy connection does not flood it).
    $rejected = $last ? (int)$last['rejected'] + 1 : 1;
    $conn->query("UPDATE vs_positions SET rejected = $rejected WHERE lobby_id = $lobbyId AND user_id = $me");
    if ($rejected % 5 === 1) {
        vsFlag($lobbyId, $me, 'movement', $problem . " (rejection $rejected)");
    }
    return $px === null ? null : ['x' => $px, 'y' => $py];
}

vsTidyOld();

switch ($action) {
    case 'create': {
        $win = (int)($input['win'] ?? 3);
        $lang = ($input['lang'] ?? 'en') === 'fil' ? 'fil' : 'en';
        $level = in_array($input['level'] ?? '', ['easy', 'medium', 'hard'], true) ? $input['level'] : 'mixed';
        if (!in_array($win, [3, 4, 5], true)) {
            vsFail(422, 'Choose first to 3, 4 or 5 wins.');
        }
        // One lobby at a time: any other waiting lobby of this player closes.
        $conn->query("UPDATE vs_lobbies SET status = 'cancelled' WHERE host_id = $me AND status IN ('waiting', 'ready')");
        $conn->query("UPDATE vs_lobbies SET guest_id = NULL, guest_ready = 0, status = 'waiting' WHERE guest_id = $me AND status IN ('waiting', 'ready')");
        for ($try = 0; $try < 8; $try++) {
            $code = vsNewCode();
            $stmt = $conn->prepare("INSERT IGNORE INTO vs_lobbies (code, host_id, win_target, lang, level, host_seen_ms) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->bind_param('siissi', $code, $me, $win, $lang, $level, $now);
            $stmt->execute();
            $id = (int)$stmt->insert_id;
            $stmt->close();
            if ($id) {
                vsDone(['lobby' => $id, 'code' => $code]);
            }
        }
        vsFail(500, 'The lobby could not be made. Please try again.');
    }

    case 'join': {
        $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($input['code'] ?? '')));
        if (strlen($code) !== 6) {
            vsFail(422, 'Lobby codes have 6 letters and numbers.');
        }
        $conn->begin_transaction();
        $stmt = $conn->prepare("SELECT * FROM vs_lobbies WHERE code = ? FOR UPDATE");
        $stmt->bind_param('s', $code);
        $stmt->execute();
        $lobby = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        $reason = '';
        if (!$lobby) {
            $reason = 'No lobby has that code. Check it with your classmate.';
        } elseif ((int)$lobby['host_id'] === $me) {
            $reason = 'This is your own lobby. Share the code with a classmate instead.';
        } elseif ($lobby['guest_id'] !== null && (int)$lobby['guest_id'] === $me && in_array($lobby['status'], ['waiting', 'ready', 'playing'], true)) {
            $conn->commit();
            vsDone(['lobby' => (int)$lobby['id']]); // already in it
        } elseif (in_array($lobby['status'], ['expired', 'cancelled'], true)) {
            $reason = 'That lobby has closed. Ask your classmate for a new code.';
        } elseif (in_array($lobby['status'], ['playing', 'finished', 'abandoned'], true)) {
            $reason = 'That match has already started.';
        } elseif ($lobby['guest_id'] !== null) {
            $reason = 'That lobby is full: it already has two players.';
        }
        if ($reason !== '') {
            $conn->rollback();
            vsFail(409, $reason);
        }
        // Leaving any other waiting lobby first.
        $conn->query("UPDATE vs_lobbies SET status = 'cancelled' WHERE host_id = $me AND status IN ('waiting', 'ready')");
        $conn->query("UPDATE vs_lobbies SET guest_id = NULL, guest_ready = 0, status = 'waiting' WHERE guest_id = $me AND status IN ('waiting', 'ready') AND id <> " . (int)$lobby['id']);
        $update = $conn->prepare("UPDATE vs_lobbies SET guest_id = ?, guest_ready = 0, guest_seen_ms = ?, status = 'ready' WHERE id = ? AND guest_id IS NULL");
        $update->bind_param('iii', $me, $now, $lobby['id']);
        $update->execute();
        $joined = $update->affected_rows === 1;
        $update->close();
        $conn->commit();
        if (!$joined) {
            vsFail(409, 'That lobby is full: it already has two players.');
        }
        vsDone(['lobby' => (int)$lobby['id']]);
    }

    case 'ready': {
        [$lobby, $side] = vsMine($input, $me);
        if ($side !== 'guest' || !in_array($lobby['status'], ['waiting', 'ready'], true)) {
            vsFail(409, 'Only the joining player marks themselves ready, before the match.');
        }
        $ready = !empty($input['ready']) ? 1 : 0;
        $conn->query("UPDATE vs_lobbies SET guest_ready = $ready WHERE id = " . (int)$lobby['id']);
        vsDone();
    }

    case 'leave':
    case 'cancel': {
        [$lobby, $side] = vsMine($input, $me);
        if (!in_array($lobby['status'], ['waiting', 'ready'], true)) {
            vsFail(409, 'The match has already started.');
        }
        if ($side === 'host') {
            $conn->query("UPDATE vs_lobbies SET status = 'cancelled' WHERE id = " . (int)$lobby['id']);
        } else {
            $conn->query("UPDATE vs_lobbies SET guest_id = NULL, guest_ready = 0, status = 'waiting' WHERE id = " . (int)$lobby['id']);
        }
        vsDone();
    }

    case 'start': {
        $conn->begin_transaction();
        [$lobby, $side] = vsMine($input, $me, true);
        if ($side !== 'host') {
            $conn->rollback();
            vsFail(403, 'Only the host can start the match.');
        }
        if ($lobby['status'] === 'playing') {
            $conn->commit();
            vsDone();
        }
        if ($lobby['guest_id'] === null || (int)$lobby['guest_ready'] !== 1 || $lobby['status'] !== 'ready') {
            $conn->rollback();
            vsFail(409, 'Wait until your opponent has joined and is ready.');
        }
        $conn->query("UPDATE vs_lobbies SET status = 'playing', started_at = NOW(), host_seen_ms = $now, guest_seen_ms = $now WHERE id = " . (int)$lobby['id']);
        vsNewRound($lobby, 1, $now + VS_COUNTDOWN_MS);
        $conn->commit();
        vsDone();
    }

    case 'state': {
        [$lobby, $side] = vsMine($input, $me);
        $lobbyId = (int)$lobby['id'];
        $conn->query("UPDATE vs_lobbies SET {$side}_seen_ms = $now WHERE id = $lobbyId");
        $other = $side === 'host' ? 'guest' : 'host';
        $otherId = $other === 'host' ? (int)$lobby['host_id'] : (int)$lobby['guest_id'];
        $otherSeen = (int)$lobby[$other . '_seen_ms'];
        $correction = null;
        $roundView = null;

        if ($lobby['status'] === 'playing') {
            $correction = vsAcceptTrail($lobby, $me, $input['trail'] ?? null, $now);
            // An opponent gone too long forfeits (a short drop does not).
            if ($otherId && $now - $otherSeen > VS_RECONNECT_MS) {
                vsFinish($lobbyId, $me, 'forfeit');
            }
            // The next round, a moment after a round is won.
            $round = vsCurrentRound($lobbyId);
            if ($round && $round['ended_ms'] !== null && $now >= (int)$round['ended_ms'] + VS_BREAK_MS) {
                $conn->begin_transaction();
                $locked = vsLobby($lobbyId, true);
                if ($locked['status'] === 'playing') {
                    vsNewRound($locked, (int)$round['round_no'] + 1, $now + VS_COUNTDOWN_MS);
                }
                $conn->commit();
            }
            $lobby = vsLobby($lobbyId);
        }

        $round = in_array($lobby['status'], ['playing', 'finished'], true) ? vsCurrentRound($lobbyId) : null;
        if ($round) {
            $mine = vsProgress((int)$round['id'], $me);
            $word = (string)$round['word'];
            $collected = json_decode((string)$mine['collected_json'], true) ?: [];
            $filled = array_fill(0, strlen($word), '');
            for ($i = 0; $i < (int)$mine['next_index']; $i++) {
                $filled[$i] = $word[$i];
            }
            $question = null;
            if ($mine['question_token'] !== null && $mine['correct_ms'] === null && $round['winner_id'] === null) {
                $q = json_decode((string)$mine['question_json'], true);
                $question = ['token' => $mine['question_token'], 'type' => $q['type'], 'prompt' => $q['prompt'], 'choices' => $q['choices']];
            }
            $over = $round['winner_id'] !== null;
            // Both players' hearts (public, shown beside each name).
            $hearts = ['host' => VS_HEARTS, 'guest' => VS_HEARTS];
            foreach ($conn->query("SELECT user_id, hearts FROM vs_progress WHERE round_id = " . (int)$round['id'])->fetch_all(MYSQLI_ASSOC) as $row) {
                $hearts[(int)$row['user_id'] === (int)$lobby['host_id'] ? 'host' : 'guest'] = (int)$row['hearts'];
            }
            $roundView = [
                'id' => (int)$round['id'],
                'no' => (int)$round['round_no'],
                'startMs' => (int)$round['start_ms'],
                'endedMs' => $round['ended_ms'] === null ? null : (int)$round['ended_ms'],
                'length' => strlen($word),
                // The hint describes the word without saying it; both players see it.
                'hint' => (string)($round['hint'] ?? ''),
                'level' => $round['level'] ?? null,
                'hearts' => $hearts,
                'maxHearts' => VS_HEARTS,
                'reason' => $round['end_reason'],
                // The arena's letters (public: both players see the same ones);
                // which ones this player has taken is theirs alone.
                'letters' => json_decode((string)$round['layout_json'], true),
                'mine' => [
                    'collected' => $collected,
                    'filled' => $filled,
                    'next' => (int)$mine['next_index'],
                    'done' => $mine['word_done_ms'] !== null,
                    'question' => $question,
                    'lockedMs' => max(0, (int)$mine['locked_until_ms'] - $now),
                    'wrongAnswers' => (int)$mine['wrong_answers'],
                    'tried' => json_decode((string)($mine['tried_json'] ?? ''), true) ?: [],
                ],
                'winner' => $over ? ((int)$round['winner_id'] === (int)$lobby['host_id'] ? 'host' : 'guest') : null,
                // The word is told only once the round is over.
                'word' => $over ? $word : null,
            ];
        }

        $opponent = null;
        if ($otherId && $lobby['status'] === 'playing') {
            $pos = $conn->query("SELECT pos_x, pos_y, trail, sample_ms FROM vs_positions WHERE lobby_id = $lobbyId AND user_id = $otherId")->fetch_assoc();
            $opponent = [
                'connected' => $now - $otherSeen < VS_AWAY_MS,
                'awayMs' => max(0, $now - $otherSeen),
                'x' => $pos ? (float)$pos['pos_x'] : null,
                'y' => $pos ? (float)$pos['pos_y'] : null,
                'at' => $pos ? (int)$pos['sample_ms'] : 0,
                'trail' => $pos && $now - (int)$pos['sample_ms'] < 4000 ? (json_decode((string)$pos['trail'], true) ?: []) : [],
            ];
        } elseif ($otherId) {
            $opponent = ['connected' => $now - $otherSeen < VS_AWAY_MS, 'awayMs' => max(0, $now - $otherSeen)];
        }
        // The pass to the live relay (only asked for once, while playing).
        $relay = $lobby['status'] === 'playing' && !empty($input['wantRelay']) ? vsRelayPass($lobbyId, $me, $side) : null;
        vsDone(['now' => $now, 'lobby' => vsLobbyView($lobby, $side), 'round' => $roundView, 'opponent' => $opponent, 'correction' => $correction, 'relay' => $relay]);
    }

    case 'collect': {
        [$lobby, $side] = vsMine($input, $me);
        $lobbyId = (int)$lobby['id'];
        if ($lobby['status'] !== 'playing') {
            vsFail(409, 'The match is not running.');
        }
        $round = vsCurrentRound($lobbyId);
        if (!$round || (int)($input['round'] ?? 0) !== (int)$round['id']) {
            vsFlag($lobbyId, $me, 'stale', 'collect for another round');
            vsFail(409, 'That round is over.');
        }
        if (!vsFirstTime($lobbyId, $me, $input['event'] ?? null)) {
            vsDone(['repeat' => true]);
        }
        if ($now < (int)$round['start_ms'] || $round['winner_id'] !== null) {
            vsFlag($lobbyId, $me, 'early', 'collect outside the round');
            vsFail(409, 'The round is not running.');
        }
        $mine = vsProgress((int)$round['id'], $me);
        // Not too often (a player taps; a script hammers).
        if ($now - (int)$mine['last_action_ms'] < 120) {
            vsFlag($lobbyId, $me, 'rate', 'collect too often');
            vsFail(429, 'Slow down a little.');
        }
        $conn->query("UPDATE vs_progress SET last_action_ms = $now WHERE round_id = " . (int)$round['id'] . " AND user_id = $me");
        if ($mine['word_done_ms'] !== null) {
            vsFail(409, 'You already finished this word.');
        }
        $letters = json_decode((string)$round['layout_json'], true);
        $letter = null;
        foreach ($letters as $item) {
            if ($item['id'] === (string)($input['letter'] ?? '')) {
                $letter = $item;
            }
        }
        $collected = json_decode((string)$mine['collected_json'], true) ?: [];
        if (!$letter || in_array($letter['id'], $collected, true)) {
            vsFlag($lobbyId, $me, 'letter', $letter ? 'collected twice' : 'unknown letter');
            vsFail(409, 'That letter is not there.');
        }
        // Within reach: of the letter where the player says they are, and that
        // place close to where the server last accepted them.
        $x = is_numeric($input['x'] ?? null) ? (float)$input['x'] : -9999;
        $y = is_numeric($input['y'] ?? null) ? (float)$input['y'] : -9999;
        $pos = $conn->query("SELECT pos_x, pos_y, sample_ms FROM vs_positions WHERE lobby_id = $lobbyId AND user_id = $me")->fetch_assoc();
        $middleY = $y - VS_PLAYER_H / 2;
        $near = hypot($x - $letter['x'], $middleY - $letter['y']) <= VS_REACH + 25;
        $drift = $pos ? hypot($x - (float)$pos['pos_x'], $y - (float)$pos['pos_y']) : 9999;
        $allowed = $pos ? VS_MAX_RUN * max(0.25, ($now - (int)$pos['sample_ms']) / 1000) * 1.4 + 120 : 0;
        if (!$near || $drift > $allowed) {
            vsFlag($lobbyId, $me, 'reach', sprintf('letter at %.0f,%.0f, player %.0f,%.0f, server %.0f,%.0f', $letter['x'], $letter['y'], $x, $y, $pos['pos_x'] ?? -1, $pos['pos_y'] ?? -1));
            vsFail(409, 'Get closer to the letter.');
        }
        $word = (string)$round['word'];
        $next = (int)$mine['next_index'];
        if ($letter['ch'] !== $word[$next]) {
            // Not the next letter: it stays, and it costs a heart - once. The
            // same letter tried again for the same slot costs nothing.
            $roundId = (int)$round['id'];
            $tried = json_decode((string)($mine['tried_json'] ?? ''), true) ?: [];
            $key = $next . ':' . $letter['ch'];
            if (in_array($key, $tried, true)) {
                vsDone(['correct' => false, 'again' => true, 'hearts' => (int)$mine['hearts'], 'tried' => $tried, 'message' => 'You already tried that letter. No heart lost.']);
            }
            $tried[] = $key;
            $triedJson = json_encode($tried);
            $hearts = max(0, (int)$mine['hearts'] - 1);
            $stmt = $conn->prepare("UPDATE vs_progress SET wrong_pickups = wrong_pickups + 1, hearts = ?, tried_json = ? WHERE round_id = ? AND user_id = ? AND hearts = ?");
            $before = (int)$mine['hearts'];
            $stmt->bind_param('isiii', $hearts, $triedJson, $roundId, $me, $before);
            $stmt->execute();
            $changed = $stmt->affected_rows === 1;
            $stmt->close();
            if (!$changed) {
                vsFail(409, 'That letter was already counted.');
            }
            $out = false;
            if ($hearts === 0) {
                // No hearts left: the opponent wins the round (and, at the
                // target score, the match) - unless the round already ended.
                $conn->begin_transaction();
                $locked = vsLobby($lobbyId, true);
                $fresh = $conn->query("SELECT winner_id FROM vs_rounds WHERE id = $roundId FOR UPDATE")->fetch_assoc();
                $other = $side === 'host' ? 'guest' : 'host';
                $otherId = (int)$locked[$other . '_id'];
                if ($locked['status'] === 'playing' && $fresh['winner_id'] === null && $otherId) {
                    $conn->query("UPDATE vs_rounds SET winner_id = $otherId, ended_ms = $now, end_reason = 'hearts' WHERE id = $roundId");
                    $conn->query("UPDATE vs_lobbies SET {$other}_score = {$other}_score + 1 WHERE id = $lobbyId");
                    if ((int)$locked[$other . '_score'] + 1 >= (int)$locked['win_target']) {
                        vsFinish($lobbyId, $otherId, 'win');
                    }
                    $out = true;
                }
                $conn->commit();
            }
            vsDone(['correct' => false, 'hearts' => $hearts, 'tried' => $tried, 'out' => $out,
                'message' => $hearts > 0 ? 'Wrong letter! You lost a heart.' : 'Out of hearts!']);
        }
        $collected[] = $letter['id'];
        $next++;
        $done = $next >= strlen($word);
        $json = json_encode($collected);
        $roundId = (int)$round['id'];
        $stmt = $conn->prepare(
            "UPDATE vs_progress SET collected_json = ?, next_index = ?, letters_collected = letters_collected + 1, word_done_ms = IF(?, ?, word_done_ms)
             WHERE round_id = ? AND user_id = ? AND next_index = ?"
        );
        $doneFlag = $done ? 1 : 0;
        $previous = $next - 1;
        $stmt->bind_param('siiiiii', $json, $next, $doneFlag, $now, $roundId, $me, $previous);
        $stmt->execute();
        $changed = $stmt->affected_rows === 1;
        $stmt->close();
        if (!$changed) {
            vsFail(409, 'That letter was already counted.');
        }
        $question = null;
        if ($done) {
            // The word is complete: its first question (the answer stays here).
            $q = vsMakeQuestion($round, 0);
            $token = vsToken(6);
            $qJson = json_encode($q);
            $set = $conn->prepare("UPDATE vs_progress SET question_json = ?, question_token = ?, q_variant = 0 WHERE round_id = ? AND user_id = ?");
            $set->bind_param('ssii', $qJson, $token, $roundId, $me);
            $set->execute();
            $set->close();
            $question = ['token' => $token, 'type' => $q['type'], 'prompt' => $q['prompt'], 'choices' => $q['choices']];
        }
        vsDone(['correct' => true, 'index' => $next - 1, 'ch' => $letter['ch'], 'done' => $done, 'question' => $question]);
    }

    case 'answer': {
        [$lobby, $side] = vsMine($input, $me);
        $lobbyId = (int)$lobby['id'];
        $round = vsCurrentRound($lobbyId);
        if ($lobby['status'] !== 'playing' || !$round || (int)($input['round'] ?? 0) !== (int)$round['id']) {
            vsFail(409, 'That round is over.');
        }
        if (!vsFirstTime($lobbyId, $me, $input['event'] ?? null)) {
            vsDone(['repeat' => true]);
        }
        $roundId = (int)$round['id'];
        $mine = vsProgress($roundId, $me);
        if ($mine['word_done_ms'] === null || $mine['question_token'] === null) {
            vsFlag($lobbyId, $me, 'early', 'answer before finishing the word');
            vsFail(409, 'Finish the word first.');
        }
        if ((string)($input['token'] ?? '') !== $mine['question_token']) {
            vsFlag($lobbyId, $me, 'question', 'answer for another question');
            vsFail(409, 'That question has changed.');
        }
        if ($now < (int)$mine['locked_until_ms']) {
            vsFlag($lobbyId, $me, 'rate', 'answer while waiting');
            vsFail(429, 'Wait a moment before answering again.');
        }
        if ($mine['correct_ms'] !== null || $round['winner_id'] !== null) {
            vsDone(['correct' => $mine['correct_ms'] !== null, 'over' => true]);
        }
        $q = json_decode((string)$mine['question_json'], true);
        $choice = is_numeric($input['choice'] ?? null) ? (int)$input['choice'] : -1;
        if ($choice < 0 || $choice >= count($q['choices'])) {
            vsFail(422, 'Choose one of the answers.');
        }
        if ($choice !== (int)$q['answer']) {
            // Wrong: no point; after a short wait, the other question about the word.
            $variant = (int)$mine['q_variant'] + 1;
            $next = vsMakeQuestion($round, $variant);
            $token = vsToken(6);
            $json = json_encode($next);
            $until = $now + VS_WRONG_LOCK_MS;
            $stmt = $conn->prepare("UPDATE vs_progress SET wrong_answers = wrong_answers + 1, locked_until_ms = ?, q_variant = ?, question_json = ?, question_token = ? WHERE round_id = ? AND user_id = ? AND question_token = ?");
            $stmt->bind_param('iissiis', $until, $variant, $json, $token, $roundId, $me, $mine['question_token']);
            $stmt->execute();
            $stmt->close();
            vsDone(['correct' => false, 'lockedMs' => VS_WRONG_LOCK_MS, 'question' => ['token' => $token, 'type' => $next['type'], 'prompt' => $next['prompt'], 'choices' => $next['choices']]]);
        }
        // Right: this player wins the round - unless the opponent got there
        // first (the lobby row is locked, so only one can).
        $conn->begin_transaction();
        $locked = vsLobby($lobbyId, true);
        $fresh = $conn->query("SELECT winner_id FROM vs_rounds WHERE id = $roundId FOR UPDATE")->fetch_assoc();
        $won = false;
        if ($locked['status'] === 'playing' && $fresh['winner_id'] === null) {
            $conn->query("UPDATE vs_rounds SET winner_id = $me, ended_ms = $now, end_reason = 'answer' WHERE id = $roundId");
            $conn->query("UPDATE vs_progress SET correct_ms = $now WHERE round_id = $roundId AND user_id = $me");
            $conn->query("UPDATE vs_lobbies SET {$side}_score = {$side}_score + 1 WHERE id = $lobbyId");
            $score = (int)$locked[$side . '_score'] + 1;
            if ($score >= (int)$locked['win_target']) {
                vsFinish($lobbyId, $me, 'win');
            }
            $won = true;
        }
        $conn->commit();
        vsDone(['correct' => true, 'won' => $won]);
    }

    case 'forfeit': {
        [$lobby, $side] = vsMine($input, $me);
        if ($lobby['status'] !== 'playing') {
            vsFail(409, 'The match is not running.');
        }
        $winner = $side === 'host' ? (int)$lobby['guest_id'] : (int)$lobby['host_id'];
        vsFinish((int)$lobby['id'], $winner ?: null, 'forfeit');
        vsDone();
    }

    case 'rematch': {
        // A new lobby with the same settings, for the same two players: the
        // other player is offered it on their summary page.
        $conn->begin_transaction();
        [$lobby, $side] = vsMine($input, $me, true);
        if ($lobby['status'] !== 'finished' && $lobby['status'] !== 'abandoned') {
            $conn->rollback();
            vsFail(409, 'The match is not over yet.');
        }
        if ($lobby['rematch_lobby_id'] !== null) {
            $existing = vsLobby((int)$lobby['rematch_lobby_id']);
            $conn->commit();
            if ($existing && in_array($existing['status'], ['waiting', 'ready', 'playing'], true)) {
                if ((int)$existing['host_id'] !== $me && $existing['guest_id'] === null) {
                    vsDone(['lobby' => (int)$existing['id'], 'join' => $existing['code']]);
                }
                vsDone(['lobby' => (int)$existing['id']]);
            }
            vsFail(409, 'That rematch has closed.');
        }
        $conn->query("UPDATE vs_lobbies SET status = 'cancelled' WHERE host_id = $me AND status IN ('waiting', 'ready')");
        $newId = 0;
        for ($try = 0; $try < 8 && !$newId; $try++) {
            $code = vsNewCode();
            $stmt = $conn->prepare("INSERT IGNORE INTO vs_lobbies (code, host_id, win_target, lang, level, host_seen_ms) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->bind_param('siissi', $code, $me, $lobby['win_target'], $lobby['lang'], $lobby['level'], $now);
            $stmt->execute();
            $newId = (int)$stmt->insert_id;
            $stmt->close();
        }
        $conn->query("UPDATE vs_lobbies SET rematch_lobby_id = $newId WHERE id = " . (int)$lobby['id']);
        $conn->commit();
        vsDone(['lobby' => $newId]);
    }

    case 'summary': {
        [$lobby, $side] = vsMine($input, $me);
        vsDone(['lobby' => vsLobbyView($lobby, $side)]);
    }
}
vsFail(400, 'Invalid request.');
