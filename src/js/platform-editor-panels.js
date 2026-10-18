// The Platform Mode editor's inspector (see js/platform-editor.js): the
// "Selected" panel for whatever is picked on the stage, the "Stage" panel
// (background, time of day, ground, length, music, checkpoints) and the
// "Story events" panel - the conversations, narration, illustrations, choices
// and cutscenes that play as the player goes along.
(function () {
  'use strict';

  const UI = window.KoobdEditorUI;
  const LIB = window.KoobdPlatformLibrary;
  const PE = window.KoobdPlatformEditor;
  const { el, icon, field } = UI;
  const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const r2 = (value) => Math.round(value * 100) / 100;
  const GROUND_Y = 282;
  // The interface language's version of a phrase (summaries are built from parts).
  const tr = (text) => (window.KoobdI18n ? window.KoobdI18n.t(text) : text);

  function section(title, children, hint) {
    return el('section', { class: 'pe-section' }, [
      title ? el('h4', { class: 'pe-section-title', text: title }) : null,
      hint ? el('p', { class: 'pe-hint', text: hint }) : null,
      ...children
    ]);
  }
  const row = (children) => el('div', { class: 'pe-row' }, children);
  const actionButton = (label, onClick, kind = 'soft', iconName = '') => el('button', {
    type: 'button', class: `ed-btn ed-btn-${kind}`, on: { click: onClick }
  }, [iconName ? icon(iconName) : null, el('span', { text: label })]);

  // Opens one of the inspector's popups; it is redrawn after every change
  // (see renderInspector in js/platform-editor.js), so it always shows the
  // current values, and the stage behind it updates as you edit.
  function popup(ed, title, render, size = 'sm') {
    ed.modal = UI.openModal({ title, size, render: () => render(), onClose() { ed.modal = null; } });
    return ed.modal;
  }

  // Buttons that act on the stage close the popup first, so the stage shows.
  function closePopup(ed) {
    if (ed.modal) ed.modal.close();
  }

  // A number field that the stage keeps up to date while dragging.
  function liveNumber(label, live, value, onChange, opts = {}) {
    const input = UI.number(r2(value), onChange, opts);
    input.dataset.live = live;
    return field(label, input);
  }

  function pagesFor(ed) {
    return (ed.options.getPages ? ed.options.getPages() : []).filter((page) => page.key !== (ed.page && ed.page.key));
  }

  function eventName(ed, event) {
    const index = ed.scene.events.indexOf(event);
    return event.label || `Event ${index + 1}`;
  }

  function characterName(ed, character) {
    return character.name || ed.characterArt(character).label;
  }

  function speakerOptions(ed) {
    return [['narrator', 'Narrator'], ['player', 'The player'], ...ed.scene.characters.map((character) => [character.id, characterName(ed, character)])];
  }

  // ===========================================================================
  // Selected
  // ===========================================================================
  function selectedPanel(ed) {
    const refs = ed.ui.selection.filter((ref) => ed.resolve(ref));
    if (!refs.length) {
      return el('div', { class: 'pe-empty' }, [
        el('p', { class: 'pe-empty-title', text: 'Nothing selected' }),
        el('p', { text: 'Pick something in the library and click the stage to place it, or click a piece on the stage to change it.' })
      ]);
    }
    if (refs.length > 1) {
      return el('div', {}, [
        header(ed, `${refs.length} pieces selected`, ''),
        el('p', { class: 'pe-hint', text: 'Drag any of them to move them together. Duplicate or delete them with the buttons above the stage.' })
      ]);
    }
    const found = ed.resolve(refs[0]);
    const panel = {
      block: blockPanel, image: imagePanel, legacy: legacyPanel, character: characterPanel,
      checkpoint: checkpointPanel, player: playerPanel, gap: gapPanel
    }[found.type];
    return panel ? panel(ed, found.item, refs[0]) : el('div');
  }

  // keepTitle: the title is a name the author wrote (a character's name).
  function header(ed, title, kind, canDelete = true, keepTitle = false) {
    return el('div', { class: 'pe-panel-head' }, [
      el('div', {}, [kind ? el('span', { class: 'pe-kind', text: kind }) : null, el('h3', { translate: keepTitle ? 'no' : null, text: title })]),
      el('div', { class: 'pe-panel-actions' }, [
        canDelete ? UI.iconButton('duplicate', 'Duplicate', () => ed.duplicateSelection()) : null,
        canDelete ? UI.iconButton('trash', 'Delete', () => ed.deleteSelection(), { class: 'is-danger' }) : null
      ])
    ]);
  }

  function blockPanel(ed, block) {
    const material = LIB.get('materials', block.material) || { label: 'Block' };
    const swatches = el('div', { class: 'pe-swatches' }, LIB.materials.map((item) => {
      const swatch = el('span', { class: 'pe-tile-thumb' });
      const tiles = item.tiles;
      swatch.style.backgroundImage = `url('${LIB.url(tiles.cap || tiles.fill)}')`;
      return el('button', {
        type: 'button', class: `pe-swatch${item.id === block.material ? ' is-active' : ''}`, title: item.label, 'aria-label': item.label,
        on: { click() { block.material = item.id; ed.commit(); } }
      }, [swatch]);
    }));
    return el('div', {}, [
      header(ed, material.label, 'Block'),
      section('Material', [swatches], material.solid ? 'The player stands on top of it and can jump up through it.' : 'Solid: the player stands on it and bumps into its sides.'),
      section('Size and position', [row([
        liveNumber('Width (tiles)', 'cols', block.cols, (value) => { block.cols = value; ed.commit(); }, { min: 1, max: 200 }),
        liveNumber('Height (tiles)', 'rows', block.rows, (value) => { block.rows = value; ed.commit(); }, { min: 1, max: 40 }),
        ...positionFields(ed, block)
      ])], 'Tip: drag the handles on the stage to stretch it tile by tile.')
    ]);
  }

  function positionFields(ed, item) {
    return [
      liveNumber('Across', 'x', item.x, (value) => { item.x = value; ed.commit(); }, { step: 0.5 }),
      liveNumber('Height', 'y', GROUND_Y - item.y, (value) => { item.y = r2(GROUND_Y - value); ed.commit(); }, { step: 0.5 })
    ];
  }
  function positionSection(ed, item) {
    return section('Position', [row(positionFields(ed, item))]);
  }

  function imagePanel(ed, object) {
    const prop = object.prop ? LIB.get('props', object.prop) : null;
    const hazard = object.hazardId ? LIB.get('hazards', object.hazardId) : null;
    const title = prop ? prop.label : hazard ? hazard.label : 'Your picture';
    const role = object.hazard ? 'hazard' : object.solid ? 'solid' : 'scenery';
    const parts = [header(ed, title, role === 'hazard' ? 'Hazard' : role === 'solid' ? 'Solid picture' : 'Scenery')];

    if (object.asset) {
      parts.push(UI.mediaField('Picture', object.asset, {
        kinds: ['image'], storyboards: false, title: 'Choose a picture',
        onChange(value) { if (value) { object.asset = value; ed.commit(); } }
      }));
    }
    parts.push(section('How it acts', [UI.segmented([
      ['scenery', 'Scenery'], ['solid', 'Solid'], ['hazard', 'Hazard']
    ], role, (value) => {
      object.solid = value === 'solid';
      object.hazard = value === 'hazard';
      if (value !== 'scenery' && !['none', 'spin'].includes(object.anim)) object.anim = 'none';
      ed.commit();
    })], {
      scenery: 'Scenery: the player walks past it.',
      solid: 'Solid: the player can stand on it and bumps into it. Its hitbox follows the picture’s shape.',
      hazard: 'Hazard: touching it sends the player back to the last checkpoint.'
    }[role]));

    if (role === 'scenery') {
      parts.push(section('Layer', [UI.segmented([
        ['far', 'Far back'], ['back', 'Behind characters'], ['front', 'In front']
      ], object.layer || 'back', (value) => { object.layer = value; ed.commit(); })]));
    }
    parts.push(section('Size and position', [row([
      liveNumber('Height', 'h', object.h, (value) => { object.h = clamp(value, 0.5, 300); ed.commit(); }, { min: 0.5, max: 300, step: 0.5 }),
      role === 'scenery' ? null : liveNumber('Width', 'w', object.w, (value) => { object.w = clamp(value, 0.5, 1000); ed.commit(); }, { min: 0.5, max: 1000, step: 0.5 }),
      ...positionFields(ed, object)
    ])], role === 'scenery' ? 'Scenery keeps its picture’s shape.' : ''));
    const animLabels = { none: 'No animation', sway: 'Sway', banner: 'Flutter', float: 'Float', glow: 'Pulse', flicker: 'Flicker', drift: 'Drift', spin: 'Spin' };
    const lookSummary = [tr(animLabels[object.anim || 'none']), object.flip ? tr('flipped') : '', num(object.rotation) ? `${num(object.rotation)}°` : '', object.light && role === 'scenery' ? tr('glows') : ''].filter(Boolean).join(' · ');
    parts.push(section('', [
      UI.popupButton('Look and animation', lookSummary, () => popup(ed, 'Look and animation', () => lookPopup(ed, object, role))),
      role !== 'scenery'
        ? UI.popupButton('Hitbox', tr(object.box ? 'Custom box' : 'Match the picture'), () => { ed.ui.hitboxes = true; ed.renderWorld(); popup(ed, 'Hitbox', () => hitboxPopup(ed, object)); }, 'hitbox')
        : null
    ]));
    return el('div', {}, parts);
  }

  function lookPopup(ed, object, role) {
    const anims = role === 'scenery'
      ? [['none', 'None'], ['sway', 'Sway'], ['banner', 'Flutter'], ['float', 'Float'], ['glow', 'Pulse'], ['flicker', 'Flicker'], ['drift', 'Drift'], ['spin', 'Spin']]
      : [['none', 'None'], ['spin', 'Spin']];
    return el('div', { class: 'pe-popup' }, [
      row([
        field('Animation', UI.select(anims, object.anim || 'none', (value) => { object.anim = value; ed.commit(); })),
        liveNumber('Rotation (°)', 'rotation', num(object.rotation), (value) => { object.rotation = clamp(value, -180, 180); ed.commit(); }, { min: -180, max: 180, step: 5 })
      ]),
      row([
        el('div', { class: 'pe-toggle-cell' }, [UI.toggle('Flip', object.flip, (value) => { object.flip = value; ed.commit(); })]),
        role === 'scenery' ? el('div', { class: 'pe-toggle-cell' }, [UI.toggle('Glows in the dark', object.light, (value) => { object.light = value; ed.commit(); }, 'Stays bright at night, like a lamp')]) : null
      ])
    ]);
  }

  function hitboxPopup(ed, object) {
    const custom = Boolean(object.box);
    const controls = [];
    if (custom) {
      [['left', 'Left edge'], ['right', 'Right edge'], ['top', 'Top edge'], ['bottom', 'Bottom edge']].forEach(([side, label]) => {
        const inward = side === 'left' || side === 'top';
        const value = inward ? object.box[side] : 1 - object.box[side];
        controls.push(field(`${label} in by ${Math.round(value * 100)}%`, UI.range(value, (next, done) => {
          const box = object.box;
          if (inward) box[side] = clamp(next, 0, (side === 'left' ? box.right : box.bottom) - 0.05);
          else box[side] = clamp(1 - next, (side === 'right' ? box.left : box.top) + 0.05, 1);
          if (done) ed.commit(); else ed.touch();
        }, { min: 0, max: 0.9, step: 0.01 })));
      });
    }
    return el('div', { class: 'pe-popup' }, [
      UI.segmented([['auto', 'Match the picture'], ['box', 'Custom box']], custom ? 'box' : 'auto', (value) => {
        if (value === 'box') object.box = { left: 0, top: 0, right: 1, bottom: 1 };
        else delete object.box;
        ed.commit();
      }),
      el('p', { class: 'pe-hint', text: custom ? 'Move the edges in until the red or green outline covers just the part that should touch the player.' : 'The hitbox follows the visible pixels of the picture. Turn on “Show hitboxes” above the stage to see it.' }),
      el('div', { class: 'pe-popup-grid' }, controls)
    ]);
  }

  function legacyPanel(ed, object) {
    return el('div', {}, [
      header(ed, 'Classic block', 'Block'),
      el('p', { class: 'pe-hint', text: 'A block from the earlier editor. It still works; the new tile blocks in the library look like the classic stories.' }),
      section('Look', [row([
        field('Colour', UI.input(object.color || '#5f9b58', (value) => { object.color = value; ed.touch(); }, { type: 'color' })),
        liveNumber('Rotation (°)', 'rotation', num(object.rotation), (value) => { object.rotation = value; ed.commit(); }, { min: -180, max: 180, step: 5 })
      ])]),
      section('Size', [row([
        liveNumber('Width', 'w', object.w, (value) => { object.w = value; ed.commit(); }, { min: 1, max: 200 }),
        liveNumber('Height', 'h', object.h, (value) => { object.h = value; ed.commit(); }, { min: 1, max: 100 })
      ])]),
      positionSection(ed, object)
    ]);
  }

  function eventChoices(ed, includeNone) {
    return [includeNone, ...ed.scene.events.map((event) => [event.id, eventName(ed, event)])];
  }

  function characterPanel(ed, character) {
    const art = ed.characterArt(character);
    const conversations = ed.scene.events.filter((event) => event.trigger.type === 'talk' && event.trigger.character === character.id);
    const libraryChars = LIB.characters.map((item) => [item.id, item.label + (item.animated ? '' : ' (still)')]);
    const lookValue = character.upload ? '__upload' : character.art;
    const parts = [header(ed, characterName(ed, character), 'Character', true, true)];

    parts.push(section('Look', [
      el('div', { class: 'pe-char-look' }, [
        el('img', { src: LIB.url(art.src), alt: '' }),
        el('div', { class: 'pe-char-look-fields' }, [
          field('Name', UI.input(character.name, (value) => { character.name = value; ed.touch(); }, { maxlength: 40, placeholder: art.label })),
          field('Character', UI.select([...libraryChars, ['__upload', 'My own picture…']], lookValue, (value) => {
            if (value === '__upload') {
              UI.openMediaPicker({
                kinds: ['image'], storyboards: false, title: 'Choose your character picture',
                onPick(item) { character.upload = item.url; delete character.art; character.sheet = false; ed.commit(); }
              });
              ed.renderInspector();
              return;
            }
            character.art = value;
            delete character.upload;
            delete character.sheet;
            delete character.portrait;
            character.scale = (LIB.get('characters', value) || {}).scale || 1;
            ed.commit();
          }))
        ])
      ]),
      character.upload ? UI.toggle('It is an animated sprite sheet (32×46 frames: stand, run, jump)', character.sheet, (value) => { character.sheet = value; ed.commit(); }) : null,
      // Animated characters (a library character with a sprite sheet, or an
      // uploaded sheet) can play their animation or keep their first pose.
      art.sheet ? UI.toggle('Animated', !character.still, (value) => {
        if (value) delete character.still; else character.still = true;
        ed.commit();
      }, 'On: they move while standing, walking and jumping (in Preview and the story; the editing canvas always shows their first pose). Off: they keep their first pose.') : null,
      character.upload && character.sheet ? UI.mediaField('Picture in conversations', character.portrait || '', {
        kinds: ['image'], storyboards: false, title: 'Picture shown when they talk',
        onChange(value) { if (value) character.portrait = value; else delete character.portrait; ed.commit(); }
      }) : null,
      field(`Size: ${Math.round(character.scale * 100)}%`, UI.range(character.scale, (value, done) => {
        character.scale = r2(value);
        if (done) ed.commit(); else ed.touch();
      }, { min: 0.4, max: 2.5, step: 0.05 }))
    ]));

    const behavior = character.behavior;
    const behaviorHints = {
      stand: 'They stay where you put them.',
      wander: 'They stroll around their spot now and then.',
      pace: 'They walk back and forth, like a guard on patrol.',
      follow: 'They walk along behind the player.'
    };
    parts.push(section('What they do', [
      UI.segmented([['stand', 'Stand still'], ['wander', 'Wander'], ['pace', 'Back and forth'], ['follow', 'Follow the player']], behavior.type, (value) => {
        behavior.type = value;
        ed.commit();
      }),
      behavior.type === 'wander' || behavior.type === 'pace'
        ? field(`How far: ${Math.round(num(behavior.radius, 20))}`, UI.range(num(behavior.radius, 20), (value, done) => {
          behavior.radius = Math.round(value);
          if (done) ed.commit(); else ed.touch();
        }, { min: 4, max: 200, step: 1 }))
        : null,
      behavior.type !== 'stand'
        ? field(`Walking speed: ${num(behavior.speed) > 0 ? Math.round(behavior.speed) : 'normal'}`, UI.range(num(behavior.speed), (value, done) => {
          behavior.speed = value < 4 ? 0 : Math.round(value);
          if (done) ed.commit(); else ed.touch();
        }, { min: 0, max: 60, step: 1 }))
        : null
    ], behaviorHints[behavior.type]));

    parts.push(section('Conversations', [
      conversations.length
        ? el('ul', { class: 'pe-link-list' }, conversations.map((event) => el('li', {}, [
          el('button', { type: 'button', class: 'pe-link', on: { click: () => ed.openEvent(event.id) } }, [icon('chat'), el('span', { text: `${eventName(ed, event)} (${event.beats.length} line${event.beats.length === 1 ? '' : 's'})` })])
        ])))
        : el('p', { class: 'pe-hint', text: 'No story conversation yet.' }),
      actionButton('Add a conversation', () => {
        const event = ed.addEvent({ type: 'talk', character: character.id });
        event.label = `Talk to ${characterName(ed, character)}`;
        event.beats.push({ id: UI.makeId('beat'), type: 'dialogue', speaker: character.id, text: '' });
        ed.openEvent(event.id);
      }, 'soft', 'plus')
    ], 'A conversation plays when the player walks up and talks to them.'));

    const appear = character.appear || null;
    const leave = character.leave || null;
    const eventLabel = (id) => { const event = ed.scene.events.find((item) => item.id === id); return event ? eventName(ed, event) : ''; };
    const timingSummary = [
      appear ? tr(appear.at === 'end' ? `After “${eventLabel(appear.event)}”` : `When “${eventLabel(appear.event)}” starts`) : tr('From the start'),
      leave ? tr(`Leaves after “${eventLabel(leave.event)}”`) : ''
    ].filter(Boolean).join(' · ');
    parts.push(section('', [
      UI.popupButton('Small talk', tr(character.talk.length ? `${character.talk.length} line${character.talk.length === 1 ? '' : 's'}` : 'None'), () => popup(ed, 'Small talk', () => smallTalkPopup(ed, character)), 'chat'),
      UI.popupButton('Comes and goes', timingSummary, () => popup(ed, 'Comes and goes', () => timingPopup(ed, character)), 'flag')
    ]));
    parts.push(section('Position', [row([
      liveNumber('Across', 'x', character.x, (value) => { character.x = clamp(value, 0, ed.scene.width); ed.commit(); }, { step: 0.5 }),
      liveNumber('Standing height', 'feet', character.feet, (value) => { character.feet = clamp(value, -18, GROUND_Y); ed.commit(); }, { step: 0.5 })
    ])]));
    return el('div', {}, parts);
  }

  function smallTalkPopup(ed, character) {
    const lines = el('div', { class: 'pe-lines' });
    character.talk.forEach((line, index) => {
      lines.appendChild(el('div', { class: 'pe-line' }, [
        UI.select([['npc', characterName(ed, character)], ['player', 'The player']], line.speaker === 'player' ? 'player' : 'npc', (value) => { line.speaker = value; ed.touch(); }),
        UI.input(line.text, (value) => { line.text = value; ed.touch(); }, { maxlength: 400, placeholder: 'What they say' }),
        UI.iconButton('trash', 'Remove line', () => { character.talk.splice(index, 1); ed.commit(); }, { class: 'is-danger' })
      ]));
    });
    return el('div', { class: 'pe-popup' }, [
      el('p', { class: 'pe-hint', text: 'Optional. What they say if the player talks to them when no story conversation is waiting.' }),
      lines,
      character.talk.length < 30 ? actionButton('Add a line', () => { character.talk.push({ speaker: 'npc', text: '' }); ed.commit(); }, 'ghost', 'plus') : null
    ]);
  }

  function timingPopup(ed, character) {
    const appear = character.appear || null;
    const leave = character.leave || null;
    if (!ed.scene.events.length) return el('p', { class: 'pe-hint', text: 'Add story events first to make characters arrive or leave during the story.' });
    return el('div', { class: 'pe-popup' }, [
      field('Appears', UI.select([
        ['', 'From the start'],
        ...ed.scene.events.flatMap((event) => [[`${event.id}|start`, `When “${eventName(ed, event)}” starts`], [`${event.id}|end`, `After “${eventName(ed, event)}”`]])
      ], appear ? `${appear.event}|${appear.at}` : '', (value) => {
        if (!value) delete character.appear;
        else { const [event, at] = value.split('|'); character.appear = { event, at }; }
        ed.commit();
      }), { full: true }),
      field('Leaves', UI.select(eventChoices(ed, ['', 'Never']).map(([id, name]) => [id, id ? `After “${name}”` : name]), leave ? leave.event : '', (value) => {
        if (!value) delete character.leave;
        else character.leave = { event: value, action: (leave && leave.action) || 'walk', toX: (leave && leave.toX) || r2(character.x + 60) };
        ed.commit();
      }), { full: true }),
      leave ? row([
        field('How', UI.select([['walk', 'Walk away'], ['run', 'Run away'], ['hide', 'Disappear']], leave.action, (value) => { leave.action = value; ed.commit(); })),
        leave.action !== 'hide' ? liveNumber('Walk to (across)', 'leaveX', leave.toX, (value) => { leave.toX = value; ed.commit(); }) : null
      ]) : null
    ]);
  }

  function checkpointPanel(ed, checkpoint) {
    return el('div', {}, [
      header(ed, 'Checkpoint', 'Checkpoint'),
      el('p', { class: 'pe-hint', text: 'When the player falls or touches a hazard, they return to the last checkpoint they passed.' }),
      section('Position', [liveNumber('Across', 'x', checkpoint.x, (value) => { checkpoint.x = clamp(value, 0, ed.scene.width); ed.commit(); }, { step: 0.5 })])
    ]);
  }

  function playerPanel(ed, player) {
    return el('div', {}, [
      header(ed, 'Player start', 'Player', false),
      el('p', { class: 'pe-hint', text: 'Readers play as their own profile character. This is where they begin the page.' }),
      section('Position', [row([
        liveNumber('Across', 'x', player.x, (value) => { player.x = clamp(value, 0, ed.scene.width); ed.commit(); }, { step: 0.5 }),
        liveNumber('Standing height', 'py', player.y, (value) => { player.y = clamp(value, 0, GROUND_Y); ed.commit(); }, { step: 0.5 })
      ])])
    ]);
  }

  function gapPanel(ed, gap) {
    return el('div', {}, [
      header(ed, gap.fill === 'water' ? 'Water' : 'Pit', 'Gap in the ground'),
      section('Fill', [UI.segmented([['water', 'Water'], ['chasm', 'Bottomless pit']], gap.fill, (value) => { gap.fill = value; ed.commit(); })],
        'Falling in sends the player back to where they last stood. Make it narrow enough to jump over, or add blocks to cross it.'),
      section('Where', [row([
        liveNumber('From', 'from', gap.from, (value) => { gap.from = clamp(value, 0, gap.to - 2); ed.commit(); }),
        liveNumber('To', 'to', gap.to, (value) => { gap.to = clamp(value, gap.from + 2, ed.scene.width); ed.commit(); })
      ])])
    ]);
  }

  // ===========================================================================
  // Stage
  // ===========================================================================
  function stagePanel(ed) {
    const scene = ed.scene;
    const bgDef = scene.background.id ? LIB.get('backgrounds', scene.background.id) : null;
    const parts = [];

    const bgThumb = el('span', {
      class: 'pe-bg-thumb is-large',
      style: {
        backgroundColor: scene.background.color,
        backgroundImage: (bgDef ? bgDef.layers : scene.background.asset ? [scene.background.asset] : []).map((layer) => `url('${LIB.url(layer)}')`).join(',')
      }
    });
    parts.push(section('Background', [
      el('div', { class: 'pe-current' }, [bgThumb, el('div', {}, [
        el('strong', { text: bgDef ? bgDef.label : scene.background.asset ? 'Your picture' : 'Plain sky' }),
        actionButton('Choose a background', () => { if (ed.modal) ed.modal.close(); ed.ui.libraryTab = 'backgrounds'; ed.renderLibrary(); ed.options.onRevealLibrary && ed.options.onRevealLibrary(); }, 'soft')
      ])]),
      row([
        field('Time of day', UI.select(LIB.tints.map((tint) => [tint.id, tint.label]), scene.background.tint, (value) => { scene.background.tint = value; ed.commit(); })),
        field('Sky colour', UI.input(scene.background.color, (value) => { scene.background.color = value; ed.touch(); }, { type: 'color' }))
      ])
    ]));

    const groundOptions = LIB.grounds.map((ground) => [ground.id, ground.label]);
    if (scene.ground.asset) groundOptions.push(['custom', 'Your picture']);
    parts.push(section('Ground', [
      row([
        field('Ground', UI.select(groundOptions, scene.ground.material, (value) => { scene.ground.material = value; ed.commit(); })),
        scene.ground.material === 'none' ? field('Colour', UI.input(scene.ground.color, (value) => { scene.ground.color = value; ed.touch(); }, { type: 'color' })) : null
      ]),
      UI.mediaField('Ground picture (tiles along the ground)', scene.ground.asset, {
        kinds: ['image'], storyboards: false, title: 'Choose a ground picture',
        onChange(value) {
          scene.ground.asset = value;
          scene.ground.material = value ? 'custom' : (scene.ground.material === 'custom' ? 'earth' : scene.ground.material);
          ed.commit();
        }
      }),
      gapList(ed)
    ]));

    const screens = Math.round(scene.width / 100);
    const beyond = [...scene.objects, ...scene.characters].filter((item) => num(item.x) > scene.width).length;
    parts.push(section('Length', [
      field(`${screens} screens long`, UI.range(screens, (value, done) => {
        scene.width = Math.round(value) * 100;
        if (scene.player.x > scene.width - 10) scene.player.x = scene.width - 10;
        if (done) ed.commit(); else ed.touch();
      }, { min: 10, max: 40, step: 1 })),
      beyond ? el('p', { class: 'pe-warning', text: `${beyond} piece${beyond > 1 ? 's are' : ' is'} past the end of the stage and cannot be reached.` }) : null
    ], 'Walking off the right-hand end finishes the page, once every required story event has played.'));

    parts.push(section('Music', [
      UI.mediaField('Background music (MP3, loops)', scene.music ? scene.music.asset : '', {
        kinds: ['audio'], storyboards: false, title: 'Choose music',
        onChange(value) { scene.music = value ? { asset: value, volume: scene.music ? scene.music.volume : 0.6 } : null; ed.commit(); }
      }),
      scene.music ? field(`Volume: ${Math.round(scene.music.volume * 100)}%`, UI.range(scene.music.volume, (value, done) => {
        scene.music.volume = r2(value);
        if (done) ed.commit(); else ed.touch();
      }, { min: 0, max: 1, step: 0.05 })) : null
    ]));

    parts.push(section('Checkpoints', [
      scene.checkpoints.length
        ? el('ul', { class: 'pe-link-list' }, scene.checkpoints.slice().sort((a, b) => a.x - b.x).map((checkpoint) => el('li', {}, [
          el('button', { type: 'button', class: 'pe-link', on: { click: () => { closePopup(ed); ed.lookAt(checkpoint.x); ed.select(`k:${checkpoint.id}`); } } }, [icon('flag'), el('span', { text: `At ${Math.round(checkpoint.x)}` })])
        ])))
        : el('p', { class: 'pe-hint', text: 'No checkpoints: players restart from where they last stood.' }),
      actionButton('Add a checkpoint here', () => {
        closePopup(ed);
        const checkpoint = { id: UI.makeId('cp'), x: ed.viewCentreX() };
        scene.checkpoints.push(checkpoint);
        ed.ui.selection = [`k:${checkpoint.id}`];
        ed.ui.tab = 'selected';
        ed.commit();
      }, 'soft', 'flag')
    ]));
    return el('div', {}, parts);
  }

  function gapList(ed) {
    const gaps = ed.scene.ground.gaps.slice().sort((a, b) => a.from - b.from);
    return el('div', { class: 'pe-gaps' }, [
      el('p', { class: 'pe-hint', text: 'Cut water or pits into the ground with the gap tool (G): drag along the ground.' }),
      gaps.length ? el('ul', { class: 'pe-link-list' }, gaps.map((gap) => el('li', {}, [
        el('button', { type: 'button', class: 'pe-link', on: { click: () => { closePopup(ed); ed.lookAt((gap.from + gap.to) / 2); ed.select(`g:${gap.id}`); } } }, [
          icon('gap'), el('span', { text: `${gap.fill === 'water' ? 'Water' : 'Pit'} from ${Math.round(gap.from)} to ${Math.round(gap.to)}` })
        ])
      ]))) : null,
      actionButton('Use the gap tool', () => { closePopup(ed); ed.setTool('gap'); }, 'ghost', 'gap')
    ]);
  }

  // ===========================================================================
  // Story events
  // ===========================================================================
  const BEAT_LABELS = { narration: 'Narration', dialogue: 'Dialogue', title: 'Title card', frame: 'Picture / video', choices: 'Choice' };

  function triggerSummary(ed, event) {
    if (event.trigger.type === 'start') return 'When the page starts';
    if (event.trigger.type === 'reach') return `When the player reaches ${Math.round(num(event.trigger.x))}`;
    const character = ed.scene.characters.find((item) => item.id === event.trigger.character);
    return character ? `When the player talks to ${characterName(ed, character)}` : 'Talk to… (choose a character)';
  }

  function eventsPanel(ed) {
    const scene = ed.scene;
    const list = el('ol', { class: 'pe-events' });
    scene.events.forEach((event, index) => {
      const open = ed.ui.activeEventId === event.id;
      const card = el('li', { class: `pe-event${open ? ' is-open' : ''}` });
      const problems = eventProblems(ed, event);
      card.appendChild(el('div', { class: 'pe-event-head' }, [
        el('button', {
          type: 'button', class: 'pe-event-toggle', 'aria-expanded': open ? 'true' : 'false',
          on: { click() { ed.ui.activeEventId = open ? null : event.id; ed.renderInspector(); if (!open && event.trigger.type === 'reach') ed.lookAt(num(event.trigger.x)); ed.renderWorld(); } }
        }, [
          el('span', { class: 'pe-event-num', text: String(index + 1) }),
          el('span', { class: 'pe-event-titles' }, [
            el('strong', { translate: event.label ? 'no' : null, text: eventName(ed, event) }),
            el('small', { text: `${triggerSummary(ed, event)} · ${event.beats.length} part${event.beats.length === 1 ? '' : 's'}${event.optional ? ' · optional' : ''}` })
          ]),
          problems.length ? el('span', { class: 'pe-event-warn', title: problems.join(' '), text: '!' }) : null
        ]),
        el('div', { class: 'pe-event-order' }, [
          UI.iconButton('up', 'Play earlier', () => { if (index > 0) { [scene.events[index - 1], scene.events[index]] = [scene.events[index], scene.events[index - 1]]; ed.commit(); } }),
          UI.iconButton('down', 'Play later', () => { if (index < scene.events.length - 1) { [scene.events[index + 1], scene.events[index]] = [scene.events[index], scene.events[index + 1]]; ed.commit(); } }),
          UI.iconButton('trash', 'Delete this event', () => deleteEvent(ed, event), { class: 'is-danger' })
        ])
      ]));
      if (open) card.appendChild(eventEditor(ed, event, problems));
      list.appendChild(card);
    });

    const addMenu = el('div', { class: 'pe-add-event' }, [
      el('span', { class: 'pe-add-label', text: 'Add a story event:' }),
      actionButton('When the page starts', () => ed.openEvent(ed.addEvent({ type: 'start' }).id), 'soft', 'play'),
      actionButton('When the player reaches here', () => ed.openEvent(ed.addEvent({ type: 'reach', x: ed.viewCentreX() }).id), 'soft', 'flag'),
      actionButton('When the player talks to someone', () => {
        const character = ed.scene.characters[0];
        const event = ed.addEvent({ type: 'talk', character: character ? character.id : '' });
        if (character) event.label = `Talk to ${characterName(ed, character)}`;
        ed.openEvent(event.id);
      }, 'soft', 'chat')
    ]);
    return el('div', {}, [
      el('p', { class: 'pe-hint', text: 'Story events play one after another, in this order, as the player goes along: narration, conversations, illustrations, choices and cutscenes. The page ends when the player walks off the right-hand end after the required events have played.' }),
      scene.events.length ? list : el('p', { class: 'pe-empty-title', text: 'No story events yet.' }),
      addMenu
    ]);
  }

  // Asks first, then removes the event (and anything that waited on it).
  async function deleteEvent(ed, event) {
    if (!(await UI.confirmDialog(`Delete “${eventName(ed, event)}” and everything in it?`))) return;
    ed.ui.selection = [`e:${event.id}`];
    ed.deleteSelection();
    if (ed.ui.activeEventId === event.id) ed.ui.activeEventId = null;
    ed.renderInspector();
  }

  function eventProblems(ed, event) {
    const problems = [];
    if (!event.beats.length) problems.push('This event has nothing in it yet.');
    if (event.trigger.type === 'talk' && !ed.scene.characters.some((item) => item.id === event.trigger.character)) problems.push('Choose who the player talks to.');
    const pages = pagesFor(ed).map((page) => page.key);
    const badLink = (goto) => goto && goto.type === 'page' && !pages.includes(goto.page);
    if (badLink(event.after)) problems.push('“When it ends” points to a page that no longer exists.');
    event.beats.forEach((beat) => {
      if (beat.type === 'choices' && (beat.choices || []).some((choice) => badLink(choice.goto))) problems.push('A choice points to a page that no longer exists.');
      if (beat.type === 'choices' && (beat.choices || []).filter((choice) => String(choice.text || '').trim()).length < 2) problems.push('A choice needs at least two answers.');
      if (beat.type === 'frame' && !beat.image && !beat.video) problems.push('A picture part has no picture yet.');
    });
    return problems;
  }

  function eventEditor(ed, event, problems) {
    const scene = ed.scene;
    const parts = [];
    // Warnings are re-checked while typing, without redrawing the panel.
    const problemSlot = el('div');
    const showProblems = (list) => problemSlot.replaceChildren(...(list.length ? [el('ul', { class: 'pe-problems' }, list.map((problem) => el('li', { text: problem })))] : []));
    showProblems(problems);
    ed.afterTouch = () => {
      const list = eventProblems(ed, event);
      showProblems(list);
      const card = problemSlot.closest('.pe-event');
      const warn = card && card.querySelector('.pe-event-warn');
      if (warn && !list.length) warn.remove();
    };
    parts.push(problemSlot);
    parts.push(field('Name (only you see this)', UI.input(event.label, (value) => { event.label = value; ed.touch(); }, { maxlength: 60, placeholder: eventName(ed, event) }), { full: true }));

    const trigger = event.trigger;
    const triggerParts = [UI.segmented([['start', 'Page starts'], ['reach', 'Player reaches a spot'], ['talk', 'Player talks to…']], trigger.type, (value) => {
      trigger.type = value;
      if (value === 'reach' && !num(trigger.x)) trigger.x = ed.viewCentreX();
      if (value === 'talk' && !trigger.character && scene.characters[0]) trigger.character = scene.characters[0].id;
      ed.commit();
    })];
    if (trigger.type === 'reach') {
      triggerParts.push(row([
        liveNumber('Spot (across)', 'eventX', num(trigger.x), (value) => { trigger.x = clamp(value, 0, scene.width); ed.commit(); }),
        el('div', { class: 'pe-toggle-cell' }, [actionButton('Show on stage', () => { ed.lookAt(num(trigger.x)); ed.select(`e:${event.id}`); }, 'ghost')])
      ]));
      triggerParts.push(el('p', { class: 'pe-hint', text: 'Its numbered marker on the stage can be dragged too.' }));
    }
    if (trigger.type === 'talk') {
      triggerParts.push(scene.characters.length
        ? field('Character', UI.select(scene.characters.map((character) => [character.id, characterName(ed, character)]), trigger.character, (value) => { trigger.character = value; ed.commit(); }))
        : el('p', { class: 'pe-warning', text: 'Place a character on the stage first (Characters in the library).' }));
      triggerParts.push(UI.toggle('Optional: the story can go on without this conversation', event.optional, (value) => { event.optional = value; ed.commit(); }));
    }
    parts.push(section('Plays', triggerParts));

    if (scene.characters.length) {
      const names = event.cutscene.focus.map((id) => scene.characters.find((character) => character.id === id)).filter(Boolean).map((character) => characterName(ed, character));
      parts.push(UI.popupButton('Cutscene camera', names.length ? `${names.join(', ')}${event.cutscene.holdCamera ? ` · ${tr('camera still')}` : ''}` : tr('Off'), () => popup(ed, 'Cutscene camera', () => cameraPopup(ed, event)), 'camera'));
    }

    const beats = el('ol', { class: 'pe-beats' });
    event.beats.forEach((beat, index) => beats.appendChild(beatEditor(ed, event, beat, index)));
    const adders = el('div', { class: 'pe-add-beat' }, Object.entries(BEAT_LABELS).map(([type, label]) => actionButton(label, () => {
      const beat = { id: UI.makeId('beat'), type, text: '' };
      if (type === 'dialogue') beat.speaker = event.trigger.type === 'talk' && event.trigger.character ? event.trigger.character : 'player';
      if (type === 'choices') { beat.speaker = 'player'; beat.choices = [{ text: '', goto: { type: 'continue' } }, { text: '', goto: { type: 'continue' } }]; }
      if (type === 'frame') { beat.image = ''; beat.transition = 'crossfade'; }
      event.beats.push(beat);
      ed.commit();
    }, 'ghost', 'plus')));
    parts.push(section('What happens', [event.beats.length ? beats : el('p', { class: 'pe-hint', text: 'Add narration, dialogue, a title card, a picture or video, or a choice.' }), adders]));

    parts.push(section('When it ends', [UI.gotoEditor(event.after, {
      types: ['continue', 'page', 'end'], continueLabel: 'Keep playing this page', pages: pagesFor(ed),
      onChange(goto) { event.after = goto; ed.touch(); }
    })]));

    parts.push(el('div', { class: 'pe-event-footer' }, [
      actionButton('Delete this event', () => deleteEvent(ed, event), 'danger', 'trash')
    ]));
    return el('div', { class: 'pe-event-body' }, parts);
  }

  function cameraPopup(ed, event) {
    const scene = ed.scene;
    const focus = new Set(event.cutscene.focus);
    return el('div', { class: 'pe-popup' }, [
      el('p', { class: 'pe-hint', text: 'Turn it into a cutscene: the camera moves to show these characters while the event plays.' }),
      el('div', { class: 'pe-checks' }, scene.characters.map((character) => {
        const box = el('input', { type: 'checkbox', checked: focus.has(character.id) });
        box.addEventListener('change', () => {
          event.cutscene.focus = box.checked ? [...new Set([...event.cutscene.focus, character.id])] : event.cutscene.focus.filter((id) => id !== character.id);
          ed.commit();
        });
        return el('label', { class: 'pe-check' }, [box, el('span', { translate: 'no', text: characterName(ed, character) })]);
      })),
      event.cutscene.focus.length ? UI.toggle('Keep the camera still while characters walk away', event.cutscene.holdCamera, (value) => { event.cutscene.holdCamera = value; ed.commit(); }) : null
    ]);
  }

  // A line's words and formatting (js/rich-text.js): select words, then use the toolbar.
  function lineEditor(ed, beat, options) {
    const field = window.KoobdRichText.editor({
      maxLength: 600, ...options, rich: beat.rich || '', text: beat.text || '',
      onChange(rich, plain) {
        beat.text = plain;
        if (rich) beat.rich = rich; else delete beat.rich;
        ed.touch();
      }
    });
    ed.lineEditors.set(beat.id, field.richText);
    return field;
  }

  function beatEditor(ed, event, beat, index) {
    const move = (delta) => {
      const target = index + delta;
      if (target < 0 || target >= event.beats.length) return;
      [event.beats[index], event.beats[target]] = [event.beats[target], event.beats[index]];
      ed.commit();
    };
    const fields = [];
    const speakers = speakerOptions(ed);
    if (beat.type === 'title') {
      const titleInput = lineEditor(ed, beat, { singleLine: true, maxLength: 120, placeholder: 'e.g. Chapter Two', label: 'Title' });
      const stack = (id) => ((id && LIB.get('fonts', id)) || {}).stack || '';
      titleInput.querySelector('.rt-editable').style.fontFamily = stack(beat.font);
      const fontSelect = UI.select([['', 'Story font'], ...LIB.fonts.filter((font) => font.id !== 'default').map((font) => [font.id, font.label]), ['default', 'KoobD (default)']], beat.font || '', (value) => {
        if (value) beat.font = value; else delete beat.font;
        ed.commit();
      });
      Array.from(fontSelect.options).forEach((option) => { option.style.fontFamily = stack(option.value); });
      fontSelect.style.fontFamily = stack(beat.font);
      const sizeSelect = UI.select([['', 'Normal size'], ...LIB.titleSizes.map((size) => [size.id, size.label])], beat.size || '', (value) => {
        if (value) beat.size = value; else delete beat.size;
        ed.commit();
      });
      fields.push(field('Title', titleInput, { full: true }));
      fields.push(row([field('Title font', fontSelect), field('Title size', sizeSelect)]));
    } else if (beat.type === 'narration') {
      fields.push(lineEditor(ed, beat, { placeholder: 'What the narrator says', label: 'Narration' }));
    } else if (beat.type === 'dialogue') {
      fields.push(field('Who speaks', UI.select(speakers, beat.speaker || 'player', (value) => { beat.speaker = value; ed.touch(); })));
      fields.push(lineEditor(ed, beat, { placeholder: 'What they say', label: 'Dialogue' }));
    } else if (beat.type === 'frame') {
      fields.push(UI.mediaField('Picture, GIF or video', beat.video || beat.image || '', {
        kinds: ['image', 'video'], title: 'Choose a picture or video',
        onChange(value, item) {
          const isVideo = item ? item.kind === 'video' : /\.(mp4|webm)$/i.test(value);
          beat.image = isVideo ? '' : value;
          beat.video = isVideo ? value : '';
          ed.commit();
        }
      }));
      fields.push(row([field('Transition', UI.select([['crossfade', 'Fade'], ['dip', 'Fade through black'], ['flash', 'Flash'], ['cut', 'Cut']], beat.transition || 'crossfade', (value) => { beat.transition = value; ed.touch(); }))]));
    } else if (beat.type === 'choices') {
      fields.push(field('Who asks', UI.select(speakers, beat.speaker || 'player', (value) => { beat.speaker = value; ed.touch(); })));
      fields.push(lineEditor(ed, beat, { placeholder: 'The question, e.g. “Which way should we go?” (optional)', label: 'Question' }));
      beat.choices = Array.isArray(beat.choices) ? beat.choices : [];
      const list = el('div', { class: 'pe-choices' });
      beat.choices.forEach((choice, choiceIndex) => {
        choice.goto = choice.goto || { type: 'continue' };
        list.appendChild(el('div', { class: 'pe-choice' }, [
          el('div', { class: 'pe-choice-row' }, [
            el('span', { class: 'pe-choice-num', text: String.fromCharCode(65 + choiceIndex) }),
            UI.input(choice.text, (value) => { choice.text = value; ed.touch(); }, { maxlength: 120, placeholder: 'Answer text' }),
            beat.choices.length > 2 ? UI.iconButton('trash', 'Remove answer', () => { beat.choices.splice(choiceIndex, 1); ed.commit(); }, { class: 'is-danger' }) : null
          ]),
          el('div', { class: 'pe-choice-goto' }, [el('span', { text: 'Then' }), UI.gotoEditor(choice.goto, {
            types: ['continue', 'page', 'end'], continueLabel: 'Carry on with this event', pages: pagesFor(ed),
            onChange(goto) { choice.goto = goto; ed.touch(); }
          })])
        ]));
      });
      fields.push(list);
      if (beat.choices.length < 4) fields.push(actionButton('Add an answer', () => { beat.choices.push({ text: '', goto: { type: 'continue' } }); ed.commit(); }, 'ghost', 'plus'));
      fields.push(el('p', { class: 'pe-hint', text: 'Readers have a few seconds to choose; if they wait, answer A is picked. “Jump to a page” starts a branch: build it with the page bar and see it in the Story Map.' }));
    }
    const soundButton = beat.type === 'title' ? null : UI.iconButton('mic', beat.audio ? 'Sound or voice: on' : 'Add a sound or voice', () => popup(ed, 'Sound or voice', () => el('div', { class: 'pe-popup' }, [
      UI.mediaField('Sound or voice (optional)', beat.audio || '', {
        kinds: ['audio'], storyboards: false, title: 'Choose a sound',
        onChange(value) { if (value) beat.audio = value; else delete beat.audio; ed.commit(); }
      }),
      el('p', { class: 'pe-hint', text: 'Plays when this part of the event appears, e.g. a voice reading the line.' })
    ])), { class: beat.audio ? 'is-active' : '' });
    const showOnStage = ['narration', 'dialogue', 'title', 'choices'].includes(beat.type) ? () => ed.showLine(beat.id) : null;
    return el('li', { class: `pe-beat is-${beat.type}${ed.ui.activeBeatId === beat.id ? ' is-on-stage' : ''}`, dataset: { beat: beat.id }, on: showOnStage ? { focusin: showOnStage, pointerdown: showOnStage } : {} }, [
      el('div', { class: 'pe-beat-head' }, [
        el('span', { class: 'pe-beat-type', text: BEAT_LABELS[beat.type] || beat.type }),
        el('div', { class: 'pe-beat-actions' }, [
          soundButton,
          UI.iconButton('up', 'Move up', () => move(-1)),
          UI.iconButton('down', 'Move down', () => move(1)),
          UI.iconButton('trash', 'Remove', () => { event.beats.splice(index, 1); ed.commit(); }, { class: 'is-danger' })
        ])
      ]),
      ...fields
    ]);
  }

  // ===========================================================================
  function render(ed, root) {
    ed.afterTouch = null;
    ed.lineEditors = new Map(); // beat id -> its text box (see lineEditor)
    // The stage shows the open event's line only on the Story events tab.
    if (ed.renderLine) ed.renderLine();
    // Keep the page where it is: the panel never shrinks under the reader
    // while they work in the same tab (it resets when the tab changes).
    const scrollY = window.scrollY;
    if (root.dataset.tab === ed.ui.tab) root.style.minHeight = `${root.offsetHeight}px`;
    else root.style.minHeight = '';
    root.dataset.tab = ed.ui.tab;
    const scrollTop = root.querySelector('.pe-inspector-body') ? root.querySelector('.pe-inspector-body').scrollTop : 0;
    const count = ed.ui.selection.length;
    if (ed.ui.tab === 'stage') ed.ui.tab = 'selected';
    const tabs = [
      ['selected', count ? `Selected${count > 1 ? ` (${count})` : ''}` : 'Selected'],
      ['events', `Story events (${ed.scene.events.length})`]
    ];
    const tabBar = el('div', { class: 'ed-tabs pe-inspector-tabs', role: 'tablist' }, tabs.map(([id, label]) => el('button', {
      type: 'button', role: 'tab', class: ed.ui.tab === id ? 'is-active' : '', 'aria-selected': ed.ui.tab === id ? 'true' : 'false', text: label,
      on: { click() { ed.ui.tab = id; render(ed, root); } }
    })));
    const body = el('div', { class: 'pe-inspector-body' }, [
      ed.ui.tab === 'events' ? eventsPanel(ed) : selectedPanel(ed)
    ]);
    const head = el('div', { class: 'pe-inspector-head' }, [
      tabBar,
      UI.popupButton('Stage settings', stageSummary(ed), () => openStage(ed), 'settings')
    ]);
    root.replaceChildren(head, body);
    body.scrollTop = scrollTop;
    if (window.scrollY !== scrollY) window.scrollTo(window.scrollX, scrollY);
  }

  // Updates the numbers of the selected piece while it is dragged.
  function live(ed, root) {
    const ref = ed.ui.selection.length === 1 ? ed.ui.selection[0] : null;
    const found = ref && ed.resolve(ref);
    if (!found) return;
    const item = found.item;
    const values = {
      x: item.x, y: GROUND_Y - num(item.y), cols: item.cols, rows: item.rows, w: item.w, h: item.h, rotation: num(item.rotation),
      feet: item.feet, py: item.y, from: item.from, to: item.to, eventX: item.trigger ? item.trigger.x : 0
    };
    if (found.type === 'player') values.x = item.x;
    root.querySelectorAll('[data-live]').forEach((input) => {
      if (document.activeElement === input || !(input.dataset.live in values)) return;
      input.value = String(r2(num(values[input.dataset.live])));
    });
  }

  function stageSummary(ed) {
    const scene = ed.scene;
    const bg = scene.background.id ? (LIB.get('backgrounds', scene.background.id) || {}).label : scene.background.asset ? 'Your picture' : 'Plain sky';
    const tint = (LIB.get('tints', scene.background.tint) || {}).label;
    return [tr(bg), tint ? tr(tint) : '', tr(`${Math.round(scene.width / 100)} screens`)].filter(Boolean).join(' · ');
  }
  // Background, time of day, ground, length, music and checkpoints.
  function openStage(ed) {
    return popup(ed, 'Stage settings', () => stagePanel(ed), 'md');
  }

  PE.panels.render = render;
  PE.panels.openStage = openStage;
  PE.panels.live = live;
})();
