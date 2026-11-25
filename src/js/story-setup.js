// Creating a story (teacher_create_story.php): character counts, the live
// preview of the story's card, the cover picture (chosen or dropped, checked
// before it is sent) and friendly checks before going on to the editor.
(function () {
  const form = document.getElementById('ssForm');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const title = $('ssTitle');
  const description = $('ssDescription');
  const lesson = $('ssLesson');
  const coverInput = $('ssCoverInput');
  const drop = $('ssDrop');
  const MAX_COVER = 10 * 1024 * 1024;
  const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

  // Counts under each field's label.
  function count(field) {
    const label = document.querySelector(`[data-count-for="${field.id}"]`);
    if (!label) return;
    const max = Number(field.getAttribute('maxlength')) || 0;
    label.textContent = `${field.value.length} / ${max}`;
    label.classList.toggle('is-near', max && field.value.length >= max * 0.9);
  }

  // The preview of the story's card.
  function preview() {
    $('ssPreviewTitle').textContent = title.value.trim() || 'Your story title';
    $('ssPreviewDescription').textContent = description.value.trim() || 'Your description will appear here.';
    const mode = form.querySelector('input[name="story_mode"]:checked');
    const platform = mode && mode.value === 'platformer';
    $('ssPreviewBadge').textContent = platform ? 'Platform Mode' : 'Story Mode';
    $('ssPreviewBadge').classList.toggle('is-play', platform);
  }

  [title, description, lesson].forEach((field) => {
    count(field);
    field.addEventListener('input', () => {
      count(field);
      preview();
      if (field.value.trim()) showError(field, false);
    });
  });
  form.querySelectorAll('input[name="story_mode"]').forEach((radio) => radio.addEventListener('change', () => {
    syncTypes();
    preview();
  }));
  // The chosen story type's card is marked (also where :has() is missing).
  function syncTypes() {
    form.querySelectorAll('.ss-type').forEach((card) => card.classList.toggle('is-selected', card.querySelector('input').checked));
  }
  syncTypes();
  preview();

  // --- Cover picture ----------------------------------------------------------------------------------------
  let previewUrl = '';
  function coverError(message) {
    const error = $('ssCoverError');
    error.textContent = message;
    error.hidden = !message;
  }
  function showCover(file) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = file ? URL.createObjectURL(file) : '';
    drop.querySelector('.ss-drop-empty').hidden = Boolean(file);
    drop.querySelector('.ss-drop-file').hidden = !file;
    drop.classList.toggle('has-file', Boolean(file));
    $('ssCoverRemove').hidden = !file;
    $('ssCoverThumb').src = previewUrl;
    $('ssCoverName').textContent = file ? file.name : '';
    const cover = $('ssPreviewCover');
    cover.style.backgroundImage = previewUrl ? `url("${previewUrl}")` : '';
    cover.classList.toggle('has-image', Boolean(file));
  }
  function useFile(file) {
    if (!file) { showCover(null); return true; }
    if (!TYPES.includes(file.type)) { coverError('Choose a PNG, JPG or WebP picture.'); return false; }
    if (file.size > MAX_COVER) { coverError('That picture is too big. Choose one under 10 MB.'); return false; }
    coverError('');
    showCover(file);
    return true;
  }
  coverInput.addEventListener('change', () => {
    const file = coverInput.files && coverInput.files[0];
    if (!useFile(file)) coverInput.value = '';
  });
  $('ssCoverRemove').addEventListener('click', () => {
    coverInput.value = '';
    coverError('');
    showCover(null);
  });
  ['dragenter', 'dragover'].forEach((type) => drop.addEventListener(type, (event) => { event.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file || !useFile(file)) return;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      coverInput.files = transfer.files;
    } catch (error) { coverError('Your browser could not take that picture. Use "Choose a picture" instead.'); showCover(null); }
  });

  // --- Before going on --------------------------------------------------------------------------------------
  function showError(field, show) {
    const error = $(`${field.id}Error`);
    if (error) error.hidden = !show;
    field.classList.toggle('is-invalid', show);
    field.setAttribute('aria-invalid', show ? 'true' : 'false');
  }
  let sending = false;
  form.addEventListener('submit', (event) => {
    const missing = [title, description].filter((field) => !field.value.trim());
    [title, description].forEach((field) => showError(field, missing.includes(field)));
    if (missing.length || sending) {
      event.preventDefault();
      if (missing.length) missing[0].focus();
      return;
    }
    sending = true;
    const button = form.querySelector('.ss-btn-primary');
    button.disabled = true;
    button.querySelector('span').textContent = 'Opening the editor…';
  });
  // Coming back with Back: the button works again.
  window.addEventListener('pageshow', () => {
    sending = false;
    const button = form.querySelector('.ss-btn-primary');
    button.disabled = false;
    button.querySelector('span').textContent = 'Continue to editor';
  });
})();
