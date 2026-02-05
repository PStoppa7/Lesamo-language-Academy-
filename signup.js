// Password strength validation
function validatePassword(password) {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  if (password.length < minLength) {
    return { valid: false, message: `Password must be at least ${minLength} characters long.` };
  }
  if (!hasUpperCase) {
    return { valid: false, message: 'Password must contain at least one uppercase letter.' };
  }
  if (!hasLowerCase) {
    return { valid: false, message: 'Password must contain at least one lowercase letter.' };
  }
  if (!hasNumber) {
    return { valid: false, message: 'Password must contain at least one number.' };
  }
  if (!hasSpecialChar) {
    return { valid: false, message: 'Password must contain at least one special character (!@#$%^&*...).' };
  }
  return { valid: true };
}

// Real-time password strength indicator
const passwordInput = document.getElementById('password');
if (passwordInput) {
  passwordInput.addEventListener('input', function() {
    const password = this.value;
    const strengthDiv = document.getElementById('password-strength') || (() => {
      const div = document.createElement('div');
      div.id = 'password-strength';
      div.style.marginTop = '0.5rem';
      div.style.fontSize = '0.875rem';
      this.parentNode.appendChild(div);
      return div;
    })();
    
    if (password.length === 0) {
      strengthDiv.textContent = '';
      strengthDiv.className = '';
      return;
    }
    
    const validation = validatePassword(password);
    if (validation.valid) {
      strengthDiv.textContent = '✓ Password strength: Strong';
      strengthDiv.style.color = '#065f46';
      strengthDiv.className = 'success';
    } else {
      strengthDiv.textContent = validation.message;
      strengthDiv.style.color = '#b91c1c';
      strengthDiv.className = 'error';
    }
  });
}

document.getElementById('signup-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const err = document.getElementById('signup-error');
  err.hidden = true;
  const username = document.getElementById('username').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  
  if (!username || !email || !password) {
    err.textContent = 'Please fill all required fields.';
    err.hidden = false;
    err.focus();
    return;
  }
  
  // Validate password strength
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    err.textContent = passwordValidation.message;
    err.hidden = false;
    err.focus();
    return;
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    err.textContent = 'Please enter a valid email address.';
    err.hidden = false;
    err.focus();
    return;
  }
  
  // Validate username (alphanumeric and underscore, 3-20 chars)
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  if (!usernameRegex.test(username)) {
    err.textContent = 'Username must be 3-20 characters and contain only letters, numbers, and underscores.';
    err.hidden = false;
    err.focus();
    return;
  }
  // Disable button and show loading state
  const submitButton = this.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = 'Creating account...';
  
  try {
    const r = await fetch('/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });

    // try to parse JSON safely
    const json = await r.json().catch(() => ({}));

    // If server asked client to redirect, do so immediately (silent)
    if (json && json.redirect) {
      window.location.href = json.redirect;
      return;
    }

    if (!r.ok) {
      // Show a generic error message for unexpected failures
      err.textContent = json && json.error ? json.error : 'Signup failed.';
      err.hidden = false;
      err.focus();
      submitButton.disabled = false;
      submitButton.textContent = 'Create account';
    } else {
      // Successful signup -> dashboard
      submitButton.textContent = 'Success! Redirecting...';
      window.location.href = '/dashboard.html';
    }
  } catch (errx) {
    err.textContent = 'Network error. Try again later.';
    err.hidden = false;
    err.focus();
    submitButton.disabled = false;
    submitButton.textContent = 'Create account';
  }
});

