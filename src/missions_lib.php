<?php
require_once __DIR__ . '/auth.php';

function koobdMissionRecord(array $user, string $missionKey): void
{
    global $conn;
    $userId = (int)($user['id'] ?? 0);
    if ($userId <= 0 || !preg_match('/^[a-z0-9_]{1,40}$/', $missionKey)) {
        return;
    }
    $role = koobdIsTeacher($user) ? 'teacher' : 'student';
    $stmt = $conn->prepare(
        "INSERT IGNORE INTO user_mission_events (user_id, role, mission_key) VALUES (?, ?, ?)"
    );
    $stmt->bind_param('iss', $userId, $role, $missionKey);
    $stmt->execute();
    $stmt->close();
}

function koobdMissionMetric(int $userId, string $sql): int
{
    global $conn;
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_row();
    $stmt->close();
    return (int)($row[0] ?? 0);
}

function koobdMissionMarkers(int $userId, string $role): array
{
    global $conn;
    $stmt = $conn->prepare("SELECT mission_key FROM user_mission_events WHERE user_id = ? AND role = ?");
    $stmt->bind_param('is', $userId, $role);
    $stmt->execute();
    $result = $stmt->get_result();
    $markers = [];
    while ($row = $result->fetch_assoc()) {
        $markers[(string)$row['mission_key']] = true;
    }
    $stmt->close();
    return $markers;
}

function koobdMissionFacts(array $user): array
{
    $userId = (int)($user['id'] ?? 0);
    $teacher = koobdIsTeacher($user);
    $role = $teacher ? 'teacher' : 'student';
    $markers = koobdMissionMarkers($userId, $role);

    if ($teacher) {
        return [
            'create_classroom' => isset($markers['create_classroom']) || koobdMissionMetric($userId, "SELECT COUNT(*) FROM classrooms WHERE teacher_id = ?") > 0,
            'add_students' => isset($markers['add_students']) || koobdMissionMetric($userId, "SELECT COUNT(*) FROM classroom_students cs INNER JOIN classrooms c ON c.id = cs.classroom_id WHERE c.teacher_id = ?") > 0,
            'assign_reading' => isset($markers['assign_reading']) || koobdMissionMetric($userId, "SELECT COUNT(*) FROM classroom_activities ca INNER JOIN classrooms c ON c.id = ca.classroom_id WHERE c.teacher_id = ? AND ca.activity_type = 'story' AND ca.status = 'published'") > 0,
            'create_quiz' => isset($markers['create_quiz']) || koobdMissionMetric($userId, "SELECT COUNT(DISTINCT ca.id) FROM classroom_activities ca INNER JOIN classrooms c ON c.id = ca.classroom_id INNER JOIN activity_questions q ON q.activity_id = ca.id WHERE c.teacher_id = ? AND ca.activity_type = 'quiz' AND ca.status = 'published'") > 0,
            'review_progress' => isset($markers['review_progress']),
            'screen_time' => isset($markers['screen_time']),
            'create_class_story' => isset($markers['create_class_story']) || koobdMissionMetric($userId, "SELECT COUNT(*) FROM teacher_stories WHERE teacher_id = ? AND status = 'published'") > 0,
            'approve_story' => isset($markers['approve_story']) || koobdMissionMetric($userId, "SELECT COUNT(*) FROM teacher_story_reviews WHERE teacher_id = ? AND decision IN ('approve', 'reject')") > 0,
            'message_class' => isset($markers['message_class']) || koobdMissionMetric($userId, "SELECT COUNT(*) FROM classroom_messages WHERE sender_user_id = ?") > 0,
            '_markers' => $markers,
        ];
    }

    return [
        'profile' => isset($markers['profile']),
        'join_class' => isset($markers['join_class']) || koobdMissionMetric($userId, "SELECT COUNT(*) FROM classroom_students WHERE student_user_id = ?") > 0,
        'read_story' => isset($markers['read_story']) || koobdMissionMetric($userId, "SELECT COUNT(*) FROM story_progress WHERE user_id = ? AND progress_context = 'global' AND progress > 0") > 0,
        'finish_story' => isset($markers['finish_story']) || koobdMissionMetric($userId, "SELECT COUNT(*) FROM story_progress WHERE user_id = ? AND progress_context = 'global' AND progress >= 100") > 0,
        'class_activity' => isset($markers['class_activity']) || koobdMissionMetric($userId, "SELECT COUNT(*) FROM activity_submissions WHERE student_user_id = ?") > 0,
        'dictionary' => isset($markers['dictionary_lookup']),
        'writing' => isset($markers['writing']) || koobdMissionMetric($userId, "SELECT COUNT(*) FROM writing_notes WHERE user_id = ? AND kind = 'note'") > 0,
        'create_story' => isset($markers['create_story']) || koobdMissionMetric($userId, "SELECT COUNT(*) FROM teacher_stories WHERE teacher_id = ?") > 0,
        'submit_story' => isset($markers['submit_story']) || koobdMissionMetric($userId, "SELECT COUNT(*) FROM teacher_stories WHERE teacher_id = ? AND submission_code IS NOT NULL AND status IN ('pending_approval', 'revision_required', 'published', 'unpublished', 'rejected')") > 0,
        'versus_match' => isset($markers['versus_match']) || koobdMissionMetric($userId, "SELECT COUNT(*) FROM vs_lobbies WHERE ? IN (host_id, guest_id) AND status = 'finished' AND guest_id IS NOT NULL") > 0,
        'minigame' => isset($markers['minigame']) || koobdMissionMetric($userId, "SELECT COALESCE(SUM(plays), 0) FROM minigame_scores WHERE user_id = ?") > 0,
        'message_class' => isset($markers['message_class']) || koobdMissionMetric($userId, "SELECT COUNT(*) FROM classroom_messages WHERE sender_user_id = ?") > 0,
        '_markers' => $markers,
    ];
}

