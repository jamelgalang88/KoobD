<?php
require_once __DIR__ . '/connect.php';
require_once __DIR__ . '/platform_story_data.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

// --- Sound ------------------------------------------------------------------------------------
// Every page gets KOOB'D's audio manager (js/koobd-audio.js) in its <head>,
// with the signed-in user's saved sound settings (users.audio_prefs), so music,
// effects and clicks follow them from the first moment on every page. Signed
// out, the settings saved on the device are used.
function koobdCleanAudioPrefs($raw): ?array
{
    $data = is_array($raw) ? $raw : json_decode((string)$raw, true);
    if (!is_array($data)) {
        return null;
    }
    $clean = [];
    foreach (['master', 'music', 'sfx', 'ui'] as $key) {
        if (isset($data[$key]) && is_numeric($data[$key])) {
            $clean[$key] = max(0, min(100, (int)round((float)$data[$key])));
        }
    }
    $clean['muted'] = !empty($data['muted']);
    return $clean;
}

// What a story can ask for (js/koobd-audio.js): built-in music tracks, effects
// and surroundings - the editors offer these, and saving keeps only these.
function koobdAudioTracks(): array
{
    return ['adventure', 'calm', 'mystery', 'joyful', 'night', 'tense', 'royal', 'meadow', 'reading'];
}
function koobdAudioEffects(): array
{
    return ['chime', 'bell', 'door', 'knock', 'magic', 'whoosh', 'splash', 'thunder', 'pop', 'sparkle', 'success', 'fail', 'footsteps', 'eagle', 'snore', 'cheer'];
}
function koobdCleanWeatherLayers($value): array
{
    $list = is_array($value) ? $value : [];
    return array_values(array_unique(array_filter(array_map('strval', $list), static fn($name) => in_array($name, ['rain', 'wind', 'thunder', 'water', 'birds', 'crickets', 'fire'], true))));
}
// A story line's sounds: an effect as it appears (repeated 1-5 times), and the
// music ('none' or a track) and weather ('none' or layers) from that line on.
function koobdCleanLineAudio(array $data): array
{
    $clean = [];
    $sfx = (string)($data['sfx'] ?? '');
    if (in_array($sfx, koobdAudioEffects(), true)) {
        $clean['sfx'] = $sfx;
        $repeat = (int)($data['sfxRepeat'] ?? 1);
        if ($repeat > 1) {
            $clean['sfxRepeat'] = min(5, $repeat);
        }
    }
    $music = (string)($data['music'] ?? '');
    if ($music === 'none' || in_array($music, koobdAudioTracks(), true)) {
        $clean['music'] = $music;
    }
    $weather = $data['weather'] ?? '';
    if ($weather === 'none') {
        $clean['weather'] = 'none';
    } elseif ($layers = koobdCleanWeatherLayers($weather)) {
        $clean['weather'] = $layers;
    }
    return $clean;
}
// A Story Mode page's music ('' carries on, 'none', a track or an uploaded
// file) and surroundings ('' carries on, 'none' or layers). Null for neither.
function koobdCleanPageAudio($data): ?array
{
    if (!is_array($data)) {
        return null;
    }
    $music = trim((string)($data['music'] ?? ''));
    if ($music !== 'none' && !in_array($music, koobdAudioTracks(), true)) {
        $music = koobdPlatformerMediaPath($music, ['audio']);
    }
    $ambience = ($data['ambience'] ?? '') === 'none' ? 'none' : koobdCleanWeatherLayers($data['ambience'] ?? []);
    if ($music === '' && ($ambience === [] || $ambience === '')) {
        return null;
    }
    return [
        'music' => $music,
        'musicVolume' => koobdCleanNumber($data['musicVolume'] ?? 0.7, 0, 1, 0.7),
        'ambience' => $ambience,
        'ambienceVolume' => koobdCleanNumber($data['ambienceVolume'] ?? 0.7, 0, 1, 0.7),
    ];
}

