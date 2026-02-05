// Dashboard functionality: file uploads, submissions display, and progress tracking

// Initialize navigation
document.addEventListener('DOMContentLoaded', async () => {
  initNavigation();
  await loadSubmissions();
  await loadProgress();
  await loadResults();
});

// Navigation functionality
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.dashboard-section');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetSection = item.getAttribute('data-section');
      
      // Remove active class from all nav items and sections
      navItems.forEach(nav => nav.classList.remove('active'));
      sections.forEach(section => section.classList.remove('active'));
      
      // Add active class to clicked nav item and corresponding section
      item.classList.add('active');
      const sectionElement = document.getElementById(`section-${targetSection}`);
      if (sectionElement) {
        sectionElement.classList.add('active');
        
        // Load data when switching to a section
        if (targetSection === 'submissions') {
          loadSubmissions();
        } else if (targetSection === 'progress') {
          loadProgress();
          loadResults();
        }
      }
    });
  });
}

// Handle submission form
const submissionForm = document.getElementById('submission-form');
if (submissionForm) {
  submissionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('submission-error');
    const successDiv = document.getElementById('submission-success');
    errorDiv.hidden = true;
    successDiv.hidden = true;

    const formData = new FormData(submissionForm);
    const fileInput = document.getElementById('submission-file');
    
    if (!fileInput.files[0]) {
      errorDiv.textContent = 'Please select a file to upload.';
      errorDiv.hidden = false;
      return;
    }

    // Check file size (10MB limit)
    if (fileInput.files[0].size > 10 * 1024 * 1024) {
      errorDiv.textContent = 'File size exceeds 10MB limit.';
      errorDiv.hidden = false;
      return;
    }

    try {
      const submitButton = submissionForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Uploading...';

      const response = await fetch('/api/submit', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        errorDiv.textContent = result.error || 'Submission failed. Please try again.';
        errorDiv.hidden = false;
      } else {
        successDiv.textContent = 'Assignment submitted successfully!';
        successDiv.hidden = false;
        submissionForm.reset();
        await loadSubmissions();
        await loadProgress();
        
        // Switch to submissions section after successful submission
        setTimeout(() => {
          const submissionsNav = document.querySelector('.nav-item[data-section="submissions"]');
          if (submissionsNav) {
            submissionsNav.click();
          }
        }, 1000);
      }
    } catch (err) {
      errorDiv.textContent = 'Network error. Please try again later.';
      errorDiv.hidden = false;
    } finally {
      const submitButton = submissionForm.querySelector('button[type="submit"]');
      submitButton.disabled = false;
      submitButton.textContent = 'Submit Assignment';
    }
  });
}

// Load user's submissions
async function loadSubmissions() {
  const container = document.getElementById('submissions-list');
  if (!container) return;

  try {
    const response = await fetch('/api/submissions');
    const data = await response.json();

    if (!response.ok) {
      container.innerHTML = '<p class="error-text">Unable to load submissions.</p>';
      return;
    }

    const submissions = data.submissions || [];

    if (submissions.length === 0) {
      container.innerHTML = '<p class="empty-state">No submissions yet. Submit your first assignment above!</p>';
      return;
    }

    container.innerHTML = submissions.map(sub => `
      <div class="submission-item">
        <div class="submission-header">
          <h4>${escapeHtml(sub.title || 'Untitled')}</h4>
          <span class="submission-type badge ${sub.type || 'assignment'}">${(sub.type || 'assignment').charAt(0).toUpperCase() + (sub.type || 'assignment').slice(1)}</span>
        </div>
        <div class="submission-meta">
          <span class="meta-item">
            <strong>File:</strong> ${escapeHtml(sub.filename || 'N/A')}
          </span>
          <span class="meta-item">
            <strong>Submitted:</strong> ${formatDate(sub.submittedAt)}
          </span>
          ${sub.notes ? `<div class="submission-notes"><strong>Notes:</strong> ${escapeHtml(sub.notes)}</div>` : ''}
        </div>
        ${sub.status ? `<div class="submission-status status-${sub.status}">${escapeHtml(sub.status)}</div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p class="error-text">Error loading submissions.</p>';
  }
}

// Load progress data
async function loadProgress() {
  try {
    const response = await fetch('/api/progress');
    const data = await response.json();

    if (response.ok && data.progress) {
      const items = data.progress || [];
      const totalAttempts = items.reduce((acc, entry) => acc + (Array.isArray(entry.items) ? entry.items.length : 0), 0);
      const correct = items.reduce((acc, entry) => acc + (Array.isArray(entry.items) ? entry.items.filter(i => i.correct).length : 0), 0);

      const submissionsCountEl = document.getElementById('total-submissions');
      const tasksCountEl = document.getElementById('total-tasks');
      const correctCountEl = document.getElementById('correct-answers');

      if (submissionsCountEl) submissionsCountEl.textContent = await getSubmissionsCount();
      if (tasksCountEl) tasksCountEl.textContent = totalAttempts;
      if (correctCountEl) correctCountEl.textContent = correct;
    }
  } catch (err) {
    console.error('Error loading progress:', err);
  }
}

// Get submissions count
async function getSubmissionsCount() {
  try {
    const response = await fetch('/api/submissions');
    const data = await response.json();
    return (data.submissions || []).length;
  } catch (err) {
    return 0;
  }
}

// Load results
async function loadResults() {
  const container = document.getElementById('results-list');
  if (!container) return;

  try {
    const response = await fetch('/api/progress');
    const data = await response.json();

    if (!response.ok) {
      container.innerHTML = '<p class="error-text">Unable to load results.</p>';
      return;
    }

    const items = data.progress || [];
    const allTasks = [];

    items.forEach(entry => {
      if (Array.isArray(entry.items)) {
        entry.items.forEach(item => {
          allTasks.push({
            ...item,
            timestamp: entry.at
          });
        });
      }
    });

    if (allTasks.length === 0) {
      container.innerHTML = '<p class="empty-state">No task results yet. Complete some practice tasks to see results here.</p>';
      return;
    }

    // Sort by timestamp, newest first
    allTasks.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    container.innerHTML = allTasks.slice(0, 20).map(task => `
      <div class="result-item">
        <div class="result-header">
          <span class="result-question">${escapeHtml(task.question || 'Task')}</span>
          <span class="result-status ${task.correct ? 'correct' : 'incorrect'}">
            ${task.correct ? '✓ Correct' : '✗ Incorrect'}
          </span>
        </div>
        <div class="result-details">
          <span><strong>Your Answer:</strong> ${escapeHtml(String(task.answer || 'N/A'))}</span>
          ${task.timestamp ? `<span class="result-time">${formatDate(task.timestamp)}</span>` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p class="error-text">Error loading results.</p>';
  }
}

// Utility functions
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
