# The False Knight

Everything specific to The False Knight lives in this folder. The story is
opened at `src/false_knight.php`, a one-line entry that loads
`false_knight_page.php` from here, so the story's address stays the same.

## The story

| File | What it is |
|---|---|
| `false_knight_page.php` | The story's page (served through `src/false_knight.php`) |
| `false-knight-story.js` | All story data: scenes, backgrounds, level layout, platforms, checkpoints, characters and their story actions, and the dialogue |
| `The False Knight Script.pdf` | The script and storyboard (source of truth) |
| `_script.txt`, `_script_clean.txt` | Text extracted from the PDF (`_extract.py`, `_clean.py`) |

## Characters

One folder per character, each with its portrait (dialogue), sprite sheet
(gameplay: rows idle, run, jump) and its `Pixel <Name>.html` sprite generator:

`CUBEBOT`, `FLOWERLING`, `PAPERBAG` (also the kid and the thief), `OLD MAN`,
`GOLEM`, `TWIG`, `WATER` (Water Spirit), `RAINCAR` (Whitey), `GUARD` (guards,
knights, soldier), `HEAD GUARD`, `SEER`, `KING`, `DOCTOR`.

Some sprite sheets are in `ALL (PNG)` instead (FlowerGirl, Mr. Golem, Twigg,
the Water Spirit, Whitey).

CubeBot, FlowerGirl, Golem, Raincat, Twig and the Water Spirit are also the
app's profile characters. The originals stay in `src/assets/images/characters/`
for profiles and the login pages; the copies here are identical and are the
ones this story uses.

To change a character drawn for this story (Guard, Head Guard, Seer, King,
Doctor): edit its `Pixel <Name>.html`, then re-export the sheet with
`node _export_sprites.js "<FOLDER>/Pixel <Name>.html" "<FOLDER>/<name>_spritesheet.png"`.
The Guard, Head Guard and Doctor portraits are drawn by `python _make_portraits.py`;
the Seer and King portraits (`SEER/SEER.png`, `KING/KING.png`) are hand-drawn, and
their sprite sheets are drawn after them. After changing a portrait, re-render the
storyboard frames that show it (`python ../../storyboard/_make_storyboard.py <numbers>`):
the Seer is in frame 31, the King in 82, 84 and 85.

`TOOLS/` holds the Water Spirit's gifts (hook, rope, gloves), drawn into
storyboard frames 62 and 65.

## Backgrounds and scenery

| File | Used for |
|---|---|
| `ALL (PNG)/meadow_0*.png` | The grassy field, the road out of town, the hillside; the clouds and sky behind every outdoor background below |
| `environment/backgrounds/deep-forest.png` | The deep forest and the forest clearing |
| `environment/backgrounds/enchanted-forest.png` | The enchanted forest (tall trunks crossed by thorny branches, as in the storyboard) |
| `environment/backgrounds/water-forest.png` | The water forest |
| `environment/backgrounds/city-night.png` | The city streets in the storm, outside the library |
| `environment/backgrounds/seer-house.png` | The Seer's house, where she examines FlowerGirl |
| `environment/backgrounds/castle-courtyard.png` | The castle courtyard (keep, arcade, fountain) |
| `environment/backgrounds/castle-outskirts.png` | Outside the castle walls at night |
| `environment/backgrounds/hillside.png` | The hillside outside the castle |
| `environment/backgrounds/mountain-high.png` | The climb to the peak, above the clouds |
| `environment/backgrounds/town.png` | The town's streets, and the quiet town on the road home |
| `environment/backgrounds/castle-walls.png` | The castle courtyard, outside the walls at night, the castle gates |
| `environment/backgrounds/castle-hall-night.png`, `castle-hall-day.png` | The castle hall (pillars, arches, windows) |
| `environment/backgrounds/princess-room-night.png`, `princess-room-day.png` | The Princess's room |
| `environment/backgrounds/library.png` | The grand library |
| `environment/backgrounds/mountains.png` | The mountain pass and the climb |
| `backround and stuff/The False Knight Cover.jpg` | The story's cover on the home page |

The town picture is a row of whole houses, fitted a whole number of times
into each stretch of street (`wholeCopies`), and shared layers such as the
hills and sky line up across neighbouring backgrounds (`worldAligned`).
Where an outdoor picture meets an indoor one, a doorway or tower prop
(`castle-doorway`, `room-doorway`, `castle-tower`) joins them. The rooftop
houses get their pitched roof and front door from `house-gable-*` and
`house-door`.

Each place's name, from the script's scene headings, is listed in
`world.areas`; the game shows it at the top of the screen on first entering
it.

`environment/props/*.png` are the scenery props placed in `world.decor`
(`false-knight-story.js`): the World Tree, trees, bushes, swaying flowers
(stem and head drawn separately), torches and flames, banners, lamp posts,
the gatehouse, market stall, training dummies, the Princess's furniture,
candles, fireflies, Bloomstorm pollen, glowing roots and mushrooms, mist, the
moon, rubble, the Undying Flower, and the pieces the storyboard shows: the
city gate the kid runs out through, the pillar PaperBag hides behind, the
twig, music notes, thorn vines, the library's front, the canopy bed, the
flower under its glass dome, tall grass, dust, and the sea of clouds. Rain is
a decor item too (`rain: true`). They never block movement.

