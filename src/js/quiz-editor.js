// The question activity editor (teacher_quiz_editor.php). Questions are cards:
// a prompt, a type (multiple choice or true/false), answer choices with one
// marked correct, and buttons to move, duplicate and delete them. Nothing is
// saved until the teacher saves a draft or publishes (teacher_quiz_save.php);
// leaving with unsaved changes asks first.
(function () {
  const data = window.KOOBD_QUIZ_EDITOR || {};
  const $ = (id) => document.getElementById(id);
  const dom = {
    title: $('quizTitle'), description: $('quizDescription'), instructions: $('quizInstructions'),
    due: $('quizDue'), showAnswers: $('quizShowAnswers'), list: $('quizQuestions'),
    status: $('quizStatus'), saveState: $('quizSaveState'), errors: $('quizErrors'),
    banner: $('quizSubmissionsBanner'), publish: $('quizPublish'), saveDraft: $('quizSaveDraft'),
    preview: $('quizPreview'), moreBtn: $('quizMoreBtn'), moreMenu: $('quizMoreMenu'),
    unpublish: $('quizUnpublish'), results: $('quizResultsLink'), del: $('quizDelete'),
    confirm: $('quizConfirm')
  };

  let uidCounter = 0;
  const uid = () => `q${++uidCounter}`;
  const toChoice = (choice) => ({ uid: uid(), id: choice.id || 0, label: choice.label || '', correct: Boolean(choice.correct) });
  const toQuestion = (question) => ({
    uid: uid(),
    id: question.id || 0,
    type: question.type === 'true_false' ? 'true_false' : 'multiple_choice',
    prompt: question.prompt || '',
    choices: (question.choices || []).map(toChoice)
  });
  const trueFalseChoices = (rightIsTrue = true, keep = []) => [
    { uid: uid(), id: keep[0]?.id || 0, label: 'True', correct: rightIsTrue },
    { uid: uid(), id: keep[1]?.id || 0, label: 'False', correct: !rightIsTrue }
  ];
  const blankQuestion = (type) => ({
    uid: uid(), id: 0, type, prompt: '',
    choices: type === 'true_false'
      ? trueFalseChoices(true)
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
    questions: (data.questions || []).map(toQuestion)
  };
  if (!state.questions.length) state.questions.push(blankQuestion('multiple_choice'));

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
    close: '<path d="M6 6l12 12M18 6L6 18"/>'
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
      dom.banner.textContent = `${count} student${count === 1 ? ' has' : 's have'} already submitted. If you change questions or correct answers, their scores are checked again.`;
    }
  }

  // --- Rendering ---------------------------------------------------------------
  function render(keepFocus = true) {
    const active = document.activeElement;
    const focusKey = keepFocus && active && active.dataset ? active.dataset.focusKey : null;
    dom.list.replaceChildren(...state.questions.map(questionCard));
    if (focusKey) {
      const target = dom.list.querySelector(`[data-focus-key="${focusKey}"]`);
      if (target) target.focus({ preventScroll: true });
    }
    dom.list.querySelectorAll('textarea').forEach(autoGrow);
  }

  function questionCard(question, index) {
    const total = state.questions.length;
    const error = errorMarks.get(index);
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
      placeholder: question.type === 'true_false' ? 'Statement (true or false?)' : 'Question',
      'aria-label': `Question ${index + 1}`, 'data-focus-key': `${question.uid}:prompt`,
      value: question.prompt,
      oninput: (event) => { question.prompt = event.target.value; autoGrow(event.target); markDirty(); clearError(index, card); }
    });
    const typeSelect = el('select', {
      class: 'quiz-type-select', 'aria-label': `Question ${index + 1} type`, 'data-focus-key': `${question.uid}:type`,
      onchange: (event) => changeType(question, event.target.value)
    }, [
      el('option', { value: 'multiple_choice', text: 'Multiple choice', selected: question.type === 'multiple_choice' }),
      el('option', { value: 'true_false', text: 'True or False', selected: question.type === 'true_false' })
    ]);
    typeSelect.value = question.type;

    const head = el('div', { class: 'quiz-question-head' }, [
      el('span', { class: 'quiz-question-number', text: `${index + 1}` }),
      prompt,
      typeSelect
    ]);

    const choices = el('ul', { class: 'quiz-choice-list', role: 'radiogroup', 'aria-label': `Correct answer for question ${index + 1}` },
      question.choices.map((choice, choiceIndex) => choiceRow(question, choice, choiceIndex, index)));

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
    const correct = question.choices.find((choice) => choice.correct);
    footerParts.push(el('span', {
      class: `quiz-answer-key${correct ? '' : ' is-missing'}`,
      text: correct ? `Correct answer: ${correct.label || `Option ${question.choices.indexOf(correct) + 1}`}` : 'Select the correct answer'
    }));

    const tools = el('div', { class: 'quiz-question-tools' }, [
      toolButton('up', 'Move up', index === 0, () => move(index, -1)),
      toolButton('down', 'Move down', index === total - 1, () => move(index, 1)),
      toolButton('copy', 'Duplicate', false, () => duplicate(index)),
      toolButton('trash', 'Delete question', false, () => removeQuestion(index))
    ]);

    card.append(head, choices, el('div', { class: 'quiz-question-foot' }, [el('div', { class: 'quiz-question-foot-main' }, footerParts), tools]));
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

  function toolButton(icon, label, disabled, onClick) {
    return el('button', { type: 'button', class: 'quiz-icon-btn', 'aria-label': label, title: label, disabled, onclick: onClick }, [iconSvg(ICONS[icon])]);
  }

  // --- Question operations --------------------------------------------------------
  function changeType(question, type) {
    if (question.type === type) return;
    if (type === 'true_false') {
      const right = question.choices.find((choice) => choice.correct);
      const rightIsTrue = !right || !/^false$/i.test(right.label.trim());
      question.choices = trueFalseChoices(rightIsTrue, question.choices);
    } else {
      // True and False become ordinary options the teacher can edit.
      question.choices = question.choices.map((choice) => ({ ...choice, uid: uid() }));
    }
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
      uid: uid(), id: 0, type: source.type, prompt: source.prompt,
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
    if ((question.prompt || question.choices.some((choice) => choice.label && question.type === 'multiple_choice'))
        && !(await confirmDialog('Delete this question?', 'The question and its answer choices will be removed when you save.', 'Delete'))) return;
    state.questions.splice(index, 1);
    if (!state.questions.length) state.questions.push(blankQuestion('multiple_choice'));
    errorMarks = new Map();
    markDirty();
    render(false);
  }
  function addQuestion(type) {
    const question = blankQuestion(type);
    state.questions.push(question);
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
    const node = card || dom.list.children[index];
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
    if (!state.title.trim()) errors.push({ field: 'title', message: 'Give the activity a title.' });
    state.questions.forEach((question, index) => {
      const n = index + 1;
      if (!question.prompt.trim()) errors.push({ question: index, message: `Question ${n} needs a question.` });
      const filled = question.choices.filter((choice) => choice.label.trim());
      if (filled.length < 2) errors.push({ question: index, message: `Question ${n} needs at least two answer choices.` });
      if (!question.choices.some((choice) => choice.correct && choice.label.trim())) errors.push({ question: index, message: `Choose the correct answer for question ${n}.` });
    });
    return errors;
  }

  // --- Saving ----------------------------------------------------------------------
  function payload(publish) {
    return {
      action: 'save', classroomId: data.classroomId, activityId: state.id || 0, publish,
      title: state.title, description: state.description, instructions: state.instructions,
      dueDate: state.dueDate, showAnswers: state.showAnswers,
      questions: state.questions.map((question) => ({
        id: question.id, type: question.type, prompt: question.prompt,
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
      state.questions = (result.questions || []).map(toQuestion);
      if (!state.questions.length) state.questions.push(blankQuestion('multiple_choice'));
      focusedUid = '';
      errorMarks = new Map();
      dom.errors.hidden = true;
      dom.title.classList.remove('has-error');
      setStatus(result.status);
      render(false);
      dirty = false;
      dom.saveState.textContent = result.status === 'published' ? 'Published · saved' : 'Draft saved';
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

  // --- Buttons ---------------------------------------------------------------------------
  $('quizAddMc').addEventListener('click', () => addQuestion('multiple_choice'));
  $('quizAddTf').addEventListener('click', () => addQuestion('true_false'));
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
    const url = `quiz_take.php?activity=${state.id}&preview=1`;
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
