<?php
// Screen time: each student's estimated active time on KoobD, for the
// teachers of their classrooms (the Screen Time tab of teacher_classroom.php,
// and teacher_screen_time.php for one student).
//
// How it is measured. js/screen-time.js runs on student pages (added by
// koobdRequireAuth, see stInjectTracker) and counts a second as active only
// while the page is in view, focused, and being used - a tap, key, scroll or
// mouse move within the last minute or two, or a story's narration playing.
// It never counts the whole time between logging in and out. The seconds go to
// screen_time_track.php in 30-second slots (st_slots), one row per student per
// slot: a second tab or device in the same 30 seconds adds nothing (the slot
// keeps the most any of them saw). This is an estimate of active use - a
// browser cannot tell whether the student is paying attention - and it is
// labelled that way everywhere it is shown.
//
// Which classroom. The server, not the page, decides: a classroom activity's
// page (a story, a quiz) belongs to that activity's classroom; a classroom's
// own page to that classroom; general pages (home, Versus Mode, the student's
// profile...) to none. A classroom's report covers its current students,
// from the day they joined: their time in that classroom's pages plus their
// general learning time - never their time in another classroom's activities.
// A student who leaves a classroom disappears from its reports; their records
// stay (until they are older than ST_KEEP_DAYS) but no teacher of that
// classroom can open them any more.
//
// Privacy: only the time, the kind of page and the activity are kept - never
// what is on the screen, what is typed, or where the student is.
require_once __DIR__ . '/auth.php';

const ST_SLOT = 30;                 // seconds per slot
const ST_SESSION_GAP_SLOTS = 10;    // a break of more than 5 minutes ends a session
const ST_KEEP_DAYS = 400;           // older records are removed
const ST_DEFAULT_LIMIT_MIN = 60;    // daily threshold until the teacher sets one
const ST_MAX_RANGE_DAYS = 366;

// The kinds of time a report shows, in order.
function stCategories(): array
{
    return [
        'story' => 'Reading stories',
        'platform' => 'Platform Mode',
        'quiz' => 'Quizzes & activities',
        'versus' => 'Versus Mode',
        'other' => 'Other learning pages',
    ];
}

// Student pages that are measured: their kind of time and a name for them.
// Story readers show both reading pages and Platform Mode pages, so the page
// says which one is open (only those two are accepted from it).
function stPages(): array
{
    return [
        'book1.php' => ['story', 'Reading a story'],
        'story.php' => ['story', 'Story page'],
        'teacher_story_reader.php' => ['story', 'Reading a story', 'mixed'],
        'shared_story_reader.php' => ['story', 'Reading a shared story', 'mixed'],
        'false_knight.php' => ['platform', 'The False Knight'],
        'quiz_take.php' => ['quiz', 'Answering a quiz'],
        'versus.php' => ['versus', 'Versus Mode'],
        'versus_play.php' => ['versus', 'Versus match'],
        'versus_match.php' => ['versus', 'Versus results'],
        'home.php' => ['other', 'Home'],
        'classroom.php' => ['other', 'Classrooms'],
        'classroom_room.php' => ['other', 'Classroom page'],
        'profile.php' => ['other', 'Profile'],
        'whats_new.php' => ['other', "What's New"],
        'student_stories.php' => ['other', 'My stories'],
        'favorites.php' => ['other', 'Favorites'],
        'search_stories.php' => ['other', 'Finding stories'],
        'create_story.php' => ['other', 'Writing a story'],
        'edit_story.php' => ['other', 'Writing a story'],
        'customize_character.php' => ['other', 'Character'],
        'reader.php' => ['other', 'Character'],
    ];
}

