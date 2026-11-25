// Answering a question activity (quiz_take.php): a Start card, then one
// question at a time (Previous / Next, and numbered dots to jump), then a
// check of every answer and Submit. Multiple choice and true/false are picked;
// identification is typed into a short field; essay is written in a box;
// "Say it" is said into the microphone (js/koobd-speech.js), and its best try
// is the answer. Every question can be heard (🔊) and its words tapped to hear
// each one, in the question's language. The
// questions come in the order the server chose for this student (their own
// shuffled order when the quiz shuffles); answers are kept by question id,
// so the order never mixes them up. The server checks the answers
// (quiz_submit.php) and the result replaces the questions; essays wait for the
// teacher's grade. Answers given so far are kept for this browser session, so
// a reload loses nothing.
(function () {
  const data = window.KOOBD_QUIZ || {};
  const app = document.getElementById('quizApp');
  if (!app) return;
  const questions = Array.isArray(data.questions) ? data.questions : [];
  const draftKey = `koobd-quiz:${data.userId}:${data.activityId}`;
  const answers = {};
  let step = -1; // -1: start, 0..n-1: a question, n: check answers
  let submitting = false;

  const isTyped = (question) => question.type === 'identification' || question.type === 'essay' || question.type === 'speak';
  const speech = window.KoobdSpeech || null;
  const bestScores = {}; // "Say it": the closest try so far, per question
  const isAnswered = (question) => {
    const value = answers[question.id];
    return isTyped(question) ? typeof value === 'string' && value.trim() !== '' : Boolean(value);
  };
  // Where the focus goes when a question opens: the picked option, else the
  // first option, else the answer field.
  const FOCUS_ANSWER = '.quiz-option input:checked, .quiz-option input, .quiz-text-answer';

  try {
    const saved = JSON.parse(window.sessionStorage.getItem(draftKey) || 'null');
    if (saved && typeof saved === 'object' && !data.preview) {
      questions.forEach((question) => {
        const value = saved[question.id];
        if (value === undefined || value === null) return;
        answers[question.id] = isTyped(question) ? String(value) : Number(value);
      });
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
      else if (key === 'value') node.value = value;
      else node.setAttribute(key, value === true ? '' : value);
    });
    [].concat(children).forEach((child) => child && node.append(child));
    return node;
  }
  const answeredCount = () => questions.filter(isAnswered).length;
  const TYPE_LABELS = { multiple_choice: 'Multiple choice', true_false: 'True or False', identification: 'Identification', essay: 'Essay', speak: 'Say it' };
  // The question's prompt: its words can be tapped to hear them, with a 🔊
  // button for the whole question.
  function promptHeading(question, name) {
    const heading = el('h2', { id: `${name}-prompt`, class: 'quiz-question-prompt', text: question.prompt });
    if (!speech) return heading;
    speech.wordify(heading, question.prompt, question.lang);
    return el('div', { class: 'ks-prompt-row' }, [heading, speech.listenButton(question.prompt, question.lang, { label: 'Listen' })]);
  }
  // "Say it": the phrase to say and the microphone; the closest try counts.
  function sayItInput(question) {
    const phrases = question.choices.map((choice) => choice.label).filter(Boolean);
    if (!speech || !phrases.length) return el('p', { class: 'quiz-warning', text: 'Speaking practice cannot run on this page. You can go on to the next question.' });
    return speech.sayIt({
      phrase: phrases[0],
      accepted: phrases.slice(1),
      lang: question.lang,
      audio: question.audio || null, // the teacher's recording, when there is one
      previous: typeof answers[question.id] === 'string' ? answers[question.id] : '',
      onResult: (result) => {
        // The best try so far is the answer (trying again never makes it worse).
        const before = bestScores[question.id];
        if (before === undefined || result.score >= before || typeof answers[question.id] !== 'string') {
          bestScores[question.id] = result.score;
          answers[question.id] = result.heard;
          keepDraft();
          refreshProgress();
        }
      }
    });
  }
  const typeLabel = (question) => TYPE_LABELS[question.type] || 'Multiple choice';
  const pointsLabel = (points) => `${points} point${points === 1 ? '' : 's'}`;
  // Identification answers are compared without case, extra spaces or a final
  // full stop (the same rule as the server; used by the teacher's preview).
  const normalize = (text) => String(text || '').trim().replace(/\s+/g, ' ').replace(/[ .]+$/, '').toLowerCase();

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
        : `There ${questions.length === 1 ? 'is 1 question' : `are ${questions.length} questions`}. Answer each one, then submit.` }),
      el('button', { type: 'button', class: 'quiz-btn quiz-btn-primary quiz-btn-lg', text: answered ? 'Continue' : 'Start', onclick: () => {
        const firstOpen = questions.findIndex((question) => !isAnswered(question));
        show(answered && firstOpen >= 0 ? firstOpen : 0, FOCUS_ANSWER);
      } })
    ]));
  }

  function dotsNav() {
    return el('nav', { class: 'quiz-dots', 'aria-label': 'Questions' }, questions.map((question, index) => el('button', {
      type: 'button',
      class: `quiz-dot${isAnswered(question) ? ' is-answered' : ''}${index === step ? ' is-current' : ''}`,
      'aria-label': `Question ${index + 1}${isAnswered(question) ? ', answered' : ', not answered'}`,
      'aria-current': index === step ? 'step' : null,
      text: String(index + 1),
      onclick: () => show(index, FOCUS_ANSWER)
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
  function refreshProgress() {
    app.querySelector('.quiz-dots')?.replaceWith(dotsNav());
    app.querySelector('.quiz-progress')?.replaceWith(progressBar());
  }

  // The answer part of a question: options to pick, or a field to type in.
  function answerInput(question, index) {
    const name = `question-${question.id}`;
    if (question.type === 'speak') return sayItInput(question);
    if (isTyped(question)) {
      const essay = question.type === 'essay';
      let wasAnswered = isAnswered(question);
      const field = el(essay ? 'textarea' : 'input', {
        class: `quiz-text-answer${essay ? ' is-essay' : ''}`,
        id: `${name}-answer`,
        type: essay ? null : 'text',
        rows: essay ? '6' : null,
        maxlength: essay ? '10000' : '500',
        autocomplete: 'off',
        autocapitalize: essay ? 'sentences' : 'off',
        spellcheck: essay ? 'true' : 'false',
        enterkeyhint: essay ? null : 'next',
        placeholder: essay ? 'Write your answer in your own words' : 'Type your answer',
        'aria-labelledby': `${name}-prompt`,
        value: typeof answers[question.id] === 'string' ? answers[question.id] : '',
        oninput: (event) => {
          answers[question.id] = event.target.value;
          if (essay) grow(event.target);
          keepDraft();
          const nowAnswered = isAnswered(question);
          if (nowAnswered !== wasAnswered) { wasAnswered = nowAnswered; refreshProgress(); }
          if (count) count.textContent = `${event.target.value.trim() ? event.target.value.trim().split(/\s+/).length : 0} words`;
        },
        onkeydown: (event) => {
          // Enter in a short answer goes on to the next question.
          if (essay || event.key !== 'Enter') return;
          event.preventDefault();
          const last = index === questions.length - 1;
          show(index + 1, last ? 'h2' : FOCUS_ANSWER);
        }
      });
      const count = essay ? el('span', { class: 'quiz-text-count', 'aria-live': 'off' }) : null;
      if (count) {
        const text = typeof answers[question.id] === 'string' ? answers[question.id].trim() : '';
        count.textContent = `${text ? text.split(/\s+/).length : 0} words`;
      }
      return el('div', { class: 'quiz-text-wrap' }, [
        field,
        el('div', { class: 'quiz-text-foot' }, [
          el('span', { class: 'quiz-text-hint', text: essay
            ? `Worth ${pointsLabel(question.points || 1)}. Your teacher reads and grades it.`
            : 'Type one answer. Capital letters do not matter.' }),
          count
        ])
      ]);
    }
    const options = el('div', { class: 'quiz-options', role: 'radiogroup', 'aria-labelledby': `${name}-prompt` },
      question.choices.map((choice, choiceIndex) => el('label', { class: `quiz-option${answers[question.id] === choice.id ? ' is-selected' : ''}` }, [
        el('input', {
          type: 'radio', name, value: String(choice.id), checked: answers[question.id] === choice.id,
          onchange: () => {
            answers[question.id] = choice.id;
            keepDraft();
            options.querySelectorAll('.quiz-option').forEach((node) => node.classList.toggle('is-selected', node.querySelector('input').checked));
            refreshProgress();
          }
        }),
        el('span', { class: 'quiz-option-letter', 'aria-hidden': 'true', text: question.type === 'true_false' ? (choiceIndex === 0 ? 'T' : 'F') : String.fromCharCode(65 + choiceIndex) }),
        el('span', { class: 'quiz-option-label', text: choice.label }),
        // Hear this choice (True and False are plain enough without one).
        speech && question.type !== 'true_false' ? speech.listenButton(choice.label, question.lang, { label: 'Listen', compact: true }) : null
      ])));
    return options;
  }
  function grow(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(textarea.scrollHeight, 140)}px`;
  }

  function renderQuestion(index) {
    const question = questions[index];
    const name = `question-${question.id}`;
    const last = index === questions.length - 1;
    app.replaceChildren(
      progressBar(),
      dotsNav(),
      el('section', { class: 'quiz-card quiz-question-view' }, [
        el('div', { class: 'quiz-question-kicker', text: `Question ${index + 1} of ${questions.length} · ${typeLabel(question)}${question.type === 'essay' ? ` · ${pointsLabel(question.points || 1)}` : ''}` }),
        promptHeading(question, name),
        answerInput(question, index),
        el('div', { class: 'quiz-nav' }, [
          el('button', { type: 'button', class: 'quiz-btn quiz-btn-ghost', text: 'Previous', disabled: index === 0, onclick: () => show(index - 1, FOCUS_ANSWER) }),
          el('button', { type: 'button', class: 'quiz-btn quiz-btn-primary', text: last ? 'Check answers' : 'Next', onclick: () => show(index + 1, last ? 'h2' : FOCUS_ANSWER) })
        ])
      ])
    );
    const essay = app.querySelector('.quiz-text-answer.is-essay');
    if (essay) grow(essay);
  }

  // What a student answered, as text (for the check list).
  function answerText(question) {
    if (isTyped(question)) return isAnswered(question) ? answers[question.id].trim() : '';
    const choice = question.choices.find((item) => item.id === answers[question.id]);
    return choice ? choice.label : '';
  }

  function renderCheck() {
    const missing = questions.filter((question) => !isAnswered(question)).length;
    const list = el('ol', { class: 'quiz-check-list' }, questions.map((question, index) => {
      const text = answerText(question);
      return el('li', { class: text ? '' : 'is-missing' }, [
        el('button', { type: 'button', class: 'quiz-check-item', onclick: () => show(index, FOCUS_ANSWER) }, [
          el('span', { class: 'quiz-check-q', text: question.prompt }),
          el('span', { class: `quiz-check-a${question.type === 'essay' && text ? ' is-essay' : ''}`, text: text || 'Not answered' })
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
          ? `${missing} question${missing === 1 ? ' is' : 's are'} not answered yet. You can still submit, but unanswered questions earn no points.`
          : 'Every question is answered. Tap a question to change your answer, or submit when you are ready. You can only submit once.' }),
        list,
        el('div', { class: 'quiz-nav' }, [
          el('button', { type: 'button', class: 'quiz-btn quiz-btn-ghost', text: 'Back', onclick: () => show(questions.length - 1, FOCUS_ANSWER) }),
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
    let total = 0;
    let pending = 0;
    const reviewed = questions.map((question) => {
      const max = question.type === 'essay' ? (question.points || 1) : 1;
      total += max;
      if (question.type === 'essay') {
        const text = isAnswered(question) ? answers[question.id] : '';
        if (text) pending += 1;
        return { ...question, max, text, points: text ? null : 0, pending: Boolean(text) };
      }
      if (question.type === 'speak') {
        const text = isAnswered(question) ? answers[question.id] : '';
        const isCorrect = Boolean(text && speech) && question.choices.some((choice) => speech.similarity(choice.label, text) >= speech.PASS);
        score += isCorrect ? 1 : 0;
        return { ...question, max, text, isCorrect, points: isCorrect ? 1 : 0, accepted: question.choices.map((choice) => choice.label) };
      }
      if (question.type === 'identification') {
        const text = isAnswered(question) ? answers[question.id] : '';
        const isCorrect = Boolean(text) && question.choices.some((choice) => normalize(choice.label) === normalize(text));
        score += isCorrect ? 1 : 0;
        return { ...question, max, text, isCorrect, points: isCorrect ? 1 : 0, accepted: question.choices.map((choice) => choice.label) };
      }
      const picked = answers[question.id] || null;
      const right = question.choices.find((choice) => choice.correct);
      const isCorrect = Boolean(right && picked === right.id);
      score += isCorrect ? 1 : 0;
      return { ...question, max, picked, isCorrect, points: isCorrect ? 1 : 0 };
    });
    return { score, total, pending, percent: total ? Math.round((score / total) * 100) : 0, showsKey: true, questions: reviewed, preview: true };
  }

  // --- The result and the review of answers ------------------------------------------
  function reviewItem(question, index, review) {
    const essay = question.type === 'essay';
    const typed = question.type === 'identification' || question.type === 'speak';
    const spoken = question.type === 'speak';
    const verdict = essay
      ? (question.pending ? 'is-pending' : 'is-graded')
      : (review.showsKey ? (question.isCorrect ? 'is-right' : 'is-wrong') : '');
    let badge = null;
    if (essay) {
      badge = el('span', { class: 'quiz-review-badge', text: question.pending ? 'Waiting for grade' : `${question.points ?? 0}/${question.max} points` });
    } else if (review.showsKey) {
      badge = el('span', { class: 'quiz-review-badge', text: question.isCorrect ? 'Correct' : 'Incorrect' });
    }
    const parts = [
      el('div', { class: 'quiz-review-head' }, [
        el('span', { class: 'quiz-review-number', text: String(index + 1) }),
        el('span', { class: 'quiz-review-prompt', text: question.prompt }),
        badge
      ])
    ];
    const text = typeof question.text === 'string' ? question.text.trim() : '';
    if (essay || typed) {
      if (text) {
        parts.push(el('div', { class: `quiz-review-written${essay ? ' is-essay' : ''}` }, [
          el('span', { class: 'quiz-review-tag', text: spoken ? 'You said' : 'Your answer' }),
          el('p', { text })
        ]));
      } else {
        parts.push(el('p', { class: 'quiz-review-note', text: spoken ? 'Not spoken' : 'Not answered' }));
      }
      if (spoken && Array.isArray(question.accepted) && question.accepted.length) {
        parts.push(el('p', { class: 'quiz-review-key-line' }, [
          el('span', { class: 'quiz-review-tag is-key', text: 'Asked to say' }),
          el('span', { text: question.accepted[0] }),
          speech ? speech.listenButton(question.accepted[0], question.lang, { label: 'Listen', compact: true, audio: question.audio || null }) : null
        ]));
      }
      if (typed && !spoken && review.showsKey && !question.isCorrect && Array.isArray(question.accepted) && question.accepted.length) {
        parts.push(el('p', { class: 'quiz-review-key-line' }, [
          el('span', { class: 'quiz-review-tag is-key', text: 'Correct answer' }),
          el('span', { text: question.accepted[0] })
        ]));
      }
      if (essay && question.feedback) {
        parts.push(el('div', { class: 'quiz-review-feedback' }, [
          el('span', { class: 'quiz-review-tag is-key', text: 'Teacher feedback' }),
          el('p', { text: question.feedback })
        ]));
      }
      return el('li', { class: `quiz-review-item ${verdict}` }, parts);
    }
    const pickedChoice = question.choices.find((choice) => choice.id === question.picked);
    parts.push(el('ul', { class: 'quiz-review-choices' }, question.choices.map((choice) => {
      const picked = choice.id === question.picked;
      const isRight = review.showsKey && choice.correct;
      return el('li', { class: `${picked ? 'is-picked' : ''}${isRight ? ' is-key' : ''}` }, [
        el('span', { class: 'quiz-review-choice', text: choice.label }),
        picked ? el('span', { class: 'quiz-review-tag', text: 'Your answer' }) : null,
        isRight && !picked ? el('span', { class: 'quiz-review-tag is-key', text: 'Correct answer' }) : null
      ]);
    })));
    if (!pickedChoice) parts.push(el('p', { class: 'quiz-review-note', text: 'Not answered' }));
    return el('li', { class: `quiz-review-item ${verdict}` }, parts);
  }

  function renderResult(review, justSubmitted) {
    // Just submitted: a bright finish for a good score, a gentle one otherwise.
    if (justSubmitted && window.KoobdAudio) window.KoobdAudio.sfx(review.percent >= 50 ? 'success' : 'notify');
    setAnswering(false);
    const pending = Number(review.pending) || 0;
    const items = review.questions.map((question, index) => reviewItem(question, index, review));
    const when = review.submittedAt ? new Date(review.submittedAt.replace(' ', 'T')) : null;
    const pendingNote = pending
      ? `${pending} essay${pending === 1 ? ' is' : 's are'} waiting for your teacher's grade, so your score may still go up.`
      : '';
    app.replaceChildren(
      el('section', { class: `quiz-card quiz-result${justSubmitted ? ' is-new' : ''}` }, [
        el('div', { class: 'quiz-result-icon', 'aria-hidden': 'true', text: '✓' }),
        el('h2', { text: review.preview ? 'Preview result' : (justSubmitted ? 'Your answers were submitted!' : 'You have submitted this activity') }),
        el('div', { class: 'quiz-score' }, [
          el('span', { class: 'quiz-score-number', text: `${review.score}/${review.total}` }),
          el('span', { class: 'quiz-score-label', text: pending ? `points so far · ${pending} pending` : `${review.percent}% ${review.total === review.questions.length ? 'correct' : 'of the points'}` })
        ]),
        pendingNote ? el('p', { class: 'quiz-pending-note', text: pendingNote }) : null,
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
