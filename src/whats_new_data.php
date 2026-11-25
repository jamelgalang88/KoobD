<?php
// What's New: KoobD's changelog - new stories, new features, improvements and
// bug fixes - shown on Home (the latest few) and on whats_new.php (all of it).
//
// Only updates that matter to readers and teachers belong here: a new story,
// a new feature, or a change people will notice in how KoobD works or feels.
// Small tweaks, behind-the-scenes changes and minor fixes are left out.
//
// To add an update, put a new entry at the top of the list in koobdWhatsNew():
//   'id'      a short unique slug (used for links to the entry)
//   'type'    'story' | 'feature' | 'improvement' | 'fix'
//   'date'    'YYYY-MM-DD'
//   'title'   a few words
//   'summary' one or two short sentences
//   'points'  optional: a few short bullet points
//   'major'   optional: true for a big update (shown a little more prominently)
//   'story'   optional, for a new story: a classic story's id ('book1',
//             'false_knight'); it links straight to the story.
// Stories published by teachers and students in the last 60 days are added
// as "New story" entries by themselves.

require_once __DIR__ . '/auth.php';

// The categories, in the order the page's filters show them.
function koobdWhatsNewTypes(): array
{
    return [
        'story' => ['label' => 'New story', 'plural' => 'New stories'],
        'feature' => ['label' => 'New feature', 'plural' => 'Features'],
        'improvement' => ['label' => 'Improvement', 'plural' => 'Improvements'],
        'fix' => ['label' => 'Bug fix', 'plural' => 'Bug fixes'],
    ];
}

