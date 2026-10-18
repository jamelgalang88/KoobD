<?php
// Checking and cleaning the story editor's data before it is saved: Platform
// Mode pages (version 3: objects, characters, checkpoints, story events),
// links between pages (choices, "what happens next"), Story Mode choices,
// and the story's text settings. Mirrors js/platform-story-compiler.js, which
// turns the same data into a playable world.
//
// Every asset path must be one of KoobD's own (The False Knight's art, the
// app's images) or a file the teacher uploaded; anything else is dropped.

function koobdCleanId($value, string $fallback = ''): string
{
    $id = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$value);
    $id = substr((string)$id, 0, 40);
    return $id !== '' ? $id : $fallback;
}

function koobdCleanText($value, int $max = 500): string
{
    $text = trim((string)$value);
    return function_exists('mb_substr') ? mb_substr($text, 0, $max) : substr($text, 0, $max);
}

function koobdCleanNumber($value, float $min, float $max, float $fallback): float
{
    if (!is_numeric($value)) {
        return $fallback;
    }
    $number = (float)$value;
    return round(max($min, min($max, $number)), 3);
}

function koobdCleanColor($value, string $fallback): string
{
    $color = trim((string)$value);
    return preg_match('/^#[0-9a-fA-F]{6}$/', $color) ? $color : $fallback;
}

function koobdCleanChoice($value, array $allowed, string $fallback): string
{
    $choice = trim((string)$value);
    return in_array($choice, $allowed, true) ? $choice : $fallback;
}

// A path to an image, sound or video the story may use. `$kinds` limits it to
// images, audio and/or video.
function koobdPlatformerMediaPath($path, array $kinds = ['image']): string
{
    $path = trim(str_replace('\\', '/', (string)$path));
    if ($path === '' || strpos($path, '..') !== false || strpos($path, "\0") !== false) {
        return '';
    }
    $extensions = [];
    if (in_array('image', $kinds, true)) {
        $extensions = array_merge($extensions, ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);
    }
    if (in_array('audio', $kinds, true)) {
        $extensions = array_merge($extensions, ['mp3']);
    }
    if (in_array('video', $kinds, true)) {
        $extensions = array_merge($extensions, ['mp4', 'webm']);
    }
    $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    if (!in_array($extension, $extensions, true)) {
        return '';
    }
    // Teacher uploads.
    if (preg_match('~^uploads/platformer-assets/teacher-[0-9]+-[a-f0-9]+-[a-z0-9-]+\.[a-z0-9]+$~i', $path)) {
        return is_file(__DIR__ . '/' . $path) ? $path : '';
    }
    // KoobD's own art.
    $roots = [
        'The False Knight/',
        'assets/images/characters/',
        'assets/images/platform/',
        'assets/images/grounds/',
        'assets/images/backgrounds/',
        'assets/images/banners/',
        'assets/images/books/',
    ];
    foreach ($roots as $root) {
        if (strpos($path, $root) === 0 && is_file(__DIR__ . '/' . $path)) {
            return $path;
        }
    }
    return '';
}

// Where a choice, an event or a page leads: on, to a page (by its key), or the end.
function koobdCleanGoto($value, array $nextTypes = ['continue', 'page', 'end']): array
{
    $value = is_array($value) ? $value : [];
    $type = koobdCleanChoice($value['type'] ?? '', $nextTypes, $nextTypes[0]);
    $goto = ['type' => $type];
    if ($type === 'page') {
        $goto['page'] = koobdCleanId($value['page'] ?? '');
        if ($goto['page'] === '') {
            $goto = ['type' => $nextTypes[0]];
        }
    } elseif ($type === 'end') {
        $goto['label'] = koobdCleanText($value['label'] ?? '', 80);
    }
    return $goto;
}