// Adds the tracker to a student's page (called from koobdRequireAuth). Only
// measured pages, only page views (not form posts or data requests), only
// students; the script tag goes in just before </body>.
function stInjectTracker(array $user): void
{
    static $done = false;
    if ($done || koobdIsTeacher($user) || PHP_SAPI === 'cli') {
        return;
    }
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET' || !isset(stPages()[basename((string)($_SERVER['SCRIPT_NAME'] ?? ''))])) {
        return;
    }
    $done = true;
    $tag = '<script src="' . koobdAsset('js/screen-time.js') . '" defer></script>';
    ob_start(static function (string $html) use ($tag): string {
        foreach (headers_list() as $header) {
            if (stripos($header, 'content-type:') === 0 && stripos($header, 'text/html') === false) {
                return $html;
            }
        }
        $at = strripos($html, '</body>');
        return $at === false ? $html : substr($html, 0, $at) . $tag . substr($html, $at);
    });
}

// The classroom a measured page belongs to, for this student - only one they
// are in. [classroom id or null, activity id or null].
function stPageClassroom(int $userId, string $page, int $activityId, int $classroomId): array
{
    global $conn;
    static $cache = [];
    $key = "$page|$activityId|$classroomId";
    if (isset($cache[$key])) {
        return $cache[$key];
    }
    $result = [null, null];
    if ($activityId > 0 && in_array($page, ['book1.php', 'teacher_story_reader.php', 'false_knight.php', 'quiz_take.php'], true)) {
        $stmt = $conn->prepare(
            "SELECT ca.classroom_id FROM classroom_activities ca
             INNER JOIN classroom_students cs ON cs.classroom_id = ca.classroom_id AND cs.student_user_id = ?
             WHERE ca.id = ? LIMIT 1"
        );
        $stmt->bind_param('ii', $userId, $activityId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($row) {
            $result = [(int)$row['classroom_id'], $activityId];
        }
    } elseif ($classroomId > 0 && $page === 'classroom_room.php') {
        $stmt = $conn->prepare("SELECT classroom_id FROM classroom_students WHERE classroom_id = ? AND student_user_id = ? LIMIT 1");
        $stmt->bind_param('ii', $classroomId, $userId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($row) {
            $result = [$classroomId, null];
        }
    }
    return $cache[$key] = $result;
}

// Stores slots reported by a student's page. Each item: [slot, active
// seconds (1-30), kind ('story'/'platform' on mixed pages)]. The page numbers
// its slots by the server's clock (it learns the difference from each answer);
// only the last 15 minutes are accepted. Returns how many slots were kept.
function stRecord(array $user, array $payload): int
{
    global $conn;
    $pages = stPages();
    $page = basename((string)($payload['page'] ?? ''));
    if (!isset($pages[$page]) || koobdIsTeacher($user)) {
        return 0;
    }
    [$category, , $mixed] = $pages[$page] + [2 => ''];
    [$classroomId, $activityId] = stPageClassroom((int)$user['id'], $page, (int)($payload['activity'] ?? 0), (int)($payload['classroom'] ?? 0));
    $nowSlot = intdiv(time(), ST_SLOT);
    $userId = (int)$user['id'];
    $stmt = $conn->prepare(
        "INSERT INTO st_slots (user_id, slot, secs, category, page, classroom_id, activity_id) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           category = IF(VALUES(secs) > secs, VALUES(category), category),
           page = IF(VALUES(secs) > secs, VALUES(page), page),
           classroom_id = IF(VALUES(secs) > secs, VALUES(classroom_id), classroom_id),
           activity_id = IF(VALUES(secs) > secs, VALUES(activity_id), activity_id),
           secs = GREATEST(secs, VALUES(secs))"
    );
    $kept = 0;
    $seen = [];
    foreach (array_slice(is_array($payload['slots'] ?? null) ? $payload['slots'] : [], 0, 40) as $item) {
        if (!is_array($item) || count($item) < 2 || !is_numeric($item[0]) || !is_numeric($item[1])) {
            continue;
        }
        $slot = (int)$item[0];
        $secs = (int)$item[1];
        if ($slot < $nowSlot - 30 || $slot > $nowSlot + 1 || $secs < 1 || $secs > ST_SLOT) {
            continue;
        }
        if (isset($seen[$slot])) {
            continue;
        }
        $seen[$slot] = true;
        $kind = $category;
        if ($mixed === 'mixed' && in_array($item[2] ?? '', ['story', 'platform'], true)) {
            $kind = $item[2];
        }
        $stmt->bind_param('iiissii', $userId, $slot, $secs, $kind, $page, $classroomId, $activityId);
        $stmt->execute();
        $kept++;
    }
    $stmt->close();
    // Now and then, records older than ST_KEEP_DAYS go.
    if (random_int(1, 200) === 1) {
        $cutoff = intdiv(time() - ST_KEEP_DAYS * 86400, ST_SLOT);
        $conn->query("DELETE FROM st_slots WHERE slot < $cutoff LIMIT 5000");
    }
    return $kept;
}

// --- Reports ------------------------------------------------------------------------------------

// The teacher's own classroom, or null (anyone else's, or none).
function stTeacherClassroom(array $teacher, int $classroomId): ?array
{
    global $conn;
    if (!koobdIsTeacher($teacher) || $classroomId <= 0) {
        return null;
    }
    $stmt = $conn->prepare("SELECT id, title, teacher_id FROM classrooms WHERE id = ? AND teacher_id = ? LIMIT 1");
    $teacherId = (int)$teacher['id'];
    $stmt->bind_param('ii', $classroomId, $teacherId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

function stDailyLimit(int $classroomId): int
{
    global $conn;
    $row = $conn->query("SELECT daily_limit_min FROM st_classroom_settings WHERE classroom_id = " . (int)$classroomId)->fetch_assoc();
    return $row ? (int)$row['daily_limit_min'] : ST_DEFAULT_LIMIT_MIN;
}

function stSetDailyLimit(int $classroomId, int $minutes): int
{
    global $conn;
    $minutes = max(5, min(600, $minutes));
    $stmt = $conn->prepare("INSERT INTO st_classroom_settings (classroom_id, daily_limit_min) VALUES (?, ?) ON DUPLICATE KEY UPDATE daily_limit_min = VALUES(daily_limit_min)");
    $stmt->bind_param('ii', $classroomId, $minutes);
    $stmt->execute();
    $stmt->close();
    return $minutes;
}

// The period asked for, as school days in KOOB'D's time zone: 'day' (today),
// 'week' (the last 7 days), 'month' (the last 30 days) or 'custom' (from - to).
function stRange(string $key, string $from = '', string $to = ''): array
{
    $zone = new DateTimeZone(KOOBD_TIMEZONE);
    $today = new DateTimeImmutable('today', $zone);
    $valid = static fn(string $date): bool => (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) && strtotime($date) !== false;
    if ($key === 'custom' && $valid($from) && $valid($to)) {
        $start = new DateTimeImmutable($from, $zone);
        $end = new DateTimeImmutable($to, $zone);
        if ($end < $start) {
            [$start, $end] = [$end, $start];
        }
        if ($end > $today) {
            $end = $today;
        }
        if ($start->diff($end)->days >= ST_MAX_RANGE_DAYS) {
            $start = $end->modify('-' . (ST_MAX_RANGE_DAYS - 1) . ' days');
        }
    } else {
        $key = in_array($key, ['day', 'week', 'month'], true) ? $key : 'week';
        $end = $today;
        $start = $key === 'day' ? $today : $today->modify($key === 'week' ? '-6 days' : '-29 days');
    }
    $days = $start->diff($end)->days + 1;
    $label = $days === 1
        ? ($start == $today ? 'Today' : $start->format('M j, Y'))
        : $start->format('M j') . ' – ' . $end->format('M j, Y');
    return [
        'key' => $key,
        'from' => $start->format('Y-m-d'),
        'to' => $end->format('Y-m-d'),
        'days' => $days,
        'label' => $label,
        'fromSlot' => intdiv($start->getTimestamp(), ST_SLOT),
        'toSlot' => intdiv($end->modify('+1 day')->getTimestamp(), ST_SLOT),
    ];
}

// The classroom's current students, with their pictures and when they joined.
function stMembers(int $classroomId): array
{
    global $conn;
    $stmt = $conn->prepare(
        "SELECT u.id, u.username, u.selected_reader, u.profile_reader_name, u.profile_top_color, u.profile_bottom_color,
                u.profile_accent_color, u.profile_card_style, u.profile_scale, u.user_role, cs.joined_at
         FROM classroom_students cs
         INNER JOIN users u ON u.id = cs.student_user_id
         WHERE cs.classroom_id = ? AND u.user_role <> 'teacher'
         ORDER BY u.username ASC"
    );
    $stmt->bind_param('i', $classroomId);
    $stmt->execute();
    $members = [];
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $profile = koobdResolvedProfile($row);
        $members[(int)$row['id']] = [
            'id' => (int)$row['id'],
            'name' => (string)$row['username'],
            'character' => $profile['name'],
            'asset' => $profile['asset'],
            'top' => $profile['top'],
            'bottom' => $profile['bottom'],
            'joined' => (string)$row['joined_at'],
        ];
    }
    $stmt->close();
    return $members;
}

// The rows a classroom may see: its current students, since they joined, in
// its own pages or general ones. Bound to (classroom, classroom, from, to).
function stScopeSql(string $alias = 's'): string
{
    return "FROM st_slots $alias
            INNER JOIN classroom_students cs ON cs.student_user_id = $alias.user_id AND cs.classroom_id = ?
            INNER JOIN users su ON su.id = $alias.user_id AND su.user_role <> 'teacher'
            WHERE ($alias.classroom_id = ? OR $alias.classroom_id IS NULL)
              AND $alias.slot >= ? AND $alias.slot < ?
              AND $alias.slot >= FLOOR(UNIX_TIMESTAMP(cs.joined_at) / " . ST_SLOT . ")";
}

// Days and hours in KOOB'D's time zone, from a slot (SQL and PHP agree).
function stZoneOffset(): int
{
    return (new DateTimeImmutable('now', new DateTimeZone(KOOBD_TIMEZONE)))->getOffset();
}
function stDayExpr(string $alias = 's'): string
{
    return "FLOOR(($alias.slot * " . ST_SLOT . " + " . stZoneOffset() . ") / 86400)";
}
function stDayKey(int $dayNumber): string
{
    return gmdate('Y-m-d', $dayNumber * 86400);
}

// What a slot was: "Answering a quiz: Fractions" and so on.
function stActivityTitles(array $ids): array
{
    global $conn;
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) {
        return [];
    }
    $titles = [];
    $rows = $conn->query("SELECT * FROM classroom_activities WHERE id IN (" . implode(',', $ids) . ")")->fetch_all(MYSQLI_ASSOC);
    foreach ($rows as $row) {
        $titles[(int)$row['id']] = koobdActivityFromRow($row)['title'];
    }
    return $titles;
}
function stDescribe(array $slot, array $titles): string
{
    $pages = stPages();
    $category = (string)$slot['category'];
    $label = $pages[(string)$slot['page']][1] ?? 'KoobD';
    if ($category === 'platform' && ($pages[(string)$slot['page']][2] ?? '') === 'mixed') {
        $label = 'Playing a Platform Mode story';
    }
    $activity = (int)($slot['activity_id'] ?? 0);
    return $activity && isset($titles[$activity]) ? $label . ': ' . $titles[$activity] : $label;
}

function stTimeLabel(int $slot): string
{
    $at = (new DateTimeImmutable('@' . ($slot * ST_SLOT)))->setTimezone(new DateTimeZone(KOOBD_TIMEZONE));
    $today = new DateTimeImmutable('today', new DateTimeZone(KOOBD_TIMEZONE));
    $day = $at->format('Y-m-d') === $today->format('Y-m-d') ? 'Today'
        : ($at->format('Y-m-d') === $today->modify('-1 day')->format('Y-m-d') ? 'Yesterday' : $at->format('M j'));
    return $day . ', ' . $at->format('g:i A');
}

// The chart's buckets: hours for a single day, days otherwise.
function stChart(array $range, array $byKey): array
{
    $zone = new DateTimeZone(KOOBD_TIMEZONE);
    $buckets = [];
    if ($range['days'] === 1) {
        for ($hour = 0; $hour < 24; $hour++) {
            $buckets[] = ['key' => (string)$hour, 'label' => date('ga', mktime($hour, 0, 0)), 'secs' => (int)($byKey[(string)$hour] ?? 0)];
        }
        return ['unit' => 'hour', 'buckets' => $buckets];
    }
    $day = new DateTimeImmutable($range['from'], $zone);
    for ($i = 0; $i < $range['days']; $i++) {
        $key = $day->format('Y-m-d');
        $buckets[] = ['key' => $key, 'label' => $range['days'] <= 7 ? $day->format('D') : $day->format('M j'), 'secs' => (int)($byKey[$key] ?? 0)];
        $day = $day->modify('+1 day');
    }
    return ['unit' => 'day', 'buckets' => $buckets];
}

function stEmptyCategories(): array
{
    return array_fill_keys(array_keys(stCategories()), 0);
}

// A classroom's overview for a period: totals, the kinds of time, a chart,
// the most recent activity and every current student.
function stClassroomReport(array $classroom, array $range): array
{
    global $conn;
    $id = (int)$classroom['id'];
    $members = stMembers($id);
    $limit = stDailyLimit($id);
    $bind = static function (mysqli_stmt $stmt) use ($id, $range): void {
        $stmt->bind_param('iiii', $id, $id, $range['fromSlot'], $range['toSlot']);
    };

    $students = [];
    foreach ($members as $member) {
        $students[$member['id']] = $member + ['secs' => 0, 'categories' => stEmptyCategories(), 'last' => null, 'daysOver' => 0, 'topDaySecs' => 0];
    }
    $categories = stEmptyCategories();
    $total = 0;

    $stmt = $conn->prepare("SELECT s.user_id, s.category, SUM(s.secs) AS secs " . stScopeSql() . " GROUP BY s.user_id, s.category");
    $bind($stmt);
    $stmt->execute();
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $userId = (int)$row['user_id'];
        $category = isset($categories[$row['category']]) ? $row['category'] : 'other';
        $secs = (int)$row['secs'];
        if (!isset($students[$userId])) {
            continue;
        }
        $students[$userId]['secs'] += $secs;
        $students[$userId]['categories'][$category] += $secs;
        $categories[$category] += $secs;
        $total += $secs;
    }
    $stmt->close();

    // Each student's day totals: the threshold, and the chart.
    $dayExpr = stDayExpr();
    $stmt = $conn->prepare("SELECT s.user_id, $dayExpr AS day, SUM(s.secs) AS secs " . stScopeSql() . " GROUP BY s.user_id, day");
    $bind($stmt);
    $stmt->execute();
    $byDay = [];
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $userId = (int)$row['user_id'];
        $secs = (int)$row['secs'];
        $key = stDayKey((int)$row['day']);
        $byDay[$key] = ($byDay[$key] ?? 0) + $secs;
        if (isset($students[$userId])) {
            $students[$userId]['topDaySecs'] = max($students[$userId]['topDaySecs'], $secs);
            if ($secs > $limit * 60) {
                $students[$userId]['daysOver']++;
            }
        }
    }
    $stmt->close();
    if ($range['days'] === 1) {
        $byDay = [];
        $offset = stZoneOffset();
        $stmt = $conn->prepare("SELECT FLOOR(MOD(s.slot * " . ST_SLOT . " + $offset, 86400) / 3600) AS hour, SUM(s.secs) AS secs " . stScopeSql() . " GROUP BY hour");
        $bind($stmt);
        $stmt->execute();
        foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
            $byDay[(string)(int)$row['hour']] = (int)$row['secs'];
        }
        $stmt->close();
    }

    // Each student's latest moment in the period (found by its slot, then read).
    $stmt = $conn->prepare("SELECT s.user_id, MAX(s.slot) AS slot " . stScopeSql() . " GROUP BY s.user_id");
    $bind($stmt);
    $stmt->execute();
    $newest = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    $latest = [];
    $read = $conn->prepare("SELECT user_id, slot, category, page, activity_id FROM st_slots WHERE user_id = ? AND slot = ?");
    foreach ($newest as $row) {
        $userId = (int)$row['user_id'];
        $slot = (int)$row['slot'];
        $read->bind_param('ii', $userId, $slot);
        $read->execute();
        if ($found = $read->get_result()->fetch_assoc()) {
            $latest[] = $found;
        }
    }
    $read->close();
    $titles = stActivityTitles(array_column($latest, 'activity_id'));
    $recent = null;
    foreach ($latest as $row) {
        $userId = (int)$row['user_id'];
        if (!isset($students[$userId])) {
            continue;
        }
        $last = ['slot' => (int)$row['slot'], 'at' => stTimeLabel((int)$row['slot']), 'label' => stDescribe($row, $titles), 'category' => $row['category']];
        $students[$userId]['last'] = $last;
        if (!$recent || $last['slot'] > $recent['slot']) {
            $recent = $last + ['student' => $students[$userId]['name']];
        }
    }

    $list = array_values($students);
    usort($list, static fn($a, $b) => $b['secs'] <=> $a['secs'] ?: strcasecmp($a['name'], $b['name']));
    $active = count(array_filter($list, static fn($student) => $student['secs'] > 0));
    return [
        'classroom' => ['id' => $id, 'title' => (string)$classroom['title']],
        'range' => array_diff_key($range, ['fromSlot' => 1, 'toSlot' => 1]),
        'limitMin' => $limit,
        'totals' => [
            'secs' => $total,
            'students' => count($list),
            'activeStudents' => $active,
            'avgPerStudent' => count($list) ? (int)round($total / count($list)) : 0,
            'avgPerActive' => $active ? (int)round($total / $active) : 0,
        ],
        'categories' => $categories,
        'categoryLabels' => stCategories(),
        'recent' => $recent,
        'chart' => stChart($range, $byDay),
        'students' => array_map(static fn($student) => array_diff_key($student, ['joined' => 1]), $list),
    ];
}

