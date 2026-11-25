<?php
// Classroom conversations (js/classroom-social.js): private messages between a
// student and their classroom's teacher, public comments on each classroom
// activity, and the notifications both send.
//
// Who can see what is decided here, on the server, for every request:
//   - A private conversation belongs to one student of one classroom; only
//     that student and the classroom's teacher can read or add to it.
//   - An activity's comments belong to its classroom; only the teacher and
//     the students of that classroom can read them, comment or reply (a
//     student only on published activities).
//   - A student edits or deletes only their own comments; the teacher can
//     edit or delete any comment in their classroom. Every edit and deletion
//     is recorded (activity_comment_audit). A deleted comment keeps its place
//     ("Comment deleted") so the replies under it stay.
//   - A private message can be changed only by the person who sent it: edited
//     within 5 minutes of when the server first recorded it (editing never
//     extends that), deleted at any time. A deleted message keeps its place
//     as "Message deleted" for both people; its text is removed, also from
//     the notification it sent.
//   - Notifications are only ever the signed-in person's own.
//
// Reads are GET ?action=...; changes are POST with a JSON body (a page on
// another site cannot send one without the browser asking first). Messages
// and comments carry a token from the page, so a double tap or a retry never
// posts twice.
//
//   GET  summary&classroom=         unread messages; each activity's comment count and new-comment flag
//   GET  inbox&classroom=           (teacher) every student's conversation, newest first
//   GET  thread&classroom=[&student=][&before=id | &since=id&changed=time]
//        a page of a conversation (the teacher names the student); marks it read
//   POST send {classroom, student?, body, token, reply?}   (or a form upload
//        with `file`: a photo or video, the body as its caption)
//   POST message_edit {id, body}    one's own text, within 5 minutes of sending it
//   POST message_delete {id | ids}  one's own messages, for everyone, at any time
//   POST message_hide {ids}         any messages of one's conversations, for oneself only
//   POST message_react {id, emoji}  one reaction per person; the same again removes it
//   POST conversation_clear {classroom, student?}  empties one's own view of it
//   GET  message_search&classroom=[&student=]&q=
//   GET  forward_targets&classroom=[&student=]      one's other conversations
//   POST message_forward {id, targets: [{classroom, student}]}
//   GET  comments&activity=         an activity's comments and replies; marks them seen
//   POST comment {activity, parent?, body, token}
//   POST comment_edit {id, body}
//   POST comment_delete {id}
//   GET  notifications              the latest notifications and the unread count
//   POST notifications_read {ids?: [...], all?: true}
require_once('teacher_auth.php');

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

function socialFail(int $code, string $message): void
{
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $message]);
    exit();
}

function socialDone(array $data = []): void
{
    echo json_encode(['success' => true] + $data);
    exit();
}

$me = koobdCurrentUser($conn);
if (!$me) {
    socialFail(401, 'Please sign in again.');
}
$myId = (int)$me['id'];
$isTeacher = koobdIsTeacher($me);

$method = $_SERVER['REQUEST_METHOD'];
$input = [];
// A photo or video comes as a form upload. Only KoobD's own pages send the
// header it must carry, so another site cannot post one in someone's name.
$isUpload = false;
if ($method === 'POST') {
    $contentType = (string)($_SERVER['CONTENT_TYPE'] ?? '');
    if (stripos($contentType, 'multipart/form-data') === 0 && ($_SERVER['HTTP_X_KOOBD_REQUEST'] ?? '') === 'upload') {
        $isUpload = true;
        $input = $_POST;
        if (($input['action'] ?? '') !== 'send') {
            socialFail(400, 'Invalid request.');
        }
    } elseif (stripos($contentType, 'application/json') !== 0) {
        socialFail(415, 'Invalid request.');
    } else {
        $input = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($input)) {
            socialFail(400, 'The request could not be read.');
        }
    }
}
$action = (string)($method === 'POST' ? ($input['action'] ?? '') : ($_GET['action'] ?? ''));
$param = static fn(string $key) => $method === 'POST' ? ($input[$key] ?? null) : ($_GET[$key] ?? null);

const SOCIAL_MAX_LENGTH = 2000;
// How long after sending a private message its sender can still edit it.
const SOCIAL_EDIT_SECONDS = 300;

// --- Access ---------------------------------------------------------------------------------
// The signed-in person's place in a classroom: 'teacher' (its own teacher),
// 'student' (a member), or null (nothing to see).
function socialClassroom(int $classroomId, int $userId, bool $isTeacher): ?array
{
    global $conn;
    if ($classroomId <= 0) {
        return null;
    }
    $stmt = $conn->prepare("SELECT id, title, teacher_id FROM classrooms WHERE id = ? AND status = 'active' LIMIT 1");
    $stmt->bind_param('i', $classroomId);
    $stmt->execute();
    $classroom = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$classroom) {
        return null;
    }
    if ((int)$classroom['teacher_id'] === $userId) {
        return ['role' => 'teacher'] + $classroom;
    }
    if ($isTeacher) {
        return null;
    }
    return socialIsMember((int)$classroom['id'], $userId) ? ['role' => 'student'] + $classroom : null;
}

function socialIsMember(int $classroomId, int $studentId): bool
{
    global $conn;
    $stmt = $conn->prepare(
        "SELECT 1 FROM classroom_students cs INNER JOIN users u ON u.id = cs.student_user_id
         WHERE cs.classroom_id = ? AND cs.student_user_id = ? AND u.user_role <> 'teacher' LIMIT 1"
    );
    $stmt->bind_param('ii', $classroomId, $studentId);
    $stmt->execute();
    $found = (bool)$stmt->get_result()->fetch_row();
    $stmt->close();
    return $found;
}

// An activity the signed-in person may discuss, with their place in its classroom.
function socialActivity(int $activityId, int $userId, bool $isTeacher): ?array
{
    global $conn;
    if ($activityId <= 0) {
        return null;
    }
    $stmt = $conn->prepare("SELECT id, classroom_id, status, title, activity_type, story_id FROM classroom_activities WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $activityId);
    $stmt->execute();
    $activity = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$activity) {
        return null;
    }
    $classroom = socialClassroom((int)$activity['classroom_id'], $userId, $isTeacher);
    if (!$classroom || ($classroom['role'] === 'student' && $activity['status'] === 'draft')) {
        return null;
    }
    $title = trim((string)$activity['title']);
    if ($title === '') {
        $title = koobdActivityFromRow($activity)['title'];
    }
    return ['id' => (int)$activity['id'], 'title' => $title, 'classroom' => $classroom];
}

// --- People ---------------------------------------------------------------------------------
// How people appear: their profile name, username and picture.
function socialPeople(array $ids): array
{
    global $conn;
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) {
        return [];
    }
    $people = [];
    $result = $conn->query(
        "SELECT id, username, selected_reader, profile_reader_name, profile_badge_label, profile_top_color, profile_bottom_color,
                profile_accent_color, profile_card_style, profile_scale, user_role
         FROM users WHERE id IN (" . implode(',', $ids) . ")"
    );
    while ($result && ($row = $result->fetch_assoc())) {
        $profile = koobdResolvedProfile($row);
        $people[(int)$row['id']] = [
            'id' => (int)$row['id'],
            'name' => $profile['name'],
            'username' => $row['username'],
            'asset' => $profile['asset'],
            'top' => $profile['top'],
            'bottom' => $profile['bottom'],
            'role' => koobdUserRole($row),
        ];
    }
    return $people;
}

