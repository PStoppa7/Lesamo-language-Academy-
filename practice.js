// public/practice.js — client-side practice behavior
(function () {
  const form = document.getElementById('practice-form');
  const answerEl = document.getElementById('q-answer');
  const feedback = document.getElementById('practice-feedback');
  const hintBtn = document.getElementById('show-hint');
  const progressSummary = document.getElementById('progress-summary');

  function setFeedback(text, isError) {
    feedback.textContent = text;
    feedback.classList.toggle('error', !!isError);
    feedback.focus();
  }

  hintBtn.addEventListener('click', function () {
    setFeedback('Hint: 7 × 6 = 7 added 6 times or 6 added 7 times. Try breaking it down: 7 × 5 = 35, plus 7 = 42.');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const raw = answerEl.value.trim();
    if (!raw) {
      setFeedback('Please enter an answer.', true);
      return;
    }

    const numeric = Number(raw);
    const correct = 42;
    const result = { question: '7x6', answer: raw, correct: numeric === correct, time: Date.now() };

    if (numeric === correct) {
      setFeedback('Correct — 7 × 6 = 42. Nice work!');
    } else {
      setFeedback('Not quite — 7 × 6 = 42. Hint available.');
    }

    // store locally and update summary
    try {
      const stored = JSON.parse(localStorage.getItem('nth_progress') || '[]');
      stored.push(result);
      localStorage.setItem('nth_progress', JSON.stringify(stored));
      updateSummary();
    } catch (err) {
      console.error(err);
    }
  });

  function updateSummary() {
    const stored = JSON.parse(localStorage.getItem('nth_progress') || '[]');
    if (!stored.length) {
      progressSummary.textContent = 'No activity yet.';
      return;
    }
    const correct = stored.filter(s => s.correct).length;
    const total = stored.length;
    progressSummary.textContent = `Attempts: ${total}, Correct: ${correct}.`;
  }

  document.getElementById('sync-progress').addEventListener('click', async function () {
    const stored = JSON.parse(localStorage.getItem('nth_progress') || '[]');
    if (!stored.length) {
      setFeedback('No local progress to sync.');
      return;
    }
    try {
      const res = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: stored }),
      });
      const json = await res.json();
      if (res.ok) {
        setFeedback('Progress synced to server.');
      } else {
        setFeedback(json && json.error ? json.error : 'Sync failed', true);
      }
    } catch (err) {
      setFeedback('Network error while syncing.', true);
    }
  });

  updateSummary();
})();