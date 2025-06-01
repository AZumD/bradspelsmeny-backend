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

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      password TEXT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      id_number TEXT,
      id_image_path TEXT
    )
  `);
});

app.get('/ping', (req, res) => {
  res.send('pong');
});

// ----- GAMES -----
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
      title_sv = ?, title_en = ?, description_sv = ?, description_en = ?,
      players = ?, time = ?, age = ?, tags = ?, img = ?, rules = ?
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
        console.error('❌ Failed to update game:', err);
        res.status(500).json({ error: 'Failed to update game' });
      } else {
        res.json({ message: '✅ Game updated' });
      }
    }
  );
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

// ----- USERS -----
app.get('/users', (req, res) => {
  db.all('SELECT * FROM users', [], (err, rows) => {
    if (err) {
      console.error('❌ Failed to fetch users:', err);
      return res.status(500).json({ error: 'Failed to get users' });
    }
    res.json(rows);
  });
});

app.post('/users', upload.single('idImage'), (req, res) => {
  const {
    username,
    password,
    firstName,
    lastName,
    phone,
    email,
    idNumber
  } = req.body;

  const idImagePath = req.file ? `/uploads/${req.file.filename}` : null;

  db.run(`
    INSERT INTO users (
      username, password, first_name, last_name, phone, email, id_number, id_image_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  [username, password, firstName, lastName, phone, email, idNumber, idImagePath],
  function (err) {
    if (err) {
      console.error('❌ Failed to insert user:', err);
      return res.status(500).json({ error: 'Failed to add user' });
    }
    res.status(201).json({ message: '✅ User added', id: this.lastID });
  });
});

app.delete('/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.run('DELETE FROM users WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('❌ Failed to delete user:', err);
      res.status(500).json({ error: 'Failed to delete user' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'User not found' });
    } else {
      res.json({ message: '✅ User deleted successfully' });
    }
  });
});

app.put('/users/:id', upload.single('idImage'), (req, res) => {
  const id = parseInt(req.params.id);
  const {
    username,
    password,
    firstName,
    lastName,
    phone,
    email,
    idNumber
  } = req.body;

  const idImagePath = req.file ? `/uploads/${req.file.filename}` : null;

  db.run(`
    UPDATE users SET
      username = ?, password = ?, first_name = ?, last_name = ?,
      phone = ?, email = ?, id_number = ?, id_image_path = ?
    WHERE id = ?
  `,
  [username, password, firstName, lastName, phone, email, idNumber, idImagePath, id],
  function (err) {
    if (err) {
      console.error('❌ Failed to update user:', err);
      res.status(500).json({ error: 'Failed to update user' });
    } else {
      res.json({ message: '✅ User updated' });
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