function koobdMissionSpecs(bool $teacher): array
{
    if ($teacher) {
        return [
            [
                'number' => 1,
                'title' => 'Classroom Setup',
                'description' => 'Create the home base where your classes and activities are organized.',
                'objective' => 'Set up a classroom and prepare it for students and activities.',
                'unlocks' => ['Managing Students'],
                'missions' => [
                    [
                        'key' => 'create_classroom',
                        'title' => 'Create your classroom',
                        'description' => 'Create a classroom where your students and activities are organized.',
                        'instruction' => 'Create a classroom and give it a recognizable name.',
                        'location' => 'Classroom from the left navigation',
                        'requirement' => 'A classroom record must exist under your teacher account.',
                        'benefit' => 'A classroom organizes your roster, assignments, reports, and conversations.',
                        'unlocks' => 'The Managing Students stage.',
                        'href' => 'classroom.php',
                    ],
                ],
            ],
            [
                'number' => 2,
                'title' => 'Managing Students',
                'description' => 'Learn how students join and participate in your classroom.',
                'objective' => 'Prepare a classroom activity and invite students when your class is ready.',
                'unlocks' => ['Managing Learning Activities'],
                'missions' => [
                    [
                        'key' => 'add_students',
                        'title' => 'Add students to your class',
                        'description' => 'Share your class code and welcome a student.',
                        'instruction' => 'Open your classroom, find its class code, and share it with a student so they can join.',
                        'location' => 'Classroom roster and class-code controls',
                        'requirement' => 'At least one student account must be linked to one of your classrooms.',
                        'benefit' => 'A roster lets you assign work and review student participation.',
                        'unlocks' => 'Student-specific classroom tools. This task is optional until a student can join.',
                        'href' => 'classroom.php',
                        'optional' => true,
                    ],
                    [
                        'key' => 'assign_reading',
                        'title' => 'Assign a reading activity',
                        'description' => 'Choose a story and publish it as a classroom activity.',
                        'instruction' => 'Create a story-reading activity for one of your classrooms and publish it.',
                        'location' => 'Open a classroom and use its Activities controls',
                        'requirement' => 'A published story activity must belong to one of your classrooms.',
                        'benefit' => 'Reading assignments give students a shared learning task you can monitor.',
                        'unlocks' => 'The Managing Learning Activities stage.',
                        'href' => 'classroom.php',
                    ],
                ],
            ],
            [
                'number' => 3,
                'title' => 'Managing Learning Activities',
                'description' => 'Build activities that support reading and check understanding.',
                'objective' => 'Publish a quiz with questions students can answer.',
                'unlocks' => ['Monitoring Student Development'],
                'missions' => [
                    [
                        'key' => 'create_quiz',
                        'title' => 'Create and publish a quiz',
                        'description' => 'Add questions to a quiz and make it available to your class.',
                        'instruction' => 'Create a quiz activity in a classroom, add at least one question, and publish it.',
                        'location' => 'Open a classroom and use its Activities controls',
                        'requirement' => 'A published quiz in one of your classrooms must contain at least one question.',
                        'benefit' => 'Quizzes let students practice and give you evidence of their understanding.',
                        'unlocks' => 'The Monitoring Student Development stage.',
                        'href' => 'classroom.php',
                        'requires' => 'assign_reading',
                    ],
                ],
            ],
            [
                'number' => 4,
                'title' => 'Monitoring Student Development',
                'description' => 'Use classroom reports to understand student progress and digital wellbeing.',
                'objective' => 'Explore activity results and screen-time reporting.',
                'unlocks' => ['Managing Student-Created Content'],
                'missions' => [
                    [
                        'key' => 'review_progress',
                        'title' => 'Review student progress',
                        'description' => 'Open a classroom activity’s progress view.',
                        'instruction' => 'Choose an activity from a classroom and open its student progress report.',
                        'location' => 'Classroom activity card → View progress',
                        'requirement' => 'Open an authorized teacher progress report; the visit is saved to your account.',
                        'benefit' => 'Progress reports help you identify participation and follow-up needs.',
                        'unlocks' => 'The Managing Student-Created Content stage.',
                        'href' => 'classroom.php',
                        'requires' => 'create_quiz',
                    ],
                    [
                        'key' => 'screen_time',
                        'title' => 'Explore screen-time insights',
                        'description' => 'Review a student’s screen-time report and classroom limits.',
                        'instruction' => 'Open a student’s screen-time report and review its totals and timeline.',
                        'location' => 'Classroom → Screen Time',
                        'requirement' => 'Open a valid screen-time report for a student in one of your classrooms.',
                        'benefit' => 'Screen-time insights help you support healthy and balanced device use.',
                        'unlocks' => 'Screen-time monitoring tools. This task is optional until a student is available.',
                        'href' => 'classroom.php',
                        'optional' => true,
                    ],
                ],
            ],
            [
                'number' => 5,
                'title' => 'Managing Student-Created Content',
                'description' => 'Manage classroom stories and learn how student submissions are reviewed.',
                'objective' => 'Publish classroom story content and review student submissions when available.',
                'unlocks' => ['Classroom story publishing', 'Student story review', 'Classroom messages'],
                'missions' => [
                    [
                        'key' => 'create_class_story',
                        'title' => 'Publish a classroom story',
                        'description' => 'Create a story and publish it for classroom use.',
                        'instruction' => 'Create a story, add its content, then publish it so it is available to your classroom.',
                        'location' => 'My Stories → Create a story',
                        'requirement' => 'At least one story created by your account must have published status.',
                        'benefit' => 'Published stories give your class reading content you can use in activities.',
                        'unlocks' => 'A completed Teaching Journey.',
                        'href' => 'teacher_stories.php',
                        'requires' => 'review_progress',
                    ],
                    [
                        'key' => 'approve_story',
                        'title' => 'Review a student-created story',
                        'description' => 'Preview a student submission and record an approval decision.',
                        'instruction' => 'Enter a student’s submission code, read the story, and approve or reject it.',
                        'location' => 'Review Student Stories from the left navigation',
                        'requirement' => 'An approval or rejection decision must be recorded in your review history.',
                        'benefit' => 'Reviewing stories supports student creativity while keeping shared content appropriate.',
                        'unlocks' => 'Student story approval controls. This task is optional until a submission is available.',
                        'href' => 'approve_stories.php',
                        'optional' => true,
                    ],
                    [
                        'key' => 'message_class',
                        'title' => 'Connect with your classroom',
                        'description' => 'Send a classroom message or reply to a conversation.',
                        'instruction' => 'Open a classroom conversation and send a message or reply.',
                        'location' => 'Open a classroom and use its Messages area',
                        'requirement' => 'A classroom message sent from your teacher account must be recorded.',
                        'benefit' => 'Classroom conversations help keep instructions and support in one place.',
                        'unlocks' => 'Classroom communication tools. This task is optional until a conversation is available.',
                        'href' => 'classroom.php',
                        'optional' => true,
                    ],
                ],
            ],
        ];
    }

    return [
        [
            'number' => 1,
            'title' => 'Getting Started',
            'description' => 'Get comfortable with your account and the places where your learning begins.',
            'objective' => 'Explore your profile and find your classroom when you have one.',
            'unlocks' => ['Reading and Understanding'],
            'missions' => [
                [
                    'key' => 'profile',
                    'title' => 'Explore your profile',
                    'description' => 'Visit your profile and review your account details.',
                    'instruction' => 'Open your Profile and review your name, character, and account details.',
                    'location' => 'Profile menu in the lower-left corner',
                    'requirement' => 'Open the Profile page while signed in; the visit is saved to your account.',
                    'benefit' => 'Knowing your account settings helps you make KoobD feel like your own.',
                    'unlocks' => 'The Reading and Understanding stage.',
                    'href' => 'profile.php',
                ],
                [
                    'key' => 'join_class',
                    'title' => 'Join your classroom',
                    'description' => 'Use your teacher’s class code to join a classroom.',
                    'instruction' => 'Ask your teacher for the class code and use it to join the class.',
                    'location' => 'Classroom from the left navigation',
                    'requirement' => 'Your student account must be linked to at least one classroom.',
                    'benefit' => 'Joining connects you to reading activities and classroom conversations.',
                    'unlocks' => 'Classroom activities when your teacher assigns them. This task is optional if you do not have a class code yet.',
                    'href' => 'classroom.php',
                    'optional' => true,
                ],
            ],
        ],
        [
            'number' => 2,
            'title' => 'Reading and Understanding',
            'description' => 'Read a story, follow its progress, and try a classroom activity if one is assigned.',
            'objective' => 'Read and finish a story before moving on to language tools.',
            'unlocks' => ['Developing Language Skills'],
            'missions' => [
                [
                    'key' => 'read_story',
                    'title' => 'Start your first story',
                    'description' => 'Choose a story and begin reading.',
                    'instruction' => 'Open a story from Home or My Stories and read at least one page.',
                    'location' => 'Home story shelf or My Stories',
                    'requirement' => 'A global story-progress record must show progress greater than zero.',
                    'benefit' => 'Reading progress saves your place so you can continue later.',
                    'unlocks' => 'The next Reading and Understanding mission.',
                    'href' => 'home.php',
                ],
                [
                    'key' => 'finish_story',
                    'title' => 'Finish a story',
                    'description' => 'Read a story through to its final page.',
                    'instruction' => 'Continue a story you started and reach its final page.',
                    'location' => 'Continue from the Home story shelf',
                    'requirement' => 'A global story-progress record must reach 100 percent.',
                    'benefit' => 'Finishing a story builds comprehension and gives you a complete reading experience.',
                    'unlocks' => 'Dictionary and Writing Practice.',
                    'href' => 'home.php',
                    'requires' => 'read_story',
                ],
                [
                    'key' => 'class_activity',
                    'title' => 'Complete a classroom activity',
                    'description' => 'Try an activity your teacher assigned and submit your work.',
                    'instruction' => 'Open a published classroom activity, complete it, and submit your answers.',
                    'location' => 'Classroom → Activities',
                    'requirement' => 'At least one activity submission must be saved for your account.',
                    'benefit' => 'Submitting your work lets your teacher see your progress and offer support.',
                    'unlocks' => 'Classroom learning activities. This task is optional until your teacher assigns work.',
                    'href' => 'classroom.php',
                    'optional' => true,
                ],
            ],
        ],
        [
            'number' => 3,
            'title' => 'Developing Language Skills',
            'description' => 'Use the dictionary and writing workspace to build vocabulary and express ideas.',
            'objective' => 'Try both language tools before creating a story of your own.',
            'unlocks' => ['Creativity and Expression', 'Student Story Creator'],
            'missions' => [
                [
                    'key' => 'dictionary',
                    'title' => 'Look up a word',
                    'description' => 'Use Dictionary to explore a word’s meaning.',
                    'instruction' => 'Search for a word and read the meaning or translation returned.',
                    'location' => 'Profile menu → Dictionary',
                    'requirement' => 'A successful dictionary lookup with a result must be recorded.',
                    'benefit' => 'Looking up unfamiliar words grows vocabulary and reading confidence.',
                    'unlocks' => 'The Writing Practice mission.',
                    'href' => 'dictionary.php',
                ],
                [
                    'key' => 'writing',
                    'title' => 'Create a Writing Practice notepad',
                    'description' => 'Start a notepad and write a few lines of your own.',
                    'instruction' => 'Open Writing Practice, create a notepad, and add your own words.',
                    'location' => 'Profile menu → Writing Practice',
                    'requirement' => 'A student-owned Writing Practice note must exist.',
                    'benefit' => 'Writing helps you practice language and organize your ideas.',
                    'unlocks' => 'The Student Story Creator and Creativity and Expression stage.',
                    'href' => 'writing.php',
                    'requires' => 'dictionary',
                ],
            ],
        ],
        [
            'number' => 4,
            'title' => 'Creativity and Expression',
            'description' => 'Turn your ideas into a story and share it for teacher feedback.',
            'objective' => 'Create a story and submit it for review.',
            'unlocks' => ['Versus Mode'],
            'missions' => [
                [
                    'key' => 'create_story',
                    'title' => 'Create your own story',
                    'description' => 'Start a story and add your own ideas.',
                    'instruction' => 'Open the story creator and start a story with your own title and description.',
                    'location' => 'My Stories → Create a story',
                    'requirement' => 'A story record created by your student account must exist.',
                    'benefit' => 'Story creation gives you a place to practice creativity and communication.',
                    'unlocks' => 'The story-submission step.',
                    'href' => 'create_story.php',
                    'requires' => 'writing',
                ],
                [
                    'key' => 'submit_story',
                    'title' => 'Submit your story for review',
                    'description' => 'Send your story to your teacher for feedback.',
                    'instruction' => 'Submit your completed story from the editor and keep its submission code.',
                    'location' => 'Open your story in My Stories and choose Submit for Review',
                    'requirement' => 'Your story must have a submission code and a submitted, published, unpublished, or rejected review status.',
                    'benefit' => 'Teacher feedback helps you improve your writing and share your ideas safely.',
                    'unlocks' => 'Versus Mode.',
                    'href' => 'teacher_stories.php',
                    'requires' => 'create_story',
                ],
            ],
        ],
        [
            'number' => 5,
            'title' => 'Interactive Learning',
            'description' => 'Practice with classmates in Versus Mode, then try a minigame.',
            'objective' => 'Complete a match before unlocking minigames.',
            'unlocks' => ['Minigames after your first completed Versus match'],
            'missions' => [
                [
                    'key' => 'versus_match',
                    'title' => 'Complete a Versus match',
                    'description' => 'Play a full Versus match with a classmate.',
                    'instruction' => 'Enter Versus Mode, join or start a match with another player, and finish the match.',
                    'location' => 'Versus Mode from the left navigation',
                    'requirement' => 'A finished Versus lobby with both players recorded must exist.',
                    'benefit' => 'A completed match gives you a fun way to practice alongside a classmate.',
                    'unlocks' => 'Minigames.',
                    'href' => 'versus.php',
                    'requires' => 'submit_story',
                ],
                [
                    'key' => 'minigame',
                    'title' => 'Play your first minigame',
                    'description' => 'Choose an available minigame and play once.',
                    'instruction' => 'Open Minigames after completing Versus and play any available game.',
                    'location' => 'Profile menu → Minigames',
                    'requirement' => 'Your minigame play record must show at least one play.',
                    'benefit' => 'Minigames offer another way to reinforce skills through short challenges.',
                    'unlocks' => 'The full KOOB\'D Interactive Learning collection.',
                    'href' => 'minigames.php',
                    'requires' => 'versus_match',
                ],
                [
                    'key' => 'message_class',
                    'title' => 'Connect with your classroom',
                    'description' => 'Send a message or comment on a classroom activity.',
                    'instruction' => 'Open a classroom conversation or activity and send a message or comment.',
                    'location' => 'Classroom → Messages or Activities',
                    'requirement' => 'A message sent from your student account must be recorded.',
                    'benefit' => 'Classroom communication helps you ask questions and share progress.',
                    'unlocks' => 'Classroom messaging. This task is optional until a conversation is available.',
                    'href' => 'classroom.php',
                    'optional' => true,
                ],
            ],
        ],
    ];
}

