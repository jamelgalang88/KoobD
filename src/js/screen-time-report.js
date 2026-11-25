// Screen-time reports for teachers (screen_time_api.php), drawn into
// [data-st-report]:
//   data-mode="classroom" - the Screen Time tab of teacher_classroom.php: the
//     classroom's totals, kinds of time, a chart and every student;
//   data-mode="student"   - teacher_screen_time.php: one student's totals,
//     chart, day-by-day timeline and session history.
// The period (today, 7 days, 30 days or chosen dates) is kept per classroom
// for this visit. Times are ESTIMATED active use (see js/screen-time.js).
(function () {
  const root = document.querySelector('[data-st-report]');
  if (!root) return;
  const mode = root.dataset.mode === 'student' ? 'student' : 'classroom';
  const classroom = Number(root.dataset.classroom) || 0;
  const student = Number(root.dataset.student) || 0;
  const COLORS = { story: '#4f63d6', platform: '#1d8f6a', quiz: '#c77c00', versus: '#d93f58', other: '#8a94b3' };
  const STORE = `koobd.screenTime.range.${classroom}`;

  // --- The period ---------------------------------------------------------------------------------
  const params = new URLSearchParams(location.search);
  let range = { key: 'week', from: '', to: '' };
  try { Object.assign(range, JSON.parse(sessionStorage.getItem(STORE) || '{}')); } catch (error) { /* default */ }
  if (params.get('range')) range = { key: params.get('range'), from: params.get('from') || '', to: params.get('to') || '' };
  const rangeQuery = () => `range=${encodeURIComponent(range.key)}${range.key === 'custom' ? `&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}` : ''}`;
  function setRange(next) {
    range = next;
    try { sessionStorage.setItem(STORE, JSON.stringify(range)); } catch (error) { /* this visit only */ }
    load();
  }

  // --- Helpers ------------------------------------------------------------------------------------
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function fmt(secs) {
    const minutes = Math.round((Number(secs) || 0) / 60);
    if (minutes < 1) return secs > 0 ? '< 1 min' : '0 min';
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }
  const short = (secs) => {
    const minutes = Math.round((Number(secs) || 0) / 60);
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  };
  const apiUrl = (extra = '') => `screen_time_api.php?action=${mode}&classroom=${classroom}${mode === 'student' ? `&student=${student}` : ''}&${rangeQuery()}${extra}`;

  // --- The toolbar --------------------------------------------------------------------------------
  const today = new Date();
  const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  function toolbar(label) {
    const options = [['day', 'Today'], ['week', '7 days'], ['month', '30 days'], ['custom', 'Dates']];
    return `
      <div class="st-toolbar">
        <div class="st-range" role="radiogroup" aria-label="Period">
          ${options.map(([key, text]) => `<button type="button" role="radio" class="st-range-btn${range.key === key ? ' is-active' : ''}" data-range="${key}" aria-checked="${range.key === key}">${text}</button>`).join('')}
        </div>
        <form class="st-dates"${range.key === 'custom' ? '' : ' hidden'} data-st-dates>
          <label><span>From</span><input type="date" name="from" value="${esc(range.from || iso(new Date(today.getTime() - 6 * 864e5)))}" max="${iso(today)}" required></label>
          <label><span>To</span><input type="date" name="to" value="${esc(range.to || iso(today))}" max="${iso(today)}" required></label>
          <button type="submit" class="st-btn">Show</button>
        </form>
        <div class="st-toolbar-end">
          <span class="st-range-label">${esc(label)}</span>
          <a class="st-btn is-ghost" href="${esc(apiUrl('&format=csv'))}" download><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>CSV</a>
        </div>
      </div>`;
  }
  function wireToolbar() {
    root.querySelectorAll('[data-range]').forEach((button) => button.addEventListener('click', () => {
      if (button.dataset.range === 'custom') {
        range = { ...range, key: 'custom' };
        root.querySelector('[data-st-dates]').hidden = false;
        root.querySelectorAll('[data-range]').forEach((other) => {
          other.classList.toggle('is-active', other === button);
          other.setAttribute('aria-checked', String(other === button));
        });
        root.querySelector('[data-st-dates] input')?.focus();
        return;
      }
      setRange({ key: button.dataset.range, from: '', to: '' });
    }));
    root.querySelector('[data-st-dates]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      setRange({ key: 'custom', from: form.from.value, to: form.to.value });
    });
  }

  // --- Pieces -------------------------------------------------------------------------------------
  function card(label, value, note = '', tone = '') {
    return `<div class="st-card${tone ? ` is-${tone}` : ''}"><span class="st-card-label">${esc(label)}</span><strong class="st-card-value">${value}</strong>${note ? `<span class="st-card-note">${note}</span>` : ''}</div>`;
  }
  // The kinds of time: one bar split by kind, and a legend with each total.
  function breakdown(categories, labels, total) {
    const keys = Object.keys(labels);
    const bar = total > 0
      ? keys.filter((key) => categories[key] > 0).map((key) => `<span style="width:${(categories[key] / total * 100).toFixed(2)}%;background:${COLORS[key]}" title="${esc(labels[key])}: ${fmt(categories[key])}"></span>`).join('')
      : '';
    return `
      <div class="st-split${total > 0 ? '' : ' is-empty'}" role="img" aria-label="${esc(keys.map((key) => `${labels[key]} ${fmt(categories[key])}`).join(', '))}">${bar}</div>
      <ul class="st-legend">
        ${keys.map((key) => `<li><span class="st-dot" style="background:${COLORS[key]}"></span><span class="st-legend-name">${esc(labels[key])}</span><span class="st-legend-value">${fmt(categories[key])}${total > 0 ? ` <small>${Math.round(categories[key] / total * 100)}%</small>` : ''}</span></li>`).join('')}
      </ul>`;
  }
  // Bars for each day (or hour, for a single day); the daily threshold as a line.
  function chart(data, limitMin, title) {
    const buckets = data.buckets || [];
    const limitSecs = data.unit === 'day' && limitMin ? limitMin * 60 : 0;
    const top = Math.max(60, ...buckets.map((bucket) => bucket.secs), limitSecs ? limitSecs * 1.1 : 0);
    const every = buckets.length > 14 ? Math.ceil(buckets.length / 10) : (data.unit === 'hour' ? 3 : 1);
    const total = buckets.reduce((sum, bucket) => sum + bucket.secs, 0);
    return `
      <div class="st-chart" role="img" aria-label="${esc(`${title}: ${fmt(total)} in all`)}">
        <div class="st-chart-plot">
          ${limitSecs ? `<span class="st-chart-limit" style="bottom:${(limitSecs / top * 100).toFixed(2)}%"><span>${limitMin} min</span></span>` : ''}
          ${buckets.map((bucket) => `<div class="st-bar-col" title="${esc(bucket.label)}: ${fmt(bucket.secs)}"><span class="st-bar${limitSecs && bucket.secs > limitSecs ? ' is-over' : ''}" style="height:${(bucket.secs / top * 100).toFixed(2)}%"></span></div>`).join('')}
        </div>
        <div class="st-chart-axis">${buckets.map((bucket, index) => `<span>${index % every === 0 ? esc(bucket.label) : ''}</span>`).join('')}</div>
      </div>`;
  }
  function avatar(person, size = '') {
    return `<span class="st-avatar${size}" style="--a:${esc(person.top || '#dfe6ff')};--b:${esc(person.bottom || '#d3f5e6')}"><img src="${esc(person.asset || '')}" alt="" loading="lazy"></span>`;
  }
  const note = `<p class="st-note"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>Estimated active time: counted only while KoobD is open, in view and being used, with breaks after a minute or two without use. A browser cannot confirm that a student is paying attention. Only times and the kind of page are kept, never what is on screen.</p>`;

  // --- The classroom ------------------------------------------------------------------------------
  function renderClassroom(data) {
    const t = data.totals;
    const recent = data.recent;
    const detail = (id) => `teacher_screen_time.php?classroom=${classroom}&student=${id}&${rangeQuery()}`;
    const students = data.students.map((s) => {
      const over = s.daysOver > 0;
      return `
        <li>
          <a class="st-student" href="${esc(detail(s.id))}">
            ${avatar(s)}
            <span class="st-student-who"><strong translate="no">${esc(s.name)}</strong><span translate="no">${esc(s.character)}</span></span>
            <span class="st-student-split">
              <span class="st-split is-mini${s.secs > 0 ? '' : ' is-empty'}">${s.secs > 0 ? Object.keys(data.categoryLabels).filter((key) => s.categories[key] > 0).map((key) => `<span style="width:${(s.categories[key] / s.secs * 100).toFixed(2)}%;background:${COLORS[key]}"></span>`).join('') : ''}</span>
              <span class="st-student-last">${s.last ? `${esc(s.last.at)} · ${esc(s.last.label)}` : 'No activity in this period'}</span>
            </span>
            <span class="st-student-time"><strong>${fmt(s.secs)}</strong>${over ? `<span class="st-badge is-over" title="Days over ${data.limitMin} minutes">${s.daysOver} day${s.daysOver === 1 ? '' : 's'} over</span>` : ''}</span>
            <svg class="st-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
          </a>
        </li>`;
    }).join('');
    body.innerHTML = `
      ${toolbar(data.range.label)}
      <div class="st-cards">
        ${card('Estimated active time', fmt(t.secs), `${esc(data.range.label)}`)}
        ${card('Average per student', fmt(t.avgPerStudent), `${t.students} student${t.students === 1 ? '' : 's'} in this classroom`)}
        ${card('Students with activity', `${t.activeStudents}<small> / ${t.students}</small>`, t.activeStudents ? `${fmt(t.avgPerActive)} each, on average` : 'No activity yet')}
        ${card('Most recent activity', recent ? `<span translate="no">${esc(recent.student)}</span>` : '—', recent ? `${esc(recent.label)} · ${esc(recent.at)}` : 'Nothing in this period', 'recent')}
      </div>
      <div class="st-grid">
        <section class="st-box"><h3>${data.chart.unit === 'hour' ? 'Through the day' : 'Day by day'}</h3>${chart(data.chart, 0, 'Classroom active time')}</section>
        <section class="st-box"><h3>Where the time went</h3>${breakdown(data.categories, data.categoryLabels, t.secs)}</section>
      </div>
      <section class="st-box st-students-box">
        <div class="st-box-head">
          <h3>Students</h3>
          <form class="st-limit" data-st-limit>
            <label for="stLimit">Point out more than</label>
            <input id="stLimit" name="minutes" type="number" min="5" max="600" step="5" value="${data.limitMin}" inputmode="numeric">
            <span>min a day</span>
            <button type="submit" class="st-btn is-ghost">Save</button>
            <span class="st-limit-saved" role="status"></span>
          </form>
        </div>
        ${data.students.length ? `<ul class="st-students">${students}</ul>` : '<p class="st-empty">No students have joined this classroom yet. Share the class code to invite them.</p>'}
      </section>
      ${note}`;
    wireToolbar();
    const form = body.querySelector('[data-st-limit]');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const saved = form.querySelector('.st-limit-saved');
      try {
        const response = await fetch('screen_time_api.php', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'limit', classroom, minutes: Number(form.minutes.value) })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.message);
        saved.textContent = 'Saved';
        load();
      } catch (error) {
        saved.textContent = 'Could not save. Try again.';
      }
    });
  }

  // --- One student --------------------------------------------------------------------------------
  function renderStudent(data) {
    const t = data.totals;
    const labels = data.categoryLabels;
    // The timeline: each day with activity, its sessions placed on 24 hours.
    const days = [];
    data.sessions.forEach((session) => {
      let day = days.find((item) => item.key === session.day);
      if (!day) { day = { key: session.day, sessions: [], secs: 0 }; days.push(day); }
      day.sessions.push(session);
      day.secs += session.secs;
    });
    const dayName = (key) => new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const timeline = days.slice(0, 14).map((day) => `
      <li class="st-day">
        <span class="st-day-name">${esc(dayName(day.key))}</span>
        <span class="st-track">${day.sessions.map((s) => `<span class="st-block" style="left:${(s.startMin / 1440 * 100).toFixed(2)}%;width:${Math.max(0.6, (s.endMin - s.startMin) / 1440 * 100).toFixed(2)}%;background:${COLORS[s.main]}" title="${esc(`${s.start} – ${s.end}: ${fmt(s.secs)} active, ${labels[s.main]}`)}"></span>`).join('')}</span>
        <span class="st-day-total">${short(day.secs)}</span>
      </li>`).join('');
    const sessions = data.sessions.slice(0, 60).map((s) => `
      <li class="st-session">
        <span class="st-session-when"><strong>${esc(s.dayLabel.split(',')[0])}</strong><span>${esc(s.start)} – ${esc(s.end)}</span></span>
        <span class="st-session-what"><span class="st-chip" style="--c:${COLORS[s.main]}">${esc(labels[s.main])}</span><span class="st-session-pages">${esc(s.what.join(' · '))}</span></span>
        <span class="st-session-time"><strong>${fmt(s.secs)}</strong><span>active of ${fmt(s.spanSecs)}</span></span>
      </li>`).join('');
    body.innerHTML = `
      ${toolbar(data.range.label)}
      <div class="st-cards">
        ${card('Estimated active time', fmt(t.secs), `${t.activeDays} day${t.activeDays === 1 ? '' : 's'} with activity`)}
        ${card('Sessions', String(t.sessions), 'A break over 5 minutes starts a new one')}
        ${card('Average per session', fmt(t.avgPerSession), 'Active time')}
        ${card('Last active', data.last ? esc(data.last.at) : '—', data.last ? esc(data.last.label) : 'Nothing in this period', t.daysOver ? 'over' : '')}
      </div>
      ${t.daysOver ? `<p class="st-alert"><span class="st-badge is-over">${t.daysOver} day${t.daysOver === 1 ? '' : 's'}</span> over this classroom's ${data.limitMin} minutes a day.</p>` : ''}
      <div class="st-grid">
        <section class="st-box"><h3>${data.chart.unit === 'hour' ? 'Through the day' : 'Daily use'}</h3>${chart(data.chart, data.limitMin, 'Daily active time')}</section>
        <section class="st-box"><h3>Where the time went</h3>${breakdown(data.categories, labels, t.secs)}</section>
      </div>
      <section class="st-box">
        <div class="st-box-head"><h3>Activity timeline</h3><span class="st-box-hint">Each block is a session, placed on the day's 24 hours</span></div>
        ${days.length ? `<div class="st-hours" aria-hidden="true"><span></span><span class="st-hours-scale"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span></span><span></span></div><ul class="st-days">${timeline}</ul>` : '<p class="st-empty">No activity in this period.</p>'}
      </section>
      <section class="st-box">
        <div class="st-box-head"><h3>Session history</h3><span class="st-box-hint">${t.sessions} session${t.sessions === 1 ? '' : 's'}${t.sessions > 60 ? ', latest 60 shown (all are in the CSV)' : ''}</span></div>
        ${sessions ? `<ul class="st-sessions">${sessions}</ul>` : '<p class="st-empty">No sessions in this period.</p>'}
      </section>
      ${note}`;
    wireToolbar();
  }

  // --- Loading ------------------------------------------------------------------------------------
  root.innerHTML = '<div class="st-body" aria-live="polite"></div>';
  const body = root.querySelector('.st-body');
  let loading = 0;
  async function load() {
    const ticket = ++loading;
    body.classList.add('is-loading');
    if (!body.innerHTML.trim()) body.innerHTML = '<p class="st-loading">Loading screen time…</p>';
    try {
      const response = await fetch(apiUrl(), { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json();
      if (ticket !== loading) return;
      if (!data.success) throw new Error(data.message || 'Could not load screen time.');
      range = { key: data.range.key, from: data.range.from, to: data.range.to };
      if (mode === 'student') renderStudent(data); else renderClassroom(data);
    } catch (error) {
      if (ticket === loading) body.innerHTML = `${toolbar('')}<p class="st-empty">${esc(error.message || 'Could not load screen time.')} <button type="button" class="st-btn is-ghost" data-st-retry>Try again</button></p>`;
      wireToolbar();
      body.querySelector('[data-st-retry]')?.addEventListener('click', load);
    } finally {
      if (ticket === loading) body.classList.remove('is-loading');
    }
  }
  // The classroom's tab loads when it is first opened; the student page at once.
  let started = false;
  window.KoobdScreenTime = { show() { if (!started) { started = true; load(); } }, reload: load };
  if (mode === 'student') window.KoobdScreenTime.show();
})();