function socialPerson(array $people, int $id): array
{
    return $people[$id] ?? ['id' => $id, 'name' => 'Former member', 'username' => '', 'asset' => '', 'top' => '#dfe6ff', 'bottom' => '#d3f5e6', 'role' => 'student'];
}

// --- Notifications --------------------------------------------------------------------------
// One unread notification per kind, person and place: a newer one replaces
// the text and time of an unread one instead of piling up.
function socialNotify(int $userId, int $actorId, string $kind, int $classroomId, ?int $activityId, string $text, string $link): void
{
    global $conn;
    if ($userId <= 0 || $userId === $actorId) {
        return;
    }
    $text = function_exists('mb_substr') ? mb_substr($text, 0, 250) : substr($text, 0, 250);
    $find = $conn->prepare(
        "SELECT id FROM user_notifications WHERE user_id = ? AND actor_user_id = ? AND kind = ? AND classroom_id = ?
         AND (activity_id <=> ?) AND read_at IS NULL LIMIT 1"
    );
    $find->bind_param('iisii', $userId, $actorId, $kind, $classroomId, $activityId);
    $find->execute();
    $existing = $find->get_result()->fetch_assoc();
    $find->close();
    if ($existing) {
        $update = $conn->prepare("UPDATE user_notifications SET text = ?, link = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?");
        $update->bind_param('ssi', $text, $link, $existing['id']);
        $update->execute();
        $update->close();
        return;
    }
    $insert = $conn->prepare("INSERT INTO user_notifications (user_id, actor_user_id, kind, classroom_id, activity_id, text, link) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $insert->bind_param('iisiiss', $userId, $actorId, $kind, $classroomId, $activityId, $text, $link);
    $insert->execute();
    $insert->close();
}

function socialMarkNotificationsRead(int $userId, string $kind, int $classroomId, ?int $activityId = null, ?int $actorId = null): void
{
    global $conn;
    $sql = "UPDATE user_notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND kind = ? AND classroom_id = ? AND read_at IS NULL";
    $types = 'isi';
    $values = [$userId, $kind, $classroomId];
    if ($activityId !== null) {
        $sql .= " AND activity_id = ?";
        $types .= 'i';
        $values[] = $activityId;
    }
    if ($actorId !== null) {
        $sql .= " AND actor_user_id = ?";
        $types .= 'i';
        $values[] = $actorId;
    }
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$values);
    $stmt->execute();
    $stmt->close();
}

// --- Text -------------------------------------------------------------------------------------
function socialBody($value): string
{
    $text = is_string($value) ? str_replace(["\r\n", "\r"], "\n", $value) : '';
    $text = trim(preg_replace("/\n{3,}/", "\n\n", $text) ?? $text);
    if ($text === '') {
        socialFail(422, 'Type a message first.');
    }
    $length = function_exists('mb_strlen') ? mb_strlen($text) : strlen($text);
    if ($length > SOCIAL_MAX_LENGTH) {
        socialFail(422, 'That is too long. Keep it under ' . SOCIAL_MAX_LENGTH . ' characters.');
    }
    return $text;
}

function socialToken($value): ?string
{
    $token = is_string($value) ? preg_replace('/[^A-Za-z0-9_-]/', '', $value) : '';
    return $token !== '' ? substr($token, 0, 64) : null;
}

function socialSnippet(string $text, int $max = 80): string
{
    $text = preg_replace('/\s+/', ' ', $text) ?? $text;
    $length = function_exists('mb_strlen') ? mb_strlen($text) : strlen($text);
    if ($length <= $max) {
        return $text;
    }
    return rtrim(function_exists('mb_substr') ? mb_substr($text, 0, $max - 1) : substr($text, 0, $max - 1)) . '…';
}

// --- Private messages ---------------------------------------------------------------------
// One conversation per student per classroom, between that student and the
// classroom's teacher. Messages can answer another message (reply_to_id),
// carry one photo or video (kept in uploads/private-messages and served only
// by message_media.php), be reacted to with one emoji per person, be hidden
// by one person only ("Delete for me"), or be cleared from one person's view
// ("Clear conversation"). Everything checks here that the signed-in person
// is one of the two people in the conversation.

const SOCIAL_MESSAGE_PAGE = 30;
// The reactions people can choose.
const SOCIAL_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
// Photos and videos people can send: the type is read from the file itself.
const SOCIAL_MEDIA_TYPES = [
    'image/jpeg' => ['image', 'jpg', 10 * 1024 * 1024],
    'image/png' => ['image', 'png', 10 * 1024 * 1024],
    'image/webp' => ['image', 'webp', 10 * 1024 * 1024],
    'video/mp4' => ['video', 'mp4', 40 * 1024 * 1024],
    'video/webm' => ['video', 'webm', 40 * 1024 * 1024],
];

// The conversation a request is about: a student's own, or (for the teacher)
// the student named. [classroom, studentId].
function socialConversation(): array
{
    global $myId, $isTeacher, $param;
    return socialConversationFor((int)$param('classroom'), (int)$param('student'));
}

function socialConversationFor(int $classroomId, int $studentId): array
{
    global $myId, $isTeacher;
    $classroom = socialClassroom($classroomId, $myId, $isTeacher);
    if (!$classroom) {
        socialFail(404, 'This classroom is not available.');
    }
    if ($classroom['role'] === 'student') {
        return [$classroom, $myId];
    }
    if (!socialIsMember((int)$classroom['id'], $studentId)) {
        socialFail(404, 'That student is not in this classroom.');
    }
    return [$classroom, $studentId];
}

// The columns a message is read with.
const SOCIAL_MESSAGE_COLUMNS = "m.id, m.classroom_id, m.student_user_id, m.sender_user_id, m.body, m.reply_to_id,
    m.attachment_path, m.attachment_kind, m.attachment_mime, m.attachment_size, m.attachment_name, m.forwarded,
    UNIX_TIMESTAMP(m.created_at) AS at, m.read_at, m.edited_at, m.deleted_at,
    UNIX_TIMESTAMP() - UNIX_TIMESTAMP(m.created_at) AS age, UNIX_TIMESTAMP(m.changed_at) AS changed";