function koobdPlatformerBeatFromData($beat): ?array
{
    if (!is_array($beat)) {
        return null;
    }
    $type = koobdCleanChoice($beat['type'] ?? '', ['narration', 'dialogue', 'title', 'frame', 'choices'], 'narration');
    $clean = [
        'id' => koobdCleanId($beat['id'] ?? '', 'beat-' . bin2hex(random_bytes(3))),
        'type' => $type,
        'speaker' => koobdCleanId($beat['speaker'] ?? 'narrator', 'narrator'),
        'text' => koobdCleanText($beat['text'] ?? '', 600),
    ];
    if (in_array($type, ['narration', 'dialogue', 'title', 'choices'], true)) {
        $line = koobdStoryLine($beat, $type === 'title' ? 120 : 600);
        $clean['text'] = $line['text'];
        if ($line['rich'] !== '') {
            $clean['rich'] = $line['rich'];
        }
    }
    $audio = koobdPlatformerMediaPath($beat['audio'] ?? '', ['audio']);
    if ($audio !== '') {
        $clean['audio'] = $audio;
    }
    if ($type === 'title') {
        // '' = the story's own font.
        $clean['font'] = koobdCleanChoice($beat['font'] ?? '', array_merge([''], koobdStoryFontIds()), '');
        // '' = the normal title size.
        $clean['size'] = koobdCleanChoice($beat['size'] ?? '', koobdTitleSizeIds(), '');
    }
    if ($type === 'frame') {
        $clean['image'] = koobdPlatformerMediaPath($beat['image'] ?? '', ['image']);
        $clean['video'] = koobdPlatformerMediaPath($beat['video'] ?? '', ['video']);
        $clean['transition'] = koobdCleanChoice($beat['transition'] ?? '', ['crossfade', 'dip', 'flash', 'cut'], 'crossfade');
        if ($clean['image'] === '' && $clean['video'] === '') {
            return null;
        }
    }
    if ($type === 'choices') {
        $choices = [];
        foreach (array_slice(is_array($beat['choices'] ?? null) ? $beat['choices'] : [], 0, 4) as $choice) {
            if (!is_array($choice)) continue;
            $text = koobdCleanText($choice['text'] ?? '', 120);
            if ($text === '') continue;
            $choices[] = ['text' => $text, 'goto' => koobdCleanGoto($choice['goto'] ?? null)];
        }
        $clean['choices'] = $choices;
    }
    return $clean;
}

