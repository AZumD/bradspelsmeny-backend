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

const upload = multer();

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

// [...truncated existing endpoints for brevity...]

// COMPLETE ORDER: create user if not exists, then lend out game
app.post('/order-game/:id/complete', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const orderRes = await pool.query('SELECT * FROM game_orders WHERE id = $1', [id]);
    const order = orderRes.rows[0];
    if (!order) return res.status(404).json({ error: "Order not found" });

    const standardizedPhone = order.phone.replace(/\D/g, '');

    const existingUserRes = await pool.query(
      'SELECT * FROM users WHERE phone = $1',
      [standardizedPhone]
    );
    let userId;

    if (existingUserRes.rows.length > 0) {
      userId = existingUserRes.rows[0].id;
    } else {
      const newUserRes = await pool.query(
        `INSERT INTO users (first_name, last_name, phone) VALUES ($1, $2, $3) RETURNING id`,
                                          [order.first_name, order.last_name, standardizedPhone]
      );
      userId = newUserRes.rows[0].id;
    }

    await pool.query(`
    UPDATE games
    SET lent_out = true,
    last_lent = NOW(),
                     times_lent = COALESCE(times_lent, 0) + 1
                     WHERE id = $1
                     `, [order.game_id]);

    await pool.query(`
    INSERT INTO game_history (game_id, user_id, action, note)
    VALUES ($1, $2, 'lend', $3)
    `, [order.game_id, userId, `Auto-lend via order system (Table ${order.table_id})`]);

    await pool.query('DELETE FROM game_orders WHERE id = $1', [id]);

    res.json({ message: '✅ Order completed' });
  } catch (err) {
    console.error("❌ Failed to complete order:", err);
    res.status(500).json({ error: "Failed to complete order" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = { verifyToken };
