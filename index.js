const cors = require('cors');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

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
});

app.get('/ping', (req, res) => {
  res.send('pong');
});

app.get('/games', (req, res) => {
  db.all('SELECT * FROM games', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Internal server error' });
    const parsedRows = rows.map(game => ({
      ...game,
      staff_picks: game.staff_picks ? JSON.parse(game.staff_picks) : []
    }));
    res.json(parsedRows);
  });
});

app.post('/games', upload.fields([{ name: 'imgFile' }, { name: 'rulesFile' }]), (req, res) => {
  const body = req.body;
  const files = req.files || {};

  const imgUrl = files.imgFile?.[0] ? `/uploads/${files.imgFile[0].filename}` : body.img;
  const rulesUrl = files.rulesFile?.[0] ? `/uploads/${files.rulesFile[0].filename}` : body.rules;

  const slowDay = parseInt(body.slow_day_only) === 1 ? 1 : 0;
  const trusted = parseInt(body.trusted_only) === 1 ? 1 : 0;
  const maxSize = parseInt(body.max_table_size) || null;
  const rating = parseInt(body.condition_rating) || null;
  const staffList = body.staff_picks
    ? JSON.stringify(body.staff_picks.split(',').map(name => name.trim()))
    : '[]';

  db.run(`
    INSERT INTO games (
      title_sv, title_en, description_sv, description_en, players, time, age, tags,
      img, rules, slow_day_only, trusted_only, max_table_size, condition_rating, staff_picks
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      slowDay,
      trusted,
      maxSize,
      rating,
      staffList
    ],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to insert game' });
      res.status(201).json({ message: '✅ Game added!', id: this.lastID });
    });
});

app.post('/lend/:id', (req, res) => {
  const gameId = parseInt(req.params.id);
  const { userId, note } = req.body;

  db.serialize(() => {
    db.run(`
      UPDATE games
      SET lent_out = 1,
          times_lent = COALESCE(times_lent, 0) + 1,
          last_lent = DATETIME('now')
      WHERE id = ?
    `, [gameId]);

    db.run(`
      INSERT INTO game_history (game_id, user_id, action, note)
      VALUES (?, ?, 'lent', ?)
    `, [gameId, userId || null, note || null], function (err) {
      if (err) return res.status(500).json({ error: 'Failed to log lending' });
      res.json({ message: '✅ Game lent out and logged' });
    });
  });
});

app.put('/games/:id', upload.fields([{ name: 'imgFile' }, { name: 'rulesFile' }]), (req, res) => {
  const id = parseInt(req.params.id);
  const body = req.body;
  const files = req.files || {};

  const imgUrl = files.imgFile?.[0] ? `/uploads/${files.imgFile[0].filename}` : body.img;
  const rulesUrl = files.rulesFile?.[0] ? `/uploads/${files.rulesFile[0].filename}` : body.rules;

  const slowDay = parseInt(body.slow_day_only) === 1 ? 1 : 0;
  const trusted = parseInt(body.trusted_only) === 1 ? 1 : 0;
  const maxSize = parseInt(body.max_table_size) || null;
  const rating = parseInt(body.condition_rating) || null;
  const staffList = body.staff_picks
    ? JSON.stringify(body.staff_picks.split(',').map(name => name.trim()))
    : '[]';

  db.run(`
    UPDATE games SET
      title_sv = ?, title_en = ?, description_sv = ?, description_en = ?, players = ?, time = ?, age = ?, tags = ?,
      img = ?, rules = ?, slow_day_only = ?, trusted_only = ?, max_table_size = ?, condition_rating = ?, staff_picks = ?
    WHERE id = ?`,
    [
      body.title_sv || '',
      body.title_en || '',
      body.description_sv || '',
      body.description_en || '',
      body.players || '',
      body.time || '',
      body.age || '',
      Array.isArray(body.tags) ? body.tags.join(',') : body.tags || '',
      imgUrl,
      rulesUrl,
      slowDay,
      trusted,
      maxSize,
      rating,
      staffList,
      id
    ],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to update game' });
      res.json({ message: '✅ Game updated' });
    });
});
