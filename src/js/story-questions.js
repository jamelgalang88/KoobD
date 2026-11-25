// Questions inside a classroom story activity. The teacher places them at
// points in the story (story_question_answer.php saves the answers; the
// questions belong to the activity, never to the story, so the home page's
// stories never stop). Each story player asks before it moves on:
//
//   await window.KoobdStoryQuestions.at('scene:castle')   // or 'page:pg3', 'place:deepWoods', 'end'
//
// which resolves at once when there is nothing to ask there, or after the
// reader has answered (or skipped, when allowed) every question at that point.
// The story waits meanwhile, exactly where it was; it never restarts or skips.
// A question already answered - on this visit or an earlier one - is not asked
// again. window.KOOBD_STORY_QUESTIONS (from the story page) holds the
// questions, without their answers, and which were answered. Questions can be
// heard (🔊) and their words tapped to hear each one; a "Say it" question is
// answered by speaking (js/koobd-speech.js). A device that cannot listen
// says so, and the reader can go on (the question then earns no points).
(function () {
  const data = window.KOOBD_STORY_QUESTIONS;
  const noQuestions = { at: () => Promise.resolve(), has: () => false };
  if (!data || !Array.isArray(data.questions) || !data.questions.length) {
    window.KoobdStoryQuestions = noQuestions;
    return;
  }
  const done = new Set((data.answered || []).map(Number));
  const TYPE_LABELS = { multiple_choice: 'Multiple choice', true_false: 'True or False', identification: 'Identification', essay: 'Essay', speak: 'Say it' };
  const speech = window.KoobdSpeech || null;
  const normalize = (text) => String(text || '').trim().replace(/\s+/g, ' ').replace(/[ .]+$/, '').toLowerCase();
  let asking = null;

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key === 'value') node.value = value;
      else node.setAttribute(key, value === true ? '' : value);
    });
    [].concat(children).forEach((child) => child !== null && child !== undefined && child !== false && node.append(child));
    return node;
  }

  // The question, its words tappable to hear them, with a 🔊 for all of it.
  function promptRow(question) {
    const heading = el('h2', { class: 'sq-prompt', id: `sq-prompt-${question.id}`, tabindex: '-1', text: question.prompt });
    if (!speech) return heading;
    speech.wordify(heading, question.prompt, question.lang);
    return el('div', { class: 'ks-prompt-row' }, [heading, speech.listenButton(question.prompt, question.lang, { label: 'Listen', compact: true })]);
  }

  const waiting = (point) => data.questions.filter((question) => question.point === point && !done.has(question.id));

  // The teacher's preview checks answers in the page; nothing is saved.
  function previewResult(question, answer, skip) {
    if (skip) return { skipped: true };
    if (question.type === 'essay') return { pending: true };
    const key = (data.key && data.key[question.id]) || { labels: [], ids: [] };
    let correct;
    if (question.type === 'speak') correct = Boolean(answer && speech) && key.labels.some((label) => speech.similarity(label, answer) >= speech.PASS);
    else if (question.type === 'identification') correct = key.labels.some((label) => normalize(label) === normalize(answer));
    else correct = key.ids.includes(Number(answer));
    return { correct, points: correct ? question.points : 0, max: question.points };
  }

  // A right or wrong answer is heard as well as seen (js/koobd-audio.js);
  // an essay waiting for the teacher, or a skip, makes none.
  function answerSound(saved, skip) {
    const pending = saved && (saved.pending === true || saved.correct === null);
    if (!window.KoobdAudio || skip || !saved || pending) return saved;
    window.KoobdAudio.sfx(saved.correct ? 'correct' : 'wrong');
    return saved;
  }

  async function save(question, answer, skip, noMic = false) {
    if (data.preview) return answerSound(noMic ? { correct: false, points: 0, max: question.points } : previewResult(question, answer, skip), skip || noMic);
    const response = await fetch('story_question_answer.php', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: data.activityId, question: question.id, answer, skip: Boolean(skip), noMic: Boolean(noMic) })
    });
    const result = await response.json().catch(() => ({ success: false, message: 'The server did not answer.' }));
    if (!result.success) throw new Error(result.message || 'Your answer could not be saved.');
    return answerSound(result.saved, skip || noMic);
  }

  // One question on its card. Resolves when it is answered (or skipped).
  function ask(question, number, count, layer) {
    return new Promise((resolve) => {
      const spoken = question.type === 'speak';
      const typed = question.type === 'identification' || question.type === 'essay';
      let picked = null;
      let heard = '';
      let heardScore = -1;
      let sayCard = null;
      let busy = false;
      const error = el('p', { class: 'sq-error', role: 'alert', hidden: true });
      const submit = el('button', { type: 'submit', class: 'sq-btn sq-btn-primary', text: 'Submit answer', disabled: true });
      let field = null;
      let options = null;
      const ready = () => { submit.disabled = busy || (spoken ? !heard : typed ? !field.value.trim() : picked === null); };
      // A device that cannot listen: go on without speaking.
      const noMic = el('button', { type: 'button', class: 'sq-btn sq-btn-ghost', text: 'Continue without speaking', hidden: true, onclick: () => send(false, true) });
      if (spoken) {
        const phrases = question.choices.map((choice) => choice.label).filter(Boolean);
        if (speech && phrases.length) {
          sayCard = speech.sayIt({
            phrase: phrases[0], accepted: phrases.slice(1), lang: question.lang, audio: question.audio || null,
            onResult: (result) => {
              // The closest try is the answer.
              if (result.score >= heardScore) { heard = result.heard; heardScore = result.score; }
              ready();
              error.hidden = true;
            },
            onUnavailable: () => { noMic.hidden = false; }
          });
        } else {
          sayCard = el('p', { class: 'sq-error', text: 'Speaking practice cannot run here.' });
          noMic.hidden = false;
        }
      } else if (typed) {
        const essay = question.type === 'essay';
        field = el(essay ? 'textarea' : 'input', {
          class: `sq-text${essay ? ' is-essay' : ''}`, type: essay ? null : 'text', rows: essay ? '5' : null,
          maxlength: essay ? '10000' : '500', autocomplete: 'off', spellcheck: essay ? 'true' : 'false',
          placeholder: essay ? 'Write your answer in your own words' : 'Type your answer',
          'aria-labelledby': `sq-prompt-${question.id}`
        });
        field.addEventListener('input', () => { ready(); error.hidden = true; });
      } else {
        options = el('div', { class: 'sq-options', role: 'radiogroup', 'aria-labelledby': `sq-prompt-${question.id}` },
          question.choices.map((choice, index) => {
            const input = el('input', { type: 'radio', name: `sq-${question.id}`, value: String(choice.id) });
            const label = el('label', { class: 'sq-option' }, [
              input,
              el('span', { class: 'sq-letter', 'aria-hidden': 'true', text: question.type === 'true_false' ? (index === 0 ? 'T' : 'F') : String.fromCharCode(65 + index) }),
              el('span', { class: 'sq-option-label', text: choice.label }),
              speech && question.type !== 'true_false' ? speech.listenButton(choice.label, question.lang, { label: 'Listen', compact: true }) : null
            ]);
            input.addEventListener('change', () => {
              picked = choice.id;
              options.querySelectorAll('.sq-option').forEach((node) => node.classList.toggle('is-selected', node.querySelector('input').checked));
              ready();
              error.hidden = true;
            });
            return label;
          }));
      }
      const skip = question.optional
        ? el('button', { type: 'button', class: 'sq-btn sq-btn-ghost', text: 'Skip', onclick: () => send(true) })
        : null;
      const form = el('form', { class: 'sq-card', novalidate: true }, [
        // A small header: what this is, which question, and its kind and points.
        el('div', { class: 'sq-head' }, [
          el('span', { class: 'sq-icon', 'aria-hidden': 'true', text: '?' }),
          el('div', { class: 'sq-head-text' }, [
            el('span', { class: 'sq-eyebrow', text: 'Story check' }),
            el('span', { class: 'sq-count', text: count > 1 ? `Question ${number} of ${count}` : (question.optional ? 'Answer or skip to keep reading' : 'Answer to keep reading') })
          ]),
          el('div', { class: 'sq-tags' }, [
            el('span', { class: 'sq-tag', text: TYPE_LABELS[question.type] || 'Question' }),
            el('span', { class: 'sq-tag is-points', text: `${question.points} pt${question.points === 1 ? '' : 's'}` }),
            question.optional ? el('span', { class: 'sq-tag is-optional', text: 'Optional' }) : null
          ])
        ]),
        promptRow(question),
        spoken ? sayCard : (typed ? field : options),
        error,
        el('div', { class: 'sq-actions' }, [skip, noMic, submit])
      ]);

      async function send(skipping, withoutMic = false) {
        if (busy) return;
        const answer = skipping || withoutMic ? null : (spoken ? heard : typed ? field.value.trim() : picked);
        if (!skipping && !withoutMic && (answer === null || answer === '')) {
          error.hidden = false;
          error.textContent = spoken ? 'Tap the microphone and say it first.' : typed ? 'Type your answer first.' : 'Choose an answer first.';
          return;
        }
        busy = true;
        ready();
        submit.textContent = 'Saving…';
        try {
          const saved = await save(question, answer, skipping, withoutMic);
          done.add(question.id);
          showSaved(saved);
        } catch (problem) {
          busy = false;
          submit.textContent = 'Try again';
          ready();
          error.hidden = false;
          error.textContent = `${problem.message} Your answer is still here.`;
        }
      }

      // What happened, then on with the story.
      function showSaved(saved) {
        let tone = 'is-saved';
        let icon = '✓';
        let title = 'Answer saved';
        let text = 'Your teacher can see your answer.';
        if (saved.skipped) {
          tone = 'is-skipped';
          icon = '→';
          title = 'Skipped';
          text = 'This question was optional.';
        } else if (saved.pending) {
          icon = '✎';
          title = 'Answer saved';
          text = 'Your teacher will read and grade it.';
        } else if (saved.correct === true) {
          tone = 'is-right';
          title = 'Correct!';
          text = `You earned ${saved.points} point${saved.points === 1 ? '' : 's'}.`;
        } else if (saved.correct === false) {
          tone = 'is-wrong';
          icon = '!';
          title = 'Not quite';
          text = 'Your answer was saved. Keep reading!';
        }
        const next = el('button', { type: 'button', class: 'sq-btn sq-btn-primary', text: number < count ? 'Next question' : 'Continue the story', onclick: () => resolve() });
        form.replaceChildren(el('div', { class: `sq-result ${tone}`, role: 'status' }, [
          el('span', { class: 'sq-result-icon', 'aria-hidden': 'true', text: icon }),
          el('h2', { text: title }),
          el('p', { text })
        ]), el('div', { class: 'sq-actions is-center' }, [next]));
        next.focus({ preventScroll: true });
      }

      form.addEventListener('submit', (event) => { event.preventDefault(); send(false); });
      layer.replaceChildren(form);
      const focusTarget = typed ? field : form.querySelector('.sq-prompt');
      if (spoken && question.choices[0]) submit.textContent = 'Submit what I said';
      window.setTimeout(() => focusTarget && focusTarget.focus({ preventScroll: true }), 60);
    });
  }

  // Ask every waiting question at this point, one after another, on a layer
  // over the story. Clicks and keys on it never reach the story underneath.
  async function at(point) {
    if (asking) await asking;
    const list = waiting(point);
    if (!list.length) return;
    const layer = el('div', { class: 'sq-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Question about the story' });
    ['click', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'keydown', 'keyup'].forEach((type) => {
      layer.addEventListener(type, (event) => event.stopPropagation());
    });
    document.body.appendChild(layer);
    document.body.classList.add('has-story-question');
    asking = (async () => {
      for (let index = 0; index < list.length; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        await ask(list[index], index + 1, list.length, layer);
      }
    })();
    try {
      await asking;
    } finally {
      asking = null;
      layer.remove();
      document.body.classList.remove('has-story-question');
    }
  }

  window.KoobdStoryQuestions = {
    at,
    has: (point) => waiting(point).length > 0,
    get open() { return Boolean(asking); }
  };
})();
