<?php
require_once __DIR__ . '/missions_lib.php';

function koobdAchievementCatalog(bool $teacher): array
{
    $build = static function (
        string $key,
        string $title,
        string $description,
        string $category,
        string $categoryTitle,
        string $rarity,
        string $metric,
        int $target,
        string $icon
    ): array {
        return compact('key', 'title', 'description', 'category', 'categoryTitle', 'rarity', 'metric', 'target', 'icon');
    };

    if ($teacher) {
        return [
            $build('classroom_creator', 'Classroom Creator', 'Create your first classroom.', 'classroom', 'Classroom Management', 'bronze', 'classrooms', 1, 'classroom'),
            $build('student_mentor', 'Student Mentor', 'Welcome a student into one of your classrooms.', 'classroom', 'Classroom Management', 'bronze', 'students', 1, 'students'),
            $build('classroom_manager', 'Classroom Manager', 'Set up three classrooms for your learning community.', 'classroom', 'Classroom Management', 'silver', 'classrooms', 3, 'building'),
            $build('activity_creator', 'Activity Creator', 'Publish your first classroom learning activity.', 'teaching', 'Teaching Activities', 'bronze', 'activities', 1, 'activity'),
            $build('reading_facilitator', 'Reading Facilitator', 'Assign a published story activity to a class.', 'teaching', 'Teaching Activities', 'silver', 'reading_activities', 1, 'book'),
            $build('quiz_master', 'Quiz Master', 'Publish a quiz for your students.', 'teaching', 'Teaching Activities', 'silver', 'quizzes', 1, 'quiz'),
            $build('dedicated_educator', 'Dedicated Educator', 'Publish five classroom activities.', 'teaching', 'Teaching Activities', 'gold', 'activities', 5, 'star'),
            $build('student_supporter', 'Student Supporter', 'Review a student progress report.', 'monitoring', 'Student Monitoring', 'bronze', 'progress_reports', 1, 'chart'),
            $build('progress_tracker', 'Progress Tracker', 'Review progress in three different activities.', 'monitoring', 'Student Monitoring', 'silver', 'progress_reports', 3, 'magnify'),
            $build('active_mentor', 'Active Mentor', 'Review screen-time reports for five students.', 'monitoring', 'Student Monitoring', 'gold', 'students_monitored', 5, 'mentor'),
            $build('first_reviewer', 'First Reviewer', 'Preview and review your first student story.', 'reviewing', 'Story Approval', 'bronze', 'story_reviews', 1, 'eye'),
            $build('creative_supporter', 'Creative Supporter', 'Approve and publish a student-created story.', 'reviewing', 'Story Approval', 'silver', 'approved_stories', 1, 'approve'),
            $build('story_mentor', 'Story Mentor', 'Give constructive feedback on a student story.', 'reviewing', 'Story Approval', 'gold', 'constructive_feedback', 1, 'comment'),
            $build('dedicated_reviewer', 'Dedicated Reviewer', 'Review five different student stories.', 'reviewing', 'Story Approval', 'platinum', 'story_reviews', 5, 'medal'),
            $build('teaching_first_steps', 'First Steps', 'Complete the first stage of your Teaching Journey.', 'journey', 'Teaching Journey', 'bronze', 'journey_stages', 1, 'steps'),
            $build('organized_educator', 'Organized Educator', 'Complete three stages of your Teaching Journey.', 'journey', 'Teaching Journey', 'gold', 'journey_stages', 3, 'route'),
            $build('koobd_mentor', "KOOB'D Mentor", 'Complete your entire Teaching Journey.', 'journey', 'Teaching Journey', 'special', 'journey_complete', 1, 'compass'),
        ];
    }

    return [
        $build('first_story', 'First Story', 'Create your first story.', 'story', 'Storytelling & Creativity', 'bronze', 'stories_created', 1, 'pen'),
        $build('published_author', 'Published Author', 'Earn a teacher’s approval and publish your first story.', 'story', 'Storytelling & Creativity', 'gold', 'published_stories', 1, 'quill'),
        $build('creative_mind', 'Creative Mind', 'Create three stories of your own.', 'story', 'Storytelling & Creativity', 'silver', 'stories_created', 3, 'spark'),
        $build('storyteller', 'Storyteller', 'Publish three teacher-approved stories.', 'story', 'Storytelling & Creativity', 'platinum', 'published_stories', 3, 'scroll'),
        $build('little_creator', 'Little Creator', 'Try both story creation modes.', 'story', 'Storytelling & Creativity', 'silver', 'story_modes', 2, 'tools'),
        $build('first_reader', 'First Reader', 'Finish reading a story.', 'reading', 'Reading', 'bronze', 'completed_stories', 1, 'book'),
        $build('book_explorer', 'Book Explorer', 'Finish five different stories.', 'reading', 'Reading', 'silver', 'completed_stories', 5, 'books'),
        $build('reading_champion', 'Reading Champion', 'Finish three classroom story activities.', 'reading', 'Reading', 'gold', 'reading_activities', 3, 'star'),
        $build('story_master', 'Story Master', 'Score at least 80% on a classroom quiz.', 'reading', 'Reading', 'platinum', 'high_score_quizzes', 1, 'brain'),
        $build('word_collector', 'Word Collector', 'Look up ten different words in the Dictionary.', 'language', 'Language & Writing', 'silver', 'dictionary_words', 10, 'word'),
        $build('vocabulary_explorer', 'Vocabulary Explorer', 'Look up a word in both English and Filipino.', 'language', 'Language & Writing', 'silver', 'dictionary_languages', 2, 'globe'),
        $build('writing_star', 'Writing Star', 'Write and save your first piece of writing.', 'language', 'Language & Writing', 'bronze', 'writing_pieces', 1, 'pencil'),
        $build('grammar_master', 'Grammar Master', 'Finish three writing challenges with at least 30 words each.', 'language', 'Language & Writing', 'gold', 'writing_challenges', 3, 'check'),
        $build('first_challenger', 'First Challenger', 'Complete your first Versus Mode match.', 'interactive', 'Interactive Learning', 'bronze', 'versus_matches', 1, 'versus'),
        $build('word_warrior', 'Word Warrior', 'Score three points in a completed Versus match.', 'interactive', 'Interactive Learning', 'gold', 'best_versus_score', 3, 'sword'),
        $build('minigame_explorer', 'Minigame Explorer', 'Finish a round in a minigame.', 'interactive', 'Interactive Learning', 'bronze', 'minigame_plays', 1, 'game'),
        $build('champion_player', 'Champion Player', 'Unlock three minigames by reaching their score goals.', 'interactive', 'Interactive Learning', 'platinum', 'minigame_unlocks', 3, 'trophy'),
        $build('perfect_round', 'Perfect Round', 'Finish a Versus round with no wrong picks or answers.', 'interactive', 'Interactive Learning', 'gold', 'perfect_rounds', 1, 'target'),
        $build('learning_first_steps', 'First Steps', 'Complete the first stage of your Learning Journey.', 'journey', 'Learning Journey', 'bronze', 'journey_stages', 1, 'steps'),
        $build('rising_learner', 'Rising Learner', 'Complete three stages of your Learning Journey.', 'journey', 'Learning Journey', 'silver', 'journey_stages', 3, 'route'),
        $build('dedicated_student', 'Dedicated Student', 'Complete ten required journey missions.', 'journey', 'Learning Journey', 'gold', 'journey_missions', 10, 'badge'),
        $build('koobd_explorer', "KOOB'D Explorer", 'Complete your entire Learning Journey.', 'journey', 'Learning Journey', 'special', 'journey_complete', 1, 'compass'),
    ];
}

