const cors = require('cors');
const express = require('express');
const { Pool } = require('pg');
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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/ping', (req, res) => {
  res.send('pong');
});

app.get('/games', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM games');
    const parsedRows = result.rows.map(game => ({
      ...game,
      staff_picks: game.staff_picks ? JSON.parse(game.staff_picks) : []
    }));
    res.json(parsedRows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/games', upload.fields([{ name: 'imgFile' }, { name: 'rulesFile' }]), async (req, res) => {
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

  try {
    await pool.query(`
      INSERT INTO games (
        title_sv, title_en, description_sv, description_en, players, time, age, tags,
        img, rules, slow_day_only, trusted_only, max_table_size, condition_rating, staff_picks
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
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
      ]
    );
    res.status(201).json({ message: '✅ Game added!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to insert game' });
  }
});

app.post('/lend/:id', async (req, res) => {
  const gameId = parseInt(req.params.id);
  const { userId, note } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      UPDATE games
      SET lent_out = true,
          times_lent = COALESCE(times_lent, 0) + 1,
          last_lent = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [gameId]);

    await client.query(`
      INSERT INTO game_history (game_id, user_id, action, note)
      VALUES ($1, $2, 'lent', $3)
    `, [gameId, userId || null, note || null]);

    await client.query('COMMIT');
    res.json({ message: '✅ Game lent out and logged' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to log lending' });
  } finally {
    client.release();
  }
});

app.put('/games/:id', upload.fields([{ name: 'imgFile' }, { name: 'rulesFile' }]), async (req, res) => {
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

  try {
    await pool.query(`
      UPDATE games SET
        title_sv = $1, title_en = $2, description_sv = $3, description_en = $4,
        players = $5, time = $6, age = $7, tags = $8,
        img = $9, rules = $10, slow_day_only = $11, trusted_only = $12,
        max_table_size = $13, condition_rating = $14, staff_picks = $15
      WHERE id = $16`,
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
      ]
    );
    res.json({ message: '✅ Game updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update game' });
  }
});
