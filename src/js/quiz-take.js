// Answering a question activity (quiz_take.php): a Start card, then one
// question at a time (Previous / Next, and numbered dots to jump), then a
// check of every answer and Submit. The server checks the answers
// (quiz_submit.php) and the result replaces the questions. Answers given so
// far are kept for this browser session, so a reload loses nothing.
(function () {
  const data = window.KOOBD_QUIZ || {};
  const app = document.getElementById('quizApp');
  if (!app) return;
  const questions = Array.isArray(data.questions) ? data.questions : [];
  const draftKey = `koobd-quiz:${data.userId}:${data.activityId}`;
  const answers = {};
  let step = -1; // -1: start, 0..n-1: a question, n: check answers
  let submitting = false;

  try {
    const saved = JSON.parse(window.sessionStorage.getItem(draftKey) || 'null');
    if (saved && typeof saved === 'object' && !data.preview) {
      Object.entries(saved).forEach(([questionId, choiceId]) => { answers[questionId] = Number(choiceId); });
    }
  } catch (error) {
    // Session storage can be unavailable; answers still work in memory.
  }
  function keepDraft() {
    if (data.preview) return;
    try { window.sessionStorage.setItem(draftKey, JSON.stringify(answers)); } catch (error) { /* in memory only */ }
  }
  function clearDraft() {
    try { window.sessionStorage.removeItem(draftKey); } catch (error) { /* nothing kept */ }
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key === 'checked') node.checked = Boolean(value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    [].concat(children).forEach((child) => child && node.append(child));
    return node;
  }
  const answeredCount = () => questions.filter((question) => answers[question.id]).length;
  const typeLabel = (question) => (question.type === 'true_false' ? 'True or False' : 'Multiple choice');

  // While a student is answering, the activity's header shrinks to its title
  // (and, on phones and tablets, the instructions fold away; they can open
  // them again), so each question and its buttons fit on the screen.
  const instructions = document.getElementById('quizInstructions');
  const compactScreen = window.matchMedia('(max-width: 900px)');
  function setAnswering(answering) {
    document.body.classList.toggle('is-answering', answering);
    if (instructions && answering && compactScreen.matches) instructions.open = false;
    if (instructions && !answering) instructions.open = true;
  }

  function show(nextStep, focusSelector) {
    step = nextStep;
    setAnswering(step >= 0 && questions.length > 0);
    render();
    app.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const target = app.querySelector(focusSelector || 'h2');
    if (target) {
      if (!target.hasAttribute('tabindex') && target.tagName === 'H2') target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  }

  // --- Screens ---------------------------------------------------------------------
  function render() {
    if (!questions.length) {
      app.replaceChildren(el('section', { class: 'quiz-card quiz-empty' }, [
        el('h2', { text: 'No questions yet' }),
        el('p', { text: data.preview ? 'Add questions in the editor to see them here.' : 'Your teacher has not added any questions to this activity yet.' })
      ]));
      return;
    }
    if (step < 0) return renderStart();
    if (step >= questions.length) return renderCheck();
    return renderQuestion(step);
  }

  function renderStart() {
    const answered = answeredCount();
    app.replaceChildren(el('section', { class: 'quiz-card quiz-start' }, [
      el('h2', { text: answered ? 'Continue where you left off' : 'Ready to begin?' }),
      el('p', { text: answered
        ? `You have answered ${answered} of ${questions.length} questions. Your answers are kept until you submit.`
        : `There ${questions.length === 1 ? 'is 1 question' : `are ${questions.length} questions`}. Choose one answer for each, then submit.` }),
      el('button', { type: 'button', class: 'quiz-btn quiz-btn-primary quiz-btn-lg', text: answered ? 'Continue' : 'Start', onclick: () => {
        const firstOpen = questions.findIndex((question) => !answers[question.id]);
        show(answered && firstOpen >= 0 ? firstOpen : 0, '.quiz-option input:checked, .quiz-option input');
      } })
    ]));
  }

  function dotsNav() {
    return el('nav', { class: 'quiz-dots', 'aria-label': 'Questions' }, questions.map((question, index) => el('button', {
      type: 'button',
      class: `quiz-dot${answers[question.id] ? ' is-answered' : ''}${index === step ? ' is-current' : ''}`,
      'aria-label': `Question ${index + 1}${answers[question.id] ? ', answered' : ', not answered'}`,
      'aria-current': index === step ? 'step' : null,
      text: String(index + 1),
      onclick: () => show(index, '.quiz-option input:checked, .quiz-option input')
    })).concat(el('button', {
      type: 'button', class: `quiz-dot quiz-dot-check${step === questions.length ? ' is-current' : ''}`,
      'aria-label': 'Check answers and submit', text: '✓', onclick: () => show(questions.length)
    })));
  }

  function progressBar() {
    const percent = Math.round((answeredCount() / questions.length) * 100);
    return el('div', { class: 'quiz-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(questions.length), 'aria-valuenow': String(answeredCount()), 'aria-label': 'Questions answered' }, [
      el('span', { style: `width:${percent}%` })
    ]);
  }

  function renderQuestion(index) {
    const question = questions[index];
    const name = `question-${question.id}`;
    const options = el('div', { class: 'quiz-options', role: 'radiogroup', 'aria-labelledby': `${name}-prompt` },
      question.choices.map((choice, choiceIndex) => el('label', { class: `quiz-option${answers[question.id] === choice.id ? ' is-selected' : ''}` }, [
        el('input', {
          type: 'radio', name, value: String(choice.id), checked: answers[question.id] === choice.id,
          onchange: () => {
            answers[question.id] = choice.id;
            keepDraft();
            options.querySelectorAll('.quiz-option').forEach((node) => node.classList.toggle('is-selected', node.querySelector('input').checked));
            app.querySelector('.quiz-dots')?.replaceWith(dotsNav());
            app.querySelector('.quiz-progress')?.replaceWith(progressBar());
          }
        }),
        el('span', { class: 'quiz-option-letter', 'aria-hidden': 'true', text: question.type === 'true_false' ? (choiceIndex === 0 ? 'T' : 'F') : String.fromCharCode(65 + choiceIndex) }),
        el('span', { class: 'quiz-option-label', text: choice.label })
      ])));
    const last = index === questions.length - 1;
    app.replaceChildren(
      progressBar(),
      dotsNav(),
      el('section', { class: 'quiz-card quiz-question-view' }, [
        el('div', { class: 'quiz-question-kicker', text: `Question ${index + 1} of ${questions.length} · ${typeLabel(question)}` }),
        el('h2', { id: `${name}-prompt`, class: 'quiz-question-prompt', text: question.prompt }),
        options,
        el('div', { class: 'quiz-nav' }, [
          el('button', { type: 'button', class: 'quiz-btn quiz-btn-ghost', text: 'Previous', disabled: index === 0, onclick: () => show(index - 1, '.quiz-option input:checked, .quiz-option input') }),
          el('button', { type: 'button', class: 'quiz-btn quiz-btn-primary', text: last ? 'Check answers' : 'Next', onclick: () => show(index + 1, last ? 'h2' : '.quiz-option input:checked, .quiz-option input') })
        ])
      ])
    );
  }

  function renderCheck() {
    const missing = questions.filter((question) => !answers[question.id]).length;
    const list = el('ol', { class: 'quiz-check-list' }, questions.map((question, index) => {
      const choice = question.choices.find((item) => item.id === answers[question.id]);
      return el('li', { class: choice ? '' : 'is-missing' }, [
        el('button', { type: 'button', class: 'quiz-check-item', onclick: () => show(index, '.quiz-option input:checked, .quiz-option input') }, [
          el('span', { class: 'quiz-check-q', text: question.prompt }),
          el('span', { class: 'quiz-check-a', text: choice ? choice.label : 'Not answered' })
        ])
      ]);
    }));
    const submit = el('button', { type: 'button', class: 'quiz-btn quiz-btn-primary quiz-btn-lg', id: 'quizSubmit', text: data.preview ? 'Submit (preview)' : 'Submit', onclick: () => submitAnswers(missing) });
    app.replaceChildren(
      progressBar(),
      dotsNav(),
      el('section', { class: 'quiz-card quiz-check' }, [
        el('h2', { text: 'Check your answers' }),
        el('p', { class: missing ? 'quiz-warning' : '', text: missing
          ? `${missing} question${missing === 1 ? ' is' : 's are'} not answered yet. You can still submit, but unanswered questions count as wrong.`
          : 'Every question is answered. Tap a question to change your answer, or submit when you are ready. You can only submit once.' }),
        list,
        el('div', { class: 'quiz-nav' }, [
          el('button', { type: 'button', class: 'quiz-btn quiz-btn-ghost', text: 'Back', onclick: () => show(questions.length - 1) }),
          submit
        ]),
        el('p', { class: 'quiz-submit-error', id: 'quizSubmitError', role: 'alert', hidden: true })
      ])
    );
  }

  // --- Submitting ---------------------------------------------------------------------
  async function submitAnswers(missing) {
    if (submitting) return;
    const button = document.getElementById('quizSubmit');
    if (missing && button && button.dataset.confirmed !== 'yes') {
      // A second tap confirms submitting with questions left blank.
      button.dataset.confirmed = 'yes';
      button.textContent = `Submit with ${missing} unanswered`;
      button.classList.add('is-warning');
      return;
    }
    if (data.preview) {
      renderResult(previewReview(), true);
      return;
    }
    submitting = true;
    const error = document.getElementById('quizSubmitError');
    button.disabled = true;
    button.textContent = 'Submitting…';
    try {
      const response = await fetch('quiz_submit.php', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId: data.activityId, answers })
      });
      const result = await response.json().catch(() => ({ success: false }));
      if (!result.success || !result.review) throw new Error(result.message || 'Your answers could not be submitted.');
      clearDraft();
      renderResult(result.review, !result.alreadySubmitted);
    } catch (problem) {
      submitting = false;
      button.disabled = false;
      button.textContent = 'Try again';
      error.hidden = false;
      error.textContent = `${problem.message || 'Your answers could not be submitted.'} Your answers are still here.`;
    }
  }

  // The teacher's preview checks against the key in the page (nothing is saved).
  function previewReview() {
    let score = 0;
    const reviewed = questions.map((question) => {
      const picked = answers[question.id] || null;
      const right = question.choices.find((choice) => choice.correct);
      const isCorrect = Boolean(right && picked === right.id);
      score += isCorrect ? 1 : 0;
      return { ...question, picked, isCorrect };
    });
    return { score, total: questions.length, percent: Math.round((score / questions.length) * 100), showsKey: true, questions: reviewed, preview: true };
  }

  // --- The result and the review of answers ------------------------------------------
  function renderResult(review, justSubmitted) {
    setAnswering(false);
    const items = review.questions.map((question, index) => {
      const pickedChoice = question.choices.find((choice) => choice.id === question.picked);
      const verdict = review.showsKey ? (question.isCorrect ? 'is-right' : 'is-wrong') : '';
      return el('li', { class: `quiz-review-item ${verdict}` }, [
        el('div', { class: 'quiz-review-head' }, [
          el('span', { class: 'quiz-review-number', text: String(index + 1) }),
          el('span', { class: 'quiz-review-prompt', text: question.prompt }),
          review.showsKey ? el('span', { class: 'quiz-review-badge', text: question.isCorrect ? 'Correct' : 'Incorrect' }) : null
        ]),
        el('ul', { class: 'quiz-review-choices' }, question.choices.map((choice) => {
          const picked = choice.id === question.picked;
          const isRight = review.showsKey && choice.correct;
          return el('li', { class: `${picked ? 'is-picked' : ''}${isRight ? ' is-key' : ''}` }, [
            el('span', { class: 'quiz-review-choice', text: choice.label }),
            picked ? el('span', { class: 'quiz-review-tag', text: 'Your answer' }) : null,
            isRight && !picked ? el('span', { class: 'quiz-review-tag is-key', text: 'Correct answer' }) : null
          ]);
        })),
        !pickedChoice ? el('p', { class: 'quiz-review-note', text: 'Not answered' }) : null
      ]);
    });
    const when = review.submittedAt ? new Date(review.submittedAt.replace(' ', 'T')) : null;
    app.replaceChildren(
      el('section', { class: `quiz-card quiz-result${justSubmitted ? ' is-new' : ''}` }, [
        el('div', { class: 'quiz-result-icon', 'aria-hidden': 'true', text: '✓' }),
        el('h2', { text: review.preview ? 'Preview result' : (justSubmitted ? 'Your answers were submitted!' : 'You have submitted this activity') }),
        el('div', { class: 'quiz-score' }, [
          el('span', { class: 'quiz-score-number', text: `${review.score}/${review.total}` }),
          el('span', { class: 'quiz-score-label', text: `${review.percent}% correct` })
        ]),
        el('p', { class: 'quiz-result-note', text: review.preview
          ? 'In the real activity this result is saved for you and your teacher.'
          : `${when && !Number.isNaN(when.getTime()) ? `Submitted ${when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}. ` : ''}Your teacher can see your answers and score.${review.showsKey ? '' : ' Your teacher will go over the correct answers.'}` }),
        el('div', { class: 'quiz-nav quiz-nav-center' }, [
          review.preview
            ? el('button', { type: 'button', class: 'quiz-btn quiz-btn-ghost', text: 'Try the preview again', onclick: () => { Object.keys(answers).forEach((key) => delete answers[key]); show(-1); } })
            : null,
          el('a', { class: 'quiz-btn quiz-btn-primary', href: data.backHref, text: review.preview ? 'Back to editor' : 'Back to classroom' })
        ])
      ]),
      el('section', { class: 'quiz-card quiz-review' }, [
        el('h2', { text: 'Your answers' }),
        el('ol', { class: 'quiz-review-list' }, items)
      ])
    );
    app.querySelector('h2')?.setAttribute('tabindex', '-1');
    app.querySelector('h2')?.focus({ preventScroll: false });
  }

  if (data.review) renderResult(data.review, false);
  else render();
})();