function koobdInjectAudio(): void
{
    global $conn;
    static $started = false;
    if ($started || PHP_SAPI === 'cli' || ($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        return;
    }
    $started = true;
    $userId = (int)($_SESSION['user_id'] ?? 0);
    $page = basename((string)($_SERVER['SCRIPT_NAME'] ?? ''));
    $prefs = null;
    $row = null;
    if ($userId > 0 && isset($conn)) {
        $stmt = $conn->prepare("SELECT audio_prefs, tutorial_done_at, user_role, profile_completed FROM users WHERE id = ? LIMIT 1");
        if ($stmt) {
            $stmt->bind_param('i', $userId);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            $prefs = $row ? koobdCleanAudioPrefs($row['audio_prefs'] ?? null) : null;
        }
    }
    $config = json_encode(['user' => $userId, 'prefs' => $prefs, 'page' => $page]);
    $tag = '<link rel="stylesheet" href="' . koobdAsset('css/koobd-audio.css') . '"><script>window.KOOBD_AUDIO=' . $config . ';</script><script src="' . koobdAsset('js/koobd-audio.js') . '"></script>';
    if ($row && (int)($row['profile_completed'] ?? 0) === 1) {
        if (empty($_SESSION['achievement_csrf'])) {
            $_SESSION['achievement_csrf'] = bin2hex(random_bytes(32));
        }
        $achievementConfig = json_encode([
            'url' => koobdAsset('achievements_api.php'),
            'csrf' => $_SESSION['achievement_csrf'],
            'role' => koobdUserRole($row),
        ], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP);
        $tag .= '<link rel="stylesheet" href="' . koobdAsset('css/achievements.css') . '"><script>window.KOOBD_ACHIEVEMENTS=' . $achievementConfig . ';</script><script src="' . koobdAsset('js/achievements.js') . '" defer></script>';
    }
    // Signed in: the first-time tutorial (js/koobd-tutorial.js) - "Replay
    // tutorial" in the profile menu, and on Home it starts by itself until the
    // user has finished or skipped it once (users.tutorial_done_at).
    if ($row && (int)($row['profile_completed'] ?? 0) === 1) {
        if (empty($_SESSION['mission_tutorial_csrf'])) {
            $_SESSION['mission_tutorial_csrf'] = bin2hex(random_bytes(32));
        }
        $tutorial = json_encode([
            'role' => koobdUserRole($row),
            'auto' => $page === 'home.php' && empty($row['tutorial_done_at']),
            'css' => koobdAsset('css/koobd-tutorial.css'),
            'animation' => koobdAsset('js/character-animation.js'),
            'sheet' => koobdCharacterSheet('flower'),
            'missionProgressUrl' => koobdAsset('mission_tutorial_progress.php'),
            'missionTutorialCsrf' => $_SESSION['mission_tutorial_csrf'],
        ]);
        $tag .= '<script>window.KOOBD_TUTORIAL=' . $tutorial . ';</script><script src="' . koobdAsset('js/koobd-tutorial.js') . '" defer></script>';
    }
    // Pages are sent in pieces; the tag goes in before </head> once it is
    // seen, and anything that is not a page (data, files) passes untouched.
    $done = false;
    ob_start(static function (string $chunk) use (&$done, $tag): string {
        if ($done) {
            return $chunk;
        }
        foreach (headers_list() as $header) {
            if (stripos($header, 'content-type:') === 0 && stripos($header, 'text/html') === false) {
                $done = true;
                return $chunk;
            }
        }
        $at = stripos($chunk, '</head>');
        if ($at !== false) {
            $done = true;
            return substr($chunk, 0, $at) . $tag . substr($chunk, $at);
        }
        if (stripos($chunk, '<body') !== false || ($chunk !== '' && stripos($chunk, '<html') === false && stripos($chunk, '<head') === false && stripos($chunk, '<!doctype') === false)) {
            $done = true;
        }
        return $chunk;
    }, 32768);
}
koobdInjectAudio();

function koobdCharacterCatalog(): array
{
    return [
        'flower' => [
            'display' => 'flower girl',
            'asset' => 'assets/images/characters/FLOWER.png',
            'description' => 'A gentle flower spirit with pastel colors, soft sparkle, and calm storybook energy.',
            'badge' => 'Reader',
            'top' => '#d8f8d8',
            'bottom' => '#fff1b8',
            'accent' => '#57a46a',
            'style' => 'soft',
            'scale' => 100,
        ],
        'cubebot' => [
            'display' => 'CUBEBOT',
            'asset' => 'assets/images/characters/CUBEBOT.png',
            'description' => 'A playful robot reader with bright shapes, curious ideas, and a friendly helper vibe.',
            'badge' => 'Reader',
            'top' => '#ffe98f',
            'bottom' => '#ffd2a8',
            'accent' => '#d78622',
            'style' => 'rounded',
            'scale' => 100,
        ],
        'golem' => [
            'display' => 'GOLEM',
            'asset' => 'assets/images/characters/GOLEM.png',
            'description' => 'A sturdy stone friend with earthy colors, steady focus, and a protective feel.',
            'badge' => 'Reader',
            'top' => '#d4d9de',
            'bottom' => '#b5f0c8',
            'accent' => '#5a7c68',
            'style' => 'spotlight',
            'scale' => 100,
        ],
        'raincat' => [
            'display' => 'RAINCAT',
            'asset' => 'assets/images/characters/RAINCAT.png',
            'description' => 'A dreamy cloud cat with rainy-day charm, soft blues, and cozy reading moods.',
            'badge' => 'Reader',
            'top' => '#d9e9ff',
            'bottom' => '#c8fff0',
            'accent' => '#5a88c8',
            'style' => 'soft',
            'scale' => 100,
        ],
        'twig' => [
            'display' => 'TWIG',
            'asset' => 'assets/images/characters/TWIG.png',
            'description' => 'A tiny woodland buddy with leafy colors, playful curiosity, and a nature-inspired style.',
            'badge' => 'Reader',
            'top' => '#d8f3c4',
            'bottom' => '#d7ecff',
            'accent' => '#4e8b5d',
            'style' => 'rounded',
            'scale' => 100,
        ],
        'watermain' => [
            'display' => 'WATER MAIN',
            'asset' => 'assets/images/characters/WATER MAIN.png',
            'description' => 'A splashy water friend with cool colors, lively motion, and a bright ocean mood.',
            'badge' => 'Reader',
            'top' => '#cfe8ff',
            'bottom' => '#bff7ec',
            'accent' => '#3b87b8',
            'style' => 'spotlight',
            'scale' => 100,
        ],
    ];
}

function koobdStoryCatalog(): array
{
    return [
        'book1' => [
            'id' => 'book1',
            'type' => 'builtin',
            'title' => 'The Hare and the Tortoise',
            'lesson' => 'Steady effort and kindness matter more than pride.',
            'summary' => 'A proud, speedy hare challenges a slow but steady tortoise to a race through the forest. Follow them every step of the way and see who reaches the finish line first.',
            'href' => 'book1.php',
            'cover' => 'assets/images/books/book1_cover.png',
            // 'story' (read page by page) or 'platform' (played as a game).
            'mode' => 'story',
        ],
        'false_knight' => [
            'id' => 'false_knight',
            'type' => 'builtin',
            'title' => 'The False Knight',
            'lesson' => 'True courage is measured by the choices we make for others.',
            'summary' => 'CubeBot dreams of becoming a knight of the castle in the great World Tree. When a little thief runs off with his coins, the chase pulls him into an adventure that tests what real courage means.',
            'href' => 'false_knight.php',
            'cover' => 'The%20False%20Knight/backround%20and%20stuff/The%20False%20Knight%20Cover.jpg',
            'mode' => 'platform',
        ],
    ];
}

// A story card's mode badge: "Story Mode" (read page by page) or "Platform
// Mode" (played as a game). js/home-search.js builds the same badge.
function koobdStoryModeBadge(string $mode, bool $inline = false): string
{
    $platform = $mode === 'platform';
    $icon = $platform
        ? '<path d="M6 9h12a4 4 0 014 4v1a3 3 0 01-5.4 1.8L15 14H9l-1.6 1.8A3 3 0 012 14v-1a4 4 0 014-4zM8 11v3M6.5 12.5h3M16 12h.01M18 13.5h.01"/>'
        : '<path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/>';
    return '<span class="story-mode-badge is-' . ($platform ? 'platform' : 'story') . ($inline ? ' is-inline' : '') . '">'
        . '<svg viewBox="0 0 24 24" aria-hidden="true">' . $icon . '</svg>'
        . '<span>' . ($platform ? 'Platform Mode' : 'Story Mode') . '</span></span>';
}

// A story's details for its pop-up (js/story-details.js), as data-story-*
// attributes on the link or button that opens it. Fields: title, href, cover,
// mode, creator, description, lesson, progress, play, alt-href, alt-label.
// A stylesheet's or script's URL, versioned by the file's last change
// (css/app.css -> css/app.css?v=1791...). The browser keeps it cached until the
// file really changes, instead of downloading every file again on every page
// (as a per-request time() version did). Paths are relative to src/ and may
// be URL-encoded ("The%20False%20Knight/...").
function koobdAsset(string $path): string
{
    static $versions = [];
    if (!isset($versions[$path])) {
        $file = __DIR__ . '/' . rawurldecode($path);
        $versions[$path] = is_file($file) ? (string)filemtime($file) : '0';
    }
    return $path . '?v=' . $versions[$path];
}

// --- Passwords --------------------------------------------------------------------------
// Passwords are stored only as hashes (password_hash). Accounts from before
// hashing kept the password itself; such a value still signs in once, and is
// replaced by its hash at that moment (koobdCheckPassword).
function koobdHashPassword(string $password): string
{
    return password_hash($password, PASSWORD_DEFAULT);
}

function koobdIsPasswordHash(string $stored): bool
{
    // password_get_info() gives no algorithm (null) for anything that is not a hash.
    return !empty(password_get_info($stored)['algo']);
}

// Whether $password is this user's password. A match on an old unhashed value,
// or on a hash made with older settings, saves a fresh hash.
function koobdCheckPassword(array $user, string $password): bool
{
    global $conn;
    $stored = (string)($user['password'] ?? '');
    if ($stored === '' || $password === '') {
        return false;
    }
    if (koobdIsPasswordHash($stored)) {
        if (!password_verify($password, $stored)) {
            return false;
        }
        $upgrade = password_needs_rehash($stored, PASSWORD_DEFAULT);
    } else {
        if (!hash_equals($stored, $password)) {
            return false;
        }
        $upgrade = true;
    }
    if ($upgrade && !empty($user['id'])) {
        $hash = koobdHashPassword($password);
        $userId = (int)$user['id'];
        $stmt = $conn->prepare("UPDATE users SET password = ? WHERE id = ?");
        if ($stmt) {
            $stmt->bind_param('si', $hash, $userId);
            $stmt->execute();
            $stmt->close();
        }
    }
    return true;
}

// The account with this email and role whose password matches, or null.
function koobdFindLogin(string $email, string $password, string $role): ?array
{
    global $conn;
    $stmt = $conn->prepare("SELECT * FROM users WHERE email = ? AND user_role = ?");
    if (!$stmt) {
        return null;
    }
    $stmt->bind_param('ss', $email, $role);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    foreach ($rows as $row) {
        if (koobdCheckPassword($row, $password)) {
            return $row;
        }
    }
    return null;
}

function koobdStoryDetailsData(array $fields): string
{
    $out = '';
    foreach ($fields as $name => $value) {
        if ($value === null || $value === '') {
            continue;
        }
        $out .= ' data-story-' . $name . '="' . htmlspecialchars((string)$value, ENT_QUOTES) . '"';
    }
    return $out;
}

// --- Saved progress: Continue / Restart (home.php, the story readers) -----------------------
// The user's own progress (not a classroom's) for every story they have opened:
// [story_id => ['progress' => 0-100, 'state' => array|null, 'updatedAt' => ms]].
function koobdUserStoryProgress(int $userId): array
{
    global $conn;
    $rows = [];
    $stmt = $conn->prepare(
        "SELECT story_id, progress, progress_state, UNIX_TIMESTAMP(last_read_at) AS read_at
         FROM story_progress WHERE user_id = ? AND progress_context = 'global'"
    );
    if (!$stmt) {
        return $rows;
    }
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($result && ($row = $result->fetch_assoc())) {
        $state = json_decode((string)($row['progress_state'] ?? ''), true);
        $rows[(string)$row['story_id']] = [
            'progress' => max(0, min(100, (int)$row['progress'])),
            'state' => is_array($state) ? $state : null,
            'updatedAt' => (int)$row['read_at'] * 1000,
        ];
    }
    $stmt->close();
    return $rows;
}

// One story's saved progress in a context, or null if it was never opened there.
function koobdStoryProgressFor(int $userId, string $storyId, string $context = 'global'): ?array
{
    global $conn;
    $stmt = $conn->prepare(
        "SELECT progress, progress_state, UNIX_TIMESTAMP(last_read_at) AS read_at
         FROM story_progress WHERE user_id = ? AND story_id = ? AND progress_context = ? LIMIT 1"
    );
    if (!$stmt) {
        return null;
    }
    $stmt->bind_param('iss', $userId, $storyId, $context);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();
    if (!$row) {
        return null;
    }
    $state = json_decode((string)($row['progress_state'] ?? ''), true);
    return [
        'progress' => max(0, min(100, (int)$row['progress'])),
        'state' => is_array($state) ? $state : null,
        'updatedAt' => (int)$row['read_at'] * 1000,
    ];
}

// Restart: the story starts again from the beginning, so its saved place goes.
function koobdResetStoryProgress(int $userId, string $storyId, string $context = 'global'): void
{
    global $conn;
    $stmt = $conn->prepare(
        "UPDATE story_progress SET progress = 0, progress_state = NULL
         WHERE user_id = ? AND story_id = ? AND progress_context = ?"
    );
    if ($stmt) {
        $stmt->bind_param('iss', $userId, $storyId, $context);
        $stmt->execute();
        $stmt->close();
    }
}

// The details pop-up's buttons for a story (koobdStoryDetailsData fields). A
// story never opened keeps its Play / Read Story button; one the reader has
// opened offers Continue (where they stopped) and Restart (from the start);
// a finished one offers Read Again.
function koobdStoryProgressDetails(string $href, ?array $saved): array
{
    if ($saved === null || $href === '') {
        return [];
    }
    $glue = strpos($href, '?') === false ? '?' : '&';
    $restart = $href . $glue . 'restart=1';
    if ((int)$saved['progress'] >= 100) {
        return ['progress' => 100, 'href' => $restart, 'play' => 'Read Again'];
    }
    return [
        'progress' => (int)$saved['progress'],
        'href' => $href . $glue . 'resume=1',
        'play' => 'Continue',
        'alt-href' => $restart,
        'alt-label' => 'Restart',
    ];
}

// --- The classic stories and their pop-up details (home.php, whats_new.php) ------------------
// KoobD's own stories, as their cards show them.
function koobdClassicStories(): array
{
    return [
        [
            'id' => 'book1',
            'title' => 'The Hare and the Tortoise',
            'href' => 'book1.php',
            'cover' => 'assets/images/books/book1_cover.png',
            'mode' => 'story',
            'summary' => 'A proud, speedy hare challenges a slow but steady tortoise to a race through the forest. Follow them every step of the way and see who reaches the finish line first.',
            'lesson' => 'Steady effort and kindness matter more than pride.',
            'localCover' => true,
        ],
        [
            'id' => 'false_knight',
            'title' => 'The False Knight',
            'href' => 'false_knight.php',
            'cover' => 'The%20False%20Knight/backround%20and%20stuff/The%20False%20Knight%20Cover.jpg',
            'mode' => 'platform',
            'summary' => 'CubeBot dreams of becoming a knight of the castle in the great World Tree. When a little thief runs off with his coins, the chase pulls him into an adventure that tests what real courage means.',
            'lesson' => 'True courage is measured by the choices we make for others.',
            'localCover' => true,
        ],
    ];
}

// A story card's pop-up details (koobdStoryDetailsData fields). Every place that
// opens a story's pop-up uses these, so it is the same pop-up everywhere.
function koobdClassicStoryDetails(array $item, ?array $saved): array
{
    return array_merge([
        'title' => $item['title'], 'href' => $item['href'], 'cover' => $item['cover'], 'mode' => $item['mode'],
        'creator' => 'A KoobD Classic', 'description' => $item['summary'], 'lesson' => $item['lesson'],
        'key' => $item['id'],
    ], koobdStoryProgressDetails($item['href'], $saved));
}

// The progress key of a story made by others (its editor story), or null.
function koobdSharedStoryProgressKey(array $story): ?string
{
    return (int)$story['teacher_story_id'] > 0 ? koobdTeacherStoryKey((int)$story['teacher_story_id']) : null;
}

function koobdSharedStoryDetails(array $story, ?array $saved): array
{
    return array_merge([
        'title' => $story['title'], 'href' => $story['href'], 'cover' => $story['cover'], 'mode' => $story['mode'],
        'creator' => $story['creator_attribution'],
        'approver' => $story['approved_by_name'],
        'description' => $story['description'] !== '' ? $story['description'] : ($story['subtitle'] !== 'Published story' ? $story['subtitle'] : ''),
        'lesson' => $story['lesson'],
        'key' => 'shared-' . (int)$story['id'],
    ], koobdStoryProgressDetails($story['href'], $saved));
}

function koobdNewTeacherStorySubmissionCode(): string
{
    global $conn;

    $stmt = $conn->prepare("SELECT id FROM teacher_stories WHERE submission_code = ? LIMIT 1");
    if (!$stmt) {
        error_log('Unable to prepare a student story submission-code lookup.');
        return '';
    }

    for ($attempt = 0; $attempt < 8; $attempt++) {
        $code = strtoupper(bin2hex(random_bytes(5)));
        $stmt->bind_param('s', $code);
        if (!$stmt->execute()) {
            $stmt->close();
            error_log('Unable to check a student story submission code.');
            return '';
        }
        $result = $stmt->get_result();
        if ($result && !$result->fetch_assoc()) {
            $stmt->close();
            return $code;
        }
    }

    $stmt->close();
    error_log('Unable to generate a unique student story submission code.');
    return '';
}

function koobdTeacherStorySubmissionByCode(string $code): ?array
{
    global $conn;

    $code = strtoupper(trim($code));
    if (!preg_match('/^[A-F0-9]{10}$/', $code)) {
        return null;
    }

    $stmt = $conn->prepare(
        "SELECT ts.*, creator.username AS student_username,
                creator.profile_reader_name AS student_name,
                creator.user_role AS student_role,
                reviewer.username AS reviewer_username,
                reviewer.profile_reader_name AS reviewer_name
         FROM teacher_stories ts
         INNER JOIN users creator ON creator.id = ts.teacher_id
         LEFT JOIN users reviewer ON reviewer.id = ts.reviewed_by
         WHERE ts.submission_code = ?
           AND ts.status IN ('pending_approval', 'revision_required', 'published', 'unpublished', 'rejected')
         LIMIT 1"
    );
    if (!$stmt) {
        error_log('Unable to prepare a teacher story submission lookup.');
        return null;
    }

    $stmt->bind_param('s', $code);
    if (!$stmt->execute()) {
        $stmt->close();
        error_log('Unable to look up a teacher story submission.');
        return null;
    }
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    if (!$row || koobdIsTeacher(['user_role' => $row['student_role'] ?? ''])) {
        return null;
    }
    $row['student_name'] = trim((string)($row['student_name'] ?? '')) ?: trim((string)$row['student_username']);
    $row['reviewer_name'] = trim((string)($row['reviewer_name'] ?? '')) ?: trim((string)($row['reviewer_username'] ?? ''));
    return $row;
}

function koobdLastReadStoryDetails(int $userId): ?array
{
    $progress = koobdUserStoryProgress($userId);
    if (!$progress) {
        return null;
    }

    uksort($progress, static function (string $left, string $right) use ($progress): int {
        return ($progress[$right]['updatedAt'] ?? 0) <=> ($progress[$left]['updatedAt'] ?? 0);
    });

    $classicStories = [];
    foreach (koobdClassicStories() as $story) {
        $classicStories[$story['id']] = $story;
    }

    global $conn;
    foreach ($progress as $storyId => $saved) {
        if (isset($classicStories[$storyId])) {
            return [
                'progress' => (int)$saved['progress'],
                'details' => koobdClassicStoryDetails($classicStories[$storyId], $saved),
            ];
        }

        $teacherStoryId = koobdTeacherStoryDbId((string)$storyId);
        if ($teacherStoryId <= 0) {
            continue;
        }

        $stmt = $conn->prepare("SELECT id FROM stories WHERE teacher_story_id = ? ORDER BY id DESC LIMIT 1");
        if (!$stmt) {
            error_log('Unable to prepare the Last Read story lookup.');
            return null;
        }
        $stmt->bind_param('i', $teacherStoryId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$row) {
            continue;
        }

        $story = koobdSharedStoryById((int)$row['id']);
        if ($story) {
            return [
                'progress' => (int)$saved['progress'],
                'details' => koobdSharedStoryDetails($story, $saved),
            ];
        }
    }

    return null;
}

// --- Favourite stories (story_favorites; favorite_story.php, profile.php) -------------------
// A favourite is kept by key: a classic story's id (book1) or "shared-<id>" for a
// story made by others. A story from the editor can be a favourite once it is
// published (its shared copy); before that it has no key.
function koobdFavoriteKeyForStory(?array $story): string
{
    global $conn;
    if (!$story) {
        return '';
    }
    if (($story['type'] ?? '') === 'builtin') {
        return (string)$story['id'];
    }
    if (($story['type'] ?? '') === 'teacher_story') {
        $teacherStoryId = (int)($story['teacher_story_id'] ?? 0);
        $stmt = $conn->prepare("SELECT id FROM stories WHERE teacher_story_id = ? ORDER BY id DESC LIMIT 1");
        $stmt->bind_param("i", $teacherStoryId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ? 'shared-' . (int)$row['id'] : '';
    }
    return isset($story['creator_user_id'], $story['id']) ? 'shared-' . (int)$story['id'] : '';
}

// The story a favourite key stands for, as the details its card and pop-up show
// (null if there is no such story, e.g. it was unpublished).
function koobdStoryForFavoriteKey(string $key): ?array
{
    $catalog = koobdStoryCatalog();
    if (isset($catalog[$key])) {
        $story = $catalog[$key];
        return [
            'key' => $key, 'title' => $story['title'], 'href' => $story['href'], 'cover' => $story['cover'],
            'mode' => $story['mode'] ?? 'story', 'creator' => 'A KoobD Classic',
            'description' => $story['summary'] ?? '', 'lesson' => $story['lesson'] ?? '',
        ];
    }
    if (preg_match('/^shared-(\d+)$/', $key, $match)) {
        $story = koobdSharedStoryById((int)$match[1]);
        if (!$story) {
            return null;
        }
        $subtitle = $story['subtitle'] !== 'Published story' ? $story['subtitle'] : '';
        return [
            'key' => $key, 'title' => $story['title'], 'href' => $story['href'], 'cover' => $story['cover'],
            'mode' => $story['mode'], 'creator' => $story['creator_attribution'], 'approver' => $story['approved_by_name'],
            'description' => $story['description'] !== '' ? $story['description'] : $subtitle, 'lesson' => $story['lesson'],
        ];
    }
    return null;
}

function koobdIsFavorite(int $userId, string $key): bool
{
    global $conn;
    $stmt = $conn->prepare("SELECT 1 FROM story_favorites WHERE user_id = ? AND story_key = ? LIMIT 1");
    $stmt->bind_param("is", $userId, $key);
    $stmt->execute();
    $found = (bool)$stmt->get_result()->fetch_row();
    $stmt->close();
    return $found;
}

function koobdSetFavorite(int $userId, string $key, bool $favorite): void
{
    global $conn;
    $stmt = $favorite
        ? $conn->prepare("INSERT IGNORE INTO story_favorites (user_id, story_key) VALUES (?, ?)")
        : $conn->prepare("DELETE FROM story_favorites WHERE user_id = ? AND story_key = ?");
    $stmt->bind_param("is", $userId, $key);
    $stmt->execute();
    $stmt->close();
}

// A reader's favourites, newest first (stories that no longer exist are left out).
function koobdUserFavorites(int $userId): array
{
    global $conn;
    $stmt = $conn->prepare("SELECT story_key FROM story_favorites WHERE user_id = ? ORDER BY created_at DESC, id DESC");
    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    $favorites = [];
    while ($row = $result->fetch_assoc()) {
        $story = koobdStoryForFavoriteKey((string)$row['story_key']);
        if ($story) {
            $favorites[] = $story;
        }
    }
    $stmt->close();
    return $favorites;
}

// 'platform' or 'story' for a classic story, an editor story or a shared story.
function koobdStoryMode(?array $story): string
{
    if (!$story) {
        return 'story';
    }
    if (($story['mode'] ?? '') === 'platform' || ($story['story_mode'] ?? '') === 'platformer') {
        return 'platform';
    }
    return 'story';
}

function koobdBackgroundCatalog(): array
{
    return [
        'forest' => [
            'id' => 'forest',
            'label' => 'Forest',
            'asset' => 'assets/images/backgrounds/forest.jpg',
        ],
        'sunrise' => [
            'id' => 'sunrise',
            'label' => 'Sunrise Hills',
            'asset' => 'assets/images/banners/banner1.jpg',
        ],
        'village' => [
            'id' => 'village',
            'label' => 'Village',
            'asset' => 'assets/images/banners/banner2.jpg',
        ],
        'meadow' => [
            'id' => 'meadow',
            'label' => 'Meadow',
            'asset' => 'assets/images/banners/banner3.jpg',
        ],
        'hare_book' => [
            'id' => 'hare_book',
            'label' => 'Story Cover One',
            'asset' => 'assets/images/books/book1_cover.png',
        ],
    ];
}

function koobdTeacherStoryKey(int $storyId): string
{
    return 'teacher:' . $storyId;
}

function koobdIsTeacherStoryId(string $storyId): bool
{
    return str_starts_with($storyId, 'teacher:');
}

function koobdTeacherStoryDbId(string $storyId): int
{
    if (!preg_match('/^teacher:(\d+)$/', $storyId, $matches)) {
        return 0;
    }

    return (int)$matches[1];
}

function koobdTeacherDefaultStoryPages(): array
{
    return [
        [
            'id' => 1,
            'pageTitle' => 'Page 1',
            'transition' => 'none',
            'background' => '',
            'backgroundAsset' => '',
            'backgroundColor' => '#ffffff',
            'leftCharacter' => '',
            'rightCharacter' => '',
            'platformer' => koobdPlatformerDefaultScene(),
            'elements' => [],
        ],
    ];
}

function koobdPlatformerDefaultScene(): array
{
    return [
        'platforms' => [],
        'npcs' => [],
        'player' => ['x' => 14, 'y' => 0],
        'groundColor' => '#557d2e',
        'groundAsset' => '',
    ];
}

// The four block designs (mirrored in the editor/player JS). Retired
// square/brick/thin/slope/spike ids map onto them: brick and thin were both
// wide slabs, slope the ramp, spike the triangle.
function koobdPlatformerBlockType($type): string
{
    $id = trim((string)$type);
    $legacy = ['square' => 'block1', 'brick' => 'block2', 'thin' => 'block2', 'slope' => 'block3', 'spike' => 'block4'];
    if (in_array($id, ['block1', 'block2', 'block3', 'block4'], true)) {
        return $id;
    }
    return $legacy[$id] ?? 'block1';
}

function koobdPlatformerImageAssetPath($path): string
{
    $path = trim((string)$path);
    $groundModels = [
        'assets/images/grounds/grass.svg',
        'assets/images/grounds/stone.svg',
        'assets/images/grounds/sand.svg',
    ];
    if (in_array($path, $groundModels, true)) {
        return $path;
    }
    if (!preg_match('~^uploads/platformer-assets/teacher-[0-9]+-[a-f0-9]+-[a-z0-9-]+\.png$~i', $path)) {
        return '';
    }
    return $path;
}

function koobdPlatformerGroundCatalog(): array
{
    return [
        ['id' => 'grass', 'label' => 'Grass', 'asset' => 'assets/images/grounds/grass.svg'],
        ['id' => 'stone', 'label' => 'Stone', 'asset' => 'assets/images/grounds/stone.svg'],
        ['id' => 'sand', 'label' => 'Sand', 'asset' => 'assets/images/grounds/sand.svg'],
    ];
}

function koobdPlatformerSceneFromData($scene): array
{
    $defaults = koobdPlatformerDefaultScene();
    if (!is_array($scene)) {
        return $defaults;
    }
    // Pages built with the Platform Mode editor (version 3): objects,
    // characters, checkpoints and story events (see platform_story_data.php).
    if ((int)($scene['v'] ?? 0) >= 3) {
        return koobdPlatformerV3FromData($scene);
    }

    // Each platformer page is a fixed 1000-by-300 scene with an 18-unit
    // ground band at the bottom.
    $worldWidth = 1000;
    $worldHeight = 300;
    $groundTop = $worldHeight - 18;
    // Scenes saved before the world grew vertically (v < 2) used a 100-unit
    // height; shift platform y (measured from the world top) down into the
    // new band. NPC/player y is height above the ground band, which is
    // invariant, so only platforms move.
    $yShift = (int)($scene['v'] ?? 1) < 2 ? 200 : 0;
    $catalog = koobdCharacterCatalog();
    $platforms = [];
    foreach (($scene['platforms'] ?? []) as $index => $platform) {
        if (!is_array($platform)) {
            continue;
        }

        $color = trim((string)($platform['color'] ?? '#5f9b58'));
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
            $color = '#5f9b58';
        }
        $platforms[] = [
            'id' => trim((string)($platform['id'] ?? ('platform-' . ($index + 1)))),
            'type' => koobdPlatformerBlockType($platform['type'] ?? ''),
            'x' => max(0, min($worldWidth, (int)($platform['x'] ?? 50))),
            'y' => max(4, min($worldHeight - 4, (int)($platform['y'] ?? 72) + $yShift)),
            'width' => max(12, min(60, (int)($platform['width'] ?? 28))),
            'height' => max(3, min(16, (int)($platform['height'] ?? 7))),
            'rotation' => (int)($platform['rotation'] ?? 0),
            'color' => $color,
        ];
    }
    $npcs = [];

    foreach (($scene['npcs'] ?? []) as $index => $npc) {
        if (!is_array($npc)) {
            continue;
        }

        $character = trim((string)($npc['character'] ?? ''));
        if (!isset($catalog[$character])) {
            continue;
        }

        $x = max(0, min($worldWidth, (int)($npc['x'] ?? 60)));
        $y = max(0, min($groundTop, (int)($npc['y'] ?? 70)));
        $turns = [];
        $rawDialogue = $npc['dialogue'] ?? [];
        if (is_string($rawDialogue) && trim($rawDialogue) !== '') {
            $rawDialogue = [['speaker' => 'npc', 'text' => $rawDialogue]];
        }
        if (is_array($rawDialogue)) {
            foreach ($rawDialogue as $turnIndex => $turn) {
                if (!is_array($turn)) continue;
                $speaker = trim((string)($turn['speaker'] ?? 'npc')) === 'player' ? 'player' : 'npc';
                $choices = [];
                foreach (($turn['choices'] ?? []) as $choiceIndex => $choice) {
                    if (!is_array($choice)) continue;
                    $choiceText = trim((string)($choice['text'] ?? ''));
                    if ($choiceText === '') continue;
                    $choices[] = [
                        'id' => trim((string)($choice['id'] ?? ('choice-' . ($turnIndex + 1) . '-' . ($choiceIndex + 1)))),
                        'text' => $choiceText,
                        'nextPage' => max(0, (int)($choice['nextPage'] ?? 0)),
                    ];
                }
                $turns[] = [
                    'id' => trim((string)($turn['id'] ?? ('turn-' . ($turnIndex + 1)))),
                    'speaker' => $speaker,
                    'text' => trim((string)($turn['text'] ?? '')),
                    'choices' => $choices,
                ];
            }
        }
        $name = trim((string)($npc['name'] ?? $catalog[$character]['display']));
        $npcs[] = [
            'id' => trim((string)($npc['id'] ?? ('npc-' . ($index + 1)))),
            'character' => $character,
            'name' => $name !== '' ? $name : $catalog[$character]['display'],
            'x' => $x,
            'y' => $y,
            'dialogue' => $turns,
        ];
    }

    $rawPlayer = is_array($scene['player'] ?? null) ? $scene['player'] : [];
    $player = [
        'x' => max(0, min($worldWidth, (int)($rawPlayer['x'] ?? 14))),
        'y' => max(0, min($groundTop, (int)($rawPlayer['y'] ?? 0))),
    ];

    return [
        'v' => 2,
        'platforms' => $platforms,
        'npcs' => $npcs,
        'player' => $player,
        'groundColor' => preg_match('/^#[0-9a-fA-F]{6}$/', (string)($scene['groundColor'] ?? ''))
            ? (string)$scene['groundColor']
            : '#557d2e',
        'groundAsset' => koobdPlatformerImageAssetPath($scene['groundAsset'] ?? ''),
    ];
}

function koobdPlatformerWorldFromPages(array $pages): array
{
    $backgrounds = koobdBackgroundCatalog();
    $catalog = koobdCharacterCatalog();
    $pages = array_values(array_filter($pages, 'is_array'));
    $world = [
        'backgroundAsset' => '',
        'backgroundColor' => '#72c6ec',
        'groundColor' => '#557d2e',
        'groundAsset' => '',
        'width' => max(1000, count($pages) * 1000),
        'player' => ['x' => 14, 'y' => 0],
        'platforms' => [],
        'npcs' => [],
        'backgrounds' => [],
        'grounds' => [],
        'storyEvents' => [],
    ];
    if (!$pages) {
        return $world;
    }

    $firstPlatformerScene = null;
    $firstPlatformerIndex = null;
    foreach ($pages as $pageIndex => $page) {
        $background = $backgrounds[$page['background'] ?? ''] ?? null;
        $backgroundAsset = koobdPlatformerImageAssetPath($page['backgroundAsset'] ?? '')
            ?: ($background['asset'] ?? '');
        $backgroundColor = trim((string)($page['backgroundColor'] ?? '#72c6ec'));
        $world['backgrounds'][] = [
            'x' => $pageIndex * 1000,
            'width' => 1000,
            'asset' => $backgroundAsset,
            'color' => preg_match('/^#[0-9a-fA-F]{6}$/', $backgroundColor) ? $backgroundColor : '#72c6ec',
        ];
        if ($pageIndex === 0) {
            $world['backgroundAsset'] = $backgroundAsset;
            $world['backgroundColor'] = $world['backgrounds'][0]['color'];
        }

        $scene = is_array($page['platformer'] ?? null) ? $page['platformer'] : [];
        if (($page['pageType'] ?? '') === 'platformer') {
            if ($firstPlatformerScene === null) {
                $firstPlatformerScene = $scene;
                $firstPlatformerIndex = $pageIndex;
            }
            $groundAsset = koobdPlatformerImageAssetPath($scene['groundAsset'] ?? '');
            if ($groundAsset !== '') {
                $groundColor = trim((string)($scene['groundColor'] ?? '#557d2e'));
                $groundColor = preg_match('/^#[0-9a-fA-F]{6}$/', $groundColor) ? $groundColor : '#557d2e';
                $world['grounds'][] = [
                    'x' => $pageIndex * 1000,
                    'width' => 1000,
                    'asset' => $groundAsset,
                    'color' => $groundColor,
                ];
                if ($world['groundAsset'] === '') {
                    $world['groundColor'] = $groundColor;
                    $world['groundAsset'] = $groundAsset;
                }
            }
            $yShift = (int)($scene['v'] ?? 1) < 2 ? 200 : 0;
            foreach (($scene['platforms'] ?? []) as $platform) {
                if (!is_array($platform)) continue;
                $platform['x'] = $pageIndex * 1000 + (int)($platform['x'] ?? 0);
                $platform['y'] = (int)($platform['y'] ?? 0) + $yShift;
                $platform['type'] = koobdPlatformerBlockType($platform['type'] ?? '');
                $platform['id'] = 'page-' . ($pageIndex + 1) . '-' . (string)($platform['id'] ?? ('platform-' . (count($world['platforms']) + 1)));
                $world['platforms'][] = $platform;
            }
            foreach (($scene['npcs'] ?? []) as $npc) {
                if (!is_array($npc)) continue;
                $character = $catalog[$npc['character'] ?? ''] ?? null;
                if (!$character) continue;
                $npc['id'] = 'page-' . ($pageIndex + 1) . '-' . (string)($npc['id'] ?? ('npc-' . (count($world['npcs']) + 1)));
                $npc['x'] = $pageIndex * 1000 + (int)($npc['x'] ?? 60);
                $npc['asset'] = $character['asset'];
                if (trim((string)($npc['name'] ?? '')) === '') $npc['name'] = $character['display'];
                $world['npcs'][] = $npc;
            }
        }

        $turns = [];
        foreach (($page['elements'] ?? []) as $element) {
            if (!is_array($element)) continue;
            $text = trim((string)($element['text'] ?? ''));
            if ($text === '') continue;
            $turns[] = [
                'id' => (string)($element['id'] ?? ('page-' . ($pageIndex + 1) . '-turn-' . (count($turns) + 1))),
                'type' => ($element['type'] ?? '') === 'title' ? 'title' : 'dialogue',
                'speaker' => ($element['type'] ?? '') === 'dialogue'
                    ? (trim((string)($element['speaker'] ?? '')) ?: 'npc')
                    : 'narrator',
                'text' => $text,
                'choices' => [],
            ];
        }
        if ($turns) {
            $leftCharacter = $catalog[$page['leftCharacter'] ?? ''] ?? null;
            $rightCharacter = $catalog[$page['rightCharacter'] ?? ''] ?? null;
            $character = $rightCharacter ?? $leftCharacter;
            $world['storyEvents'][] = [
                'id' => 'page-' . ($pageIndex + 1),
                'pageIndex' => $pageIndex,
                'pageTitle' => trim((string)($page['pageTitle'] ?? ('Page ' . ($pageIndex + 1)))),
                'x' => $pageIndex * 1000 + 14,
                'name' => $character['display'] ?? trim((string)($page['pageTitle'] ?? 'Story')),
                'asset' => $character['asset'] ?? '',
                'turns' => $turns,
            ];
        }
    }
    if ($firstPlatformerScene !== null) {
        $world['player'] = [
            'x' => $firstPlatformerIndex === 0 ? (int)($firstPlatformerScene['player']['x'] ?? 14) : 14,
            'y' => $firstPlatformerIndex === 0 ? (int)($firstPlatformerScene['player']['y'] ?? 0) : 0,
        ];
    }
    return $world;
}

function koobdTeacherStoryPagesFromJson(?string $json): array
{
    $decoded = json_decode((string)$json, true);
    if (!is_array($decoded) || empty($decoded)) {
        return koobdTeacherDefaultStoryPages();
    }

    // The submitted list order is the authoritative display order. Page IDs
    // are stable identifiers and must never be used to reorder pages.
    $decoded = array_values($decoded);
    $backgrounds = koobdBackgroundCatalog();
    $characters = koobdCharacterCatalog();
    $pages = [];

    foreach ($decoded as $index => $page) {
        if (!is_array($page)) {
            continue;
        }

        $transition = trim((string)($page['transition'] ?? 'none'));
        if (!in_array($transition, ['none', 'fade-in', 'fade-out', 'fade-both'], true)) {
            $transition = 'none';
        }

        $backgroundKey = trim((string)($page['background'] ?? ''));
        if ($backgroundKey !== '' && !isset($backgrounds[$backgroundKey])) {
            $backgroundKey = '';
        }

        $backgroundColor = trim((string)($page['backgroundColor'] ?? '#ffffff'));
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $backgroundColor)) {
            $backgroundColor = '#ffffff';
        }

        $leftCharacter = (string)($page['leftCharacter'] ?? '');
        if ($leftCharacter !== '' && !isset($characters[$leftCharacter])) {
            $leftCharacter = '';
        }

        $rightCharacter = (string)($page['rightCharacter'] ?? '');
        if ($rightCharacter !== '' && !isset($characters[$rightCharacter])) {
            $rightCharacter = '';
        }
        // Story Mode can also show The False Knight's characters and scenery
        // (from the Platform Mode library) or the teacher's own uploads.
        $leftCharacterAsset = koobdPlatformerMediaPath($page['leftCharacterAsset'] ?? '', ['image']);
        $rightCharacterAsset = koobdPlatformerMediaPath($page['rightCharacterAsset'] ?? '', ['image']);
        $backgroundLibrary = koobdCleanId($page['backgroundLibrary'] ?? '');

        $elements = [];
        $rawElements = $page['elements'] ?? null;
        if (is_array($rawElements)) {
            foreach ($rawElements as $elementIndex => $element) {
                if (!is_array($element)) {
                    continue;
                }

                $type = trim((string)($element['type'] ?? ''));
                if (!in_array($type, ['title', 'narration', 'dialogue', 'choices'], true)) {
                    continue;
                }
                // A choice for the reader (Story Mode branching): a question and
                // up to four answers, each leading on, to a page, or to the end.
                if ($type === 'choices') {
                    $choices = [];
                    foreach (array_slice(is_array($element['choices'] ?? null) ? $element['choices'] : [], 0, 4) as $choice) {
                        if (!is_array($choice)) continue;
                        $choiceText = koobdCleanText($choice['text'] ?? '', 120);
                        if ($choiceText === '') continue;
                        $choices[] = ['text' => $choiceText, 'goto' => koobdCleanGoto($choice['goto'] ?? null)];
                    }
                    $elements[] = [
                        'id' => koobdCleanId($element['id'] ?? '', 'element-' . ($index + 1) . '-' . ($elementIndex + 1)),
                        'type' => 'choices',
                        'text' => ($question = koobdStoryLine($element, 400))['text'],
                        'rich' => $question['rich'],
                        'choices' => $choices,
                        'speaker' => '',
                        'side' => '',
                        'voiceOverEnabled' => false,
                        'voiceOverUrl' => '',
                        'voiceOverName' => '',
                    ];
                    continue;
                }

                $text = trim((string)($element['text'] ?? ''));
                $speaker = trim((string)($element['speaker'] ?? ''));
                $side = trim((string)($element['side'] ?? 'left'));
                if (!in_array($side, ['left', 'right'], true)) {
                    $side = 'left';
                }

                $voiceOverUrl = trim((string)($element['voiceOverUrl'] ?? ''));
                if (stripos($voiceOverUrl, 'data:audio/') === 0) {
                    $voiceOverUrl = '';
                }

                // The line's words and its formatting (js/rich-text.js).
                $line = koobdStoryLine(['text' => $text, 'rich' => $element['rich'] ?? ''], 5000);
                $elements[] = [
                    'id' => trim((string)($element['id'] ?? ('element-' . ($index + 1) . '-' . ($elementIndex + 1)))),
                    'type' => $type,
                    'text' => $line['text'],
                    'rich' => $line['rich'],
                    'speaker' => $type === 'dialogue' ? $speaker : '',
                    'side' => $type === 'dialogue' ? $side : '',
                    'voiceOverEnabled' => !empty($element['voiceOverEnabled']),
                    'voiceOverUrl' => $voiceOverUrl,
                    'voiceOverName' => trim((string)($element['voiceOverName'] ?? '')),
                    // A title's own font ('' = the story's font).
                    'font' => $type === 'title' ? koobdCleanChoice($element['font'] ?? '', array_merge([''], koobdStoryFontIds()), '') : '',
                    'size' => $type === 'title' ? koobdCleanChoice($element['size'] ?? '', koobdTitleSizeIds(), '') : '',
                ] + array_intersect_key(koobdCleanLineAudio($element), ['sfx' => 1, 'sfxRepeat' => 1]);
            }
        } else {
            $legacyPageTitle = trim((string)($page['pageTitle'] ?? ''));
            $legacyPageText = trim((string)($page['pageText'] ?? ''));

            if ($legacyPageTitle !== '') {
                $elements[] = [
                    'id' => 'element-' . ($index + 1) . '-title',
                    'type' => 'title',
                    'text' => $legacyPageTitle,
                    'speaker' => '',
                    'side' => '',
                    'voiceOverEnabled' => false,
                    'voiceOverUrl' => '',
                    'voiceOverName' => '',
                ];
            }

            if ($legacyPageText !== '') {
                $elements[] = [
                    'id' => 'element-' . ($index + 1) . '-narration',
                    'type' => 'narration',
                    'text' => $legacyPageText,
                    'speaker' => '',
                    'side' => '',
                    'voiceOverEnabled' => false,
                    'voiceOverUrl' => '',
                    'voiceOverName' => '',
                ];
            }
        }

        $pages[] = [
            'id' => (int)($page['id'] ?? ($index + 1)),
            // A stable key, so links to this page (choices, "what happens
            // next") still find it when pages are moved around.
            'key' => koobdCleanId($page['key'] ?? '', 'pg' . ($index + 1)),
            // What happens after this page: the next page, a chosen page, or the end.
            'next' => koobdCleanGoto($page['next'] ?? null, ['next', 'page', 'end']),
            'displayOrder' => count($pages),
            'pageType' => in_array(($page['pageType'] ?? ''), ['normal', 'platformer'], true) ? $page['pageType'] : '',
            'pageTitle' => trim((string)($page['pageTitle'] ?? ('Page ' . ($index + 1)))),
            // Optional stage name and subtitle, shown to readers on arriving at the page.
            'stageName' => mb_substr(trim((string)($page['stageName'] ?? '')), 0, 60),
            'stageSubtitle' => mb_substr(trim((string)($page['stageSubtitle'] ?? '')), 0, 60),
            'transition' => $transition,
            'background' => $backgroundKey,
            'backgroundLibrary' => $backgroundLibrary,
            'backgroundAsset' => koobdPlatformerMediaPath($page['backgroundAsset'] ?? '', ['image']),
            'backgroundColor' => $backgroundColor,
            'leftCharacter' => $leftCharacterAsset !== '' ? '' : $leftCharacter,
            'rightCharacter' => $rightCharacterAsset !== '' ? '' : $rightCharacter,
            'leftCharacterAsset' => $leftCharacterAsset,
            'rightCharacterAsset' => $rightCharacterAsset,
            'platformer' => koobdPlatformerSceneFromData($page['platformer'] ?? null),
            // The page's music and surroundings (js/teacher-story-player.js).
            'audio' => koobdCleanPageAudio($page['audio'] ?? null),
            'elements' => $elements,
        ];
    }

    return !empty($pages) ? $pages : koobdTeacherDefaultStoryPages();
}

