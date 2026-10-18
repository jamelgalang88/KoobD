<?php
// A teacher's classroom: its activities (each assigns a story; add, edit,
// reorder and delete them here) and every student's progress in each one -
// an overview of all activities, or one activity's detail (?activity=<id>).
require_once('teacher_auth.php');
$teacher = koobdTeacherRequireAuth(true);
$username = $teacher['username'];
$profile = koobdResolvedTeacherProfile($teacher);
$classroomId = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$profileEditPath = 'profile.php';
$room = null;

if ($classroomId <= 0) {
    header("Location: classroom.php");
    exit();
}

$stmt = $conn->prepare(
    "SELECT * FROM classrooms WHERE id = ? AND teacher_id = ? LIMIT 1"
);
$stmt->bind_param("ii", $classroomId, $teacher['id']);
$stmt->execute();
$result = $stmt->get_result();
$room = $result ? $result->fetch_assoc() : null;
$stmt->close();

if (!$room) {
    header("Location: classroom.php");
    exit();
}

$roomHref = 'teacher_classroom.php?id=' . $classroomId;
$assignableStories = koobdAssignableStoriesForTeacher((int)$teacher['id']);

// The activity form's fields, checked: a title (optional: the story's title is
// used), a story the teacher may assign, instructions and a due date.
$readActivityForm = static function () use ($assignableStories): ?array {
    $storyId = trim((string)($_POST['story_id'] ?? ''));
    if (!isset($assignableStories[$storyId])) {
        return null;
    }
    $title = trim((string)($_POST['activity_title'] ?? ''));
    $title = function_exists('mb_substr') ? mb_substr($title, 0, 255) : substr($title, 0, 255);
    $instructions = trim((string)($_POST['instructions'] ?? ''));
    $instructions = function_exists('mb_substr') ? mb_substr($instructions, 0, 2000) : substr($instructions, 0, 2000);
    $due = trim((string)($_POST['due_date'] ?? ''));
    $dueDate = preg_match('/^\d{4}-\d{2}-\d{2}$/', $due) && strtotime($due) ? $due : null;
    return ['title' => $title, 'story_id' => $storyId, 'instructions' => $instructions !== '' ? $instructions : null, 'due_date' => $dueDate];
};

// The activity with this id, if it is in this classroom.
$ownActivityId = static function (int $activityId) use ($conn, $classroomId): int {
    $check = $conn->prepare("SELECT id FROM classroom_activities WHERE id = ? AND classroom_id = ? LIMIT 1");
    $check->bind_param("ii", $activityId, $classroomId);
    $check->execute();
    $found = $check->get_result()->fetch_assoc();
    $check->close();
    return $found ? (int)$found['id'] : 0;
};

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = (string)($_POST['action'] ?? '');
    $flash = '';

    if ($action === 'add_activity') {
        $fields = $readActivityForm();
        if ($fields) {
            $next = $conn->prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM classroom_activities WHERE classroom_id = ?");
            $next->bind_param("i", $classroomId);
            $next->execute();
            $position = (int)($next->get_result()->fetch_assoc()['next_position'] ?? 1);
            $next->close();

            $insert = $conn->prepare(
                "INSERT INTO classroom_activities (classroom_id, title, instructions, story_id, due_date, position) VALUES (?, ?, ?, ?, ?, ?)"
            );
            $insert->bind_param("issssi", $classroomId, $fields['title'], $fields['instructions'], $fields['story_id'], $fields['due_date'], $position);
            $insert->execute();
            $insert->close();
            $flash = 'added';
        } else {
            $flash = 'invalid';
        }
    } elseif ($action === 'update_activity') {
        $activityId = $ownActivityId((int)($_POST['activity_id'] ?? 0));
        $typeCheck = $activityId > 0 ? koobdTeacherActivity($activityId, (int)$teacher['id']) : null;
        if ($typeCheck && ($typeCheck['activity_type'] ?? 'story') === 'quiz') {
            $activityId = 0;
        }
        $fields = $readActivityForm();
        if ($activityId > 0 && $fields) {
            $update = $conn->prepare(
                "UPDATE classroom_activities SET title = ?, instructions = ?, story_id = ?, due_date = ? WHERE id = ? AND classroom_id = ?"
            );
            $update->bind_param("ssssii", $fields['title'], $fields['instructions'], $fields['story_id'], $fields['due_date'], $activityId, $classroomId);
            $update->execute();
            $update->close();
            $flash = 'updated';
        } else {
            $flash = 'invalid';
        }
    } elseif ($action === 'delete_activity') {
        $activityId = $ownActivityId((int)($_POST['activity_id'] ?? 0));
        if ($activityId > 0) {
            koobdDeleteActivityProgress([$activityId]);
            $delete = $conn->prepare("DELETE FROM classroom_activities WHERE id = ? AND classroom_id = ?");
            $delete->bind_param("ii", $activityId, $classroomId);
            $delete->execute();
            $delete->close();
            $flash = 'deleted';
        }
    } elseif ($action === 'move_activity') {
        // Up or down one place: number them in their order, then swap the two.
        $activityId = $ownActivityId((int)($_POST['activity_id'] ?? 0));
        $order = array_map(static fn($activity) => (int)$activity['id'], koobdClassroomActivities($classroomId));
        $index = array_search($activityId, $order, true);
        $target = ($_POST['direction'] ?? '') === 'up' ? $index - 1 : $index + 1;
        if ($activityId > 0 && $index !== false && isset($order[$target])) {
            [$order[$index], $order[$target]] = [$order[$target], $order[$index]];
            $renumber = $conn->prepare("UPDATE classroom_activities SET position = ? WHERE id = ? AND classroom_id = ?");
            foreach ($order as $position => $id) {
                $place = count($order) - $position;
                $renumber->bind_param("iii", $place, $id, $classroomId);
                $renumber->execute();
            }
            $renumber->close();
        }
    }

    header('Location: ' . $roomHref . ($flash !== '' ? '&done=' . $flash : '') . '#activities');
    exit();
}