function koobdAchievementCategories(bool $teacher): array
{
    return $teacher
        ? ['classroom' => 'Classroom Management', 'teaching' => 'Teaching Activities', 'monitoring' => 'Student Monitoring', 'reviewing' => 'Story Approval', 'journey' => 'Teaching Journey']
        : ['story' => 'Storytelling & Creativity', 'reading' => 'Reading', 'language' => 'Language & Writing', 'interactive' => 'Interactive Learning', 'journey' => 'Learning Journey'];
}

function koobdAchievementQueryRow(string $sql, string $types, array $params): array
{
    global $conn;
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        error_log('Unable to prepare achievement progress query.');
        throw new RuntimeException('Unable to load achievement progress.');
    }
    if ($types !== '') {
        $stmt->bind_param($types, ...$params);
    }
    if (!$stmt->execute()) {
        $stmt->close();
        error_log('Unable to load achievement progress.');
        throw new RuntimeException('Unable to load achievement progress.');
    }
    $row = $stmt->get_result()->fetch_assoc() ?: [];
    $stmt->close();
    return $row;
}

function koobdAchievementMetrics(array $user, array $journey): array
{
    global $conn;
    $userId = (int)($user['id'] ?? 0);
    $teacher = koobdIsTeacher($user);
    $role = $teacher ? 'teacher' : 'student';
    $metrics = [
        'journey_stages' => count(array_filter($journey['stages'], static fn(array $stage): bool => !empty($stage['completed']))),
        'journey_missions' => (int)$journey['completed'],
        'journey_complete' => (int)((int)$journey['percentage'] >= 100),
    ];

    if ($teacher) {
        $counts = koobdAchievementQueryRow(
            "SELECT
               (SELECT COUNT(*) FROM classrooms WHERE teacher_id = ?) AS classrooms,
               (SELECT COUNT(DISTINCT cs.student_user_id)
                FROM classroom_students cs INNER JOIN classrooms c ON c.id = cs.classroom_id
                WHERE c.teacher_id = ?) AS students,
               (SELECT COUNT(*) FROM classroom_activities ca INNER JOIN classrooms c ON c.id = ca.classroom_id
                WHERE c.teacher_id = ? AND ca.status = 'published') AS activities,
               (SELECT COUNT(*) FROM classroom_activities ca INNER JOIN classrooms c ON c.id = ca.classroom_id
                WHERE c.teacher_id = ? AND ca.status = 'published' AND ca.activity_type = 'story') AS reading_activities,
               (SELECT COUNT(*) FROM classroom_activities ca INNER JOIN classrooms c ON c.id = ca.classroom_id
                WHERE c.teacher_id = ? AND ca.status = 'published' AND ca.activity_type = 'quiz') AS quizzes",
            'iiiii',
            [$userId, $userId, $userId, $userId, $userId]
        );
        $metrics['classrooms'] = (int)($counts['classrooms'] ?? 0);
        $metrics['students'] = (int)($counts['students'] ?? 0);
        $metrics['activities'] = (int)($counts['activities'] ?? 0);
        $metrics['reading_activities'] = (int)($counts['reading_activities'] ?? 0);
        $metrics['quizzes'] = (int)($counts['quizzes'] ?? 0);

        $reviews = koobdAchievementQueryRow(
            "SELECT
               COUNT(DISTINCT CASE WHEN decision IN ('reviewed', 'approve', 'reject', 'request_revision', 'comment') THEN story_id END) AS reviewed,
               COUNT(DISTINCT CASE WHEN decision = 'approve' THEN story_id END) AS approved,
               COUNT(DISTINCT CASE WHEN decision IN ('request_revision', 'comment')
                    AND CHAR_LENGTH(TRIM(COALESCE(feedback, ''))) >= 20 THEN story_id END) AS constructive
             FROM teacher_story_reviews
             WHERE teacher_id = ?",
            'i',
            [$userId]
        );
        $metrics['story_reviews'] = (int)($reviews['reviewed'] ?? 0);
        $metrics['approved_stories'] = (int)($reviews['approved'] ?? 0);
        $metrics['constructive_feedback'] = (int)($reviews['constructive'] ?? 0);

        $events = koobdAchievementQueryRow(
            "SELECT
               COUNT(DISTINCT CASE WHEN event_key = 'progress_report' THEN evidence_key END) AS progress_reports,
               COUNT(DISTINCT CASE WHEN event_key = 'screen_time_student' THEN evidence_key END) AS students_monitored
             FROM user_achievement_events
             WHERE user_id = ? AND role = 'teacher'",
            'i',
            [$userId]
        );
        $metrics['progress_reports'] = (int)($events['progress_reports'] ?? 0);
        $metrics['students_monitored'] = (int)($events['students_monitored'] ?? 0);
        return $metrics;
    }

    $stories = koobdAchievementQueryRow(
        "SELECT
           COUNT(*) AS created,
           COUNT(DISTINCT CASE WHEN status = 'published' AND approved_by IS NOT NULL
                    AND approved_version = version_number THEN id END) AS published,
           COUNT(DISTINCT story_mode) AS modes
         FROM teacher_stories
         WHERE teacher_id = ?",
        'i',
        [$userId]
    );
    $metrics['stories_created'] = (int)($stories['created'] ?? 0);
    $metrics['published_stories'] = (int)($stories['published'] ?? 0);
    $metrics['story_modes'] = (int)($stories['modes'] ?? 0);

    $reading = koobdAchievementQueryRow(
        "SELECT
           COUNT(DISTINCT CASE WHEN progress >= 100 THEN story_id END) AS completed_stories,
           COUNT(DISTINCT CASE WHEN progress >= 100 AND progress_context LIKE 'activity:%' THEN progress_context END) AS reading_activities
         FROM story_progress
         WHERE user_id = ?",
        'i',
        [$userId]
    );
    $metrics['completed_stories'] = (int)($reading['completed_stories'] ?? 0);
    $metrics['reading_activities'] = (int)($reading['reading_activities'] ?? 0);

    $quizzes = koobdAchievementQueryRow(
        "SELECT COUNT(*) AS high_scores
         FROM activity_submissions s
         INNER JOIN classroom_activities ca ON ca.id = s.activity_id
         WHERE s.student_user_id = ? AND ca.activity_type = 'quiz'
           AND s.pending = 0 AND s.total > 0 AND s.score >= s.total * 0.8",
        'i',
        [$userId]
    );
    $metrics['high_score_quizzes'] = (int)($quizzes['high_scores'] ?? 0);

    $dictionary = koobdAchievementQueryRow(
        "SELECT COUNT(DISTINCT evidence_key) AS words,
                COUNT(DISTINCT LEFT(evidence_key, 2)) AS languages
         FROM user_achievement_events
         WHERE user_id = ? AND role = 'student' AND event_key = 'dictionary_word'",
        'i',
        [$userId]
    );
    $metrics['dictionary_words'] = (int)($dictionary['words'] ?? 0);
    $metrics['dictionary_languages'] = (int)($dictionary['languages'] ?? 0);

    $writing = koobdAchievementQueryRow(
        "SELECT COUNT(*) AS pieces
         FROM writing_notes
         WHERE user_id = ? AND kind = 'note' AND CHAR_LENGTH(TRIM(body)) >= 20",
        'i',
        [$userId]
    );
    $metrics['writing_pieces'] = (int)($writing['pieces'] ?? 0);
    $metrics['writing_challenges'] = 0;
    $challengeStmt = $conn->prepare(
        "SELECT body FROM writing_notes
         WHERE user_id = ? AND kind = 'challenge' AND challenge_status = 'completed'"
    );
    if (!$challengeStmt) {
        error_log('Unable to prepare writing achievement lookup.');
        throw new RuntimeException('Unable to load writing achievement progress.');
    }
    $challengeStmt->bind_param('i', $userId);
    if (!$challengeStmt->execute()) {
        $challengeStmt->close();
        error_log('Unable to load writing achievement progress.');
        throw new RuntimeException('Unable to load writing achievement progress.');
    }
    foreach ($challengeStmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $wordCount = preg_match_all("/[\\p{L}\\p{N}][\\p{L}\\p{N}'’\\-]*/u", (string)$row['body']);
        if ($wordCount !== false && $wordCount >= 30) {
            $metrics['writing_challenges']++;
        }
    }
    $challengeStmt->close();

    $games = koobdAchievementQueryRow(
        "SELECT COUNT(DISTINCT game) AS games,
                COALESCE(SUM(plays), 0) AS plays
         FROM minigame_scores
         WHERE user_id = ? AND plays > 0",
        'i',
        [$userId]
    );
    $metrics['minigame_plays'] = (int)($games['plays'] ?? 0);
    $unlocks = koobdAchievementQueryRow(
        "SELECT COUNT(DISTINCT game) AS games
         FROM user_minigame_unlocks
         WHERE user_id = ?",
        'i',
        [$userId]
    );
    $metrics['minigame_unlocks'] = (int)($unlocks['games'] ?? 0);

    $versus = koobdAchievementQueryRow(
        "SELECT COUNT(*) AS matches_played,
                MAX(CASE WHEN host_id = ? THEN host_score ELSE guest_score END) AS best_score
         FROM vs_lobbies
         WHERE status = 'finished' AND (host_id = ? OR guest_id = ?)",
        'iii',
        [$userId, $userId, $userId]
    );
    $metrics['versus_matches'] = (int)($versus['matches_played'] ?? 0);
    $metrics['best_versus_score'] = (int)($versus['best_score'] ?? 0);

    $perfect = koobdAchievementQueryRow(
        "SELECT COUNT(*) AS perfect_rounds
         FROM vs_progress p
         INNER JOIN vs_rounds r ON r.id = p.round_id
         WHERE p.user_id = ? AND p.word_done_ms IS NOT NULL AND p.correct_ms IS NOT NULL
           AND p.wrong_pickups = 0 AND p.wrong_answers = 0",
        'i',
        [$userId]
    );
    $metrics['perfect_rounds'] = (int)($perfect['perfect_rounds'] ?? 0);
    return $metrics;
}