function koobdTeacherStoryCoverFromPages(array $pages): string
{
    $backgrounds = koobdBackgroundCatalog();
    $firstPage = $pages[0] ?? null;
    if (is_array($firstPage)) {
        $backgroundKey = (string)($firstPage['background'] ?? '');
        if ($backgroundKey !== '' && isset($backgrounds[$backgroundKey])) {
            return $backgrounds[$backgroundKey]['asset'];
        }
        if (!empty($firstPage['backgroundAsset'])) {
            return (string)$firstPage['backgroundAsset'];
        }
    }

    return 'assets/images/banners/banner1.jpg';
}

function koobdTeacherUploadStoryCover(array $file, int $ownerId): ?string
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null;
    }

    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        return null;
    }

    $tmpPath = (string)($file['tmp_name'] ?? '');
    if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
        return null;
    }

    $originalName = trim((string)($file['name'] ?? 'cover'));
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
    if (!in_array($extension, $allowedExtensions, true)) {
        return null;
    }

    $uploadDir = __DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'story-covers';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0777, true) && !is_dir($uploadDir)) {
        return null;
    }

    $safeBase = preg_replace('/[^a-z0-9\-]+/i', '-', pathinfo($originalName, PATHINFO_FILENAME));
    $safeBase = trim((string)$safeBase, '-');
    if ($safeBase === '') {
        $safeBase = 'story-cover';
    }

    $storedName = sprintf(
        'teacher-cover-%d-%d-%s-%s.%s',
        $ownerId,
        time(),
        bin2hex(random_bytes(4)),
        $safeBase,
        $extension
    );

    $destination = $uploadDir . DIRECTORY_SEPARATOR . $storedName;
    if (!move_uploaded_file($tmpPath, $destination)) {
        return null;
    }

    return 'uploads/story-covers/' . $storedName;
}

