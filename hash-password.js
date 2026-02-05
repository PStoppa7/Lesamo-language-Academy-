const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'nthabeleng',
  password: '11March1999$',
  port: 5432,
});

async function hashPassword() {
  try {
    const plainPassword = 'password123'; // current password in DB
    const saltRounds = 10;

    const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);

    await pool.query(
      'UPDATE users SET password = $1 WHERE username = $2',
      [hashedPassword, 'Phenyo_Sebogodi']
    );

    console.log('✅ Password hashed and updated successfully!');
  } catch (err) {
    console.error('❌ Error hashing password:', err);
  } finally {
    await pool.end();
  }
}

hashPassword();