$activities = koobdClassroomActivities($classroomId);
$activityById = [];
foreach ($activities as $index => $activity) {
    $activities[$index]['number'] = $index + 1;
    $activityById[$activity['id']] = $activities[$index];
}

$editingActivity = isset($_GET['edit']) ? ($activityById[(int)$_GET['edit']] ?? null) : null;
if ($editingActivity && $editingActivity['type'] === 'quiz') {
    header('Location: teacher_quiz_editor.php?activity=' . (int)$editingActivity['id']);
    exit();
}
$quizIds = array_column(array_filter($activities, static fn($activity) => $activity['type'] === 'quiz'), 'id');
// Question counts for the question activities.
$questionCounts = [];
if ($quizIds) {
    $countResult = $conn->query(
        "SELECT activity_id, COUNT(*) AS total FROM activity_questions WHERE activity_id IN (" . implode(',', array_map('intval', $quizIds)) . ") GROUP BY activity_id"
    );
    while ($countResult && ($row = $countResult->fetch_assoc())) {
        $questionCounts[(int)$row['activity_id']] = (int)$row['total'];
    }
}
$focusActivity = isset($_GET['activity']) ? ($activityById[(int)$_GET['activity']] ?? null) : null;
if ($focusActivity && $focusActivity['type'] === 'quiz') {
    header('Location: teacher_quiz_results.php?activity=' . (int)$focusActivity['id']);
    exit();
}

// The classroom's students, in the order they joined.
$students = [];
$studentStmt = $conn->prepare(
    "SELECT u.id, u.username, u.selected_reader, u.profile_reader_name, u.profile_badge_label,
            u.profile_top_color, u.profile_bottom_color, u.profile_accent_color, u.profile_card_style,
            u.profile_scale, u.user_role
     FROM classroom_students cs
     INNER JOIN users u ON u.id = cs.student_user_id
     WHERE cs.classroom_id = ?
     ORDER BY cs.joined_at ASC"
);
$studentStmt->bind_param("i", $classroomId);
$studentStmt->execute();
$studentResult = $studentStmt->get_result();
while ($studentResult && ($row = $studentResult->fetch_assoc())) {
    $studentProfile = koobdResolvedProfile($row);
    $students[] = [
        'id' => (int)$row['id'],
        'name' => $row['username'],
        'profile' => $studentProfile['name'],
        'asset' => $studentProfile['asset'],
        'top' => $studentProfile['top'],
        'bottom' => $studentProfile['bottom'],
    ];
}
$studentStmt->close();

// Each student's progress in each activity, and each activity's summary. A
// question activity is complete once submitted; its average is the average
// score of those who submitted.
$progressMap = koobdActivityProgressMap(array_filter($activities, static fn($activity) => $activity['type'] === 'story'), array_column($students, 'id'));
$quizMap = koobdQuizSubmissionMap($quizIds, array_column($students, 'id'));
$studentCount = count($students);
foreach ($activities as $index => $activity) {
    if ($activity['type'] === 'quiz') {
        $submitted = $quizMap[$activity['id']] ?? [];
        $progressMap[$activity['id']] = array_map(static fn() => 100, $submitted);
        $activities[$index]['started'] = count($submitted);
        $activities[$index]['completed'] = count($submitted);
        $activities[$index]['average'] = $submitted ? (int)round(array_sum(array_column($submitted, 'percent')) / count($submitted)) : 0;
        $activities[$index]['questions'] = $questionCounts[$activity['id']] ?? 0;
        continue;
    }
    $values = $progressMap[$activity['id']] ?? [];
    $completed = count(array_filter($values, static fn($value) => $value >= 100));
    $activities[$index]['started'] = count($values);
    $activities[$index]['completed'] = $completed;
    $activities[$index]['average'] = $studentCount > 0 ? (int)round(array_sum($values) / $studentCount) : 0;
}
$resultsHref = static fn(array $activity): string => 'teacher_quiz_results.php?activity=' . (int)$activity['id'];

