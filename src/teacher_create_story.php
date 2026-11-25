<?php
require_once('auth.php');
$user = koobdRequireAuth(true);
require_once __DIR__ . '/missions_lib.php';
koobdMissionRequireFeature($user, 'story_creation');
$isTeacher = koobdIsTeacher($user);
$title = trim($_POST['title'] ?? '');
$description = trim($_POST['description'] ?? '');
$lesson = trim($_POST['lesson'] ?? '');
$storyMode = trim((string)($_POST['story_mode'] ?? 'regular'));
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($title === '' || $description === '') {
        $error = 'Add a story title and a short description before continuing.';
    } else {
        if (!in_array($storyMode, ['regular', 'platformer'], true)) {
            $storyMode = 'regular';
        }
        $defaultPages = koobdTeacherDefaultStoryPages();
        $pagesJson = json_encode($defaultPages);
        $coverImage = koobdTeacherUploadStoryCover($_FILES['cover_image'] ?? [], (int)$user['id']) ?? '';
        $stmt = $conn->prepare(
            "INSERT INTO teacher_stories (teacher_id, title, description, lesson, cover_image, story_mode, pages_json, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')"
        );
        $stmt->bind_param("issssss", $user['id'], $title, $description, $lesson, $coverImage, $storyMode, $pagesJson);
        $stmt->execute();
        $storyId = (int)$stmt->insert_id;
        $stmt->close();

        header("Location: teacher_story_editor.php?id=" . $storyId);
        exit();
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script src="<?= koobdAsset('js/i18n-tl.js') ?>"></script>
  <script src="<?= koobdAsset('js/i18n.js') ?>"></script>
  <script src="<?= koobdAsset('js/performance-mode.js') ?>"></script>
  <link rel="stylesheet" href="<?= koobdAsset('css/scrollbar.css') ?>">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KoobD - Create Story</title>
  <link rel="stylesheet" href="<?= koobdAsset('css/app.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/teacher-stories.css') ?>">
  <link rel="icon" type="image/png" href="assets/images/icons/favicon.png">
  <?php // Installable as an app (manifest.webmanifest): opens without the address bar. ?>
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#f3f8ff">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="KoobD">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link rel="apple-touch-icon" href="assets/images/icons/app/apple-touch-icon.png">
  <link rel="stylesheet" href="<?= koobdAsset('css/story-shared.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/story-setup.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
</head>
<?php // Creating a story: its details first (left), with a live preview of its card (right); then the editor. ?>
<body class="app-bg story-setup-page">
  <main class="ss">
    <header class="ss-top">
      <a class="ss-back" href="teacher_stories.php" aria-label="Back to My Stories">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
      </a>
      <div class="ss-top-copy">
        <nav class="ss-crumbs" aria-label="Breadcrumb"><a href="teacher_stories.php">My Stories</a><span aria-hidden="true">/</span><span>New story</span></nav>
        <h1>Create a new story</h1>
        <p>Add the details first. Next, you will build each page in the editor.</p>
      </div>
      <ol class="ss-steps" aria-label="Steps">
        <li class="is-current"><span>1</span>Details</li>
        <li><span>2</span>Build pages</li>
        <li><span>3</span><?= $isTeacher ? 'Publish' : 'Share' ?></li>
      </ol>
    </header>

    <form method="post" enctype="multipart/form-data" class="ss-layout" id="ssForm" novalidate>
      <div class="ss-main">
        <?php if ($error !== ''): ?>
          <div class="ss-alert" role="alert">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>
            <span><?= htmlspecialchars($error) ?></span>
          </div>
        <?php endif; ?>

        <section class="ss-card" aria-labelledby="ssBasics">
          <div class="ss-card-head">
            <h2 id="ssBasics">Basics</h2>
            <p>What readers see before they open the story.</p>
          </div>
          <div class="ss-field">
            <div class="ss-label-row">
              <label for="ssTitle">Title <span class="ss-req" aria-hidden="true">*</span></label>
              <span class="ss-count" data-count-for="ssTitle">0 / 120</span>
            </div>
            <input type="text" id="ssTitle" name="title" maxlength="120" value="<?= htmlspecialchars($title) ?>" placeholder="e.g. The Little Cloud Who Found a Friend" required aria-describedby="ssTitleError">
            <p class="ss-error" id="ssTitleError" hidden>Give your story a title.</p>
          </div>
          <div class="ss-field">
            <div class="ss-label-row">
              <label for="ssDescription">Description <span class="ss-req" aria-hidden="true">*</span></label>
              <span class="ss-count" data-count-for="ssDescription">0 / 500</span>
            </div>
            <textarea id="ssDescription" name="description" rows="4" maxlength="500" placeholder="A sentence or two about what happens in the story." required aria-describedby="ssDescriptionHint ssDescriptionError"><?= htmlspecialchars($description) ?></textarea>
            <p class="ss-hint" id="ssDescriptionHint">Shown on the story's card and before it opens.</p>
            <p class="ss-error" id="ssDescriptionError" hidden>Add a short description.</p>
          </div>
          <div class="ss-field">
            <div class="ss-label-row">
              <label for="ssLesson">Lesson or moral <span class="ss-optional">Optional</span></label>
              <span class="ss-count" data-count-for="ssLesson">0 / 180</span>
            </div>
            <input type="text" id="ssLesson" name="lesson" maxlength="180" value="<?= htmlspecialchars($lesson) ?>" placeholder="e.g. Kindness grows when we listen and help each other.">
          </div>
        </section>

        <section class="ss-card" aria-labelledby="ssType">
          <div class="ss-card-head">
            <h2 id="ssType">Story type</h2>
            <p>How readers will go through the story. This cannot be changed later.</p>
          </div>
          <div class="ss-types" role="radiogroup" aria-labelledby="ssType">
            <label class="ss-type">
              <input type="radio" name="story_mode" value="regular" <?= $storyMode === 'platformer' ? '' : 'checked' ?>>
              <span class="ss-type-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/></svg></span>
              <span class="ss-type-body">
                <strong>Story Mode</strong>
                <span>Pages with narration and dialogue, characters and backgrounds. Readers tap through each scene.</span>
                <span class="ss-type-tags"><span>Dialogue</span><span>Narration</span><span>Questions</span></span>
              </span>
              <span class="ss-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></span>
            </label>
            <label class="ss-type">
              <input type="radio" name="story_mode" value="platformer" <?= $storyMode === 'platformer' ? 'checked' : '' ?>>
              <span class="ss-type-icon is-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9h12a4 4 0 014 4v1a3 3 0 01-5.4 1.8L15 14H9l-1.6 1.8A3 3 0 012 14v-1a4 4 0 014-4zM8 11v3M6.5 12.5h3M16 12h.01M18 13.5h.01"/></svg></span>
              <span class="ss-type-body">
                <strong>Platform Mode</strong>
                <span>A level readers play through: they walk, jump and talk to characters along the way.</span>
                <span class="ss-type-tags"><span>Levels</span><span>Characters to meet</span><span>Touch controls</span></span>
              </span>
              <span class="ss-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></span>
            </label>
          </div>
        </section>

        <section class="ss-card" aria-labelledby="ssCover">
          <div class="ss-card-head">
            <h2 id="ssCover">Cover image <span class="ss-optional">Optional</span></h2>
            <p>A picture for the story's card. You can add or change it later.</p>
          </div>
          <label class="ss-drop" id="ssDrop">
            <input type="file" name="cover_image" id="ssCoverInput" accept="image/png,image/jpeg,image/webp" aria-describedby="ssCoverHint ssCoverError">
            <span class="ss-drop-empty">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5.5-5.5L6 20"/></svg>
              <strong>Choose a picture</strong>
              <span id="ssCoverHint">or drop it here · PNG, JPG or WebP, up to 10 MB</span>
            </span>
            <span class="ss-drop-file" hidden>
              <img alt="" id="ssCoverThumb">
              <span><strong id="ssCoverName"></strong><span>Tap to choose a different picture</span></span>
            </span>
          </label>
          <div class="ss-drop-actions">
            <button type="button" class="ss-link" id="ssCoverRemove" hidden>Remove picture</button>
          </div>
          <p class="ss-error" id="ssCoverError" hidden></p>
        </section>
      </div>

      <aside class="ss-side" aria-label="Preview">
        <div class="ss-preview-card">
          <p class="ss-side-label">Preview</p>
          <div class="ss-preview" id="ssPreview">
            <div class="ss-preview-cover" id="ssPreviewCover">
              <span class="ss-preview-badge" id="ssPreviewBadge">Story Mode</span>
            </div>
            <div class="ss-preview-body">
              <strong id="ssPreviewTitle" translate="no">Your story title</strong>
              <span id="ssPreviewDescription" translate="no">Your description will appear here.</span>
            </div>
          </div>
          <p class="ss-side-note">This is how your story's card will look on the shelves.</p>
        </div>
        <div class="ss-next">
          <p class="ss-side-label">What happens next</p>
          <ol>
            <li>Build your pages in the editor: scenes, characters, dialogue and sounds.</li>
            <li>Preview it the way readers will see it.</li>
            <li><?= $isTeacher ? 'Publish it, or give it to a class as an activity.' : 'Share it so everyone can read it.' ?></li>
          </ol>
          <p class="ss-side-note">Your story is saved as a draft until you <?= $isTeacher ? 'publish' : 'share' ?> it.</p>
        </div>
      </aside>

      <div class="ss-actions">
        <a class="ss-btn ss-btn-ghost" href="teacher_stories.php">Cancel</a>
        <button type="submit" class="ss-btn ss-btn-primary">
          <span>Continue to editor</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
      </div>
    </form>
  </main>
  <script src="<?= koobdAsset('js/story-setup.js') ?>"></script>
</body>
</html>
