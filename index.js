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

app.use('/uploads/avatars', express.static(path.join(__dirname, 'uploads', 'avatars')));


app.post('/users/:id/avatar', verifyToken, upload.single('avatar'), async (req, res) => {
  const { id } = req.params;

  // Only owner or admin can upload avatar
  if (req.user.id !== parseInt(id) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    // Save file to a folder, e.g. ./uploads/avatars/, or use cloud storage
    const avatarFolder = path.join(__dirname, 'uploads', 'avatars');
    if (!fs.existsSync(avatarFolder)) {
      fs.mkdirSync(avatarFolder, { recursive: true });
    }

    // Generate unique filename (e.g., userID + timestamp + extension)
    const ext = path.extname(req.file.originalname);
    const filename = `avatar_${id}_${Date.now()}${ext}`;
    const filepath = path.join(avatarFolder, filename);

    // Write file to disk
    fs.writeFileSync(filepath, req.file.buffer);

    // Construct URL (adjust base URL as needed)
    const avatarUrl = `/uploads/avatars/${filename}`;

    // Update DB with avatar URL
    const result = await pool.query(
      'UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING avatar_url',
                                    [avatarUrl, id]
    );

    res.json({ avatar_url: avatarUrl });
  } catch (err) {
    console.error('❌ Failed to upload avatar:', err);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
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

function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  });
}

app.get('/', (req, res) => {
  res.send('🎲 Board Game Backend API is running.');
});

// ... [REMAINDER OF FILE UNCHANGED]

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});

module.exports = { verifyToken };


// 🧑‍💼 User Registration
app.post('/register', async (req, res) => {
  const { first_name, last_name, phone, password } = req.body;
  if (!first_name || !last_name || !phone || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    const existingUser = result.rows[0];

    if (existingUser) {
      if (existingUser.password) {
        // User is already registered
        return res.status(400).json({ error: 'Phone number already registered' });
      } else {
        // User exists as guest → promote to member
        const hash = await bcrypt.hash(password, 10);
        const update = await pool.query(
          `UPDATE users SET password = $1 WHERE id = $2 RETURNING id, first_name, last_name, phone`,
          [hash, existingUser.id]
        );

        const token = jwt.sign({ id: update.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '2h' });
        return res.status(200).json({ token, user: update.rows[0] });
      }
    }

    // Create new member
    const hash = await bcrypt.hash(password, 10);
    const insert = await pool.query(`
    INSERT INTO users (first_name, last_name, phone, password)
    VALUES ($1, $2, $3, $4)
    RETURNING id, first_name, last_name, phone
    `, [first_name, last_name, phone, hash]);

    const token = jwt.sign({ id: insert.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '2h' });
    res.status(201).json({ token, user: insert.rows[0] });

  } catch (err) {
    console.error('❌ Failed to register user:', err);
    res.status(500).json({ error: 'Failed to register user' });
  }
});