function koobdAchievementSync(array $user, ?array $journey = null): array
{
    global $conn;
    $userId = (int)($user['id'] ?? 0);
    if ($userId <= 0) {
        throw new InvalidArgumentException('A signed-in account is required to sync achievements.');
    }
    $teacher = koobdIsTeacher($user);
    $role = $teacher ? 'teacher' : 'student';
    $journey = $journey ?? koobdMissionOverview($user);
    $metrics = koobdAchievementMetrics($user, $journey);
    $catalog = koobdAchievementCatalog($teacher);
    $state = $conn->prepare(
        "SELECT 1 FROM user_achievement_sync WHERE user_id = ? AND role = ? LIMIT 1"
    );
    if (!$state) {
        error_log('Unable to prepare achievement sync state lookup.');
        throw new RuntimeException('Unable to sync achievements.');
    }
    $state->bind_param('is', $userId, $role);
    if (!$state->execute()) {
        $state->close();
        error_log('Unable to load achievement sync state.');
        throw new RuntimeException('Unable to sync achievements.');
    }
    $initialSync = $state->get_result()->num_rows === 0;
    $state->close();
    $insert = $conn->prepare(
        "INSERT IGNORE INTO user_achievements (user_id, role, achievement_key, notified_at)
         VALUES (?, ?, ?, IF(?, CURRENT_TIMESTAMP, NULL))"
    );
    if (!$insert) {
        error_log('Unable to prepare achievement award insert.');
        throw new RuntimeException('Unable to save achievements.');
    }
    $newAwards = [];
    foreach ($catalog as $achievement) {
        if ((int)($metrics[$achievement['metric']] ?? 0) < $achievement['target']) {
            continue;
        }
        $key = $achievement['key'];
        $notify = $initialSync ? 1 : 0;
        $insert->bind_param('issi', $userId, $role, $key, $notify);
        if (!$insert->execute()) {
            $insert->close();
            error_log('Unable to save an achievement award.');
            throw new RuntimeException('Unable to save achievements.');
        }
        if ($insert->affected_rows === 1) {
            $newAwards[] = $key;
        }
    }
    $insert->close();
    if ($initialSync) {
        $acknowledgeBackfill = $conn->prepare(
            "UPDATE user_achievements SET notified_at = CURRENT_TIMESTAMP
             WHERE user_id = ? AND role = ? AND notified_at IS NULL"
        );
        if (!$acknowledgeBackfill) {
            error_log('Unable to prepare initial achievement notice cleanup.');
            throw new RuntimeException('Unable to sync achievements.');
        }
        $acknowledgeBackfill->bind_param('is', $userId, $role);
        if (!$acknowledgeBackfill->execute()) {
            $acknowledgeBackfill->close();
            error_log('Unable to clear initial achievement notice backlog.');
            throw new RuntimeException('Unable to sync achievements.');
        }
        $acknowledgeBackfill->close();
    }
    $markInitialized = $conn->prepare(
        "INSERT IGNORE INTO user_achievement_sync (user_id, role) VALUES (?, ?)"
    );
    if (!$markInitialized) {
        error_log('Unable to prepare achievement sync state update.');
        throw new RuntimeException('Unable to sync achievements.');
    }
    $markInitialized->bind_param('is', $userId, $role);
    if (!$markInitialized->execute()) {
        $markInitialized->close();
        error_log('Unable to save achievement sync state.');
        throw new RuntimeException('Unable to sync achievements.');
    }
    $markInitialized->close();
    return ['role' => $role, 'metrics' => $metrics, 'catalog' => $catalog, 'new_awards' => $newAwards, 'initial_sync' => $initialSync];
}

