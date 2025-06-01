// index.js
const cors = require('cors');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Create upload folder if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer setup for handling file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const unique = Date.now();
    cb(null, `${base}-${unique}${ext}`);
  }
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

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

app.get('/ping', (req, res) => {
  res.send('pong');
});

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

app.post('/games', upload.fields([{ name: 'imgFile' }, { name: 'rulesFile' }]), (req, res) => {
  const body = req.body;
  const files = req.files || {};

  const imgUrl = files.imgFile?.[0] ? `/uploads/${files.imgFile[0].filename}` : body.img;
  const rulesUrl = files.rulesFile?.[0] ? `/uploads/${files.rulesFile[0].filename}` : body.rules;

  const query = `
  INSERT INTO games (
    title_sv, title_en, description_sv, description_en,
    players, time, age, tags, img, rules
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(query, [
    body.title_sv || body.title_en || '',
    body.title_en || '',

    body.description_sv || '',
    body.description_en || '',
    body.players || '',
    body.time || '',
    body.age || '',
    Array.isArray(body.tags) ? body.tags.join(',') : body.tags || '',
    imgUrl,
    rulesUrl
  ], function (err) {
    if (err) {
      console.error('❌ Failed to insert game:', err);
      return res.status(500).json({ error: 'Failed to insert game' });
    }
    res.status(201).json({ message: '✅ Game added!', id: this.lastID });
  });
});

app.put('/games/:id', upload.fields([{ name: 'imgFile' }, { name: 'rulesFile' }]), (req, res) => {
  const id = parseInt(req.params.id);
  const body = req.body;
  const files = req.files || {};

  const imgUrl = files.imgFile?.[0] ? `/uploads/${files.imgFile[0].filename}` : body.img;
  const rulesUrl = files.rulesFile?.[0] ? `/uploads/${files.rulesFile[0].filename}` : body.rules;

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
      body.title_sv || body.title_en || '',
      body.title_en || '',
      body.description_sv || '',
      body.description_en || '',
      body.players || '',
      body.time || '',
      body.age || '',
      Array.isArray(body.tags) ? body.tags.join(',') : body.tags || '',
      imgUrl,
      rulesUrl,
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
app.post('/import', express.json(), (req, res) => {
  const games = req.body;

  if (!Array.isArray(games)) {
    return res.status(400).json({ error: 'Expected an array of games.' });
  }

  const stmt = db.prepare(`
    INSERT INTO games (
      title_sv, title_en, description_sv, description_en,
      players, time, age, tags, img, rules
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const game of games) {
    stmt.run(
      game.title_sv || '',
      game.title_en || '',
      game.description_sv || '',
      game.description_en || '',
      game.players || '',
      game.time || '',
      game.age || '',
      Array.isArray(game.tags) ? game.tags.join(',') : game.tags || '',
      game.img || '',
      game.rules || ''
    );
    count++;
  }

  stmt.finalize();
  res.json({ message: `✅ Imported ${count} games` });
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