function koobdPlatformerV3FromData(array $scene): array
{
    $width = (int)koobdCleanNumber($scene['width'] ?? 1000, 1000, 4000, 1000);
    $groundY = 282;
    $player = is_array($scene['player'] ?? null) ? $scene['player'] : [];
    $background = is_array($scene['background'] ?? null) ? $scene['background'] : [];
    $ground = is_array($scene['ground'] ?? null) ? $scene['ground'] : [];
    $music = is_array($scene['music'] ?? null) ? $scene['music'] : [];

    $gaps = [];
    foreach (array_slice(is_array($ground['gaps'] ?? null) ? $ground['gaps'] : [], 0, 30) as $gap) {
        if (!is_array($gap)) continue;
        $from = koobdCleanNumber($gap['from'] ?? 0, 0, $width, 0);
        $to = koobdCleanNumber($gap['to'] ?? 0, 0, $width, 0);
        if ($to - $from < 2) continue;
        $gaps[] = ['from' => $from, 'to' => $to, 'fill' => koobdCleanChoice($gap['fill'] ?? '', ['water', 'chasm'], 'water')];
    }

    $objects = [];
    foreach (array_slice(is_array($scene['objects'] ?? null) ? $scene['objects'] : [], 0, 600) as $index => $object) {
        if (!is_array($object)) continue;
        $kind = koobdCleanChoice($object['kind'] ?? '', ['block', 'image', 'legacy'], '');
        if ($kind === '') continue;
        $clean = [
            'id' => koobdCleanId($object['id'] ?? '', 'obj-' . ($index + 1)),
            'kind' => $kind,
            'x' => koobdCleanNumber($object['x'] ?? 50, -50, $width + 50, 50),
            'y' => koobdCleanNumber($object['y'] ?? 250, -100, 320, 250),
        ];
        if ($kind === 'block') {
            $clean['material'] = koobdCleanId($object['material'] ?? '', 'earth');
            $clean['cols'] = (int)koobdCleanNumber($object['cols'] ?? 2, 1, 200, 2);
            $clean['rows'] = (int)koobdCleanNumber($object['rows'] ?? 1, 1, 40, 1);
        } elseif ($kind === 'legacy') {
            $clean['type'] = koobdPlatformerBlockType($object['type'] ?? '');
            $clean['w'] = koobdCleanNumber($object['w'] ?? 28, 1, 200, 28);
            $clean['h'] = koobdCleanNumber($object['h'] ?? 7, 1, 100, 7);
            $clean['rotation'] = koobdCleanNumber($object['rotation'] ?? 0, -360, 360, 0);
            $clean['color'] = koobdCleanColor($object['color'] ?? '', '#5f9b58');
        } else {
            $prop = koobdCleanId($object['prop'] ?? '');
            $hazardId = koobdCleanId($object['hazardId'] ?? '');
            $asset = koobdPlatformerMediaPath($object['asset'] ?? '', ['image']);
            if ($prop === '' && $hazardId === '' && $asset === '') continue;
            if ($prop !== '') $clean['prop'] = $prop;
            if ($hazardId !== '') $clean['hazardId'] = $hazardId;
            if ($asset !== '') $clean['asset'] = $asset;
            $clean['w'] = koobdCleanNumber($object['w'] ?? 10, 0.5, 1000, 10);
            $clean['h'] = koobdCleanNumber($object['h'] ?? 10, 0.5, 300, 10);
            $clean['rotation'] = koobdCleanNumber($object['rotation'] ?? 0, -360, 360, 0);
            $clean['flip'] = !empty($object['flip']);
            $clean['solid'] = !empty($object['solid']);
            $clean['hazard'] = !empty($object['hazard']);
            $clean['layer'] = koobdCleanChoice($object['layer'] ?? '', ['far', 'back', 'front'], 'back');
            $clean['anim'] = koobdCleanChoice($object['anim'] ?? '', ['none', 'sway', 'banner', 'flicker', 'float', 'glow', 'drift', 'spin'], 'none');
            $clean['light'] = !empty($object['light']);
            // A hand-set hitbox (fractions of the picture's box) for solid and hazard pictures.
            $box = is_array($object['box'] ?? null) ? $object['box'] : null;
            if ($box) {
                $left = koobdCleanNumber($box['left'] ?? 0, 0, 0.95, 0);
                $top = koobdCleanNumber($box['top'] ?? 0, 0, 0.95, 0);
                $right = koobdCleanNumber($box['right'] ?? 1, $left + 0.05, 1, 1);
                $bottom = koobdCleanNumber($box['bottom'] ?? 1, $top + 0.05, 1, 1);
                $clean['box'] = ['left' => $left, 'top' => $top, 'right' => $right, 'bottom' => $bottom];
            }
        }
        $objects[] = $clean;
    }

    $characters = [];
    foreach (array_slice(is_array($scene['characters'] ?? null) ? $scene['characters'] : [], 0, 40) as $index => $character) {
        if (!is_array($character)) continue;
        $behavior = is_array($character['behavior'] ?? null) ? $character['behavior'] : [];
        $talk = [];
        foreach (array_slice(is_array($character['talk'] ?? null) ? $character['talk'] : [], 0, 30) as $line) {
            if (!is_array($line)) continue;
            $text = koobdCleanText($line['text'] ?? '', 400);
            if ($text === '') continue;
            $talk[] = ['speaker' => ($line['speaker'] ?? '') === 'player' ? 'player' : 'npc', 'text' => $text];
        }
        $clean = [
            'id' => koobdCleanId($character['id'] ?? '', 'char-' . ($index + 1)),
            'name' => koobdCleanText($character['name'] ?? '', 40),
            'x' => koobdCleanNumber($character['x'] ?? 60, 0, $width, 60),
            'feet' => koobdCleanNumber($character['feet'] ?? 0, -18, $groundY, 0),
            'scale' => koobdCleanNumber($character['scale'] ?? 1, 0.4, 2.5, 1),
            'behavior' => [
                'type' => koobdCleanChoice($behavior['type'] ?? '', ['stand', 'wander', 'pace', 'follow'], 'stand'),
                'radius' => koobdCleanNumber($behavior['radius'] ?? 20, 0, 200, 20),
                'speed' => koobdCleanNumber($behavior['speed'] ?? 0, 0, 60, 0),
            ],
            'talk' => $talk,
        ];
        $art = koobdCleanId($character['art'] ?? '');
        $upload = koobdPlatformerMediaPath($character['upload'] ?? '', ['image']);
        if ($upload !== '') {
            $clean['upload'] = $upload;
            $clean['sheet'] = !empty($character['sheet']);
            $portrait = koobdPlatformerMediaPath($character['portrait'] ?? '', ['image']);
            if ($portrait !== '') $clean['portrait'] = $portrait;
        } else {
            $clean['art'] = $art !== '' ? $art : 'profile-cubebot';
        }
        // An animated character can be set to keep its first pose.
        if (!empty($character['still'])) {
            $clean['still'] = true;
        }
        foreach (['appear', 'leave'] as $key) {
            $timing = is_array($character[$key] ?? null) ? $character[$key] : null;
            if (!$timing || koobdCleanId($timing['event'] ?? '') === '') continue;
            $clean[$key] = ['event' => koobdCleanId($timing['event'])];
            if ($key === 'appear') {
                $clean[$key]['at'] = koobdCleanChoice($timing['at'] ?? '', ['start', 'end'], 'start');
            } else {
                $clean[$key]['action'] = koobdCleanChoice($timing['action'] ?? '', ['walk', 'run', 'hide'], 'walk');
                $clean[$key]['toX'] = koobdCleanNumber($timing['toX'] ?? 0, -100, $width + 100, 0);
            }
        }
        $characters[] = $clean;
    }

    $checkpoints = [];
    foreach (array_slice(is_array($scene['checkpoints'] ?? null) ? $scene['checkpoints'] : [], 0, 40) as $index => $checkpoint) {
        if (!is_array($checkpoint)) continue;
        $checkpoints[] = [
            'id' => koobdCleanId($checkpoint['id'] ?? '', 'cp-' . ($index + 1)),
            'x' => koobdCleanNumber($checkpoint['x'] ?? 0, 0, $width, 0),
        ];
    }

    $events = [];
    foreach (array_slice(is_array($scene['events'] ?? null) ? $scene['events'] : [], 0, 60) as $index => $event) {
        if (!is_array($event)) continue;
        $trigger = is_array($event['trigger'] ?? null) ? $event['trigger'] : [];
        $cutscene = is_array($event['cutscene'] ?? null) ? $event['cutscene'] : [];
        $beats = [];
        foreach (array_slice(is_array($event['beats'] ?? null) ? $event['beats'] : [], 0, 80) as $beat) {
            $cleanBeat = koobdPlatformerBeatFromData($beat);
            if ($cleanBeat) $beats[] = $cleanBeat;
        }
        $focus = [];
        foreach (array_slice(is_array($cutscene['focus'] ?? null) ? $cutscene['focus'] : [], 0, 8) as $id) {
            $clean = koobdCleanId($id);
            if ($clean !== '') $focus[] = $clean;
        }
        $events[] = [
            'id' => koobdCleanId($event['id'] ?? '', 'ev-' . ($index + 1)),
            'label' => koobdCleanText($event['label'] ?? '', 60),
            'trigger' => [
                'type' => koobdCleanChoice($trigger['type'] ?? '', ['start', 'reach', 'talk'], 'start'),
                'x' => koobdCleanNumber($trigger['x'] ?? 0, 0, $width, 0),
                'character' => koobdCleanId($trigger['character'] ?? ''),
            ],
            'optional' => !empty($event['optional']),
            'cutscene' => ['focus' => $focus, 'holdCamera' => !empty($cutscene['holdCamera'])],
            'beats' => $beats,
            'after' => koobdCleanGoto($event['after'] ?? null),
        ];
    }

    $bgId = koobdCleanId($background['id'] ?? '');
    $musicAsset = koobdPlatformerMediaPath($music['asset'] ?? '', ['audio']);
    return [
        'v' => 3,
        'width' => $width,
        'player' => [
            'x' => koobdCleanNumber($player['x'] ?? 14, 0, $width, 14),
            'y' => koobdCleanNumber($player['y'] ?? 0, 0, $groundY, 0),
        ],
        'background' => [
            'id' => $bgId,
            'asset' => $bgId === '' ? koobdPlatformerMediaPath($background['asset'] ?? '', ['image']) : '',
            'color' => koobdCleanColor($background['color'] ?? '', '#8fd0ee'),
            'tint' => koobdCleanChoice($background['tint'] ?? '', ['day', 'dawn', 'afternoon', 'sunset', 'overcast', 'lamplit', 'night'], 'day'),
        ],
        'ground' => [
            'material' => koobdCleanId($ground['material'] ?? '', 'earth'),
            'asset' => koobdPlatformerMediaPath($ground['asset'] ?? '', ['image']),
            'color' => koobdCleanColor($ground['color'] ?? '', '#557d2e'),
            'gaps' => $gaps,
        ],
        'music' => $musicAsset !== ''
            ? ['asset' => $musicAsset, 'volume' => koobdCleanNumber($music['volume'] ?? 0.6, 0, 1, 0.6)]
            : null,
        'objects' => $objects,
        'characters' => $characters,
        'checkpoints' => $checkpoints,
        'events' => $events,
    ];
}

