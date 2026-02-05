// db/connection.js
// Database connection module for PostgreSQL
const { Pool } = require('pg');
require('dotenv').config();

// Fallback connection string if DATABASE_URL is not set
const localConnectionString = 'postgresql://postgres:11March1999%24@localhost:5432/nthabeleng';

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || localConnectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection cannot be established
});

// Log when successfully connected
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

// Handle unexpected errors
pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  // Do NOT exit the process in production — just log
  if (process.env.NODE_ENV === 'production') return;
  process.exit(-1);
});

// Helper function to execute queries safely
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('❌ Database query error', { text, error: error.message });
    throw error; // Let route handlers deal with it
  }
}

// Helper function to get a client from the pool for transactions
function getClient() {
  return pool.connect();
}

module.exports = {
  pool,
  query,
  getClient,
};