function koobdUploadSharedStoryCover(array $file, int $ownerId): ?string
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null;
    }

    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        return null;
    }

    $tmpPath = (string)($file['tmp_name'] ?? '');
    if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
        return null;
    }

    $originalName = trim((string)($file['name'] ?? 'cover'));
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
    if (!in_array($extension, $allowedExtensions, true)) {
        return null;
    }

    $uploadDir = __DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'story-covers';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0777, true) && !is_dir($uploadDir)) {
        return null;
    }

    $safeBase = preg_replace('/[^a-z0-9\-]+/i', '-', pathinfo($originalName, PATHINFO_FILENAME));
    $safeBase = trim((string)$safeBase, '-');
    if ($safeBase === '') {
        $safeBase = 'story-cover';
    }

    $storedName = sprintf(
        'shared-story-cover-%d-%d-%s-%s.%s',
        $ownerId,
        time(),
        bin2hex(random_bytes(4)),
        $safeBase,
        $extension
    );

    $destination = $uploadDir . DIRECTORY_SEPARATOR . $storedName;
    if (!move_uploaded_file($tmpPath, $destination)) {
        return null;
    }

    return 'uploads/story-covers/' . $storedName;
}

function koobdUploadSharedStoryFile(array $file, int $ownerId): ?array
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null;
    }

    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        return null;
    }

    $tmpPath = (string)($file['tmp_name'] ?? '');
    if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
        return null;
    }

    $originalName = trim((string)($file['name'] ?? 'story'));
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $allowedExtensions = ['txt', 'pdf', 'doc', 'docx', 'rtf', 'md'];
    if (!in_array($extension, $allowedExtensions, true)) {
        return null;
    }

    $uploadDir = __DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'shared-stories';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0777, true) && !is_dir($uploadDir)) {
        return null;
    }

    $safeBase = preg_replace('/[^a-z0-9\-]+/i', '-', pathinfo($originalName, PATHINFO_FILENAME));
    $safeBase = trim((string)$safeBase, '-');
    if ($safeBase === '') {
        $safeBase = 'story-file';
    }

    $storedName = sprintf(
        'story-%d-%d-%s-%s.%s',
        $ownerId,
        time(),
        bin2hex(random_bytes(4)),
        $safeBase,
        $extension
    );

    $destination = $uploadDir . DIRECTORY_SEPARATOR . $storedName;
    if (!move_uploaded_file($tmpPath, $destination)) {
        return null;
    }

    return [
        'path' => 'uploads/shared-stories/' . $storedName,
        'name' => $originalName,
        'extension' => $extension,
    ];
}

function koobdSyncTeacherStoryToSharedFeed(array $teacherStoryRow): bool
{
    global $conn;

    $teacherStoryId = (int)($teacherStoryRow['id'] ?? 0);
    $teacherId = (int)($teacherStoryRow['teacher_id'] ?? 0);
    if ($teacherStoryId <= 0 || $teacherId <= 0) {
        error_log('Unable to synchronize a teacher story with the shared feed: missing story or owner ID.');
        return false;
    }

    $status = trim((string)($teacherStoryRow['status'] ?? 'draft'));

    if ($status !== 'published') {
        $deleteStmt = $conn->prepare("DELETE FROM stories WHERE teacher_story_id = ?");
        if (!$deleteStmt) {
            error_log('Unable to prepare a shared story removal.');
            return false;
        }
        $deleteStmt->bind_param("i", $teacherStoryId);
        $success = $deleteStmt->execute();
        $deleteStmt->close();
        if (!$success) {
            error_log('Unable to remove a non-published teacher story from the shared feed.');
        }
        return $success;
    }

    $title = trim((string)($teacherStoryRow['title'] ?? 'Untitled Story'));
    $subtitle = trim((string)($teacherStoryRow['lesson'] ?? ''));
    if ($subtitle === '') {
        $subtitle = trim((string)($teacherStoryRow['description'] ?? ''));
    }
    if ($subtitle === '') {
        $subtitle = 'Published story';
    }

    $coverImage = trim((string)($teacherStoryRow['cover_image'] ?? ''));
    if ($coverImage === '') {
        $coverImage = null;
    }

    $existingStmt = $conn->prepare("SELECT id FROM stories WHERE teacher_story_id = ? LIMIT 1");
    if (!$existingStmt) {
        error_log('Unable to prepare a shared story lookup.');
        return false;
    }

    $existingStmt->bind_param("i", $teacherStoryId);
    if (!$existingStmt->execute()) {
        $existingStmt->close();
        error_log('Unable to look up a shared story.');
        return false;
    }
    $existingResult = $existingStmt->get_result();
    $existingRow = $existingResult ? $existingResult->fetch_assoc() : null;
    $existingStmt->close();

    if ($existingRow) {
        $storyId = (int)$existingRow['id'];
        $updateStmt = $conn->prepare(
            "UPDATE stories
             SET creator_user_id = ?, title = ?, subtitle = ?, source_file = NULL, source_file_name = NULL, cover_image = ?
             WHERE id = ?"
        );
        if (!$updateStmt) {
            error_log('Unable to prepare a shared story update.');
            return false;
        }

        $updateStmt->bind_param("isssi", $teacherId, $title, $subtitle, $coverImage, $storyId);
        $success = $updateStmt->execute();
        $updateStmt->close();
        if (!$success) {
            error_log('Unable to update a shared story.');
        }
        return $success;
    }

    $insertStmt = $conn->prepare(
        "INSERT INTO stories (creator_user_id, teacher_story_id, title, subtitle, source_file, source_file_name, cover_image)
         VALUES (?, ?, ?, ?, NULL, NULL, ?)"
    );
    if (!$insertStmt) {
        error_log('Unable to prepare a shared story publication.');
        return false;
    }

    $insertStmt->bind_param("iisss", $teacherId, $teacherStoryId, $title, $subtitle, $coverImage);
    $success = $insertStmt->execute();
    $insertStmt->close();
    if (!$success) {
        error_log('Unable to publish a story to the shared feed.');
    }
    return $success;
}