// The story's own settings (text font and size).
function koobdStorySettingsFromData($settings): array
{
    $settings = is_array($settings) ? $settings : [];
    return [
        'font' => koobdCleanChoice($settings['font'] ?? '', koobdStoryFontIds(), 'default'),
        'textSize' => koobdCleanChoice($settings['textSize'] ?? '', ['small', 'medium', 'large'], 'medium'),
    ];
}

// The story fonts (the same list as js/platform-library.js `fonts`).
function koobdStoryFontStacks(): array
{
    return [
        'default' => '',
        'storybook' => "Georgia, 'Times New Roman', serif",
        'rounded' => "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
        'handwritten' => "'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', cursive",
        'typewriter' => "'Courier New', Courier, monospace",
        'clean' => 'Arial, Helvetica, sans-serif',
        'display' => "Impact, 'Arial Black', 'Haettenschweiler', sans-serif",
        'elegant' => "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
    ];
}

function koobdStoryFontIds(): array
{
    return array_keys(koobdStoryFontStacks());
}

// --- Rich text (formatted story lines; js/rich-text.js) --------------------------------------
// A line's formatting is a small piece of HTML. Only these survive:
//   <b> <i> <u> <br> <ul> <ol> <li>, <div style="text-align:...">,
//   <span style="font-family (a story font) | font-size (em) | color | background-color">.
// Everything else is dropped (scripts, links, pictures, other styles...),
// keeping only its words.
function koobdRichColor(string $value): string
{
    $value = strtolower(trim($value));
    if (preg_match('/^#[0-9a-f]{3}([0-9a-f]{3})?$/', $value)) {
        return $value;
    }
    if (preg_match('/^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})(?:,\s*(0|1|0?\.\d+))?\)$/', $value, $m)) {
        if (isset($m[4]) && $m[4] !== '' && (float)$m[4] === 0.0) {
            return '';
        }
        return sprintf('#%02x%02x%02x', min(255, (int)$m[1]), min(255, (int)$m[2]), min(255, (int)$m[3]));
    }
    return '';
}