// A small line icon for each category (24x24 viewBox, drawn with strokes).
function koobdWhatsNewIcon(string $type): string
{
    $paths = [
        'story' => '<path d="M4 5.5A2.5 2.5 0 016.5 3H12v16H6.5A2.5 2.5 0 004 21.5zM20 5.5A2.5 2.5 0 0017.5 3H12v16h5.5a2.5 2.5 0 012.5 2.5z"/>',
        'feature' => '<path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
        'improvement' => '<path d="M4 17l6-6 4 4 6-7M14 8h6v6"/>',
        'fix' => '<path d="M14.7 6.3a4 4 0 00-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    ];
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' . ($paths[$type] ?? $paths['feature']) . '</svg>';
}

function koobdWhatsNew(): array
{
    $updates = [
        [
            'id' => 'banner-gradients',
            'type' => 'feature',
            'date' => '2026-11-01',
            'title' => 'Gradient profile banners',
            'summary' => 'Give your profile banner a gradient: pick a ready-made one, or choose your own two colours and direction.',
        ],
        [
            'id' => 'minigames',
            'type' => 'feature',
            'date' => '2026-11-01',
            'title' => 'Minigames: six new games',
            'summary' => 'Play and learn in English and Filipino. Find the games in your profile.',
            'points' => [
                'Word Catch: tap the falling words that match the target, with Easy, Medium and Hard levels.',
                'Fix the Story: find the mistakes in a short story, fix them, and see why they were wrong.',
                'Hint Hunt: read the hint and choose the right word before the time runs out.',
                'Word Pairs: a memory game matching English and Tagalog words.',
                'Letter Mix: put mixed-up letters back in order to spell the word.',
                'Sentence Builder: put word tiles in order to build a correct sentence.',
                'Your best scores are saved, so you can try to beat them.',
            ],
            'major' => true,
        ],
        [
            'id' => 'versus-words',
            'type' => 'improvement',
            'date' => '2026-11-01',
            'title' => 'Versus Mode: more words and difficulty levels',
            'summary' => 'Versus Mode now has more than 270 words in English and Filipino - animals, food, places, jobs, feelings and more - each with its own hint.',
            'points' => [
                'Choose Easy, Medium or Hard words when you create a lobby, or Mixed, which starts easy and gets harder each round.',
                'Words you played lately with the same classmate are saved for later, so every match feels new.',
            ],
        ],
        [
            'id' => 'versus-live',
            'type' => 'improvement',
            'date' => '2026-11-01',
            'title' => 'Versus Mode moves in real time',
            'summary' => 'You now see your opponent run and jump almost as they do it, smoothly, and hearts, letters and round results show on both screens at once.',
        ],
        [
            'id' => 'versus-hearts-hints',
            'type' => 'improvement',
            'date' => '2026-11-01',
            'title' => 'Versus Mode: hints and hearts',
            'summary' => 'Every word in Versus Mode now has a hint, and each player has 3 hearts a round, so think before you grab a letter.',
            'points' => [
                'A hint under the score tells what the word means, without saying it. Tap it to read all of it.',
                'A wrong letter breaks one heart. Trying the same wrong letter again does not cost another one.',
                'Lose all 3 hearts and your opponent wins the round. When the match ends, play again or go back to the Versus menu.',
            ],
        ],
        [
            'id' => 'writing-practice',
            'type' => 'feature',
            'date' => '2026-10-29',
            'title' => 'Writing Practice in English and Tagalog',
            'summary' => 'Write in your own notepads and get help as you go - spelling, grammar, Tagalog affixes, organization, word choice and more, each marked in its own colour.',
            'points' => [
                'Make as many notepads as you like, in English or Tagalog. They save by themselves.',
                'Tap a marked word to see what is wrong, why, and a suggestion. Nothing changes unless you accept it.',
                'Try a timed writing challenge: choose the time and the language, then see what you did well and what to fix when time is up.',
                'Find it in your profile menu and on your profile page, next to the Dictionary.',
            ],
            'major' => true,
        ],
        [
            'id' => 'dictionary',
            'type' => 'feature',
            'date' => '2026-10-29',
            'title' => 'A Dictionary for English and Tagalog',
            'summary' => 'Look up English and Tagalog words, see what they mean, and translate them from one language into the other.',
            'points' => [
                'Open Dictionary from your profile menu, or look up a word straight from your profile page.',
                'Tap a translated word to look it up too, and tap the speaker to hear how it sounds.',
                'While reading a story, the Words button now shows what a word means as you practise saying it.',
            ],
            'major' => true,
        ],
        [
            'id' => 'first-time-tutorial',
            'type' => 'feature',
            'date' => '2026-10-28',
            'title' => 'A guided tour with Flowergirl',
            'summary' => 'New to KoobD? Flowergirl now shows students and teachers around Home, one feature at a time.',
            'points' => [
                'She explains the sidebar, search, story shelves, What\'s New, the language switch and your profile menu.',
                'It starts by itself the first time you open Home. Skip it any time, and choose Replay tutorial in your profile menu to watch it again.',
            ],
        ],
        [
            'id' => 'sound-and-music',
            'type' => 'feature',
            'date' => '2026-10-28',
            'title' => 'Sound and music everywhere',
            'summary' => 'KoobD now has music, sound effects and soft click sounds - in stories, Platform Mode, Versus Mode and all around the app.',
            'points' => [
                'Characters make footsteps, jumps and landings that match what they stand on; rain, wind, birds and more set the scene.',
                'Story creators can choose music, weather and sound effects for each page, stage and line.',
                'Open Sound settings in your profile menu to set master, music, effects and click volumes, or turn sound off.',
            ],
            'major' => true,
        ],
        [
            'id' => 'classroom-screen-time',
            'type' => 'feature',
            'date' => '2026-10-28',
            'title' => 'Screen Time in every classroom',
            'summary' => 'Teachers can see how much time their students actively spend learning on KoobD, classroom by classroom.',
            'points' => [
                'Each classroom has a Screen Time tab: total and average active time, the kinds of time (reading, Platform Mode, quizzes, Versus Mode), a daily chart and every student.',
                'Open a student to see their sessions, a day-by-day timeline and daily use, and download any report as a CSV file.',
                'Choose today, 7 days, 30 days or your own dates, and set a daily limit to point out students who go over it.',
            ],
            'major' => true,
        ],
        [
            'id' => 'versus-mode',
            'type' => 'feature',
            'date' => '2026-10-27',
            'title' => 'Versus Mode: 1v1 word race',
            'summary' => 'Challenge a classmate in a platform arena. Collect the letters of the word in order, then answer a question about it to win the round.',
            'points' => [
                'Create a lobby (first to 3, 4 or 5 wins; English or Filipino words) and share its code, or join with a classmate\'s code.',
                'Play as your own profile character, with keyboard or touch controls.',
                'A match summary shows every round, with your word and answer times.',
            ],
            'major' => true,
        ],
        [
            'id' => 'animated-platform-characters',
            'type' => 'improvement',
            'date' => '2026-10-27',
            'title' => 'Characters come alive in platform stories',
            'summary' => 'Your character and the story characters now walk, jump, land and talk with smooth animation, the same as in Versus Mode.',
            'points' => [
                'In stories your teacher made, you play as your own profile character, fully animated.',
                'Characters stretch as they jump, squash as they land, and keep pace with how fast they move.',
                'Whoever is speaking in a conversation talks; everyone else stands and breathes.',
            ],
        ],
        [
            'id' => 'story-activity-questions',
            'type' => 'feature',
            'date' => '2026-10-25',
            'title' => 'Questions inside classroom stories',
            'summary' => 'Teachers can place questions at points in a story activity. The story pauses there, the student answers, and the story carries on from the same spot.',
            'points' => [
                'Multiple choice, true or false, identification and essay questions, each with its own points.',
                'Teachers see who started and finished, every answer, and essays waiting to be graded.',
                'Stories on the home page never stop for questions.',
            ],
            'major' => true,
        ],
        [
            'id' => 'play-together',
            'type' => 'feature',
            'date' => '2026-10-25',
            'title' => 'Play Platform Mode stories together',
            'summary' => 'With Play together on, classmates playing the same story activity see each other as silhouettes with their names, and share one progress bar with a dot for each player.',
            'points' => [
                'Your own dot says "You", with your percentage beside the bar.',
                'Everyone keeps their own progress, answers and score.',
            ],
        ],
        [
            'id' => 'classroom-messages-comments',
            'type' => 'feature',
            'date' => '2026-10-25',
            'title' => 'Message your teacher and comment on activities',
            'summary' => 'Students can send their teacher a private message, and everyone in a classroom can discuss each activity in its class comments.',
            'points' => [
                'Private messages are seen only by the student and their teacher; teachers reply from their Messages inbox.',
                'Class comments are shared with the classroom, with replies, and teachers can edit or remove comments.',
                'A bell shows new messages and replies to your comments.',
            ],
            'major' => true,
        ],
        [
            'id' => 'quiz-essay-identification-shuffle',
            'type' => 'feature',
            'date' => '2026-10-25',
            'title' => 'Essay and identification questions, and shuffled quizzes',
            'summary' => 'Quizzes can now ask students to type an answer or write an essay, and teachers can give every student the questions in a different order.',
            'points' => [
                'Identification answers are checked automatically, ignoring capital letters and extra spaces.',
                'Teachers grade essays with points and feedback from Results; until then the essay shows as waiting.',
                'With Shuffle Questions on, each student keeps their own order, even after a reload.',
            ],
            'major' => true,
        ],
        [
            'id' => 'colour-sections',
            'type' => 'improvement',
            'date' => '2026-10-25',
            'title' => 'Clearer, more colourful sections',
            'summary' => 'Home, Classrooms, My Stories and each classroom now give every section its own soft colour, so it is easier to see where one part ends and the next begins.',
        ],
        [
            'id' => 'classmates-list',
            'type' => 'feature',
            'date' => '2026-10-25',
            'title' => 'See your classmates in each classroom',
            'summary' => 'Under Your progress, every student in the classroom is listed with their picture and name.',
            'points' => [
                'Only students from the same classroom are shown, and everyone\'s progress stays private.',
                'The list updates by itself when classmates join or leave.',
            ],
        ],
        [
            'id' => 'last-read-on-home',
            'type' => 'improvement',
            'date' => '2026-10-24',
            'title' => 'Last Read is now at the top of Home',
            'summary' => 'Pick up right where you left off: your latest story sits above the others, with your progress and a Continue button.',
        ],
        [
            'id' => 'profile-banners',
            'type' => 'feature',
            'date' => '2026-10-18',
            'major' => true,
            'title' => 'Make your profile your own',
            'summary' => 'Give your profile a banner in any colour, or upload a picture of your own.',
            'points' => [
                'Drag and zoom your picture to choose the part that shows',
                'Tap your banner or character to see it full size',
            ],
        ],
        [
            'id' => 'smoother-on-tablets',
            'type' => 'improvement',
            'date' => '2026-10-18',
            'title' => 'Smoother on slower tablets',
            'summary' => 'Stories run lighter and pages load faster, and lite mode now switches on by itself on tablets like the Galaxy Tab A7 Lite.',
        ],
        [
            'id' => 'the-false-knight',
            'type' => 'story',
            'date' => '2026-10-15',
            'major' => true,
            'story' => 'false_knight',
            'title' => 'The False Knight',
            'summary' => 'A new Platform Mode classic: CubeBot chases a little thief into an adventure that tests what real courage means.',
        ],
        [
            'id' => 'the-hare-and-the-tortoise',
            'type' => 'story',
            'date' => '2026-04-10',
            'story' => 'book1',
            'title' => 'The Hare and the Tortoise',
            'summary' => 'The first KoobD classic: a proud hare, a steady tortoise, and a race through the forest.',
        ],
    ];

    // Stories published on KoobD lately.
    $cutoff = strtotime('-60 days');
    foreach (koobdSharedStories(24) as $shared) {
        $created = strtotime((string)($shared['created_at'] ?? ''));
        if (!$created || $created < $cutoff) {
            continue;
        }
        $updates[] = [
            'id' => 'shared-' . $shared['id'],
            'type' => 'story',
            'date' => date('Y-m-d', $created),
            'shared' => $shared,
            'title' => $shared['title'],
            'summary' => $shared['description'] !== '' ? $shared['description'] : $shared['creator_label'] . '.',
        ];
    }

    // Newest first; on the same day, major updates and new stories first.
    usort($updates, static function (array $a, array $b): int {
        return [$b['date'], !empty($b['major']), $b['type'] === 'story'] <=> [$a['date'], !empty($a['major']), $a['type'] === 'story'];
    });
    return $updates;
}

// The pop-up details (data-story-*) for an update's story, the same as the
// story's own card on Home, or null when the update has no story. $progress is
// the reader's saved progress (koobdUserStoryProgress).
function koobdWhatsNewStoryDetails(array $update, array $progress): ?array
{
    if (!empty($update['story'])) {
        foreach (koobdClassicStories() as $item) {
            if ($item['id'] === $update['story']) {
                return koobdClassicStoryDetails($item, $progress[$item['id']] ?? null);
            }
        }
        return null;
    }
    if (!empty($update['shared'])) {
        $key = koobdSharedStoryProgressKey($update['shared']);
        return koobdSharedStoryDetails($update['shared'], $key !== null ? ($progress[$key] ?? null) : null);
    }
    return null;
}

// "Oct 24" (this year) or "Oct 24, 2025". Plain dates, not "Today": the
// server's day can differ from the reader's.
function koobdWhatsNewDate(string $date): string
{
    $time = strtotime($date);
    if (!$time) {
        return '';
    }
    return date('Y', $time) === date('Y') ? date('M j', $time) : date('M j, Y', $time);
}

// New within the last week: these get a small "New" mark.
function koobdWhatsNewIsFresh(string $date): bool
{
    $time = strtotime($date);
    return $time && $time >= strtotime('-7 days', strtotime(date('Y-m-d')));
}
