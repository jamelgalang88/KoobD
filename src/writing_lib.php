<?php
// Writing Practice (writing.php, writing_api.php): spelling with hunspell's
// English and Tagalog dictionaries, the optional AI review with Claude, and
// the notepads themselves (writing_notes).
//
// The built-in checker (js/writing-checker.js) does grammar, prefixes and
// suffixes, organization, vocabulary, emoji and language-mismatch checks in
// the browser as the student writes; it asks here only which words each
// dictionary knows. The AI review is the deeper, slower check: it runs only
// when ANTHROPIC_API_KEY is set on the server and the student asks for it.
require_once __DIR__ . '/connect.php';

const KOOBD_WRITING_MODEL = 'claude-opus-5-5';
const KOOBD_WRITING_MAX_BODY = 20000;   // characters in one notepad
const KOOBD_WRITING_MAX_NOTES = 200;    // notepads per student

// --- Spelling ------------------------------------------------------------------------------------------
// Each word, checked in both languages: ['en' => ok?, 'tl' => ok?, 'suggest'
// => [the selected language's suggestions]]. Words hunspell cannot be run on
// count as known, so nothing is marked wrong when the checker is missing.
function koobdSpellCheck(array $words, string $lang): array
{
    $words = array_values(array_unique(array_filter(array_map(
        static fn($word) => mb_substr(trim((string)$word), 0, 40),
        $words
    ), static fn($word) => $word !== '' && preg_match("/^[\p{L}][\p{L}\p{M}'’\-]*$/u", $word))));
    $words = array_slice($words, 0, 400);
    // A hyphenated word (nag-aral, araw-araw, well-known) is also checked part
    // by part: hunspell itself splits it at the hyphen.
    $parts = [];
    foreach ($words as $word) {
        if (strpos($word, '-') !== false) {
            foreach (array_filter(explode('-', $word), 'strlen') as $part) {
                $parts[] = $part;
            }
        }
    }
    // Each word is also checked with and without a capital: a word the
    // dictionary knows only with a capital (Maria, Manila) is a name.
    $cases = [];
    foreach ($words as $word) {
        if (strpos($word, '-') === false) {
            $cases[] = mb_strtolower($word);
            $cases[] = mb_strtoupper(mb_substr($word, 0, 1)) . mb_substr($word, 1);
        }
    }
    $all = array_values(array_unique(array_merge($words, $parts, $cases)));
    $checks = ['en' => koobdHunspell($all, 'en_US'), 'tl' => koobdHunspell($all, 'tl')];
    // Names: known with a capital, but in small letters by neither language
    // ("ni", "kay" are Tagalog words, not the names Ni and Kay).
    $names = [];
    foreach ($words as $word) {
        if (strpos($word, '-') === false) {
            $low = mb_strtolower($word);
            $capital = mb_strtoupper(mb_substr($word, 0, 1)) . mb_substr($low, 1);
            $everyday = ($checks['en'][$low]['ok'] ?? true) || ($checks['tl'][$low]['ok'] ?? true);
            $names[$word] = !$everyday && (($checks['en'][$capital]['ok'] ?? false) || ($checks['tl'][$capital]['ok'] ?? false));
        }
    }
    // Tagalog prefixes written with a hyphen before a vowel (nag-aral, pag-ibig, ika-5).
    $tlPrefixes = ['nag', 'mag', 'pag', 'ipag', 'pang', 'ika', 'pinaka', 'napaka', 'naka', 'maka', 'makipag', 'nakipag', 'taga', 'ka', 'isa', 'tig', 'mang', 'nang', 'ipang'];
    $known = static function (string $word, string $lang) use (&$checks, $tlPrefixes): bool {
        if ($checks[$lang][$word]['ok'] ?? true) {
            return true;
        }
        if (strpos($word, '-') === false) {
            return false;
        }
        $pieces = array_values(array_filter(explode('-', $word), 'strlen'));
        foreach ($pieces as $index => $piece) {
            $ok = $checks[$lang][$piece]['ok'] ?? true;
            if (!$ok && !($lang === 'tl' && $index === 0 && in_array(mb_strtolower($piece), $tlPrefixes, true))) {
                return false;
            }
        }
        return (bool)$pieces;
    };
    // Tagalog words take many forms (lumangoy, kinakain, pinagsabihan) that
    // the dictionary may not list: a word whose root it knows is accepted.
    $roots = [];
    foreach ($words as $word) {
        if (!$known($word, 'tl') && strpos($word, '-') === false) {
            $roots[$word] = koobdTagalogRoots(mb_strtolower($word));
        }
    }
    if ($roots) {
        $rootCheck = koobdHunspell(array_values(array_unique(array_merge(...array_values($roots)))), 'tl');
        foreach ($roots as $word => $candidates) {
            foreach ($candidates as $root) {
                if ($rootCheck[$root]['ok'] ?? false) {
                    $checks['tl'][$word] = ['ok' => true, 'suggest' => []];
                    break;
                }
            }
            // Or another form of a word the dictionary knows: lumangoy shares
            // its root (langoy) with the suggested lumalangoy.
            if (!($checks['tl'][$word]['ok'] ?? true)) {
                $mine = array_filter($candidates, static fn($root) => mb_strlen($root) >= 4);
                foreach ($checks['tl'][$word]['suggest'] ?? [] as $suggestion) {
                    $theirs = array_merge([mb_strtolower($suggestion)], koobdTagalogRoots(mb_strtolower($suggestion)));
                    if (array_intersect($mine, $theirs)) {
                        $checks['tl'][$word] = ['ok' => true, 'suggest' => []];
                        break;
                    }
                }
            }
        }
    }
    $result = [];
    $selected = $lang === 'tl' ? 'tl' : 'en';
    foreach ($words as $word) {
        $ok = ['en' => $known($word, 'en'), 'tl' => $known($word, 'tl')];
        $result[$word] = [
            'name' => $names[$word] ?? false,
            'en' => $ok['en'],
            'tl' => $ok['tl'],
            'suggest' => $ok[$selected] ? [] : array_slice($checks[$selected][$word]['suggest'] ?? [], 0, 5),
        ];
    }
    return $result;
}

