<?php
require_once('auth.php');
$user = koobdRequireTeacherAuth(true);
$profile = koobdResolvedProfile($user);
$isTeacher = true;
$profileEditPath = 'profile.php';

if (empty($_SESSION['story_approval_csrf'])) {
    $_SESSION['story_approval_csrf'] = bin2hex(random_bytes(32));
}
$csrfToken = (string)$_SESSION['story_approval_csrf'];
$message = '';
$error = '';

function koobdNotifyStoryFeedback(int $studentId, int $teacherId, int $storyId, string $storyTitle, string $teacherName): bool
{
    global $conn;
    if ($studentId <= 0 || $teacherId <= 0 || $storyId <= 0) {
        error_log('Unable to notify the student about story feedback: invalid account or story id.');
        return false;
    }

    $text = $teacherName . ' sent feedback on "' . $storyTitle . '".';
    $text = function_exists('mb_substr') ? mb_substr($text, 0, 250) : substr($text, 0, 250);
    $link = 'teacher_stories.php#storyFeedback-' . $storyId;
    $find = $conn->prepare(
        "SELECT id FROM user_notifications
         WHERE user_id = ? AND actor_user_id = ? AND kind = 'story_feedback'
           AND classroom_id IS NULL AND activity_id = ? AND read_at IS NULL
         LIMIT 1"
    );
    if (!$find) {
        error_log('Unable to prepare a story-feedback notification lookup.');
        return false;
    }
    $find->bind_param('iii', $studentId, $teacherId, $storyId);
    if (!$find->execute()) {
        $find->close();
        error_log('Unable to find an existing story-feedback notification.');
        return false;
    }
    $existing = $find->get_result()->fetch_assoc();
    $find->close();

    if ($existing) {
        $update = $conn->prepare(
            "UPDATE user_notifications SET text = ?, link = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?"
        );
        if (!$update) {
            error_log('Unable to prepare a story-feedback notification update.');
            return false;
        }
        $notificationId = (int)$existing['id'];
        $update->bind_param('ssi', $text, $link, $notificationId);
        $saved = $update->execute();
        $update->close();
        if (!$saved) {
            error_log('Unable to update a story-feedback notification.');
        }
        return $saved;
    }

    $insert = $conn->prepare(
        "INSERT INTO user_notifications (user_id, actor_user_id, kind, classroom_id, activity_id, text, link)
         VALUES (?, ?, 'story_feedback', NULL, ?, ?, ?)"
    );
    if (!$insert) {
        error_log('Unable to prepare a story-feedback notification.');
        return false;
    }
    $insert->bind_param('iiiss', $studentId, $teacherId, $storyId, $text, $link);
    $saved = $insert->execute();
    $insert->close();
    if (!$saved) {
        error_log('Unable to save a story-feedback notification.');
    }
    return $saved;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postedToken = (string)($_POST['csrf_token'] ?? '');
    if ($postedToken === '' || !hash_equals($csrfToken, $postedToken)) {
        http_response_code(403);
        exit('The approval request could not be verified. Reload the page and try again.');
    }

    $code = strtoupper(trim((string)($_POST['submission_code'] ?? '')));
    $decision = (string)($_POST['decision'] ?? '');
    $action = (string)($_POST['action'] ?? '');
    $feedback = trim((string)($_POST['feedback'] ?? ''));
    $feedbackLength = function_exists('mb_strlen') ? mb_strlen($feedback) : strlen($feedback);
    if ($feedbackLength > 5000) {
        $error = 'Feedback must be 5,000 characters or fewer.';
    }
    $submission = koobdTeacherStorySubmissionByCode($code);
    if (!$submission && $error === '') {
        $error = 'No student submission was found for that code.';
    } elseif ($submission && $error === '') {
        $storyId = (int)$submission['id'];
        $teacherId = (int)$user['id'];
        $versionNumber = max(1, (int)($submission['version_number'] ?? 1));
        if ($action === 'mark_reviewed') {
            header('Content-Type: application/json; charset=utf-8');
            $previewedVersion = max(0, (int)($_POST['version_number'] ?? 0));
            if ($submission['status'] !== 'pending_approval' || $previewedVersion !== $versionNumber) {
                http_response_code(409);
                echo json_encode(['ok' => false, 'error' => 'This story version is no longer awaiting review.']);
                exit();
            }
            $reviewStmt = $conn->prepare(
                "INSERT INTO teacher_story_reviews (story_id, version_number, teacher_id, decision)
                 SELECT ?, ?, ?, 'reviewed'
                 WHERE NOT EXISTS (
                   SELECT 1 FROM teacher_story_reviews
                   WHERE story_id = ? AND version_number = ? AND teacher_id = ? AND decision = 'reviewed'
                 )"
            );
            if (!$reviewStmt) {
                error_log('Unable to prepare a completed story review record.');
                http_response_code(500);
                echo json_encode(['ok' => false, 'error' => 'Unable to record the story review.']);
                exit();
            }
            $reviewStmt->bind_param('iiiiii', $storyId, $versionNumber, $teacherId, $storyId, $versionNumber, $teacherId);
            $reviewSaved = $reviewStmt->execute();
            $reviewStmt->close();
            if (!$reviewSaved) {
                error_log('Unable to save a completed story review record.');
                http_response_code(500);
                echo json_encode(['ok' => false, 'error' => 'Unable to record the story review.']);
                exit();
            }
            echo json_encode(['ok' => true]);
            exit();
        }

        $feedbackRequired = in_array($decision, ['request_revision', 'reject', 'comment'], true);
        if ($feedbackRequired && $feedback === '') {
            $error = match ($decision) {
                'request_revision' => 'Add feedback explaining what the student should revise.',
                'reject' => 'Add an explanation for rejecting this story.',
                default => 'Write a feedback message before sending it.',
            };
        }
        $requiresPreview = in_array($decision, ['approve', 'reject', 'request_revision', 'comment'], true);
        if ($error === '' && $requiresPreview && $submission['status'] !== 'pending_approval') {
            $error = 'Only a submission awaiting review can receive a new decision or feedback.';
        }
        $hasReviewedCurrentVersion = false;
        if ($error === '' && $requiresPreview) {
            $reviewCheck = $conn->prepare(
                "SELECT 1 FROM teacher_story_reviews
                 WHERE story_id = ? AND version_number = ? AND teacher_id = ? AND decision = 'reviewed'
                 LIMIT 1"
            );
            if (!$reviewCheck) {
                error_log('Unable to prepare a completed story review check.');
                $error = 'Unable to verify that you reviewed this story. Please preview it again.';
            } else {
                $reviewCheck->bind_param('iii', $storyId, $versionNumber, $teacherId);
                if (!$reviewCheck->execute()) {
                    error_log('Unable to check whether the teacher reviewed this story.');
                    $error = 'Unable to verify that you reviewed this story. Please preview it again.';
                } else {
                    $reviewResult = $reviewCheck->get_result();
                    $hasReviewedCurrentVersion = $reviewResult && $reviewResult->num_rows > 0;
                }
                $reviewCheck->close();
                if ($error === '' && !$hasReviewedCurrentVersion) {
                    $error = 'Preview the complete story before sending feedback or making a decision.';
                }
            }
        }
        $stmt = null;
        $feedbackOnly = $decision === 'comment';
        if ($error === '' && $decision === 'approve' && in_array($submission['status'], ['pending_approval', 'unpublished'], true)) {
            $stmt = $conn->prepare(
                "UPDATE teacher_stories
                 SET status = 'published', approved_by = ?, reviewed_by = ?, reviewed_at = NOW(),
                     approved_version = version_number
                 WHERE id = ? AND status IN ('pending_approval', 'unpublished')"
            );
            if ($stmt) {
                $stmt->bind_param('iii', $teacherId, $teacherId, $storyId);
                $message = 'Story approved and published.';
            }
        } elseif ($error === '' && $decision === 'request_revision' && $submission['status'] === 'pending_approval') {
            $stmt = $conn->prepare(
                "UPDATE teacher_stories
                 SET status = 'revision_required', reviewed_by = ?, reviewed_at = NOW()
                 WHERE id = ? AND status = 'pending_approval'"
            );
            if ($stmt) {
                $stmt->bind_param('ii', $teacherId, $storyId);
                $message = 'Revision requested. The student has been notified.';
            }
        } elseif ($error === '' && $decision === 'reject' && $submission['status'] === 'pending_approval') {
            $stmt = $conn->prepare(
                "UPDATE teacher_stories
                 SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW()
                 WHERE id = ? AND status = 'pending_approval'"
            );
            if ($stmt) {
                $stmt->bind_param('ii', $teacherId, $storyId);
                $message = 'Story submission rejected. The student has been notified.';
            }
        } elseif ($error === '' && $feedbackOnly && $submission['status'] === 'pending_approval') {
            $message = 'Feedback sent to the student.';
        } elseif ($error === '' && $decision === 'unpublish' && $submission['status'] === 'published' && (int)$submission['approved_by'] > 0) {
            $stmt = $conn->prepare(
                "UPDATE teacher_stories
                 SET status = 'unpublished', reviewed_by = ?, reviewed_at = NOW()
                 WHERE id = ? AND status = 'published' AND approved_by IS NOT NULL"
            );
            if ($stmt) {
                $stmt->bind_param('ii', $teacherId, $storyId);
                $message = 'Story publication cancelled.';
            }
        } elseif ($error === '') {
            $error = 'This submission has already been reviewed or the requested action is not available.';
        }

        if (!$stmt && !$feedbackOnly && $error === '') {
            error_log('Unable to prepare a student story approval decision.');
            $error = 'Unable to update this submission. Please try again.';
        }
        if (($stmt || $feedbackOnly) && $error === '') {
            if (!$conn->begin_transaction()) {
                error_log('Unable to begin a student story approval transaction.');
                $error = 'Unable to update this submission. Please try again.';
                $message = '';
            } else {
                if ($stmt && !$stmt->execute()) {
                    $conn->rollback();
                    error_log('Unable to apply a student story approval decision.');
                    $error = 'Unable to update this submission. Please try again.';
                    $message = '';
                } elseif ($stmt && $stmt->affected_rows !== 1) {
                    $conn->rollback();
                    $error = 'This submission was already reviewed in another session.';
                    $message = '';
                } else {
                    if (!$feedbackOnly) {
                        $submission['status'] = match ($decision) {
                            'approve' => 'published',
                            'request_revision' => 'revision_required',
                            'reject' => 'rejected',
                            'unpublish' => 'unpublished',
                        };
                        if ($decision === 'approve') {
                            $submission['approved_by'] = $teacherId;
                            $submission['approved_version'] = (int)$submission['version_number'];
                        }
                    }
                    $historyStmt = $conn->prepare(
                        "INSERT INTO teacher_story_reviews (story_id, version_number, teacher_id, decision, feedback)
                         VALUES (?, ?, ?, ?, NULLIF(?, ''))"
                    );
                    $historyDecision = $decision;
                    $historyFeedback = $feedback;
                    $historyVersion = max(1, (int)($submission['version_number'] ?? 1));
                    if (!$historyStmt) {
                        $conn->rollback();
                        error_log('Unable to prepare a student story review history entry.');
                        $error = 'Unable to update this submission. Please try again.';
                        $message = '';
                    } else {
                        $historyStmt->bind_param('iiiss', $storyId, $historyVersion, $teacherId, $historyDecision, $historyFeedback);
                        if (!$historyStmt->execute()) {
                            $conn->rollback();
                            error_log('Unable to record a student story review decision.');
                            $error = 'Unable to update this submission. Please try again.';
                            $message = '';
                        }
                        $historyStmt->close();
                        if ($error === '' && $feedback !== '' && !koobdNotifyStoryFeedback(
                            (int)$submission['teacher_id'],
                            $teacherId,
                            $storyId,
                            (string)$submission['title'],
                            (string)$profile['name']
                        )) {
                            $conn->rollback();
                            $error = 'Unable to notify the student about this feedback. Please try again.';
                            $message = '';
                        } elseif ($error === '' && !$feedbackOnly && !koobdSyncTeacherStoryToSharedFeed($submission)) {
                            $conn->rollback();
                            $error = 'Unable to update this submission. Please try again.';
                            $message = '';
                        } elseif ($error === '' && !$conn->commit()) {
                            $conn->rollback();
                            error_log('Unable to commit a student story approval transaction.');
                            $error = 'Unable to update this submission. Please try again.';
                            $message = '';
                        }
                    }
                }
            }
        }
        if ($stmt) $stmt->close();
    }

    if ($message !== '' && $error === '') {
        header('Location: approve_stories.php?code=' . rawurlencode($code) . '&result=' . rawurlencode($message));
        exit();
    }
}

