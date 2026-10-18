<?php
require_once __DIR__ . '/connect.php';
require_once __DIR__ . '/platform_story_data.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

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
            'mode' => $story['mode'], 'creator' => $story['creator_label'],
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
            'asset' => 'assets/images/backgrounds/forest.png',
        ],
        'sunrise' => [
            'id' => 'sunrise',
            'label' => 'Sunrise Hills',
            'asset' => 'assets/images/banners/banner1.png',
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
                ];
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

    return 'assets/images/banners/banner1.png';
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

function koobdSyncTeacherStoryToSharedFeed(array $teacherStoryRow): void
{
    global $conn;

    $teacherStoryId = (int)($teacherStoryRow['id'] ?? 0);
    $teacherId = (int)($teacherStoryRow['teacher_id'] ?? 0);
    if ($teacherStoryId <= 0 || $teacherId <= 0) {
        return;
    }

    $status = trim((string)($teacherStoryRow['status'] ?? 'draft'));

    $deleteStmt = $conn->prepare("DELETE FROM stories WHERE teacher_story_id = ?");
    if ($deleteStmt) {
        $deleteStmt->bind_param("i", $teacherStoryId);
    }

    if ($status !== 'published') {
        if ($deleteStmt) {
            $deleteStmt->execute();
            $deleteStmt->close();
        }
        return;
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
        return;
    }

    $existingStmt->bind_param("i", $teacherStoryId);
    $existingStmt->execute();
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
            return;
        }

        $updateStmt->bind_param("isssi", $teacherId, $title, $subtitle, $coverImage, $storyId);
        $updateStmt->execute();
        $updateStmt->close();
        return;
    }

    $insertStmt = $conn->prepare(
        "INSERT INTO stories (creator_user_id, teacher_story_id, title, subtitle, source_file, source_file_name, cover_image)
         VALUES (?, ?, ?, ?, NULL, NULL, ?)"
    );
    if (!$insertStmt) {
        return;
    }

    $insertStmt->bind_param("iisss", $teacherId, $teacherStoryId, $title, $subtitle, $coverImage);
    $insertStmt->execute();
    $insertStmt->close();
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
        'story_mode' => trim((string)($row['story_mode'] ?? 'regular')) === 'platformer' ? 'platformer' : 'regular',
        'href' => 'teacher_story_preview.php?id=' . (int)$row['id'],
        'cover' => $coverImage,
        'pages' => $pages,
        'page_count' => count($pages),
        'settings' => koobdStorySettingsFromData(json_decode((string)($row['settings_json'] ?? ''), true)),
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
        'creator_label' => 'Created by ' . $creatorName,
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
            ts.story_mode,
            ts.description AS story_description,
            ts.lesson AS story_lesson
         FROM stories s
         INNER JOIN users u ON u.id = s.creator_user_id
         LEFT JOIN teacher_stories ts ON ts.id = s.teacher_story_id
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
            ts.lesson AS story_lesson
         FROM stories s
         INNER JOIN users u ON u.id = s.creator_user_id
         LEFT JOIN teacher_stories ts ON ts.id = s.teacher_story_id
         WHERE s.creator_user_id = ?
           AND s.teacher_story_id IS NULL
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
            ts.lesson AS story_lesson
         FROM stories s
         INNER JOIN users u ON u.id = s.creator_user_id
         LEFT JOIN teacher_stories ts ON ts.id = s.teacher_story_id
         WHERE s.id = ?
         LIMIT 1"
    );
    $stmt->bind_param("i", $storyId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    return $row ? koobdSharedStoryFromRow($row) : null;
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
// A quiz's questions in order, each with its choices. $withKey adds which choice
// is correct (for the teacher, the grader and a student's review once allowed);
// without it a student's browser never receives the answer key.
function koobdQuizQuestions(int $activityId, bool $withKey = false): array
{
    global $conn;
    $questions = [];
    $stmt = $conn->prepare(
        "SELECT q.id AS question_id, q.question_type, q.prompt, q.position AS question_position,
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
        if (!isset($questions[$qid])) {
            $questions[$qid] = [
                'id' => $qid,
                'type' => $row['question_type'] === 'true_false' ? 'true_false' : 'multiple_choice',
                'prompt' => (string)$row['prompt'],
                'choices' => [],
            ];
        }
        if ($row['choice_id'] !== null) {
            $choice = ['id' => (int)$row['choice_id'], 'label' => (string)$row['label']];
            if ($withKey) {
                $choice['correct'] = (int)$row['is_correct'] === 1;
            }
            $questions[$qid]['choices'][] = $choice;
        }
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

// Checks answers ([questionId => choiceId]) against the answer key. Unanswered
// and unknown choices count as wrong. Returns [score, total, [questionId =>
// ['choice' => id|null, 'correct' => bool]]].
function koobdQuizGrade(array $questions, array $answers): array
{
    $score = 0;
    $results = [];
    foreach ($questions as $question) {
        $picked = isset($answers[$question['id']]) ? (int)$answers[$question['id']] : 0;
        $valid = null;
        $correct = false;
        foreach ($question['choices'] as $choice) {
            if ($choice['id'] === $picked) {
                $valid = $picked;
                $correct = !empty($choice['correct']);
            }
        }
        $score += $correct ? 1 : 0;
        $results[$question['id']] = ['choice' => $valid, 'correct' => $correct];
    }
    return [$score, count($questions), $results];
}

// After a teacher edits a quiz, every submission is checked again against the
// new key (answers to removed questions or choices no longer count).
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
        $answers = [];
        $read = $conn->prepare("SELECT question_id, choice_id FROM activity_submission_answers WHERE submission_id = ?");
        $read->bind_param('i', $submissionId);
        $read->execute();
        foreach ($read->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
            if ($row['choice_id'] !== null) {
                $answers[(int)$row['question_id']] = (int)$row['choice_id'];
            }
        }
        $read->close();
        [$score, $total, $results] = koobdQuizGrade($questions, $answers);
        $conn->query("DELETE FROM activity_submission_answers WHERE submission_id = " . $submissionId);
        $write = $conn->prepare("INSERT INTO activity_submission_answers (submission_id, question_id, choice_id, is_correct) VALUES (?, ?, ?, ?)");
        foreach ($results as $questionId => $result) {
            $correct = $result['correct'] ? 1 : 0;
            $choice = $result['choice'];
            $write->bind_param('iiii', $submissionId, $questionId, $choice, $correct);
            $write->execute();
        }
        $write->close();
        $update = $conn->prepare("UPDATE activity_submissions SET score = ?, total = ? WHERE id = ?");
        $update->bind_param('iii', $score, $total, $submissionId);
        $update->execute();
        $update->close();
    }
}

// Submissions to these quizzes by these students:
// [activityId => [userId => ['score', 'total', 'percent', 'submitted_at']]].
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
        "SELECT activity_id, student_user_id, score, total, submitted_at FROM activity_submissions
         WHERE activity_id IN (" . implode(',', $activityIds) . ") AND student_user_id IN (" . implode(',', $userIds) . ")"
    );
    while ($result && ($row = $result->fetch_assoc())) {
        $total = (int)$row['total'];
        $map[(int)$row['activity_id']][(int)$row['student_user_id']] = [
            'score' => (int)$row['score'],
            'total' => $total,
            'percent' => $total > 0 ? (int)round((int)$row['score'] / $total * 100) : 0,
            'submitted_at' => (string)$row['submitted_at'],
        ];
    }
    return $map;
}