// A message as a page sees it. $extra: reactions [id => [[emoji, userId]]]
// and the messages replies point at [id => row].
function socialMessageRow(array $row, array $people, int $viewerId, array $reactions = [], array $replied = []): array
{
    $sender = (int)$row['sender_user_id'];
    $mine = $sender === $viewerId;
    $deleted = $row['deleted_at'] !== null;
    $hasText = trim((string)$row['body']) !== '';
    // Seconds left to edit a text (by the server's clock, from when it was sent).
    $editLeft = $mine && !$deleted && $hasText ? max(0, SOCIAL_EDIT_SECONDS - (int)$row['age']) : 0;
    $attachment = null;
    if (!$deleted && $row['attachment_path'] !== null) {
        $attachment = [
            'kind' => (string)$row['attachment_kind'],
            'url' => 'message_media.php?id=' . (int)$row['id'],
            'name' => (string)$row['attachment_name'],
            'size' => (int)$row['attachment_size'],
        ];
    }
    $reply = null;
    $replyId = $row['reply_to_id'] === null ? 0 : (int)$row['reply_to_id'];
    if ($replyId && isset($replied[$replyId])) {
        $original = $replied[$replyId];
        $reply = [
            'id' => $replyId,
            'name' => (int)$original['sender_user_id'] === $viewerId ? 'You' : socialPerson($people, (int)$original['sender_user_id'])['name'],
            'text' => $original['deleted_at'] !== null ? 'Message deleted'
                : (trim((string)$original['body']) !== '' ? socialSnippet((string)$original['body'], 90)
                    : ($original['attachment_kind'] === 'video' ? 'Video' : 'Photo')),
            'kind' => $original['deleted_at'] === null ? (string)($original['attachment_kind'] ?? '') : '',
        ];
    } elseif ($replyId) {
        $reply = ['id' => $replyId, 'name' => '', 'text' => 'Message unavailable', 'kind' => ''];
    }
    $grouped = [];
    foreach ($deleted ? [] : ($reactions[(int)$row['id']] ?? []) as [$emoji, $userId]) {
        $grouped[$emoji] = $grouped[$emoji] ?? ['emoji' => $emoji, 'count' => 0, 'mine' => false];
        $grouped[$emoji]['count']++;
        $grouped[$emoji]['mine'] = $grouped[$emoji]['mine'] || $userId === $viewerId;
    }
    return [
        'id' => (int)$row['id'],
        'mine' => $mine,
        'sender' => socialPerson($people, $sender),
        'body' => $deleted ? '' : (string)$row['body'],
        'at' => (int)$row['at'],
        'changed' => (int)$row['changed'],
        'read' => $row['read_at'] !== null,
        'edited' => !$deleted && $row['edited_at'] !== null,
        'deleted' => $deleted,
        'forwarded' => !$deleted && (int)$row['forwarded'] === 1,
        'attachment' => $attachment,
        'reply' => $deleted ? null : $reply,
        'reactions' => array_values($grouped),
        'canEdit' => $editLeft > 0,
        'editSecondsLeft' => $editLeft,
        'canDelete' => $mine && !$deleted,
    ];
}

// Turns message rows into what a page sees (with their reactions and the
// messages their replies point at).
function socialMessageRows(array $rows, int $viewerId, int $teacherId, int $studentId): array
{
    global $conn;
    if (!$rows) {
        return [];
    }
    $ids = array_map('intval', array_column($rows, 'id'));
    $reactions = [];
    $result = $conn->query("SELECT message_id, user_id, emoji FROM classroom_message_reactions WHERE message_id IN (" . implode(',', $ids) . ") ORDER BY created_at");
    while ($result && ($reaction = $result->fetch_assoc())) {
        $reactions[(int)$reaction['message_id']][] = [(string)$reaction['emoji'], (int)$reaction['user_id']];
    }
    $replyIds = array_values(array_filter(array_map(static fn($row) => (int)($row['reply_to_id'] ?? 0), $rows)));
    $replied = [];
    if ($replyIds) {
        // Only messages of the same conversation are quoted.
        $first = $rows[0];
        $result = $conn->query(
            "SELECT id, sender_user_id, body, attachment_kind, deleted_at FROM classroom_messages
             WHERE id IN (" . implode(',', array_unique($replyIds)) . ") AND classroom_id = " . (int)$first['classroom_id'] . " AND student_user_id = " . (int)$first['student_user_id']
        );
        while ($result && ($original = $result->fetch_assoc())) {
            $replied[(int)$original['id']] = $original;
        }
    }
    $people = socialPeople([$teacherId, $studentId]);
    return array_map(static fn($row) => socialMessageRow($row, $people, $viewerId, $reactions, $replied), $rows);
}

