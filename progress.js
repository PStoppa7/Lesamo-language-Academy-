// public/progress.js — small helper to fetch server progress on load
(async function () {
  try {
    const r = await fetch('/api/progress');
    if (!r.ok) return;
    const json = await r.json();
    if (json && Array.isArray(json.progress) && json.progress.length) {
      // Append server progress to local storage (do not duplicate naive approach)
      const local = JSON.parse(localStorage.getItem('nth_progress') || '[]');
      const merged = local.concat(json.progress.map(p => ({ question: p.question || 'sync', answer: p.answer || '', correct: p.correct || false, time: Date.parse(p.at || new Date()) })));
      localStorage.setItem('nth_progress', JSON.stringify(merged));
    }
  } catch (err) {
    // ignore quietly
  }
})();