$code = strtoupper(trim((string)($_GET['code'] ?? ($_POST['submission_code'] ?? ''))));
$submission = $code !== '' ? koobdTeacherStorySubmissionByCode($code) : null;
$reviewHistory = [];
$hasReviewedCurrentVersion = false;
if ($submission) {
    $reviewCheck = $conn->prepare(
        "SELECT 1 FROM teacher_story_reviews
         WHERE story_id = ? AND version_number = ? AND teacher_id = ? AND decision = 'reviewed'
         LIMIT 1"
    );
    if ($reviewCheck) {
        $reviewStoryId = (int)$submission['id'];
        $reviewVersion = max(1, (int)($submission['version_number'] ?? 1));
        $reviewTeacherId = (int)$user['id'];
        $reviewCheck->bind_param('iii', $reviewStoryId, $reviewVersion, $reviewTeacherId);
        if ($reviewCheck->execute()) {
            $reviewResult = $reviewCheck->get_result();
            $hasReviewedCurrentVersion = $reviewResult && $reviewResult->num_rows > 0;
        } else {
            error_log('Unable to check the teacher review status for a story.');
            $error = 'Unable to verify review status for this submission.';
        }
        $reviewCheck->close();
    } else {
        error_log('Unable to prepare teacher story review status check.');
        $error = 'Unable to verify review status for this submission.';
    }

    $historyStmt = $conn->prepare(
        "SELECT r.version_number, r.decision, r.feedback, r.reviewed_at,
                reviewer.id AS reviewer_id, reviewer.username AS reviewer_username,
                reviewer.profile_reader_name AS reviewer_name, reviewer.selected_reader,
                reviewer.profile_top_color, reviewer.profile_bottom_color, reviewer.profile_accent_color,
                reviewer.profile_card_style, reviewer.profile_scale, reviewer.user_role
         FROM teacher_story_reviews r
         INNER JOIN users reviewer ON reviewer.id = r.teacher_id
         WHERE r.story_id = ?
         ORDER BY r.id DESC"
    );
    if ($historyStmt) {
        $historyStoryId = (int)$submission['id'];
        $historyStmt->bind_param('i', $historyStoryId);
        if ($historyStmt->execute()) {
            $historyResult = $historyStmt->get_result();
            while ($historyResult && ($historyRow = $historyResult->fetch_assoc())) {
                $historyRow['reviewer_name'] = trim((string)($historyRow['reviewer_name'] ?? '')) ?: $historyRow['reviewer_username'];
                $historyRow['reviewer_profile'] = koobdResolvedProfile($historyRow);
                $reviewHistory[] = $historyRow;
            }
        } else {
            error_log('Unable to load student story review history.');
            $error = 'Unable to load this submission’s review history.';
        }
        $historyStmt->close();
    } else {
        error_log('Unable to prepare student story review history.');
        $error = 'Unable to load this submission’s review history.';
    }
}
if ($code !== '' && !$submission && $error === '') {
    $error = 'No student submission was found for that code.';
}
if (isset($_GET['result'])) {
    $message = (string)$_GET['result'];
}

