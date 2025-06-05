require('dotenv').config();

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET is not defined in environment variables.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const upload = multer(); // For handling multipart/form-data

app.use(cors({
  origin: 'https://azumd.github.io',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

app.post('/admin/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(`
    INSERT INTO admin_users (username, password)
    VALUES ($1, $2)
    RETURNING id, username
    `, [username, hash]);

    res.status(201).json({ message: '✅ Admin created', user: result.rows[0] });
  } catch (err) {
    console.error('❌ Failed to register admin:', err);
    res.status(500).json({ error: 'Failed to register admin' });
  }
});

app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    console.log('🚫 Missing login fields');
    return res.status(400).json({ error: 'Missing username or password' });
  }

  try {
    const result = await pool.query('SELECT * FROM admin_users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) {
      console.log('❌ No such user:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      console.log('❌ Password mismatch');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '2h' });

    console.log(`✅ Admin login: ${username}`);
    res.json({ token });
  } catch (err) {
    console.error('❌ Login failed:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/games', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM games ORDER BY title_sv ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Failed to fetch games:', err);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

app.post('/games', verifyToken, upload.none(), async (req, res) => {
  const {
    title_sv, title_en, description_sv, description_en,
    min_players, max_players, play_time,
    age, tags, image,
    slow_day_only, trusted_only, condition_rating, staff_picks, min_table_size
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO games (
        title_sv, title_en, description_sv, description_en,
        min_players, max_players, play_time,
        age, tags, image,
        slow_day_only, trusted_only, condition_rating, staff_picks, min_table_size
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
                                    [
                                      title_sv, title_en, description_sv, description_en,
                                    min_players, max_players, play_time,
                                    age, tags, image,
                                    !!slow_day_only, !!trusted_only, condition_rating || null, staff_picks || null, min_table_size || null
                                    ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Failed to add game:', err);
    res.status(500).json({ error: 'Failed to add game' });
  }
});

app.put('/games/:id', verifyToken, upload.none(), async (req, res) => {
  const { id } = req.params;
  const {
    title_sv, title_en, description_sv, description_en,
    min_players, max_players, play_time,
    age, tags, image,
    slow_day_only, trusted_only, condition_rating, staff_picks, min_table_size
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE games SET
      title_sv=$1, title_en=$2, description_sv=$3, description_en=$4,
      min_players=$5, max_players=$6, play_time=$7,
      age=$8, tags=$9, image=$10,
      slow_day_only=$11, trusted_only=$12, condition_rating=$13,
      staff_picks=$14, min_table_size=$15
      WHERE id=$16 RETURNING *`,
      [
        title_sv, title_en, description_sv, description_en,
        min_players, max_players, play_time,
        age, tags, image,
        !!slow_day_only, !!trusted_only, condition_rating || null,
        staff_picks || null, min_table_size || null,
        id
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Failed to update game:', err);
    res.status(500).json({ error: 'Failed to update game' });
  }
});

app.get('/users', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY last_name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Failed to fetch users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/users', verifyToken, async (req, res) => {
  const { first_name, last_name, phone } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, phone) VALUES ($1, $2, $3) RETURNING *`,
                                    [first_name, last_name, phone]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Failed to add user:', err);
    res.status(500).json({ error: 'Failed to add user' });
  }
});

app.get('/stats/total-games', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM games');
    res.json({ total: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('❌ Failed to fetch total games:', err);
    res.status(500).json({ error: 'Failed to fetch total games' });
  }
});

app.get('/stats/lent-out', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM game_history WHERE returned_at IS NULL');
    res.json({ lentOut: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('❌ Failed to fetch lent out games:', err);
    res.status(500).json({ error: 'Failed to fetch lent out games' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = { verifyToken };