// One student of the classroom, or null if they are not in it.
function stClassroomStudent(int $classroomId, int $studentId): ?array
{
    return stMembers($classroomId)[$studentId] ?? null;
}

// One student's detail: totals, kinds of time, a chart, sessions (runs of
// activity with no break over 5 minutes) and each day's timeline.
function stStudentReport(array $classroom, array $student, array $range): array
{
    global $conn;
    $id = (int)$classroom['id'];
    $userId = (int)$student['id'];
    $stmt = $conn->prepare(
        "SELECT s.slot, s.secs, s.category, s.page, s.activity_id " . stScopeSql() . " AND s.user_id = ? ORDER BY s.slot ASC"
    );
    $stmt->bind_param('iiiii', $id, $id, $range['fromSlot'], $range['toSlot'], $userId);
    $stmt->execute();
    $slots = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    $titles = stActivityTitles(array_column($slots, 'activity_id'));
    $limit = stDailyLimit($id);
    $zone = new DateTimeZone(KOOBD_TIMEZONE);
    $offset = stZoneOffset();

    $categories = stEmptyCategories();
    $byKey = [];
    $days = [];
    $sessions = [];
    $current = null;
    $total = 0;
    foreach ($slots as $row) {
        $slot = (int)$row['slot'];
        $secs = (int)$row['secs'];
        $category = isset($categories[$row['category']]) ? $row['category'] : 'other';
        $categories[$category] += $secs;
        $total += $secs;
        $dayKey = stDayKey(intdiv($slot * ST_SLOT + $offset, 86400));
        $days[$dayKey] = ($days[$dayKey] ?? 0) + $secs;
        $chartKey = $range['days'] === 1 ? (string)intdiv(($slot * ST_SLOT + $offset) % 86400, 3600) : $dayKey;
        $byKey[$chartKey] = ($byKey[$chartKey] ?? 0) + $secs;
        if (!$current || $slot - $current['lastSlot'] > ST_SESSION_GAP_SLOTS) {
            if ($current) {
                $sessions[] = $current;
            }
            $current = ['firstSlot' => $slot, 'lastSlot' => $slot, 'secs' => 0, 'categories' => stEmptyCategories(), 'what' => []];
        }
        $current['lastSlot'] = $slot;
        $current['secs'] += $secs;
        $current['categories'][$category] += $secs;
        $what = stDescribe($row, $titles);
        $current['what'][$what] = ($current['what'][$what] ?? 0) + $secs;
    }
    if ($current) {
        $sessions[] = $current;
    }

    $sessionList = [];
    foreach (array_reverse($sessions) as $session) {
        $start = (new DateTimeImmutable('@' . ($session['firstSlot'] * ST_SLOT)))->setTimezone($zone);
        $end = (new DateTimeImmutable('@' . (($session['lastSlot'] + 1) * ST_SLOT)))->setTimezone($zone);
        arsort($session['categories']);
        arsort($session['what']);
        $sessionList[] = [
            'day' => $start->format('Y-m-d'),
            'dayLabel' => stTimeLabel($session['firstSlot']),
            'start' => $start->format('g:i A'),
            'end' => $end->format('g:i A'),
            // Minutes from the day's midnight, for the timeline.
            'startMin' => (int)$start->format('G') * 60 + (int)$start->format('i'),
            'endMin' => max((int)$start->format('G') * 60 + (int)$start->format('i') + 1, $end->format('Y-m-d') === $start->format('Y-m-d') ? (int)$end->format('G') * 60 + (int)$end->format('i') : 1440),
            'spanSecs' => ($session['lastSlot'] + 1 - $session['firstSlot']) * ST_SLOT,
            'secs' => $session['secs'],
            'main' => (string)array_key_first($session['categories']),
            'categories' => $session['categories'],
            'what' => array_slice(array_keys($session['what']), 0, 3),
        ];
    }

    $lastSlot = $slots ? (int)$slots[count($slots) - 1]['slot'] : 0;
    return [
        'classroom' => ['id' => $id, 'title' => (string)$classroom['title']],
        'student' => array_diff_key($student, ['joined' => 1]),
        'range' => array_diff_key($range, ['fromSlot' => 1, 'toSlot' => 1]),
        'limitMin' => $limit,
        'totals' => [
            'secs' => $total,
            'sessions' => count($sessionList),
            'avgPerSession' => $sessionList ? (int)round($total / count($sessionList)) : 0,
            'activeDays' => count($days),
            'daysOver' => count(array_filter($days, static fn($secs) => $secs > $limit * 60)),
        ],
        'last' => $slots ? ['at' => stTimeLabel($lastSlot), 'label' => stDescribe($slots[count($slots) - 1], $titles)] : null,
        'categories' => $categories,
        'categoryLabels' => stCategories(),
        'chart' => stChart($range, $byKey),
        'sessions' => $sessionList,
    ];
}

// Minutes as "1 h 25 min" (CSV and summaries).
function stDuration(int $secs): string
{
    $minutes = (int)round($secs / 60);
    if ($minutes < 1) {
        return $secs > 0 ? '< 1 min' : '0 min';
    }
    return $minutes >= 60 ? intdiv($minutes, 60) . ' h ' . ($minutes % 60) . ' min' : $minutes . ' min';
}

function stSendCsv(string $filename, array $rows): void
{
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . preg_replace('/[^A-Za-z0-9._-]+/', '-', $filename) . '"');
    header('Cache-Control: no-store');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF"); // so spreadsheet apps read the names correctly
    foreach ($rows as $row) {
        // A cell starting with = + - @ is not run as a formula.
        fputcsv($out, array_map(static fn($cell) => is_string($cell) && preg_match('/^[=+\-@]/', $cell) ? "'" . $cell : $cell, $row));
    }
    fclose($out);
}
