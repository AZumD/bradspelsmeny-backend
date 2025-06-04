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
