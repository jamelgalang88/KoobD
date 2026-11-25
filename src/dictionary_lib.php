<?php
// Word meanings and English <-> Tagalog translations, for the story readers'
// Words panel (word_definition.php) and the Dictionary (dictionary.php,
// dictionary_api.php).
//
// Both come from Wiktionary (English and Tagalog words, explained in
// English) the first time a word is asked for, and are then kept in
// word_definitions, so a word looked up once works without the internet:
//   lang 'en' / 'tl'  a word's meanings
//   lang 'en>tl'      an English word's Tagalog translations
// Meanings marked vulgar, offensive, slang or old-fashioned are left out.
require_once __DIR__ . '/connect.php';

const KOOBD_DICTIONARY_SKIP = '/\b(vulgar|offensive|slur|derogatory|pejorative|obscene|sexual|slang|colloquial|obsolete|archaic|dated|rare|nonstandard|euphemis\w*|misspelling|abbreviation|initialism)\b/i';

// A word or short phrase someone typed, cleaned up; '' when it is not one.
function koobdDictionaryWord(string $text): string
{
    $text = trim(preg_replace('/\s+/u', ' ', str_replace('’', "'", $text)));
    $text = preg_replace("/^[\-']+|[\-']+$/u", '', $text);
    if ($text === '' || mb_strlen($text) > 40 || !preg_match("/^[\p{L}][\p{L}\p{M}' \-]*$/u", $text)) {
        return '';
    }
    return $text;
}

// Plain text from Wiktionary's HTML, without its nested sub-meanings.
function koobdDefinitionText(string $html): string
{
    $html = preg_replace('#<(ol|ul|dl|style|script)\b.*?</\1>#s', '', $html);
    $html = preg_replace('#<link\b[^>]*>#', '', $html);
    $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return trim(preg_replace('/\s+/u', ' ', $text));
}

// The little words a dictionary explains in grammar terms, in words a young
// reader understands.
function koobdSimpleWords(): array
{
    return [
        'a' => ['article', 'Used before a word for one thing or person, like "a cat".'],
        'an' => ['article', 'Used instead of "a" before a word that starts with a vowel sound, like "an apple".'],
        'the' => ['article', 'Used before a word for a thing or person we already know about, like "the sun".'],
        'is' => ['verb', 'A form of "be" for one person or thing, like "she is happy".'],
        'are' => ['verb', 'A form of "be" for you, we, they or more than one thing, like "they are here".'],
        'am' => ['verb', 'A form of "be" used with "I", like "I am ready".'],
        'was' => ['verb', 'The past form of "is", like "he was tired".'],
        'were' => ['verb', 'The past form of "are", like "we were late".'],
        'be' => ['verb', 'To exist or to have a quality, like "be kind".'],
        'and' => ['conjunction', 'Joins words or ideas together, like "bread and butter".'],
        'or' => ['conjunction', 'Shows a choice, like "tea or milk".'],
        'but' => ['conjunction', 'Joins two ideas that are different, like "small but strong".'],
        'of' => ['preposition', 'Shows that something belongs to or is part of something, like "a cup of tea".'],
        'to' => ['preposition', 'Shows where someone or something is going, like "go to school".'],
        'in' => ['preposition', 'Inside something, like "in the box".'],
        'into' => ['preposition', 'Moving to the inside of something, like "jump into the pool".'],
        'on' => ['preposition', 'Touching the top of something, like "on the table".'],
        'at' => ['preposition', 'Shows the place or time of something, like "at home".'],
        'with' => ['preposition', 'Together with someone or something, like "play with friends".'],
        'for' => ['preposition', 'Meant to be given to or used by someone, like "a gift for you".'],
        'from' => ['preposition', 'Shows where something starts, like "a letter from Grandma".'],
        'by' => ['preposition', 'Next to, or done by someone, like "sit by the window".'],
        'it' => ['pronoun', 'A word for a thing or animal already talked about.'],
        'he' => ['pronoun', 'A word for a boy or man already talked about.'],
        'she' => ['pronoun', 'A word for a girl or woman already talked about.'],
        'they' => ['pronoun', 'A word for people or things already talked about.'],
        'we' => ['pronoun', 'A word for yourself and other people together.'],
        'you' => ['pronoun', 'A word for the person you are talking to.'],
        'i' => ['pronoun', 'A word for yourself, the person speaking.'],
        'his' => ['determiner', 'Belonging to a boy or man.'],
        'her' => ['determiner', 'Belonging to a girl or woman.'],
        'their' => ['determiner', 'Belonging to them.'],
        'there' => ['adverb', 'In or at that place, like "put it there".'],
        'this' => ['determiner', 'The thing that is close to you, like "this book".'],
        'that' => ['determiner', 'The thing that is farther away, like "that tree".'],
        'not' => ['adverb', 'Makes a sentence mean the opposite, like "not cold".'],
        'very' => ['adverb', 'A lot; really, like "very big".'],
    ];
}

