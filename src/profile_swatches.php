<?php
// The profile card's colour pickers, shared by the student profile page
// (customize_character.php) and the teacher profile page (teacher_profile.php):
// a row of round swatches - the character's own colour first, then a small
// palette - plus a custom swatch that opens the colour picker.
// js/character-customize.js makes them work.

// [top choices, bottom choices] for a character's default colours.
function koobdProfileColorChoices(array $defaultProfile): array
{
    $choices = function (string $default, array $palette): array {
        $list = [strtolower($default)];
        foreach ($palette as $color) {
            if (!in_array($color, $list, true)) $list[] = $color;
        }
        return $list;
    };
    return [
        $choices($defaultProfile['top'], ['#dcd4ff', '#ffe6a7', '#ccefd5', '#ffd1dc', '#b8e0ff', '#3d7cc0', '#7b5cd6', '#e8875c']),
        $choices($defaultProfile['bottom'], ['#bff7d6', '#fff8cc', '#b8e0ff', '#ffe1ec', '#e9e4ff', '#24302e', '#2a2f4a', '#5c3b6e']),
    ];
}

// One colour field: the swatches and the hidden input the form saves.
function koobdRenderColorSwatches(string $field, string $label, string $value, array $choices, string $default): void
{
    $value = strtolower($value);
    $isCustom = !in_array($value, $choices, true);
    ?>
    <div class="customize-field full">
      <span class="customize-field-label" id="<?= $field ?>Label"><?= htmlspecialchars($label) ?></span>
      <div class="color-swatches" role="radiogroup" aria-labelledby="<?= $field ?>Label" data-field="<?= $field ?>">
        <?php foreach ($choices as $color): ?>
          <button type="button" class="color-swatch<?= $color === $value ? ' is-selected' : '' ?>" role="radio"
            aria-checked="<?= $color === $value ? 'true' : 'false' ?>" data-color="<?= $color ?>" style="--swatch:<?= $color ?>"
            aria-label="<?= $color === strtolower($default) ? 'Default colour' : 'Colour ' . $color ?>"></button>
        <?php endforeach; ?>
        <label class="color-swatch is-custom<?= $isCustom ? ' is-selected' : '' ?>" style="--swatch:<?= htmlspecialchars($value) ?>" title="Pick any colour">
          <input type="color" class="color-swatch-picker" value="<?= htmlspecialchars($value) ?>" aria-label="Pick any colour">
        </label>
        <input type="hidden" id="<?= $field ?>" name="<?= $field ?>" value="<?= htmlspecialchars($value) ?>">
      </div>
    </div>
    <?php
}

// A colour from the form, or the fallback when it is not a #rrggbb colour.
function koobdProfileColor(string $value, string $fallback): string
{
    return preg_match('/^#[0-9a-fA-F]{6}$/', $value) ? $value : $fallback;
}