// One student's submission to a quiz, for review: the score and each question
// with the choice they picked. $withKey adds which answers are correct and
// whether each pick was right (the teacher, or a student when the activity
// shows answers after submitting). Null if they have not submitted.
function koobdQuizReview(int $activityId, int $studentId, bool $withKey): ?array
{
    global $conn;
    $stmt = $conn->prepare("SELECT id, score, total, submitted_at FROM activity_submissions WHERE activity_id = ? AND student_user_id = ? LIMIT 1");
    $stmt->bind_param('ii', $activityId, $studentId);
    $stmt->execute();
    $submission = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$submission) {
        return null;
    }
    $picked = [];
    $read = $conn->prepare("SELECT question_id, choice_id, is_correct FROM activity_submission_answers WHERE submission_id = ?");
    $read->bind_param('i', $submission['id']);
    $read->execute();
    foreach ($read->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $picked[(int)$row['question_id']] = ['choice' => $row['choice_id'] === null ? null : (int)$row['choice_id'], 'correct' => (int)$row['is_correct'] === 1];
    }
    $read->close();
    $questions = [];
    foreach (koobdQuizQuestions($activityId, true) as $question) {
        $answer = $picked[$question['id']] ?? ['choice' => null, 'correct' => false];
        $entry = [
            'id' => $question['id'],
            'type' => $question['type'],
            'prompt' => $question['prompt'],
            'picked' => $answer['choice'],
            'choices' => array_map(static function ($choice) use ($withKey) {
                return $withKey ? $choice : ['id' => $choice['id'], 'label' => $choice['label']];
            }, $question['choices']),
        ];
        if ($withKey) {
            $entry['isCorrect'] = $answer['correct'];
        }
        $questions[] = $entry;
    }
    $total = (int)$submission['total'];
    return [
        'score' => (int)$submission['score'],
        'total' => $total,
        'percent' => $total > 0 ? (int)round((int)$submission['score'] / $total * 100) : 0,
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