// A long meaning is cut after its first sentence or clause, and one that
// says its first sentence twice says it once.
function koobdDefinitionShort(string $text): string
{
    if (preg_match('/^(.{8,}?)\.\s+\1\b/u', $text, $repeat)) {
        $text = $repeat[1] . '.';
    }
    if (mb_strlen($text) <= 150) {
        return $text;
    }
    if (preg_match('/^(.{40,}?)[.;](\s|$)/u', $text, $match)) {
        return rtrim($match[1], ' ,') . '.';
    }
    return $text;
}

// A GET to Wiktionary: [status, body], status 0 when it could not be reached.
function koobdWiktionaryGet(string $url): array
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT => 'KoobD/1.0 (children\'s reading app; word meanings)',
    ]);
    $body = curl_exec($curl);
    $status = $body === false ? 0 : (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    return [$status, (string)$body];
}

// Fetches one word's entries for a language from Wiktionary: a list of
// ['pos', 'text', 'example', 'base'] (base: the word a "plural of ..." entry
// points to), [] when it has none, or null when Wiktionary could not be reached.
function koobdFetchDefinitions(string $word, string $lang, int $depth = 0): ?array
{
    [$status, $body] = koobdWiktionaryGet('https://en.wiktionary.org/api/rest_v1/page/definition/' . rawurlencode(str_replace(' ', '_', $word)) . '?redirect=true');
    if ($status === 404) {
        return [];
    }
    if ($status !== 200) {
        return null;
    }
    $data = json_decode($body, true);
    $entries = is_array($data) ? ($data[$lang] ?? []) : [];
    $senses = [];
    $perPos = [];
    // A word with several origins (lead the metal, lead the way) has an
    // entry for each: the first meaning of each, so the right one is there.
    $entriesPerPos = array_count_values(array_map(static fn($entry) => strtolower(trim((string)($entry['partOfSpeech'] ?? ''))), $entries));
    foreach ($entries as $entry) {
        $pos = strtolower(trim((string)($entry['partOfSpeech'] ?? '')));
        if ($pos === '' || in_array($pos, ['proper noun', 'symbol', 'letter', 'prefix', 'suffix'], true)) {
            continue;
        }
        $fromEntry = 0;
        $perEntry = ($entriesPerPos[$pos] ?? 1) > 1 ? 1 : 2;
        foreach ((array)($entry['definitions'] ?? []) as $definition) {
            if (($perPos[$pos] ?? 0) >= 3 || $fromEntry >= $perEntry || count($senses) >= 10) {
                break;
            }
            $html = (string)($definition['definition'] ?? '');
            $text = koobdDefinitionText($html);
            if (mb_strlen($text) < 3) {
                continue;
            }
            // Labels such as "(transitive)" or "(slang)" come first.
            preg_match('/^((?:\([^)]*\)\s*)+)/u', $text, $labels);
            if (preg_match(KOOBD_DICTIONARY_SKIP, ($labels[1] ?? '') . ' ' . $text)) {
                continue;
            }
            $text = trim(preg_replace('/^(?:\([^)]*\)\s*)+/u', '', $text));
            $base = '';
            if (strpos($html, 'form-of-definition') !== false && preg_match('/form-of-definition-link.*?title="([^"#]+)"/s', $html, $link)) {
                $base = html_entity_decode($link[1], ENT_QUOTES, 'UTF-8');
            }
            // Only grammar forms are followed ("plural of insect"), not other
            // spellings ("alternative form of thee").
            if ($base !== '' && preg_match('/\b(alternative|spelling|dialect|pronunciation|contraction|clipping|early modern|middle english)\b/i', $text)) {
                continue;
            }
            if ($base !== '' && $depth === 0 && mb_strtolower($base) !== mb_strtolower($word)) {
                // "plural of insect": the meaning of "insect", same part of speech.
                $baseSenses = array_values(array_filter(koobdFetchDefinitions($base, $lang, 1) ?? [], static fn($sense) => $sense['pos'] === $pos));
                foreach (array_slice($baseSenses, 0, 2) as $baseSense) {
                    if (($perPos[$pos] ?? 0) >= 3) {
                        break;
                    }
                    $senses[] = ['pos' => $pos, 'text' => $baseSense['text'], 'example' => $baseSense['example'], 'base' => $base];
                    $perPos[$pos] = ($perPos[$pos] ?? 0) + 1;
                    $fromEntry++;
                }
                continue;
            }
            if ($base !== '') {
                continue;
            }
            $example = '';
            foreach ((array)($definition['examples'] ?? []) as $sample) {
                $sample = koobdDefinitionText((string)$sample);
                if ($sample !== '' && mb_strlen($sample) <= 140 && !preg_match(KOOBD_DICTIONARY_SKIP, $sample)) {
                    $example = $sample;
                    break;
                }
            }
            $text = koobdDefinitionShort($text);
            $text = mb_strtoupper(mb_substr($text, 0, 1)) . mb_substr($text, 1);
            $senses[] = ['pos' => $pos, 'text' => $text, 'example' => $example, 'base' => ''];
            $perPos[$pos] = ($perPos[$pos] ?? 0) + 1;
            $fromEntry++;
        }
    }
    // A heading meaning can arrive with the next meaning run on after it
    // ("To make full To add contents..."): that part is cut off, and a
    // meaning left as only a heading ("As an auxiliary verb:") or repeated
    // is dropped.
    $texts = array_column($senses, 'text');
    $clean = [];
    $seen = [];
    foreach ($senses as $sense) {
        foreach ($texts as $other) {
            if ($other !== $sense['text'] && mb_strlen($other) >= 12 && str_ends_with($sense['text'], ' ' . $other)) {
                $sense['text'] = rtrim(mb_substr($sense['text'], 0, mb_strlen($sense['text']) - mb_strlen($other) - 1));
            }
        }
        $key = $sense['pos'] . '|' . mb_strtolower($sense['text']);
        if ($sense['text'] === '' || str_ends_with($sense['text'], ':') || isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $clean[] = $sense;
    }
    return $clean;
}

// An English word's Tagalog translations, from its Wiktionary page's
// translation tables: a list of ['sense' => 'dense collection of trees',
// 'words' => ['gubat']], [] when it has none, or null when Wiktionary could
// not be reached.
function koobdFetchTranslations(string $word): ?array
{
    $wikitext = static function (string $page): ?string {
        [$status, $body] = koobdWiktionaryGet('https://en.wiktionary.org/w/api.php?action=parse&format=json&formatversion=2&prop=wikitext&redirects=1&page=' . rawurlencode($page));
        if ($status !== 200) {
            return null;
        }
        $data = json_decode($body, true);
        return is_array($data) ? (string)($data['parse']['wikitext'] ?? '') : null;
    };
    $text = $wikitext($word);
    if ($text === null) {
        return null;
    }
    // Only the English section.
    if (preg_match('/^==English==\s*$(.*?)(?=^==[^=]|\z)/msu', $text, $english)) {
        $text = $english[1];
    }
    // Long pages keep their translations on a page of their own (first).
    if (stripos($text, '{{see translation subpage') !== false) {
        $text = ($wikitext($word . '/translations') ?? '') . "\n" . $text;
    }
    $groups = [];
    $sense = '';
    foreach (preg_split('/\R/u', $text) as $line) {
        if (preg_match('/\{\{trans-top(?:-also)?\|([^}]*)\}\}/u', $line, $top)) {
            $sense = '';
            foreach (explode('|', $top[1]) as $part) {
                if (strpos($part, '=') === false) {
                    $sense = trim(preg_replace('/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/u', '$1', $part));
                    break;
                }
            }
            continue;
        }
        if (!preg_match('/^\*+:?\s*Tagalog\s*:/u', $line) || preg_match(KOOBD_DICTIONARY_SKIP, $sense)) {
            continue;
        }
        // {{t|tl|gubat}}, {{t+|tl|...}}, {{tt|tl|...}}; unchecked ones ({{t-check}}) are left out.
        preg_match_all('/\{\{(?:t|t\+|tt|tt\+)\|tl\|([^|}]+)/u', $line, $found);
        $words = array_values(array_unique(array_filter(array_map(static fn($item) => trim(preg_replace('/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/u', '$1', $item)), $found[1]))));
        // A meaning that only repeats words already listed adds nothing.
        $listed = array_merge([], ...array_column($groups, 'words'));
        if (!$words || !array_diff($words, $listed)) {
            continue;
        }
        $key = mb_strtolower($sense);
        if (isset($groups[$key])) {
            $groups[$key]['words'] = array_values(array_unique(array_merge($groups[$key]['words'], $words)));
        } else {
            $groups[$key] = ['sense' => $sense, 'words' => array_slice($words, 0, 6)];
        }
        if (count($groups) >= 5) {
            break;
        }
    }
    return array_values($groups);
}

// One cached look-up (word_definitions): the kept answer, or $fetch's
// (saved for next time). A word with nothing is asked about again after a
// week. Null when it is not kept and Wiktionary could not be reached.
function koobdDictionaryCached(string $lang, string $key, callable $fetch): ?array
{
    global $conn;
    $stmt = $conn->prepare("SELECT data, fetched_at FROM word_definitions WHERE lang = ? AND word = ? LIMIT 1");
    $stmt->bind_param('ss', $lang, $key);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if ($row && ($row['data'] !== null || strtotime((string)$row['fetched_at']) > time() - 7 * 86400)) {
        return $row['data'] !== null ? (json_decode((string)$row['data'], true) ?: []) : [];
    }
    $result = $fetch();
    if ($result === null) {
        return null;
    }
    $json = $result ? json_encode($result, JSON_UNESCAPED_UNICODE) : null;
    $save = $conn->prepare("REPLACE INTO word_definitions (lang, word, data, fetched_at) VALUES (?, ?, ?, NOW())");
    $save->bind_param('sss', $lang, $key, $json);
    $save->execute();
    $save->close();
    return $result;
}

// A word's meanings in a language ('en' or 'tl'), or null when they are not
// kept and Wiktionary could not be reached.
function koobdWordSenses(string $word, string $lang): ?array
{
    $key = mb_strtolower($word);
    $simple = $lang === 'en' ? (koobdSimpleWords()[$key] ?? null) : null;
    if ($simple) {
        return [['pos' => $simple[0], 'text' => $simple[1], 'example' => '', 'base' => '']];
    }
    return koobdDictionaryCached($lang, $key, static function () use ($word, $key, $lang) {
        $senses = koobdFetchDefinitions($key, $lang);
        // A name or a word written with capitals (Monday) may only be found as written.
        if ($senses === [] && $key !== $word) {
            $senses = koobdFetchDefinitions($word, $lang);
        }
        return $senses;
    });
}

// An English word's Tagalog translations, or null when they are not kept and
// Wiktionary could not be reached.
function koobdWordTranslations(string $word): ?array
{
    $key = mb_strtolower($word);
    return koobdDictionaryCached('en>tl', $key, static fn() => koobdFetchTranslations($key));
}

// A Tagalog word's English translations, from its meanings (which Wiktionary
// gives in English): the short ones ("Child; kid" -> child, kid), grouped by
// part of speech. A longer explanation stays a meaning only.
function koobdTagalogToEnglish(array $senses): array
{
    $groups = [];
    foreach ($senses as $sense) {
        $gloss = trim(preg_replace('/\s*\([^)]*\)/u', '', rtrim($sense['text'], '.')));
        $pieces = array_filter(array_map('trim', preg_split('/\s*[;,]\s*/u', $gloss)), 'strlen');
        $short = $pieces && max(array_map('str_word_count', $pieces)) <= 3 && !preg_grep('/^etc$/i', $pieces);
        if (!$short) {
            $pieces = str_word_count($gloss) <= 4 && strpos($gloss, ',') === false ? [$gloss] : [];
        }
        foreach ($pieces as $piece) {
            if ($piece === '') {
                continue;
            }
            $piece = mb_strtolower(mb_substr($piece, 0, 1)) . mb_substr($piece, 1);
            $groups[$sense['pos']] = $groups[$sense['pos']] ?? ['sense' => $sense['pos'], 'words' => []];
            if (!in_array($piece, $groups[$sense['pos']]['words'], true) && count($groups[$sense['pos']]['words']) < 6) {
                $groups[$sense['pos']]['words'][] = $piece;
            }
        }
    }
    return array_values($groups);
}
