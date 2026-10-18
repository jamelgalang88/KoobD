(function () {
  const config = window.KOOBD_CHARACTER;
  if (!config) return;

  const previewCard = document.getElementById('previewCard');
  const previewName = document.getElementById('previewName');
  const nameInput = document.getElementById('characterName');
  const topColorInput = document.getElementById('topColor');
  const bottomColorInput = document.getElementById('bottomColor');
  const resetButton = document.getElementById('resetCustomization');
  const status = document.getElementById('customizeStatus');

  function currentState() {
    return {
      characterName: (nameInput && nameInput.value.trim()) || config.defaults.characterName,
      topColor: topColorInput ? topColorInput.value : config.defaults.topColor,
      bottomColor: bottomColorInput ? bottomColorInput.value : config.defaults.bottomColor,
      accentColor: config.defaults.accentColor
    };
  }

  function applyPreview(state) {
    if (previewName) {
      previewName.textContent = state.characterName; // as the profile page shows it
    }
    if (previewCard) {
      previewCard.style.setProperty('--card-top', state.topColor);
      previewCard.style.setProperty('--card-bottom', state.bottomColor);
      previewCard.style.setProperty('--accent-color', state.accentColor);
    }
  }

  function setStatus(message) {
    status.textContent = message;
    window.clearTimeout(setStatus.timer);
    if (!message) return;
    setStatus.timer = window.setTimeout(() => {
      status.textContent = '';
    }, 2200);
  }

  function syncPreview() {
    applyPreview(currentState());
  }

  // Colour swatches: each colour field is a row of round swatches plus a
  // custom one that opens the colour picker. The chosen colour lives in the
  // field's hidden input, which the form saves.
  const swatchGroups = Array.from(document.querySelectorAll('.color-swatches'));

  function selectColor(group, color) {
    const value = String(color || '').toLowerCase();
    const input = group.querySelector('input[type="hidden"]');
    const custom = group.querySelector('.color-swatch.is-custom');
    const picker = group.querySelector('.color-swatch-picker');
    const presetSwatches = Array.from(group.querySelectorAll('.color-swatch[data-color]'));
    const preset = presetSwatches.find((swatch) => swatch.dataset.color === value);
    if (input) input.value = value;
    presetSwatches.forEach((swatch) => {
      swatch.classList.toggle('is-selected', swatch === preset);
      swatch.setAttribute('aria-checked', swatch === preset ? 'true' : 'false');
    });
    if (custom) {
      custom.classList.toggle('is-selected', !preset);
      custom.style.setProperty('--swatch', value);
    }
    if (picker && picker.value !== value) picker.value = value;
    syncPreview();
  }

  swatchGroups.forEach((group) => {
    group.querySelectorAll('.color-swatch[data-color]').forEach((swatch) => {
      swatch.addEventListener('click', () => selectColor(group, swatch.dataset.color));
    });
    const picker = group.querySelector('.color-swatch-picker');
    if (picker) {
      picker.addEventListener('input', () => selectColor(group, picker.value));
    }
    // Arrow keys move between the swatches, as in any radio group.
    group.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const items = Array.from(group.querySelectorAll('.color-swatch[data-color], .color-swatch-picker'));
      const index = items.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      const next = items[(index + (event.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length];
      next.focus();
      if (next.dataset.color) selectColor(group, next.dataset.color);
    });
  });

  function groupFor(input) {
    return swatchGroups.find((group) => group.contains(input));
  }

  if (resetButton) {
    resetButton.addEventListener('click', () => {
      if (nameInput) nameInput.value = config.defaults.characterName;
      if (topColorInput) selectColor(groupFor(topColorInput), config.defaults.topColor);
      if (bottomColorInput) selectColor(groupFor(bottomColorInput), config.defaults.bottomColor);
      syncPreview();
      setStatus('Reset to default reader profile.');
    });
  }

  if (nameInput) {
    nameInput.addEventListener('input', syncPreview);
  }

  syncPreview();
})();
