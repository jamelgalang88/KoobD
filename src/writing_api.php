<?php
// Writing Practice's requests (js/writing.js). POST, JSON, signed in; only
// ever the signed-in user's own notepads.
//   config                              { ai, now }
//   list                                { notes }
//   get        { id }                   { note, now }   (a running challenge opened again is "resumed")
//   create     { lang, title? }         { note }
//   save       { id, title?, body?, lang? }  { saved, now }
//   delete     { id }
//   ignore     { id, keys }             suggestions the student chose to ignore
//   spell      { lang, words }          { words: { word: { en, tl, suggest } } }
//   challenge_start  { lang, seconds, title? }   { note, now }
//   challenge_finish { id, feedback, early? }    { note }
//   review     { id }                   { review } the AI review (when set up)
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/writing_lib.php';
require_once __DIR__ . '/missions_lib.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

$userId = (int)($_SESSION['user_id'] ?? 0);
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0 || $userId <= 0) {
    http_response_code($userId <= 0 ? 401 : 405);
    echo json_encode(['success' => false]);
    exit();
}
$user = koobdCurrentUser($conn);
if (!$user) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Please sign in again.']);
    exit();
}
koobdMissionRequireFeature($user, 'learning_tools', true);
session_write_close();

$input = json_decode((string)file_get_contents('php://input', false, null, 0, 300000), true);
if (!is_array($input)) {
    $input = [];
}
$action = (string)($input['action'] ?? '');

function writingDone(array $data = []): void
{
    echo json_encode(['success' => true] + $data, JSON_UNESCAPED_UNICODE);
    exit();
}
function writingFail(int $status, string $message): void
{
    http_response_code($status);
    echo json_encode(['success' => false, 'error' => $message]);
    exit();
}
function writingMine(array $input, int $userId): array
{
    $note = koobdWritingNote((int)($input['id'] ?? 0), $userId);
    if (!$note) {
        writingFail(404, 'That notepad could not be found.');
    }
    return koobdWritingSettle($note);
}
$cleanTitle = static fn($title, string $fallback): string => mb_substr(trim(preg_replace('/\s+/u', ' ', (string)$title)), 0, 120) ?: $fallback;
$cleanLang = static fn($lang): string => $lang === 'tl' ? 'tl' : 'en';

