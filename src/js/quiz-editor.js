// The question activity editor (teacher_quiz_editor.php). Questions are cards:
// a prompt, a type, its answer part, and buttons to move, duplicate and delete
// them. Multiple choice and true/false have choices with one marked correct;
// identification has the answers it accepts (typed by the student, checked
// without case or extra spaces); essay has the points it is worth (the
// teacher grades each answer from Results). Nothing is
// saved until the teacher saves a draft or publishes (teacher_quiz_save.php);
// leaving with unsaved changes asks first.
(function () {
  const data = window.KOOBD_QUIZ_EDITOR || {};
  const $ = (id) => document.getElementById(id);
  const dom = {
    title: $('quizTitle'), description: $('quizDescription'), instructions: $('quizInstructions'),
    due: $('quizDue'), showAnswers: $('quizShowAnswers'), shuffle: $('quizShuffle'), list: $('quizTimeline') || $('quizQuestions'),
    status: $('quizStatus'), saveState: $('quizSaveState'), errors: $('quizErrors'),
    banner: $('quizSubmissionsBanner'), publish: $('quizPublish'), saveDraft: $('quizSaveDraft'),
    preview: $('quizPreview'), moreBtn: $('quizMoreBtn'), moreMenu: $('quizMoreMenu'),
    unpublish: $('quizUnpublish'), results: $('quizResultsLink'), del: $('quizDelete'),
    confirm: $('quizConfirm')
  };

  let uidCounter = 0;
  const uid = () => `q${++uidCounter}`;
  const TYPES = {
    multiple_choice: 'Multiple choice',
    true_false: 'True or False',
    identification: 'Identification',
    essay: 'Essay',
    speak: 'Say it'
  };
  // The language each question is read aloud and spoken in (js/koobd-speech.js).
  const LANGS = { auto: 'Language: automatic', 'en-US': 'English', 'fil-PH': 'Filipino' };
  const isPhraseList = (type) => type === 'identification' || type === 'speak';
  const ESSAY_POINTS = 5;
  // A story activity's questions (teacher_quiz_editor.php?activity=<story
  // activity>): each is placed at a point in the story, may be optional, and
  // has its own points; a timeline shows the points and what is asked at each.
  const storyMode = Boolean(data.storyMode && data.story);
  const storyPoints = storyMode ? data.story.points : [];
  const pointOrder = new Map(storyPoints.map((point, index) => [point.key, index]));
  let lastPoint = storyPoints.length ? storyPoints[storyPoints.length - 1].key : '';
  let addingAt = ''; // the story point whose "Add a question" menu is open
  const toChoice = (choice) => ({ uid: uid(), id: choice.id || 0, label: choice.label || '', correct: Boolean(choice.correct) });
  const toQuestion = (question) => ({
    uid: uid(),
    id: question.id || 0,
    type: TYPES[question.type] ? question.type : 'multiple_choice',
    prompt: question.prompt || '',
    points: Number(question.points) || (question.type === 'essay' ? ESSAY_POINTS : 1),
    point: question.point || '',
    optional: Boolean(question.optional),
    lang: LANGS[question.lang] ? question.lang : 'auto',
    // Minimised to one line in the editor (not saved). A story's questions
    // open minimised so the timeline stays easy to scan.
    collapsed: storyMode,
    // The teacher's own recording of a "Say it" phrase (a file path), or null.
    audio: question.audio || null,
    choices: (question.choices || []).map(toChoice)
  });
  // An identification question's accepted answers (every one counts as right).
  const acceptedAnswer = (label = '', id = 0) => ({ uid: uid(), id, label, correct: true });
  const trueFalseChoices = (rightIsTrue = true, keep = []) => [
    { uid: uid(), id: keep[0]?.id || 0, label: 'True', correct: rightIsTrue },
    { uid: uid(), id: keep[1]?.id || 0, label: 'False', correct: !rightIsTrue }
  ];
  const blankQuestion = (type, point = lastPoint) => ({
    uid: uid(), id: 0, type, prompt: type === 'speak' ? 'Say this aloud.' : '', points: type === 'essay' ? ESSAY_POINTS : 1, point, optional: false, lang: 'auto', audio: null,
    choices: type === 'true_false'
      ? trueFalseChoices(true)
      : isPhraseList(type) ? [acceptedAnswer()]
        : type === 'essay' ? []
          : [toChoice({ label: '' }), toChoice({ label: '' })]
  });

  const activity = data.activity || {};
  const state = {
    id: activity.id || 0,
    status: activity.status || 'draft',
    title: activity.title || '',
    description: activity.description || '',
    instructions: activity.instructions || '',
    dueDate: activity.dueDate || '',
    showAnswers: activity.showAnswers !== false,
    shuffle: Boolean(activity.shuffle),
    questions: (data.questions || []).map(toQuestion)
  };
  if (!state.questions.length && !storyMode) state.questions.push(blankQuestion('multiple_choice'));

  let dirty = false;
  let saving = false;
  let errorMarks = new Map(); // question index -> message
  let focusedUid = state.questions[0]?.uid || '';

  // --- Small helpers ----------------------------------------------------------
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key === 'value') node.value = value;
      else if (key === 'checked') node.checked = Boolean(value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    [].concat(children).forEach((child) => child && node.append(child));
    return node;
  }
  const iconSvg = (path) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = path;
    return svg;
  };
  const ICONS = {
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    collapse: '<path d="M6 15l6-6 6 6"/>',
    expand: '<path d="M6 9l6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21"/>',
    play: '<path d="M8 5.5v13l10-6.5z"/>',
    redo: '<path d="M19 12a7 7 0 11-2.05-4.95M19 4v4h-4"/>'
  };
  // Textareas grow with what is typed, like Forms.
  function autoGrow(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function markDirty() {
    dirty = true;
    dom.saveState.textContent = 'Unsaved changes';
    dom.saveState.dataset.state = 'dirty';
  }

  function setStatus(status) {
    if (storyMode) {
      // A story activity is already in the classroom: only its questions are saved here.
      state.status = 'published';
      dom.status.hidden = true;
      dom.saveDraft.hidden = true;
      dom.publish.textContent = 'Save questions';
      dom.publish.title = 'Save the questions; students meet them the next time they open the story';
      dom.unpublish.hidden = true;
      dom.del.hidden = true;
      dom.results.hidden = false;
      dom.results.href = `teacher_quiz_results.php?activity=${state.id}`;
      return;
    }
    state.status = status;
    dom.status.dataset.status = status;
    dom.status.textContent = status === 'published' ? 'Published' : 'Draft';
    dom.publish.textContent = status === 'published' ? 'Update' : 'Publish';
    dom.publish.title = status === 'published' ? 'Save your changes; students see them right away' : 'Save and show this activity to your students';
    dom.unpublish.hidden = status !== 'published';
    dom.results.hidden = !state.id;
    dom.del.hidden = !state.id;
    if (state.id) dom.results.href = `teacher_quiz_results.php?activity=${state.id}`;
  }

  function showSubmissionsBanner() {
    const count = Number(data.submissions) || 0;
    dom.banner.hidden = count === 0;
    if (count) {
      dom.banner.textContent = storyMode
        ? `${count} student${count === 1 ? ' has' : 's have'} already answered some of these questions. If you change a question or its correct answer, their scores are checked again.`
        : `${count} student${count === 1 ? ' has' : 's have'} already submitted. If you change questions or correct answers, their scores are checked again.`;
    }
  }

  // --- Rendering ---------------------------------------------------------------
  function render(keepFocus = true) {
    const active = document.activeElement;
    const focusKey = keepFocus && active && active.dataset ? active.dataset.focusKey : null;
    if (storyMode) renderTimeline();
    else dom.list.replaceChildren(...state.questions.map(questionCard));
    if (focusKey) {
      const target = dom.list.querySelector(`[data-focus-key="${focusKey}"]`);
      if (target) target.focus({ preventScroll: true });
    }
    dom.list.querySelectorAll('textarea').forEach(autoGrow);
  }

  function questionCard(question, index) {
    const total = state.questions.length;
    const error = errorMarks.get(index);
    if (question.collapsed && !error) return collapsedCard(question, index);
    const card = el('li', {
      class: `quiz-card quiz-question-card${question.uid === focusedUid ? ' is-active' : ''}${error ? ' has-error' : ''}`,
      'data-uid': question.uid,
      onfocusin: () => {
        if (focusedUid === question.uid) return;
        focusedUid = question.uid;
        dom.list.querySelectorAll('.quiz-question-card').forEach((node) => node.classList.toggle('is-active', node.dataset.uid === question.uid));
      }
    });

    const prompt = el('textarea', {
      class: 'quiz-prompt-input', rows: '1', maxlength: '2000',
      placeholder: question.type === 'true_false' ? 'Statement (true or false?)' : question.type === 'essay' ? 'Essay question or topic' : question.type === 'speak' ? 'Instruction (for example: Say this word aloud.)' : 'Question',
      'aria-label': `Question ${index + 1}`, 'data-focus-key': `${question.uid}:prompt`,
      value: question.prompt,
      oninput: (event) => { question.prompt = event.target.value; autoGrow(event.target); markDirty(); clearError(index, card); refreshLang(question); }
    });
    const typeSelect = el('select', {
      class: 'quiz-type-select', 'aria-label': `Question ${index + 1} type`, 'data-focus-key': `${question.uid}:type`,
      onchange: (event) => changeType(question, event.target.value)
    }, Object.entries(TYPES).map(([value, label]) => el('option', { value, text: label, selected: question.type === value })));
    typeSelect.value = question.type;

    const head = el('div', { class: 'quiz-question-head' }, [
      el('span', { class: 'quiz-question-number', text: `${index + 1}` }),
      prompt,
      el('div', { class: 'quiz-question-head-tools' }, [
        typeSelect,
        el('button', {
          type: 'button', class: 'quiz-icon-btn quiz-collapse-btn', 'aria-label': `Minimise question ${index + 1}`, title: 'Minimise',
          'aria-expanded': 'true',
          onclick: () => { question.collapsed = true; render(false); dom.list.querySelector(`[data-uid="${question.uid}"] .quiz-collapsed-row`)?.focus(); }
        }, [iconSvg(ICONS.collapse)])
      ])
    ]);

    let choices;
    if (isPhraseList(question.type)) choices = acceptedList(question, index);
    else if (question.type === 'essay') choices = essayBody(question, index);
    else {
      choices = el('ul', { class: 'quiz-choice-list', role: 'radiogroup', 'aria-label': `Correct answer for question ${index + 1}` },
        question.choices.map((choice, choiceIndex) => choiceRow(question, choice, choiceIndex, index)));
    }

    const footerParts = [];
    if (question.type === 'multiple_choice') {
      footerParts.push(el('button', {
        type: 'button', class: 'quiz-add-choice', text: '+ Add option',
        onclick: () => {
          if (question.choices.length >= 12) return;
          question.choices.push(toChoice({ label: '' }));
          markDirty();
          render(false);
          const inputs = dom.list.querySelectorAll(`[data-uid="${question.uid}"] .quiz-choice-input`);
          inputs[inputs.length - 1]?.focus();
        }
      }));
    }
    footerParts.push(answerKeyNote(question));
    // The language it is read aloud and spoken in; automatic reads Tagalog
    // text as Filipino and everything else as English.
    footerParts.push(el('select', {
      class: 'quiz-lang-select', 'aria-label': `Language of question ${index + 1}`, 'data-focus-key': `${question.uid}:lang`,
      title: 'The language students hear it read in (and say it in)',
      onchange: (event) => { question.lang = event.target.value; markDirty(); refreshLang(question); }
    }, Object.entries(LANGS).map(([value, label]) => el('option', { value, text: value === 'auto' ? autoLabel(question) : label, selected: question.lang === value }))));

    const tools = el('div', { class: 'quiz-question-tools' }, [
      toolButton('up', 'Move up', index === 0, () => move(index, -1)),
      toolButton('down', 'Move down', index === total - 1, () => move(index, 1)),
      toolButton('copy', 'Duplicate', false, () => duplicate(index)),
      toolButton('trash', 'Delete question', false, () => removeQuestion(index))
    ]);

    card.append(head, choices);
    if (storyMode) card.append(storySettings(question, index));
    card.append(el('div', { class: 'quiz-question-foot' }, [el('div', { class: 'quiz-question-foot-main' }, footerParts), tools]));
    if (error) card.append(el('p', { class: 'quiz-question-error', role: 'alert', text: error }));
    return card;
  }

  function choiceRow(question, choice, choiceIndex, questionIndex) {
    const group = `correct-${question.uid}`;
    const radio = el('input', {
      type: 'radio', name: group, class: 'quiz-correct-radio', checked: choice.correct,
      'aria-label': `Mark ${choice.label || `option ${choiceIndex + 1}`} as the correct answer`,
      'data-focus-key': `${choice.uid}:radio`,
      onchange: () => {
        question.choices.forEach((other) => { other.correct = other === choice; });
        markDirty();
        clearError(questionIndex);
        render();
      }
    });
    const row = el('li', { class: `quiz-choice${choice.correct ? ' is-correct' : ''}` }, [
      el('label', { class: 'quiz-correct-mark', title: 'Correct answer' }, [radio, el('span', { class: 'quiz-radio-dot', 'aria-hidden': 'true' })])
    ]);
    if (question.type === 'true_false') {
      row.append(el('span', { class: 'quiz-choice-fixed', text: choice.label }));
    } else {
      // A text box that grows with a long answer (Enter still adds the next option).
      row.append(el('textarea', {
        class: 'quiz-choice-input', rows: '1', maxlength: '500', placeholder: `Option ${choiceIndex + 1}`,
        'aria-label': `Option ${choiceIndex + 1}`, value: choice.label, 'data-focus-key': `${choice.uid}:label`,
        oninput: (event) => {
          choice.label = event.target.value.replace(/\n/g, ' ');
          if (event.target.value !== choice.label) event.target.value = choice.label;
          autoGrow(event.target);
          markDirty();
          clearError(questionIndex);
          const key = row.closest('.quiz-question-card')?.querySelector('.quiz-answer-key');
          if (key && choice.correct) key.textContent = `Correct answer: ${choice.label || `Option ${choiceIndex + 1}`}`;
        },
        onkeydown: (event) => {
          // Enter on the last option adds the next one, as in Forms.
          if (event.key === 'Enter') event.preventDefault();
          if (event.key === 'Enter' && choiceIndex === question.choices.length - 1 && question.choices.length < 12) {
            question.choices.push(toChoice({ label: '' }));
            markDirty();
            render(false);
            const inputs = dom.list.querySelectorAll(`[data-uid="${question.uid}"] .quiz-choice-input`);
            inputs[inputs.length - 1]?.focus();
          }
        }
      }));
      if (question.choices.length > 2) {
        row.append(el('button', {
          type: 'button', class: 'quiz-icon-btn quiz-remove-choice', 'aria-label': `Remove option ${choiceIndex + 1}`, title: 'Remove option',
          onclick: () => {
            question.choices.splice(choiceIndex, 1);
            markDirty();
            render(false);
          }
        }, [iconSvg(ICONS.close)]));
      }
    }
    return row;
  }

  // A minimised question: its number, kind, question and points on one line;
  // clicking it opens the question again.
  function collapsedCard(question, index) {
    const tags = [
      el('span', { class: 'quiz-mini-tag', text: TYPES[question.type] }),
      storyMode || question.type === 'essay' ? el('span', { class: 'quiz-mini-tag is-points', text: `${question.points} pt${question.points === 1 ? '' : 's'}` }) : null,
      question.optional ? el('span', { class: 'quiz-mini-tag is-optional', text: 'Optional' }) : null
    ];
    return el('li', { class: 'quiz-card quiz-question-card is-collapsed', 'data-uid': question.uid }, [
      el('button', {
        type: 'button', class: 'quiz-collapsed-row', 'aria-expanded': 'false', 'data-focus-key': `${question.uid}:collapsed`,
        'aria-label': `Question ${index + 1}: ${question.prompt || 'untitled'}. Open to edit`,
        onclick: () => {
          question.collapsed = false;
          focusedUid = question.uid;
          render(false);
          dom.list.querySelector(`[data-uid="${question.uid}"] .quiz-prompt-input`)?.focus();
        }
      }, [
        el('span', { class: 'quiz-question-number', text: `${index + 1}` }),
        el('span', { class: `quiz-collapsed-prompt${question.prompt.trim() ? '' : ' is-empty'}`, text: question.prompt.trim() || 'Untitled question' }),
        el('span', { class: 'quiz-collapsed-tags' }, tags),
        el('span', { class: 'quiz-collapsed-open', 'aria-hidden': 'true' }, [iconSvg(ICONS.expand)])
      ])
    ]);
  }

  // A story question's place in the story, whether it can be skipped, and
  // (an essay shows its points with its writing box) what it is worth.
  function storySettings(question, index) {
    const where = el('select', {
      class: 'quiz-type-select quiz-point-select', 'aria-label': `Where question ${index + 1} is asked`, 'data-focus-key': `${question.uid}:point`,
      onchange: (event) => { question.point = event.target.value; lastPoint = question.point; markDirty(); clearError(index); render(); }
    }, [
      question.point && !pointOrder.has(question.point) ? el('option', { value: question.point, text: 'A part no longer in this story', selected: true }) : null,
      ...storyPoints.map((point) => el('option', { value: point.key, text: point.label, selected: point.key === question.point }))
    ]);
    if (pointOrder.has(question.point)) where.value = question.point;
    const optional = el('label', { class: 'quiz-switch quiz-switch-sm' }, [
      el('input', { type: 'checkbox', checked: question.optional, 'data-focus-key': `${question.uid}:optional`, onchange: (event) => { question.optional = event.target.checked; markDirty(); } }),
      el('span', { class: 'quiz-switch-track', 'aria-hidden': 'true' }),
      el('span', { text: 'Students may skip it' })
    ]);
    optional.querySelector('input').checked = question.optional;
    const points = el('input', {
      class: 'quiz-story-points', type: 'number', min: '1', max: '100', step: '1', inputmode: 'numeric', value: String(question.points),
      'aria-label': `Points for question ${index + 1}`, 'data-focus-key': `${question.uid}:points`,
      oninput: (event) => {
        const value = Math.round(Number(event.target.value));
        if (!Number.isFinite(value) || value < 1) return;
        question.points = Math.min(100, value);
        markDirty();
        refreshKeyNote(question);
        renderSummary();
      },
      onblur: (event) => { event.target.value = String(question.points); }
    });
    // The same three settings, in the same place, for every kind of question.
    return el('div', { class: 'quiz-story-settings' }, [
      el('label', { class: 'quiz-story-setting is-where' }, [el('span', { class: 'quiz-story-setting-label', text: 'Asked in the story' }), where]),
      el('label', { class: 'quiz-story-setting is-points' }, [el('span', { class: 'quiz-story-setting-label', text: 'Points' }), points]),
      el('div', { class: 'quiz-story-setting is-optional' }, [el('span', { class: 'quiz-story-setting-label', text: 'Optional' }), optional])
    ]);
  }

  // The story's points in order, with the questions asked at each and a
  // button to add one there.
  // "3 questions · 8 points · 1 optional" under the story's title.
  function renderSummary() {
    const summary = document.getElementById('quizStorySummary');
    if (!storyMode || !summary) return;
    const count = state.questions.length;
    const total = state.questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0);
    const optional = state.questions.filter((question) => question.optional).length;
    summary.replaceChildren(...(count
      ? [`${count} question${count === 1 ? '' : 's'}`, `${total} point${total === 1 ? '' : 's'}`, optional ? `${optional} optional` : '']
      : ['No questions yet — the story plays straight through']
    ).filter(Boolean).map((text) => el('span', { text })));
  }

  // The story's points in order. Each point's questions sit right under it,
  // and "Add a question" there offers the four kinds; a new question opens in
  // place, under its point.
  function renderTimeline() {
    const timeline = document.getElementById('quizTimeline');
    renderSummary();
    if (!storyMode || !timeline) return;
    const indexed = state.questions.map((question, index) => ({ question, index }));
    const groups = storyPoints.map((point) => ({ point, items: indexed.filter((item) => item.question.point === point.key) }));
    // Questions placed at a part the story no longer has (its pages changed).
    const lost = indexed.filter((item) => !pointOrder.has(item.question.point));
    if (lost.length) groups.push({ point: { key: '', label: 'A part no longer in this story' }, items: lost, lost: true });
    timeline.replaceChildren(...groups.map(({ point, items, lost: isLost }) => {
      const open = addingAt === point.key && !isLost;
      return el('li', { class: `quiz-timeline-point${items.length ? ' has-questions' : ''}${isLost ? ' is-lost' : ''}` }, [
        el('div', { class: 'quiz-timeline-row' }, [
          el('span', { class: 'quiz-timeline-dot', 'aria-hidden': 'true' }),
          el('div', { class: 'quiz-timeline-main' }, [
            el('span', { class: 'quiz-timeline-label', text: point.label }),
            el('span', { class: items.length ? 'quiz-timeline-count' : 'quiz-timeline-none', text: items.length ? `${items.length} question${items.length === 1 ? '' : 's'}` : 'No question' })
          ]),
          isLost ? null : el('button', {
            type: 'button', class: `quiz-timeline-add${open ? ' is-open' : ''}`, 'aria-expanded': open ? 'true' : 'false',
            'aria-label': `Add a question ${point.label.toLowerCase()}`,
            onclick: () => { addingAt = open ? '' : point.key; renderTimeline(); }
          }, [iconSvg(ICONS.plus), el('span', { text: 'Add a question' })])
        ]),
        open ? el('div', { class: 'quiz-type-picker', role: 'group', 'aria-label': 'Kind of question' }, Object.entries(TYPES).map(([type, label]) => el('button', {
          type: 'button', class: 'quiz-type-pick', text: label,
          onclick: () => { addingAt = ''; addQuestion(type, point.key); }
        }))) : null,
        items.length ? el('ol', { class: 'quiz-point-questions' }, items.map((item) => questionCard(item.question, item.index))) : null
      ]);
    }));
    timeline.querySelectorAll('textarea').forEach(autoGrow);
  }

  // The line under each question saying what counts as right.
  function answerKeyNote(question) {
    if (question.type === 'essay') {
      return el('span', { class: 'quiz-answer-key is-essay', text: `Worth ${question.points} point${question.points === 1 ? '' : 's'} · you grade each answer from Results` });
    }
    if (question.type === 'speak') {
      const filled = question.choices.filter((choice) => choice.label.trim());
      return el('span', {
        class: `quiz-answer-key${filled.length ? '' : ' is-missing'}`,
        text: filled.length ? `Students say: ${filled[0].label}${filled.length > 1 ? ` (+${filled.length - 1} more accepted)` : ''}` : 'Type what students should say'
      });
    }
    if (question.type === 'identification') {
      const filled = question.choices.filter((choice) => choice.label.trim());
      return el('span', {
        class: `quiz-answer-key${filled.length ? '' : ' is-missing'}`,
        text: filled.length
          ? `Correct answer: ${filled[0].label}${filled.length > 1 ? ` (+${filled.length - 1} more accepted)` : ''}`
          : 'Type the correct answer'
      });
    }
    const correct = question.choices.find((choice) => choice.correct);
    return el('span', {
      class: `quiz-answer-key${correct ? '' : ' is-missing'}`,
      text: correct ? `Correct answer: ${correct.label || `Option ${question.choices.indexOf(correct) + 1}`}` : 'Select the correct answer'
    });
  }
  function refreshKeyNote(question) {
    const note = dom.list.querySelector(`[data-uid="${question.uid}"] .quiz-answer-key`);
    note?.replaceWith(answerKeyNote(question));
    refreshLang(question);
  }

  // What a question is read aloud in: a "Say it" question's phrase, else
  // its prompt; automatic shows the language it heard in that text.
  const speechText = (question) => (question.type === 'speak' ? ((question.choices[0] && question.choices[0].label) || '') : question.prompt);
  const spokenLang = (question) => (window.KoobdSpeech ? window.KoobdSpeech.resolveLang(question.lang, speechText(question)) : 'en-US');
  function autoLabel(question) {
    if (!window.KoobdSpeech || !speechText(question).trim()) return LANGS.auto;
    return `Automatic · ${window.KoobdSpeech.langName(spokenLang(question))}`;
  }
  // The language picker's "Automatic" line, and (for "Say it") a note when
  // this device has no Filipino voice.
  function refreshLang(question) {
    const card = dom.list.querySelector(`[data-uid="${question.uid}"]`);
    if (!card) return;
    const auto = card.querySelector('.quiz-lang-select option[value="auto"]');
    if (auto) auto.textContent = autoLabel(question);
    const note = card.querySelector('.quiz-voice-note');
    if (note) {
      const text = window.KoobdSpeech ? window.KoobdSpeech.voiceNote(spokenLang(question)) : '';
      note.textContent = text ? VOICE_NOTE_SHORT : '';
      note.title = text;
      // Not needed once the teacher has recorded their own voice.
      note.hidden = !text || Boolean(question.audio);
    }
  }
  // Voices arrive a moment after the page loads.
  if (window.KoobdSpeech) window.KoobdSpeech.onVoicesChanged(() => state.questions.forEach(refreshLang));

  // Identification: the answers that count as right (the first is shown to
  // students as the correct answer); the student types theirs.
  function acceptedList(question, questionIndex) {
    const speak = question.type === 'speak';
    const list = el('ul', { class: 'quiz-accepted-list', 'aria-label': `${speak ? 'Phrases' : 'Accepted answers'} for question ${questionIndex + 1}` },
      question.choices.map((choice, choiceIndex) => {
        const row = el('li', { class: 'quiz-choice quiz-accepted' }, [
          el('span', { class: 'quiz-accepted-mark', 'aria-hidden': 'true', text: '✓' }),
          el('input', {
            type: 'text', class: 'quiz-choice-input quiz-accepted-input', maxlength: '500', autocomplete: 'off',
            placeholder: speak ? (choiceIndex === 0 ? 'Word or phrase to say' : 'Another way to say it that also counts') : (choiceIndex === 0 ? 'Correct answer' : 'Another accepted answer'),
            'aria-label': speak ? (choiceIndex === 0 ? 'Word or phrase to say' : `Also accepted ${choiceIndex + 1}`) : (choiceIndex === 0 ? 'Correct answer' : `Accepted answer ${choiceIndex + 1}`),
            value: choice.label, 'data-focus-key': `${choice.uid}:label`,
            oninput: (event) => { choice.label = event.target.value; markDirty(); clearError(questionIndex); refreshKeyNote(question); },
            onkeydown: (event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              if (choiceIndex === question.choices.length - 1 && question.choices.length < 10) addAccepted(question);
            }
          })
        ]);
        if (question.choices.length > 1) {
          row.append(el('button', {
            type: 'button', class: 'quiz-icon-btn quiz-remove-choice', 'aria-label': `Remove accepted answer ${choiceIndex + 1}`, title: 'Remove',
            onclick: () => { question.choices.splice(choiceIndex, 1); markDirty(); render(false); }
          }, [iconSvg(ICONS.close)]));
        }
        return row;
      }));
    // "Say it": hear the phrase as students will, in the question's language.
    const hear = speak && window.KoobdSpeech
      ? window.KoobdSpeech.listenButton(() => speechText(question), () => question.lang, { label: 'Hear it' })
      : null;
    const voiceNote = speak && window.KoobdSpeech ? window.KoobdSpeech.voiceNote(spokenLang(question)) : '';
    // "Say it" keeps to one tidy row: add an alternative on the left; hear it
    // and record your own voice on the right. The longer explanations are in
    // the buttons' tooltips.
    const wrap = el('div', { class: 'quiz-typed-body' }, [
      speak ? null : el('div', { class: 'quiz-typed-preview', 'aria-hidden': 'true', text: 'Students type their answer here' }),
      list,
      el('div', { class: `quiz-typed-actions${speak ? ' is-say' : ''}` }, [
        question.choices.length < 10 ? el('button', {
          type: 'button', class: 'quiz-add-choice', text: speak ? '+ Add alternative' : '+ Add another accepted answer',
          title: speak ? 'Another way of saying it that also counts' : null, onclick: () => addAccepted(question)
        }) : null,
        speak ? el('div', { class: 'quiz-say-tools' }, [hear, recorderBox(question)]) : null,
        speak ? null : el('span', { class: 'quiz-typed-hint', text: 'Checked without capitals, extra spaces or a final full stop.' })
      ]),
      speak ? el('p', { class: 'quiz-voice-note', role: 'note', hidden: !voiceNote || Boolean(question.audio), title: voiceNote, text: voiceNote ? VOICE_NOTE_SHORT : '' }) : null
    ]);
    return wrap;
  }
  // "Say it": the teacher records how the phrase is said, in their own voice.
  // Students then hear the recording (with the real accent) instead of the
  // computer voice. Up to 10 seconds; it uploads at once
  // (teacher_question_audio.php) and belongs to the question once saved.
  const RECORD_SECONDS = 10;
  // Shown when this computer has no Filipino voice (the full advice is its tooltip).
  const VOICE_NOTE_SHORT = 'No Filipino voice on this computer. Record your voice so students hear the real accent.';
  function recorderBox(question) {
    const box = el('div', { class: 'quiz-recorder', role: 'group', 'aria-label': 'Your recording of the phrase' });
    let recorder = null;
    let stream = null;
    let timer = 0;
    const message = (text, tone = '') => el('p', { class: `quiz-recorder-note${tone ? ` is-${tone}` : ''}`, role: tone === 'error' ? 'alert' : null, text });
    function show(note) {
      const parts = [];
      if (recorder && recorder.state === 'recording') {
        const started = Date.now();
        const clock = el('span', { class: 'quiz-recorder-clock', text: '0:00' });
        timer = window.setInterval(() => {
          const seconds = Math.floor((Date.now() - started) / 1000);
          clock.textContent = `0:${String(seconds).padStart(2, '0')}`;
          if (seconds >= RECORD_SECONDS) stopRecording();
        }, 250);
        parts.push(el('button', { type: 'button', class: 'quiz-recorder-btn is-stop', 'aria-label': 'Stop recording', onclick: stopRecording }, [el('span', { class: 'quiz-recorder-dot', 'aria-hidden': 'true' }), clock]));
      } else if (question.audio) {
        // Recorded: play it, record it again, or remove it.
        parts.push(
          el('button', {
            type: 'button', class: 'quiz-recorder-btn is-play', title: 'Students hear this recording',
            onclick: (event) => window.KoobdSpeech && window.KoobdSpeech.playRecording(question.audio, event.currentTarget)
          }, [iconSvg(ICONS.play), el('span', { text: 'Your voice' })]),
          el('button', { type: 'button', class: 'quiz-icon-btn', 'aria-label': 'Record again', title: 'Record again', onclick: startRecording }, [iconSvg(ICONS.redo)]),
          el('button', {
            type: 'button', class: 'quiz-icon-btn is-danger', 'aria-label': 'Remove your recording', title: 'Remove (students hear the computer voice)',
            onclick: () => { question.audio = null; markDirty(); show(); refreshLang(question); }
          }, [iconSvg(ICONS.close)])
        );
      } else {
        parts.push(el('button', {
          type: 'button', class: 'quiz-recorder-btn', title: 'Optional: record yourself saying it, so students hear the real accent',
          onclick: startRecording
        }, [iconSvg(ICONS.mic), el('span', { text: 'Record' })]));
      }
      box.replaceChildren(el('div', { class: 'quiz-recorder-row' }, parts));
      if (note) box.append(note);
    }
    async function startRecording() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        show(message('Recording needs localhost or the https address.', 'error'));
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (problem) {
        show(message('Microphone blocked. Allow it for KoobD and try again.', 'error'));
        return;
      }
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((item) => MediaRecorder.isTypeSupported(item)) || '';
      const chunks = [];
      recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      recorder.addEventListener('dataavailable', (event) => { if (event.data && event.data.size) chunks.push(event.data); });
      recorder.addEventListener('stop', () => upload(new Blob(chunks, { type: (recorder && recorder.mimeType) || type || 'audio/webm' })));
      recorder.start();
      show();
    }
    function stopRecording() {
      window.clearInterval(timer);
      if (recorder && recorder.state === 'recording') recorder.stop();
      if (stream) stream.getTracks().forEach((track) => track.stop());
    }
    async function upload(blob) {
      recorder = null;
      if (blob.size < 1000) { show(message('Nothing was heard. Try again.', 'error')); return; }
      show(message('Saving…'));
      const form = new FormData();
      form.append('audio', blob, `recording.${/mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm'}`);
      try {
        const response = await fetch('teacher_question_audio.php', { method: 'POST', credentials: 'same-origin', headers: { 'X-Koobd-Request': 'upload' }, body: form });
        const result = await response.json().catch(() => ({ success: false }));
        if (!result.success) throw new Error(result.message || 'The recording could not be saved.');
        question.audio = result.url;
        refreshLang(question);
        markDirty();
        show(message('Recorded. Save the activity to keep it.', 'ok'));
      } catch (problem) {
        show(message(`${problem.message} Try again.`, 'error'));
      }
    }
    show();
    return box;
  }

  function addAccepted(question) {
    question.choices.push(acceptedAnswer());
    markDirty();
    render(false);
    const inputs = dom.list.querySelectorAll(`[data-uid="${question.uid}"] .quiz-accepted-input`);
    inputs[inputs.length - 1]?.focus();
  }

  // Essay: what students see (a box to write in) and the points it is worth.
  function essayBody(question, questionIndex) {
    if (storyMode) {
      return el('div', { class: 'quiz-typed-body' }, [
        el('div', { class: 'quiz-typed-preview is-essay', 'aria-hidden': 'true', text: 'Students write their answer here in their own words' })
      ]);
    }
    return el('div', { class: 'quiz-typed-body' }, [
      el('div', { class: 'quiz-typed-preview is-essay', 'aria-hidden': 'true', text: 'Students write their answer here in their own words' }),
      el('label', { class: 'quiz-points-field' }, [
        el('span', { text: 'Points' }),
        el('input', {
          type: 'number', min: '1', max: '100', step: '1', inputmode: 'numeric', value: String(question.points),
          'aria-label': `Points for question ${questionIndex + 1}`, 'data-focus-key': `${question.uid}:points`,
          oninput: (event) => {
            const value = Math.round(Number(event.target.value));
            if (!Number.isFinite(value) || value < 1) return;
            question.points = Math.min(100, value);
            markDirty();
            refreshKeyNote(question);
          },
          onblur: (event) => { event.target.value = String(question.points); }
        })
      ])
    ]);
  }

  function toolButton(icon, label, disabled, onClick) {
    return el('button', { type: 'button', class: 'quiz-icon-btn', 'aria-label': label, title: label, disabled, onclick: onClick }, [iconSvg(ICONS[icon])]);
  }

  // --- Question operations --------------------------------------------------------
  function changeType(question, type) {
    if (question.type === type) return;
    const from = question.type;
    const right = question.choices.find((choice) => choice.correct);
    if (type === 'true_false') {
      const rightIsTrue = !right || !/^false$/i.test(right.label.trim());
      question.choices = trueFalseChoices(rightIsTrue, from === 'multiple_choice' ? question.choices : []);
    } else if (isPhraseList(type)) {
      // The correct option (if any) becomes the accepted answer (or the phrase to say).
      const keep = isPhraseList(from) ? question.choices : (right && right.label.trim() && from === 'multiple_choice' ? [right] : []);
      question.choices = keep.length ? keep.map((choice) => acceptedAnswer(choice.label, isPhraseList(from) ? choice.id : 0)) : [acceptedAnswer()];
    } else if (type === 'essay') {
      question.choices = [];
      question.points = question.points > 1 ? question.points : ESSAY_POINTS;
    } else if (isPhraseList(from)) {
      // Accepted answers become options; the first one is the correct answer.
      question.choices = question.choices.filter((choice) => choice.label.trim()).map((choice, index) => toChoice({ label: choice.label, correct: index === 0 }));
      while (question.choices.length < 2) question.choices.push(toChoice({ label: '' }));
    } else if (from === 'essay') {
      question.choices = [toChoice({ label: '' }), toChoice({ label: '' })];
    } else {
      // True and False become ordinary options the teacher can edit.
      question.choices = question.choices.map((choice) => ({ ...choice, uid: uid() }));
    }
    if (type !== 'essay') question.points = 1;
    question.type = type;
    markDirty();
    render();
  }
  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= state.questions.length) return;
    [state.questions[index], state.questions[target]] = [state.questions[target], state.questions[index]];
    errorMarks = new Map();
    markDirty();
    render();
  }
  function duplicate(index) {
    const source = state.questions[index];
    const copy = {
      uid: uid(), id: 0, type: source.type, prompt: source.prompt, points: source.points, point: source.point, optional: source.optional,
      choices: source.choices.map((choice) => ({ uid: uid(), id: 0, label: choice.label, correct: choice.correct }))
    };
    state.questions.splice(index + 1, 0, copy);
    focusedUid = copy.uid;
    errorMarks = new Map();
    markDirty();
    render(false);
    dom.list.querySelector(`[data-uid="${copy.uid}"] .quiz-prompt-input`)?.focus();
  }
  async function removeQuestion(index) {
    const question = state.questions[index];
    if ((question.prompt || question.choices.some((choice) => choice.label && question.type !== 'true_false'))
        && !(await confirmDialog('Delete this question?', 'The question and its answer choices will be removed when you save.', 'Delete'))) return;
    state.questions.splice(index, 1);
    if (!state.questions.length && !storyMode) state.questions.push(blankQuestion('multiple_choice'));
    errorMarks = new Map();
    markDirty();
    render(false);
  }
  function addQuestion(type, point) {
    const question = blankQuestion(type, point || lastPoint);
    question.collapsed = false;
    if (storyMode) {
      // Into story order: after the questions asked at the same point or earlier.
      lastPoint = question.point;
      const order = pointOrder.get(question.point) ?? Infinity;
      let at = state.questions.length;
      for (let index = state.questions.length - 1; index >= 0; index -= 1) {
        if ((pointOrder.get(state.questions[index].point) ?? Infinity) <= order) { at = index + 1; break; }
        at = index;
      }
      state.questions.splice(at, 0, question);
    } else {
      state.questions.push(question);
    }
    focusedUid = question.uid;
    markDirty();
    render(false);
    const card = dom.list.querySelector(`[data-uid="${question.uid}"]`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card?.querySelector('.quiz-prompt-input')?.focus({ preventScroll: true });
  }

  // --- Errors ---------------------------------------------------------------------
  function clearError(index, card) {
    if (!errorMarks.has(index)) return;
    errorMarks.delete(index);
    const node = card || dom.list.querySelectorAll('.quiz-question-card')[index];
    node?.classList.remove('has-error');
    node?.querySelector('.quiz-question-error')?.remove();
    if (!errorMarks.size) dom.errors.hidden = true;
  }
  function showErrors(errors) {
    errorMarks = new Map();
    let titleError = '';
    errors.forEach((error) => {
      if (Number.isInteger(error.question) && !errorMarks.has(error.question)) errorMarks.set(error.question, error.message);
      if (error.field === 'title') titleError = error.message;
    });
    dom.title.classList.toggle('has-error', Boolean(titleError));
    dom.errors.hidden = false;
    dom.errors.textContent = errors.length === 1 ? errors[0].message : `${errors.length} things need fixing before publishing: ${errors.map((error) => error.message).join(' ')}`;
    render(false);
    const first = titleError ? dom.title : dom.list.querySelector('.has-error');
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  // The same checks as the server, so the teacher hears about them at once.
  function publishErrors() {
    const errors = [];
    if (!state.title.trim() && !storyMode) errors.push({ field: 'title', message: 'Give the activity a title.' });
    state.questions.forEach((question, index) => {
      const n = index + 1;
      if (!question.prompt.trim()) errors.push({ question: index, message: `Question ${n} needs a question.` });
      if (storyMode && !pointOrder.has(question.point)) errors.push({ question: index, message: `Choose where in the story question ${n} is asked.` });
      if (question.type === 'essay') return;
      if (question.type === 'identification') {
        if (!question.choices.some((choice) => choice.label.trim())) errors.push({ question: index, message: `Type the correct answer for question ${n}.` });
        return;
      }
      if (question.type === 'speak') {
        if (!question.choices.some((choice) => choice.label.trim())) errors.push({ question: index, message: `Type the word or phrase to say for question ${n}.` });
        return;
      }
      const filled = question.choices.filter((choice) => choice.label.trim());
      if (filled.length < 2) errors.push({ question: index, message: `Question ${n} needs at least two answer choices.` });
      if (!question.choices.some((choice) => choice.correct && choice.label.trim())) errors.push({ question: index, message: `Choose the correct answer for question ${n}.` });
    });
    return errors;
  }

  // --- Saving ----------------------------------------------------------------------
  function payload(publish) {
    return {
      action: 'save', classroomId: data.classroomId, activityId: state.id || 0, publish, storyMode,
      title: state.title, description: state.description, instructions: state.instructions,
      dueDate: state.dueDate, showAnswers: state.showAnswers, shuffle: state.shuffle,
      questions: state.questions.map((question) => ({
        id: question.id, type: question.type, prompt: question.prompt, points: question.points, point: question.point, optional: question.optional, lang: question.lang, audio: question.audio,
        choices: question.choices.map((choice) => ({ id: choice.id, label: choice.label, correct: choice.correct }))
      }))
    };
  }

  async function save(publish) {
    if (saving) return false;
    if (publish === true || (publish === null && state.status === 'published')) {
      const errors = publishErrors();
      if (errors.length) { showErrors(errors); return false; }
    }
    saving = true;
    [dom.publish, dom.saveDraft].forEach((button) => { button.disabled = true; });
    dom.saveState.textContent = 'Saving…';
    dom.saveState.dataset.state = 'saving';
    try {
      const response = await fetch('teacher_quiz_save.php', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload(publish))
      });
      const result = await response.json().catch(() => ({ success: false, message: 'The server did not answer.' }));
      if (!result.success) {
        if (Array.isArray(result.errors) && result.errors.length) showErrors(result.errors);
        else { dom.errors.hidden = false; dom.errors.textContent = result.message || 'The activity could not be saved.'; }
        dom.saveState.textContent = 'Not saved';
        dom.saveState.dataset.state = 'error';
        return false;
      }
      const isNew = !state.id;
      state.id = result.activityId;
      const wasCollapsed = state.questions.map((question) => question.collapsed);
      state.questions = (result.questions || []).map(toQuestion);
      state.questions.forEach((question, index) => { if (index < wasCollapsed.length) question.collapsed = wasCollapsed[index]; });
      if (!state.questions.length && !storyMode) state.questions.push(blankQuestion('multiple_choice'));
      focusedUid = '';
      errorMarks = new Map();
      dom.errors.hidden = true;
      dom.title.classList.remove('has-error');
      setStatus(result.status);
      render(false);
      dirty = false;
      dom.saveState.textContent = storyMode ? 'Questions saved' : (result.status === 'published' ? 'Published · saved' : 'Draft saved');
      dom.saveState.dataset.state = 'saved';
      if (isNew) history.replaceState(null, '', `teacher_quiz_editor.php?activity=${state.id}`);
      return true;
    } catch (error) {
      dom.errors.hidden = false;
      dom.errors.textContent = 'The activity could not be saved. Check your connection and try again.';
      dom.saveState.textContent = 'Not saved';
      dom.saveState.dataset.state = 'error';
      return false;
    } finally {
      saving = false;
      [dom.publish, dom.saveDraft].forEach((button) => { button.disabled = false; });
    }
  }

  // --- Confirm dialog -----------------------------------------------------------------
  function confirmDialog(title, text, yesLabel) {
    return new Promise((resolve) => {
      $('quizConfirmTitle').textContent = title;
      $('quizConfirmText').textContent = text;
      const yes = dom.confirm.querySelector('[data-answer="yes"]');
      yes.textContent = yesLabel || 'OK';
      dom.confirm.hidden = false;
      yes.focus();
      const finish = (answer) => {
        dom.confirm.hidden = true;
        dom.confirm.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey);
        resolve(answer);
      };
      const onClick = (event) => {
        if (event.target === dom.confirm) finish(false);
        const button = event.target.closest('[data-answer]');
        if (button) finish(button.dataset.answer === 'yes');
      };
      const onKey = (event) => { if (event.key === 'Escape') finish(false); };
      dom.confirm.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey);
    });
  }

  // --- Header fields -----------------------------------------------------------------
  dom.title.value = state.title;
  dom.description.value = state.description;
  dom.instructions.value = state.instructions;
  dom.due.value = state.dueDate;
  dom.showAnswers.checked = state.showAnswers;
  dom.shuffle.checked = state.shuffle;
  [[dom.title, 'title'], [dom.description, 'description'], [dom.instructions, 'instructions']].forEach(([input, key]) => {
    input.addEventListener('input', () => {
      state[key] = input.value;
      if (input.tagName === 'TEXTAREA') autoGrow(input);
      if (key === 'title') input.classList.remove('has-error');
      markDirty();
    });
  });
  dom.due.addEventListener('change', () => { state.dueDate = dom.due.value; markDirty(); });
  // The title wraps onto more lines on a narrow screen but stays one line of text.
  dom.title.addEventListener('keydown', (event) => { if (event.key === 'Enter') event.preventDefault(); });
  dom.title.addEventListener('input', () => {
    if (/[\r\n]/.test(dom.title.value)) { dom.title.value = dom.title.value.replace(/[\r\n]+/g, ' '); state.title = dom.title.value; }
  });
  dom.showAnswers.addEventListener('change', () => { state.showAnswers = dom.showAnswers.checked; markDirty(); });
  dom.shuffle.addEventListener('change', () => { state.shuffle = dom.shuffle.checked; markDirty(); });

  // --- Buttons ---------------------------------------------------------------------------
  $('quizAddMc').addEventListener('click', () => addQuestion('multiple_choice'));
  $('quizAddTf').addEventListener('click', () => addQuestion('true_false'));
  $('quizAddId').addEventListener('click', () => addQuestion('identification'));
  $('quizAddEssay').addEventListener('click', () => addQuestion('essay'));
  $('quizAddSpeak')?.addEventListener('click', () => addQuestion('speak'));
  dom.saveDraft.addEventListener('click', () => save(state.status === 'published' ? null : false));
  dom.publish.addEventListener('click', () => save(state.status === 'published' ? null : true));
  dom.unpublish.addEventListener('click', async () => {
    closeMore();
    if (await confirmDialog('Move back to drafts?', 'Students will no longer see this activity until you publish it again. Their submissions are kept.', 'Move to drafts')) save(false);
  });
  dom.del.addEventListener('click', async () => {
    closeMore();
    if (!state.id) return;
    if (!(await confirmDialog('Delete this activity?', 'Its questions and every student\'s answers and score are deleted. This cannot be undone.', 'Delete'))) return;
    const response = await fetch('teacher_quiz_save.php', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', activityId: state.id })
    });
    const result = await response.json().catch(() => ({}));
    if (result.success) {
      dirty = false;
      window.location.href = result.redirect || data.roomHref;
    } else {
      dom.errors.hidden = false;
      dom.errors.textContent = result.message || 'The activity could not be deleted.';
    }
  });
  dom.preview.addEventListener('click', async () => {
    // Preview shows what students will see; unsaved changes are saved first
    // (keeping the activity's current status).
    const tab = window.open('', '_blank');
    if (dirty || !state.id) {
      const ok = await save(state.status === 'published' ? null : false);
      if (!ok) { tab?.close(); return; }
    }
    const url = storyMode ? data.story.previewHref : `quiz_take.php?activity=${state.id}&preview=1`;
    if (tab) tab.location.href = url; else window.location.href = url;
  });

  function closeMore() {
    dom.moreMenu.hidden = true;
    dom.moreBtn.setAttribute('aria-expanded', 'false');
  }
  dom.moreBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = dom.moreMenu.hidden;
    dom.moreMenu.hidden = !open;
    dom.moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click', (event) => { if (!event.target.closest('.quiz-more')) closeMore(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMore();
    // Ctrl/Cmd+S saves, as in most editors.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save(state.status === 'published' ? null : false);
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  setStatus(state.status);
  showSubmissionsBanner();
  render(false);
  [dom.title, dom.description, dom.instructions].forEach(autoGrow);
  window.addEventListener('resize', () => [dom.title, dom.description, dom.instructions, ...dom.list.querySelectorAll('textarea')].forEach(autoGrow));
  if (!state.id) dom.title.focus();
})();
