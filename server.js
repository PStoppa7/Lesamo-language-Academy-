/* server.js — updated: uses PostgreSQL database instead of JSON file storage */
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const multer = require('multer');
const xss = require('xss');
require('dotenv').config();

// Database imports
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

const SUBMISSIONS_DIR = path.join(__dirname, 'submissions');

// Ensure submissions directory exists
if (!fs.existsSync(SUBMISSIONS_DIR)) {
  fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, SUBMISSIONS_DIR);
  },
  filename: (req, file, cb) => {
    const userId = req.session.userId || 'anon';
    const timestamp = Date.now();
    const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${userId}_${timestamp}_${originalName}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /\.(pdf|doc|docx|txt|jpg|jpeg|png)$/i;
    if (allowedTypes.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, DOC, DOCX, TXT, JPG, PNG'));
    }
  }
});

// Middleware
app.use(helmet());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Secure session
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-changeme',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
}));

// Rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Reduced to 5 attempts per 15 minutes for better security
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please try again later.',
  skipSuccessfulRequests: true,
});

// Stricter rate limiter for login (prevent brute force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  skipSuccessfulRequests: true,
});

app.use('/signup', authLimiter);
app.use('/login', loginLimiter);

// Require authentication middleware for protected pages
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  // not authenticated — redirect to login
  return res.redirect('/login.html');
}

// --- Basic admin auth middleware (HTTP Basic) ---
function basicAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).send('Authentication required');
  }
  const creds = Buffer.from(auth.slice(6), 'base64').toString('utf8').split(':');
  const [user, pass] = creds;
  const ADMIN_USER = process.env.ADMIN_USER || 'admin';
  const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';
  if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
  return res.status(401).send('Invalid credentials');
}

// Basic public routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/signup.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Protected dashboard route (served from private folder)
app.get('/dashboard.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'private', 'dashboard.html'));
});

