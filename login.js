// Forgot password link handler
const forgotPasswordLink = document.getElementById('forgot-password-link');
if (forgotPasswordLink) {
  forgotPasswordLink.addEventListener('click', function(e) {
    e.preventDefault();
    const err = document.getElementById('login-error');
    err.textContent = 'Password reset feature coming soon! Please contact support if you need to reset your password.';
    err.hidden = false;
    err.focus();
  });
}

document.getElementById('login-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const err = document.getElementById('login-error');
  err.hidden = true;
  const submitButton = this.querySelector('button[type="submit"]');
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  
  if (!username || !password) {
    err.textContent = 'Please enter both username and password.';
    err.hidden = false;
    err.focus();
    return;
  }
  
  // Disable button and show loading state
  submitButton.disabled = true;
  submitButton.textContent = 'Logging in...';
  
  try {
    const r = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const json = await r.json();
    if (!r.ok) {
      err.textContent = json && json.error ? json.error : 'Login failed.';
      err.hidden = false;
      err.focus();
      submitButton.disabled = false;
      submitButton.textContent = 'Log in';
    } else {
      // On success, go to dashboard
      submitButton.textContent = 'Success! Redirecting...';
      window.location.href = '/dashboard.html';
    }
  } catch (errx) {
    err.textContent = 'Network error. Try again later.';
    err.hidden = false;
    err.focus();
    submitButton.disabled = false;
    submitButton.textContent = 'Log in';
  }
});

