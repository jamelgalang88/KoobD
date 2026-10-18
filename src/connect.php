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
                $conn->query("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
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
              status VARCHAR(20) NOT NULL DEFAULT 'draft',
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_teacher_story_lookup (teacher_id, status),
            CONSTRAINT fk_teacher_stories_teacher
              FOREIGN KEY (teacher_id) REFERENCES users(id)
              ON DELETE CASCADE
              ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

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

    $koobdSchemaReady = true;
}
?>