function koobdTeacherStoryFromRow(array $row): array
{
    $pages = koobdTeacherStoryPagesFromJson($row['pages_json'] ?? null);
    $description = trim((string)($row['description'] ?? ''));
    $lesson = trim((string)($row['lesson'] ?? ''));
    $coverImage = trim((string)($row['cover_image'] ?? ''));

    return [
        'id' => koobdTeacherStoryKey((int)$row['id']),
        'type' => 'teacher_story',
        'teacher_story_id' => (int)$row['id'],
        'teacher_id' => (int)($row['teacher_id'] ?? 0),
        'title' => trim((string)($row['title'] ?? 'Untitled Story')),
        'description' => $description,
        'lesson' => $lesson !== '' ? $lesson : $description,
        'status' => trim((string)($row['status'] ?? 'draft')),
        'submission_code' => trim((string)($row['submission_code'] ?? '')),
        'version_number' => max(1, (int)($row['version_number'] ?? 1)),
        'approved_version' => max(0, (int)($row['approved_version'] ?? 0)),
        'story_mode' => trim((string)($row['story_mode'] ?? 'regular')) === 'platformer' ? 'platformer' : 'regular',
        'href' => 'teacher_story_preview.php?id=' . (int)$row['id'],
        'cover' => $coverImage,
        'pages' => $pages,
        'page_count' => count($pages),
        'settings' => koobdStorySettingsFromData(json_decode((string)($row['settings_json'] ?? ''), true)),
        'updated_at' => (string)($row['updated_at'] ?? ''),
    ];
}

function koobdSharedStoryFromRow(array $row): array
{
    $creatorName = trim((string)($row['creator_name'] ?? ''));
    if ($creatorName === '') {
        $creatorName = trim((string)($row['username'] ?? ''));
    }
    if ($creatorName === '') {
        $creatorName = 'Unknown creator';
    }

    $creatorRole = koobdIsTeacher($row) ? 'Teacher' : 'Student';
    $approvedByName = trim((string)($row['approved_by_name'] ?? ''));
    if ($approvedByName === '') {
        $approvedByName = trim((string)($row['approved_by_username'] ?? ''));
    }
    $creatorLabel = 'Created by ' . $creatorName;
    if ($approvedByName !== '') {
        $creatorLabel .= ' · Approved by ' . $approvedByName;
    }

    return [
        'id' => (int)($row['id'] ?? 0),
        'title' => trim((string)($row['title'] ?? 'Untitled Story')),
        'subtitle' => trim((string)($row['subtitle'] ?? '')),
        'source_file' => trim((string)($row['source_file'] ?? '')),
        'source_file_name' => trim((string)($row['source_file_name'] ?? '')),
        'cover' => trim((string)($row['cover_image'] ?? '')),
        'teacher_story_id' => (int)($row['teacher_story_id'] ?? 0),
        // 'story' or 'platform': from the editor story it was published from.
        'mode' => ($row['story_mode'] ?? '') === 'platformer' ? 'platform' : 'story',
        'description' => trim((string)($row['story_description'] ?? '')),
        'lesson' => trim((string)($row['story_lesson'] ?? '')),
        'creator_user_id' => (int)($row['creator_user_id'] ?? 0),
        'creator_name' => $creatorName,
        'creator_role' => $creatorRole,
        'creator_label' => $creatorLabel,
        'creator_attribution' => 'Created by ' . $creatorName,
        'approved_by_name' => $approvedByName,
        'created_at' => (string)($row['created_at'] ?? ''),
        'href' => ((int)($row['teacher_story_id'] ?? 0) > 0)
            ? 'shared_story_reader.php?id=' . (int)($row['id'] ?? 0)
            : 'story.php?id=' . (int)($row['id'] ?? 0),
    ];
}

function koobdSharedStories(int $limit = 12): array
{
    global $conn;

    $limit = max(1, min(48, $limit));
    $stmt = $conn->prepare(
        "SELECT
            s.id,
            s.creator_user_id,
            s.teacher_story_id,
            s.title,
            s.subtitle,
            s.source_file,
            s.source_file_name,
            s.cover_image,
            u.username,
            u.profile_reader_name AS creator_name,
            u.user_role,
            s.created_at,
            ts.story_mode,
            ts.description AS story_description,
            ts.lesson AS story_lesson,
            ts.status AS teacher_story_status,
            ts.approved_by,
            COALESCE(NULLIF(reviewer.profile_reader_name, ''), reviewer.username, '') AS approved_by_name,
            reviewer.username AS approved_by_username
         FROM stories s
         INNER JOIN users u ON u.id = s.creator_user_id
         LEFT JOIN teacher_stories ts ON ts.id = s.teacher_story_id
         LEFT JOIN users reviewer ON reviewer.id = ts.approved_by
         WHERE (ts.id IS NULL AND u.user_role = 'teacher')
            OR (ts.status = 'published' AND (u.user_role = 'teacher' OR ts.approved_by IS NOT NULL))
         ORDER BY s.updated_at DESC, s.created_at DESC, s.id DESC
         LIMIT {$limit}"
    );

    if (!$stmt) {
        return [];
    }

    $stmt->execute();
    $result = $stmt->get_result();
    $stories = [];

    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $stories[] = koobdSharedStoryFromRow($row);
        }
    }

    $stmt->close();
    return $stories;
}

function koobdSharedStoriesForUser(int $userId, int $limit = 24): array
{
    global $conn;

    if ($userId <= 0) {
        return [];
    }

    $limit = max(1, min(96, $limit));
    $stmt = $conn->prepare(
        "SELECT
            s.id,
            s.creator_user_id,
            s.teacher_story_id,
            s.title,
            s.subtitle,
            s.source_file,
            s.source_file_name,
            s.cover_image,
            u.username,
            u.profile_reader_name AS creator_name,
            u.user_role,
            ts.story_mode,
            ts.description AS story_description,
            ts.lesson AS story_lesson,
            ts.status AS teacher_story_status,
            ts.approved_by,
            COALESCE(NULLIF(reviewer.profile_reader_name, ''), reviewer.username, '') AS approved_by_name,
            reviewer.username AS approved_by_username
         FROM stories s
         INNER JOIN users u ON u.id = s.creator_user_id
         LEFT JOIN teacher_stories ts ON ts.id = s.teacher_story_id
         LEFT JOIN users reviewer ON reviewer.id = ts.approved_by
         WHERE s.creator_user_id = ?
           AND s.teacher_story_id IS NULL
           AND u.user_role = 'teacher'
         ORDER BY s.updated_at DESC, s.created_at DESC, s.id DESC
         LIMIT {$limit}"
    );

    if (!$stmt) {
        return [];
    }

    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    $stories = [];

    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $stories[] = koobdSharedStoryFromRow($row);
        }
    }

    $stmt->close();
    return $stories;
}

function koobdSharedStoryById(int $storyId): ?array
{
    global $conn;

    if ($storyId <= 0) {
        return null;
    }

    $stmt = $conn->prepare(
        "SELECT
            s.id,
            s.creator_user_id,
            s.teacher_story_id,
            s.title,
            s.subtitle,
            s.source_file,
            s.source_file_name,
            s.cover_image,
            u.username,
            u.profile_reader_name AS creator_name,
            u.user_role,
            ts.story_mode,
            ts.description AS story_description,
            ts.lesson AS story_lesson,
            ts.status AS teacher_story_status,
            ts.approved_by,
            COALESCE(NULLIF(reviewer.profile_reader_name, ''), reviewer.username, '') AS approved_by_name,
            reviewer.username AS approved_by_username
         FROM stories s
         INNER JOIN users u ON u.id = s.creator_user_id
         LEFT JOIN teacher_stories ts ON ts.id = s.teacher_story_id
         LEFT JOIN users reviewer ON reviewer.id = ts.approved_by
         WHERE s.id = ?
         LIMIT 1"
    );
    $stmt->bind_param("i", $storyId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    if (!$row) {
        return null;
    }
    if ((int)($row['teacher_story_id'] ?? 0) <= 0 && !koobdIsTeacher(['user_role' => $row['user_role'] ?? ''])) {
        return null;
    }
    if ((int)($row['teacher_story_id'] ?? 0) > 0) {
        $isTeacherOwned = koobdIsTeacher(['user_role' => $row['user_role'] ?? '']);
        if (($row['teacher_story_status'] ?? '') !== 'published'
            || (!$isTeacherOwned && (int)($row['approved_by'] ?? 0) <= 0)) {
            return null;
        }
    }
    return koobdSharedStoryFromRow($row);
}

function koobdTeacherStoryById(int $storyDbId): ?array
{
    global $conn;

    if ($storyDbId <= 0) {
        return null;
    }

    $stmt = $conn->prepare("SELECT * FROM teacher_stories WHERE id = ? LIMIT 1");
    $stmt->bind_param("i", $storyDbId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    return $row ? koobdTeacherStoryFromRow($row) : null;
}

function koobdTeacherStoriesForUser(int $teacherId, bool $publishedOnly = false): array
{
    global $conn;

    if ($teacherId <= 0) {
        return [];
    }

    if ($publishedOnly) {
        $stmt = $conn->prepare(
            "SELECT * FROM teacher_stories WHERE teacher_id = ? AND status = 'published' ORDER BY updated_at DESC, created_at DESC"
        );
    } else {
        $stmt = $conn->prepare(
            "SELECT * FROM teacher_stories WHERE teacher_id = ? ORDER BY updated_at DESC, created_at DESC"
        );
    }
    $stmt->bind_param("i", $teacherId);
    $stmt->execute();
    $result = $stmt->get_result();
    $stories = [];

    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $stories[] = koobdTeacherStoryFromRow($row);
        }
    }

    $stmt->close();

    return $stories;
}

function koobdAssignableStoriesForTeacher(int $teacherId): array
{
    $stories = koobdStoryCatalog();

    foreach (koobdTeacherStoriesForUser($teacherId, true) as $story) {
        $stories[$story['id']] = $story;
    }

    return $stories;
}

function koobdStoryMeta(string $storyId): ?array
{
    $stories = koobdStoryCatalog();
    if (isset($stories[$storyId])) {
        return $stories[$storyId];
    }

    if (koobdIsTeacherStoryId($storyId)) {
        return koobdTeacherStoryById(koobdTeacherStoryDbId($storyId));
    }

    return null;
}

function koobdStoryPreviewHref(array $story): string
{
    if (($story['type'] ?? '') === 'teacher_story') {
        return 'teacher_story_preview.php?id=' . (int)($story['teacher_story_id'] ?? 0);
    }

    $baseHref = trim((string)($story['href'] ?? 'home.php'));
    return $baseHref . (strpos($baseHref, '?') === false ? '?restart=1' : '&restart=1');
}

// A classroom activity's reader link for a student: resume=1 continues where
// they stopped (their progress in this activity), restart=1 starts afresh.
function koobdStoryStudentHref(array $story, int $activityId, int $progress = 0): string
{
    $modeQuery = ($progress > 0 && $progress < 100) ? 'resume=1' : 'restart=1';

    if (($story['type'] ?? '') === 'teacher_story') {
        return 'teacher_story_reader.php?activity_id=' . $activityId . '&' . $modeQuery;
    }

    $baseHref = trim((string)($story['href'] ?? 'home.php'));
    return $baseHref . (strpos($baseHref, '?') === false ? '?' : '&') . 'activity_id=' . $activityId . '&' . $modeQuery;
}

// --- Classroom activities (classroom_activities) ------------------------------------------
// One classroom, many activities: each assigns a story and keeps its own
// progress for every student, in story_progress under "activity:<id>".
function koobdActivityProgressContext(int $activityId): string
{
    return 'activity:' . $activityId;
}

// Due dates are school days in the Philippines' time zone: an activity can be
// done until the end of its due day, then it is closed. A closed activity
// cannot be opened, answered, played or submitted by students any more (a
// quiz they already submitted still shows its result); its teacher still
// sees everything.
const KOOBD_TIMEZONE = 'Asia/Manila';
function koobdToday(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone(KOOBD_TIMEZONE)))->format('Y-m-d');
}
function koobdActivityClosed(array $activity): bool
{
    $due = (string)($activity['due_date'] ?? '');
    return $due !== '' && $due < koobdToday();
}
// A student sent back to their classroom from a closed activity.
function koobdLeaveClosedActivity(array $activity): void
{
    header('Location: classroom_room.php?id=' . (int)$activity['classroom_id'] . '&closed=' . (int)$activity['id']);
    exit();
}

// An activity row with its story and the name to show (its title, or the
// story's title when the teacher left it blank).
function koobdActivityFromRow(array $row): array
{
    $type = ($row['activity_type'] ?? 'story') === 'quiz' ? 'quiz' : 'story';
    $story = $type === 'story' ? koobdStoryMeta((string)($row['story_id'] ?? '')) : null;
    $title = trim((string)($row['title'] ?? ''));
    $instructions = trim((string)($row['instructions'] ?? ''));
    return [
        'id' => (int)$row['id'],
        'classroom_id' => (int)$row['classroom_id'],
        // 'story': read or play a story; 'quiz': answer questions.
        'type' => $type,
        // A quiz can be a 'draft' (only its teacher sees it) or 'published'.
        'status' => ($row['status'] ?? 'published') === 'draft' ? 'draft' : 'published',
        'description' => trim((string)($row['description'] ?? '')),
        'show_answers' => !isset($row['show_answers']) || (int)$row['show_answers'] === 1,
        // A quiz can give each student its questions in their own order.
        'shuffle' => isset($row['shuffle_questions']) && (int)$row['shuffle_questions'] === 1,
        // A Platform Mode story activity can be played together (classmates
        // shown as silhouettes, one shared progress bar).
        'multiplayer' => isset($row['multiplayer']) && (int)$row['multiplayer'] === 1,
        'title' => $title !== '' ? $title : ($story['title'] ?? ($type === 'quiz' ? 'Untitled activity' : 'Activity')),
        'raw_title' => $title,
        'instructions' => $instructions,
        'lesson' => $story['lesson'] ?? '',
        'story_id' => (string)$row['story_id'],
        'story' => $story,
        'mode' => koobdStoryMode($story),
        'due_date' => !empty($row['due_date']) ? (string)$row['due_date'] : '',
        'position' => (int)($row['position'] ?? 0),
        'created_at' => (string)($row['created_at'] ?? ''),
    ];
}

// A classroom's activities in the teacher's order: the newest at the top (a
// new activity takes the highest position; Move up / down reorders them).
// Students get only the published ones ($publishedOnly).
function koobdClassroomActivities(int $classroomId, bool $publishedOnly = false): array
{
    global $conn;
    $activities = [];
    $stmt = $conn->prepare(
        "SELECT * FROM classroom_activities WHERE classroom_id = ?"
        . ($publishedOnly ? " AND status = 'published'" : '')
        . " ORDER BY position DESC, id DESC"
    );
    if (!$stmt) {
        return $activities;
    }
    $stmt->bind_param('i', $classroomId);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($result && ($row = $result->fetch_assoc())) {
        $activities[] = koobdActivityFromRow($row);
    }
    $stmt->close();
    return $activities;
}

// How many activities each of these classrooms has: [classroomId => count].
function koobdClassroomActivityCounts(array $classroomIds, bool $publishedOnly = false): array
{
    global $conn;
    $counts = [];
    $ids = array_values(array_filter(array_map('intval', $classroomIds)));
    if (!$ids) {
        return $counts;
    }
    $result = $conn->query(
        "SELECT classroom_id, COUNT(*) AS total FROM classroom_activities
         WHERE classroom_id IN (" . implode(',', $ids) . ")"
        . ($publishedOnly ? " AND status = 'published'" : '')
        . " GROUP BY classroom_id"
    );
    while ($result && ($row = $result->fetch_assoc())) {
        $counts[(int)$row['classroom_id']] = (int)$row['total'];
    }
    return $counts;
}

