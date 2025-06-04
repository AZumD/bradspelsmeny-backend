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
app.get('/users', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY last_name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Failed to fetch users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
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