function koobdRichSize(string $value): string
{
    if (!preg_match('/^(\d+(?:\.\d+)?)em$/', trim($value), $m)) {
        return '';
    }
    $em = (float)$m[1];
    return ($em >= 0.5 && $em <= 3.5) ? (round($em, 3) . 'em') : '';
}

function koobdRichFont(string $value): string
{
    $squash = static fn(string $text): string => strtolower(preg_replace('/["\'\s]/', '', $text));
    $key = $squash(html_entity_decode($value, ENT_QUOTES, 'UTF-8'));
    if ($key === '') {
        return '';
    }
    foreach (koobdStoryFontStacks() as $stack) {
        if ($stack !== '' && $squash($stack) === $key) {
            return $stack;
        }
    }
    return '';
}

function koobdRichStyles(string $style): array
{
    $out = [];
    foreach (explode(';', $style) as $rule) {
        $parts = explode(':', $rule, 2);
        if (count($parts) === 2) {
            $out[strtolower(trim($parts[0]))] = trim($parts[1]);
        }
    }
    return $out;
}

// Walks the parsed HTML: [cleaned HTML, plain text]. In the plain text "\x01"
// marks the edge of a block (a line break if there are words on both sides).
function koobdRichWalk(DOMNode $node): array
{
    static $drop = ['script', 'style', 'iframe', 'object', 'embed', 'template', 'svg', 'math', 'img', 'video', 'audio', 'input', 'textarea', 'select', 'button', 'link', 'meta', 'head', 'title', 'noscript'];
    $html = '';
    $text = '';
    foreach ($node->childNodes as $child) {
        if ($child instanceof DOMText) {
            $value = str_replace("\u{200B}", '', $child->nodeValue);
            $html .= htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
            $text .= $value;
            continue;
        }
        if (!($child instanceof DOMElement)) {
            continue;
        }
        $tag = strtolower($child->tagName);
        if (in_array($tag, $drop, true)) {
            continue;
        }
        if ($tag === 'br') {
            $html .= '<br>';
            $text .= "\n";
            continue;
        }
        [$inner, $innerText] = koobdRichWalk($child);
        $styles = koobdRichStyles($child->getAttribute('style'));
        if (in_array($tag, ['b', 'strong'], true)) {
            $html .= $inner !== '' ? "<b>$inner</b>" : '';
        } elseif (in_array($tag, ['i', 'em'], true)) {
            $html .= $inner !== '' ? "<i>$inner</i>" : '';
        } elseif (in_array($tag, ['u', 'ins'], true)) {
            $html .= $inner !== '' ? "<u>$inner</u>" : '';
        } elseif (in_array($tag, ['ul', 'ol'], true)) {
            $html .= $inner !== '' ? "<$tag>$inner</$tag>" : '';
        } elseif ($tag === 'li') {
            $html .= "<li>$inner</li>";
        } elseif (in_array($tag, ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'], true)) {
            $align = strtolower($styles['text-align'] ?? $child->getAttribute('align'));
            $html .= in_array($align, ['left', 'center', 'right', 'justify'], true)
                ? "<div style=\"text-align:$align\">$inner</div>"
                : "<div>$inner</div>";
        } elseif (in_array($tag, ['span', 'font'], true)) {
            $keep = [];
            $font = koobdRichFont($styles['font-family'] ?? ($tag === 'font' ? $child->getAttribute('face') : ''));
            if ($font !== '') $keep[] = 'font-family:' . $font;
            $size = koobdRichSize($styles['font-size'] ?? '');
            if ($size !== '') $keep[] = 'font-size:' . $size;
            $color = koobdRichColor($styles['color'] ?? ($tag === 'font' ? $child->getAttribute('color') : ''));
            if ($color !== '') $keep[] = 'color:' . $color;
            $background = koobdRichColor($styles['background-color'] ?? '');
            if ($background !== '') $keep[] = 'background-color:' . $background;
            $wrapped = $inner;
            if (preg_match('/bold|[6-9]00/', $styles['font-weight'] ?? '')) $wrapped = "<b>$wrapped</b>";
            if (($styles['font-style'] ?? '') === 'italic') $wrapped = "<i>$wrapped</i>";
            if (strpos($styles['text-decoration'] ?? ($styles['text-decoration-line'] ?? ''), 'underline') !== false) $wrapped = "<u>$wrapped</u>";
            if ($inner !== '') {
                $html .= $keep ? '<span style="' . htmlspecialchars(implode(';', $keep), ENT_QUOTES, 'UTF-8') . "\">$wrapped</span>" : $wrapped;
            }
        } else {
            $html .= $inner;
        }
        $block = in_array($tag, ['div', 'p', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'], true);
        $text .= $block ? "\x01" . $innerText . "\x01" : $innerText;
    }
    return [$html, $text];
}

// A formatted line: ['rich' => cleaned HTML or '' (no formatting), 'text' => its words].
function koobdCleanRichText($html, int $maxText = 600): array
{
    $html = is_string($html) ? $html : '';
    if (trim($html) === '' || strlen($html) > 40000 || !class_exists('DOMDocument')) {
        return ['rich' => '', 'text' => ''];
    }
    $doc = new DOMDocument('1.0', 'UTF-8');
    $previous = libxml_use_internal_errors(true);
    $loaded = $doc->loadHTML('<?xml encoding="UTF-8"?><html><body>' . $html . '</body></html>', LIBXML_NONET);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    $body = $loaded ? $doc->getElementsByTagName('body')->item(0) : null;
    if (!$body) {
        return ['rich' => '', 'text' => ''];
    }
    [$rich, $text] = koobdRichWalk($body);
    $text = preg_replace('/\x01+/', "\x01", $text);
    $text = preg_replace('/\x01*\n\x01*/', "\n", $text);
    $text = trim(str_replace("\x01", "\n", $text));
    $text = trim(preg_replace("/\n{3,}/", "\n\n", $text));
    if (mb_strlen($text) > $maxText) {
        return ['rich' => '', 'text' => mb_substr($text, 0, $maxText)];
    }
    // No formatting at all (just lines): keep the words only.
    $bare = preg_replace('#<br>|</?div>#', '', $rich);
    return ['rich' => strpos($bare, '<') === false ? '' : $rich, 'text' => $text];
}

// A line's words and formatting from the editor: ['text' => ..., 'rich' => ...].
function koobdStoryLine(array $data, int $maxText = 600): array
{
    $text = koobdCleanText($data['text'] ?? '', $maxText);
    $rich = koobdCleanRichText($data['rich'] ?? '', $maxText);
    if ($rich['rich'] !== '') {
        return ['text' => $rich['text'], 'rich' => $rich['rich']];
    }
    return ['text' => $text, 'rich' => ''];
}

// A title's own size ('' = normal; see js/platform-library.js `titleSizes`).
function koobdTitleSizeIds(): array
{
    return ['', 'small', 'large', 'xlarge'];
}

function koobdStoryFontStack(string $font): string
{
    return koobdStoryFontStacks()[$font] ?? '';
}

// The pages as the story readers play them (js/teacher-story-player.js): each
// page's own content, its key and what follows it, and - for Platform Mode -
// the page as the editor built it (js/platform-story-compiler.js turns it into
// the world in the browser, exactly as the editor's preview does).
function koobdStoryPagesForPlayer(array $pages): array
{
    $backgrounds = koobdBackgroundCatalog();
    $characters = koobdCharacterCatalog();
    $out = [];
    foreach (array_values($pages) as $index => $page) {
        if (!is_array($page)) continue;
        $background = $backgrounds[$page['background'] ?? ''] ?? null;
        $leftCharacter = $characters[$page['leftCharacter'] ?? ''] ?? null;
        $rightCharacter = $characters[$page['rightCharacter'] ?? ''] ?? null;
        $elements = [];
        foreach (($page['elements'] ?? []) as $element) {
            if (!is_array($element)) continue;
            $elements[] = [
                'id' => $element['id'] ?? '',
                'type' => $element['type'] ?? 'narration',
                'text' => $element['text'] ?? '',
                'speaker' => $element['speaker'] ?? '',
                'side' => $element['side'] ?? '',
                'choices' => $element['choices'] ?? [],
                'voiceOverEnabled' => !empty($element['voiceOverEnabled']),
                'voiceOverUrl' => $element['voiceOverUrl'] ?? '',
                'voiceOverName' => $element['voiceOverName'] ?? '',
                'font' => $element['font'] ?? '',
                'size' => $element['size'] ?? '',
                'rich' => $element['rich'] ?? '',
            ];
        }
        $isPlatformer = ($page['pageType'] ?? '') === 'platformer';
        $out[] = [
            'key' => $page['key'] ?? ('pg' . ($index + 1)),
            'next' => $page['next'] ?? ['type' => 'next'],
            'pageType' => $isPlatformer ? 'platformer' : 'normal',
            'pageLabel' => $page['pageTitle'] ?? ('Page ' . ($index + 1)),
            'stageName' => $page['stageName'] ?? '',
            'stageSubtitle' => $page['stageSubtitle'] ?? '',
            'transition' => $page['transition'] ?? 'none',
            'background' => $page['background'] ?? '',
            'backgroundAsset' => ($page['backgroundAsset'] ?? '') !== '' ? $page['backgroundAsset'] : ($background['asset'] ?? ''),
            'backgroundLibrary' => $page['backgroundLibrary'] ?? '',
            'backgroundColor' => $page['backgroundColor'] ?? '#ffffff',
            'leftCharacterAsset' => ($page['leftCharacterAsset'] ?? '') !== '' ? $page['leftCharacterAsset'] : ($leftCharacter['asset'] ?? ''),
            'rightCharacterAsset' => ($page['rightCharacterAsset'] ?? '') !== '' ? $page['rightCharacterAsset'] : ($rightCharacter['asset'] ?? ''),
            'platformer' => $isPlatformer ? ($page['platformer'] ?? null) : null,
            'elements' => $elements,
        ];
    }
    return $out;
}

// The story's text style for the readers: a font stack and a size.
function koobdStoryTextStyle(array $story): array
{
    $settings = koobdStorySettingsFromData($story['settings'] ?? []);
    return ['font' => koobdStoryFontStack($settings['font']), 'size' => $settings['textSize']];
}