function koobdMissionStageIcon(int $stageNumber, bool $teacher): string
{
    $studentIcons = [
        1 => '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/><path d="m16 4 2 2"/>',
        2 => '<path d="M12 7v14"/><path d="M12 7c-2-2-5-3-9-3v14c4 0 7 1 9 3"/><path d="M12 7c2-2 5-3 9-3v14c-4 0-7 1-9 3"/>',
        3 => '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h3"/><path d="m16 15 3 3"/>',
        4 => '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
        5 => '<path d="M7.5 6h9A5.5 5.5 0 0 1 22 11.5v1.5a4 4 0 0 1-7.2 2.4L14 14.5h-4l-.8.9A4 4 0 0 1 2 13v-1.5A5.5 5.5 0 0 1 7.5 6z"/><path d="M6 10v4M4 12h4"/><circle cx="16" cy="11" r=".7"/><circle cx="18" cy="13" r=".7"/>',
    ];
    $teacherIcons = [
        1 => '<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6M9 10h.01M15 10h.01"/>',
        2 => '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1z"/><circle cx="17" cy="9" r="2"/><path d="M17 14a5 5 0 0 1 4 5v1h-3"/>',
        3 => '<path d="M8 4h8l2 2h3v15H3V6h3z"/><path d="M8 4v4h8V4M7 13h10M7 17h7"/>',
        4 => '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
        5 => '<path d="M4 4h11a4 4 0 0 1 4 4v12H8a4 4 0 0 0-4 4z"/><path d="M4 4v16a4 4 0 0 1 4-4h11M9 9h6M9 12h4"/>',
    ];

    $icons = $teacher ? $teacherIcons : $studentIcons;
    $paths = $icons[$stageNumber] ?? $icons[1];
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' . $paths . '</svg>';
}