// Signup route — stores hashed password
app.post('/signup', async (req, res) => {
  try {
    const rawUsername = String(req.body.username || '').trim();
    const rawEmail = String(req.body.email || '').trim();
    const rawPassword = String(req.body.password || '');
    if (!rawUsername || !rawEmail || rawPassword.length < 8) {
      return res.status(400).json({ error: 'Invalid input (check required fields, password length ≥ 8).' });
    }
    
    // Enhanced password validation
    const hasUpperCase = /[A-Z]/.test(rawPassword);
    const hasLowerCase = /[a-z]/.test(rawPassword);
    const hasNumber = /[0-9]/.test(rawPassword);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(rawPassword);
    
    if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
      return res.status(400).json({ 
        error: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.' 
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawEmail)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }
    
    // Validate username (alphanumeric and underscore, 3-20 chars)
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(rawUsername)) {
      return res.status(400).json({ error: 'Username must be 3-20 characters and contain only letters, numbers, and underscores.' });
    }

    const username = xss(rawUsername);
    const email = xss(rawEmail);

    // Check if user already exists
    const existing = await db.getUserByUsernameOrEmail(username) || await db.getUserByEmail(email);
    if (existing) {
      // SILENT redirect instruction: client will follow without showing an error message
      return res.json({ redirect: '/login.html' });
    }

    const saltRounds = Number(process.env.BCRYPT_ROUNDS) || 12;
    const hashed = await bcrypt.hash(rawPassword, saltRounds);

    // Create user in database
    const user = await db.createUser(username, email, hashed);

    req.session.userId = user.id;
    res.status(201).json({ success: true, message: 'Account created.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Login route — compare hash
app.post('/login', async (req, res) => {
  try {
    const rawUsername = String(req.body.username || '').trim();
    const rawPassword = String(req.body.password || '');
    if (!rawUsername || !rawPassword) {
      return res.status(400).json({ error: 'Missing credentials.' });
    }
    const username = xss(rawUsername);
    const user = await db.getUserByUsernameOrEmail(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

    const match = await bcrypt.compare(rawPassword, user.password_hash);


    if (!match) return res.status(401).json({ error: 'Invalid credentials.' });

    req.session.userId = user.id;
    res.json({ success: true, message: 'Logged in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Progress endpoint (save minimal progress)
app.post('/api/progress', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    
    const payload = req.body;
    const progressData = Object.assign({ at: new Date().toISOString() }, payload);
    
    await db.createProgress(userId, progressData);
    res.json({ saved: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.get('/api/progress', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.json({ progress: [] });
    }
    
    const progressEntries = await db.getProgressByUserId(userId);
    // Transform database format to match expected format
    const progress = progressEntries.map(entry => ({
      ...entry.data,
      at: entry.created_at
    }));
    
    res.json({ progress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/login.html');
  });
});

// File submission endpoints
app.post('/api/submit', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const userId = req.session.userId;
    const title = xss(String(req.body.title || '').trim());
    const type = xss(String(req.body.type || 'assignment').trim());
    const notes = xss(String(req.body.notes || '').trim());

    if (!title) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Title is required.' });
    }

    const submission = await db.createSubmission(userId, {
      title: title,
      type: type,
      filename: req.file.originalname,
      storedFilename: req.file.filename,
      filepath: req.file.path,
      notes: notes,
      status: 'pending'
    });

    res.json({ success: true, submission: { id: submission.id, title: submission.title } });
  } catch (err) {
    console.error(err);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get user's submissions
app.get('/api/submissions', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const userSubmissions = await db.getSubmissionsByUserId(userId);
    
    // Transform to match expected format
    const submissions = userSubmissions.map(sub => ({
      id: sub.id,
      userId: sub.user_id,
      title: sub.title,
      type: sub.type,
      filename: sub.filename,
      storedFilename: sub.stored_filename,
      filepath: sub.filepath,
      notes: sub.notes,
      submittedAt: sub.submitted_at,
      status: sub.status
    }));
    
    res.json({ submissions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// --- Admin routes (protected by Basic Auth) ---
// HTML summary of progress (includes username/email when available)
app.get('/admin/progress', basicAuth, async (req, res) => {
  try {
    const allUsers = await db.getAllUsers();
    const allProgress = await db.getAllProgress();

    let html = `<!doctype html><html><head><meta charset="utf-8"><title>Admin - Progress</title>
      <meta name="viewport" content="width=device-width,initial-scale=1"><style>
      body{font-family:system-ui,Arial;margin:1rem;padding:0;color:#0f172a;background:#f7fafc}
      .container{max-width:1200px;margin:0 auto;background:#fff;padding:2rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)}
      .nav-links{margin-bottom:2rem;display:flex;gap:1rem;flex-wrap:wrap}
      .nav-links a{padding:0.5rem 1rem;background:#005fcc;color:#fff;text-decoration:none;border-radius:6px;font-weight:600}
      .nav-links a:hover{background:#004499}
      table{border-collapse:collapse;width:100%;margin-bottom:1rem}
      th,td{padding:.4rem;border:1px solid #ddd;text-align:left;vertical-align:top}
      pre{white-space:pre-wrap;word-break:break-word}
      h1,h2{margin:.5rem 0}
      </style></head><body><div class="container"><h1>Progress (admin)</h1>
      <div class="nav-links">
        <a href="/admin/progress">View Progress</a>
        <a href="/admin/submissions">View Submissions</a>
        <a href="/admin/progress.csv">Export Progress CSV</a>
      </div>
      <p>Users: ${allUsers.length}</p>`;

    // Group progress by user
    const progressByUser = {};
    for (const entry of allProgress) {
      const userId = entry.user_id;
      if (!progressByUser[userId]) {
        progressByUser[userId] = [];
      }
      progressByUser[userId].push(entry);
    }

    for (const [userId, entries] of Object.entries(progressByUser)) {
      const userRecord = allUsers.find(u => u.id === parseInt(userId));
      const displayName = userRecord
        ? `${xss(userRecord.username)}${userRecord.email ? ' (' + xss(userRecord.email) + ')' : ''}`
        : `ID: ${xss(String(userId))}`;

      html += `<h2>User: ${displayName}</h2>`;
      html += `<table><thead><tr><th>At</th><th>Items (count)</th><th>Details</th></tr></thead><tbody>`;
      for (const entry of entries) {
        const at = entry.created_at || '';
        const data = typeof entry.data === 'string' ? JSON.parse(entry.data) : entry.data;
        const itemsCount = Array.isArray(data.items) ? data.items.length : 0;
        const details = xss(JSON.stringify(data, null, 2));
        html += `<tr><td>${at}</td><td>${itemsCount}</td><td><pre>${details}</pre></td></tr>`;
      }
      html += `</tbody></table>`;
    }
    html += `</div></body></html>`;
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// CSV export (includes username/email when available)
app.get('/admin/progress.csv', basicAuth, async (req, res) => {
  try {
    const allUsers = await db.getAllUsers();
    const allProgress = await db.getAllProgress();

    // CSV headers
    const rows = [['userId','username','email','at','itemsCount','itemsJson']];
    for (const entry of allProgress) {
      const userRecord = allUsers.find(u => u.id === entry.user_id);
      const username = userRecord ? (userRecord.username || '') : '';
      const email = userRecord ? (userRecord.email || '') : '';
      const at = entry.created_at || '';
      const data = typeof entry.data === 'string' ? JSON.parse(entry.data) : entry.data;
      const items = data.items || [];
      const itemsCount = Array.isArray(items) ? items.length : 0;
      const itemsJson = JSON.stringify(items).replace(/"/g, '""');
      rows.push([entry.user_id, `"${username.replace(/"/g,'""')}"`, `"${email.replace(/"/g,'""')}"`, at, String(itemsCount), `"${itemsJson}"`]);
    }
    const csv = rows.map(r => r.join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="progress.csv"');
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin route to view submissions
app.get('/admin/submissions', basicAuth, async (req, res) => {
  try {
    const submissions = await db.getAllSubmissions();
    const allUsers = await db.getAllUsers();

    let html = `<!doctype html><html><head><meta charset="utf-8"><title>Admin - Submissions</title>
      <meta name="viewport" content="width=device-width,initial-scale=1"><style>
      body{font-family:system-ui,Arial;margin:1rem;padding:0;color:#0f172a;background:#f7fafc}
      .container{max-width:1200px;margin:0 auto;background:#fff;padding:2rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)}
      h1{margin-top:0;color:#0f172a;border-bottom:3px solid #005fcc;padding-bottom:0.5rem}
      .nav-links{margin-bottom:2rem;display:flex;gap:1rem;flex-wrap:wrap}
      .nav-links a{padding:0.5rem 1rem;background:#005fcc;color:#fff;text-decoration:none;border-radius:6px;font-weight:600}
      .nav-links a:hover{background:#004499}
      table{border-collapse:collapse;width:100%;margin-top:1rem}
      th,td{padding:.75rem;border:1px solid #ddd;text-align:left;vertical-align:top}
      th{background:#f9fafb;font-weight:600;color:#0f172a}
      tr:hover{background:#f9fafb}
      .badge{padding:0.25rem 0.5rem;border-radius:4px;font-size:0.75rem;font-weight:600;text-transform:uppercase}
      .badge-assignment{background:#dbeafe;color:#1e40af}
      .badge-homework{background:#fef3c7;color:#92400e}
      .badge-project{background:#e9d5ff;color:#6b21a8}
      .status-pending{color:#92400e;font-weight:600}
      .status-reviewed{color:#1e40af;font-weight:600}
      .status-graded{color:#065f46;font-weight:600}
      .download-link{color:#005fcc;text-decoration:none;font-weight:600}
      .download-link:hover{text-decoration:underline}
      .empty-state{padding:2rem;text-align:center;color:#6b7280;font-style:italic}
      </style></head><body><div class="container">
      <h1>Student Submissions (Admin)</h1>
      <div class="nav-links">
        <a href="/admin/progress">View Progress</a>
        <a href="/admin/submissions">View Submissions</a>
        <a href="/admin/progress.csv">Export Progress CSV</a>
      </div>`;

    if (submissions.length === 0) {
      html += '<p class="empty-state">No submissions yet.</p>';
    } else {
      html += `<p><strong>Total Submissions:</strong> ${submissions.length}</p>
        <table>
        <thead>
          <tr>
            <th>Student</th>
            <th>Title</th>
            <th>Type</th>
            <th>Filename</th>
            <th>Submitted</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>`;

      for (const sub of submissions) {
        const displayName = sub.username
          ? `${xss(sub.username)}${sub.email ? ' (' + xss(sub.email) + ')' : ''}`
          : `User ID: ${xss(String(sub.user_id))}`;

        const submittedDate = sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : 'N/A';
        
        html += `<tr>
          <td>${displayName}</td>
          <td>${xss(sub.title || 'Untitled')}</td>
          <td><span class="badge badge-${sub.type || 'assignment'}">${xss(sub.type || 'assignment')}</span></td>
          <td>${xss(sub.filename || 'N/A')}</td>
          <td>${submittedDate}</td>
          <td class="status-${sub.status || 'pending'}">${xss(sub.status || 'pending')}</td>
          <td><a href="/admin/submissions/${sub.id}/download" class="download-link">Download</a></td>
        </tr>`;
      }

      html += `</tbody></table>`;
    }

    html += `</div></body></html>`;
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin route to download submission files
app.get('/admin/submissions/:id/download', basicAuth, async (req, res) => {
  try {
    const submissionId = parseInt(req.params.id);
    const submission = await db.getSubmissionById(submissionId);

    if (!submission) {
      return res.status(404).send('Submission not found');
    }

    const filePath = submission.filepath || path.join(SUBMISSIONS_DIR, submission.stored_filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }

    const originalName = submission.filename || 'submission';
    res.download(filePath, originalName, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        if (!res.headersSent) {
          res.status(500).send('Error downloading file');
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});