// 🔑 User Login
app.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: 'Missing phone or password' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: 'user' }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token, user: { id: user.id, first_name: user.first_name, last_name: user.last_name, phone: user.phone } });
  } catch (err) {
    console.error('❌ User login failed:', err);
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
    age, tags, img,
    slow_day_only, trusted_only, condition_rating, staff_picks, min_table_size
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO games (
        title_sv, title_en, description_sv, description_en,
        min_players, max_players, play_time,
        age, tags, img,
        slow_day_only, trusted_only, condition_rating, staff_picks, min_table_size
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
                                    [
                                      title_sv, title_en, description_sv, description_en,
                                    min_players, max_players, play_time,
                                    age, tags, img,
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
    age, tags, img,
    slow_day_only, trusted_only, condition_rating, staff_picks, min_table_size
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE games SET
      title_sv=$1, title_en=$2, description_sv=$3, description_en=$4,
      min_players=$5, max_players=$6, play_time=$7,
      age=$8, tags=$9, img=$10,
      slow_day_only=$11, trusted_only=$12, condition_rating=$13,
      staff_picks=$14, min_table_size=$15
      WHERE id=$16 RETURNING *`,
      [
        title_sv, title_en, description_sv, description_en,
        min_players, max_players, play_time,
        age, tags, img,
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
  console.log("📦 Incoming /users body:", req.body); // 🔍 Log the actual data

  const { first_name, last_name, phone } = req.body;

  if (!first_name || !last_name || !phone) {
    return res.status(400).json({ error: 'Missing user data' });
  }

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

app.get('/users/:id', verifyToken, async (req, res) => {
  const { id } = req.params;

  // Allow user to get only their own profile or admin
  if (req.user.id !== parseInt(id) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, phone, email, avatar_url, bio, membership_status, created_at, updated_at
      FROM users WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Failed to fetch user profile:', err);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});



app.put('/users/:id', verifyToken, async (req, res) => {
  const { id } = req.params;

  // Only owner or admin can update
  if (req.user.id !== parseInt(id) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const {
    first_name,
    last_name,
    phone,
    email,
    bio,
    membership_status // Optional: Only allow admin to update this?
  } = req.body;

  // Optional: Add validation for email format, membership_status values here

  try {
    // For membership_status, only admin can update it, else keep existing
    const membershipStatusToSet = (req.user.role === 'admin' && membership_status) ? membership_status : undefined;

    const result = await pool.query(
      `UPDATE users SET
      first_name = COALESCE($1, first_name),
                                    last_name = COALESCE($2, last_name),
                                    phone = COALESCE($3, phone),
                                    email = COALESCE($4, email),
                                    bio = COALESCE($5, bio),
                                    membership_status = COALESCE($6, membership_status),
                                    updated_at = NOW()
                                    WHERE id = $7
                                    RETURNING id, first_name, last_name, phone, email, avatar_url, bio, membership_status, created_at, updated_at`,
                                    [
                                      first_name || null,
                                    last_name || null,
                                    phone || null,
                                    email || null,
                                    bio || null,
                                    membershipStatusToSet || null,
                                    id
                                    ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Failed to update user profile:', err);
    res.status(500).json({ error: 'Failed to update user profile' });
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
    const result = await pool.query('SELECT COUNT(*) FROM games WHERE lent_out = true');
    res.json({ lentOut: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('❌ Failed to fetch lent out games:', err);
    res.status(500).json({ error: 'Failed to fetch lent out games' });
  }
});

app.post('/lend/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { userId, note } = req.body;

  if (!userId || isNaN(parseInt(userId))) {
    return res.status(400).json({ error: 'Missing or invalid userId' });
  }

  try {
    await pool.query(`
    UPDATE games
    SET lent_out = true,
    last_lent = NOW(),
                     times_lent = COALESCE(times_lent, 0) + 1
                     WHERE id = $1
                     `, [id]);

    await pool.query(`
    INSERT INTO game_history (game_id, user_id, action, note)
    VALUES ($1, $2, 'lend', $3)
    `, [id, userId, note]);

    res.json({ message: '✅ Game lent out' });
  } catch (err) {
    console.error('❌ Failed to lend out game:', err);
    res.status(500).json({ error: 'Failed to lend out game' });
  }
});

app.post('/return/:id', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Mark game as returned
    await pool.query(`
    UPDATE games
    SET lent_out = false
    WHERE id = $1
    `, [id]);

    // Insert a return action log with returned_at timestamp
    await pool.query(`
    INSERT INTO game_history (game_id, action, returned_at, timestamp)
    VALUES ($1, 'return', NOW(), NOW())
    `, [id]);

    res.json({ message: '✅ Game returned' });
  } catch (err) {
    console.error('❌ Failed to return game:', err);
    res.status(500).json({ error: 'Failed to return game' });
  }
});

app.get('/games/:id/current-lend', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
    SELECT gh.*, u.first_name, u.last_name
    FROM game_history gh
    LEFT JOIN users u ON gh.user_id = u.id
    WHERE gh.game_id = $1 AND gh.action = 'lend'
    ORDER BY gh.timestamp DESC
    LIMIT 1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No lending record found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Failed to fetch current lend info:', err);
    res.status(500).json({ error: 'Failed to fetch current lend info' });
  }
});

app.get('/stats/most-lent-this-month', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
    SELECT g.title_sv, COUNT(*) AS lend_count
    FROM game_history gh
    JOIN games g ON gh.game_id = g.id
    WHERE gh.action = 'lend' AND gh.timestamp >= date_trunc('month', CURRENT_DATE)
    GROUP BY g.title_sv
    ORDER BY lend_count DESC
    LIMIT 1
    `);

    res.json({ title: result.rows[0]?.title_sv || '–' });
  } catch (err) {
    console.error('❌ Failed to fetch most lent game this month:', err);
    res.status(500).json({ error: 'Failed to fetch most lent game this month' });
  }
});

app.post('/order-game', async (req, res) => {
  const { game_id, game_title, table_id, first_name, last_name, phone } = req.body;

  if (!game_id || !game_title || !table_id || !first_name || !last_name || !phone) {
    return res.status(400).json({ error: 'Missing data' });
  }

  try {
    await pool.query(
      `INSERT INTO game_orders (game_id, game_title, table_id, first_name, last_name, phone)
      VALUES ($1, $2, $3, $4, $5, $6)`,
                     [game_id, game_title, table_id, first_name, last_name, phone]
    );

    res.status(200).json({ message: 'Game order placed' });
  } catch (err) {
    console.error('❌ Error inserting order:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/order-game/latest', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM game_orders ORDER BY created_at DESC LIMIT 20'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/order-game/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM game_orders WHERE id = $1', [id]);
    res.json({ message: '✅ Order deleted' });
  } catch (err) {
    console.error('❌ Failed to delete order:', err);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});
app.delete('/order-game', verifyToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM game_orders');
    res.json({ message: '✅ All orders cleared' });
  } catch (err) {
    console.error('❌ Failed to clear orders:', err);
    res.status(500).json({ error: 'Failed to clear orders' });
  }
});
// COMPLETE ORDER: create user if not exists, then lend out game

