(function () {
  const search = document.getElementById('approvedStorySearch');
  const status = document.getElementById('approvedStoryStatus');
  const rows = Array.from(document.querySelectorAll('.approval-list-item[data-status]'));
  const empty = document.getElementById('approvalFilterEmpty');
  const count = document.getElementById('approvalStoryCount');
  const codeInput = document.getElementById('submissionCode');

  codeInput?.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/[^a-f0-9]/gi, '').toUpperCase().slice(0, 10);
  });

  rows.forEach((row, index) => {
    row.style.setProperty('--approval-row', String(Math.min(index, 9)));
  });

  if (!search || !status || !empty) return;

  function filterStories() {
    const query = search.value.trim().toLocaleLowerCase();
    const selectedStatus = status.value;
    let visible = 0;
    rows.forEach((row) => {
      const matchesText = `${row.dataset.title || ''} ${row.dataset.student || ''}`.includes(query);
      const matchesStatus = selectedStatus === 'all' || row.dataset.status === selectedStatus;
      const shown = matchesText && matchesStatus;
      row.hidden = !shown;
      if (shown) visible += 1;
    });
    empty.hidden = visible !== 0;
    if (count) count.textContent = String(visible);
  }

  search.addEventListener('input', filterStories);
  status.addEventListener('change', filterStories);
})();
