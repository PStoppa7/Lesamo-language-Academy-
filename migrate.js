// Migration script to move data from JSON file to PostgreSQL
// Run this once: node db/migrate.js

const fs = require('fs');
const path = require('path');
const { query } = require('./connection');
const db = require('./database');

async function migrateData() {
  const DATA_FILE = path.join(__dirname, '..', 'data.json');
  
  console.log('Starting migration from JSON to PostgreSQL...');
  
  // Check if data.json exists
  if (!fs.existsSync(DATA_FILE)) {
    console.log('No data.json file found. Migration skipped.');
    return;
  }

  // Read existing data
  let jsonData;
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    jsonData = JSON.parse(raw || '{}');
  } catch (err) {
    console.error('Error reading data.json:', err);
    return;
  }

  const users = jsonData.users || [];
  const submissions = jsonData.submissions || [];
  const progress = jsonData.progress || {};

  console.log(`Found ${users.length} users, ${submissions.length} submissions, ${Object.keys(progress).length} progress entries`);

  // Migrate users
  let migratedUsers = 0;
  for (const user of users) {
    try {
      // Check if user already exists
      const existing = await db.getUserByUsername(user.username) || await db.getUserByEmail(user.email);
      if (existing) {
        console.log(`User ${user.username} already exists, skipping...`);
        continue;
      }

      await db.createUser(user.username, user.email, user.passwordHash);
      migratedUsers++;
      console.log(`Migrated user: ${user.username}`);
    } catch (err) {
      console.error(`Error migrating user ${user.username}:`, err.message);
    }
  }

  // Migrate submissions
  let migratedSubmissions = 0;
  for (const submission of submissions) {
    try {
      // Get user ID (might need to map old ID to new ID)
      const user = await db.getUserById(submission.userId);
      if (!user) {
        console.log(`User ID ${submission.userId} not found, skipping submission ${submission.id}`);
        continue;
      }

      await db.createSubmission(user.id, {
        title: submission.title,
        type: submission.type || 'assignment',
        filename: submission.filename,
        storedFilename: submission.storedFilename,
        filepath: submission.filepath,
        notes: submission.notes,
        status: submission.status || 'pending',
      });
      migratedSubmissions++;
      console.log(`Migrated submission: ${submission.title}`);
    } catch (err) {
      console.error(`Error migrating submission ${submission.id}:`, err.message);
    }
  }

  // Migrate progress
  let migratedProgress = 0;
  for (const [userId, progressEntries] of Object.entries(progress)) {
    try {
      // Get user ID (handle both old ID format and new)
      const user = await db.getUserById(parseInt(userId));
      if (!user) {
        console.log(`User ID ${userId} not found, skipping progress entries`);
        continue;
      }

      // Create a progress entry for each progress item
      for (const entry of progressEntries) {
        await db.createProgress(user.id, entry);
        migratedProgress++;
      }
      console.log(`Migrated ${progressEntries.length} progress entries for user ${userId}`);
    } catch (err) {
      console.error(`Error migrating progress for user ${userId}:`, err.message);
    }
  }

  console.log('\nMigration completed!');
  console.log(`- Users: ${migratedUsers}/${users.length}`);
  console.log(`- Submissions: ${migratedSubmissions}/${submissions.length}`);
  console.log(`- Progress entries: ${migratedProgress}`);
  
  // Backup original file
  const backupFile = path.join(__dirname, '..', 'data.json.backup');
  fs.copyFileSync(DATA_FILE, backupFile);
  console.log(`\nOriginal data.json backed up to data.json.backup`);
  console.log('You can now delete data.json after verifying the migration.');
}

// Run migration
migrateData()
  .then(() => {
    console.log('Migration script finished.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });




