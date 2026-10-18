<?php
// Story search for the home page's search bar (js/home-search.js): the
// Classic Stories and the Stories Made by Others whose titles contain the
// typed text, as JSON. Matching ignores letter case.
//
//   GET search_stories.php?q=hare
//   -> { "query": "hare", "classic": [...], "shared": [...] }
require_once('auth.php');

header('Content-Type: application/json');
header('Cache-Control: no-store');

$user = koobdRequireAuth(true);
$query = trim((string)($_GET['q'] ?? ''));
$query = function_exists('mb_substr') ? mb_substr($query, 0, 80) : substr($query, 0, 80);

if ($query === '') {
    echo json_encode(['query' => '', 'classic' => [], 'shared' => []]);
    exit();
}

$contains = function (string $title) use ($query): bool {
    return function_exists('mb_stripos') ? mb_stripos($title, $query) !== false : stripos($title, $query) !== false;
};

// Classic Stories: the built-in books.
$classic = [];
foreach (koobdStoryCatalog() as $story) {
    if ($contains((string)$story['title'])) {
        $classic[] = [
            'title' => $story['title'],
            'href' => $story['href'],
            'cover' => $story['cover'],
        ];
    }
}

// Stories Made by Others: every published story, newest first. Each carries
// the reader's place in it (Continue / Restart in its pop-up).
$savedProgress = koobdUserStoryProgress((int)$user['id']);
$shared = [];
$like = '%' . addcslashes($query, '%_\\') . '%';
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
     WHERE s.title LIKE ?
     ORDER BY s.updated_at DESC, s.created_at DESC, s.id DESC
     LIMIT 48"
);
if ($stmt) {
    $stmt->bind_param('s', $like);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($result && ($row = $result->fetch_assoc())) {
        $story = koobdSharedStoryFromRow($row);
        $shared[] = [
            'title' => $story['title'],
            'href' => $story['href'],
            'cover' => $story['cover'],
            'mode' => $story['mode'],
            'key' => 'shared-' . $story['id'],
            'creator' => $story['creator_name'],
            'description' => $story['description'] !== '' ? $story['description'] : $story['subtitle'],
            'lesson' => $story['lesson'],
            'resume' => koobdStoryProgressDetails(
                $story['href'],
                $story['teacher_story_id'] > 0 ? ($savedProgress[koobdTeacherStoryKey($story['teacher_story_id'])] ?? null) : null
            ) ?: null,
        ];
    }
    $stmt->close();
}

echo json_encode(['query' => $query, 'classic' => $classic, 'shared' => $shared]);