// The activity a student may open: it exists, its classroom is active and the
// student has joined it. With the classroom's title/code and its teacher's
// profile columns; null otherwise.
function koobdStudentActivity(int $activityId, int $userId): ?array
{
    global $conn;
    if ($activityId <= 0) {
        return null;
    }
    $stmt = $conn->prepare(
        "SELECT
            a.*,
            c.title AS classroom_title,
            c.class_code,
            t.username,
            t.selected_reader,
            t.profile_reader_name,
            t.profile_top_color,
            t.profile_bottom_color,
            t.profile_accent_color,
            t.profile_card_style,
            t.profile_scale,
            t.user_role
         FROM classroom_activities a
         INNER JOIN classrooms c ON c.id = a.classroom_id
         INNER JOIN classroom_students cs ON cs.classroom_id = c.id AND cs.student_user_id = ?
         INNER JOIN users t ON t.id = c.teacher_id
         WHERE a.id = ? AND a.status = 'published' AND c.status = 'active' AND t.user_role = 'teacher'
         LIMIT 1"
    );
    if (!$stmt) {
        return null;
    }
    $stmt->bind_param('ii', $userId, $activityId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();
    return $row ?: null;
}

// Every student's progress in each activity: [activityId => [userId => 0-100]].
// Only progress in the activity's current story counts (a teacher may change it).
function koobdActivityProgressMap(array $activities, array $userIds): array
{
    global $conn;
    $map = [];
    $storyOf = [];
    foreach ($activities as $activity) {
        $storyOf[koobdActivityProgressContext((int)$activity['id'])] = [(int)$activity['id'], (string)$activity['story_id']];
        $map[(int)$activity['id']] = [];
    }
    $ids = array_values(array_filter(array_map('intval', $userIds)));
    if (!$storyOf || !$ids) {
        return $map;
    }
    $result = $conn->query(
        "SELECT user_id, story_id, progress_context, progress FROM story_progress
         WHERE progress_context LIKE 'activity:%' AND user_id IN (" . implode(',', $ids) . ")"
    );
    while ($result && ($row = $result->fetch_assoc())) {
        $context = (string)$row['progress_context'];
        if (!isset($storyOf[$context]) || $storyOf[$context][1] !== (string)$row['story_id']) {
            continue;
        }
        $map[$storyOf[$context][0]][(int)$row['user_id']] = max(0, min(100, (int)$row['progress']));
    }
    return $map;
}

// --- Question activities (quizzes) --------------------------------------------------------
// Question types: multiple_choice and true_false (choices, one correct),
// identification (the student types the answer; the question's choices are
// its accepted answers, all marked correct), essay (the student writes an
// answer; the teacher grades it) and speak - "Say it" (the student says a word
// or phrase aloud; the question's choices are what they are asked to say, the
// first shown to them, and what the browser heard is compared with them).
// Each question is worth `points`: 1, or what the teacher sets for an essay.
function koobdQuizTypes(): array
{
    return ['multiple_choice', 'true_false', 'identification', 'essay', 'speak'];
}

// The languages a question can be read aloud and spoken in.
function koobdSpeechLang(?string $lang): string
{
    return in_array($lang, ['en-US', 'fil-PH'], true) ? (string)$lang : 'auto';
}

// How close what a student said (as the browser heard it) is to a phrase,
// from 0 to 1: lower case, no accents or punctuation, then how few letters
// differ. The same rule as KoobdSpeech.similarity() in js/koobd-speech.js.
function koobdSpeechNormalize(string $text): string
{
    $text = function_exists('mb_strtolower') ? mb_strtolower($text, 'UTF-8') : strtolower($text);
    $text = strtr($text, [
        'á' => 'a', 'à' => 'a', 'â' => 'a', 'ä' => 'a', 'ã' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
        'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i', 'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'ö' => 'o', 'õ' => 'o',
        'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ñ' => 'n', 'ç' => 'c', '’' => '', "'" => '',
    ]);
    $text = preg_replace('/[^a-z0-9\s]+/', ' ', $text) ?? $text;
    return trim(preg_replace('/\s+/', ' ', $text) ?? $text);
}
const KOOBD_SPEECH_PASS = 0.8;
function koobdSpeechLetters(string $a, string $b): float
{
    return $a === $b ? 1.0 : max(0.0, 1 - levenshtein($a, $b) / max(strlen($a), strlen($b), 1));
}
// How few letters differ, and how many of the words were said (a word counts
// when it is nearly right), whichever is lower: a slip inside a word passes,
// a different word does not.
function koobdSpeechScore(string $target, string $heard): float
{
    $a = substr(koobdSpeechNormalize($target), 0, 250);
    $b = substr(koobdSpeechNormalize($heard), 0, 250);
    if ($a === '' || $b === '') {
        return 0.0;
    }
    if ($a === $b) {
        return 1.0;
    }
    $asked = explode(' ', $a);
    $said = explode(' ', $b);
    $used = [];
    $matched = 0;
    foreach ($asked as $word) {
        foreach ($said as $position => $other) {
            if (!isset($used[$position]) && koobdSpeechLetters($word, $other) >= 0.7) {
                $used[$position] = true;
                $matched++;
                break;
            }
        }
    }
    return min(koobdSpeechLetters($a, $b), $matched / max(count($asked), count($said)));
}

function koobdQuizType(?string $type): string
{
    return in_array($type, koobdQuizTypes(), true) ? (string)$type : 'multiple_choice';
}

// Whether a type is answered by typing (no choices to pick from).
function koobdQuizIsTyped(string $type): bool
{
    return $type === 'identification' || $type === 'essay' || $type === 'speak';
}

// A quiz's questions in order, each with its choices. $withKey adds which choice
// is correct (for the teacher, the grader and a student's review once allowed);
// without it a student's browser never receives the answer key - and never an
// identification question's accepted answers.
function koobdQuizQuestions(int $activityId, bool $withKey = false): array
{
    global $conn;
    $questions = [];
    $stmt = $conn->prepare(
        "SELECT q.id AS question_id, q.question_type, q.prompt, q.points, q.story_point, q.optional, q.speech_lang, q.audio_path, q.position AS question_position,
                c.id AS choice_id, c.label, c.is_correct, c.position AS choice_position
         FROM activity_questions q
         LEFT JOIN activity_choices c ON c.question_id = q.id
         WHERE q.activity_id = ?
         ORDER BY q.position ASC, q.id ASC, c.position ASC, c.id ASC"
    );
    if (!$stmt) {
        return $questions;
    }
    $stmt->bind_param('i', $activityId);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($result && ($row = $result->fetch_assoc())) {
        $qid = (int)$row['question_id'];
        $type = koobdQuizType($row['question_type']);
        if (!isset($questions[$qid])) {
            $questions[$qid] = [
                'id' => $qid,
                'type' => $type,
                'prompt' => (string)$row['prompt'],
                // An essay - and any question placed in a story - is worth what
                // the teacher set; other quiz questions 1 point.
                'points' => ($type === 'essay' || $row['story_point'] !== null) ? max(1, (int)$row['points']) : 1,
                // Questions in a story activity: where in the story they come
                // ('scene:<id>', 'page:<key>', 'place:<key>' or 'end'), and
                // whether the reader may skip them.
                'point' => $row['story_point'] === null ? null : (string)$row['story_point'],
                'optional' => (int)$row['optional'] === 1,
                // The language it is read aloud and spoken in (en-US, fil-PH, auto).
                'lang' => koobdSpeechLang($row['speech_lang'] ?? 'auto'),
                // The teacher's recording of how it is said (a "Say it" phrase), or null.
                'audio' => !empty($row['audio_path']) ? (string)$row['audio_path'] : null,
                'choices' => [],
            ];
        }
        if ($row['choice_id'] === null || ($type === 'identification' && !$withKey) || $type === 'essay') {
            continue;
        }
        $choice = ['id' => (int)$row['choice_id'], 'label' => (string)$row['label']];
        if ($withKey) {
            $choice['correct'] = (int)$row['is_correct'] === 1;
        }
        $questions[$qid]['choices'][] = $choice;
    }
    $stmt->close();
    return array_values($questions);
}

// An activity of this classroom teacher's, or null.
function koobdTeacherActivity(int $activityId, int $teacherId): ?array
{
    global $conn;
    $stmt = $conn->prepare(
        "SELECT a.* FROM classroom_activities a
         INNER JOIN classrooms c ON c.id = a.classroom_id
         WHERE a.id = ? AND c.teacher_id = ? LIMIT 1"
    );
    if (!$stmt) {
        return null;
    }
    $stmt->bind_param('ii', $activityId, $teacherId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

// An identification answer as it is compared: no case, no spaces at either
// end or doubled inside, no full stop at the end ("The Sun." = "the sun").
function koobdQuizNormalizeAnswer(string $text): string
{
    $text = preg_replace('/\s+/u', ' ', trim($text)) ?? trim($text);
    $text = rtrim($text, " .");
    return function_exists('mb_strtolower') ? mb_strtolower($text, 'UTF-8') : strtolower($text);
}

// Checks answers against the answer key. $answers: [questionId => choiceId]
// for multiple choice and true/false, [questionId => text] for identification
// and essay. Unanswered questions and unknown choices earn nothing. An essay
// earns nothing until graded: it keeps the points in $essayGrades
// ([questionId => ['points', 'feedback']], from an earlier grading) or stays
// pending. Returns [score, total, pending, [questionId => ['choice', 'text',
// 'correct', 'points' (null: pending), 'max', 'feedback']]].
function koobdQuizGrade(array $questions, array $answers, array $essayGrades = []): array
{
    $score = 0;
    $total = 0;
    $pending = 0;
    $results = [];
    foreach ($questions as $question) {
        $id = $question['id'];
        $max = (int)($question['points'] ?? 1);
        $total += $max;
        $entry = ['choice' => null, 'text' => null, 'correct' => false, 'points' => 0, 'max' => $max, 'feedback' => null];
        $given = $answers[$id] ?? null;
        if ($question['type'] === 'essay') {
            $entry['text'] = is_string($given) ? $given : '';
            if (isset($essayGrades[$id])) {
                $entry['points'] = max(0, min($max, (int)$essayGrades[$id]['points']));
                $entry['feedback'] = $essayGrades[$id]['feedback'];
            } elseif (trim($entry['text']) === '') {
                $entry['points'] = 0; // Nothing written: nothing to grade.
            } else {
                $entry['points'] = null;
                $pending++;
            }
            $entry['correct'] = $entry['points'] !== null && $entry['points'] >= $max;
        } elseif ($question['type'] === 'speak') {
            // What the browser heard, close enough to one of the phrases.
            $entry['text'] = is_string($given) ? $given : '';
            foreach ($question['choices'] as $choice) {
                if (trim($entry['text']) !== '' && koobdSpeechScore((string)$choice['label'], $entry['text']) >= KOOBD_SPEECH_PASS) {
                    $entry['correct'] = true;
                }
            }
            $entry['points'] = $entry['correct'] ? $max : 0;
        } elseif ($question['type'] === 'identification') {
            $entry['text'] = is_string($given) ? $given : '';
            $typed = koobdQuizNormalizeAnswer($entry['text']);
            foreach ($question['choices'] as $choice) {
                if ($typed !== '' && !empty($choice['correct']) && koobdQuizNormalizeAnswer($choice['label']) === $typed) {
                    $entry['correct'] = true;
                }
            }
            $entry['points'] = $entry['correct'] ? $max : 0;
        } else {
            $picked = is_numeric($given) ? (int)$given : 0;
            foreach ($question['choices'] as $choice) {
                if ($choice['id'] === $picked) {
                    $entry['choice'] = $picked;
                    $entry['correct'] = !empty($choice['correct']);
                }
            }
            $entry['points'] = $entry['correct'] ? $max : 0;
        }
        $score += (int)$entry['points'];
        $results[$id] = $entry;
    }
    return [$score, $total, $pending, $results];
}

// Saves a submission's graded answers (replacing any it had) and its score.
// $only: just these questions' answers (a story activity keeps a row only for
// the questions the reader has reached and answered or skipped).
function koobdQuizStoreAnswers(int $submissionId, int $score, int $total, int $pending, array $results, ?array $only = null): void
{
    global $conn;
    if ($only !== null) {
        $only = array_flip(array_map('intval', $only));
        $results = array_filter($results, static fn($questionId) => isset($only[(int)$questionId]), ARRAY_FILTER_USE_KEY);
    }
    $conn->query("DELETE FROM activity_submission_answers WHERE submission_id = " . $submissionId);
    $write = $conn->prepare(
        "INSERT INTO activity_submission_answers (submission_id, question_id, choice_id, answer_text, is_correct, points_awarded, max_points, feedback)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    foreach ($results as $questionId => $result) {
        $choice = $result['choice'];
        $text = $result['text'];
        $correct = $result['correct'] ? 1 : 0;
        $points = $result['points'];
        $max = (int)$result['max'];
        $feedback = $result['feedback'];
        $write->bind_param('iiisiiis', $submissionId, $questionId, $choice, $text, $correct, $points, $max, $feedback);
        $write->execute();
    }
    $write->close();
    $update = $conn->prepare("UPDATE activity_submissions SET score = ?, total = ?, pending = ? WHERE id = ?");
    $update->bind_param('iiii', $score, $total, $pending, $submissionId);
    $update->execute();
    $update->close();
}

// A submission's saved answers, ready to grade again: [answers, essayGrades].
function koobdQuizSavedAnswers(int $submissionId): array
{
    global $conn;
    $answers = [];
    $grades = [];
    $read = $conn->prepare("SELECT question_id, choice_id, answer_text, points_awarded, feedback FROM activity_submission_answers WHERE submission_id = ?");
    $read->bind_param('i', $submissionId);
    $read->execute();
    foreach ($read->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $questionId = (int)$row['question_id'];
        if ($row['answer_text'] !== null) {
            $answers[$questionId] = (string)$row['answer_text'];
            if ($row['points_awarded'] !== null) {
                $grades[$questionId] = ['points' => (int)$row['points_awarded'], 'feedback' => $row['feedback']];
            }
        } elseif ($row['choice_id'] !== null) {
            $answers[$questionId] = (int)$row['choice_id'];
        }
    }
    $read->close();
    return [$answers, $grades];
}

// After a teacher edits a quiz, every submission is checked again against the
// new key (answers to removed questions or choices no longer count). Essays
// keep the grade they were given (within their new points).
function koobdQuizRegrade(int $activityId): void
{
    global $conn;
    $questions = koobdQuizQuestions($activityId, true);
    $subs = $conn->prepare("SELECT id FROM activity_submissions WHERE activity_id = ?");
    $subs->bind_param('i', $activityId);
    $subs->execute();
    $ids = array_column($subs->get_result()->fetch_all(MYSQLI_ASSOC), 'id');
    $subs->close();
    foreach ($ids as $submissionId) {
        $submissionId = (int)$submissionId;
        [$answers, $grades] = koobdQuizSavedAnswers($submissionId);
        // An answer saved under another type (the teacher changed the question's
        // type) no longer fits it and does not count.
        foreach ($questions as $question) {
            $given = $answers[$question['id']] ?? null;
            if ($given !== null && koobdQuizIsTyped($question['type']) !== is_string($given)) {
                unset($answers[$question['id']], $grades[$question['id']]);
            }
            if ($question['type'] !== 'essay') {
                unset($grades[$question['id']]);
            }
        }
        [$score, $total, $pending, $results] = koobdQuizGrade($questions, $answers, $grades);
        koobdQuizStoreAnswers($submissionId, $score, $total, $pending, $results, koobdStoryAnsweredIds($activityId, $submissionId));
    }
}

// A story activity's submission keeps only the questions reached: their ids
// (null for a quiz, where every question has a row).
function koobdStoryAnsweredIds(int $activityId, int $submissionId): ?array
{
    global $conn;
    $type = $conn->query("SELECT activity_type FROM classroom_activities WHERE id = " . $activityId)->fetch_row()[0] ?? 'quiz';
    if ($type === 'quiz') {
        return null;
    }
    $rows = $conn->query("SELECT question_id FROM activity_submission_answers WHERE submission_id = " . $submissionId)->fetch_all();
    return array_map(static fn($row) => (int)$row[0], $rows);
}

// The teacher grades one essay answer: its points (0 to what it is worth) and
// feedback. The submission's score and its count of essays waiting are
// updated. Returns false if there is no such essay answer.
function koobdQuizGradeEssay(int $activityId, int $studentId, int $questionId, int $points, string $feedback): bool
{
    global $conn;
    $stmt = $conn->prepare(
        "SELECT s.id AS submission_id, q.points FROM activity_submissions s
         INNER JOIN activity_questions q ON q.activity_id = s.activity_id AND q.id = ? AND q.question_type = 'essay'
         WHERE s.activity_id = ? AND s.student_user_id = ? LIMIT 1"
    );
    $stmt->bind_param('iii', $questionId, $activityId, $studentId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) {
        return false;
    }
    $submissionId = (int)$row['submission_id'];
    [$answers, $grades] = koobdQuizSavedAnswers($submissionId);
    $grades[$questionId] = ['points' => max(0, min(max(1, (int)$row['points']), $points)), 'feedback' => $feedback !== '' ? $feedback : null];
    if (!isset($answers[$questionId])) {
        $answers[$questionId] = '';
    }
    $only = koobdStoryAnsweredIds($activityId, $submissionId);
    [$score, $total, $pending, $results] = koobdQuizGrade(koobdQuizQuestions($activityId, true), $answers, $grades);
    koobdQuizStoreAnswers($submissionId, $score, $total, $pending, $results, $only === null ? null : array_merge($only, [$questionId]));
    return true;
}

// --- Questions inside classroom story activities ------------------------------------------
// A teacher can place questions at points in the story an activity assigns.
// They belong to the activity (activity_questions.story_point), never to the
// story: the same story on the home page, or in another teacher's activity,
// plays without them. The points a story offers, in story order: before each
// part after the first (a place, a scene, or a page), and the end.
function koobdStoryQuestionPoints(?array $story): array
{
    if (!$story) {
        return [];
    }
    $points = [];
    if (($story['type'] ?? '') === 'teacher_story') {
        foreach (array_values($story['pages'] ?? []) as $index => $page) {
            if ($index === 0) {
                continue;
            }
            $name = trim((string)($page['title'] ?? ''));
            $key = trim((string)($page['key'] ?? ''));
            $points[] = [
                // The same key the story player uses (js/teacher-story-player.js).
                'key' => 'page:' . ($key !== '' ? $key : 'pg' . ($index + 1)),
                'label' => 'Before page ' . ($index + 1) . ($name !== '' ? ': ' . $name : ''),
            ];
        }
    } elseif (($story['id'] ?? '') === 'book1') {
        // The Hare and the Tortoise moves through these places
        // (hare-and-tortoise-story.js); a question comes as the story arrives.
        foreach (['startLine' => 'The start line', 'racePath' => 'The race path', 'deepWoods' => 'The deep woods', 'restingTree' => 'The resting tree', 'finishLine' => 'The finish line'] as $key => $name) {
            $points[] = ['key' => 'place:' . $key, 'label' => 'Before: ' . $name];
        }
    } elseif (($story['id'] ?? '') === 'false_knight') {
        // The False Knight's scenes after the first, in story order
        // (The False Knight/false-knight-story.js, world.scenes).
        $scenes = [
            'forest-clearing' => 'The Deep Forest', 'castle' => 'The Castle', 'castle-walls' => 'Outside the Castle Walls',
            'hillside' => 'The Hillside', 'seer-house' => "The Seer's House", 'library' => 'The Grand Library',
            'castle-gates' => 'The Castle Gates', 'mountain-pass' => 'The Mountain Pass', 'enchanted-forest' => 'The Enchanted Forest',
            'water-forest' => 'The Water Forest', 'mountain-ascent' => 'The Mountain', 'return-to-the-kingdom' => 'The Road to the Castle',
            'princess-room' => "The Princess's Room",
        ];
        foreach ($scenes as $key => $name) {
            $points[] = ['key' => 'scene:' . $key, 'label' => 'Before: ' . $name];
        }
    }
    $points[] = ['key' => 'end', 'label' => 'At the end of the story'];
    return $points;
}

// The classroom activity a story page is opened for (?activity_id=), and
// whether it is its teacher's preview (?preview=1): [activity row | null,
// preview]. A student must be in the activity's classroom; a teacher can only
// preview their own. The activity must assign this story.
function koobdReaderActivity(array $user, string $storyId): array
{
    $activityId = (int)($_GET['activity_id'] ?? 0);
    if ($activityId <= 0) {
        return [null, false];
    }
    $preview = isset($_GET['preview']) && koobdIsTeacher($user);
    $activity = $preview ? koobdTeacherActivity($activityId, (int)$user['id']) : koobdStudentActivity($activityId, (int)$user['id']);
    if (!$activity || (string)$activity['story_id'] !== $storyId || ($activity['activity_type'] ?? 'story') !== 'story') {
        return [null, false];
    }
    if (!$preview && koobdActivityClosed($activity)) {
        koobdLeaveClosedActivity($activity);
    }
    return [$activity, $preview];
}

// The tags a story page adds for an activity's questions (nothing without any).
function koobdStoryQuestionTags(?array $data): string
{
    if (!$data) {
        return '';
    }
    return '<link rel="stylesheet" href="' . htmlspecialchars(koobdAsset('css/koobd-speech.css')) . '">' . "
"
        . '  <script src="' . htmlspecialchars(koobdAsset('js/koobd-speech.js')) . '"></script>' . "
"
        . '  <link rel="stylesheet" href="' . htmlspecialchars(koobdAsset('css/story-questions.css')) . '">' . "
"
        . '  <script>window.KOOBD_STORY_QUESTIONS = ' . json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP) . ';</script>' . "
"
        . '  <script src="' . htmlspecialchars(koobdAsset('js/story-questions.js')) . '"></script>' . "
";
}

// What a story page needs to ask an activity's questions: the questions (no
// answer key) and which this student has already answered or skipped. Null
// when the activity has none. In a teacher's preview nothing is saved.
function koobdStoryQuestionsForPage(int $activityId, int $userId, bool $preview): ?array
{
    global $conn;
    $questions = array_values(array_filter(koobdQuizQuestions($activityId, false), static fn($question) => $question['point'] !== null));
    if (!$questions) {
        return null;
    }
    $done = [];
    if (!$preview) {
        $stmt = $conn->prepare(
            "SELECT a.question_id FROM activity_submission_answers a INNER JOIN activity_submissions s ON s.id = a.submission_id
             WHERE s.activity_id = ? AND s.student_user_id = ?"
        );
        $stmt->bind_param('ii', $activityId, $userId);
        $stmt->execute();
        $done = array_map(static fn($row) => (int)$row[0], $stmt->get_result()->fetch_all());
        $stmt->close();
    }
    $show = $conn->query("SELECT show_answers FROM classroom_activities WHERE id = " . $activityId)->fetch_row();
    // The preview checks answers in the page (nothing goes to the server), so
    // only the teacher's preview gets the right answers.
    $key = null;
    if ($preview) {
        $key = [];
        foreach (koobdQuizQuestions($activityId, true) as $question) {
            $right = array_values(array_filter($question['choices'], static fn($choice) => !empty($choice['correct'])));
            $key[$question['id']] = ['labels' => array_column($right, 'label'), 'ids' => array_column($right, 'id')];
        }
    }
    return [
        'activityId' => $activityId,
        'preview' => $preview,
        'showResults' => !$show || (int)$show[0] === 1,
        'questions' => array_map(static fn($question) => [
            'id' => $question['id'], 'type' => $question['type'], 'prompt' => $question['prompt'], 'points' => $question['points'],
            'point' => $question['point'], 'optional' => $question['optional'], 'lang' => $question['lang'], 'audio' => $question['audio'],
            'choices' => array_map(static fn($choice) => ['id' => $choice['id'], 'label' => $choice['label']], $question['choices']),
        ], $questions),
        'answered' => $done,
        'key' => $key === null ? null : (object)$key,
    ];
}

// The order a student sees a quiz's questions in. Unless the quiz shuffles,
// the teacher's order. A shuffled order is chosen the first time the student
// opens the quiz and saved, so it stays the same when they reload or come
// back; questions the teacher adds later go in at random places, removed ones
// drop out. Returns the questions in that order.
function koobdQuizOrderFor(int $activityId, int $studentId, array $questions, bool $shuffle): array
{
    global $conn;
    if (!$shuffle || count($questions) < 2) {
        return $questions;
    }
    $byId = [];
    foreach ($questions as $question) {
        $byId[$question['id']] = $question;
    }
    $read = $conn->prepare("SELECT question_order FROM activity_question_orders WHERE activity_id = ? AND student_user_id = ? LIMIT 1");
    $read->bind_param('ii', $activityId, $studentId);
    $read->execute();
    $saved = $read->get_result()->fetch_assoc();
    $read->close();
    $before = $saved ? json_decode((string)$saved['question_order'], true) : null;
    $before = is_array($before) ? array_map('intval', $before) : [];
    $order = array_values(array_unique(array_filter($before, static fn($id) => isset($byId[$id]))));
    $missing = array_values(array_diff(array_keys($byId), $order));
    if (!$saved) {
        shuffle($missing);
        $order = $missing;
    } else {
        foreach ($missing as $id) {
            array_splice($order, random_int(0, count($order)), 0, [$id]);
        }
    }
    if (!$saved || $order !== $before) {
        $json = json_encode($order);
        $write = $conn->prepare(
            "INSERT INTO activity_question_orders (activity_id, student_user_id, question_order) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE question_order = VALUES(question_order)"
        );
        $write->bind_param('iis', $activityId, $studentId, $json);
        $write->execute();
        $write->close();
    }
    return array_map(static fn($id) => $byId[$id], $order);
}

// Submissions to these quizzes by these students:
// [activityId => [userId => ['score', 'total', 'percent', 'pending', 'submitted_at']]].
// 'pending' counts essays still waiting for the teacher's grade.
function koobdQuizSubmissionMap(array $activityIds, array $userIds): array
{
    global $conn;
    $map = [];
    $activityIds = array_values(array_filter(array_map('intval', $activityIds)));
    $userIds = array_values(array_filter(array_map('intval', $userIds)));
    foreach ($activityIds as $id) {
        $map[$id] = [];
    }
    if (!$activityIds || !$userIds) {
        return $map;
    }
    $result = $conn->query(
        "SELECT activity_id, student_user_id, score, total, pending, submitted_at FROM activity_submissions
         WHERE activity_id IN (" . implode(',', $activityIds) . ") AND student_user_id IN (" . implode(',', $userIds) . ")"
    );
    while ($result && ($row = $result->fetch_assoc())) {
        $total = (int)$row['total'];
        $map[(int)$row['activity_id']][(int)$row['student_user_id']] = [
            'score' => (int)$row['score'],
            'total' => $total,
            'percent' => $total > 0 ? (int)round((int)$row['score'] / $total * 100) : 0,
            'pending' => (int)$row['pending'],
            'submitted_at' => (string)$row['submitted_at'],
        ];
    }
    return $map;
}

// One student's submission to a quiz, for review: the score and each question
// with their answer (the choice they picked, or what they typed), the points
// it earned and, for an essay, the teacher's feedback or that it is waiting
// to be graded. $withKey adds which answers are correct and whether each was
// right (the teacher, or a student when the activity shows answers after
// submitting). Questions come in $order when given (a student's shuffled
// order). Null if they have not submitted.
function koobdQuizReview(int $activityId, int $studentId, bool $withKey, ?array $order = null): ?array
{
    global $conn;
    $stmt = $conn->prepare("SELECT id, score, total, pending, submitted_at FROM activity_submissions WHERE activity_id = ? AND student_user_id = ? LIMIT 1");
    $stmt->bind_param('ii', $activityId, $studentId);
    $stmt->execute();
    $submission = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$submission) {
        return null;
    }
    $given = [];
    $read = $conn->prepare("SELECT question_id, choice_id, answer_text, is_correct, points_awarded, max_points, feedback FROM activity_submission_answers WHERE submission_id = ?");
    $read->bind_param('i', $submission['id']);
    $read->execute();
    foreach ($read->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $given[(int)$row['question_id']] = $row;
    }
    $read->close();
    $questions = [];
    $source = $order ?? koobdQuizQuestions($activityId, true);
    $keyed = [];
    foreach (koobdQuizQuestions($activityId, true) as $question) {
        $keyed[$question['id']] = $question;
    }
    foreach ($source as $listed) {
        $question = $keyed[$listed['id']] ?? null;
        if (!$question) {
            continue;
        }
        $answer = $given[$question['id']] ?? null;
        $isEssay = $question['type'] === 'essay';
        $points = $answer && $answer['points_awarded'] !== null ? (int)$answer['points_awarded'] : ($answer ? null : 0);
        $entry = [
            'id' => $question['id'],
            'type' => $question['type'],
            'prompt' => $question['prompt'],
            'max' => $question['points'],
            'points' => $points,
            'pending' => $isEssay && $answer && $answer['points_awarded'] === null,
            // False for a question in a story the student has not reached yet.
            'answered' => $answer !== null,
            'picked' => $answer && $answer['choice_id'] !== null ? (int)$answer['choice_id'] : null,
            'text' => $answer ? $answer['answer_text'] : null,
            'feedback' => $isEssay && $answer ? $answer['feedback'] : null,
            'choices' => [],
        ];
        if ($question['type'] === 'multiple_choice' || $question['type'] === 'true_false') {
            $entry['choices'] = array_map(static function ($choice) use ($withKey) {
                return $withKey ? $choice : ['id' => $choice['id'], 'label' => $choice['label']];
            }, $question['choices']);
        } elseif ($question['type'] === 'identification' && $withKey) {
            $entry['accepted'] = array_values(array_map(static fn($choice) => $choice['label'], $question['choices']));
        } elseif ($question['type'] === 'speak') {
            // What they were asked to say (they saw it while answering).
            $entry['accepted'] = array_values(array_map(static fn($choice) => $choice['label'], $question['choices']));
            $entry['lang'] = $question['lang'];
            $entry['audio'] = $question['audio'];
        }
        if ($withKey && !$isEssay) {
            $entry['isCorrect'] = $answer && (int)$answer['is_correct'] === 1;
        }
        $questions[] = $entry;
    }
    $total = (int)$submission['total'];
    return [
        'score' => (int)$submission['score'],
        'total' => $total,
        'percent' => $total > 0 ? (int)round((int)$submission['score'] / $total * 100) : 0,
        'pending' => (int)$submission['pending'],
        'submittedAt' => (string)$submission['submitted_at'],
        'showsKey' => $withKey,
        'questions' => $questions,
    ];
}

// A deleted activity takes its students' progress with it.
function koobdDeleteActivityProgress(array $activityIds): void
{
    global $conn;
    $contexts = [];
    foreach ($activityIds as $id) {
        if ((int)$id > 0) {
            $contexts[] = "'" . koobdActivityProgressContext((int)$id) . "'";
        }
    }
    if ($contexts) {
        $conn->query("DELETE FROM story_progress WHERE progress_context IN (" . implode(',', $contexts) . ")");
    }
}

// Photos and videos sent in private messages live in uploads/private-messages.
// Forwarded copies share a file, so a file goes only once no remaining
// message points at it.
function koobdForgetMessageFiles(array $paths): void
{
    global $conn;
    $stmt = $conn->prepare("SELECT 1 FROM classroom_messages WHERE attachment_path = ? AND deleted_at IS NULL LIMIT 1");
    foreach (array_unique(array_filter(array_map('strval', $paths))) as $path) {
        if (strpos($path, 'uploads/private-messages/') !== 0 || strpos($path, '..') !== false) {
            continue;
        }
        $stmt->bind_param('s', $path);
        $stmt->execute();
        if (!$stmt->get_result()->fetch_row() && is_file(__DIR__ . '/' . $path)) {
            @unlink(__DIR__ . '/' . $path);
        }
    }
    $stmt->close();
}

// Removes message files that no message points at any more - left behind
// when an account or classroom is deleted (their messages go with them).
// Runs at most once a day unless forced; recent files (the last hour by
// default) are left alone, as their message may still be being saved.
function koobdSweepMessageFiles(bool $force = false, int $graceSeconds = 3600): int
{
    global $conn;
    $folder = __DIR__ . '/uploads/private-messages';
    $marker = $folder . '/.last-sweep';
    if (!is_dir($folder) || (!$force && is_file($marker) && filemtime($marker) > time() - 86400)) {
        return 0;
    }
    @touch($marker);
    $used = [];
    $result = $conn->query("SELECT DISTINCT attachment_path FROM classroom_messages WHERE attachment_path IS NOT NULL AND deleted_at IS NULL");
    while ($result && ($row = $result->fetch_row())) {
        $used[$row[0]] = true;
    }
    $removed = 0;
    foreach (glob($folder . '/*/*') ?: [] as $file) {
        $path = 'uploads/private-messages/' . basename(dirname($file)) . '/' . basename($file);
        if (!isset($used[$path]) && is_file($file) && filemtime($file) <= time() - $graceSeconds && @unlink($file)) {
            $removed++;
        }
    }
    return $removed;
}

function koobdNormalizeReaderKey(?string $readerKey): string
{
    $catalog = koobdCharacterCatalog();
    $fallback = array_key_first($catalog) ?? '';
    return isset($catalog[$readerKey ?? '']) ? (string)$readerKey : $fallback;
}

function koobdReaderProfileDefaults(string $readerKey): array
{
    $catalog = koobdCharacterCatalog();
    $readerKey = koobdNormalizeReaderKey($readerKey);
    return $catalog[$readerKey];
}

function koobdUserRole(array $user): string
{
    $role = strtolower(trim((string)($user['user_role'] ?? 'student')));
    return $role === 'teacher' ? 'teacher' : 'student';
}

function koobdIsTeacher(array $user): bool
{
    return koobdUserRole($user) === 'teacher';
}

// A reader character's pixel animation sheet (32x46 frames: 4 idle, 6 walking,
// 6 jumping), drawn by js/character-animation.js in Versus Mode and Platform
// Mode stories. '' for a character without one.
function koobdCharacterSheet(string $key): string
{
    $sheets = [
        'cubebot' => 'CUBEBOT/cubebot_spritesheet.png',
        'flower' => 'ALL%20(PNG)/flowerling_spritesheet.png',
        'golem' => 'ALL%20(PNG)/golem_spritesheet.png',
        'raincat' => 'ALL%20(PNG)/raincat_spritesheet.png',
        'twig' => 'ALL%20(PNG)/twig_spritesheet.png',
        'watermain' => 'ALL%20(PNG)/droplet_spritesheet.png',
    ];
    return isset($sheets[$key]) ? 'The%20False%20Knight/' . $sheets[$key] : '';
}

function koobdResolvedProfile(array $user): array
{
    $readerKey = koobdNormalizeReaderKey($user['selected_reader'] ?? null);
    $defaults = koobdReaderProfileDefaults($readerKey);
    $role = koobdIsTeacher($user) ? 'Teacher' : 'Student';

    return [
        'key' => $readerKey,
        'asset' => $defaults['asset'],
        'name' => !empty($user['profile_reader_name']) ? $user['profile_reader_name'] : $defaults['display'],
        'badge' => $role,
        'top' => !empty($user['profile_top_color']) ? $user['profile_top_color'] : $defaults['top'],
        'bottom' => !empty($user['profile_bottom_color']) ? $user['profile_bottom_color'] : $defaults['bottom'],
        'accent' => !empty($user['profile_accent_color']) ? $user['profile_accent_color'] : $defaults['accent'],
        'style' => !empty($user['profile_card_style']) ? $user['profile_card_style'] : $defaults['style'],
        'scale' => !empty($user['profile_scale']) ? (int)$user['profile_scale'] : (int)$defaults['scale'],
    ];
}

// The profile page's banner (users.profile_banner): the character's colours
// (nothing saved), a plain colour ("color:#rrggbb"), a gradient
// ("gradient:#rrggbb,#rrggbb,angle") or a picture the reader
// uploaded (its path under uploads/profile-banners/, then "#x,y,zoom": the
// point of the picture kept in view, in % across and down, and how far in).
function koobdProfileBanner(array $user): array
{
    $saved = trim((string)($user['profile_banner'] ?? ''));
    if (preg_match('/^color:(#[0-9a-f]{6})$/i', $saved, $match)) {
        return ['type' => 'color', 'value' => strtolower($match[1])];
    }
    if (preg_match('/^gradient:(#[0-9a-f]{6}),(#[0-9a-f]{6}),(45|90|135|180)$/i', $saved, $match)) {
        $from = strtolower($match[1]);
        $to = strtolower($match[2]);
        return ['type' => 'gradient', 'value' => "linear-gradient({$match[3]}deg,{$from},{$to})", 'from' => $from, 'to' => $to, 'angle' => (int)$match[3]];
    }
    if (preg_match('#^(uploads/profile-banners/[A-Za-z0-9._-]+)(?:\#(.*))?$#', $saved, $match) && is_file(__DIR__ . '/' . $match[1])) {
        return ['type' => 'image', 'value' => $match[1], 'framing' => koobdBannerFraming($match[2] ?? '')];
    }
    return ['type' => 'default', 'value' => ''];
}

// "x,y,zoom" -> the banner picture's framing, kept within sensible bounds.
function koobdBannerFraming(string $text): array
{
    $parts = preg_match('/^[0-9.]+,[0-9.]+,[0-9.]+$/', $text) ? array_map('floatval', explode(',', $text)) : [];
    return [
        'x' => round(max(0, min(100, $parts[0] ?? 50)), 2),
        'y' => round(max(0, min(100, $parts[1] ?? 50)), 2),
        'zoom' => round(max(1, min(3, ($parts[2] ?? 1) ?: 1)), 2),
    ];
}

// The CSS that frames a banner picture: the chosen point stays in view, and
// zooming in centres on it.
function koobdBannerFramingStyle(array $framing): string
{
    $position = $framing['x'] . '% ' . $framing['y'] . '%';
    return 'object-position:' . $position . ';transform-origin:' . $position . ';transform:scale(' . $framing['zoom'] . ')';
}

// Saves an uploaded banner picture for a reader. Returns its path, or an error
// message (string starting with "!") when the file cannot be used.
function koobdUploadProfileBanner(array $file, int $userId): string
{
    $error = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
        return '!That picture is too big. Choose one under 8 MB.';
    }
    $tmpPath = (string)($file['tmp_name'] ?? '');
    if ($error !== UPLOAD_ERR_OK || $tmpPath === '' || !is_uploaded_file($tmpPath)) {
        return '!The picture could not be uploaded. Please try again.';
    }
    if ((int)($file['size'] ?? 0) > 8 * 1024 * 1024) {
        return '!That picture is too big. Choose one under 8 MB.';
    }
    // The file's contents decide what it is, not its name.
    $types = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp', IMAGETYPE_GIF => 'gif'];
    $info = @getimagesize($tmpPath);
    if (!$info || !isset($types[$info[2]])) {
        return '!Choose a JPG, PNG, WebP or GIF picture.';
    }
    $uploadDir = __DIR__ . '/uploads/profile-banners';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0777, true) && !is_dir($uploadDir)) {
        return '!The picture could not be saved. Please try again.';
    }
    $storedName = sprintf('banner-%d-%d-%s.%s', $userId, time(), bin2hex(random_bytes(4)), $types[$info[2]]);
    if (!move_uploaded_file($tmpPath, $uploadDir . '/' . $storedName)) {
        return '!The picture could not be saved. Please try again.';
    }
    return 'uploads/profile-banners/' . $storedName;
}