switch ($action) {
    case 'config':
        writingDone(['ai' => koobdWritingAiAvailable(), 'now' => koobdWritingNow()]);

    case 'list': {
        $stmt = $conn->prepare("SELECT * FROM writing_notes WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT " . KOOBD_WRITING_MAX_NOTES);
        $stmt->bind_param('i', $userId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        writingDone(['notes' => array_map(static fn($row) => koobdWritingNoteData(koobdWritingSettle($row), false), $rows), 'now' => koobdWritingNow()]);
    }

    case 'get': {
        $note = writingMine($input, $userId);
        $now = koobdWritingNow();
        // Back at a challenge still running after being away: it carries on
        // from where the clock is (it never restarts), marked as resumed.
        if ($note['kind'] === 'challenge' && $note['challenge_status'] === 'running') {
            $away = $now - (int)$note['challenge_seen_ms'] > 15000;
            $conn->query("UPDATE writing_notes SET challenge_seen_ms = $now" . ($away ? ', challenge_resumed = 1' : '') . " WHERE id = " . (int)$note['id']);
            $note['challenge_seen_ms'] = $now;
            if ($away) {
                $note['challenge_resumed'] = 1;
            }
        }
        writingDone(['note' => koobdWritingNoteData($note), 'now' => $now]);
    }

    case 'create': {
        $count = $conn->query("SELECT COUNT(*) FROM writing_notes WHERE user_id = $userId")->fetch_row()[0];
        if ($count >= KOOBD_WRITING_MAX_NOTES) {
            writingFail(409, 'You have a lot of notepads! Delete a few old ones to make a new one.');
        }
        $lang = $cleanLang($input['lang'] ?? 'en');
        $title = $cleanTitle($input['title'] ?? '', $lang === 'tl' ? 'Bagong kuwaderno' : 'Untitled notepad');
        $stmt = $conn->prepare("INSERT INTO writing_notes (user_id, title, lang, body, kind) VALUES (?, ?, ?, '', 'note')");
        $stmt->bind_param('iss', $userId, $title, $lang);
        $stmt->execute();
        $id = (int)$stmt->insert_id;
        $stmt->close();
        writingDone(['note' => koobdWritingNoteData(koobdWritingNote($id, $userId))]);
    }

    case 'save': {
        $note = writingMine($input, $userId);
        $now = koobdWritingNow();
        $sets = [];
        $types = '';
        $values = [];
        if (array_key_exists('title', $input)) {
            $sets[] = 'title = ?';
            $types .= 's';
            $values[] = $cleanTitle($input['title'], $note['title'] ?: 'Untitled notepad');
        }
        if (array_key_exists('lang', $input) && $note['kind'] === 'note') {
            $sets[] = 'lang = ?';
            $types .= 's';
            $values[] = $cleanLang($input['lang']);
        }
        if (array_key_exists('body', $input)) {
            $body = (string)$input['body'];
            if (mb_strlen($body) > KOOBD_WRITING_MAX_BODY) {
                writingFail(413, 'This notepad is full. Start a new notepad to keep writing.');
            }
            // A running challenge takes writing only until its time is up (a
            // few seconds' grace for the last save on its way).
            if ($note['kind'] === 'challenge' && $note['challenge_status'] === 'running' && $now > (int)$note['challenge_ends_ms'] + 5000) {
                writingFail(409, 'Time is up for this challenge.');
            }
            $sets[] = 'body = ?';
            $types .= 's';
            $values[] = $body;
        }
        if ($note['kind'] === 'challenge' && $note['challenge_status'] === 'running') {
            $sets[] = 'challenge_seen_ms = ?';
            $types .= 'i';
            $values[] = $now;
        }
        if ($sets) {
            $types .= 'ii';
            $values[] = (int)$note['id'];
            $values[] = $userId;
            $stmt = $conn->prepare('UPDATE writing_notes SET ' . implode(', ', $sets) . ' WHERE id = ? AND user_id = ?');
            $stmt->bind_param($types, ...$values);
            $stmt->execute();
            $stmt->close();
        }
        writingDone(['saved' => true, 'now' => $now, 'status' => $note['challenge_status']]);
    }

    case 'delete': {
        $note = writingMine($input, $userId);
        $stmt = $conn->prepare("DELETE FROM writing_notes WHERE id = ? AND user_id = ?");
        $stmt->bind_param('ii', $note['id'], $userId);
        $stmt->execute();
        $stmt->close();
        writingDone();
    }

    case 'ignore': {
        $note = writingMine($input, $userId);
        $keys = array_slice(array_values(array_unique(array_filter(array_map(static fn($key) => mb_substr((string)$key, 0, 120), (array)($input['keys'] ?? [])), 'strlen'))), 0, 500);
        $json = json_encode($keys, JSON_UNESCAPED_UNICODE);
        $stmt = $conn->prepare("UPDATE writing_notes SET ignored = ? WHERE id = ? AND user_id = ?");
        $stmt->bind_param('sii', $json, $note['id'], $userId);
        $stmt->execute();
        $stmt->close();
        writingDone();
    }

    case 'spell':
        writingDone(['words' => koobdSpellCheck((array)($input['words'] ?? []), $cleanLang($input['lang'] ?? 'en'))]);

    case 'challenge_start': {
        $seconds = (int)($input['seconds'] ?? 0);
        if ($seconds < 60 || $seconds > 3600) {
            writingFail(422, 'Choose a time from 1 to 60 minutes.');
        }
        $count = $conn->query("SELECT COUNT(*) FROM writing_notes WHERE user_id = $userId")->fetch_row()[0];
        if ($count >= KOOBD_WRITING_MAX_NOTES) {
            writingFail(409, 'You have a lot of notepads! Delete a few old ones to start a challenge.');
        }
        $lang = $cleanLang($input['lang'] ?? 'en');
        $minutes = (int)round($seconds / 60);
        $title = $cleanTitle($input['title'] ?? '', ($lang === 'tl' ? 'Hamon sa pagsulat' : 'Writing challenge') . " · $minutes min");
        $now = koobdWritingNow();
        $ends = $now + $seconds * 1000;
        $stmt = $conn->prepare("INSERT INTO writing_notes (user_id, title, lang, body, kind, challenge_seconds, challenge_started_ms, challenge_ends_ms, challenge_seen_ms, challenge_status) VALUES (?, ?, ?, '', 'challenge', ?, ?, ?, ?, 'running')");
        $stmt->bind_param('issiiii', $userId, $title, $lang, $seconds, $now, $ends, $now);
        $stmt->execute();
        $id = (int)$stmt->insert_id;
        $stmt->close();
        writingDone(['note' => koobdWritingNoteData(koobdWritingNote($id, $userId)), 'now' => $now]);
    }

    case 'challenge_finish': {
        $note = writingMine($input, $userId);
        if ($note['kind'] !== 'challenge') {
            writingFail(409, 'This notepad is not a challenge.');
        }
        $now = koobdWritingNow();
        if ($note['challenge_status'] === 'running') {
            if (empty($input['early']) && $now < (int)$note['challenge_ends_ms'] - 8000) {
                writingFail(409, 'The challenge still has time left.');
            }
            $conn->query("UPDATE writing_notes SET challenge_status = 'completed', challenge_seen_ms = $now WHERE id = " . (int)$note['id']);
        }
        if (is_array($input['feedback'] ?? null)) {
            $feedback = json_encode($input['feedback'], JSON_UNESCAPED_UNICODE);
            if (strlen($feedback) < 200000) {
                $stmt = $conn->prepare("UPDATE writing_notes SET feedback = ? WHERE id = ? AND user_id = ?");
                $stmt->bind_param('sii', $feedback, $note['id'], $userId);
                $stmt->execute();
                $stmt->close();
            }
        }
        writingDone(['note' => koobdWritingNoteData(koobdWritingNote((int)$note['id'], $userId)), 'now' => $now]);
    }

    case 'review': {
        $note = writingMine($input, $userId);
        if (trim((string)$note['body']) === '') {
            writingFail(422, 'Write something first, then ask for a review.');
        }
        set_time_limit(150);
        $review = koobdWritingAiReview((string)$note['body'], $note['lang']);
        if (isset($review['error'])) {
            writingFail(503, $review['error']);
        }
        $json = json_encode($review, JSON_UNESCAPED_UNICODE);
        $stmt = $conn->prepare("UPDATE writing_notes SET ai_review = ? WHERE id = ? AND user_id = ?");
        $stmt->bind_param('sii', $json, $note['id'], $userId);
        $stmt->execute();
        $stmt->close();
        writingDone(['review' => $review]);
    }

    default:
        writingFail(400, 'Unknown request.');
}