Everything in `environment/` and the tiles `roof`, `house-wall`,
`castle-block`, `carpet`, `bookshelf`, `barrel`, `snow-rock` and
`log` were drawn for this story by `_make_environment.py` (in the style of the
provided tileset). To change one, edit its function there and run
`python _make_environment.py` from this folder.

## Platforms and obstacles

`platforms/tiles/*.png` are the 16x16 tiles the level is built from (in
`false-knight-story.js`): grass, dirt, stone, crate and plank cut from
`ALL (PNG)/platform_tileset.png` (`platforms/Pixel Platform Tiles.html`), and
the town, castle, library and mountain tiles from `_make_environment.py`.
Only the tiles the level uses are kept; any other tile can be cut again from
the tileset.

## Storyboard frames

`storyboard/frame-01.jpg` ... `frame-90.jpg` are the script's storyboard
(pages 24-52 of the PDF), all 90 frames redrawn in colour as illustrations of
the script: each location painted in detail (layered scenery, light, texture)
rather than built from the game's tiles and sprites, with the story's
characters, places and events as the script gives them. Each is a beat of its
own, right after the line of the moment it pictures; which frames follow which
line is the `STORYBOARD` table in `false-knight-story.js`, and
`FRAME_TRANSITIONS` there says how a frame follows the one before it. The
script's storyboard has no frames for scenes 5-7; two were added for scene 6:
`frame-91.jpg` (CubeBot leaping from the Princess's window into the night,
the pendant in his hand) and `frame-92.jpg` (FlowerGirl alone, the window
open, blood on her hand after she coughs - the first sign of her illness).
They follow the last line of her room scene, and the book files them under
scene 6.

Frames 67, 68 and 70 (the climb and the summit) are no longer shown in the
game - that part is played - but stay in the storyboard book
(`storyboard/book-frames/` in the project root).

How story moments hand over to each other (quick fades, no camera zoom):

- gameplay or dialogue -> frame: the picture dissolves in over the scene;
- frame -> frame: a crossfade, or a dip through black for a change of place
  or time, or a flash of white for a blinding light;
- frame -> gameplay or dialogue: the picture dissolves back into the scene;
- narration <-> frame: the line fades, a breath of black, the picture rises;
- cutscene -> gameplay: the camera glides back to CubeBot and control returns
  only once it has (the letterbox bars stay until then);
- cutscene -> page turn: the camera holds on the moment, it settles, then the
  page darkens into the narration and the next location, whose name shows at
  the top of the screen.

The frames are drawn by the scripts in `storyboard/` at the project root:
`_storyboard_kit.py` (the drawing kit: shots, effects, and the characters'
own portraits, never enlarged past their art), `_storyboard_paint.py` (the
painted locations, grounds and props; the Undying Flower is taken from
CubeBot's portrait so it is always the same tulip),
`_storyboard_frames.py` (one recipe per frame, with its ACTION and VOICEOVER)
and `_make_storyboard.py`:

    python _make_storyboard.py           redraw frames 02-90 and the book
    python _make_storyboard.py 12 40     redraw just those frames
    python _make_storyboard.py frame01   redraw frame 01 (slow: about 2.5 min)
    python _make_storyboard.py book      rebuild the colour storyboard PDF

Story moments the script makes happen to CubeBot (the kid bumping into him,
the guards arriving, the old man calling out, PaperBag stepping from the
shadows, the landslide, Mr. Golem, the Water Spirit rising, the summit, the
guards at the gates) open by themselves when he comes near
(`world.autoTalk`), so no invisible wall holds him back. Conversations
CubeBot starts himself (`manual: true` - FlowerGirl in the clearing and in
her room, the thief, Twigg, PaperBag in the Bloomstorm, Whitey, the Water
Spirit's gifts, PaperBag staying behind, and giving FlowerGirl the flower)
wait for the Chat button or E / Enter, and show a "!" over the character's
name until he does. Side characters with a `dialogue` of their own (the
training knights, the castle knights, Mr. Golem and Twigg afterwards, Whitey,
PaperBag on the road, and everyone in the Princess's room) can be talked to
the same way at any time once their part in the story is done; their "!"
dims after the first chat. The player can never walk past the end of a
scene, even while a conversation is waiting there. A line can wait for a place (`waitX`, used for the
mountain narration as he climbs) and a conversation can move to another place
mid-way (`scene`, used when the knights bring FlowerGirl to the Seer's house)
or to another spot (`at`, behind the storyboard or narration before the line:
on the mountain pass "Move!" is said up on the landslide ledge, and PaperBag's
"Okay... I take it back" where the pass opens into the enchanted forest, as
the storyboard frames show). A fade back into the same scene keeps CubeBot
where he is.
A guide (`lead`, FlowerGirl escorting CubeBot to her room) walks ahead at a
pace that follows his, easing to a stop rather than stopping and starting.

The Flower Cure is the red tulip CubeBot holds in his portrait: the same
design on the summit, under the glass dome and in every storyboard frame.

`The False Knight Storyboard (Colour).pdf` there is the whole colour
storyboard, laid out like the storyboard pages in the script.

## Shared with other stories

The game itself (`src/js/platformer-story-player.js`,
`src/js/platformer-blocks.js`, `src/js/story-orientation.js`) and the styles
in `src/css/` are shared with the teacher-made platformer stories, so they
stay outside this folder.