// The roots a Tagalog word may be made from: its prefixes, the -um-/-in-
// infixes after the first consonant, the -an/-in/-han/-hin endings and a
// repeated first syllable taken off (lumangoy -> langoy, kinakain -> kain).
function koobdTagalogRoots(string $word): array
{
    $stems = [$word];
    // These prefixes take a hyphen before a vowel (nag-aral): written without
    // one ("nagaral") the word is not accepted from its root.
    $hyphenated = ['makipag', 'nakipag', 'ipag', 'ipinag', 'pinag', 'nag', 'mag', 'pag', 'pang', 'mang'];
    foreach (['makipag', 'nakipag', 'pinaka', 'napaka', 'ipag', 'ipinag', 'pinag', 'maka', 'naka', 'nag', 'mag', 'pag', 'pang', 'mang', 'nang', 'ika', 'ma', 'na', 'pa', 'ka', 'i'] as $prefix) {
        if (str_starts_with($word, $prefix) && mb_strlen($word) - mb_strlen($prefix) >= 3) {
            if (in_array($prefix, $hyphenated, true) && preg_match('/^[aeiou]/', substr($word, strlen($prefix)))) {
                continue;
            }
            $stems[] = substr($word, strlen($prefix));
        }
    }
    $more = [];
    foreach ($stems as $stem) {
        // -um- / -in- after the first consonant (l-um-angoy, k-in-ain).
        if (preg_match('/^([bcdfghklmnpqrstvwyz])(um|in)(\p{L}{3,})$/u', $stem, $m)) {
            $more[] = $m[1] . $m[3];
        }
        // um- / in- before a vowel (umalis, inabot).
        if (preg_match('/^(um|in)([aeiou]\p{L}{2,})$/u', $stem, $m)) {
            $more[] = $m[2];
        }
    }
    $stems = array_merge($stems, $more);
    $more = [];
    foreach ($stems as $stem) {
        // a repeated first syllable (kakain -> kain, lalangoy -> langoy).
        if (preg_match('/^([bcdfghklmnpqrstvwyz]?[aeiou])(\1\p{L}{2,})$/u', $stem, $m)) {
            $more[] = $m[2];
        }
        foreach (['han', 'hin', 'an', 'in'] as $suffix) {
            if (str_ends_with($stem, $suffix) && mb_strlen($stem) - mb_strlen($suffix) >= 3) {
                $more[] = substr($stem, 0, -strlen($suffix));
            }
        }
    }
    $stems = array_merge($stems, $more);
    // Once more for the endings of a stem that also lost a repeated syllable.
    foreach ($more as $stem) {
        foreach (['han', 'hin', 'an', 'in'] as $suffix) {
            if (str_ends_with($stem, $suffix) && mb_strlen($stem) - mb_strlen($suffix) >= 3) {
                $stems[] = substr($stem, 0, -strlen($suffix));
            }
        }
    }
    return array_values(array_unique(array_filter($stems, static fn($stem) => $stem !== $word && mb_strlen($stem) >= 3)));
}

