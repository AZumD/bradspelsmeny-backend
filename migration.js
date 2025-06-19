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
  try {
    // 1. Create a temporary table with new structure
    await pool.query(`
      CREATE TABLE party_session_rounds_new (
        id SERIAL PRIMARY KEY,
        session_id INT REFERENCES party_sessions(id),
        round_number INT NOT NULL,
        winners INT[] NOT NULL DEFAULT '{}',
        losers INT[] DEFAULT '{}',
        notes TEXT
      );
    `);

    // 2. Copy data from old table, converting winner_id to winners array
    await pool.query(`
      INSERT INTO party_session_rounds_new (id, session_id, round_number, winners, losers, notes)
      SELECT 
        id,
        session_id,
        round_number,
        ARRAY[winner_id] as winners,
        losers,
        notes
      FROM party_session_rounds;
    `);

    // 3. Drop old table and rename new one
    await pool.query('DROP TABLE party_session_rounds;');
    await pool.query('ALTER TABLE party_session_rounds_new RENAME TO party_session_rounds;');

    console.log('✅ Successfully updated party_session_rounds table');
  } catch (err) {
    console.error('❌ Error updating party_session_rounds table:', err);
    throw err;
  }
};

// Create session_players table
const createSessionPlayersTable = async (pool) => {
  try {
    await pool.query(`
      CREATE TABLE session_players (
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

// Run migrations
const runMigrations = async () => {
  try {
    await updatePartySessionRounds(pool);
    await createSessionPlayersTable(pool);
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