function koobdAchievementOverview(array $user, ?array $journey = null): array
{
    global $conn;
    $sync = koobdAchievementSync($user, $journey);
    $userId = (int)$user['id'];
    $role = $sync['role'];
    $stmt = $conn->prepare(
        "SELECT achievement_key, earned_at
         FROM user_achievements
         WHERE user_id = ? AND role = ?
         ORDER BY earned_at DESC, id DESC"
    );
    if (!$stmt) {
        error_log('Unable to prepare achievement history lookup.');
        throw new RuntimeException('Unable to load achievement history.');
    }
    $stmt->bind_param('is', $userId, $role);
    if (!$stmt->execute()) {
        $stmt->close();
        error_log('Unable to load achievement history.');
        throw new RuntimeException('Unable to load achievement history.');
    }
    $earned = [];
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $earned[(string)$row['achievement_key']] = (string)$row['earned_at'];
    }
    $stmt->close();

    $categories = koobdAchievementCategories($role === 'teacher');
    $grouped = array_fill_keys(array_keys($categories), []);
    foreach ($sync['catalog'] as $achievement) {
        $progress = max(0, (int)($sync['metrics'][$achievement['metric']] ?? 0));
        $earnedAt = $earned[$achievement['key']] ?? null;
        $achievement['earned_at'] = $earnedAt;
        $achievement['is_earned'] = $earnedAt !== null;
        $achievement['progress'] = min($progress, $achievement['target']);
        $achievement['progress_percent'] = min(100, (int)floor($progress / $achievement['target'] * 100));
        $achievement['progress_label'] = $achievement['progress'] . ' / ' . $achievement['target'];
        $grouped[$achievement['category']][] = $achievement;
    }
    $earnedCount = count($earned);
    $totalCount = count($sync['catalog']);
    $recent = [];
    foreach ($sync['catalog'] as $achievement) {
        if (isset($earned[$achievement['key']])) {
            $achievement['earned_at'] = $earned[$achievement['key']];
            $recent[] = $achievement;
        }
    }
    usort($recent, static fn(array $a, array $b): int => strcmp((string)$b['earned_at'], (string)$a['earned_at']));

    return [
        'role' => $role,
        'categories' => $categories,
        'groups' => $grouped,
        'recent' => array_slice($recent, 0, 3),
        'earned_count' => $earnedCount,
        'total_count' => $totalCount,
        'completion_percent' => $totalCount > 0 ? (int)round($earnedCount / $totalCount * 100) : 0,
    ];
}