app.post('/order-game/:id/complete', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch the order by id
    const orderRes = await pool.query('SELECT * FROM game_orders WHERE id = $1', [id]);
    const order = orderRes.rows[0];
    console.log('Processing order:', order);

    if (!order) return res.status(404).json({ error: "Order not found" });
    // Standardize phone number by removing non-digits

        const standardizedPhone = order.phone.replace(/\D/g, '');
    // Add your validation here:
    if (!order.first_name || !order.last_name || !standardizedPhone) {
      return res.status(400).json({ error: 'Order missing user info' });
    }




    // Check if user exists with that phone
    const existingUserRes = await pool.query(
      'SELECT * FROM users WHERE phone = $1',
      [standardizedPhone]
    );

    let userId;
    if (existingUserRes.rows.length > 0) {
      // Use existing user ID
      userId = existingUserRes.rows[0].id;
    } else {
      // Create new user and get new ID
      const newUserRes = await pool.query(
        `INSERT INTO users (first_name, last_name, phone) VALUES ($1, $2, $3) RETURNING id`,
                                          [order.first_name, order.last_name, standardizedPhone]
      );
      userId = newUserRes.rows[0].id;
    }

    // Mark game as lent out and update stats
    await pool.query(`
    UPDATE games
    SET lent_out = true,
    last_lent = NOW(),
                     times_lent = COALESCE(times_lent, 0) + 1
                     WHERE id = $1
                     `, [order.game_id]);

    // Insert a lending record in game_history
    await pool.query(`
    INSERT INTO game_history (game_id, user_id, action, note)
    VALUES ($1, $2, 'lend', $3)
    `, [order.game_id, userId, `Auto-lend via order system (Table ${order.table_id})`]);

    // Delete the processed order
    await pool.query('DELETE FROM game_orders WHERE id = $1', [id]);

    res.json({ message: '✅ Order completed successfully' });
  } catch (err) {
    console.error("❌ Failed to complete order:", err);
    res.status(500).json({ error: "Failed to complete order" });
  }
});

// Get friend list of logged-in user
app.get('/friends', verifyToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(`
    SELECT u.id, u.first_name, u.last_name, u.avatar_url
    FROM friends f
    JOIN users u ON f.friend_id = u.id
    WHERE f.user_id = $1
    ORDER BY u.first_name, u.last_name
    `, [userId]);

    res.json(result.rows);
  } catch (err) {
    console.error('❌ Failed to fetch friends:', err);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// Add friend by user ID (simulate QR scan acceptance)
app.post('/friends/:friendId', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const friendId = parseInt(req.params.friendId);

  if (userId === friendId) {
    return res.status(400).json({ error: "You can't friend yourself" });
  }

  try {
    // Check if friend user exists
    const friendRes = await pool.query('SELECT id FROM users WHERE id = $1', [friendId]);
    if (friendRes.rows.length === 0) {
      return res.status(404).json({ error: 'User to friend not found' });
    }

    // Check if friendship already exists
    const existingRes = await pool.query(
      'SELECT * FROM friends WHERE user_id = $1 AND friend_id = $2',
      [userId, friendId]
    );
    if (existingRes.rows.length > 0) {
      return res.status(400).json({ error: 'Already friends' });
    }

    // Insert friendship both ways (bidirectional)
    await pool.query('BEGIN');
    await pool.query(
      'INSERT INTO friends (user_id, friend_id) VALUES ($1, $2)',
                     [userId, friendId]
    );
    await pool.query(
      'INSERT INTO friends (user_id, friend_id) VALUES ($1, $2)',
                     [friendId, userId]
    );
    await pool.query('COMMIT');

    res.json({ message: 'Friend added successfully' });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('❌ Failed to add friend:', err);
    res.status(500).json({ error: 'Failed to add friend' });
  }
});

// Remove friend (delete both friendship rows)
app.delete('/friends/:friendId', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const friendId = parseInt(req.params.friendId);

  try {
    await pool.query('BEGIN');
    await pool.query(
      'DELETE FROM friends WHERE user_id = $1 AND friend_id = $2',
      [userId, friendId]
    );
    await pool.query(
      'DELETE FROM friends WHERE user_id = $1 AND friend_id = $2',
      [friendId, userId]
    );
    await pool.query('COMMIT');

    res.json({ message: 'Friend removed successfully' });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('❌ Failed to remove friend:', err);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});


// 🛡️ Admin Login2
app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' });
  }

  try {
    const result = await pool.query('SELECT * FROM admin_users WHERE username = $1', [username]);
    const admin = result.rows[0];
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: admin.id, role: 'admin' }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
  } catch (err) {
    console.error('❌ Admin login failed:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});

module.exports = { verifyToken };
