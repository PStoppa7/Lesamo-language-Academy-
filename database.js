// Database service layer - replaces readData() and writeData()
const { query, getClient } = require('./connection');

// ==================== USERS ====================

async function getAllUsers() {
  const result = await query('SELECT id, username, email, created_at FROM users ORDER BY created_at DESC');
  return result.rows;
}

async function getUserById(userId) {
  const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows[0] || null;
}

async function getUserByUsername(username) {
  const result = await query('SELECT * FROM users WHERE username = $1', [username]);
  return result.rows[0] || null;
}

async function getUserByEmail(email) {
  const result = await query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

async function getUserByUsernameOrEmail(identifier) {
  const result = await query(
    'SELECT * FROM users WHERE username = $1 OR email = $1',
    [identifier]
  );
  return result.rows[0] || null;
}

async function createUser(username, email, passwordHash) {
  const result = await query(
    'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
    [username, email, passwordHash]
  );
  return result.rows[0];
}

async function updateUser(userId, updates) {
  const fields = [];
  const values = [];
  let paramCount = 1;

  if (updates.username) {
    fields.push(`username = $${paramCount++}`);
    values.push(updates.username);
  }
  if (updates.email) {
    fields.push(`email = $${paramCount++}`);
    values.push(updates.email);
  }
  if (updates.passwordHash) {
    fields.push(`password_hash = $${paramCount++}`);
    values.push(updates.passwordHash);
  }

  if (fields.length === 0) return null;

  values.push(userId);
  const result = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

async function deleteUser(userId) {
  await query('DELETE FROM users WHERE id = $1', [userId]);
  return true;
}

// ==================== SUBMISSIONS ====================

async function getAllSubmissions() {
  const result = await query(
    `SELECT s.*, u.username, u.email 
     FROM submissions s 
     JOIN users u ON s.user_id = u.id 
     ORDER BY s.submitted_at DESC`
  );
  return result.rows;
}

async function getSubmissionsByUserId(userId) {
  const result = await query(
    'SELECT * FROM submissions WHERE user_id = $1 ORDER BY submitted_at DESC',
    [userId]
  );
  return result.rows;
}

async function getSubmissionById(submissionId) {
  const result = await query('SELECT * FROM submissions WHERE id = $1', [submissionId]);
  return result.rows[0] || null;
}

async function createSubmission(userId, submissionData) {
  const { title, type, filename, storedFilename, filepath, notes, status } = submissionData;
  const result = await query(
    `INSERT INTO submissions (user_id, title, type, filename, stored_filename, filepath, notes, status) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [userId, title, type, filename, storedFilename, filepath, notes || null, status || 'pending']
  );
  return result.rows[0];
}

async function updateSubmission(submissionId, updates) {
  const fields = [];
  const values = [];
  let paramCount = 1;

  if (updates.title) {
    fields.push(`title = $${paramCount++}`);
    values.push(updates.title);
  }
  if (updates.status) {
    fields.push(`status = $${paramCount++}`);
    values.push(updates.status);
  }
  if (updates.notes !== undefined) {
    fields.push(`notes = $${paramCount++}`);
    values.push(updates.notes);
  }

  if (fields.length === 0) return null;

  values.push(submissionId);
  const result = await query(
    `UPDATE submissions SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

async function deleteSubmission(submissionId) {
  await query('DELETE FROM submissions WHERE id = $1', [submissionId]);
  return true;
}

// ==================== PROGRESS ====================

async function getProgressByUserId(userId) {
  const result = await query(
    'SELECT * FROM progress WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
}

async function createProgress(userId, progressData) {
  const result = await query(
    'INSERT INTO progress (user_id, data) VALUES ($1, $2) RETURNING *',
    [userId, JSON.stringify(progressData)]
  );
  return result.rows[0];
}

async function getAllProgress() {
  const result = await query(
    `SELECT p.*, u.username, u.email 
     FROM progress p 
     JOIN users u ON p.user_id = u.id 
     ORDER BY p.created_at DESC`
  );
  return result.rows;
}

// ==================== STATISTICS ====================

async function getUserStats(userId) {
  const userResult = await query('SELECT COUNT(*) as count FROM users WHERE id = $1', [userId]);
  const submissionsResult = await query('SELECT COUNT(*) as count FROM submissions WHERE user_id = $1', [userId]);
  const progressResult = await query('SELECT COUNT(*) as count FROM progress WHERE user_id = $1', [userId]);

  return {
    userExists: parseInt(userResult.rows[0].count) > 0,
    submissionCount: parseInt(submissionsResult.rows[0].count),
    progressCount: parseInt(progressResult.rows[0].count),
  };
}

module.exports = {
  // Users
  getAllUsers,
  getUserById,
  getUserByUsername,
  getUserByEmail,
  getUserByUsernameOrEmail,
  createUser,
  updateUser,
  deleteUser,
  
  // Submissions
  getAllSubmissions,
  getSubmissionsByUserId,
  getSubmissionById,
  createSubmission,
  updateSubmission,
  deleteSubmission,
  
  // Progress
  getProgressByUserId,
  createProgress,
  getAllProgress,
  
  // Statistics
  getUserStats,
};