function koobdSessionUserFromRow(array $user): void
{
    $_SESSION['user_id'] = (int)$user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['profile_completed'] = (int)($user['profile_completed'] ?? 0);
    $_SESSION['selected_reader'] = $user['selected_reader'] ?? null;
    $_SESSION['profile_reader_name'] = $user['profile_reader_name'] ?? null;
    $_SESSION['user_role'] = koobdUserRole($user);
}

function koobdCurrentUser(mysqli $conn): ?array
{
    $userId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 0;
    $username = $_SESSION['username'] ?? '';

    if ($userId > 0) {
        $stmt = $conn->prepare("SELECT * FROM users WHERE id = ?");
        $stmt->bind_param("i", $userId);
    } elseif ($username !== '') {
        $stmt = $conn->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->bind_param("s", $username);
    } else {
        return null;
    }

    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    if ($user) {
        koobdSessionUserFromRow($user);
    }

    return $user ?: null;
}

function koobdProfileRedirectPath(array $user): string
{
    if (koobdIsTeacher($user)) {
        return ((int)($user['profile_completed'] ?? 0) === 1) ? 'home.php' : 'reader.php?setup=1';
    }

    return ((int)($user['profile_completed'] ?? 0) === 1) ? 'home.php' : 'reader.php?setup=1';
}