$approvedStories = [];
$listStmt = $conn->prepare(
    "SELECT ts.id, ts.title, ts.description, ts.cover_image, ts.status, ts.submission_code,
            ts.approved_by, ts.reviewed_at,
            creator.username AS student_username,
            creator.profile_reader_name AS student_name,
            reviewer.username AS reviewer_username,
            reviewer.profile_reader_name AS reviewer_name
     FROM teacher_stories ts
     INNER JOIN users creator ON creator.id = ts.teacher_id
     LEFT JOIN users reviewer ON reviewer.id = ts.approved_by
     WHERE creator.user_role <> 'teacher'
       AND ts.status IN ('published', 'unpublished')
       AND ts.approved_by IS NOT NULL
     ORDER BY ts.reviewed_at DESC, ts.updated_at DESC"
);
if ($listStmt) {
    if ($listStmt->execute()) {
        $result = $listStmt->get_result();
        while ($result && ($row = $result->fetch_assoc())) {
            $row['student_name'] = trim((string)($row['student_name'] ?? '')) ?: $row['student_username'];
            $row['reviewer_name'] = trim((string)($row['reviewer_name'] ?? '')) ?: $row['reviewer_username'];
            $approvedStories[] = $row;
        }
    } else {
        error_log('Unable to load approved student stories.');
        $error = 'Unable to load the approved stories list.';
    }
    $listStmt->close();
} else {
    error_log('Unable to prepare the approved student stories list.');
    $error = 'Unable to load the approved stories list.';
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script src="<?= koobdAsset('js/i18n-tl.js') ?>"></script>
  <script src="<?= koobdAsset('js/i18n.js') ?>"></script>
  <script src="<?= koobdAsset('js/performance-mode.js') ?>"></script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KoobD - Approve Stories</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/app.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/teacher-stories.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/approve-stories.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
</head>
<body class="app-bg approval-page">
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-inner">
        <div class="sidebar-top">
          <div class="sidebar-brand-mark"><img src="assets/images/logos/logo.png" alt="KoobD"></div>
          <div class="sidebar-divider"></div>
          <nav class="sidebar-nav" aria-label="Main navigation">
            <a href="home.php" class="sidebar-link" aria-label="Home"><div class="sidebar-icon-box"><img src="assets/images/icons/HOME 1.png" alt=""></div></a>
            <a href="classroom.php" class="sidebar-link" aria-label="Classroom"><div class="sidebar-icon-box"><img src="assets/images/icons/classroom 1.png" alt=""></div></a>
            <a href="teacher_stories.php" class="sidebar-link sidebar-link-stories" aria-label="My Stories"><div class="sidebar-icon-box"><svg class="sidebar-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M8.5 7.5h6M8.5 11h4"/></svg></div></a>
            <?php include __DIR__ . '/sidebar_approve_stories.php'; ?>
            <?php include __DIR__ . '/sidebar_last_read.php'; ?>
            <a href="versus.php" class="sidebar-link sidebar-link-versus" aria-label="Versus Mode"><div class="sidebar-icon-box"><svg class="sidebar-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 6h9A5.5 5.5 0 0 1 22 11.5v1.5a4 4 0 0 1-7.2 2.4L14 14.5h-4l-.8.9A4 4 0 0 1 2 13v-1.5A5.5 5.5 0 0 1 7.5 6z"/><path d="M6 10v4M4 12h4"/></svg></div></a>
            <a href="teacher_create_story.php" class="sidebar-link sidebar-link-add" aria-label="Create story"><div class="sidebar-icon-box sidebar-icon-add">+</div></a>
          </nav>
        </div>
        <div class="sidebar-bottom">
          <div class="sidebar-account sidebar-profile-menu">
            <button type="button" class="sidebar-profile-link" aria-haspopup="true" aria-expanded="false" aria-controls="sidebarProfileMenu" aria-label="Profile menu" title="Profile">
              <span class="sidebar-profile-card" style="--profile-top:<?= htmlspecialchars($profile['top']) ?>; --profile-bottom:<?= htmlspecialchars($profile['bottom']) ?>; --profile-accent:<?= htmlspecialchars($profile['accent']) ?>;">
                <span class="sidebar-profile-avatar"><img src="<?= htmlspecialchars($profile['asset']) ?>" alt="<?= htmlspecialchars($profile['name']) ?>"></span>
                <span class="sidebar-profile-name" translate="no"><?= htmlspecialchars($profile['name']) ?></span>
              </span>
            </button>
            <span class="sidebar-profile-visible-name" translate="no"><?= htmlspecialchars($profile['name']) ?></span>
            <div class="sidebar-profile-popover" id="sidebarProfileMenu" hidden>
              <a href="profile.php" class="sidebar-profile-menu-item"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg><span>My Profile</span></a>
              <form action="logout.php" method="post" class="sidebar-menu-logout-form"><button type="submit" class="sidebar-profile-menu-item is-logout"><img src="assets/images/icons/LOGOUT 1.png" alt=""><span>Log out</span></button></form>
            </div>
          </div>
        </div>
      </div>
    </aside>
    <main class="main">
      <div class="main-inner approval-main">
        <header class="approval-heading">
          <div class="approval-heading-copy">
            <div class="approval-eyebrow"><span class="approval-eyebrow-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v14l-3.5-2-3.5 2-3.5-2L6.5 20 3.5 18V6A1.5 1.5 0 0 1 5 4.5Z"/><path d="m8 11 2.5 2.5L16 8"/></svg></span>Teacher workspace</div>
            <h1>Story approvals</h1>
            <p>Give every student story a thoughtful review before it reaches the community.</p>
          </div>
          <div class="approval-heading-note"><span class="approval-live-dot"></span><span>Review first<br><strong>Publish with confidence</strong></span></div>
        </header>
        <?php if ($message !== ''): ?><div class="approval-notice" role="status"><?= htmlspecialchars($message) ?></div><?php endif; ?>
        <?php if ($error !== ''): ?><div class="approval-notice is-error" role="alert"><?= htmlspecialchars($error) ?></div><?php endif; ?>
        <section class="approval-search-card" aria-labelledby="approvalSearchTitle">
          <div class="approval-section-mark" aria-hidden="true">01</div>
          <div class="approval-search-content">
          <div class="approval-card-heading">
            <div><span class="approval-section-kicker">Start a review</span><h2 id="approvalSearchTitle">Find a student submission</h2></div>
            <p>Ask the student for the unique code shown in <strong>My Stories</strong>.</p>
          </div>
          <form method="get" class="approval-search-form">
            <label for="submissionCode">Submission code</label>
            <div class="approval-code-entry"><span class="approval-input-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.4 15.4 4.2 4.2M8.5 10.8h4.6M10.8 8.5v4.6"/></svg></span><input id="submissionCode" name="code" type="text" value="<?= htmlspecialchars($code) ?>" maxlength="10" minlength="10" pattern="[A-Fa-f0-9]{10}" placeholder="e.g. 4B7D2A91C0" autocomplete="off" autocapitalize="characters" spellcheck="false" required><button type="submit"><span>Find story</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div>
            <span class="approval-input-hint">10-character code · Letters and numbers</span>
          </form>
          </div>
        </section>
        <?php if ($submission): ?>
          <?php
          $reviewHref = 'teacher_story_preview.php?code=' . rawurlencode($submission['submission_code']);
          $studentName = $submission['student_name'];
          $isUpdatedPending = $submission['status'] === 'pending_approval'
              && (int)($submission['version_number'] ?? 1) > 1;
          $statusLabel = $isUpdatedPending ? 'Updated version · Awaiting review' : match ($submission['status']) {
            'pending_approval' => 'Awaiting teacher review',
            'revision_required' => 'Revision Required',
            'published' => 'Approved · Published',
            'unpublished' => 'Approved · Unpublished',
            'rejected' => 'Declined',
            default => ucfirst($submission['status']),
          };
          $reviewCallout = match ($submission['status']) {
            'pending_approval' => 'Review the complete story before approving or declining this submission.',
            'revision_required' => 'The student is revising this story based on your feedback.',
            'published' => 'This story is approved and currently available to readers.',
            'unpublished' => 'This story remains approved but is not currently published.',
            'rejected' => 'This submission was declined and is not published.',
            default => 'Preview the complete story to review its content.',
          };
          ?>
          <article class="approval-submission-card" data-approval-enter>
            <div class="approval-submission-cover">
              <?php if (!empty($submission['cover_image'])): ?><img src="<?= htmlspecialchars($submission['cover_image']) ?>" alt="Cover for <?= htmlspecialchars($submission['title']) ?>"><?php else: ?><span class="approval-cover-fallback"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 5.5v15M8 7h8M8 10.5h6"/></svg>Story cover</span><?php endif; ?>
              <span class="approval-cover-caption">Submission preview</span>
            </div>
            <div class="approval-submission-copy">
              <span class="approval-status is-<?= htmlspecialchars($submission['status']) ?><?= $isUpdatedPending ? ' is-updated-version' : '' ?>"><span class="approval-status-dot"></span><?= htmlspecialchars($statusLabel) ?></span>
              <h2><?= htmlspecialchars($submission['title']) ?></h2>
              <div class="approval-submission-details">
                <div class="approval-detail-item">
                  <span class="approval-detail-label">Student author</span>
                  <p class="approval-student-meta"><span class="approval-avatar" aria-hidden="true"><?= htmlspecialchars(mb_strtoupper(mb_substr($studentName, 0, 1))) ?></span><strong><?= htmlspecialchars($studentName) ?></strong></p>
                </div>
                <div class="approval-detail-item">
                  <span class="approval-detail-label">Submission code</span>
                  <strong class="approval-code-value"><?= htmlspecialchars($submission['submission_code']) ?></strong>
                </div>
                <div class="approval-detail-item">
                  <span class="approval-detail-label">Current version</span>
                  <strong class="approval-detail-value">Version <?= (int)$submission['version_number'] ?></strong>
                </div>
                <?php if ((int)($submission['approved_version'] ?? 0) > 0): ?>
                  <div class="approval-detail-item">
                    <span class="approval-detail-label">Previously approved</span>
                    <strong class="approval-detail-value">Version <?= (int)$submission['approved_version'] ?></strong>
                  </div>
                <?php endif; ?>
                <?php if (!empty($submission['reviewer_name'])): ?>
                  <div class="approval-detail-item">
                    <span class="approval-detail-label">Last reviewed by</span>
                    <strong class="approval-detail-value"><?= htmlspecialchars($submission['reviewer_name']) ?></strong>
                  </div>
                <?php endif; ?>
              </div>
              <?php if ($isUpdatedPending): ?><p class="approval-updated-note">This story has changed since its previous approval. Review the updated version before publishing it.</p><?php endif; ?>
              <?php if ($reviewHistory): ?>
                <div class="approval-history" aria-label="Review activity">
                  <strong>Review activity</strong>
                  <ul>
                    <?php foreach ($reviewHistory as $history): ?>
                      <?php
                      $decisionLabel = match ($history['decision']) {
                        'approve' => 'Approved for publication',
                        'reject' => 'Submission declined',
                        'request_revision' => 'Revision requested',
                        'comment' => 'Feedback sent',
                        'unpublish' => 'Publication withdrawn',
                        'reviewed' => 'Full story reviewed',
                        default => ucfirst($history['decision']),
                      };
                      ?>
                      <li>
                        <span class="approval-history-event"><?= htmlspecialchars($decisionLabel) ?><small>Version <?= (int)$history['version_number'] ?></small></span>
                        <span class="approval-history-meta"><?= htmlspecialchars($history['reviewer_name']) ?><time datetime="<?= htmlspecialchars(date('c', strtotime($history['reviewed_at']))) ?>"><?= htmlspecialchars(date('M j, Y · g:i A', strtotime($history['reviewed_at']))) ?></time></span>
                        <?php if (!empty($history['feedback'])): ?><p class="approval-history-feedback"><?= nl2br(htmlspecialchars($history['feedback'])) ?></p><?php endif; ?>
                      </li>
                    <?php endforeach; ?>
                  </ul>
                </div>
              <?php endif; ?>
              <div class="approval-review-callout"><span class="approval-callout-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 4.5 6v5.5c0 4.7 3.2 7.8 7.5 9.5 4.3-1.7 7.5-4.8 7.5-9.5V6L12 3Z"/><path d="m8.8 12.2 2.1 2.1 4.5-4.7"/></svg></span><span><?= htmlspecialchars($reviewCallout) ?></span></div>
              <div class="approval-submission-actions">
                <a class="approval-preview-button" href="<?= htmlspecialchars($reviewHref) ?>"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/></svg><span>Open story preview</span><svg class="approval-button-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
                <?php if ($submission['status'] === 'pending_approval'): ?>
                  <?php if (!$hasReviewedCurrentVersion): ?><p class="approval-review-lock-note">Complete the story preview before sending feedback or making a decision.</p><?php endif; ?>
                  <form method="post" class="approval-feedback-form<?= $hasReviewedCurrentVersion ? '' : ' is-locked' ?>">
                    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrfToken) ?>">
                    <input type="hidden" name="submission_code" value="<?= htmlspecialchars($submission['submission_code']) ?>">
                    <label class="approval-feedback-label" for="storyFeedback">Feedback / Comments</label>
                    <textarea id="storyFeedback" name="feedback" maxlength="5000" rows="4" placeholder="Share specific suggestions, corrections, observations, or encouragement. Feedback is required for revision requests and rejections." <?= $hasReviewedCurrentVersion ? '' : 'disabled' ?>></textarea>
                    <p class="approval-feedback-hint">Feedback is optional when approving, and required when requesting revisions, rejecting, or sending feedback only.</p>
                    <div class="approval-quick-decisions">
                      <button class="approval-decision-button is-approve" type="submit" name="decision" value="approve" <?= $hasReviewedCurrentVersion ? '' : 'disabled aria-disabled="true" title="Preview the complete story to unlock this action"' ?>>Approve and Publish</button>
                      <button class="approval-decision-button is-revision" type="submit" name="decision" value="request_revision" <?= $hasReviewedCurrentVersion ? '' : 'disabled aria-disabled="true" title="Preview the complete story to unlock this action"' ?>>Request Revision</button>
                      <button class="approval-decision-button is-decline" type="submit" name="decision" value="reject" <?= $hasReviewedCurrentVersion ? '' : 'disabled aria-disabled="true" title="Preview the complete story to unlock this action"' ?>>Reject Submission</button>
                      <button class="approval-decision-button is-feedback" type="submit" name="decision" value="comment" <?= $hasReviewedCurrentVersion ? '' : 'disabled aria-disabled="true" title="Preview the complete story to unlock this action"' ?>>Send Feedback</button>
                    </div>
                  </form>
                <?php endif; ?>
              </div>
            </div>
          </article>
        <?php endif; ?>
        <section class="approval-list-section" aria-labelledby="approvedStoriesTitle">
          <div class="approval-list-heading"><div><span class="approval-section-kicker">Review history</span><h2 id="approvedStoriesTitle">Approved stories</h2><p>Published stories and titles you have previously approved.</p></div><span class="approval-count"><span id="approvalStoryCount" aria-live="polite"><?= count($approvedStories) ?></span><small>stories</small></span></div>
          <?php if (!$approvedStories): ?>
            <div class="approval-empty"><span class="approval-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v14l-3.5-2-3.5 2-3.5-2L6.5 20 3.5 18V6A1.5 1.5 0 0 1 5 4.5Z"/><path d="m8 11 2.5 2.5L16 8"/></svg></span><strong>Your approved stories will appear here</strong><span>After you publish a submission, you can revisit its preview and publication status from this list.</span></div>
          <?php else: ?>
            <div class="approval-list-tools"><label class="approval-list-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.4 15.4 4.2 4.2"/></svg><input type="search" id="approvedStorySearch" placeholder="Search title or student" aria-label="Search approved stories"></label><label class="approval-status-filter"><span>Status</span><select id="approvedStoryStatus" aria-label="Filter approved stories"><option value="all">All statuses</option><option value="published">Published</option><option value="unpublished">Unpublished</option></select></label></div>
            <div class="approval-list">
              <?php foreach ($approvedStories as $approved): ?>
                <?php
                $approvedName = trim((string)($approved['reviewer_name'] ?? '')) ?: (string)$approved['reviewer_username'];
                $createdName = trim((string)($approved['student_name'] ?? '')) ?: (string)$approved['student_username'];
                ?>
                <article class="approval-list-item" data-approval-enter data-title="<?= htmlspecialchars(mb_strtolower($approved['title'])) ?>" data-student="<?= htmlspecialchars(mb_strtolower($createdName)) ?>" data-status="<?= htmlspecialchars($approved['status']) ?>">
                  <div class="approval-list-cover">
                    <?php if (!empty($approved['cover_image'])): ?><img src="<?= htmlspecialchars($approved['cover_image']) ?>" alt="" loading="lazy" decoding="async"><?php else: ?><span class="approval-cover-fallback"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 5.5v15M8 7h8M8 10.5h6"/></svg></span><?php endif; ?>
                  </div>
                  <div class="approval-list-copy">
                    <h3><?= htmlspecialchars($approved['title']) ?></h3>
                    <p><span>By <strong><?= htmlspecialchars($createdName) ?></strong></span><span class="approval-list-separator" aria-hidden="true">·</span><span>Approved by <strong><?= htmlspecialchars($approvedName) ?></strong></span></p>
                    <span class="approval-status is-<?= htmlspecialchars($approved['status']) ?>"><span class="approval-status-dot"></span><?= $approved['status'] === 'published' ? 'Published' : 'Unpublished' ?></span>
                  </div>
                  <a class="approval-list-preview" href="teacher_story_preview.php?code=<?= rawurlencode($approved['submission_code']) ?>"><span>Preview</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
                </article>
              <?php endforeach; ?>
              <div class="approval-filter-empty" id="approvalFilterEmpty" hidden>No approved stories match your search.</div>
            </div>
          <?php endif; ?>
        </section>
      </div>
    </main>
  </div>
  <script>window.KOOBD_SESSION = {role:'teacher'};</script>
  <script src="<?= koobdAsset('js/sidebar.js') ?>"></script>
  <script src="<?= koobdAsset('js/approval-center.js') ?>"></script>
  <script src="<?= koobdAsset('js/koobd-audio.js') ?>"></script>
  <script src="<?= koobdAsset('js/koobd-tutorial.js') ?>"></script>
</body>
</html>
