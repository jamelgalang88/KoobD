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
  profile_banner VARCHAR(255) DEFAULT NULL,
  audio_prefs VARCHAR(255) DEFAULT NULL,
  tutorial_done_at DATETIME DEFAULT NULL,
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
    FOREIGN KEY (teacher_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_story_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  story_id INT NOT NULL,
  version_number INT NOT NULL,
  teacher_id INT NOT NULL,
  decision VARCHAR(20) NOT NULL,
  feedback TEXT DEFAULT NULL,
  reviewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_teacher_story_reviews_story (story_id, reviewed_at),
  CONSTRAINT fk_teacher_story_reviews_story
    FOREIGN KEY (story_id) REFERENCES teacher_stories (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_teacher_story_reviews_teacher
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
  -- Quizzes: whether each student gets the questions in their own order.
  shuffle_questions TINYINT(1) NOT NULL DEFAULT 0,
  -- Platform Mode story activities: classmates can play together.
  multiplayer TINYINT(1) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_classroom_position (classroom_id, position),
  CONSTRAINT fk_classroom_activities_classroom
    FOREIGN KEY (classroom_id) REFERENCES classrooms (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Question activities: questions (multiple_choice, true_false, identification,
-- essay), their answer choices (one correct; for identification, every
-- accepted answer), and each student's single submission with its answers.
CREATE TABLE IF NOT EXISTS activity_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  activity_id INT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  question_type VARCHAR(20) NOT NULL DEFAULT 'multiple_choice',
  prompt TEXT NOT NULL,
  points INT NOT NULL DEFAULT 1,
  -- Questions inside a story activity: where in the story, and whether the
  -- reader may skip them. Empty for quiz questions.
  story_point VARCHAR(80) DEFAULT NULL,
  optional TINYINT(1) NOT NULL DEFAULT 0,
  -- The language it is read aloud and spoken in: en-US, fil-PH or auto.
  speech_lang VARCHAR(10) NOT NULL DEFAULT 'auto',
  -- The teacher's own recording of a "Say it" phrase.
  audio_path VARCHAR(255) DEFAULT NULL,
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
  pending INT NOT NULL DEFAULT 0,
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
  answer_text TEXT DEFAULT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  points_awarded INT DEFAULT NULL,
  max_points INT NOT NULL DEFAULT 1,
  feedback TEXT DEFAULT NULL,
  UNIQUE KEY uniq_submission_question (submission_id, question_id),
  CONSTRAINT fk_submission_answers_submission
    FOREIGN KEY (submission_id) REFERENCES activity_submissions (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The question order each student gets in a shuffled quiz (a JSON list of
-- question ids), kept so it stays the same when they reload or come back.
CREATE TABLE IF NOT EXISTS activity_question_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  activity_id INT NOT NULL,
  student_user_id INT NOT NULL,
  question_order TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_activity_student_order (activity_id, student_user_id),
  CONSTRAINT fk_question_orders_activity
    FOREIGN KEY (activity_id) REFERENCES classroom_activities (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_question_orders_student
    FOREIGN KEY (student_user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Private messages between a student and their classroom's teacher. One
-- conversation per student per classroom (classroom_id + student_user_id);
-- sender_user_id is the student or the teacher. read_at: when the other
-- person read it. client_token stops a double tap from sending twice.
CREATE TABLE IF NOT EXISTS classroom_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  classroom_id INT NOT NULL,
  student_user_id INT NOT NULL,
  sender_user_id INT NOT NULL,
  body TEXT NOT NULL,
  client_token VARCHAR(64) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL DEFAULT NULL,
  -- The sender can edit a message within 5 minutes and delete it any time.
  edited_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  -- Messenger-style: what a reply answers, a private photo or video, a
  -- forwarded copy, and when the message last changed.
  reply_to_id INT DEFAULT NULL,
  attachment_path VARCHAR(255) DEFAULT NULL,
  attachment_kind VARCHAR(10) DEFAULT NULL,
  attachment_mime VARCHAR(60) DEFAULT NULL,
  attachment_size INT DEFAULT NULL,
  attachment_name VARCHAR(255) DEFAULT NULL,
  forwarded TINYINT(1) NOT NULL DEFAULT 0,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_conversation (classroom_id, student_user_id, id),
  UNIQUE KEY uniq_message_token (sender_user_id, client_token),
  CONSTRAINT fk_messages_classroom
    FOREIGN KEY (classroom_id) REFERENCES classrooms (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_messages_student
    FOREIGN KEY (student_user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_messages_sender
    FOREIGN KEY (sender_user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reactions to private messages: one emoji per person per message.
CREATE TABLE IF NOT EXISTS classroom_message_reactions (
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id),
  CONSTRAINT fk_message_reactions_message
    FOREIGN KEY (message_id) REFERENCES classroom_messages (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_message_reactions_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "Delete for me": messages one person has hidden from their own view (the
-- other person still sees them).
CREATE TABLE IF NOT EXISTS classroom_message_hidden (
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (message_id, user_id),
  CONSTRAINT fk_message_hidden_message
    FOREIGN KEY (message_id) REFERENCES classroom_messages (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_message_hidden_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "Clear conversation": one person's view of a conversation starts after
-- this message (the other person's history is untouched).
CREATE TABLE IF NOT EXISTS classroom_message_cleared (
  classroom_id INT NOT NULL,
  student_user_id INT NOT NULL,
  user_id INT NOT NULL,
  cleared_through_id INT NOT NULL DEFAULT 0,
  PRIMARY KEY (classroom_id, student_user_id, user_id),
  CONSTRAINT fk_message_cleared_classroom
    FOREIGN KEY (classroom_id) REFERENCES classrooms (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_message_cleared_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Public comments on a classroom activity, seen by its classroom. A reply
-- points at the comment it answers (parent_id, one level). A deleted comment
-- keeps its row (deleted_at, deleted_by) so its replies stay in place.
CREATE TABLE IF NOT EXISTS activity_comments (
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
    FOREIGN KEY (activity_id) REFERENCES classroom_activities (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_comments_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every edit or deletion of a comment: who did it and what the text was.
CREATE TABLE IF NOT EXISTS activity_comment_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  comment_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  action VARCHAR(20) NOT NULL,
  previous_body TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_comment (comment_id),
  CONSTRAINT fk_audit_comment
    FOREIGN KEY (comment_id) REFERENCES activity_comments (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- When each person last looked at an activity's comments (for "new" dots).
CREATE TABLE IF NOT EXISTS activity_comment_views (
  user_id INT NOT NULL,
  activity_id INT NOT NULL,
  last_seen_id INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, activity_id),
  CONSTRAINT fk_comment_views_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_comment_views_activity
    FOREIGN KEY (activity_id) REFERENCES classroom_activities (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notifications: a new private message or reply (kind 'message'), a reply
-- to someone's comment ('reply'), a new comment on a teacher's activity
-- ('comment'). link: where it leads; read_at: when it was seen.
CREATE TABLE IF NOT EXISTS user_notifications (
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
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Where each player in a multiplayer story activity is right now.
CREATE TABLE IF NOT EXISTS story_presence (
  activity_id INT NOT NULL,
  user_id INT NOT NULL,
  page_index INT NOT NULL DEFAULT 0,
  scene_id VARCHAR(80) DEFAULT NULL,
  pos_x DECIMAL(9,2) NOT NULL DEFAULT 0,
  pos_y DECIMAL(9,2) NOT NULL DEFAULT 0,
  facing TINYINT NOT NULL DEFAULT 1,
  progress DECIMAL(5,2) NOT NULL DEFAULT 0,
  state VARCHAR(20) NOT NULL DEFAULT 'playing',
  -- The movement since the last report (timed samples) and when it arrived (ms).
  trail TEXT DEFAULT NULL,
  sample_ms BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (activity_id, user_id),
  INDEX idx_presence_fresh (activity_id, updated_at),
  CONSTRAINT fk_presence_activity
    FOREIGN KEY (activity_id) REFERENCES classroom_activities (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_presence_user
    FOREIGN KEY (user_id) REFERENCES users (id)
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

-- Versus Mode (versus.php, versus_api.php): two students race in a platform
-- arena to collect a word's letters and answer a question about it. A lobby
-- has a short code, the host's settings and the match's score.
CREATE TABLE IF NOT EXISTS vs_lobbies (
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
  level VARCHAR(8) NOT NULL DEFAULT 'mixed',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A round: its word (and its questions, which only the server reads), where
-- its letters are in the arena, when it starts and ends, and who won it.
CREATE TABLE IF NOT EXISTS vs_rounds (
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
  hint VARCHAR(255) DEFAULT NULL,
  end_reason VARCHAR(10) DEFAULT NULL,
  level VARCHAR(8) DEFAULT NULL,
  UNIQUE KEY uniq_vs_round (lobby_id, round_no),
  CONSTRAINT fk_vs_round_lobby
    FOREIGN KEY (lobby_id) REFERENCES vs_lobbies (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One player's private progress in a round: the letters they collected, when
-- they finished the word, the question they were given and their answers.
CREATE TABLE IF NOT EXISTS vs_progress (
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
  hearts TINYINT NOT NULL DEFAULT 3,
  tried_json TEXT DEFAULT NULL,
  PRIMARY KEY (round_id, user_id),
  CONSTRAINT fk_vs_progress_round
    FOREIGN KEY (round_id) REFERENCES vs_rounds (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_vs_progress_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Where each player is (the last movement the server accepted).
CREATE TABLE IF NOT EXISTS vs_positions (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Actions already handled (each carries a one-time id), so a repeated
-- request is never counted twice.
CREATE TABLE IF NOT EXISTS vs_events (
  lobby_id INT NOT NULL,
  user_id INT NOT NULL,
  event_id VARCHAR(24) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (lobby_id, user_id, event_id),
  CONSTRAINT fk_vs_event_lobby
    FOREIGN KEY (lobby_id) REFERENCES vs_lobbies (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fair play: actions the server turned down (too fast, too far, too early,
-- repeated...), for teachers to review. Nobody is banned automatically.
CREATE TABLE IF NOT EXISTS vs_flags (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Screen time (src/screen_time_lib.php): a student's estimated active time in
-- 30-second slots (slot = Unix time / 30), one row per student per slot so two
-- tabs or devices never count twice. classroom_id: the classroom the page
-- belongs to (an activity or the classroom's page); NULL for general pages.
CREATE TABLE IF NOT EXISTS st_slots (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Each classroom's screen-time threshold (minutes a day).
CREATE TABLE IF NOT EXISTS st_classroom_settings (
  classroom_id INT NOT NULL PRIMARY KEY,
  daily_limit_min SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_st_settings_classroom
    FOREIGN KEY (classroom_id) REFERENCES classrooms (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Word meanings for the story readers' Words panel (src/word_definition.php),
-- kept once looked up; data is NULL when the dictionary has none.
CREATE TABLE IF NOT EXISTS word_definitions (
  lang VARCHAR(8) NOT NULL,
  word VARCHAR(64) NOT NULL,
  data TEXT DEFAULT NULL,
  fetched_at DATETIME NOT NULL,
  PRIMARY KEY (lang, word)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Writing Practice (src/writing.php, src/writing_api.php): each student's
-- notepads and timed challenges, with each challenge's clock, its status
-- (running, completed, interrupted; resumed when they came back) and the
-- feedback shown when it ended.
CREATE TABLE IF NOT EXISTS writing_notes (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Minigames (src/minigames.php, src/minigames_api.php): each player's best
-- score and number of plays, per game and variant (Word Catch: language and
-- level; Fix the Story: the story).
CREATE TABLE IF NOT EXISTS minigame_scores (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A student's unlocked games persist independently of play scores. Word Catch
-- is initialized on first entry; later games are inserted after score goals.
CREATE TABLE IF NOT EXISTS user_minigame_unlocks (
    user_id INT NOT NULL,
    game VARCHAR(20) NOT NULL,
    unlocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, game),
    CONSTRAINT fk_user_minigame_unlocks_user
      FOREIGN KEY (user_id) REFERENCES users (id)
      ON DELETE CASCADE
      ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Role-specific mission checkpoints, saved per account so completed
-- exploration missions remain checked across sessions.
CREATE TABLE IF NOT EXISTS user_mission_events (
  user_id INT NOT NULL,
  role VARCHAR(12) NOT NULL,
  mission_key VARCHAR(40) NOT NULL,
  completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role, mission_key),
  CONSTRAINT fk_user_mission_events_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Flowergirl tutorial progress is separate from mission completion: finishing
-- a tutorial never marks the related learning or teaching task complete.
CREATE TABLE IF NOT EXISTS user_mission_tutorial_progress (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Permanent achievement awards and the small set of verifiable interactions
-- that are not already represented by a domain record.
CREATE TABLE IF NOT EXISTS user_achievements (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_achievement_sync (
  user_id INT NOT NULL,
  role VARCHAR(12) NOT NULL,
  initialized_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role),
  CONSTRAINT fk_user_achievement_sync_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_achievement_events (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
