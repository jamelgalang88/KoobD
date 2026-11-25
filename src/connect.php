<?php
$servername = "koobd-db";
$username = "user";
$password = "pass";
$database = "game_db";

$conn = new mysqli($servername, $username, $password, $database);

if ($conn->connect_error) {
    die("Database connection failed: " . $conn->connect_error);
}

static $koobdSchemaReady = false;

// The tables and columns below are checked and brought up to date once for
// each version of this file (its modification time, noted in
// koobd_schema_version), not on every request: the checks take over half a
// second, and pages that ask several times a second (playing a story
// together, open conversations) need quick answers. A fresh or older
// database runs them again.
$koobdSchemaVersion = (string)(@filemtime(__FILE__) ?: '0');
if (!$koobdSchemaReady) {
    try {
        $versionRow = $conn->query("SELECT version FROM koobd_schema_version WHERE id = 1");
        $koobdSchemaReady = $versionRow && ($versionRow->fetch_row()[0] ?? '') === $koobdSchemaVersion;
    } catch (mysqli_sql_exception $error) {
        $koobdSchemaReady = false;
    }
}

if (!$koobdSchemaReady) {
    if (!function_exists('koobdEnsureColumn')) {
        function koobdEnsureColumn(mysqli $conn, string $database, string $table, string $column, string $definition): void
        {
            $stmt = $conn->prepare(
                "SELECT COUNT(*) AS column_count
                 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = ?
                   AND TABLE_NAME = ?
                   AND COLUMN_NAME = ?"
            );
            if (!$stmt) {
                return;
            }

            $stmt->bind_param("sss", $database, $table, $column);
            $stmt->execute();
            $result = $stmt->get_result();
            $row = $result ? $result->fetch_assoc() : null;
            $exists = $row && (int)$row['column_count'] > 0;
            $stmt->close();

            if (!$exists) {
                try {
                    $conn->query("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
                } catch (mysqli_sql_exception $error) {
                    // Another request added it at the same moment (duplicate column).
                    if ($error->getCode() !== 1060) {
                        throw $error;
                    }
                }
            }
        }
    }

    if (!function_exists('koobdEnsureIndex')) {
        function koobdEnsureIndex(mysqli $conn, string $database, string $table, string $indexName, string $alterSql): void
        {
            $stmt = $conn->prepare(
                "SELECT COUNT(*) AS index_count
                 FROM INFORMATION_SCHEMA.STATISTICS
                 WHERE TABLE_SCHEMA = ?
                   AND TABLE_NAME = ?
                   AND INDEX_NAME = ?"
            );
            if (!$stmt) {
                return;
            }

            $stmt->bind_param("sss", $database, $table, $indexName);
            $stmt->execute();
            $result = $stmt->get_result();
            $row = $result ? $result->fetch_assoc() : null;
            $exists = $row && (int)$row['index_count'] > 0;
            $stmt->close();

            if (!$exists) {
                $conn->query($alterSql);
            }
        }
    }

    if (!function_exists('koobdEnsureForeignKey')) {
        function koobdEnsureForeignKey(mysqli $conn, string $database, string $table, string $constraintName, string $alterSql): void
        {
            $stmt = $conn->prepare(
                "SELECT COUNT(*) AS constraint_count
                 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
                 WHERE TABLE_SCHEMA = ?
                   AND TABLE_NAME = ?
                   AND CONSTRAINT_NAME = ?
                   AND CONSTRAINT_TYPE = 'FOREIGN KEY'"
            );
            if (!$stmt) {
                return;
            }

            $stmt->bind_param("sss", $database, $table, $constraintName);
            $stmt->execute();
            $result = $stmt->get_result();
            $row = $result ? $result->fetch_assoc() : null;
            $exists = $row && (int)$row['constraint_count'] > 0;
            $stmt->close();

            if (!$exists) {
                $conn->query($alterSql);
            }
        }
    }

    $userColumns = [
        'selected_reader' => "VARCHAR(50) DEFAULT NULL AFTER password",
        'profile_reader_name' => "VARCHAR(255) DEFAULT NULL AFTER selected_reader",
        'profile_badge_label' => "VARCHAR(50) DEFAULT NULL AFTER profile_reader_name",
        'profile_top_color' => "VARCHAR(20) DEFAULT NULL AFTER profile_badge_label",
        'profile_bottom_color' => "VARCHAR(20) DEFAULT NULL AFTER profile_top_color",
        'profile_accent_color' => "VARCHAR(20) DEFAULT NULL AFTER profile_bottom_color",
        'profile_card_style' => "VARCHAR(50) DEFAULT NULL AFTER profile_accent_color",
        'profile_scale' => "INT NOT NULL DEFAULT 100 AFTER profile_card_style",
        'profile_completed' => "TINYINT(1) NOT NULL DEFAULT 0 AFTER profile_scale",
        'user_role' => "VARCHAR(20) NOT NULL DEFAULT 'student' AFTER profile_completed",
        // The profile page's banner: empty for the character's colours,
        // "color:#rrggbb" for a plain colour, or an uploaded picture's path.
        'profile_banner' => "VARCHAR(255) DEFAULT NULL AFTER user_role",
        // Sound settings (js/koobd-audio.js): master, music, effects and
        // click volumes and mute, as JSON; NULL for the defaults.
        'audio_prefs' => "VARCHAR(255) DEFAULT NULL AFTER profile_banner",
        // The first-time tutorial on Home (js/koobd-tutorial.js): when it was
        // finished or skipped; NULL until then, so it shows once.
        'tutorial_done_at' => "DATETIME DEFAULT NULL AFTER audio_prefs",
    ];

    $userTable = 'users';
    foreach ($userColumns as $columnName => $columnDefinition) {
        koobdEnsureColumn($conn, $database, $userTable, $columnName, $columnDefinition);
    }

      $conn->query(
          "CREATE TABLE IF NOT EXISTS stories (
            id INT AUTO_INCREMENT PRIMARY KEY,
            creator_user_id INT NOT NULL,
            teacher_story_id INT DEFAULT NULL,
            title VARCHAR(255) NOT NULL,
            subtitle TEXT NOT NULL,
            source_file VARCHAR(255) DEFAULT NULL,
            source_file_name VARCHAR(255) DEFAULT NULL,
            cover_image VARCHAR(255) DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_story_feed (created_at, updated_at),
            UNIQUE KEY uniq_teacher_story_id (teacher_story_id),
            CONSTRAINT fk_stories_creator_user
              FOREIGN KEY (creator_user_id) REFERENCES users(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
      );

      koobdEnsureColumn(
          $conn,
          $database,
          'stories',
          'teacher_story_id',
          "INT DEFAULT NULL AFTER creator_user_id"
      );

      koobdEnsureColumn(
          $conn,
          $database,
          'stories',
          'source_file',
          "VARCHAR(255) DEFAULT NULL AFTER teacher_story_id"
      );

      koobdEnsureColumn(
          $conn,
          $database,
          'stories',
          'source_file_name',
          "VARCHAR(255) DEFAULT NULL AFTER source_file"
      );

      koobdEnsureColumn(
          $conn,
          $database,
          'stories',
          'cover_image',
          "VARCHAR(255) DEFAULT NULL AFTER source_file_name"
      );

      koobdEnsureIndex(
          $conn,
          $database,
          'stories',
          'uniq_teacher_story_id',
          "ALTER TABLE stories ADD UNIQUE KEY uniq_teacher_story_id (teacher_story_id)"
      );

      $conn->query(
          "CREATE TABLE IF NOT EXISTS story_progress (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            story_id VARCHAR(50) NOT NULL,
            progress_context VARCHAR(80) NOT NULL DEFAULT 'global',
            story_title VARCHAR(255) NOT NULL,
            progress INT NOT NULL DEFAULT 0,
            progress_state LONGTEXT DEFAULT NULL,
            last_read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_user_story (user_id, story_id, progress_context),
            INDEX idx_user_last_read (user_id, last_read_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
      );

      koobdEnsureColumn(
          $conn,
          $database,
          'story_progress',
          'progress_context',
          "VARCHAR(80) NOT NULL DEFAULT 'global' AFTER story_id"
      );

      $conn->query(
          "UPDATE story_progress
           SET progress_context = 'global'
           WHERE progress_context IS NULL
              OR TRIM(progress_context) = ''"
      );

      $storyProgressIndexStmt = $conn->prepare(
          "SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.STATISTICS
           WHERE TABLE_SCHEMA = ?
             AND TABLE_NAME = 'story_progress'
             AND INDEX_NAME = 'uniq_user_story'
           ORDER BY SEQ_IN_INDEX"
      );

      if ($storyProgressIndexStmt) {
          $storyProgressIndexStmt->bind_param("s", $database);
          $storyProgressIndexStmt->execute();
          $storyProgressIndexResult = $storyProgressIndexStmt->get_result();
          $storyProgressIndexColumns = [];

          if ($storyProgressIndexResult) {
              while ($storyProgressIndexRow = $storyProgressIndexResult->fetch_assoc()) {
                  $storyProgressIndexColumns[] = (string)$storyProgressIndexRow['COLUMN_NAME'];
              }
          }

          $storyProgressIndexStmt->close();

          $storyProgressSignature = implode(',', $storyProgressIndexColumns);
          if ($storyProgressSignature !== 'user_id,story_id,progress_context') {
              if (!empty($storyProgressIndexColumns)) {
                  $conn->query("ALTER TABLE story_progress DROP INDEX uniq_user_story");
              }
              $conn->query(
                  "ALTER TABLE story_progress
                   ADD UNIQUE KEY uniq_user_story (user_id, story_id, progress_context)"
              );
          }
      }

      $conn->query(
          "CREATE TABLE IF NOT EXISTS teacher_stories (
              id INT AUTO_INCREMENT PRIMARY KEY,
              teacher_id INT NOT NULL,
              title VARCHAR(255) NOT NULL,
              description TEXT DEFAULT NULL,
              lesson VARCHAR(255) DEFAULT NULL,
              cover_image VARCHAR(255) DEFAULT NULL,
              story_mode VARCHAR(20) NOT NULL DEFAULT 'regular',
              pages_json LONGTEXT NOT NULL,
              settings_json TEXT DEFAULT NULL,
              status VARCHAR(20) NOT NULL DEFAULT 'draft',
              submission_code CHAR(10) DEFAULT NULL,
              approved_by INT DEFAULT NULL,
              reviewed_by INT DEFAULT NULL,
              reviewed_at DATETIME DEFAULT NULL,
              version_number INT NOT NULL DEFAULT 1,
              approved_version INT DEFAULT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_teacher_story_lookup (teacher_id, status),
              UNIQUE KEY uniq_teacher_story_submission_code (submission_code),
            CONSTRAINT fk_teacher_stories_teacher
              FOREIGN KEY (teacher_id) REFERENCES users(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $conn->query(
        "CREATE TABLE IF NOT EXISTS teacher_story_reviews (
            id INT AUTO_INCREMENT PRIMARY KEY,
            story_id INT NOT NULL,
            version_number INT NOT NULL,
            teacher_id INT NOT NULL,
            decision VARCHAR(20) NOT NULL,
            feedback TEXT DEFAULT NULL,
            reviewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_teacher_story_reviews_story (story_id, reviewed_at),
            CONSTRAINT fk_teacher_story_reviews_story
              FOREIGN KEY (story_id) REFERENCES teacher_stories(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE,
            CONSTRAINT fk_teacher_story_reviews_teacher
              FOREIGN KEY (teacher_id) REFERENCES users(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    koobdEnsureColumn($conn, $database, 'teacher_story_reviews', 'feedback', "TEXT DEFAULT NULL AFTER decision");

    $conn->query(
        "CREATE TABLE IF NOT EXISTS classrooms (
            id INT AUTO_INCREMENT PRIMARY KEY,
            teacher_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            lesson VARCHAR(255) DEFAULT NULL,
            story_id VARCHAR(50) NOT NULL,
            class_code VARCHAR(12) DEFAULT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_teacher_status (teacher_id, status),
            UNIQUE KEY uniq_class_code (class_code),
            CONSTRAINT fk_classroom_teacher_user
              FOREIGN KEY (teacher_id) REFERENCES users(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $conn->query(
        "CREATE TABLE IF NOT EXISTS classroom_students (
            id INT AUTO_INCREMENT PRIMARY KEY,
            classroom_id INT NOT NULL,
            student_user_id INT NOT NULL,
            joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_classroom_student (classroom_id, student_user_id),
            INDEX idx_student_lookup (student_user_id),
            CONSTRAINT fk_classroom_students_classroom
              FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
      );

    // A classroom's activities: each assigns one story, with its own progress
    // (story_progress context "activity:<id>"). One classroom holds many.
    $conn->query(
        "CREATE TABLE IF NOT EXISTS classroom_activities (
            id INT AUTO_INCREMENT PRIMARY KEY,
            classroom_id INT NOT NULL,
            title VARCHAR(255) NOT NULL DEFAULT '',
            instructions TEXT DEFAULT NULL,
            story_id VARCHAR(50) NOT NULL,
            due_date DATE DEFAULT NULL,
            position INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_classroom_position (classroom_id, position),
            CONSTRAINT fk_classroom_activities_classroom
              FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Question activities (Google Forms style): an activity of type "quiz"
    // holds questions (multiple choice or true/false), each with its answer
    // choices, one marked correct. A student submits once; each answer is
    // checked on the server against the answer key.
    $conn->query(
        "CREATE TABLE IF NOT EXISTS activity_questions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            activity_id INT NOT NULL,
            position INT NOT NULL DEFAULT 0,
            question_type VARCHAR(20) NOT NULL DEFAULT 'multiple_choice',
            prompt TEXT NOT NULL,
            INDEX idx_activity_position (activity_id, position),
            CONSTRAINT fk_activity_questions_activity
              FOREIGN KEY (activity_id) REFERENCES classroom_activities(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $conn->query(
        "CREATE TABLE IF NOT EXISTS activity_choices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            question_id INT NOT NULL,
            position INT NOT NULL DEFAULT 0,
            label VARCHAR(500) NOT NULL,
            is_correct TINYINT(1) NOT NULL DEFAULT 0,
            INDEX idx_question_position (question_id, position),
            CONSTRAINT fk_activity_choices_question
              FOREIGN KEY (question_id) REFERENCES activity_questions(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $conn->query(
        "CREATE TABLE IF NOT EXISTS activity_submissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            activity_id INT NOT NULL,
            student_user_id INT NOT NULL,
            score INT NOT NULL DEFAULT 0,
            total INT NOT NULL DEFAULT 0,
            submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_activity_student (activity_id, student_user_id),
            INDEX idx_student_submissions (student_user_id),
            CONSTRAINT fk_activity_submissions_activity
              FOREIGN KEY (activity_id) REFERENCES classroom_activities(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE,
            CONSTRAINT fk_activity_submissions_student
              FOREIGN KEY (student_user_id) REFERENCES users(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $conn->query(
        "CREATE TABLE IF NOT EXISTS activity_submission_answers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            submission_id INT NOT NULL,
            question_id INT NOT NULL,
            choice_id INT DEFAULT NULL,
            is_correct TINYINT(1) NOT NULL DEFAULT 0,
            UNIQUE KEY uniq_submission_question (submission_id, question_id),
            CONSTRAINT fk_submission_answers_submission
              FOREIGN KEY (submission_id) REFERENCES activity_submissions(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Each reader's favourite stories (the heart in the story pop-up; profile.php).
    $conn->query(
        "CREATE TABLE IF NOT EXISTS story_favorites (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            story_key VARCHAR(60) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_user_story (user_id, story_key),
            CONSTRAINT fk_story_favorites_user
              FOREIGN KEY (user_id) REFERENCES users(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

      koobdEnsureColumn(
          $conn,
          $database,
          'teacher_stories',
          'cover_image',
          "VARCHAR(255) DEFAULT NULL AFTER lesson"
      );

      koobdEnsureColumn(
          $conn,
          $database,
          'teacher_stories',
          'story_mode',
          "VARCHAR(20) NOT NULL DEFAULT 'regular' AFTER cover_image"
      );

      // The story's own settings (text font and size), as JSON.
      koobdEnsureColumn(
          $conn,
          $database,
          'teacher_stories',
          'settings_json',
          "TEXT DEFAULT NULL AFTER pages_json"
      );
      koobdEnsureColumn($conn, $database, 'teacher_stories', 'submission_code', "CHAR(10) DEFAULT NULL AFTER status");
      koobdEnsureColumn($conn, $database, 'teacher_stories', 'approved_by', "INT DEFAULT NULL AFTER submission_code");
      koobdEnsureColumn($conn, $database, 'teacher_stories', 'reviewed_by', "INT DEFAULT NULL AFTER approved_by");
      koobdEnsureColumn($conn, $database, 'teacher_stories', 'reviewed_at', "DATETIME DEFAULT NULL AFTER reviewed_by");
      koobdEnsureColumn($conn, $database, 'teacher_stories', 'version_number', "INT NOT NULL DEFAULT 1 AFTER reviewed_at");
      koobdEnsureColumn($conn, $database, 'teacher_stories', 'approved_version', "INT DEFAULT NULL AFTER version_number");
      koobdEnsureIndex(
          $conn,
          $database,
          'teacher_stories',
          'uniq_teacher_story_submission_code',
          "ALTER TABLE teacher_stories ADD UNIQUE KEY uniq_teacher_story_submission_code (submission_code)"
      );
      $conn->query(
          "UPDATE teacher_stories
           SET submission_code = NULL
           WHERE status = 'draft' AND submission_code IS NOT NULL
             AND approved_by IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM teacher_story_reviews r
               WHERE r.story_id = teacher_stories.id
             )"
      );
      $conn->query(
          "UPDATE teacher_stories
           SET approved_version = version_number
           WHERE approved_version IS NULL AND approved_by IS NOT NULL
             AND status IN ('published', 'unpublished')"
      );
      $conn->query(
          "INSERT INTO teacher_story_reviews (story_id, version_number, teacher_id, decision, reviewed_at)
           SELECT ts.id, ts.version_number, ts.approved_by, 'approve', COALESCE(ts.reviewed_at, NOW())
           FROM teacher_stories ts
           WHERE ts.approved_by IS NOT NULL
             AND ts.status IN ('published', 'unpublished')
             AND NOT EXISTS (
               SELECT 1 FROM teacher_story_reviews r
               WHERE r.story_id = ts.id
                 AND r.version_number = ts.version_number
                 AND r.decision = 'approve'
             )"
      );

      // Stories students published before approval existed are private again and
      // must be submitted for teacher review before returning to the public feed.
      $conn->query(
          "UPDATE teacher_stories ts
           INNER JOIN users u ON u.id = ts.teacher_id
           SET ts.status = 'pending_approval', ts.approved_by = NULL, ts.reviewed_by = NULL, ts.reviewed_at = NULL
           WHERE u.user_role <> 'teacher' AND ts.status = 'published'"
      );
      $conn->query(
          "DELETE s FROM stories s
           INNER JOIN teacher_stories ts ON ts.id = s.teacher_story_id
           INNER JOIN users u ON u.id = ts.teacher_id
           WHERE u.user_role <> 'teacher' AND ts.status <> 'published'"
      );

      $conn->query(
          "UPDATE teacher_stories
           SET story_mode = 'regular'
           WHERE story_mode IS NULL
              OR story_mode NOT IN ('regular', 'platformer')"
      );

      koobdEnsureColumn(
          $conn,
          $database,
          'classrooms',
          'class_code',
        "VARCHAR(12) DEFAULT NULL AFTER story_id"
    );

    koobdEnsureIndex(
        $conn,
        $database,
        'classrooms',
        'uniq_class_code',
        "ALTER TABLE classrooms ADD UNIQUE KEY uniq_class_code (class_code)"
    );

    koobdEnsureForeignKey(
        $conn,
        $database,
        'story_progress',
        'fk_story_progress_user',
        "ALTER TABLE story_progress
         ADD CONSTRAINT fk_story_progress_user
         FOREIGN KEY (user_id) REFERENCES users(id)
         ON DELETE CASCADE
         ON UPDATE CASCADE"
    );

    koobdEnsureForeignKey(
        $conn,
        $database,
        'classroom_students',
        'fk_classroom_students_user',
        "ALTER TABLE classroom_students
         ADD CONSTRAINT fk_classroom_students_user
         FOREIGN KEY (student_user_id) REFERENCES users(id)
         ON DELETE CASCADE
         ON UPDATE CASCADE"
    );

    // An activity is a story to read or play ("story") or a set of questions
    // ("quiz"); a quiz can be a draft the students do not see yet.
    koobdEnsureColumn($conn, $database, 'classroom_activities', 'activity_type', "VARCHAR(20) NOT NULL DEFAULT 'story' AFTER classroom_id");
    koobdEnsureColumn($conn, $database, 'classroom_activities', 'status', "VARCHAR(20) NOT NULL DEFAULT 'published' AFTER activity_type");
    koobdEnsureColumn($conn, $database, 'classroom_activities', 'description', "TEXT DEFAULT NULL AFTER title");
    koobdEnsureColumn($conn, $database, 'classroom_activities', 'show_answers', "TINYINT(1) NOT NULL DEFAULT 1 AFTER due_date");
    // A quiz can show its questions in a different order to each student.
    koobdEnsureColumn($conn, $database, 'classroom_activities', 'shuffle_questions', "TINYINT(1) NOT NULL DEFAULT 0 AFTER show_answers");

    // Quiz question types: multiple_choice and true_false (choices, one
    // correct), identification (the student types the answer; its accepted
    // answers are the question's choices, all marked correct) and essay (the
    // student writes an answer; the teacher grades it). Each question is worth
    // `points` (1, or what the teacher sets for an essay).
    koobdEnsureColumn($conn, $database, 'activity_questions', 'points', "INT NOT NULL DEFAULT 1 AFTER prompt");
    // A student's typed answer (identification, essay), the points it earned
    // (NULL: an essay still waiting for the teacher), what it was worth, and
    // the teacher's feedback on an essay.
    $pointsColumn = $conn->query("SHOW COLUMNS FROM activity_submission_answers LIKE 'points_awarded'");
    $hadAnswerPoints = $pointsColumn && $pointsColumn->num_rows > 0;
    koobdEnsureColumn($conn, $database, 'activity_submission_answers', 'answer_text', "TEXT DEFAULT NULL AFTER choice_id");
    koobdEnsureColumn($conn, $database, 'activity_submission_answers', 'points_awarded', "INT DEFAULT NULL AFTER is_correct");
    koobdEnsureColumn($conn, $database, 'activity_submission_answers', 'max_points', "INT NOT NULL DEFAULT 1 AFTER points_awarded");
    koobdEnsureColumn($conn, $database, 'activity_submission_answers', 'feedback', "TEXT DEFAULT NULL AFTER max_points");
    // How many essays in a submission are still waiting to be graded.
    koobdEnsureColumn($conn, $database, 'activity_submissions', 'pending', "INT NOT NULL DEFAULT 0 AFTER total");
    // Answers saved before points existed: each right answer earned its 1 point
    // (once, when the column is added).
    if (!$hadAnswerPoints) {
        $conn->query("UPDATE activity_submission_answers SET points_awarded = is_correct WHERE points_awarded IS NULL");
    }

    // --- Classroom messages and activity comments (classroom_social.php) ---
    // Private messages between a student and their classroom's teacher. One
    // conversation per student per classroom (classroom_id + student_user_id);
    // sender_user_id is the student or the teacher. read_at: when the other
    // person read it. client_token stops a double tap from sending twice.
    $conn->query(
        "CREATE TABLE IF NOT EXISTS classroom_messages (
          id INT AUTO_INCREMENT PRIMARY KEY,
          classroom_id INT NOT NULL,
          student_user_id INT NOT NULL,
          sender_user_id INT NOT NULL,
          body TEXT NOT NULL,
          client_token VARCHAR(64) DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          read_at TIMESTAMP NULL DEFAULT NULL,
          INDEX idx_conversation (classroom_id, student_user_id, id),
          UNIQUE KEY uniq_message_token (sender_user_id, client_token),
          CONSTRAINT fk_messages_classroom
            FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE,
          CONSTRAINT fk_messages_student
            FOREIGN KEY (student_user_id) REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE,
          CONSTRAINT fk_messages_sender
            FOREIGN KEY (sender_user_id) REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    // Public comments on a classroom activity, seen by its classroom. A reply
    // points at the comment it answers (parent_id, one level). A deleted comment
    // keeps its row (deleted_at, deleted_by) so its replies stay in place.
    $conn->query(
        "CREATE TABLE IF NOT EXISTS activity_comments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          activity_id INT NOT NULL,
          classroom_id INT NOT NULL,
          user_id INT NOT NULL,
          parent_id INT DEFAULT NULL,
          body TEXT NOT NULL,
          client_token VARCHAR(64) DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          edited_at TIMESTAMP NULL DEFAULT NULL,
          edited_by INT DEFAULT NULL,
          deleted_at TIMESTAMP NULL DEFAULT NULL,
          deleted_by INT DEFAULT NULL,
          INDEX idx_activity_comments (activity_id, id),
          INDEX idx_comment_parent (parent_id),
          UNIQUE KEY uniq_comment_token (user_id, client_token),
          CONSTRAINT fk_comments_activity
            FOREIGN KEY (activity_id) REFERENCES classroom_activities(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE,
          CONSTRAINT fk_comments_user
            FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    // Every edit or deletion of a comment: who did it and what the text was.
    $conn->query(
        "CREATE TABLE IF NOT EXISTS activity_comment_audit (
          id INT AUTO_INCREMENT PRIMARY KEY,
          comment_id INT NOT NULL,
          actor_user_id INT NOT NULL,
          action VARCHAR(20) NOT NULL,
          previous_body TEXT DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_audit_comment (comment_id),
          CONSTRAINT fk_audit_comment
            FOREIGN KEY (comment_id) REFERENCES activity_comments(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    // When each person last looked at an activity's comments (for "new" dots).
    $conn->query(
        "CREATE TABLE IF NOT EXISTS activity_comment_views (
          user_id INT NOT NULL,
          activity_id INT NOT NULL,
          last_seen_id INT NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, activity_id),
          CONSTRAINT fk_comment_views_user
            FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE,
          CONSTRAINT fk_comment_views_activity
            FOREIGN KEY (activity_id) REFERENCES classroom_activities(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    // Notifications: a new private message or reply (kind 'message'), a reply
    // to someone's comment ('reply'), a new comment on a teacher's activity
    // ('comment'). link: where it leads; read_at: when it was seen.
    $conn->query(
        "CREATE TABLE IF NOT EXISTS user_notifications (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          actor_user_id INT DEFAULT NULL,
          kind VARCHAR(20) NOT NULL,
          classroom_id INT DEFAULT NULL,
          activity_id INT DEFAULT NULL,
          text VARCHAR(255) NOT NULL,
          link VARCHAR(255) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          read_at TIMESTAMP NULL DEFAULT NULL,
          INDEX idx_user_notifications (user_id, read_at, id),
          CONSTRAINT fk_notifications_user
            FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // A private message's sender can edit it (within 5 minutes) or delete it.
    koobdEnsureColumn($conn, $database, 'classroom_messages', 'edited_at', "TIMESTAMP NULL DEFAULT NULL AFTER read_at");
    koobdEnsureColumn($conn, $database, 'classroom_messages', 'deleted_at', "TIMESTAMP NULL DEFAULT NULL AFTER edited_at");
    // Messenger-style messages: a reply points at the message it answers; a
    // photo or video is kept privately (uploads/private-messages, served only
    // through message_media.php to the two people in the conversation);
    // `forwarded` marks a copy forwarded from another conversation;
    // changed_at moves whenever a message changes (edited, deleted, read,
    // reacted to), so an open conversation fetches only what changed.
    koobdEnsureColumn($conn, $database, 'classroom_messages', 'reply_to_id', "INT DEFAULT NULL AFTER body");
    koobdEnsureColumn($conn, $database, 'classroom_messages', 'attachment_path', "VARCHAR(255) DEFAULT NULL AFTER reply_to_id");
    koobdEnsureColumn($conn, $database, 'classroom_messages', 'attachment_kind', "VARCHAR(10) DEFAULT NULL AFTER attachment_path");
    koobdEnsureColumn($conn, $database, 'classroom_messages', 'attachment_mime', "VARCHAR(60) DEFAULT NULL AFTER attachment_kind");
    koobdEnsureColumn($conn, $database, 'classroom_messages', 'attachment_size', "INT DEFAULT NULL AFTER attachment_mime");
    koobdEnsureColumn($conn, $database, 'classroom_messages', 'attachment_name', "VARCHAR(255) DEFAULT NULL AFTER attachment_size");
    koobdEnsureColumn($conn, $database, 'classroom_messages', 'forwarded', "TINYINT(1) NOT NULL DEFAULT 0 AFTER attachment_name");
    koobdEnsureColumn($conn, $database, 'classroom_messages', 'changed_at', "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER deleted_at");
    // Reactions to private messages: one emoji per person per message.
    $conn->query(
        "CREATE TABLE IF NOT EXISTS classroom_message_reactions (
          message_id INT NOT NULL,
          user_id INT NOT NULL,
          emoji VARCHAR(16) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (message_id, user_id),
          CONSTRAINT fk_message_reactions_message
            FOREIGN KEY (message_id) REFERENCES classroom_messages(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE,
          CONSTRAINT fk_message_reactions_user
            FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    // "Delete for me": messages one person has hidden from their own view (the
    // other person still sees them).
    $conn->query(
        "CREATE TABLE IF NOT EXISTS classroom_message_hidden (
          message_id INT NOT NULL,
          user_id INT NOT NULL,
          PRIMARY KEY (message_id, user_id),
          CONSTRAINT fk_message_hidden_message
            FOREIGN KEY (message_id) REFERENCES classroom_messages(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE,
          CONSTRAINT fk_message_hidden_user
            FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    // "Clear conversation": one person's view of a conversation starts after
    // this message (the other person's history is untouched).
    $conn->query(
        "CREATE TABLE IF NOT EXISTS classroom_message_cleared (
          classroom_id INT NOT NULL,
          student_user_id INT NOT NULL,
          user_id INT NOT NULL,
          cleared_through_id INT NOT NULL DEFAULT 0,
          PRIMARY KEY (classroom_id, student_user_id, user_id),
          CONSTRAINT fk_message_cleared_classroom
            FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE,
          CONSTRAINT fk_message_cleared_user
            FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Questions placed inside a story activity: where in the story
    // ('scene:<id>', 'page:<key>', 'place:<key>' or 'end') and whether the
    // reader may skip it. Quiz questions leave story_point empty.
    koobdEnsureColumn($conn, $database, 'activity_questions', 'story_point', "VARCHAR(80) DEFAULT NULL AFTER points");
    koobdEnsureColumn($conn, $database, 'activity_questions', 'optional', "TINYINT(1) NOT NULL DEFAULT 0 AFTER story_point");
    // The language a question is read aloud and spoken in (js/koobd-speech.js):
    // 'en-US', 'fil-PH', or 'auto' (Filipino when it reads as Tagalog).
    koobdEnsureColumn($conn, $database, 'activity_questions', 'speech_lang', "VARCHAR(10) NOT NULL DEFAULT 'auto' AFTER optional");
    // The teacher's own recording of a "Say it" phrase (teacher_question_audio.php).
    koobdEnsureColumn($conn, $database, 'activity_questions', 'audio_path', "VARCHAR(255) DEFAULT NULL AFTER speech_lang");
    // A Platform Mode story activity the class can play together.
    koobdEnsureColumn($conn, $database, 'classroom_activities', 'multiplayer', "TINYINT(1) NOT NULL DEFAULT 0 AFTER shuffle_questions");
    // Where each player in a multiplayer story activity is right now (one row
    // per player; rows not updated for a while are players who left).
    $conn->query(
        "CREATE TABLE IF NOT EXISTS story_presence (
            activity_id INT NOT NULL,
            user_id INT NOT NULL,
            page_index INT NOT NULL DEFAULT 0,
            scene_id VARCHAR(80) DEFAULT NULL,
            pos_x DECIMAL(9,2) NOT NULL DEFAULT 0,
            pos_y DECIMAL(9,2) NOT NULL DEFAULT 0,
            facing TINYINT NOT NULL DEFAULT 1,
            progress DECIMAL(5,2) NOT NULL DEFAULT 0,
            state VARCHAR(20) NOT NULL DEFAULT 'playing',
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (activity_id, user_id),
            INDEX idx_presence_fresh (activity_id, updated_at),
            CONSTRAINT fk_presence_activity
              FOREIGN KEY (activity_id) REFERENCES classroom_activities(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE,
            CONSTRAINT fk_presence_user
              FOREIGN KEY (user_id) REFERENCES users(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // The player's movement since their last report (a short JSON list of
    // timed samples: place, facing, running, on the ground, vertical speed)
    // and when the server got it (ms), so classmates can replay it smoothly.
    koobdEnsureColumn($conn, $database, 'story_presence', 'trail', "TEXT DEFAULT NULL AFTER state");
    koobdEnsureColumn($conn, $database, 'story_presence', 'sample_ms', "BIGINT NOT NULL DEFAULT 0 AFTER trail");

    // The question order each student gets in a shuffled quiz, chosen once so
    // it stays the same when they reload or come back (a JSON list of ids).
    $conn->query(
        "CREATE TABLE IF NOT EXISTS activity_question_orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            activity_id INT NOT NULL,
            student_user_id INT NOT NULL,
            question_order TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_activity_student_order (activity_id, student_user_id),
            CONSTRAINT fk_question_orders_activity
              FOREIGN KEY (activity_id) REFERENCES classroom_activities(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE,
            CONSTRAINT fk_question_orders_student
              FOREIGN KEY (student_user_id) REFERENCES users(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Versus Mode (versus.php, versus_api.php): two students race in a platform
    // arena to collect a word's letters and answer a question about it. A lobby
    // has a short code, the host's settings and the match's score.
    $conn->query(
        "CREATE TABLE IF NOT EXISTS vs_lobbies (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          code CHAR(6) NOT NULL,
          host_id INT NOT NULL,
          guest_id INT DEFAULT NULL,
          win_target TINYINT NOT NULL DEFAULT 3,
          lang VARCHAR(3) NOT NULL DEFAULT 'en',
          status VARCHAR(12) NOT NULL DEFAULT 'waiting',
          guest_ready TINYINT(1) NOT NULL DEFAULT 0,
          host_score TINYINT NOT NULL DEFAULT 0,
          guest_score TINYINT NOT NULL DEFAULT 0,
          winner_id INT DEFAULT NULL,
          result VARCHAR(12) DEFAULT NULL,
          host_seen_ms BIGINT NOT NULL DEFAULT 0,
          guest_seen_ms BIGINT NOT NULL DEFAULT 0,
          rematch_lobby_id INT DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          started_at TIMESTAMP NULL DEFAULT NULL,
          finished_at TIMESTAMP NULL DEFAULT NULL,
          UNIQUE KEY uniq_vs_code (code),
          INDEX idx_vs_host (host_id, status),
          INDEX idx_vs_guest (guest_id, status),
          CONSTRAINT fk_vs_lobby_host
            FOREIGN KEY (host_id) REFERENCES users (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE,
          CONSTRAINT fk_vs_lobby_guest
            FOREIGN KEY (guest_id) REFERENCES users (id)
            ON DELETE SET NULL
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    // A round: its word (and its questions, which only the server reads), where
    // its letters are in the arena, when it starts and ends, and who won it.
    $conn->query(
        "CREATE TABLE IF NOT EXISTS vs_rounds (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          lobby_id INT NOT NULL,
          round_no INT NOT NULL,
          word VARCHAR(20) NOT NULL,
          lang VARCHAR(3) NOT NULL,
          questions_json TEXT NOT NULL,
          layout_json TEXT NOT NULL,
          start_ms BIGINT NOT NULL,
          ended_ms BIGINT DEFAULT NULL,
          winner_id INT DEFAULT NULL,
          UNIQUE KEY uniq_vs_round (lobby_id, round_no),
          CONSTRAINT fk_vs_round_lobby
            FOREIGN KEY (lobby_id) REFERENCES vs_lobbies (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    // One player's private progress in a round: the letters they collected, when
    // they finished the word, the question they were given and their answers.
    $conn->query(
        "CREATE TABLE IF NOT EXISTS vs_progress (
          round_id INT NOT NULL,
          user_id INT NOT NULL,
          collected_json TEXT NOT NULL,
          next_index TINYINT NOT NULL DEFAULT 0,
          letters_collected SMALLINT NOT NULL DEFAULT 0,
          wrong_pickups SMALLINT NOT NULL DEFAULT 0,
          word_done_ms BIGINT DEFAULT NULL,
          question_json TEXT DEFAULT NULL,
          question_token VARCHAR(16) DEFAULT NULL,
          q_variant TINYINT NOT NULL DEFAULT 0,
          locked_until_ms BIGINT NOT NULL DEFAULT 0,
          wrong_answers TINYINT NOT NULL DEFAULT 0,
          correct_ms BIGINT DEFAULT NULL,
          last_action_ms BIGINT NOT NULL DEFAULT 0,
          PRIMARY KEY (round_id, user_id),
          CONSTRAINT fk_vs_progress_round
            FOREIGN KEY (round_id) REFERENCES vs_rounds (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE,
          CONSTRAINT fk_vs_progress_user
            FOREIGN KEY (user_id) REFERENCES users (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    // Where each player is (the last movement the server accepted).
    $conn->query(
        "CREATE TABLE IF NOT EXISTS vs_positions (
          lobby_id INT NOT NULL,
          user_id INT NOT NULL,
          pos_x DECIMAL(7,2) NOT NULL DEFAULT 0,
          pos_y DECIMAL(7,2) NOT NULL DEFAULT 0,
          trail TEXT DEFAULT NULL,
          sample_ms BIGINT NOT NULL DEFAULT 0,
          rejected INT NOT NULL DEFAULT 0,
          PRIMARY KEY (lobby_id, user_id),
          CONSTRAINT fk_vs_position_lobby
            FOREIGN KEY (lobby_id) REFERENCES vs_lobbies (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    // Actions already handled (each carries a one-time id), so a repeated
    // request is never counted twice.
    $conn->query(
        "CREATE TABLE IF NOT EXISTS vs_events (
          lobby_id INT NOT NULL,
          user_id INT NOT NULL,
          event_id VARCHAR(24) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (lobby_id, user_id, event_id),
          CONSTRAINT fk_vs_event_lobby
            FOREIGN KEY (lobby_id) REFERENCES vs_lobbies (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    // Hearts and hints: each round's hint, why it ended ('answer' or
    // 'hearts'), and each player's hearts and the wrong letters they tried.
    koobdEnsureColumn($conn, $database, 'vs_rounds', 'hint', 'VARCHAR(255) DEFAULT NULL');
    koobdEnsureColumn($conn, $database, 'vs_rounds', 'end_reason', 'VARCHAR(10) DEFAULT NULL');
    koobdEnsureColumn($conn, $database, 'vs_progress', 'hearts', 'TINYINT NOT NULL DEFAULT 3');
    koobdEnsureColumn($conn, $database, 'vs_progress', 'tried_json', 'TEXT DEFAULT NULL');
    // Word difficulty: the lobby's choice ('mixed', 'easy', 'medium', 'hard')
    // and each round's level.
    koobdEnsureColumn($conn, $database, 'vs_lobbies', 'level', "VARCHAR(8) NOT NULL DEFAULT 'mixed'");
    koobdEnsureColumn($conn, $database, 'vs_rounds', 'level', 'VARCHAR(8) DEFAULT NULL');
    // Fair play: actions the server turned down (too fast, too far, too early,
    // repeated...), for teachers to review. Nobody is banned automatically.
    $conn->query(
        "CREATE TABLE IF NOT EXISTS vs_flags (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          lobby_id INT NOT NULL,
          user_id INT NOT NULL,
          kind VARCHAR(20) NOT NULL,
          detail VARCHAR(255) DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_vs_flags (lobby_id, user_id),
          CONSTRAINT fk_vs_flag_lobby
            FOREIGN KEY (lobby_id) REFERENCES vs_lobbies (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Screen time (screen_time_lib.php): a student's estimated active time, in
    // 30-second slots (slot = Unix time / 30). One row per student per slot, so
    // two tabs or two devices at once never count twice; `secs` is how much of
    // the slot they were active (the most any tab saw). The classroom is the
    // one the page belongs to (an activity or the classroom's own page), worked
    // out by the server; NULL for general pages (home, Versus Mode...).
    $conn->query(
        "CREATE TABLE IF NOT EXISTS st_slots (
          user_id INT NOT NULL,
          slot INT UNSIGNED NOT NULL,
          secs TINYINT UNSIGNED NOT NULL,
          category VARCHAR(10) NOT NULL,
          page VARCHAR(40) NOT NULL,
          classroom_id INT DEFAULT NULL,
          activity_id INT DEFAULT NULL,
          PRIMARY KEY (user_id, slot),
          INDEX idx_st_classroom (classroom_id, slot),
          CONSTRAINT fk_st_slot_user
            FOREIGN KEY (user_id) REFERENCES users (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    // Each classroom's screen-time threshold: minutes a day above which a
    // student is pointed out to the teacher.
    $conn->query(
        "CREATE TABLE IF NOT EXISTS st_classroom_settings (
          classroom_id INT NOT NULL PRIMARY KEY,
          daily_limit_min SMALLINT UNSIGNED NOT NULL DEFAULT 60,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_st_settings_classroom
            FOREIGN KEY (classroom_id) REFERENCES classrooms (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    // Word meanings for the story readers' Words panel (word_definition.php),
    // kept once looked up; data is NULL when the dictionary has none.
    $conn->query(
        "CREATE TABLE IF NOT EXISTS word_definitions (
          lang VARCHAR(8) NOT NULL,
          word VARCHAR(64) NOT NULL,
          data TEXT DEFAULT NULL,
          fetched_at DATETIME NOT NULL,
          PRIMARY KEY (lang, word)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin"
    );

    // Writing Practice (writing.php, writing_api.php): each student's notepads
    // and timed challenges. A challenge keeps its own clock (started/ends, in
    // ms), whether it was completed, interrupted or resumed, and the feedback
    // shown when it ended (feedback, and the AI review when there is one).
    $conn->query(
        "CREATE TABLE IF NOT EXISTS writing_notes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          title VARCHAR(120) NOT NULL DEFAULT '',
          lang CHAR(2) NOT NULL DEFAULT 'en',
          body MEDIUMTEXT NOT NULL,
          kind VARCHAR(12) NOT NULL DEFAULT 'note',
          ignored TEXT DEFAULT NULL,
          challenge_seconds INT DEFAULT NULL,
          challenge_started_ms BIGINT DEFAULT NULL,
          challenge_ends_ms BIGINT DEFAULT NULL,
          challenge_seen_ms BIGINT DEFAULT NULL,
          challenge_status VARCHAR(12) DEFAULT NULL,
          challenge_resumed TINYINT(1) NOT NULL DEFAULT 0,
          feedback MEDIUMTEXT DEFAULT NULL,
          ai_review MEDIUMTEXT DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_writing_user (user_id, updated_at),
          CONSTRAINT fk_writing_user
            FOREIGN KEY (user_id) REFERENCES users (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    // Minigames (minigames.php, minigames_api.php): each player's best score
    // and number of plays, per game and variant (Word Catch: language and
    // level; Fix the Story: the story).
    $conn->query(
        "CREATE TABLE IF NOT EXISTS minigame_scores (
          user_id INT NOT NULL,
          game VARCHAR(20) NOT NULL,
          variant VARCHAR(40) NOT NULL,
          best INT NOT NULL DEFAULT 0,
          last_score INT NOT NULL DEFAULT 0,
          plays INT NOT NULL DEFAULT 0,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, game, variant),
          CONSTRAINT fk_minigame_user
            FOREIGN KEY (user_id) REFERENCES users (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $conn->query(
        "CREATE TABLE IF NOT EXISTS user_minigame_unlocks (
          user_id INT NOT NULL,
          game VARCHAR(20) NOT NULL,
          unlocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, game),
          CONSTRAINT fk_user_minigame_unlocks_user
            FOREIGN KEY (user_id) REFERENCES users (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $conn->query(
        "CREATE TABLE IF NOT EXISTS user_mission_events (
          user_id INT NOT NULL,
          role VARCHAR(12) NOT NULL,
          mission_key VARCHAR(40) NOT NULL,
          completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, role, mission_key),
          CONSTRAINT fk_user_mission_events_user
            FOREIGN KEY (user_id) REFERENCES users (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $conn->query(
        "CREATE TABLE IF NOT EXISTS user_mission_tutorial_progress (
            user_id INT NOT NULL,
            role VARCHAR(12) NOT NULL,
            mission_key VARCHAR(40) NOT NULL,
            step_index SMALLINT UNSIGNED NOT NULL DEFAULT 0,
            completed_at TIMESTAMP NULL DEFAULT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, role, mission_key),
            CONSTRAINT fk_user_mission_tutorial_progress_user
              FOREIGN KEY (user_id) REFERENCES users (id)
              ON DELETE CASCADE
              ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $conn->query(
        "CREATE TABLE IF NOT EXISTS user_achievements (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          role VARCHAR(12) NOT NULL,
          achievement_key VARCHAR(60) NOT NULL,
          earned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          notified_at TIMESTAMP NULL DEFAULT NULL,
          UNIQUE KEY uniq_user_achievement (user_id, role, achievement_key),
          INDEX idx_user_achievement_notice (user_id, role, notified_at, earned_at),
          CONSTRAINT fk_user_achievements_user
            FOREIGN KEY (user_id) REFERENCES users (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $conn->query(
        "CREATE TABLE IF NOT EXISTS user_achievement_sync (
          user_id INT NOT NULL,
          role VARCHAR(12) NOT NULL,
          initialized_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, role),
          CONSTRAINT fk_user_achievement_sync_user
            FOREIGN KEY (user_id) REFERENCES users (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $conn->query(
        "CREATE TABLE IF NOT EXISTS user_achievement_events (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          role VARCHAR(12) NOT NULL,
          event_key VARCHAR(40) NOT NULL,
          evidence_key VARCHAR(120) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_user_achievement_event (user_id, role, event_key, evidence_key),
          INDEX idx_user_achievement_event (user_id, role, event_key),
          CONSTRAINT fk_user_achievement_events_user
            FOREIGN KEY (user_id) REFERENCES users (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $conn->query("CREATE TABLE IF NOT EXISTS koobd_schema_version (id TINYINT NOT NULL PRIMARY KEY, version VARCHAR(40) NOT NULL) ENGINE=InnoDB");
    $versionStmt = $conn->prepare("INSERT INTO koobd_schema_version (id, version) VALUES (1, ?) ON DUPLICATE KEY UPDATE version = VALUES(version)");
    $versionStmt->bind_param('s', $koobdSchemaVersion);
    $versionStmt->execute();
    $versionStmt->close();
    $koobdSchemaReady = true;
}

// Quick data fixes, still on every request.
{
    // Classrooms from before activities kept one story on the classroom itself.
    // That story becomes the classroom's first activity, its students' progress
    // moves with it, and the classroom's own story is cleared (so this runs once).
    $legacyClassrooms = $conn->query("SELECT id FROM classrooms WHERE story_id <> '' LIMIT 1");
    if ($legacyClassrooms && $legacyClassrooms->num_rows > 0) {
        $conn->query(
            "INSERT INTO classroom_activities (classroom_id, title, story_id, position, created_at)
             SELECT c.id, '', c.story_id, 1, c.created_at
             FROM classrooms c
             WHERE c.story_id <> ''
               AND NOT EXISTS (SELECT 1 FROM classroom_activities a WHERE a.classroom_id = c.id AND a.story_id = c.story_id)"
        );
        $conn->query(
            "UPDATE story_progress sp
             INNER JOIN classrooms c ON sp.progress_context = CONCAT('classroom:', c.id) AND sp.story_id = c.story_id
             INNER JOIN classroom_activities a ON a.classroom_id = c.id AND a.story_id = c.story_id
             SET sp.progress_context = CONCAT('activity:', a.id)
             WHERE c.story_id <> ''"
        );
        $conn->query("UPDATE classrooms SET story_id = '' WHERE story_id <> ''");
    }

    $conn->query(
        "UPDATE users
         SET profile_badge_label = 'Teacher'
         WHERE user_role = 'teacher'
           AND (profile_badge_label IS NULL OR TRIM(profile_badge_label) = '' OR profile_badge_label <> 'Teacher')"
    );
}
?>