$statusText = static function (?int $progress): string {
    if ($progress === null) {
        return 'Not started';
    }
    return $progress >= 100 ? 'Completed' : 'In progress';
};
$dueLabel = static fn(string $date): string => $date !== '' ? date('M j, Y', strtotime($date)) : '';

$flashMessages = [
    'added' => 'Activity added. Students in this classroom can open it now.',
    'updated' => 'Activity saved.',
    'deleted' => 'Activity deleted.',
    'created' => 'Classroom created. Share the class code with your students, then add activities.',
    'invalid' => 'Choose a story for the activity.',
];
$flash = $flashMessages[(string)($_GET['done'] ?? '')] ?? '';
$classics = array_filter($assignableStories, static fn($story) => ($story['type'] ?? '') !== 'teacher_story');
$ownStories = array_filter($assignableStories, static fn($story) => ($story['type'] ?? '') === 'teacher_story');
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <script src="<?= koobdAsset('js/i18n-tl.js') ?>"></script>
  <script src="<?= koobdAsset('js/i18n.js') ?>"></script>
  <script src="<?= koobdAsset('js/performance-mode.js') ?>"></script>
  <link rel="stylesheet" href="<?= koobdAsset('css/scrollbar.css') ?>">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KoobD - Teacher Classroom</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/app.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/classroom.css') ?>">
  <link rel="icon" type="image/png" href="assets/images/icons/favicon.png">
  <?php // Installable as an app (manifest.webmanifest): opens without the address bar. ?>
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#f3f8ff">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="KoobD">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link rel="apple-touch-icon" href="assets/images/icons/app/apple-touch-icon.png">
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
</head>
<body class="app-bg classroom-page">
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-inner">
        <div class="sidebar-top">
          <div class="sidebar-brand-mark">
            <img src="assets/images/logos/logo.png" alt="KoobD">
          </div>
          <div class="sidebar-brand-text">KoobD</div>
          <div class="sidebar-divider"></div>

          <nav class="sidebar-nav" aria-label="Main navigation">
            <a href="home.php" class="sidebar-link">
              <div class="sidebar-icon-box">
                <img src="assets/images/icons/HOME 1.png" alt="">
              </div>
            </a>
            <a href="classroom.php" class="sidebar-link active">
              <div class="sidebar-icon-box">
                <img src="assets/images/icons/classroom 1.png" alt="">
              </div>
            </a>
            <a href="teacher_stories.php" class="sidebar-link sidebar-link-stories" aria-label="My Stories" title="My Stories">
              <div class="sidebar-icon-box">
                <svg class="sidebar-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H19v-5"/><path d="M8.5 7.5h6M8.5 11h4"/></svg>
              </div>
            </a>
            <a href="create_story.php" class="sidebar-link sidebar-link-add" aria-label="Create story">
              <div class="sidebar-icon-box sidebar-icon-add">+</div>
            </a>
          </nav>
        </div>

        <div class="sidebar-bottom">
          <div class="sidebar-account sidebar-profile-menu">
            <button type="button" class="sidebar-profile-link" aria-haspopup="true" aria-expanded="false" aria-controls="sidebarProfileMenu" aria-label="Profile menu" title="Profile">
              <span
                class="sidebar-profile-card"
                style="--profile-top:<?= htmlspecialchars($profile['top']) ?>; --profile-bottom:<?= htmlspecialchars($profile['bottom']) ?>; --profile-accent:<?= htmlspecialchars($profile['accent']) ?>;"
              >
                <span class="sidebar-profile-avatar">
                  <img src="<?= htmlspecialchars($profile['asset']) ?>" alt="<?= htmlspecialchars($profile['name']) ?>">
                </span>
                <span class="sidebar-profile-name" translate="no"><?= htmlspecialchars($profile['name']) ?></span>
              </span>
            </button>
            <div class="sidebar-profile-popover" id="sidebarProfileMenu" hidden>
              <a href="<?= htmlspecialchars($profileEditPath) ?>" class="sidebar-profile-menu-item">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
                <span>My Profile</span>
              </a>
              <form action="logout.php" method="post" class="sidebar-menu-logout-form">
                <button type="submit" class="sidebar-profile-menu-item is-logout">
                  <img src="assets/images/icons/LOGOUT 1.png" alt="">
                  <span>Log out</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <main class="main">
      <div class="main-inner">
        <section class="classroom-room-shell teacher-room-shell">
          <div
            class="classroom-room-hero teacher-room-hero"
            style="--room-top:<?= htmlspecialchars($profile['top']) ?>; --room-bottom:<?= htmlspecialchars($profile['bottom']) ?>;"
          >
            <div class="classroom-room-hero-copy">
              <a class="classroom-room-back" href="classroom.php">Back to classroom</a>
              <div class="classroom-room-kicker">Teacher classroom</div>
              <h1 class="classroom-room-title" translate="no"><?= htmlspecialchars($room['title']) ?></h1>
              <?php if (!empty($room['class_code'])): ?>
                <div class="classroom-room-code">Class code: <?= htmlspecialchars($room['class_code']) ?></div>
              <?php endif; ?>
              <div class="activity-hero-stats">
                <span><strong><?= count($activities) ?></strong> <?= count($activities) === 1 ? 'activity' : 'activities' ?></span>
                <span><strong><?= $studentCount ?></strong> <?= $studentCount === 1 ? 'student' : 'students' ?></span>
              </div>
            </div>
            <div class="classroom-room-teacher">
              <div class="classroom-room-teacher-avatar">
                <img src="<?= htmlspecialchars($profile['asset']) ?>" alt="<?= htmlspecialchars($profile['name']) ?>">
              </div>
              <div class="classroom-room-teacher-meta">
                <div class="classroom-room-teacher-label">Teacher</div>
                <div class="classroom-room-teacher-name" translate="no"><?= htmlspecialchars($profile['name']) ?></div>
              </div>
            </div>
          </div>

          <?php if ($flash !== ''): ?>
            <div class="classroom-teacher-status activity-flash" role="status"><?= htmlspecialchars($flash) ?></div>
          <?php endif; ?>

          <?php // A story activity is added, or edited (?edit=<id>), in a popup opened from "+ Story activity". ?>
          <div class="activity-form-modal<?= $editingActivity ? ' is-open' : '' ?>" id="activityFormModal" aria-hidden="<?= $editingActivity ? 'false' : 'true' ?>">
            <article class="classroom-room-panel activity-form-panel" id="activity-form" role="dialog" aria-modal="true" aria-labelledby="activityFormTitle">
                <button type="button" class="activity-form-close" data-close-activity-form aria-label="Close">&times;</button>
                <div class="classroom-room-panel-kicker"><?= $editingActivity ? 'Edit story activity' : 'New story activity' ?></div>
                <h2 class="teacher-room-side-title" id="activityFormTitle"><?= $editingActivity ? 'Edit activity' : 'Add a story activity' ?></h2>
                <p class="teacher-room-side-copy">Each story activity assigns one story for your students to read or play. Add as many as you need; every student in this classroom gets them all.</p>

                <form method="post" action="<?= htmlspecialchars($roomHref) ?>" class="classroom-teacher-form activity-form-grid">
                  <input type="hidden" name="action" value="<?= $editingActivity ? 'update_activity' : 'add_activity' ?>">
                  <?php if ($editingActivity): ?>
                    <input type="hidden" name="activity_id" value="<?= (int)$editingActivity['id'] ?>">
                  <?php endif; ?>

                  <div class="classroom-teacher-field">
                    <label for="activity_story">Story</label>
                    <select id="activity_story" name="story_id" required>
                      <option value="" disabled<?= $editingActivity ? '' : ' selected' ?>>Choose a story</option>
                      <?php foreach (['KoobD Classics' => $classics, 'Your stories' => $ownStories] as $groupLabel => $group): ?>
                        <?php if (!empty($group)): ?>
                          <optgroup label="<?= htmlspecialchars($groupLabel) ?>">
                            <?php foreach ($group as $story): ?>
                              <option value="<?= htmlspecialchars($story['id']) ?>"<?= ($editingActivity && $editingActivity['story_id'] === (string)$story['id']) ? ' selected' : '' ?>>
                                <?= htmlspecialchars($story['title']) ?> (<?= koobdStoryMode($story) === 'platform' ? 'Platform Mode' : 'Story Mode' ?>)
                              </option>
                            <?php endforeach; ?>
                          </optgroup>
                        <?php endif; ?>
                      <?php endforeach; ?>
                    </select>
                  </div>

                  <div class="classroom-teacher-field">
                    <label for="activity_title">Activity title <span class="activity-optional">(optional)</span></label>
                    <input id="activity_title" name="activity_title" type="text" maxlength="255" placeholder="The story's title" value="<?= htmlspecialchars($editingActivity['raw_title'] ?? '') ?>">
                  </div>

                  <div class="classroom-teacher-field activity-form-wide">
                    <label for="activity_instructions">Instructions <span class="activity-optional">(optional)</span></label>
                    <textarea id="activity_instructions" name="instructions" rows="3" maxlength="2000" placeholder="Example: Read to the end and think about the hare's choice."><?= htmlspecialchars($editingActivity['instructions'] ?? '') ?></textarea>
                  </div>

                  <div class="classroom-teacher-field">
                    <label for="activity_due">Due date <span class="activity-optional">(optional)</span></label>
                    <input id="activity_due" name="due_date" type="date" value="<?= htmlspecialchars($editingActivity['due_date'] ?? '') ?>">
                  </div>

                  <div class="activity-form-actions activity-form-wide">
                    <button type="button" class="classroom-teacher-btn classroom-teacher-btn-secondary" data-close-activity-form>Cancel</button>
                    <button class="classroom-teacher-btn" type="submit"><?= $editingActivity ? 'Save Activity' : 'Add Activity' ?></button>
                  </div>
                </form>
            </article>
          </div>

          <div class="classroom-room-grid teacher-room-grid is-full">
            <div class="classroom-room-main">
              <article class="classroom-stream-card" id="activities">
                <div class="classroom-stream-head">
                  <div>
                    <div class="classroom-room-panel-kicker">Activities</div>
                    <h2>Classroom activities</h2>
                  </div>
                  <div class="activity-add-actions">
                    <a class="classroom-teacher-btn activity-add-btn" href="<?= htmlspecialchars($roomHref) ?>#activity-form" data-open-activity-form aria-haspopup="dialog">+ Story activity</a>
                    <a class="classroom-teacher-btn activity-add-btn is-quiz" href="teacher_quiz_editor.php?classroom=<?= (int)$classroomId ?>">+ Quiz activity</a>
                  </div>
                </div>

                <?php if (empty($activities)): ?>
                  <div class="activity-empty">
                    <div class="classroom-empty-title">No activities yet</div>
                    <p class="classroom-stream-copy">Add the first activity: a story for your students to read or play, or a quiz of multiple choice and true or false questions. You can keep adding activities to this same classroom.</p>
                  </div>
                <?php else: ?>
                  <ol class="activity-list">
                    <?php foreach ($activities as $index => $activity): ?>
                      <?php $story = $activity['story']; ?>
                      <li class="activity-card<?= $activity['type'] === 'quiz' ? ' is-quiz' : '' ?><?= $focusActivity && $focusActivity['id'] === $activity['id'] ? ' is-focused' : '' ?>">
                        <div class="activity-card-number" aria-hidden="true"><?= (int)$activity['number'] ?></div>
                        <div class="activity-card-body">
                          <div class="activity-card-head">
                            <h3 class="activity-card-title" translate="no"><?= htmlspecialchars($activity['title']) ?></h3>
                            <div class="classroom-story-menu-wrap activity-card-menu">
                              <button type="button" class="classroom-story-menu-btn" aria-label="Manage <?= htmlspecialchars($activity['title']) ?>">&#8942;</button>
                              <div class="classroom-story-menu-dropdown">
                                <?php if ($activity['type'] === 'quiz'): ?>
                                  <a href="teacher_quiz_editor.php?activity=<?= (int)$activity['id'] ?>">Edit questions</a>
                                  <a href="<?= htmlspecialchars($resultsHref($activity)) ?>">Results</a>
                                <?php else: ?>
                                  <a href="<?= htmlspecialchars($roomHref) ?>&amp;edit=<?= (int)$activity['id'] ?>#activity-form">Edit</a>
                                <?php endif; ?>
                                <?php if ($index > 0): ?>
                                  <form method="post" action="<?= htmlspecialchars($roomHref) ?>" class="classroom-story-menu-form">
                                    <input type="hidden" name="action" value="move_activity">
                                    <input type="hidden" name="activity_id" value="<?= (int)$activity['id'] ?>">
                                    <input type="hidden" name="direction" value="up">
                                    <button type="submit">Move up</button>
                                  </form>
                                <?php endif; ?>
                                <?php if ($index < count($activities) - 1): ?>
                                  <form method="post" action="<?= htmlspecialchars($roomHref) ?>" class="classroom-story-menu-form">
                                    <input type="hidden" name="action" value="move_activity">
                                    <input type="hidden" name="activity_id" value="<?= (int)$activity['id'] ?>">
                                    <input type="hidden" name="direction" value="down">
                                    <button type="submit">Move down</button>
                                  </form>
                                <?php endif; ?>
                                <button
                                  type="button"
                                  class="is-danger"
                                  data-delete-activity-id="<?= (int)$activity['id'] ?>"
                                  data-confirm-title="Delete this activity?"
                                  data-confirm-message="Students lose this activity and the progress they made in it."
                                >Delete</button>
                              </div>
                            </div>
                          </div>
                          <div class="activity-card-meta">
                            <?php if ($activity['type'] === 'quiz'): ?>
                              <span class="activity-type-badge">Quiz</span>
                              <span class="activity-status is-<?= $activity['status'] === 'published' ? 'done' : 'soon' ?>"><?= $activity['status'] === 'published' ? 'Published' : 'Draft' ?></span>
                              <span class="activity-chip"><?= (int)$activity['questions'] ?> question<?= (int)$activity['questions'] === 1 ? '' : 's' ?></span>
                            <?php else: ?>
                              <?php if ($activity['raw_title'] !== '' || !$story): ?>
                                <span class="activity-card-story" translate="no"><?= htmlspecialchars($story['title'] ?? 'Story not available') ?></span>
                              <?php endif; ?>
                              <?= koobdStoryModeBadge($activity['mode'], true) ?>
                            <?php endif; ?>
                            <?php if ($activity['due_date'] !== ''): ?>
                              <span class="activity-chip">Due <?= htmlspecialchars($dueLabel($activity['due_date'])) ?></span>
                            <?php endif; ?>
                          </div>
                          <?php $cardText = $activity['type'] === 'quiz' && $activity['description'] !== '' ? $activity['description'] : $activity['instructions']; ?>
                          <?php if ($cardText !== ''): ?>
                            <p class="activity-card-text"><?= nl2br(htmlspecialchars($cardText)) ?></p>
                          <?php endif; ?>
                          <div class="activity-card-stats">
                            <div class="activity-card-progress">
                              <div class="teacher-student-progress-bar"><span style="width: <?= (int)$activity['average'] ?>%;"></span></div>
                              <span class="activity-card-progress-label"><?= $activity['type'] === 'quiz' ? ((int)$activity['completed'] ? (int)$activity['average'] . '% average score' : 'No scores yet') : (int)$activity['average'] . '% average' ?></span>
                            </div>
                            <span class="activity-card-count"><?= (int)$activity['completed'] ?>/<?= $studentCount ?> <?= $activity['type'] === 'quiz' ? 'submitted' : 'completed' ?></span>
                          </div>
                          <div class="activity-card-actions">
                            <?php if ($activity['type'] === 'quiz'): ?>
                              <a class="activity-link" href="<?= htmlspecialchars($resultsHref($activity)) ?>">Results</a>
                              <a class="activity-link" href="teacher_quiz_editor.php?activity=<?= (int)$activity['id'] ?>">Edit questions</a>
                              <a class="activity-link" href="quiz_take.php?activity=<?= (int)$activity['id'] ?>&amp;preview=1" target="_blank" rel="noopener">Preview</a>
                            <?php else: ?>
                            <a class="activity-link" href="<?= htmlspecialchars($roomHref) ?>&amp;activity=<?= (int)$activity['id'] ?>#progress">View progress</a>
                            <?php endif; ?>
                            <?php if ($story): ?>
                              <?php $previewHref = koobdStoryPreviewHref($story); ?>
                              <a class="activity-link" href="<?= htmlspecialchars($previewHref) ?>"<?= koobdStoryDetailsData([
                                'title' => $story['title'], 'href' => $previewHref, 'cover' => $story['cover'] ?? '', 'mode' => $activity['mode'],
                                'creator' => ($story['type'] ?? '') === 'teacher_story' ? 'Your story' : 'A KoobD Classic',
                                'description' => $activity['instructions'] !== '' ? $activity['instructions'] : ($story['summary'] ?? ($story['description'] ?? '')),
                                'lesson' => $activity['lesson'],
                                'play' => 'Preview Story',
                                'key' => koobdFavoriteKeyForStory($story),
                              ]) ?>>Preview</a>
                            <?php endif; ?>
                          </div>
                        </div>
                      </li>
                    <?php endforeach; ?>
                  </ol>
                <?php endif; ?>
              </article>

              <article class="classroom-stream-card" id="progress">
                <div class="classroom-stream-head">
                  <div>
                    <div class="classroom-room-panel-kicker">Class progress</div>
                    <h2><?= $focusActivity ? htmlspecialchars($focusActivity['title']) : 'Student progress' ?></h2>
                  </div>
                </div>

                <?php if (!empty($activities)): ?>
                  <nav class="activity-tabs" aria-label="Progress by activity">
                    <a href="<?= htmlspecialchars($roomHref) ?>#progress" class="activity-tab<?= $focusActivity ? '' : ' is-active' ?>">All activities</a>
                    <?php foreach ($activities as $activity): ?>
                      <a href="<?= htmlspecialchars($activity['type'] === 'quiz' ? $resultsHref($activity) : $roomHref . '&activity=' . (int)$activity['id'] . '#progress') ?>" class="activity-tab<?= $focusActivity && $focusActivity['id'] === $activity['id'] ? ' is-active' : '' ?>" translate="no"><?= (int)$activity['number'] ?>. <?= htmlspecialchars($activity['title']) ?></a>
                    <?php endforeach; ?>
                  </nav>
                <?php endif; ?>

                <?php if (empty($students)): ?>
                  <p class="classroom-stream-copy">No students have joined yet. Share the class code<?= !empty($room['class_code']) ? ' ' . htmlspecialchars($room['class_code']) : '' ?> so they can join from their Classroom page.</p>
                <?php elseif (empty($activities)): ?>
                  <p class="classroom-stream-copy">Add an activity to start tracking your students' progress.</p>
                <?php elseif ($focusActivity): ?>
                  <?php $values = $progressMap[$focusActivity['id']] ?? []; ?>
                  <div class="teacher-student-list">
                    <?php foreach ($students as $student): ?>
                      <?php $value = $values[$student['id']] ?? null; ?>
                      <div class="teacher-student-progress-card">
                        <div class="teacher-student-avatar" style="--student-top:<?= htmlspecialchars($student['top']) ?>; --student-bottom:<?= htmlspecialchars($student['bottom']) ?>;">
                          <img src="<?= htmlspecialchars($student['asset']) ?>" alt="<?= htmlspecialchars($student['profile']) ?>">
                        </div>
                        <div class="teacher-student-progress-copy">
                          <div class="teacher-student-name" translate="no"><?= htmlspecialchars($student['profile']) ?></div>
                          <div class="teacher-student-sub" translate="no"><?= htmlspecialchars($student['name']) ?></div>
                          <div class="teacher-student-story"><?= htmlspecialchars($statusText($value)) ?></div>
                        </div>
                        <div class="teacher-student-progress">
                          <div class="teacher-student-progress-bar"><span style="width: <?= (int)$value ?>%;"></span></div>
                          <div class="teacher-student-progress-label"><?= (int)$value ?>%</div>
                        </div>
                      </div>
                    <?php endforeach; ?>
                  </div>
                <?php else: ?>
                  <?php // Every student (rows) in every activity (columns). ?>
                  <div class="activity-table-wrap">
                    <table class="activity-table">
                      <thead>
                        <tr>
                          <th scope="col">Student</th>
                          <?php foreach ($activities as $activity): ?>
                            <th scope="col" title="<?= htmlspecialchars($activity['title']) ?>">
                              <a href="<?= htmlspecialchars($activity['type'] === 'quiz' ? $resultsHref($activity) : $roomHref . '&activity=' . (int)$activity['id'] . '#progress') ?>" translate="no"><?= (int)$activity['number'] ?>. <?= htmlspecialchars($activity['title']) ?></a>
                            </th>
                          <?php endforeach; ?>
                          <th scope="col">Done</th>
                        </tr>
                      </thead>
                      <tbody>
                        <?php foreach ($students as $student): ?>
                          <?php $done = 0; ?>
                          <tr>
                            <th scope="row">
                              <span class="activity-table-student">
                                <span class="teacher-student-avatar" style="--student-top:<?= htmlspecialchars($student['top']) ?>; --student-bottom:<?= htmlspecialchars($student['bottom']) ?>;">
                                  <img src="<?= htmlspecialchars($student['asset']) ?>" alt="">
                                </span>
                                <span translate="no"><?= htmlspecialchars($student['profile']) ?></span>
                              </span>
                            </th>
                            <?php foreach ($activities as $activity): ?>
                              <?php
                                $value = $progressMap[$activity['id']][$student['id']] ?? null;
                                $done += ($value !== null && $value >= 100) ? 1 : 0;
                                $quizResult = $activity['type'] === 'quiz' ? ($quizMap[$activity['id']][$student['id']] ?? null) : null;
                              ?>
                              <td>
                                <?php if ($activity['type'] === 'quiz'): ?>
                                  <span class="activity-pill <?= $quizResult ? 'is-done' : 'is-none' ?>" title="<?= $quizResult ? 'Submitted: ' . (int)$quizResult['score'] . ' of ' . (int)$quizResult['total'] . ' correct' : 'Not submitted' ?>">
                                    <?= $quizResult ? (int)$quizResult['score'] . '/' . (int)$quizResult['total'] : '&mdash;' ?>
                                  </span>
                                <?php else: ?>
                                <span class="activity-pill <?= $value === null ? 'is-none' : ($value >= 100 ? 'is-done' : 'is-going') ?>" title="<?= htmlspecialchars($statusText($value)) ?>">
                                  <?= $value === null ? '&mdash;' : ($value >= 100 ? '&#10003;' : (int)$value . '%') ?>
                                </span>
                                <?php endif; ?>
                              </td>
                            <?php endforeach; ?>
                            <td class="activity-table-done"><?= $done ?>/<?= count($activities) ?></td>
                          </tr>
                        <?php endforeach; ?>
                      </tbody>
                    </table>
                  </div>
                <?php endif; ?>
              </article>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>

  <div class="classroom-confirm-modal hidden" id="classroomConfirmModal" aria-hidden="true">
    <div class="classroom-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="classroomConfirmTitle">
      <div class="classroom-room-kicker">Confirmation</div>
      <h2 id="classroomConfirmTitle">Delete this activity?</h2>
      <p id="classroomConfirmMessage"></p>
      <div class="classroom-confirm-actions">
        <button type="button" class="classroom-confirm-btn secondary" id="classroomConfirmCancel">Cancel</button>
        <button type="button" class="classroom-confirm-btn danger" id="classroomConfirmApprove">Delete</button>
      </div>
    </div>
  </div>

  <form method="post" action="<?= htmlspecialchars($roomHref) ?>" id="deleteActivityForm" hidden>
    <input type="hidden" name="action" value="delete_activity">
    <input type="hidden" name="activity_id" id="deleteActivityId" value="">
  </form>

  <script>
    window.KOOBD_SESSION = <?= json_encode([
      'role' => 'teacher',
    ]) ?>;
  </script>
  <script>
    (() => {
      // "+ Story activity" opens the story activity form in a popup (also open
      // when editing one, ?edit=<id>). Closing an edit returns to the plain page.
      const formModal = document.getElementById('activityFormModal');
      const editing = formModal && formModal.classList.contains('is-open');
      let opener = null;
      function openForm(trigger) {
        opener = trigger || null;
        formModal.classList.add('is-open');
        formModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('has-activity-form');
        window.setTimeout(() => document.getElementById('activity_story')?.focus(), 30);
      }
      function closeForm() {
        if (editing) { window.location.href = <?= json_encode($roomHref) ?> + '#activities'; return; }
        formModal.classList.remove('is-open');
        formModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('has-activity-form');
        opener?.focus();
      }
      if (formModal) {
        // At the end of the page, so it covers everything (the phone's tab bar too).
        document.body.appendChild(formModal);
        if (editing) { document.body.classList.add('has-activity-form'); window.setTimeout(() => document.getElementById('activity_story')?.focus(), 30); }
        document.querySelectorAll('[data-open-activity-form]').forEach((link) => {
          link.addEventListener('click', (event) => { event.preventDefault(); openForm(link); });
        });
        formModal.querySelectorAll('[data-close-activity-form]').forEach((button) => button.addEventListener('click', closeForm));
        formModal.addEventListener('click', (event) => { if (event.target === formModal) closeForm(); });
        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape' && formModal.classList.contains('is-open')) closeForm();
        });
        if (window.location.hash === '#activity-form' && !editing) openForm(null);
      }

      // Delete asks first.
      const modal = document.getElementById('classroomConfirmModal');
      const title = document.getElementById('classroomConfirmTitle');
      const message = document.getElementById('classroomConfirmMessage');
      const form = document.getElementById('deleteActivityForm');
      const idField = document.getElementById('deleteActivityId');
      let pendingId = '';
      const close = () => {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        pendingId = '';
      };
      document.querySelectorAll('[data-delete-activity-id]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          pendingId = button.dataset.deleteActivityId || '';
          title.textContent = button.dataset.confirmTitle || 'Are you sure?';
          message.textContent = button.dataset.confirmMessage || '';
          modal.classList.remove('hidden');
          modal.setAttribute('aria-hidden', 'false');
          document.getElementById('classroomConfirmApprove').focus();
        });
      });
      document.getElementById('classroomConfirmCancel').addEventListener('click', close);
      document.getElementById('classroomConfirmApprove').addEventListener('click', () => {
        const id = pendingId;
        close();
        if (id) {
          idField.value = id;
          form.submit();
        }
      });
      modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !modal.classList.contains('hidden')) close();
      });
    })();
  </script>
  <script src="<?= koobdAsset('js/story-details.js') ?>"></script>
  <script src="<?= koobdAsset('js/sidebar.js') ?>"></script>
</body>
</html>
