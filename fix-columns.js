const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('bradspelsmeny.db');

const columnsToEnsure = [
    { name: 'lent_out', type: 'INTEGER DEFAULT 0' },
{ name: 'slow_day_only', type: 'INTEGER DEFAULT 0' },
{ name: 'trusted_only', type: 'INTEGER DEFAULT 0' },
{ name: 'max_table_size', type: 'INTEGER' },
{ name: 'condition_rating', type: 'INTEGER' },
{ name: 'staff_picks', type: 'TEXT DEFAULT "[]"' },
{ name: 'times_lent', type: 'INTEGER DEFAULT 0' },
{ name: 'last_lent', type: 'DATETIME' }
];

db.all(`PRAGMA table_info(games);`, [], (err, result) => {
    if (err) return console.error("❌ Failed to read table info:", err);

    const existingColumns = result.map(col => col.name);

    columnsToEnsure.forEach(col => {
        if (!existingColumns.includes(col.name)) {
            db.run(`ALTER TABLE games ADD COLUMN ${col.name} ${col.type}`, err => {
                if (err) {
                    console.error(`❌ Failed to add ${col.name}:`, err.message);
                } else {
                    console.log(`✅ Column added: ${col.name}`);
                }
            });
        } else {
            console.log(`ℹ️ Column already exists: ${col.name}`);
        }
    });
});
