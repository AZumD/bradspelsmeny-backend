// index.js
const cors = require('cors');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); // Middleware to parse JSON

// Connect to SQLite database
const db = new sqlite3.Database(path.join(__dirname, 'bradspelsmeny.db'), err => {
  if (err) return console.error('DB connection error:', err);
  console.log('✅ Connected to SQLite DB');

  db.run(`
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title_sv TEXT NOT NULL,
    title_en TEXT NOT NULL,
    description_sv TEXT,
    description_en TEXT,
    players TEXT,
    time TEXT,
    age TEXT,
    tags TEXT,
    img TEXT,
    rules TEXT
  )
  `);
});

// Health check
app.get('/ping', (req, res) => {
  res.send('pong');
});

// GET all games
app.get('/games', (req, res) => {
  db.all('SELECT * FROM games', [], (err, rows) => {
    if (err) {
      console.error('❌ Failed to fetch games:', err);
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.json(rows);
    }
  });
});

// PUT update a game
app.delete('/games/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.run('DELETE FROM games WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('❌ Failed to delete game:', err);
      res.status(500).json({ error: 'Failed to delete game' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'Game not found' });
    } else {
      res.json({ message: '✅ Game deleted successfully' });
    }
  });
});

// 🔥 POST a new game
app.post('/games', (req, res) => {
  const {
    title_sv,
    title_en,
    description_sv,
    description_en,
    players,
    time,
    age,
    tags,
    img,
    rules
  } = req.body;

  const query = `
  INSERT INTO games (
    title_sv, title_en, description_sv, description_en,
    players, time, age, tags, img, rules
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(query, [
    title_sv,
    title_en,
    description_sv,
    description_en,
    players,
    time,
    age,
    Array.isArray(tags) ? tags.join(',') : tags, // support array or string
         img,
         rules
  ], function (err) {
    if (err) {
      console.error('❌ Failed to insert game:', err);
      return res.status(500).json({ error: 'Failed to insert game' });
    }
    res.status(201).json({ message: '✅ Game added!', id: this.lastID });
  });
});
app.put('/games/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const {
    title_sv,
    title_en,
    description_sv,
    description_en,
    players,
    time,
    age,
    tags,
    img,
    rules
  } = req.body;

  db.run(
    `UPDATE games SET
    title_sv = ?,
    title_en = ?,
    description_sv = ?,
    description_en = ?,
    players = ?,
    time = ?,
    age = ?,
    tags = ?,
    img = ?,
    rules = ?
    WHERE id = ?`,
    [
      title_sv,
      title_en,
      description_sv,
      description_en,
      players,
      time,
      age,
      tags,
      img,
      rules,
      id
    ],
    function (err) {
      if (err) {
        console.error('Error updating game:', err);
        res.status(500).json({ error: 'Failed to update game' });
      } else {
        res.json({ message: 'Game updated successfully' });
      }
    }
  );
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