function koobdSanitizeReturnPath(?string $path, string $fallback = 'home.php'): string
{
    $path = trim((string)$path);
    if ($path === '') {
        return $fallback;
    }

    $parsed = parse_url($path);
    if ($parsed === false) {
        return $fallback;
    }

    $allowedPages = [
        'home.php',
        'create_story.php',
        'student_stories.php',
        'story.php',
        'shared_story_reader.php',
        'classroom.php',
        'classroom_room.php',
        'teacher_classroom.php',
        'reader.php',
        'customize_character.php',
        'teacher_profile.php',
        'teacher_stories.php',
        'teacher_create_story.php',
        'teacher_story_editor.php',
        'teacher_story_preview.php',
        'teacher_story_reader.php',
        'profile.php',
    ];

    $page = basename((string)($parsed['path'] ?? ''));
    if ($page === '' || !in_array($page, $allowedPages, true)) {
        return $fallback;
    }

    $query = trim((string)($parsed['query'] ?? ''));
    return $query !== '' ? $page . '?' . $query : $page;
}

function koobdRequireAuth(bool $requireProfile = true): array
{
    global $conn;

    if (!isset($_SESSION['username']) && !isset($_SESSION['user_id'])) {
        header("Location: log.php");
        exit();
    }

    $user = koobdCurrentUser($conn);
    if (!$user) {
        session_unset();
        session_destroy();
        header("Location: log.php");
        exit();
    }

    if ($requireProfile && (int)($user['profile_completed'] ?? 0) !== 1) {
        header("Location: " . koobdProfileRedirectPath($user));
        exit();
    }

    // A student's page views are measured for their teachers' screen-time
    // reports (screen_time_lib.php decides which pages, and adds the tracker).
    if (!koobdIsTeacher($user) && ($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
        require_once __DIR__ . '/screen_time_lib.php';
        stInjectTracker($user);
    }

    return $user;
}

function koobdRequireTeacherAuth(bool $requireProfile = true): array
{
    $user = koobdRequireAuth(false);

    if (!koobdIsTeacher($user)) {
        header("Location: log.php");
        exit();
    }

    if ($requireProfile && (int)($user['profile_completed'] ?? 0) !== 1) {
        header("Location: " . koobdProfileRedirectPath($user));
        exit();
    }

    return $user;
}

function koobdRequireStudentAuth(bool $requireProfile = true): array
{
    $user = koobdRequireAuth(false);

    if (koobdIsTeacher($user)) {
        header("Location: classroom.php");
        exit();
    }

    if ($requireProfile && (int)($user['profile_completed'] ?? 0) !== 1) {
        header("Location: reader.php?setup=1");
        exit();
    }

    return $user;
}

function koobdGenerateClassroomCode(mysqli $conn): string
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    do {
        $code = '';
        for ($i = 0; $i < 8; $i++) {
            $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }

        $stmt = $conn->prepare("SELECT id FROM classrooms WHERE class_code = ? LIMIT 1");
        $stmt->bind_param("s", $code);
        $stmt->execute();
        $result = $stmt->get_result();
        $exists = $result && $result->fetch_assoc();
        $stmt->close();
    } while ($exists);

    return $code;
}
?>