function koobdMissionFirstRow(int $userId, string $sql): ?array
{
    global $conn;
    if ($userId <= 0) {
        return null;
    }
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        error_log('Unable to prepare a journey destination lookup.');
        return null;
    }
    $stmt->bind_param('i', $userId);
    if (!$stmt->execute()) {
        $stmt->close();
        error_log('Unable to load a journey destination.');
        return null;
    }
    $row = $stmt->get_result()->fetch_assoc() ?: null;
    $stmt->close();
    return $row;
}

function koobdMissionOverview(array $user): array
{
    $teacher = koobdIsTeacher($user);
    $userId = (int)($user['id'] ?? 0);
    $facts = koobdMissionFacts($user);
    $stages = koobdMissionSpecs($teacher);
    $classroom = koobdMissionFirstRow($userId, $teacher
        ? "SELECT id FROM classrooms WHERE teacher_id = ? ORDER BY id LIMIT 1"
        : "SELECT classroom_id AS id FROM classroom_students WHERE student_user_id = ? ORDER BY classroom_id LIMIT 1");

    if ($teacher) {
        $classId = (int)($classroom['id'] ?? 0);
        $studentRow = koobdMissionFirstRow($userId,
            "SELECT cs.classroom_id, cs.student_user_id
             FROM classroom_students cs
             INNER JOIN classrooms c ON c.id = cs.classroom_id
             WHERE c.teacher_id = ?
             ORDER BY cs.classroom_id, cs.student_user_id
             LIMIT 1"
        );
        $activity = koobdMissionFirstRow($userId,
            "SELECT ca.id, ca.classroom_id, ca.activity_type
             FROM classroom_activities ca
             INNER JOIN classrooms c ON c.id = ca.classroom_id
             WHERE c.teacher_id = ?
             ORDER BY ca.id
             LIMIT 1"
        );
        $pendingStory = koobdMissionFirstRow($userId,
            "SELECT submission_code FROM teacher_stories
             WHERE teacher_id <> ? AND status = 'pending_approval' AND submission_code IS NOT NULL
             ORDER BY updated_at DESC, id DESC
             LIMIT 1"
        );
        foreach ($stages as &$stage) {
            foreach ($stage['missions'] as &$mission) {
                switch ($mission['key']) {
                    case 'create_classroom':
                        $mission['href'] = 'classroom.php?journey_action=create_classroom';
                        break;
                    case 'add_students':
                        $mission['href'] = $classId > 0
                            ? 'teacher_classroom.php?id=' . $classId . '#class-code'
                            : 'classroom.php?journey_action=create_classroom';
                        break;
                    case 'assign_reading':
                        $mission['href'] = $classId > 0
                            ? 'teacher_classroom.php?id=' . $classId . '#activity-form'
                            : 'classroom.php?journey_action=create_classroom';
                        break;
                    case 'create_quiz':
                        $mission['href'] = $classId > 0
                            ? 'teacher_quiz_editor.php?classroom=' . $classId
                            : 'classroom.php?journey_action=create_classroom';
                        break;
                    case 'review_progress':
                        if ($activity) {
                            $mission['href'] = $activity['activity_type'] === 'quiz'
                                ? 'teacher_quiz_results.php?activity=' . (int)$activity['id']
                                : 'teacher_activity_progress.php?activity=' . (int)$activity['id'];
                        } else {
                            $mission['href'] = $classId > 0
                                ? 'teacher_classroom.php?id=' . $classId . '#activities'
                                : 'classroom.php?journey_action=create_classroom';
                        }
                        break;
                    case 'screen_time':
                        $mission['href'] = $studentRow
                            ? 'teacher_screen_time.php?classroom=' . (int)$studentRow['classroom_id'] . '&student=' . (int)$studentRow['student_user_id']
                            : ($classId > 0
                                ? 'teacher_classroom.php?id=' . $classId . '#screen-time'
                                : 'classroom.php?journey_action=create_classroom');
                        break;
                    case 'create_class_story':
                        $mission['href'] = 'teacher_create_story.php';
                        break;
                    case 'approve_story':
                        $mission['href'] = !empty($pendingStory['submission_code'])
                            ? 'approve_stories.php?code=' . rawurlencode((string)$pendingStory['submission_code'])
                            : 'approve_stories.php';
                        break;
                    case 'message_class':
                        $mission['href'] = $studentRow
                            ? 'teacher_classroom.php?id=' . (int)$studentRow['classroom_id'] . '&chat=' . (int)$studentRow['student_user_id']
                            : ($classId > 0
                                ? 'teacher_classroom.php?id=' . $classId
                                : 'classroom.php?journey_action=create_classroom');
                        break;
                }
            }
            unset($mission);
        }
        unset($stage);
    } else {
        $unfinishedStory = koobdMissionFirstRow($userId,
            "SELECT story_id FROM story_progress
             WHERE user_id = ? AND progress_context = 'global' AND progress > 0 AND progress < 100
             ORDER BY last_read_at DESC
             LIMIT 1"
        );
        $studentStory = koobdMissionFirstRow($userId,
            "SELECT id FROM teacher_stories WHERE teacher_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1"
        );
        foreach ($stages as &$stage) {
            foreach ($stage['missions'] as &$mission) {
                switch ($mission['key']) {
                    case 'join_class':
                        $mission['href'] = 'classroom.php#join-classroom';
                        break;
                    case 'read_story':
                        $mission['href'] = 'home.php#shelfClassicTitle';
                        break;
                    case 'finish_story':
                        $storyKey = (string)($unfinishedStory['story_id'] ?? 'book1');
                        $story = koobdStoryCatalog()[$storyKey] ?? koobdStoryCatalog()['book1'];
                        $mission['href'] = (string)$story['href'] . '?resume=1';
                        break;
                    case 'class_activity':
                        $mission['href'] = (int)($classroom['id'] ?? 0) > 0
                            ? 'classroom_room.php?id=' . (int)$classroom['id']
                            : 'classroom.php#join-classroom';
                        break;
                    case 'writing':
                        $mission['href'] = 'writing.php';
                        break;
                    case 'create_story':
                        $mission['href'] = 'teacher_create_story.php';
                        break;
                    case 'submit_story':
                        $mission['href'] = $studentStory
                            ? 'teacher_story_editor.php?id=' . (int)$studentStory['id']
                            : 'teacher_stories.php';
                        break;
                    case 'versus_match':
                        $mission['href'] = 'versus.php';
                        break;
                    case 'minigame':
                        $mission['href'] = 'word_catch.php';
                        break;
                    case 'message_class':
                        $mission['href'] = (int)($classroom['id'] ?? 0) > 0
                            ? 'classroom_room.php?id=' . (int)$classroom['id'] . '#classroomMessages'
                            : 'classroom.php#join-classroom';
                        break;
                }
            }
            unset($mission);
        }
        unset($stage);
    }
    $missionSpecs = [];
    $stageForMission = [];
    foreach ($stages as $stageIndex => $stage) {
        foreach ($stage['missions'] as $mission) {
            $missionSpecs[$mission['key']] = $mission;
            $stageForMission[$mission['key']] = $stageIndex;
        }
    }

    $completed = [];
    foreach ($missionSpecs as $key => $mission) {
        $completed[$key] = !empty($facts[$key]);
        if ($completed[$key] && empty($facts['_markers'][$key])) {
            koobdMissionRecord($user, $key);
        }
    }

    $stageStates = [];
    $allMissions = [];
    $requiredCompleted = 0;
    $requiredTotal = 0;
    $currentStage = null;
    $nextMission = null;
    $missionNumber = 0;

    foreach ($stages as $stageIndex => $stage) {
        $requiredMissions = array_values(array_filter(
            $stage['missions'],
            static fn(array $mission): bool => empty($mission['optional'])
        ));
        $doneInStage = 0;
        foreach ($requiredMissions as $mission) {
            if ($completed[$mission['key']]) {
                $doneInStage++;
            }
        }
        $stageComplete = $doneInStage === count($requiredMissions);
        $priorStagesComplete = true;
        for ($priorIndex = 0; $priorIndex < $stageIndex; $priorIndex++) {
            if (empty($stageStates[$priorIndex]['completed'])) {
                $priorStagesComplete = false;
                break;
            }
        }

        $stage['completed'] = $stageComplete;
        $stage['locked'] = !$priorStagesComplete;
        $stage['status'] = $stage['locked'] ? 'locked' : ($stageComplete ? 'completed' : 'in_progress');
        $stage['completed_missions'] = $doneInStage;
        $stage['total_missions'] = count($requiredMissions);
        $stage['progress'] = $stage['total_missions'] > 0
            ? (int)round($doneInStage / $stage['total_missions'] * 100)
            : 100;
        if ($stage['locked']) {
            $previous = $stages[$stageIndex - 1];
            $stage['lock_reason'] = 'Complete Stage ' . (int)$previous['number'] . ': ' . $previous['title'] . ' first.';
        } else {
            $stage['lock_reason'] = '';
        }
        if (!$stage['locked'] && !$stageComplete && $currentStage === null) {
            $currentStage = [
                'number' => $stage['number'],
                'title' => $stage['title'],
                'description' => $stage['description'],
                'progress' => $stage['progress'],
                'completed_missions' => $stage['completed_missions'],
                'total_missions' => $stage['total_missions'],
            ];
        }

        $stageMissionList = [];
        foreach ($stage['missions'] as $mission) {
            $key = $mission['key'];
            $missionNumber++;
            $lockedByStage = $stage['locked'];
            $lockedByRequirement = isset($mission['requires']) && empty($completed[$mission['requires']]);
            $mission['completed'] = $completed[$key];
            $mission['locked'] = !$mission['completed'] && ($lockedByStage || $lockedByRequirement);
            if ($mission['completed']) {
                $mission['status'] = 'completed';
                $mission['lock_reason'] = '';
            } elseif ($lockedByStage) {
                $mission['status'] = 'locked';
                $mission['lock_reason'] = $stage['lock_reason'];
            } elseif ($lockedByRequirement) {
                $requiredMission = $missionSpecs[$mission['requires']] ?? null;
                $mission['status'] = 'locked';
                $mission['lock_reason'] = 'Complete "' . (string)($requiredMission['title'] ?? 'the previous mission') . '" first.';
            } elseif ($mission['optional'] ?? false) {
                $mission['status'] = 'available';
                $mission['lock_reason'] = '';
            } elseif ($nextMission === null) {
                $mission['status'] = 'in_progress';
                $mission['lock_reason'] = '';
                $nextMission = $mission;
            } else {
                $mission['status'] = 'available';
                $mission['lock_reason'] = '';
            }
            $mission['number'] = $missionNumber;
            $mission['stage_number'] = $stage['number'];
            $mission['stage_title'] = $stage['title'];
            $mission['is_optional'] = !empty($mission['optional']);
            $stageMissionList[] = $mission;
            $allMissions[] = $mission;
        }
        $stage['missions'] = $stageMissionList;
        $stageStates[$stageIndex] = $stage;
        $requiredCompleted += $doneInStage;
        $requiredTotal += count($requiredMissions);
    }

    $stageStates = array_values($stageStates);
    $firstIncompleteStage = null;
    foreach ($stageStates as $stage) {
        if (!$stage['completed']) {
            $firstIncompleteStage = $stage;
            break;
        }
    }
    $percentage = $requiredTotal > 0 ? (int)round($requiredCompleted / $requiredTotal * 100) : 100;
    $unlocks = $teacher ? [
        'versus' => true,
        'minigames' => true,
        'learning_tools' => true,
        'story_creation' => true,
    ] : [
        'learning_tools' => !empty($stageStates[1]['completed']),
        'story_creation' => !empty($stageStates[2]['completed']),
        'versus' => !empty($stageStates[3]['completed']),
        'minigames' => !empty($completed['versus_match']),
    ];

    return [
        'role' => $teacher ? 'teacher' : 'student',
        'journey_title' => $teacher ? 'My Teaching Journey' : 'My Learning Journey',
        'stages' => $stageStates,
        'missions' => $allMissions,
        'completed' => $requiredCompleted,
        'total' => $requiredTotal,
        'percentage' => $percentage,
        'current_stage' => $currentStage ?? ($firstIncompleteStage ? [
            'number' => $firstIncompleteStage['number'],
            'title' => $firstIncompleteStage['title'],
            'description' => $firstIncompleteStage['description'],
            'progress' => $firstIncompleteStage['progress'],
            'completed_missions' => $firstIncompleteStage['completed_missions'],
            'total_missions' => $firstIncompleteStage['total_missions'],
        ] : null),
        'next' => $nextMission,
        'unlocks' => $unlocks,
    ];
}

function koobdMissionRequireFeature(array $user, string $feature, bool $jsonResponse = false): void
{
    if (koobdIsTeacher($user)) {
        return;
    }
    $overview = koobdMissionOverview($user);
    $unlocked = !empty($overview['unlocks'][$feature]);
    if ($unlocked) {
        return;
    }
    $featureNames = [
        'versus' => 'Versus Mode',
        'minigames' => 'Minigames',
        'learning_tools' => 'Dictionary and Writing Practice',
        'story_creation' => 'the Student Story Creator',
    ];
    $message = 'Complete the required journey missions to unlock ' . ($featureNames[$feature] ?? 'this feature') . '.';
    if ($jsonResponse) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'locked' => true, 'feature' => $feature, 'message' => $message]);
        exit();
    }
    header('Location: home.php#goalsMissions');
    exit();
}
