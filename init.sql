-- KoobD database initialization
-- This file is mounted into the MySQL container at:
-- /docker-entrypoint-initdb.d/00-init.sql

CREATE DATABASE IF NOT EXISTS game_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON game_db.* TO 'user'@'%';
FLUSH PRIVILEGES;

USE game_db;

-- Core accounts and profiles
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  selected_reader VARCHAR(50) DEFAULT NULL,
  profile_reader_name VARCHAR(255) DEFAULT NULL,
  profile_badge_label VARCHAR(50) DEFAULT NULL,
  profile_top_color VARCHAR(20) DEFAULT NULL,
  profile_bottom_color VARCHAR(20) DEFAULT NULL,
  profile_accent_color VARCHAR(20) DEFAULT NULL,
  profile_card_style VARCHAR(50) DEFAULT NULL,
  profile_scale INT NOT NULL DEFAULT 100,
  profile_completed TINYINT(1) NOT NULL DEFAULT 0,
  user_role VARCHAR(20) NOT NULL DEFAULT 'student',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_email (email),
  UNIQUE KEY uniq_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Shared stories created by students and teachers
CREATE TABLE IF NOT EXISTS stories (
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
    FOREIGN KEY (creator_user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reading progress for built-in and classroom-only stories
CREATE TABLE IF NOT EXISTS story_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  story_id VARCHAR(50) NOT NULL,
  progress_context VARCHAR(80) NOT NULL DEFAULT 'global',
  story_title VARCHAR(255) NOT NULL,
  progress INT NOT NULL DEFAULT 0,
  progress_state LONGTEXT DEFAULT NULL,
  last_read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_story (user_id, story_id, progress_context),
  INDEX idx_user_last_read (user_id, last_read_at),
  CONSTRAINT fk_story_progress_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Teacher-made classroom-only stories
CREATE TABLE IF NOT EXISTS teacher_stories (
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
    FOREIGN KEY (teacher_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Teacher classrooms
CREATE TABLE IF NOT EXISTS classrooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  lesson VARCHAR(255) DEFAULT NULL,
  -- Unused since activities (classroom_activities); kept empty.
  story_id VARCHAR(50) NOT NULL DEFAULT '',
  class_code VARCHAR(12) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_teacher_status (teacher_id, status),
  UNIQUE KEY uniq_class_code (class_code),
  CONSTRAINT fk_classroom_teacher_user
    FOREIGN KEY (teacher_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Student membership per classroom
CREATE TABLE IF NOT EXISTS classroom_students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  classroom_id INT NOT NULL,
  student_user_id INT NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_classroom_student (classroom_id, student_user_id),
  INDEX idx_student_lookup (student_user_id),
  CONSTRAINT fk_classroom_students_classroom
    FOREIGN KEY (classroom_id) REFERENCES classrooms (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_classroom_students_user
    FOREIGN KEY (student_user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A classroom's activities: each assigns one story, with its own progress
-- (story_progress context "activity:<id>"). One classroom holds many.
CREATE TABLE IF NOT EXISTS classroom_activities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  classroom_id INT NOT NULL,
  -- 'story' (read or play a story) or 'quiz' (questions); a quiz can be a 'draft'.
  activity_type VARCHAR(20) NOT NULL DEFAULT 'story',
  status VARCHAR(20) NOT NULL DEFAULT 'published',
  title VARCHAR(255) NOT NULL DEFAULT '',
  description TEXT DEFAULT NULL,
  instructions TEXT DEFAULT NULL,
  story_id VARCHAR(50) NOT NULL DEFAULT '',
  due_date DATE DEFAULT NULL,
  -- Quizzes: whether students see the correct answers after submitting.
  show_answers TINYINT(1) NOT NULL DEFAULT 1,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_classroom_position (classroom_id, position),
  CONSTRAINT fk_classroom_activities_classroom
    FOREIGN KEY (classroom_id) REFERENCES classrooms (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Question activities: questions, their answer choices (one correct), and
-- each student's single submission with its checked answers.
CREATE TABLE IF NOT EXISTS activity_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  activity_id INT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  question_type VARCHAR(20) NOT NULL DEFAULT 'multiple_choice',
  prompt TEXT NOT NULL,
  INDEX idx_activity_position (activity_id, position),
  CONSTRAINT fk_activity_questions_activity
    FOREIGN KEY (activity_id) REFERENCES classroom_activities (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_choices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_id INT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  label VARCHAR(500) NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_question_position (question_id, position),
  CONSTRAINT fk_activity_choices_question
    FOREIGN KEY (question_id) REFERENCES activity_questions (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  activity_id INT NOT NULL,
  student_user_id INT NOT NULL,
  score INT NOT NULL DEFAULT 0,
  total INT NOT NULL DEFAULT 0,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_activity_student (activity_id, student_user_id),
  INDEX idx_student_submissions (student_user_id),
  CONSTRAINT fk_activity_submissions_activity
    FOREIGN KEY (activity_id) REFERENCES classroom_activities (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_activity_submissions_student
    FOREIGN KEY (student_user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_submission_answers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  question_id INT NOT NULL,
  choice_id INT DEFAULT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uniq_submission_question (submission_id, question_id),
  CONSTRAINT fk_submission_answers_submission
    FOREIGN KEY (submission_id) REFERENCES activity_submissions (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Each reader's favourite stories (the heart in the story pop-up; profile.php).
CREATE TABLE IF NOT EXISTS story_favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  story_key VARCHAR(60) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_story (user_id, story_key),
  CONSTRAINT fk_story_favorites_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