function koobdAchievementRecordEvent(array $user, string $eventKey, string $evidenceKey): void
{
    global $conn;
    $allowedEvents = ['dictionary_word', 'progress_report', 'screen_time_student'];
    $userId = (int)($user['id'] ?? 0);
    $role = koobdIsTeacher($user) ? 'teacher' : 'student';
    $evidenceKey = trim($evidenceKey);
    if ($userId <= 0 || !in_array($eventKey, $allowedEvents, true) || $evidenceKey === '' || strlen($evidenceKey) > 120) {
        throw new InvalidArgumentException('Invalid achievement evidence.');
    }
    $stmt = $conn->prepare(
        "INSERT IGNORE INTO user_achievement_events (user_id, role, event_key, evidence_key) VALUES (?, ?, ?, ?)"
    );
    if (!$stmt) {
        error_log('Unable to prepare achievement evidence record.');
        throw new RuntimeException('Unable to record achievement progress.');
    }
    $stmt->bind_param('isss', $userId, $role, $eventKey, $evidenceKey);
    if (!$stmt->execute()) {
        $stmt->close();
        error_log('Unable to save achievement evidence.');
        throw new RuntimeException('Unable to record achievement progress.');
    }
    $stmt->close();
}

function koobdAchievementPendingNotices(array $user, int $limit = 20): array
{
    global $conn;
    $userId = (int)($user['id'] ?? 0);
    $role = koobdIsTeacher($user) ? 'teacher' : 'student';
    $limit = max(1, min(30, $limit));
    $stmt = $conn->prepare(
        "SELECT id, achievement_key, earned_at
         FROM user_achievements
         WHERE user_id = ? AND role = ? AND notified_at IS NULL
         ORDER BY earned_at, id
         LIMIT ?"
    );
    if (!$stmt) {
        error_log('Unable to prepare achievement notice lookup.');
        throw new RuntimeException('Unable to load achievement notices.');
    }
    $stmt->bind_param('isi', $userId, $role, $limit);
    if (!$stmt->execute()) {
        $stmt->close();
        error_log('Unable to load achievement notices.');
        throw new RuntimeException('Unable to load achievement notices.');
    }
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    $catalog = [];
    foreach (koobdAchievementCatalog($role === 'teacher') as $achievement) {
        $catalog[$achievement['key']] = $achievement;
    }
    $notices = [];
    foreach ($rows as $row) {
        $key = (string)$row['achievement_key'];
        if (!isset($catalog[$key])) {
            continue;
        }
        $achievement = $catalog[$key];
        $notices[] = [
            'id' => (int)$row['id'],
            'key' => $key,
            'title' => $achievement['title'],
            'description' => $achievement['description'],
            'category' => $achievement['category'],
            'rarity' => $achievement['rarity'],
            'icon' => $achievement['icon'],
            'art' => koobdAchievementMedalSvg($achievement),
            'earned_at' => (string)$row['earned_at'],
        ];
    }
    return $notices;
}