// A message in a conversation the signed-in person belongs to, with its
// classroom. Not found (404) for anyone else.
function socialVisibleMessage(int $messageId): array
{
    global $conn, $myId, $isTeacher;
    $stmt = $conn->prepare("SELECT " . SOCIAL_MESSAGE_COLUMNS . " FROM classroom_messages m WHERE m.id = ? LIMIT 1");
    $stmt->bind_param('i', $messageId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $classroom = $row ? socialClassroom((int)$row['classroom_id'], $myId, $isTeacher) : null;
    $belongs = $classroom && (
        ($classroom['role'] === 'teacher' && socialIsMember((int)$classroom['id'], (int)$row['student_user_id']))
        || (int)$row['student_user_id'] === $myId
    );
    if (!$row || !$belongs) {
        socialFail(404, 'That message could not be found.');
    }
    return [$row, $classroom];
}

// One of the signed-in person's own messages (to edit or delete).
function socialOwnMessage(int $messageId): array
{
    global $myId;
    [$row, $classroom] = socialVisibleMessage($messageId);
    if ((int)$row['sender_user_id'] !== $myId) {
        socialFail(403, 'You can only change messages you sent.');
    }
    if ($row['deleted_at'] !== null) {
        socialFail(409, 'That message was already deleted.');
    }
    return [$row, $classroom];
}

// The other person in a message's conversation.
function socialMessageRecipient(array $row, array $classroom): int
{
    return (int)$row['sender_user_id'] === (int)$row['student_user_id'] ? (int)$classroom['teacher_id'] : (int)$row['student_user_id'];
}

// What this person has cleared from their view of a conversation (messages
// up to and including this id are hidden for them).
function socialClearedThrough(int $classroomId, int $studentId, int $userId): int
{
    global $conn;
    $stmt = $conn->prepare("SELECT cleared_through_id FROM classroom_message_cleared WHERE classroom_id = ? AND student_user_id = ? AND user_id = ?");
    $stmt->bind_param('iii', $classroomId, $studentId, $userId);
    $stmt->execute();
    $value = (int)($stmt->get_result()->fetch_row()[0] ?? 0);
    $stmt->close();
    return $value;
}

// A new message in a conversation: text, a reply, an attachment, or a
// forwarded copy. Notifies the other person. Returns the new message's id
// (the first one, if the same token arrived twice).
function socialAddMessage(array $classroom, int $studentId, string $body, ?string $token, int $replyTo = 0, ?array $file = null, bool $forwarded = false): int
{
    global $conn, $myId;
    $classroomId = (int)$classroom['id'];
    $path = $file['path'] ?? null;
    $kind = $file['kind'] ?? null;
    $mime = $file['mime'] ?? null;
    $size = isset($file['size']) ? (int)$file['size'] : null;
    $name = $file['name'] ?? null;
    $reply = $replyTo > 0 ? $replyTo : null;
    $forward = $forwarded ? 1 : 0;
    $insert = $conn->prepare(
        "INSERT IGNORE INTO classroom_messages (classroom_id, student_user_id, sender_user_id, body, reply_to_id, attachment_path, attachment_kind, attachment_mime, attachment_size, attachment_name, forwarded, client_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $insert->bind_param('iiisisssisis', $classroomId, $studentId, $myId, $body, $reply, $path, $kind, $mime, $size, $name, $forward, $token);
    $insert->execute();
    $newId = (int)$insert->insert_id;
    $insert->close();
    if ($newId === 0 && $token !== null) {
        $find = $conn->prepare("SELECT id FROM classroom_messages WHERE sender_user_id = ? AND client_token = ? LIMIT 1");
        $find->bind_param('is', $myId, $token);
        $find->execute();
        $newId = (int)($find->get_result()->fetch_row()[0] ?? 0);
        $find->close();
        return $newId;
    }
    $what = $body !== '' ? '“' . socialSnippet($body, 60) . '”' : ($kind === 'video' ? 'a video' : 'a photo');
    $myName = socialPerson(socialPeople([$myId]), $myId)['name'];
    if ($classroom['role'] === 'student') {
        socialNotify((int)$classroom['teacher_id'], $myId, 'message', $classroomId, null,
            $myName . ' sent you ' . ($body !== '' ? 'a private message: ' : '') . $what,
            'teacher_classroom.php?id=' . $classroomId . '&chat=' . $myId);
    } else {
        socialNotify($studentId, $myId, 'message', $classroomId, null,
            'Your teacher sent you ' . ($body !== '' ? 'a message: ' : '') . $what,
            'classroom_room.php?id=' . $classroomId . '&chat=1');
    }
    return $newId;
}

// The message just written, as a page sees it.
function socialMessageById(int $id, array $classroom, int $studentId): array
{
    global $conn, $myId;
    $stmt = $conn->prepare("SELECT " . SOCIAL_MESSAGE_COLUMNS . " FROM classroom_messages m WHERE m.id = ? AND m.classroom_id = ? AND m.student_user_id = ?");
    $classroomId = (int)$classroom['id'];
    $stmt->bind_param('iii', $id, $classroomId, $studentId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) {
        socialFail(500, 'Your message could not be sent. Please try again.');
    }
    return socialMessageRows([$row], $myId, (int)$classroom['teacher_id'], $studentId)[0];
}

// A reply must answer a message of the same conversation.
function socialReplyTarget($value, int $classroomId, int $studentId): int
{
    global $conn;
    $id = (int)$value;
    if ($id <= 0) {
        return 0;
    }
    $stmt = $conn->prepare("SELECT id FROM classroom_messages WHERE id = ? AND classroom_id = ? AND student_user_id = ? AND deleted_at IS NULL");
    $stmt->bind_param('iii', $id, $classroomId, $studentId);
    $stmt->execute();
    $found = (bool)$stmt->get_result()->fetch_row();
    $stmt->close();
    if (!$found) {
        socialFail(404, 'The message you are replying to is no longer there.');
    }
    return $id;
}

// A photo or video from an upload, checked and stored privately.
function socialStoreUpload(array $upload): array
{
    if (($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $tooBig = in_array($upload['error'] ?? 0, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
        socialFail($tooBig ? 413 : 400, $tooBig ? 'That file is too large. Photos can be up to 10 MB and videos up to 40 MB.' : 'The file could not be uploaded. Please try again.');
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($upload['tmp_name']) ?: '';
    if (!isset(SOCIAL_MEDIA_TYPES[$mime])) {
        socialFail(415, 'Only photos (JPEG, PNG, WebP) and videos (MP4, WebM) can be sent.');
    }
    [$kind, $extension, $limit] = SOCIAL_MEDIA_TYPES[$mime];
    $size = (int)filesize($upload['tmp_name']);
    if ($size <= 0 || $size > $limit) {
        socialFail(413, $kind === 'image' ? 'Photos can be up to 10 MB.' : 'Videos can be up to 40 MB.');
    }
    if ($kind === 'image' && !@getimagesize($upload['tmp_name'])) {
        socialFail(415, 'That photo could not be read.');
    }
    $folder = 'uploads/private-messages/' . date('Y-m');
    if (!is_dir(__DIR__ . '/' . $folder) && !mkdir(__DIR__ . '/' . $folder, 0750, true) && !is_dir(__DIR__ . '/' . $folder)) {
        socialFail(500, 'The file could not be saved. Please try again.');
    }
    $path = $folder . '/' . bin2hex(random_bytes(16)) . '.' . $extension;
    if (!move_uploaded_file($upload['tmp_name'], __DIR__ . '/' . $path)) {
        socialFail(500, 'The file could not be saved. Please try again.');
    }
    $name = preg_replace('/[^\w .()-]+/u', '', basename((string)($upload['name'] ?? ''))) ?: ($kind === 'video' ? 'video.' : 'photo.') . $extension;
    return ['path' => $path, 'kind' => $kind, 'mime' => $mime, 'size' => $size, 'name' => function_exists('mb_substr') ? mb_substr($name, 0, 120) : substr($name, 0, 120)];
}

// --- Comments ---------------------------------------------------------------------------------
function socialCommentRow(array $row, array $people, int $viewerId, bool $moderator): array
{
    $deleted = $row['deleted_at'] !== null;
    $mine = (int)$row['user_id'] === $viewerId;
    return [
        'id' => (int)$row['id'],
        'parent' => $row['parent_id'] === null ? null : (int)$row['parent_id'],
        'user' => socialPerson($people, (int)$row['user_id']),
        'body' => $deleted ? '' : (string)$row['body'],
        'at' => (int)$row['at'],
        'edited' => !$deleted && $row['edited_at'] !== null,
        'editedByTeacher' => !$deleted && $row['edited_by'] !== null && (int)$row['edited_by'] !== (int)$row['user_id'],
        'deleted' => $deleted,
        'mine' => $mine,
        'canEdit' => !$deleted && ($mine || $moderator),
        'canDelete' => !$deleted && ($mine || $moderator),
        'replies' => [],
    ];
}

function socialFindComment(int $commentId): ?array
{
    global $conn;
    $stmt = $conn->prepare("SELECT *, UNIX_TIMESTAMP(created_at) AS at FROM activity_comments WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $commentId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

function socialAudit(int $commentId, int $actorId, string $action, string $previous): void
{
    global $conn;
    $stmt = $conn->prepare("INSERT INTO activity_comment_audit (comment_id, actor_user_id, action, previous_body) VALUES (?, ?, ?, ?)");
    $stmt->bind_param('iiss', $commentId, $actorId, $action, $previous);
    $stmt->execute();
    $stmt->close();
}

// A comment the signed-in person is allowed to change, with its activity.
function socialEditableComment(int $commentId): array
{
    global $myId, $isTeacher;
    $row = socialFindComment($commentId);
    $activity = $row ? socialActivity((int)$row['activity_id'], $myId, $isTeacher) : null;
    if (!$row || !$activity || (int)$row['classroom_id'] !== (int)$activity['classroom']['id']) {
        socialFail(404, 'That comment could not be found.');
    }
    if ($row['deleted_at'] !== null) {
        socialFail(409, 'That comment was already deleted.');
    }
    $moderator = $activity['classroom']['role'] === 'teacher';
    if ((int)$row['user_id'] !== $myId && !$moderator) {
        socialFail(403, 'You can only change your own comments.');
    }
    return [$row, $activity, $moderator];
}

function socialActivityLink(array $activity, string $role): string
{
    $classroomId = (int)$activity['classroom']['id'];
    return ($role === 'teacher' ? 'teacher_classroom.php' : 'classroom_room.php') . '?id=' . $classroomId . '&comments=' . (int)$activity['id'] . '#activity-' . (int)$activity['id'];
}

// =================================================================================================
switch ($action) {
    case 'summary': {
        // Once a day: photos and videos left behind by deleted accounts.
        koobdSweepMessageFiles();
        $classroom = socialClassroom((int)$param('classroom'), $myId, $isTeacher);
        if (!$classroom) {
            socialFail(404, 'This classroom is not available.');
        }
        $classroomId = (int)$classroom['id'];
        // Unread private messages sent to me in this classroom.
        if ($classroom['role'] === 'teacher') {
            $stmt = $conn->prepare("SELECT COUNT(*) FROM classroom_messages WHERE classroom_id = ? AND sender_user_id = student_user_id AND read_at IS NULL AND deleted_at IS NULL");
            $stmt->bind_param('i', $classroomId);
        } else {
            $stmt = $conn->prepare("SELECT COUNT(*) FROM classroom_messages WHERE classroom_id = ? AND student_user_id = ? AND sender_user_id <> ? AND read_at IS NULL AND deleted_at IS NULL");
            $stmt->bind_param('iii', $classroomId, $myId, $myId);
        }
        $stmt->execute();
        $unread = (int)$stmt->get_result()->fetch_row()[0];
        $stmt->close();
        // Each activity's comments: how many, and whether any by others are new to me.
        $activities = [];
        $stmt = $conn->prepare(
            "SELECT c.activity_id, SUM(c.deleted_at IS NULL) AS total,
                    SUM(c.deleted_at IS NULL AND c.user_id <> ? AND c.id > COALESCE(v.last_seen_id, 0)) AS fresh
             FROM activity_comments c
             INNER JOIN classroom_activities a ON a.id = c.activity_id
             LEFT JOIN activity_comment_views v ON v.activity_id = c.activity_id AND v.user_id = ?
             WHERE c.classroom_id = ? AND a.classroom_id = ?" . ($classroom['role'] === 'student' ? " AND a.status <> 'draft'" : '') . "
             GROUP BY c.activity_id"
        );
        $stmt->bind_param('iiii', $myId, $myId, $classroomId, $classroomId);
        $stmt->execute();
        foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
            $activities[(int)$row['activity_id']] = ['count' => (int)$row['total'], 'new' => (int)$row['fresh'] > 0];
        }
        $stmt->close();
        // The classroom's students right now (teachers never count), so the
        // page's student count follows joins and leaves.
        $count = $conn->prepare(
            "SELECT COUNT(*) FROM classroom_students cs INNER JOIN users u ON u.id = cs.student_user_id
             WHERE cs.classroom_id = ? AND u.user_role <> 'teacher'"
        );
        $count->bind_param('i', $classroomId);
        $count->execute();
        $students = (int)$count->get_result()->fetch_row()[0];
        $count->close();
        socialDone(['role' => $classroom['role'], 'unreadMessages' => $unread, 'students' => $students, 'activities' => (object)$activities]);
    }

    case 'inbox': {
        $classroom = socialClassroom((int)$param('classroom'), $myId, $isTeacher);
        if (!$classroom || $classroom['role'] !== 'teacher') {
            socialFail(403, 'Only the classroom\'s teacher has an inbox.');
        }
        $classroomId = (int)$classroom['id'];
        $stmt = $conn->prepare(
            "SELECT cs.student_user_id,
                    (SELECT COUNT(*) FROM classroom_messages m WHERE m.classroom_id = cs.classroom_id AND m.student_user_id = cs.student_user_id
                       AND m.sender_user_id = cs.student_user_id AND m.read_at IS NULL AND m.deleted_at IS NULL) AS unread,
                    last.body AS last_body, last.sender_user_id AS last_sender, UNIX_TIMESTAMP(last.created_at) AS last_at,
                    last.deleted_at AS last_deleted, last.attachment_kind AS last_kind
             FROM classroom_students cs
             INNER JOIN users u ON u.id = cs.student_user_id AND u.user_role <> 'teacher'
             LEFT JOIN classroom_messages last ON last.id = (
                 SELECT MAX(m2.id) FROM classroom_messages m2 WHERE m2.classroom_id = cs.classroom_id AND m2.student_user_id = cs.student_user_id)
             WHERE cs.classroom_id = ?
             ORDER BY last.id IS NULL, last.id DESC, cs.joined_at ASC"
        );
        $stmt->bind_param('i', $classroomId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        $people = socialPeople(array_column($rows, 'student_user_id'));
        $conversations = array_map(static fn($row) => [
            'student' => socialPerson($people, (int)$row['student_user_id']),
            'unread' => (int)$row['unread'],
            'last' => $row['last_at'] === null ? null : [
                'body' => $row['last_deleted'] !== null ? 'Message deleted'
                    : (trim((string)$row['last_body']) !== '' ? socialSnippet((string)$row['last_body']) : ($row['last_kind'] === 'video' ? 'Sent a video' : 'Sent a photo')),
                'mine' => (int)$row['last_sender'] === $myId,
                'at' => (int)$row['last_at'],
            ],
        ], $rows);
        socialDone(['conversations' => $conversations]);
    }

    case 'thread': {
        // A page of the conversation, newest at the bottom:
        //   (nothing)          the latest messages
        //   before=<id>        older ones, above what is shown
        //   since=<id>&changed=<time>  new messages, and shown ones that changed
        [$classroom, $studentId] = socialConversation();
        $classroomId = (int)$classroom['id'];
        $teacherId = (int)$classroom['teacher_id'];
        // Opening the conversation reads what the other person sent.
        $read = $conn->prepare("UPDATE classroom_messages SET read_at = CURRENT_TIMESTAMP, created_at = created_at WHERE classroom_id = ? AND student_user_id = ? AND sender_user_id <> ? AND read_at IS NULL");
        $read->bind_param('iii', $classroomId, $studentId, $myId);
        $read->execute();
        $read->close();
        socialMarkNotificationsRead($myId, 'message', $classroomId, null, $classroom['role'] === 'teacher' ? $studentId : null);
        $cleared = socialClearedThrough($classroomId, $studentId, $myId);
        $visible = "m.classroom_id = $classroomId AND m.student_user_id = $studentId AND m.id > $cleared
            AND NOT EXISTS (SELECT 1 FROM classroom_message_hidden h WHERE h.message_id = m.id AND h.user_id = $myId)";
        $before = (int)$param('before');
        $since = (int)$param('since');
        $changedSince = (int)$param('changed');
        $hasMore = false;
        $changed = [];
        if ($since > 0) {
            $rows = $conn->query("SELECT " . SOCIAL_MESSAGE_COLUMNS . " FROM classroom_messages m WHERE $visible AND m.id > $since ORDER BY m.id ASC LIMIT 100")->fetch_all(MYSQLI_ASSOC);
            if ($changedSince > 0) {
                $changed = $conn->query(
                    "SELECT " . SOCIAL_MESSAGE_COLUMNS . " FROM classroom_messages m
                     WHERE $visible AND m.id <= $since AND m.changed_at >= FROM_UNIXTIME(" . max(0, $changedSince - 2) . ") ORDER BY m.id ASC LIMIT 200"
                )->fetch_all(MYSQLI_ASSOC);
            }
        } else {
            $limit = SOCIAL_MESSAGE_PAGE + 1;
            $rows = $conn->query(
                "SELECT " . SOCIAL_MESSAGE_COLUMNS . " FROM classroom_messages m WHERE $visible" . ($before > 0 ? " AND m.id < $before" : '') . " ORDER BY m.id DESC LIMIT $limit"
            )->fetch_all(MYSQLI_ASSOC);
            $hasMore = count($rows) > SOCIAL_MESSAGE_PAGE;
            $rows = array_reverse(array_slice($rows, 0, SOCIAL_MESSAGE_PAGE));
        }
        $people = socialPeople([$teacherId, $studentId]);
        socialDone([
            'teacher' => socialPerson($people, $teacherId),
            'student' => socialPerson($people, $studentId),
            'messages' => socialMessageRows($rows, $myId, $teacherId, $studentId),
            'changedMessages' => socialMessageRows($changed, $myId, $teacherId, $studentId),
            'hasMore' => $hasMore,
            'serverTime' => time(),
            'reactions' => SOCIAL_REACTIONS,
        ]);
    }

    case 'send': {
        if ($method !== 'POST') {
            socialFail(405, 'Invalid request.');
        }
        [$classroom, $studentId] = socialConversation();
        $file = null;
        if ($isUpload) {
            // A photo or video, with an optional caption.
            $file = socialStoreUpload($_FILES['file'] ?? []);
            $caption = is_string($input['body'] ?? null) ? trim(str_replace(["\r\n", "\r"], "\n", $input['body'])) : '';
            $body = $caption === '' ? '' : socialBody($caption);
        } else {
            $body = socialBody($input['body'] ?? '');
        }
        $replyTo = socialReplyTarget($input['reply'] ?? 0, (int)$classroom['id'], $studentId);
        $newId = socialAddMessage($classroom, $studentId, $body, socialToken($input['token'] ?? null), $replyTo, $file);
        if ($file && $newId && ($conn->query("SELECT attachment_path FROM classroom_messages WHERE id = " . $newId)->fetch_row()[0] ?? '') !== $file['path']) {
            // A retry of an upload already saved: keep only the first copy.
            @unlink(__DIR__ . '/' . $file['path']);
        }
        socialDone(['message' => socialMessageById($newId, $classroom, $studentId)]);
    }

    case 'message_edit': {
        if ($method !== 'POST') {
            socialFail(405, 'Invalid request.');
        }
        [$row, $classroom] = socialOwnMessage((int)($input['id'] ?? 0));
        if (trim((string)$row['body']) === '') {
            socialFail(409, 'Only the text of a message can be edited.');
        }
        // The 5 minutes count from when the server recorded the message.
        if ((int)$row['age'] > SOCIAL_EDIT_SECONDS) {
            socialFail(409, 'This message can no longer be edited: messages can only be edited within 5 minutes of sending.');
        }
        $body = socialBody($input['body'] ?? '');
        if ($body !== (string)$row['body']) {
            // created_at stays as it was (the column never updates by itself).
            $update = $conn->prepare("UPDATE classroom_messages SET body = ?, edited_at = CURRENT_TIMESTAMP, created_at = created_at WHERE id = ? AND sender_user_id = ? AND deleted_at IS NULL");
            $update->bind_param('sii', $body, $row['id'], $myId);
            $update->execute();
            $update->close();
            // An unread notification about it shows the new text.
            $recipient = socialMessageRecipient($row, $classroom);
            $text = $classroom['role'] === 'teacher'
                ? 'Your teacher sent you a message: “' . socialSnippet($body, 60) . '”'
                : socialPerson(socialPeople([$myId]), $myId)['name'] . ' sent you a private message: “' . socialSnippet($body, 60) . '”';
            $note = $conn->prepare("UPDATE user_notifications SET text = ? WHERE user_id = ? AND actor_user_id = ? AND kind = 'message' AND classroom_id = ? AND read_at IS NULL");
            $note->bind_param('siii', $text, $recipient, $myId, $classroom['id']);
            $note->execute();
            $note->close();
        }
        socialDone(['message' => socialMessageById((int)$row['id'], $classroom, (int)$row['student_user_id'])]);
    }

    case 'message_delete': {
        // "Delete for everyone": the sender's own messages, at any time.
        if ($method !== 'POST') {
            socialFail(405, 'Invalid request.');
        }
        $ids = array_values(array_unique(array_filter(array_map('intval', is_array($input['ids'] ?? null) ? array_slice($input['ids'], 0, 100) : [(int)($input['id'] ?? 0)]))));
        if (!$ids) {
            socialFail(400, 'Choose a message first.');
        }
        $rows = array_map(static fn($id) => socialOwnMessage($id), $ids);
        foreach ($rows as [$row, $classroom]) {
            $delete = $conn->prepare(
                "UPDATE classroom_messages SET body = '', attachment_path = NULL, attachment_kind = NULL, attachment_mime = NULL, attachment_size = NULL,
                   attachment_name = NULL, deleted_at = CURRENT_TIMESTAMP, created_at = created_at WHERE id = ? AND sender_user_id = ?"
            );
            $delete->bind_param('ii', $row['id'], $myId);
            $delete->execute();
            $delete->close();
            koobdForgetMessageFiles([$row['attachment_path']]);
            $conn->query("DELETE FROM classroom_message_reactions WHERE message_id = " . (int)$row['id']);
            // The notification it sent no longer quotes it.
            $recipient = socialMessageRecipient($row, $classroom);
            $snippet = '%' . socialSnippet((string)$row['body'], 60) . '%';
            $text = $classroom['role'] === 'teacher'
                ? 'Your teacher sent you a private message (since deleted).'
                : socialPerson(socialPeople([$myId]), $myId)['name'] . ' sent you a private message (since deleted).';
            $note = $conn->prepare("UPDATE user_notifications SET text = ? WHERE user_id = ? AND actor_user_id = ? AND kind = 'message' AND classroom_id = ? AND text LIKE ?");
            $note->bind_param('siiis', $text, $recipient, $myId, $classroom['id'], $snippet);
            $note->execute();
            $note->close();
        }
        socialDone(['ids' => $ids]);
    }

    case 'message_hide': {
        // "Delete for me": gone from this person's view only, any message of
        // their conversations (the other person still sees it).
        if ($method !== 'POST') {
            socialFail(405, 'Invalid request.');
        }
        $ids = array_values(array_unique(array_filter(array_map('intval', is_array($input['ids'] ?? null) ? array_slice($input['ids'], 0, 100) : []))));
        if (!$ids) {
            socialFail(400, 'Choose a message first.');
        }
        foreach ($ids as $id) {
            socialVisibleMessage($id);
            $hide = $conn->prepare("INSERT IGNORE INTO classroom_message_hidden (message_id, user_id) VALUES (?, ?)");
            $hide->bind_param('ii', $id, $myId);
            $hide->execute();
            $hide->close();
        }
        socialDone(['ids' => $ids]);
    }

    case 'message_react': {
        // One reaction per person per message; the same one again takes it back.
        if ($method !== 'POST') {
            socialFail(405, 'Invalid request.');
        }
        [$row, $classroom] = socialVisibleMessage((int)($input['id'] ?? 0));
        if ($row['deleted_at'] !== null) {
            socialFail(409, 'That message was deleted.');
        }
        $emoji = (string)($input['emoji'] ?? '');
        if (!in_array($emoji, SOCIAL_REACTIONS, true)) {
            socialFail(422, 'Choose one of the reactions.');
        }
        $messageId = (int)$row['id'];
        $current = $conn->query("SELECT emoji FROM classroom_message_reactions WHERE message_id = $messageId AND user_id = $myId")->fetch_row()[0] ?? null;
        if ($current === $emoji) {
            $conn->query("DELETE FROM classroom_message_reactions WHERE message_id = $messageId AND user_id = $myId");
        } else {
            $react = $conn->prepare("INSERT INTO classroom_message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE emoji = VALUES(emoji), created_at = CURRENT_TIMESTAMP");
            $react->bind_param('iis', $messageId, $myId, $emoji);
            $react->execute();
            $react->close();
        }
        // The other person's open conversation picks up the change.
        $conn->query("UPDATE classroom_messages SET changed_at = CURRENT_TIMESTAMP, created_at = created_at WHERE id = $messageId");
        socialDone(['message' => socialMessageById($messageId, $classroom, (int)$row['student_user_id'])]);
    }

    case 'conversation_clear': {
        // "Clear conversation": this person's view starts empty from now on;
        // the other person's history stays.
        if ($method !== 'POST') {
            socialFail(405, 'Invalid request.');
        }
        [$classroom, $studentId] = socialConversation();
        $classroomId = (int)$classroom['id'];
        $last = (int)($conn->query("SELECT COALESCE(MAX(id), 0) FROM classroom_messages WHERE classroom_id = $classroomId AND student_user_id = $studentId")->fetch_row()[0] ?? 0);
        $clear = $conn->prepare(
            "INSERT INTO classroom_message_cleared (classroom_id, student_user_id, user_id, cleared_through_id) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE cleared_through_id = GREATEST(cleared_through_id, VALUES(cleared_through_id))"
        );
        $clear->bind_param('iiii', $classroomId, $studentId, $myId, $last);
        $clear->execute();
        $clear->close();
        socialDone(['clearedThrough' => $last]);
    }

    case 'message_search': {
        // Words in this person's view of the conversation.
        [$classroom, $studentId] = socialConversation();
        $classroomId = (int)$classroom['id'];
        $query = trim((string)$param('q'));
        if ((function_exists('mb_strlen') ? mb_strlen($query) : strlen($query)) < 2) {
            socialDone(['results' => []]);
        }
        $cleared = socialClearedThrough($classroomId, $studentId, $myId);
        $like = '%' . addcslashes($query, '%_\\') . '%';
        $stmt = $conn->prepare(
            "SELECT m.id, m.sender_user_id, m.body, UNIX_TIMESTAMP(m.created_at) AS at FROM classroom_messages m
             WHERE m.classroom_id = ? AND m.student_user_id = ? AND m.id > ? AND m.deleted_at IS NULL AND m.body LIKE ?
               AND NOT EXISTS (SELECT 1 FROM classroom_message_hidden h WHERE h.message_id = m.id AND h.user_id = ?)
             ORDER BY m.id DESC LIMIT 30"
        );
        $stmt->bind_param('iiisi', $classroomId, $studentId, $cleared, $like, $myId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        $people = socialPeople([(int)$classroom['teacher_id'], $studentId]);
        socialDone(['results' => array_map(static fn($row) => [
            'id' => (int)$row['id'],
            'name' => (int)$row['sender_user_id'] === $myId ? 'You' : socialPerson($people, (int)$row['sender_user_id'])['name'],
            'text' => socialSnippet((string)$row['body'], 120),
            'at' => (int)$row['at'],
        ], $rows)]);
    }

    case 'forward_targets': {
        // Where this person may forward a message: their other conversations.
        // A teacher: the other students of the classrooms they teach. A
        // student: their teachers in the other classrooms they belong to.
        [$classroom, $studentId] = socialConversation();
        $targets = [];
        if ($isTeacher) {
            $result = $conn->query(
                "SELECT c.id AS classroom_id, c.title, u.id AS student_id FROM classrooms c
                 INNER JOIN classroom_students cs ON cs.classroom_id = c.id
                 INNER JOIN users u ON u.id = cs.student_user_id AND u.user_role <> 'teacher'
                 WHERE c.teacher_id = $myId AND c.status = 'active' ORDER BY c.title, cs.joined_at LIMIT 300"
            );
            $rows = $result ? $result->fetch_all(MYSQLI_ASSOC) : [];
            $people = socialPeople(array_column($rows, 'student_id'));
            foreach ($rows as $row) {
                if ((int)$row['classroom_id'] === (int)$classroom['id'] && (int)$row['student_id'] === $studentId) {
                    continue;
                }
                $person = socialPerson($people, (int)$row['student_id']);
                $targets[] = ['classroom' => (int)$row['classroom_id'], 'student' => (int)$row['student_id'], 'name' => $person['name'], 'detail' => (string)$row['title'], 'person' => $person];
            }
        } else {
            $result = $conn->query(
                "SELECT c.id AS classroom_id, c.title, c.teacher_id FROM classroom_students cs
                 INNER JOIN classrooms c ON c.id = cs.classroom_id AND c.status = 'active'
                 WHERE cs.student_user_id = $myId AND c.id <> " . (int)$classroom['id'] . " ORDER BY c.title LIMIT 100"
            );
            $rows = $result ? $result->fetch_all(MYSQLI_ASSOC) : [];
            $people = socialPeople(array_column($rows, 'teacher_id'));
            foreach ($rows as $row) {
                $person = socialPerson($people, (int)$row['teacher_id']);
                $targets[] = ['classroom' => (int)$row['classroom_id'], 'student' => $myId, 'name' => 'Teacher ' . $person['name'], 'detail' => (string)$row['title'], 'person' => $person];
            }
        }
        socialDone(['targets' => $targets]);
    }

    case 'message_forward': {
        // A copy of a message (text and photo or video) in other conversations
        // of this person's, marked as forwarded.
        if ($method !== 'POST') {
            socialFail(405, 'Invalid request.');
        }
        [$row] = socialVisibleMessage((int)($input['id'] ?? 0));
        if ($row['deleted_at'] !== null) {
            socialFail(409, 'That message was deleted.');
        }
        $targets = is_array($input['targets'] ?? null) ? array_slice($input['targets'], 0, 20) : [];
        if (!$targets) {
            socialFail(400, 'Choose where to forward it.');
        }
        $file = $row['attachment_path'] !== null ? [
            'path' => $row['attachment_path'], 'kind' => $row['attachment_kind'], 'mime' => $row['attachment_mime'],
            'size' => (int)$row['attachment_size'], 'name' => $row['attachment_name'],
        ] : null;
        $sent = 0;
        foreach ($targets as $target) {
            if (!is_array($target)) {
                continue;
            }
            [$targetClassroom, $targetStudent] = socialConversationFor((int)($target['classroom'] ?? 0), (int)($target['student'] ?? 0));
            if ((int)$targetClassroom['id'] === (int)$row['classroom_id'] && $targetStudent === (int)$row['student_user_id']) {
                continue;
            }
            socialAddMessage($targetClassroom, $targetStudent, (string)$row['body'], null, 0, $file, true);
            $sent++;
        }
        socialDone(['sent' => $sent]);
    }

    case 'comments': {
        $activity = socialActivity((int)$param('activity'), $myId, $isTeacher);
        if (!$activity) {
            socialFail(404, 'This activity is not available.');
        }
        $moderator = $activity['classroom']['role'] === 'teacher';
        $stmt = $conn->prepare(
            "SELECT id, user_id, parent_id, body, UNIX_TIMESTAMP(created_at) AS at, edited_at, edited_by, deleted_at
             FROM activity_comments WHERE activity_id = ? AND classroom_id = ? ORDER BY id ASC LIMIT 500"
        );
        $classroomId = (int)$activity['classroom']['id'];
        $stmt->bind_param('ii', $activity['id'], $classroomId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        $people = socialPeople(array_column($rows, 'user_id'));
        $top = [];
        $replies = [];
        foreach ($rows as $row) {
            $comment = socialCommentRow($row, $people, $myId, $moderator);
            if ($comment['parent'] === null) {
                $top[$comment['id']] = $comment;
            } else {
                $replies[] = $comment;
            }
        }
        foreach ($replies as $reply) {
            if (isset($top[$reply['parent']]) && !$reply['deleted']) {
                $top[$reply['parent']]['replies'][] = $reply;
            }
        }
        // A deleted comment with no replies left has nothing to show.
        $top = array_values(array_filter($top, static fn($comment) => !$comment['deleted'] || $comment['replies']));
        // Seen: the "new" dot goes, and so do notifications about this activity.
        $lastId = $rows ? (int)max(array_column($rows, 'id')) : 0;
        $seen = $conn->prepare(
            "INSERT INTO activity_comment_views (user_id, activity_id, last_seen_id) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE last_seen_id = GREATEST(last_seen_id, VALUES(last_seen_id))"
        );
        $seen->bind_param('iii', $myId, $activity['id'], $lastId);
        $seen->execute();
        $seen->close();
        socialMarkNotificationsRead($myId, 'reply', $classroomId, $activity['id']);
        socialMarkNotificationsRead($myId, 'comment', $classroomId, $activity['id']);
        socialDone(['moderator' => $moderator, 'count' => count(array_filter($rows, static fn($row) => $row['deleted_at'] === null)), 'comments' => $top]);
    }

    case 'comment': {
        if ($method !== 'POST') {
            socialFail(405, 'Invalid request.');
        }
        $activity = socialActivity((int)($input['activity'] ?? 0), $myId, $isTeacher);
        if (!$activity) {
            socialFail(404, 'This activity is not available.');
        }
        $classroomId = (int)$activity['classroom']['id'];
        $body = socialBody($input['body'] ?? '');
        $token = socialToken($input['token'] ?? null);
        $parentId = (int)($input['parent'] ?? 0);
        $parent = null;
        if ($parentId > 0) {
            $parent = socialFindComment($parentId);
            // Replies go under a comment of the same activity (one level deep).
            if (!$parent || (int)$parent['activity_id'] !== $activity['id'] || $parent['parent_id'] !== null || $parent['deleted_at'] !== null) {
                socialFail(404, 'The comment you are replying to is no longer there.');
            }
        }
        $parentValue = $parent ? $parentId : null;
        $insert = $conn->prepare("INSERT IGNORE INTO activity_comments (activity_id, classroom_id, user_id, parent_id, body, client_token) VALUES (?, ?, ?, ?, ?, ?)");
        $insert->bind_param('iiiiss', $activity['id'], $classroomId, $myId, $parentValue, $body, $token);
        $insert->execute();
        $newId = (int)$insert->insert_id;
        $insert->close();
        if ($newId === 0) {
            $find = $conn->prepare("SELECT id FROM activity_comments WHERE user_id = ? AND client_token = ? LIMIT 1");
            $find->bind_param('is', $myId, $token);
            $find->execute();
            $newId = (int)($find->get_result()->fetch_row()[0] ?? 0);
            $find->close();
        } else {
            $myName = socialPerson(socialPeople([$myId]), $myId)['name'];
            $teacherId = (int)$activity['classroom']['teacher_id'];
            if ($parent) {
                $author = (int)$parent['user_id'];
                socialNotify($author, $myId, 'reply', $classroomId, $activity['id'],
                    $myName . ' replied to your comment on “' . socialSnippet($activity['title'], 40) . '”: “' . socialSnippet($body, 50) . '”',
                    socialActivityLink($activity, $author === $teacherId ? 'teacher' : 'student'));
            }
            // The teacher hears about new discussion in their classroom.
            if (!$parent || (int)$parent['user_id'] !== $teacherId) {
                socialNotify($teacherId, $myId, 'comment', $classroomId, $activity['id'],
                    $myName . ($parent ? ' replied on “' : ' commented on “') . socialSnippet($activity['title'], 40) . '”: “' . socialSnippet($body, 50) . '”',
                    socialActivityLink($activity, 'teacher'));
            }
        }
        $row = socialFindComment($newId);
        if (!$row || (int)$row['activity_id'] !== $activity['id']) {
            socialFail(500, 'Your comment could not be posted. Please try again.');
        }
        socialDone(['comment' => socialCommentRow($row, socialPeople([$myId]), $myId, $activity['classroom']['role'] === 'teacher')]);
    }

    case 'comment_edit': {
        if ($method !== 'POST') {
            socialFail(405, 'Invalid request.');
        }
        [$row, $activity, $moderator] = socialEditableComment((int)($input['id'] ?? 0));
        $body = socialBody($input['body'] ?? '');
        if ($body !== (string)$row['body']) {
            socialAudit((int)$row['id'], $myId, 'edit', (string)$row['body']);
            $update = $conn->prepare("UPDATE activity_comments SET body = ?, edited_at = CURRENT_TIMESTAMP, edited_by = ? WHERE id = ?");
            $update->bind_param('sii', $body, $myId, $row['id']);
            $update->execute();
            $update->close();
        }
        $people = socialPeople([(int)$row['user_id']]);
        socialDone(['comment' => socialCommentRow(socialFindComment((int)$row['id']), $people, $myId, $moderator)]);
    }

    case 'comment_delete': {
        if ($method !== 'POST') {
            socialFail(405, 'Invalid request.');
        }
        [$row, $activity] = socialEditableComment((int)($input['id'] ?? 0));
        // Only this comment: its text goes (kept in the audit record), its
        // place stays so the replies under it remain.
        socialAudit((int)$row['id'], $myId, 'delete', (string)$row['body']);
        $delete = $conn->prepare("UPDATE activity_comments SET body = '', deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ?");
        $delete->bind_param('ii', $myId, $row['id']);
        $delete->execute();
        $delete->close();
        socialDone(['id' => (int)$row['id']]);
    }

    case 'notifications': {
        $stmt = $conn->prepare(
            "SELECT n.id, n.kind, n.text, n.link, n.actor_user_id, UNIX_TIMESTAMP(n.created_at) AS at, n.read_at
             FROM user_notifications n
             LEFT JOIN classrooms c ON c.id = n.classroom_id AND c.status = 'active'
             WHERE n.user_id = ? AND (n.kind = 'story_feedback' OR c.id IS NOT NULL)
             ORDER BY n.created_at DESC, n.id DESC LIMIT 30"
        );
        $stmt->bind_param('i', $myId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        $count = $conn->prepare(
            "SELECT COUNT(*) FROM user_notifications n
             LEFT JOIN classrooms c ON c.id = n.classroom_id AND c.status = 'active'
             WHERE n.user_id = ? AND n.read_at IS NULL
               AND (n.kind = 'story_feedback' OR c.id IS NOT NULL)"
        );
        $count->bind_param('i', $myId);
        $count->execute();
        $unread = (int)$count->get_result()->fetch_row()[0];
        $count->close();
        $people = socialPeople(array_column($rows, 'actor_user_id'));
        socialDone([
            'unread' => $unread,
            'items' => array_map(static fn($row) => [
                'id' => (int)$row['id'],
                'kind' => (string)$row['kind'],
                'text' => (string)$row['text'],
                'link' => (string)$row['link'],
                'at' => (int)$row['at'],
                'read' => $row['read_at'] !== null,
                'actor' => $row['actor_user_id'] === null ? null : socialPerson($people, (int)$row['actor_user_id']),
            ], $rows),
        ]);
    }

    case 'notifications_read': {
        if ($method !== 'POST') {
            socialFail(405, 'Invalid request.');
        }
        if (!empty($input['all'])) {
            $stmt = $conn->prepare("UPDATE user_notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL");
            $stmt->bind_param('i', $myId);
        } else {
            $ids = array_values(array_filter(array_map('intval', is_array($input['ids'] ?? null) ? array_slice($input['ids'], 0, 100) : [])));
            if (!$ids) {
                socialDone();
            }
            $stmt = $conn->prepare("UPDATE user_notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL AND id IN (" . implode(',', $ids) . ")");
            $stmt->bind_param('i', $myId);
        }
        $stmt->execute();
        $stmt->close();
        socialDone();
    }
}

socialFail(400, 'Unknown action.');
