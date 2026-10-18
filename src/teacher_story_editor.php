<?php
require_once('auth.php');
$user = koobdRequireAuth(true);
$storyDbId = isset($_GET['id']) ? (int)$_GET['id'] : (int)($_POST['story_id'] ?? 0);

if ($storyDbId <= 0) {
    header("Location: teacher_stories.php");
    exit();
}

$stmt = $conn->prepare("SELECT * FROM teacher_stories WHERE id = ? AND teacher_id = ? LIMIT 1");
$stmt->bind_param("ii", $storyDbId, $user['id']);
$stmt->execute();
$result = $stmt->get_result();
$storyRow = $result ? $result->fetch_assoc() : null;
$stmt->close();

if (!$storyRow) {
    header("Location: teacher_stories.php");
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $title = trim($_POST['title'] ?? '');
    $description = trim($_POST['description'] ?? '');
    $lesson = trim($_POST['lesson'] ?? '');
    $coverImage = trim((string)($storyRow['cover_image'] ?? ''));
    $pages = koobdTeacherStoryPagesFromJson($_POST['pages_payload'] ?? '');
    $settingsJson = json_encode(koobdStorySettingsFromData(json_decode((string)($_POST['settings_payload'] ?? ''), true)));
    $submitAction = trim((string)($_POST['submit_action'] ?? 'save_draft'));
    // A story keeps the mode it was made in. A regular story is Story pages only.
    $storyMode = trim((string)($storyRow['story_mode'] ?? '')) === 'platformer' ? 'platformer' : 'regular';
    if ($storyMode === 'regular') {
        foreach ($pages as &$page) {
            $page['pageType'] = 'normal';
            $page['platformer'] = koobdPlatformerSceneFromData(null);
        }
        unset($page);
    }

    if ($title === '') {
        $title = trim((string)$storyRow['title']);
    }
    if ($description === '') {
        $description = trim((string)$storyRow['description']);
    }
    $uploadedCover = koobdTeacherUploadStoryCover($_FILES['cover_image'] ?? [], (int)$user['id']);
    if (is_string($uploadedCover) && $uploadedCover !== '') {
        $coverImage = $uploadedCover;
    }

    $status = trim((string)$storyRow['status']);
    if ($submitAction === 'save_draft') {
        $status = 'draft';
    } elseif ($submitAction === 'publish') {
        $status = 'published';
    } elseif ($status === '') {
        $status = 'draft';
    }

    $pagesJson = json_encode($pages);
    $updateStmt = $conn->prepare(
        "UPDATE teacher_stories
         SET title = ?, description = ?, lesson = ?, cover_image = ?, pages_json = ?, settings_json = ?, status = ?, story_mode = ?
         WHERE id = ? AND teacher_id = ?"
    );
    $updateStmt->bind_param(
        "ssssssssii",
        $title,
        $description,
        $lesson,
        $coverImage,
        $pagesJson,
        $settingsJson,
        $status,
        $storyMode,
        $storyDbId,
        $user['id']
    );
    $updateStmt->execute();
    $updateStmt->close();

    $updatedStoryRow = $storyRow;
    $updatedStoryRow['title'] = $title;
    $updatedStoryRow['description'] = $description;
    $updatedStoryRow['lesson'] = $lesson;
    $updatedStoryRow['cover_image'] = $coverImage;
    $updatedStoryRow['status'] = $status;
    $updatedStoryRow['story_mode'] = $storyMode;
    koobdSyncTeacherStoryToSharedFeed($updatedStoryRow);

    if ($submitAction === 'preview') {
        // "Play from this page" starts the preview at that page.
        $previewPage = koobdCleanId($_POST['preview_page'] ?? '');
        header("Location: teacher_story_preview.php?id=" . $storyDbId . ($previewPage !== '' ? '&page=' . rawurlencode($previewPage) : ''));
        exit();
    }

    if ($submitAction === 'publish') {
        header("Location: teacher_stories.php?published=1");
        exit();
    }

    // Come back to the page that was being edited.
    $currentPage = koobdCleanId($_POST['current_page'] ?? '');
    header("Location: teacher_story_editor.php?id=" . $storyDbId . "&saved=1" . ($currentPage !== '' ? '&page=' . rawurlencode($currentPage) : ''));
    exit();
}