function koobdAchievementAcknowledgeNotices(array $user, array $ids): void
{
    global $conn;
    $userId = (int)($user['id'] ?? 0);
    $role = koobdIsTeacher($user) ? 'teacher' : 'student';
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn(int $id): bool => $id > 0)));
    if (!$ids) {
        return;
    }
    $ids = array_slice($ids, 0, 30);
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $types = 'is' . str_repeat('i', count($ids));
    $params = array_merge([$userId, $role], $ids);
    $stmt = $conn->prepare(
        "UPDATE user_achievements SET notified_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND role = ? AND notified_at IS NULL AND id IN ($placeholders)"
    );
    if (!$stmt) {
        error_log('Unable to prepare achievement notice acknowledgement.');
        throw new RuntimeException('Unable to acknowledge achievement notices.');
    }
    $stmt->bind_param($types, ...$params);
    if (!$stmt->execute()) {
        $stmt->close();
        error_log('Unable to acknowledge achievement notices.');
        throw new RuntimeException('Unable to acknowledge achievement notices.');
    }
    $stmt->close();
}

function koobdAchievementMedalSvg(array $achievement): string
{
    $paths = [
        'pen' => '<path d="m22 38 20-20 8 8-20 20-10 2z"/><path d="m38 22 8 8"/>',
        'quill' => '<path d="M45 18c-12 1-24 7-25 23l10-2 2 9c8-6 14-18 13-30z"/><path d="m23 44 14-14"/>',
        'spark' => '<path d="m32 18 3.5 9.5L45 31l-9.5 3.5L32 44l-3.5-9.5L19 31l9.5-3.5z"/><path d="m45 39 1.5 4.5L51 45l-4.5 1.5L45 51l-1.5-4.5L39 45l4.5-1.5z"/>',
        'scroll' => '<path d="M22 22h23v25H26a5 5 0 0 1-5-5V25a3 3 0 0 1 3-3z"/><path d="M22 27h18M28 34h12M28 40h8"/>',
        'tools' => '<path d="M21 43 43 21l5 5-22 22h-7z"/><path d="m37 22 5-5 5 5-5 5M21 20v12M15 26h12"/>',
        'book' => '<path d="M17 22h14v25H20a4 4 0 0 0-4 4V27a5 5 0 0 1 5-5z"/><path d="M47 22H33v25h11a4 4 0 0 1 4 4V27a5 5 0 0 0-5-5z"/>',
        'books' => '<path d="M19 25h8v23h-8zM29 20h8v28h-8zM39 25h7v23h-7z"/><path d="M20 30h6M30 27h6M40 31h5"/>',
        'brain' => '<path d="M32 20a7 7 0 0 0-12 5 7 7 0 0 0-1 13 7 7 0 0 0 8 10h5zM32 20a7 7 0 0 1 12 5 7 7 0 0 1 1 13 7 7 0 0 1-8 10h-5"/><path d="M25 29h7M39 33h-7M25 40h7"/>',
        'word' => '<path d="M20 22h24v27H20z"/><path d="m25 42 5-15 5 15M27 37h6M37 31h4M37 37h4"/>',
        'globe' => '<circle cx="32" cy="35" r="15"/><path d="M17 35h30M32 20c5 5 7 10 7 15s-2 10-7 15M32 20c-5 5-7 10-7 15s2 10 7 15"/>',
        'pencil' => '<path d="m20 43 22-22 6 6-22 22-9 2z"/><path d="m38 25 6 6M18 18v12M12 24h12"/>',
        'check' => '<path d="M20 22h24v27H20z"/><path d="m25 36 5 5 10-12"/>',
        'versus' => '<path d="M21 22h22a6 6 0 0 1 6 6v14a5 5 0 0 1-9 3l-3-4h-9l-3 4a5 5 0 0 1-9-3V28a6 6 0 0 1 5-6z"/><path d="M22 29v10M17 34h10M39 31h.1M44 37h.1"/>',
        'sword' => '<path d="m21 45 24-24 3 7-19 19-8 1z"/><path d="m38 28 5 5M18 45l8 3M41 19l5 5"/>',
        'game' => '<path d="M21 24h22a6 6 0 0 1 6 6v12a5 5 0 0 1-9 3l-4-5h-8l-4 5a5 5 0 0 1-9-3V30a6 6 0 0 1 6-6z"/><path d="M23 30v9M18.5 34.5h9M40 32h.1M44 37h.1"/>',
        'trophy' => '<path d="M24 20h16v8a8 8 0 0 1-16 0zM24 24h-6v4a7 7 0 0 0 7 7M40 24h6v4a7 7 0 0 1-7 7M32 36v8M25 48h14M28 44h8"/>',
        'target' => '<circle cx="32" cy="35" r="15"/><circle cx="32" cy="35" r="9"/><circle cx="32" cy="35" r="3"/><path d="m32 35 13-14M40 21h5v5"/>',
        'steps' => '<path d="M18 46h8v-7h8v-7h8v-7h6"/><path d="M20 22h5M31 22h5M42 22h5"/>',
        'route' => '<circle cx="21" cy="45" r="3"/><circle cx="43" cy="23" r="3"/><path d="M24 45h7a5 5 0 0 0 5-5V28a5 5 0 0 1 5-5M20 27l5 5M43 40l5 5"/>',
        'badge' => '<path d="M23 21h18v14a9 9 0 0 1-18 0zM27 44l-3 7 8-4 8 4-3-7"/><path d="m32 24 2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z"/>',
        'compass' => '<circle cx="32" cy="35" r="16"/><path d="m38 29-4 9-9 4 4-9zM32 16v4M32 50v4M13 35h4M47 35h4"/>',
        'classroom' => '<path d="M17 48V25l15-8 15 8v23z"/><path d="M24 29h16v10H24zM30 48V39M20 44h24"/>',
        'students' => '<circle cx="32" cy="27" r="6"/><circle cx="20" cy="32" r="4"/><circle cx="44" cy="32" r="4"/><path d="M20 48a12 12 0 0 1 24 0M12 47a8 8 0 0 1 8-8M52 47a8 8 0 0 0-8-8"/>',
        'building' => '<path d="M18 48V24l14-7 14 7v24z"/><path d="M25 29h5v6h-5zM34 29h5v6h-5zM29 48V38h6v10M23 42h4M38 42h4"/>',
        'activity' => '<path d="M20 21h24v30H20zM26 29h12M26 35h12"/><path d="m26 42 4 4 8-9"/>',
        'quiz' => '<path d="M20 21h24v30H20zM27 29a5 5 0 1 1 8 4c-3 2-3 3-3 5M32 44h.1"/>',
        'chart' => '<path d="M19 49V21M19 49h30"/><path d="m23 42 8-9 7 4 10-13"/><path d="M42 24h6v6"/>',
        'magnify' => '<circle cx="29" cy="31" r="10"/><path d="m36 38 11 11M22 31h14M29 24v14"/>',
        'mentor' => '<circle cx="25" cy="28" r="5"/><circle cx="40" cy="30" r="4"/><path d="M16 48a9 9 0 0 1 18 0M34 43a8 8 0 0 1 15 5M33 20l2-4 2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3z"/>',
        'eye' => '<path d="M16 35s6-12 16-12 16 12 16 12-6 12-16 12-16-12-16-12z"/><circle cx="32" cy="35" r="5"/>',
        'approve' => '<path d="M20 22h24v28H20z"/><path d="m25 36 5 5 10-12M25 28h8"/>',
        'comment' => '<path d="M18 22h28v21H31l-8 7v-7h-5z"/><path d="M24 30h16M24 36h11"/>',
        'medal' => '<circle cx="32" cy="34" r="11"/><path d="m25 43-3 9 10-4 10 4-3-9M32 27l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z"/>',
    ];
    $icon = $paths[$achievement['icon'] ?? ''] ?? $paths['badge'];
    $rarity = htmlspecialchars((string)($achievement['rarity'] ?? 'bronze'), ENT_QUOTES, 'UTF-8');
    return '<svg class="pf-achievement-art is-' . $rarity . '" viewBox="0 0 64 72" aria-hidden="true">'
        . '<path class="pf-medal-ribbon" d="m20 44 12 7 12-7 4 23-16-8-16 8z"/>'
        . '<circle class="pf-medal-edge" cx="32" cy="31" r="22"/>'
        . '<circle class="pf-medal-face" cx="32" cy="31" r="17"/>'
        . '<g class="pf-medal-emblem">' . $icon . '</g>'
        . '</svg>';
}