// Runs hunspell once over the words (one word to a line, in ispell pipe mode).
// A hyphenated word is checked part by part; it is known when every part is.
function koobdHunspell(array $words, string $dictionary): array
{
    if (!$words || !is_file('/usr/share/hunspell/' . $dictionary . '.dic')) {
        return [];
    }
    $process = proc_open(
        ['hunspell', '-d', $dictionary, '-a', '-i', 'utf-8'],
        [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $pipes
    );
    if (!is_resource($process)) {
        return [];
    }
    // "^" keeps a line from being read as a hunspell command.
    fwrite($pipes[0], implode("\n", array_map(static fn($word) => '^' . str_replace("’", "'", $word), $words)) . "\n");
    fclose($pipes[0]);
    $output = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($process);

    // After the version line, each input line's results end with a blank line.
    $blocks = preg_split("/\n\n/", trim(preg_replace('/^@\(#\).*\n/', '', (string)$output)) . "\n");
    $checked = [];
    foreach ($words as $index => $word) {
        $lines = array_filter(explode("\n", (string)($blocks[$index] ?? '')), 'strlen');
        $ok = true;
        $suggest = [];
        foreach ($lines as $line) {
            $mark = $line[0];
            if ($mark === '&' || $mark === '#') {
                $ok = false;
                if ($mark === '&' && ($colon = strpos($line, ':')) !== false) {
                    $suggest = array_merge($suggest, array_map('trim', explode(',', substr($line, $colon + 1))));
                }
            }
        }
        $checked[$word] = ['ok' => $ok, 'suggest' => array_values(array_unique(array_filter($suggest, static fn($item) => $item !== '' && strpos($item, ' ') === false)))];
    }
    return $checked;
}

// --- Notepads -----------------------------------------------------------------------------------------------
function koobdWritingNow(): int
{
    return (int)floor(microtime(true) * 1000);
}

function koobdWritingNote(int $noteId, int $userId): ?array
{
    global $conn;
    $stmt = $conn->prepare("SELECT * FROM writing_notes WHERE id = ? AND user_id = ? LIMIT 1");
    $stmt->bind_param('ii', $noteId, $userId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

// A challenge whose time ran out while nobody was there is finished here:
// completed if the student was writing until the end, interrupted if they
// had left before it.
function koobdWritingSettle(array $note): array
{
    global $conn;
    if ($note['kind'] !== 'challenge' || $note['challenge_status'] !== 'running') {
        return $note;
    }
    $now = koobdWritingNow();
    $ends = (int)$note['challenge_ends_ms'];
    if ($now < $ends) {
        return $note;
    }
    $seen = (int)$note['challenge_seen_ms'];
    $status = $seen >= $ends - 8000 ? 'completed' : 'interrupted';
    $stmt = $conn->prepare("UPDATE writing_notes SET challenge_status = ? WHERE id = ? AND challenge_status = 'running'");
    $stmt->bind_param('si', $status, $note['id']);
    $stmt->execute();
    $stmt->close();
    $note['challenge_status'] = $status;
    return $note;
}

// A notepad as the page uses it.
function koobdWritingNoteData(array $note, bool $withBody = true): array
{
    $data = [
        'id' => (int)$note['id'],
        'title' => (string)$note['title'],
        'lang' => $note['lang'] === 'tl' ? 'tl' : 'en',
        'kind' => $note['kind'] === 'challenge' ? 'challenge' : 'note',
        'updated' => strtotime((string)$note['updated_at']) * 1000,
        'words' => preg_match_all("/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/u", (string)$note['body']),
        'preview' => mb_substr(trim(preg_replace('/\s+/u', ' ', (string)$note['body'])), 0, 90),
    ];
    if ($data['kind'] === 'challenge') {
        $data['challenge'] = [
            'seconds' => (int)$note['challenge_seconds'],
            'started' => (int)$note['challenge_started_ms'],
            'ends' => (int)$note['challenge_ends_ms'],
            'status' => (string)$note['challenge_status'],
            'resumed' => (bool)$note['challenge_resumed'],
        ];
    }
    if ($withBody) {
        $data['body'] = (string)$note['body'];
        $data['ignored'] = json_decode((string)($note['ignored'] ?? ''), true) ?: [];
        $data['feedback'] = json_decode((string)($note['feedback'] ?? ''), true) ?: null;
        $data['review'] = json_decode((string)($note['ai_review'] ?? ''), true) ?: null;
    }
    return $data;
}

// --- AI review (Claude) ------------------------------------------------------------------------------------
function koobdWritingAiAvailable(): bool
{
    return (string)getenv('ANTHROPIC_API_KEY') !== '' && is_file('/opt/koobd-lib/vendor/autoload.php');
}

// What Claude is asked to return: corrections tied to exact quotes from the
// writing, the strengths, advice and improved sentences.
function koobdWritingReviewSchema(): array
{
    $issue = [
        'type' => 'object',
        'properties' => [
            'quote' => ['type' => 'string', 'description' => 'The exact words from the writing, copied character for character (a word or a short phrase, at most one sentence).'],
            'type' => ['type' => 'string', 'enum' => ['spelling', 'grammar', 'organization', 'vocabulary', 'mismatch', 'emoji']],
            'definite' => ['type' => 'boolean', 'description' => 'true for a real mistake; false for an optional style or creativity idea.'],
            'title' => ['type' => 'string', 'description' => 'A few words naming the problem.'],
            'explanation' => ['type' => 'string', 'description' => 'Why, in one or two short sentences a young student understands.'],
            'suggestion' => ['type' => 'string', 'description' => 'The corrected words that would replace the quote exactly.'],
        ],
        'required' => ['quote', 'type', 'definite', 'title', 'explanation', 'suggestion'],
        'additionalProperties' => false,
    ];
    return [
        'type' => 'object',
        'properties' => [
            'strengths' => ['type' => 'array', 'items' => ['type' => 'string']],
            'issues' => ['type' => 'array', 'items' => $issue],
            'advice' => ['type' => 'array', 'items' => ['type' => 'string']],
            'improved' => ['type' => 'array', 'items' => [
                'type' => 'object',
                'properties' => ['original' => ['type' => 'string'], 'suggestion' => ['type' => 'string']],
                'required' => ['original', 'suggestion'],
                'additionalProperties' => false,
            ]],
            'summary' => ['type' => 'string'],
        ],
        'required' => ['strengths', 'issues', 'advice', 'improved', 'summary'],
        'additionalProperties' => false,
    ];
}

// Asks Claude to review a student's writing. Returns the review, or
// ['error' => message] when it could not be done.
function koobdWritingAiReview(string $text, string $lang): array
{
    if (!koobdWritingAiAvailable()) {
        return ['error' => 'The AI review is not set up on this server.'];
    }
    require_once '/opt/koobd-lib/vendor/autoload.php';
    $language = $lang === 'tl' ? 'Tagalog (Filipino)' : 'English';
    $system = <<<PROMPT
You are a warm, encouraging writing coach for students in the Philippines (roughly ages 8 to 16) using a reading app called KOOB'D. A student has written a piece in {$language}, the language they chose to practise. Review it and help them grow as a writer.

How to review:
- Check spelling and word choice, prefixes and suffixes (for Tagalog: affixes such as mag-/nag-/um-/-in-/-an, hyphen use as in nag-aral, rin/din, raw/daw, ng/nang), grammar, punctuation, sentence structure, organization and flow, vocabulary and creativity, and emoji use.
- The selected language is {$language}. If the student wrote words or sentences in the other language, mark them as type "mismatch" and give the {$language} translation as the suggestion. Do not flag commonly accepted borrowed words (computer, cellphone, basketball, internet and the like), names and proper nouns, or brief natural code-switching that a fluent speaker would accept; when in doubt, mark a mismatch as definite: false.
- Names of people, places, characters, pets and other proper nouns are never mistakes, even when they are unusual or not in a dictionary: do not change, translate or respell them, and keep the student's names exactly as written in the improved sentences. Only point out a name that should start with a capital letter (for example "si maria" -> "si Maria").
- Never mark a correct Tagalog expression as wrong because it differs from English grammar (for example verb-first sentences or "ay" inversion are both fine). Accept regional variations and other valid ways of saying the same thing.
- Separate real mistakes (definite: true) from optional style or creativity ideas (definite: false). Keep creativity ideas few and respectful of the student's own ideas and voice; never rewrite their story.
- Use the "emoji" type only when emojis are excessive or make the writing harder to read.
- Each issue's quote must be copied exactly from the student's text so it can be found and underlined; keep it as short as possible (the wrong word, or the short phrase). The suggestion replaces that quote exactly.
- Write every title, explanation, strength and advice item in simple, friendly English a young student understands, with a short example where it helps. For Tagalog writing you may include the Tagalog example in the explanation.
- Strengths: always find at least two real things the student did well, and be specific.
- Advice: two to four practical tips for their next piece of writing.
- Improved: up to three of their sentences rewritten with the corrections applied, keeping their meaning and style.
- Summary: two or three encouraging sentences.
- List at most 25 issues, most important first. If the writing is very short, still be encouraging.
PROMPT;
    try {
        $client = new \Anthropic\Client(
            apiKey: (string)getenv('ANTHROPIC_API_KEY'),
            requestOptions: ['timeout' => 100, 'maxRetries' => 1],
        );
        $message = $client->beta->messages->create(
            model: KOOBD_WRITING_MODEL,
            maxTokens: 16000,
            system: $system,
            messages: [['role' => 'user', 'content' => "Here is the student's writing:\n\n<writing>\n" . $text . "\n</writing>"]],
            outputConfig: [
                'effort' => 'medium',
                'format' => ['type' => 'json_schema', 'schema' => koobdWritingReviewSchema()],
            ],
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
        );
    } catch (\Anthropic\Core\Exceptions\RateLimitException $error) {
        return ['error' => 'The AI review is busy right now. Please try again in a minute.'];
    } catch (\Anthropic\Core\Exceptions\AuthenticationException $error) {
        error_log('KoobD writing review: authentication failed - check ANTHROPIC_API_KEY');
        return ['error' => 'The AI review is not set up correctly on this server.'];
    } catch (\Anthropic\Core\Exceptions\APIStatusException $error) {
        error_log('KoobD writing review: ' . $error->getMessage());
        return ['error' => 'The AI review could not be done right now. Please try again later.'];
    } catch (\Anthropic\Core\Exceptions\APIConnectionException $error) {
        return ['error' => 'The AI review needs the internet. Check the connection and try again.'];
    } catch (\Throwable $error) {
        error_log('KoobD writing review: ' . $error->getMessage());
        return ['error' => 'The AI review could not be done right now. Please try again later.'];
    }
    if (($message->stopReason ?? '') === 'refusal') {
        return ['error' => 'The AI review could not review this writing.'];
    }
    $json = '';
    foreach ($message->content as $block) {
        if ($block->type === 'text') {
            $json = $block->text;
            break;
        }
    }
    $review = json_decode($json, true);
    if (!is_array($review) || !isset($review['issues'])) {
        return ['error' => 'The AI review could not be read. Please try again.'];
    }
    // Only quotes that really are in the writing can be underlined.
    $review['issues'] = array_values(array_filter((array)$review['issues'], static fn($issue) => is_array($issue) && ($issue['quote'] ?? '') !== '' && mb_strpos($text, (string)$issue['quote']) !== false));
    $review['model'] = KOOBD_WRITING_MODEL;
    $review['hash'] = md5($text . '|' . $lang);
    $review['at'] = koobdWritingNow();
    return $review;
}
