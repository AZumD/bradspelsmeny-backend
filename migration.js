require('dotenv').config();
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./bradspelsmeny.db');

const columnsToAdd = [
    { name: 'slow_day_only', type: 'BOOLEAN DEFAULT 0' },
{ name: 'trusted_only', type: 'BOOLEAN DEFAULT 0' },
{ name: 'max_table_size', type: 'INTEGER DEFAULT 4' },
{ name: 'times_lent', type: 'INTEGER DEFAULT 0' },
{ name: 'staff_picks', type: 'TEXT DEFAULT ""' },
{ name: 'condition_rating', type: 'INTEGER DEFAULT 3' },
{ name: 'last_lent', type: 'DATETIME' }
];

columnsToAdd.forEach(col => {
    db.run(`ALTER TABLE games ADD COLUMN ${col.name} ${col.type}`, (err) => {
        if (err && !err.message.includes('duplicate')) {
            console.error(`Failed to add ${col.name}:`, err.message);
        }
    });
});

db.close();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Migration to update party_session_rounds table
const updatePartySessionRounds = async (pool) => {
  // This migration is now obsolete and has been run.
  // We'll keep the function signature to avoid breaking the migration chain,
  // but it will no longer do anything.
  console.log('✅ Skipping obsolete party_session_rounds migration');
  return;
};

// Create session_players table
const createSessionPlayersTable = async (pool) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS session_players (
        session_id INT REFERENCES party_sessions(id),
        user_id INT REFERENCES users(id),
        added_by INT REFERENCES users(id),
        PRIMARY KEY (session_id, user_id)
      );
    `);

    console.log('✅ Successfully created session_players table');
  } catch (err) {
    console.error('❌ Error creating session_players table:', err);
    throw err;
  }
};

// Create party_session_members table
const createPartySessionMembersTable = async (pool) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS party_session_members (
        session_id INTEGER REFERENCES party_sessions(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        added_by INTEGER REFERENCES users(id),
        added_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (session_id, user_id)
      );
    `);
    console.log('✅ Successfully ensured party_session_members table exists');
  } catch (err) {
    console.error('❌ Error creating party_session_members table:', err);
    throw err;
  }
};

// Add active_session_id to parties and set up the foreign key constraint
const addActiveSessionIdToParties = async (pool) => {
  // This migration is now obsolete, the logic is handled by a subquery.
  // We are now dropping the column to clean up the schema.
  try {
    // First, remove the foreign key constraint if it exists
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'fk_active_session'
        ) THEN
          ALTER TABLE parties DROP CONSTRAINT fk_active_session;
        END IF;
      END $$;
    `);

    // Now, drop the column if it exists
    await pool.query(`
      ALTER TABLE parties
      DROP COLUMN IF EXISTS active_session_id;
    `);
    console.log('✅ Dropped obsolete active_session_id column from parties table');
  } catch (err) {
    console.error('❌ Error dropping active_session_id column:', err);
    throw err;
  }
};

// Run migrations
const runMigrations = async () => {
  try {
    await updatePartySessionRounds(pool);
    await createSessionPlayersTable(pool);
    await createPartySessionMembersTable(pool);
    await addActiveSessionIdToParties(pool);
    console.log('🎉 All migrations completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

runMigrations();