$story = koobdTeacherStoryFromRow($storyRow);
$storyMode = $story['story_mode'] === 'platformer' ? 'platformer' : 'regular';
$backgrounds = array_values(koobdBackgroundCatalog());
$characters = [];
foreach (koobdCharacterCatalog() as $key => $character) {
    $characters[] = [
        'id' => $key,
        'label' => $character['display'],
        'asset' => $character['asset'],
    ];
}
$savedMessage = isset($_GET['saved']) ? 'Draft saved.' : '';
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
  <title>KoobD - Story Editor</title>
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
  <link rel="stylesheet" href="<?= koobdAsset('css/mobile.css') ?>">
  <link rel="stylesheet" href="<?= koobdAsset('css/story-editor.css') ?>">
</head>
<body class="app-bg story-builder-page story-builder-page-<?= htmlspecialchars($storyMode) ?>">
  <main class="story-builder-shell">
    <form method="post" enctype="multipart/form-data" id="teacherStoryEditorForm" class="story-builder-form">
      <input type="hidden" name="story_id" value="<?= (int)$storyDbId ?>">
      <input type="hidden" name="pages_payload" id="pagesPayload">
      <input type="hidden" name="settings_payload" id="settingsPayload">
      <input type="hidden" name="preview_page" id="previewPage" value="">
      <input type="hidden" name="current_page" id="currentPage" value="">
      <input type="hidden" name="submit_action" id="submitAction" value="save_draft">
      <input type="hidden" name="story_mode_payload" id="storyModePayload" value="<?= htmlspecialchars($storyMode) ?>">

      <header class="story-builder-topbar">
        <div class="story-builder-topbar-left">
          <button type="button" class="teacher-story-icon-btn danger" id="exitEditorBtn" aria-label="Exit editor">
            <img src="assets/images/icons/LOGOUT 1.png" alt="">
          </button>
          <div class="story-builder-heading">
            <div class="teacher-story-kicker">Story Editor</div>
            <h1 translate="no" title="Build each page, link the pages together, then play the story before you publish it."><?= htmlspecialchars($story['title']) ?></h1>
          </div>
        </div>

        <div class="story-builder-toolbar">
          <span class="teacher-story-status <?= $story['status'] === 'published' ? 'published' : 'draft' ?>">
            <?= htmlspecialchars(ucfirst($story['status'])) ?>
          </span>
          <button type="button" class="teacher-story-secondary-btn" id="storyDetailsBtn" title="Title, description, lesson, cover and text style">Story Details</button>
          <button type="button" class="teacher-story-secondary-btn" id="shortcutsBtn" title="Keyboard shortcuts">Shortcuts</button>
          <button type="button" class="teacher-story-secondary-btn" id="previewStoryBtn">Play Preview</button>
          <button type="button" class="teacher-story-secondary-btn" id="saveDraftBtn" title="Save (Ctrl+S)">Save Draft</button>
          <button type="button" class="teacher-story-primary-btn" id="publishStoryBtn">Finish Story</button>
        </div>
      </header>

      <section class="story-builder-layout" id="storyBuilderLayout">
        <aside class="story-builder-sidebar" id="storyBuilderSidebar">
          <section class="story-builder-panel">
            <div class="teacher-story-section-head">
              <h2 id="assetsHeading">Assets</h2>
              <button type="button" class="story-builder-sidebar-toggle" id="toggleStorySidebarBtn" aria-label="Hide the side panel" aria-expanded="true" title="Hide the side panel">
                <span class="story-builder-sidebar-toggle-icon" aria-hidden="true">&#8249;</span>
                <span class="story-builder-sidebar-toggle-text">Hide</span>
              </button>
            </div>

            <div class="story-mode-only">
              <div class="story-builder-tabs">
                <button type="button" class="story-builder-tab is-active" data-editor-tab="characters">Characters</button>
                <button type="button" class="story-builder-tab" data-editor-tab="backgrounds">Background</button>
              </div>
              <div class="story-builder-slot-toggle" id="characterTargetWrap">
                <button type="button" class="story-builder-slot-btn is-active" data-character-slot="auto">Auto</button>
                <button type="button" class="story-builder-slot-btn" data-character-slot="left">Left</button>
                <button type="button" class="story-builder-slot-btn" data-character-slot="right">Right</button>
              </div>
              <label class="teacher-story-field full story-builder-color-field hidden" id="backgroundColorField">
                <span>Background color</span>
                <input type="color" id="backgroundColorInput" value="#ffffff">
              </label>
              <input type="search" class="pe-lib-search story-asset-search" id="storyAssetSearch" placeholder="Search the assets…" aria-label="Search the assets" autocomplete="off">
              <div class="story-builder-assets-grid" id="storyAssetGrid"></div>
            </div>

            <?php if ($storyMode === 'platformer'): // Platform Mode pages: the level editor's library (js/platform-editor.js). ?>
            <div class="pe-library" id="platformLibraryRoot" aria-label="Platform Mode library"></div>
            <?php endif; ?>
          </section>

        </aside>

        <button type="button" class="story-builder-sidebar-restore" id="showStorySidebarBtn" aria-label="Show the side panel" title="Show the side panel">
          <span class="story-builder-sidebar-toggle-icon" aria-hidden="true">&#8250;</span>
          <span class="story-builder-sidebar-toggle-text">Show</span>
        </button>

        <section class="story-builder-work" id="storyBuilderWork">
          <div class="story-builder-canvas-card">
            <div class="story-builder-canvas-main">
            <div class="story-builder-canvas vn-wrapper" id="storyCanvas">
              <div class="story-builder-canvas-bg" id="canvasBackground"></div>
              <div class="story-builder-canvas-view" id="storyCanvasView">
                <div class="story-builder-canvas-title-card hidden" id="canvasTitleCard">
                  <div class="story-builder-canvas-title" id="canvasTitleText"></div>
                </div>
                <div class="story-builder-canvas-characters vn-characters">
                  <div class="story-builder-canvas-char left vn-char left" id="canvasLeftCharacter"></div>
                  <div class="story-builder-canvas-char right vn-char right" id="canvasRightCharacter"></div>
                </div>
                <div class="story-builder-canvas-dialogue vn-dialogue" id="canvasDialogueWrap">
                  <div class="story-builder-canvas-names vn-names">
                    <div class="story-builder-canvas-name name-box" id="canvasNameLeft"></div>
                    <div class="story-builder-canvas-name name-box" id="canvasNameRight"></div>
                  </div>
                  <div class="story-builder-canvas-text dialogue-box visible" id="canvasPageText"></div>
                  <div class="story-canvas-choices" id="canvasChoices"></div>
                </div>
              </div>
              <div class="story-builder-zoom-controls" role="group" aria-label="Canvas zoom controls">
                <button type="button" id="canvasZoomOutBtn" aria-label="Zoom out" title="Zoom out">−</button>
                <output id="canvasZoomLevel" aria-live="polite">100%</output>
                <button type="button" id="canvasZoomInBtn" aria-label="Zoom in" title="Zoom in">+</button>
                <button type="button" class="story-builder-fullscreen-btn" data-editor-fullscreen aria-pressed="false" aria-label="Full screen" title="Full screen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg></button>
              </div>
            </div>
            <?php if ($storyMode === 'platformer'): // Platform Mode pages: the stage editor (js/platform-editor.js). ?>
            <div class="pe-stage-root" id="platformStageRoot"></div>
            <?php endif; ?>
            </div>
            <?php // Beside the canvas: a few quick controls for this page (where it leads,
                  // its settings, playing it, and adding parts on Story pages). ?>
            <aside class="story-builder-sidepanel" aria-label="This page">
              <div class="story-builder-sidepanel-inner">
                <div class="page-quick-head" id="pageQuickHead"></div>
                <?php // Where the story goes after this page: on, to a chosen page, or the end. ?>
                <div class="page-flow" id="pageFlowRoot"></div>
                <div class="story-mode-only page-quick-add">
                  <span class="ed-field-label">Add a part</span>
                  <div class="story-builder-content-actions">
                    <button type="button" class="teacher-story-secondary-btn" id="addDialogueBtn">Add Dialogue</button>
                    <button type="button" class="teacher-story-secondary-btn" id="addNarrationBtn">Add Narration</button>
                    <button type="button" class="teacher-story-secondary-btn" id="addTitleBtn">Add Title</button>
                    <button type="button" class="teacher-story-secondary-btn" id="addChoiceBtn">Add Choice</button>
                    <button type="button" class="teacher-story-secondary-btn" id="pastePartBtn" disabled>Paste Part</button>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          <div class="story-builder-pagebar">
            <button type="button" class="teacher-story-icon-btn small" id="previousPageBtn" aria-label="Previous page">&#8592;</button>
            <div class="story-builder-pagechips" id="pageChipList"></div>
            <button type="button" class="teacher-story-icon-btn small" id="nextPageBtn" aria-label="Next page">&#8594;</button>
            <button type="button" class="story-builder-pagechip story-builder-pagechip-add" id="addPageBtn" aria-label="Add page">
              <span class="story-builder-pagechip-add-plus">+</span>
              <span class="story-builder-pagechip-add-text">Add Page</span>
            </button>
            <button type="button" class="story-builder-pagechip story-builder-pagechip-add story-builder-map-btn" id="storyMapBtn" title="See how all the pages link together">
              <span class="story-builder-pagechip-add-plus" aria-hidden="true">&#8644;</span>
              <span class="story-builder-pagechip-add-text">Story Map</span>
            </button>
          </div>

          <div class="story-builder-editor-fields">
            <div class="story-mode-only story-mode-content">
              <div class="story-builder-content-list" id="contentElementList"></div>
              <div class="story-builder-page-summary" id="pageSummaryText"></div>
            </div>

            <?php if ($storyMode === 'platformer'): // Platform Mode pages: Selected / Story events (js/platform-editor-panels.js). ?>
            <div class="pe-inspector" id="platformInspectorRoot"></div>
            <?php endif; ?>
          </div>
        </section>

      </section>
      <?php // Story details: a popup, but part of the form so its fields are saved with the story. ?>
      <div class="ed-modal hidden story-details-modal" id="storyDetailsModal" aria-hidden="true">
        <div class="ed-modal-card is-md" role="dialog" aria-modal="true" aria-labelledby="storyDetailsTitle">
          <div class="ed-modal-head">
            <h2 id="storyDetailsTitle">Story details</h2>
            <button type="button" class="ed-icon-btn" id="closeStoryDetailsBtn" aria-label="Close" title="Close"><svg viewBox="0 0 24 24" aria-hidden="true" class="ed-icon"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          </div>
          <div class="ed-modal-body story-details-body">
            <label class="teacher-story-field full">
              <span>Story title</span>
              <input id="storyTitleInput" type="text" name="title" maxlength="120" value="<?= htmlspecialchars($story['title']) ?>">
            </label>
            <label class="teacher-story-field full">
              <span>Description</span>
              <textarea id="storyDescriptionInput" name="description" rows="4"><?= htmlspecialchars($story['description']) ?></textarea>
            </label>
            <label class="teacher-story-field full">
              <span>Lesson or moral</span>
              <input id="storyLessonInput" type="text" name="lesson" maxlength="180" value="<?= htmlspecialchars($story['lesson']) ?>">
            </label>
            <label class="teacher-story-field full">
              <span>Story cover image</span>
              <input type="file" name="cover_image" accept="image/png,image/jpeg,image/webp">
            </label>
            <?php if (!empty($story['cover'])): ?>
              <div class="story-builder-cover-preview">
                <img src="<?= htmlspecialchars($story['cover']) ?>" alt="<?= htmlspecialchars($story['title']) ?>">
              </div>
            <?php endif; ?>
            <?php // The story's text font and size, used for every page's lines. ?>
            <div class="story-settings" id="storySettingsRoot"></div>
          </div>
          <div class="ed-modal-actions">
            <button type="button" class="ed-btn ed-btn-primary" id="doneStoryDetailsBtn">Done</button>
          </div>
        </div>
      </div>
    </form>
  </main>

  <?php if ($storyMode === 'platformer'): // Platform Mode stories choose each new page's kind. ?>
  <div class="platformer-page-type-modal hidden" id="platformerPageTypeModal" aria-hidden="true">
    <div class="platformer-page-type-dialog" role="dialog" aria-modal="true" aria-labelledby="platformerPageTypeTitle">
      <h2 id="platformerPageTypeTitle">Choose a page type</h2>
      <button type="button" class="teacher-story-secondary-btn" id="addNormalPageBtn">Story Page</button>
      <button type="button" class="teacher-story-primary-btn" id="addPlatformerPageBtn">Platform Page</button>
      <button type="button" class="story-builder-element-action" id="cancelPageTypeBtn">Cancel</button>
    </div>
  </div>
  <?php endif; ?>

  <div class="teacher-story-exit-modal hidden" id="editorExitModal" aria-hidden="true">
    <div class="teacher-story-exit-dialog">
      <div class="teacher-story-kicker">Exit Editor</div>
      <h2>Leave the story editor?</h2>
      <p>Changes you have not saved will be lost. Keep editing, or go back to your story library.</p>
      <div class="teacher-story-exit-actions">
        <button type="button" class="teacher-story-secondary-btn" id="stayInEditorBtn">Continue Editing</button>
        <a href="teacher_stories.php" class="teacher-story-primary-btn">Leave Editor</a>
      </div>
    </div>
  </div>

  <div class="editor-toast" id="editorToast" role="status" aria-live="polite"></div>

  <script>
    window.KOOBD_STORY_EDITOR = <?= json_encode([
      'storyId' => (int)$storyDbId,
      'storyMode' => $storyMode,
      'pages' => $story['pages'],
      'settings' => $story['settings'] ?? null,
      'backgrounds' => $backgrounds,
      'characters' => $characters,
      'playerAsset' => koobdResolvedProfile($user)['asset'],
      'savedMessage' => $savedMessage,
      'startPageKey' => koobdCleanId($_GET['page'] ?? ''),
      'voiceUploadEndpoint' => 'teacher_upload_voiceover.php',
      'platformerUploadEndpoint' => 'teacher_upload_platformer_asset.php',
      'platformerAssetsEndpoint' => 'teacher_platformer_assets.php',
    ]) ?>;
  </script>
  <script src="<?= koobdAsset('js/platformer-blocks.js') ?>"></script>
  <script src="<?= koobdAsset('js/platform-library.js') ?>"></script>
  <script src="<?= koobdAsset('js/rich-text.js') ?>"></script>
  <script src="<?= koobdAsset('js/platform-story-compiler.js') ?>"></script>
  <script src="<?= koobdAsset('js/editor-fullscreen.js') ?>"></script>
  <script src="<?= koobdAsset('js/editor-ui.js') ?>"></script>
  <?php if ($storyMode === 'platformer'): ?>
  <script src="<?= koobdAsset('js/platform-editor.js') ?>"></script>
  <script src="<?= koobdAsset('js/platform-editor-panels.js') ?>"></script>
  <?php endif; ?>
  <script src="<?= koobdAsset('js/story-map.js') ?>"></script>
  <script src="<?= koobdAsset('js/teacher-story-editor.js') ?>"></script>
</body>
</html>
