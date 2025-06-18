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

app.use('/uploads/avatars', express.static(path.join(__dirname, 'uploads', 'avatars')));





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
  const { username, first_name, last_name, phone, password } = req.body;
  if (!username || !first_name || !last_name || !phone || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    // Check if user with phone already exists
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
          `UPDATE users SET username = $1, password = $2, membership_status = 'active'
          WHERE id = $3 RETURNING id, username, first_name, last_name, phone, membership_status`,
          [username, hash, existingUser.id]
        );


        const token = jwt.sign({ id: update.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '2h' });
        return res.status(200).json({ token, user: update.rows[0] });
      }
    }

    // Create new member
    const hash = await bcrypt.hash(password, 10);
    const insert = await pool.query(`
    INSERT INTO users (username, first_name, last_name, phone, password, membership_status)
    VALUES ($1, $2, $3, $4, $5, 'active')
    RETURNING id, username, first_name, last_name, phone, membership_status
    `, [username, first_name, last_name, phone, hash]);

    const token = jwt.sign({ id: insert.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '2h' });
    res.status(201).json({ token, user: insert.rows[0] });

  } catch (err) {
    console.error('❌ Failed to register user:', err);
    res.status(500).json({ error: 'Failed to register user' });
  }
});





//GAMES ROUTE =========================================================================================
const slugify = require('slugify'); // <-- make sure this is declared at the top of your file

app.post('/games', verifyToken, upload.none(), async (req, res) => {
  const {
    title_sv, title_en, description_sv, description_en,
    min_players, max_players, play_time,
    age, tags, img,
    slow_day_only, trusted_only, members_only,
    condition_rating, staff_picks, min_table_size
  } = req.body;

  // Slugify based on Swedish or English title
  const baseTitle = title_sv || title_en || 'untitled';
  const slug = slugify(baseTitle, {
    lower: true,
    strict: true,
    remove: /[*+~.()'"!:@]/g
  });

  try {
    const result = await pool.query(
      `INSERT INTO games (
        title_sv, title_en, description_sv, description_en,
        min_players, max_players, play_time,
        age, tags, img,
        slow_day_only, trusted_only, members_only,
        condition_rating, staff_picks, min_table_size, slug
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
                                    [
                                      title_sv, title_en, description_sv, description_en,
                                    min_players, max_players, play_time,
                                    age, tags, img,
                                    !!slow_day_only, !!trusted_only, !!members_only,
                                    condition_rating || null, staff_picks || null, min_table_size || null,
                                    slug
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
    title_sv,
    title_en,
    description_sv,
    description_en,
    min_players,
    max_players,
    play_time,
    age,
    tags,
    img,
    slow_day_only,
    trusted_only,
    members_only,
    condition_rating,
    staff_picks,
    min_table_size
  } = req.body;

  const parseBoolean = (val) => {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return val.toLowerCase() === 'true';
    return false;
  };

  try {
    const result = await pool.query(
      `UPDATE games SET
      title_sv = $1,
      title_en = $2,
      description_sv = $3,
      description_en = $4,
      min_players = $5,
      max_players = $6,
      play_time = $7,
      age = $8,
      tags = $9,
      img = $10,
      slow_day_only = $11,
      trusted_only = $12,
      members_only = $13,
      condition_rating = $14,
      staff_picks = $15,
      min_table_size = $16
      WHERE id = $17
      RETURNING *`,
      [
        title_sv,
        title_en,
        description_sv,
        description_en,
        min_players,
        max_players,
        play_time,
        age,
        tags,
        img,
        parseBoolean(slow_day_only),
                                    parseBoolean(trusted_only),
                                    parseBoolean(members_only),
                                    condition_rating || null,
                                    staff_picks || null,
                                    min_table_size || null,
                                    id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Failed to update game:', err);
    res.status(500).json({ error: 'Failed to update game' });
  }
});


app.get('/games/slug/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const result = await pool.query('SELECT * FROM games WHERE slug = $1', [slug]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching game by slug:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



app.get('/games/:id', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('SELECT * FROM games WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Failed to fetch game by ID:', err);
    res.status(500).json({ error: 'Internal server error' });
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
  const { userId, note, partyId } = req.body;

  if (!userId || isNaN(parseInt(userId))) {
    return res.status(400).json({ error: 'Missing or invalid userId' });
  }

  try {
    // 1. Lend the game
    await pool.query(`
    UPDATE games
    SET lent_out = true,
    last_lent = NOW(),
                     times_lent = COALESCE(times_lent, 0) + 1
                     WHERE id = $1
                     `, [id]);

    // 2. Insert into history (now includes optional party_id)
    await pool.query(`
    INSERT INTO game_history (game_id, user_id, action, note, party_id)
    VALUES ($1, $2, 'lend', $3, $4)
    `, [id, userId, note || null, partyId || null]);

    // 3. Check if first borrow
    const borrowCountRes = await pool.query(`
    SELECT COUNT(*) FROM game_history
    WHERE user_id = $1 AND action = 'lend'
    `, [userId]);

    const borrowCount = parseInt(borrowCountRes.rows[0].count);

    if (borrowCount === 1) {
      const badgeRes = await pool.query(`SELECT id, name, icon_url FROM badges WHERE id = 2`);
      const badge = badgeRes.rows[0];

      if (badge) {
        const existing = await pool.query(`
        SELECT 1 FROM user_badges WHERE user_id = $1 AND badge_id = $2
        `, [userId, badge.id]);

        if (existing.rowCount === 0) {
          await pool.query(`
          INSERT INTO user_badges (user_id, badge_id)
          VALUES ($1, $2)
          `, [userId, badge.id]);

          await pool.query(`
          INSERT INTO notifications (user_id, type, data)
          VALUES ($1, 'badge_awarded', $2)
          `, [
            userId,
            JSON.stringify({
              badge_id: badge.id,
              name: badge.name,
              icon_url: badge.icon_url
            })
          ]);
        }
      }
    }

    res.json({ message: '✅ Game lent out' });
  } catch (err) {
    console.error('❌ Failed to lend out game:', err);
    res.status(500).json({ error: 'Failed to lend out game' });
  }
});




app.post('/return/:id', verifyToken, async (req, res) => {
  const { id } = req.params; // game_id
  const { return_notes } = req.body; // optional field

  try {
    const returnedByUserId = req.user.id;

    // 1. Mark game as not lent out
    await pool.query(`
    UPDATE games
    SET lent_out = false
    WHERE id = $1
    `, [id]);

    // 2. System-level return log (avoid reserved keyword 'timestamp')
    await pool.query(`
    INSERT INTO game_history (game_id, action, returned_at)
    VALUES ($1, 'return', NOW())
    `, [id]);

    // 3. Update any active party session
    await pool.query(`
    UPDATE party_sessions
    SET returned_at = NOW(),
                     returned_by_user_id = $1,
                     return_notes = $2
                     WHERE game_id = $3 AND returned_at IS NULL
                     `, [returnedByUserId, return_notes || null, id]);

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

app.get('/games', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM games ORDER BY title_sv ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Failed to fetch games:', err);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// 📣 Public guest-accessible games endpoint
app.get('/games/public', async (req, res) => {
  try {
    const result = await pool.query(`
    SELECT * FROM games
    WHERE members_only IS NOT TRUE
    ORDER BY title_sv ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Failed to fetch public games:', err);
    res.status(500).json({ error: 'Failed to fetch public games' });
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
  const { first_name, last_name, phone, table_number, game_id, game_title, party_id } = req.body;

  try {
    // 1. Check if user already exists
    let userResult = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
    let user_id;

    if (userResult.rows.length > 0) {
      user_id = userResult.rows[0].id;
    } else {
      const insertUserResult = await pool.query(
        'INSERT INTO users (first_name, last_name, phone) VALUES ($1, $2, $3) RETURNING id',
                                                [first_name, last_name, phone]
      );
      user_id = insertUserResult.rows[0].id;
    }

    // 2. Create game order (including title and table_number)
    const orderResult = await pool.query(
      `INSERT INTO game_orders (user_id, game_id, game_title, table_number, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id`,
      [user_id, game_id, game_title, table_number]
    );
    const game_order_id = orderResult.rows[0].id;

    let partySessionId = null;

    // 3. Handle party logic
    if (party_id) {
      // 3a. Create party session using created_by instead of user_id
      const partySessionResult = await pool.query(
        `INSERT INTO party_sessions (party_id, game_id, created_by, started_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id`,
        [party_id, game_id, user_id]
      );
      partySessionId = partySessionResult.rows[0].id;

      // 3b. Get all members
      const membersResult = await pool.query(
        `SELECT user_id FROM party_members WHERE party_id = $1`,
        [party_id]
      );
      const partyMembers = membersResult.rows.map(row => row.user_id);

      // 3c. Log game for each member
      for (const memberId of partyMembers) {
        await pool.query(
          `INSERT INTO game_history (user_id, game_id, party_id, borrowed_at)
          VALUES ($1, $2, $3, NOW())`,
                         [memberId, game_id, party_id]
        );
      }

      // 3d. Add main user if not included
      if (!partyMembers.includes(user_id)) {
        await pool.query(
          `INSERT INTO game_history (user_id, game_id, party_id, borrowed_at)
          VALUES ($1, $2, $3, NOW())`,
                         [user_id, game_id, party_id]
        );
      }
    } else {
      // 4. Normal solo borrow
      await pool.query(
        `INSERT INTO game_history (user_id, game_id, borrowed_at)
        VALUES ($1, $2, NOW())`,
                       [user_id, game_id]
      );
    }

    // 5. Respond with both order and party session info
    res.status(200).json({
      success: true,
      order_id: game_order_id,
      party_session_id: partySessionId
    });

  } catch (err) {
    console.error('❌ Error in /order-game:', err);
    res.status(500).json({ error: 'Failed to process game order' });
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

    const standardizedPhone = order.phone.replace(/\D/g, '');

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
      userId = existingUserRes.rows[0].id;
    } else {
      const newUserRes = await pool.query(
        `INSERT INTO users (first_name, last_name, phone, membership_status)
        VALUES ($1, $2, $3, 'guest') RETURNING id`,
                                          [order.first_name, order.last_name, standardizedPhone]
      );
      userId = newUserRes.rows[0].id;
    }

    // Mark game as lent out
    await pool.query(`
    UPDATE games
    SET lent_out = true,
    last_lent = NOW(),
                     times_lent = COALESCE(times_lent, 0) + 1
                     WHERE id = $1
                     `, [order.game_id]);

    // Insert lending record in game_history (✅ now includes table_id)
    await pool.query(`
    INSERT INTO game_history (game_id, user_id, action, note, table_id)
    VALUES ($1, $2, 'lend', $3, $4)
    `, [
      order.game_id,
      userId,
      `Auto-lend via order system (Table ${order.table_id})`,
                     order.table_id
    ]);

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
app.post('/friends/:id', verifyToken, async (req, res) => {
  const senderId = req.user.id;
  const receiverId = parseInt(req.params.id);

  if (senderId === receiverId) {
    return res.status(400).json({ error: "Can't friend yourself." });
  }

  try {
    // 🧠 Check if you're already friends
    const existingFriend = await pool.query(`
    SELECT 1 FROM friends
    WHERE (user_id = $1 AND friend_id = $2)
    OR (user_id = $2 AND friend_id = $1)
    `, [senderId, receiverId]);

    if (existingFriend.rowCount > 0) {
      return res.status(400).json({ error: "Already friends." });
    }

    // 🧠 Check if there's an existing *pending* friend request
    const existingRequest = await pool.query(`
    SELECT 1 FROM friend_requests
    WHERE sender_id = $1 AND receiver_id = $2 AND accepted = FALSE
    `, [senderId, receiverId]);

    if (existingRequest.rowCount > 0) {
      return res.status(400).json({ error: "Friend request already sent." });
    }

    // ✅ Insert the friend request
    const { rows } = await pool.query(`
    INSERT INTO friend_requests (sender_id, receiver_id)
    VALUES ($1, $2)
    RETURNING id
    `, [senderId, receiverId]);

    const requestId = rows[0].id;

    // 🔔 Add notification for the receiver
    await pool.query(`
    INSERT INTO notifications (user_id, type, data)
    VALUES ($1, 'friend_request', $2)
    `, [receiverId, JSON.stringify({
      sender_id: senderId,
      request_id: requestId
    })]);

    res.status(201).json({ message: 'Friend request sent.' });

  } catch (err) {
    console.error("❌ Error sending friend request:", err);
    res.status(500).json({ error: "Something went wrong." });
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

app.get('/users/:id/friends', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
    SELECT u.id, u.first_name, u.last_name, u.avatar_url
    FROM friends f
    JOIN users u ON f.friend_id = u.id
    WHERE f.user_id = $1
    ORDER BY u.first_name, u.last_name
    `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error('❌ Failed to fetch user friends:', err);
    res.status(500).json({ error: 'Failed to fetch user friends' });
  }
});

app.get('/users/:id/parties', verifyToken, async (req, res) => {
  const userId = req.params.id;
  try {
    const result = await pool.query(
      `SELECT p.*
      FROM parties p
      JOIN party_members pm ON p.id = pm.party_id
      WHERE pm.user_id = $1`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching parties for user:', err);
    res.status(500).send('Server error');
  }
});

// In your Express backend (for dev only)
app.post('/notifications/test', verifyToken, async (req, res) => {
  const userId = req.user.id;

  const result = await pool.query(`
  INSERT INTO notifications (user_id, type, data, created_at, read)
  VALUES ($1, 'friend_request', $2, NOW(), false)
  RETURNING *;
  `, [userId, JSON.stringify({ sender_id: 999 })]);

  res.json(result.rows[0]);
});

app.post('/friends/:receiverId', verifyToken, async (req, res) => {
  const senderId = req.user.id;
  const receiverId = parseInt(req.params.receiverId);

  if (senderId === receiverId) {
    return res.status(400).json({ error: "Can't friend yourself" });
  }

  try {
    await pool.query(`
    INSERT INTO friend_requests (sender_id, receiver_id, accepted)
    VALUES ($1, $2, FALSE)
    ON CONFLICT DO NOTHING
    `, [senderId, receiverId]);

    await pool.query(`
    INSERT INTO notifications (user_id, type, data)
    VALUES ($1, 'friend_request', $2)
    `, [receiverId, JSON.stringify({ sender_id: senderId })]);

    res.status(200).json({ message: 'Friend request sent.' });
  } catch (err) {
    console.error('❌ Friend request error:', err);
    res.status(500).json({ error: 'Failed to send friend request.' });
  }
});


app.get('/friend-requests', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
    SELECT fr.id, fr.sender_id, u.username, u.avatar_url
    FROM friend_requests fr
    JOIN users u ON u.id = fr.sender_id
    WHERE fr.receiver_id = $1 AND fr.accepted = FALSE
    `, [req.user.id]);

    res.json(rows);
  } catch (err) {
    console.error('❌ Failed to fetch friend requests:', err);
    res.status(500).json({ error: 'Could not fetch friend requests' });
  }
});

app.post('/friend-requests/:id/accept', verifyToken, async (req, res) => {
  const requestId = parseInt(req.params.id);
  const myUserId = parseInt(req.user.id);

  console.log(`🔍 Accepting request ID: ${requestId} as receiver ID: ${myUserId}`);

  try {
    // Debug check
    const check = await pool.query(`
    SELECT * FROM friend_requests WHERE id = $1
    `, [requestId]);
    console.log('📦 DB result for request ID:', check.rows);

    const { rows } = await pool.query(`
    UPDATE friend_requests
    SET accepted = TRUE
    WHERE id = $1 AND receiver_id = $2
    RETURNING sender_id
    `, [requestId, myUserId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Request not found or unauthorized' });
    }

    const senderId = rows[0].sender_id;

    await pool.query(`
    INSERT INTO friends (user_id, friend_id)
    VALUES ($1, $2), ($2, $1)
    ON CONFLICT DO NOTHING
    `, [myUserId, senderId]);

    const receiverInfo = await pool.query(`
    SELECT username, avatar_url FROM users WHERE id = $1
    `, [myUserId]);

    const receiver = receiverInfo.rows[0] || {};

    await pool.query(`
    INSERT INTO notifications (user_id, type, data)
    VALUES ($1, 'friend_accept', $2)
    `, [senderId, JSON.stringify({
      receiver_id: myUserId,
      username: receiver.username,
      avatar_url: receiver.avatar_url
    })]);

    res.status(200).json({ message: 'Friend request accepted.' });
  } catch (err) {
    console.error('❌ Accept failed:', err);
    res.status(500).json({ error: 'Failed to accept request' });
  }
});



// ❤️ FAVORITES
app.post('/favorite', verifyToken, async (req, res) => {
  const { user_id, game_id } = req.body;
  await pool.query(
    `INSERT INTO favorites (user_id, game_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id, game_id) DO NOTHING`,
                   [user_id, game_id]
  );
  res.json({ success: true });
});

app.delete('/favorite', verifyToken, async (req, res) => {
  const { user_id, game_id } = req.body;
  await pool.query(
    `DELETE FROM favorites WHERE user_id = $1 AND game_id = $2`,
    [user_id, game_id]
  );
  res.json({ success: true });
});


// 🎯 WISHLIST (corrected table name!)
app.post('/wishlist', verifyToken, async (req, res) => {
  const { user_id, game_id } = req.body;
  await pool.query(
    `INSERT INTO wishlist (user_id, game_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id, game_id) DO NOTHING`,
                   [user_id, game_id]
  );
  res.json({ success: true });
});

app.delete('/wishlist', verifyToken, async (req, res) => {
  const { user_id, game_id } = req.body;
  await pool.query(
    `DELETE FROM wishlist WHERE user_id = $1 AND game_id = $2`,
    [user_id, game_id]
  );
  res.json({ success: true });
});


// FAVORITES - NU OFFENTLIG
// Inga 'verifyToken' eller interna if-satser behövs
app.get('/users/:id/favorites', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
    SELECT g.*
    FROM favorites f
    JOIN games g ON f.game_id = g.id
    WHERE f.user_id = $1
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// WISHLIST - NU OFFENTLIG
// Inga 'verifyToken' eller interna if-satser behövs
app.get('/users/:id/wishlist', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
    SELECT g.*
    FROM wishlist w
    JOIN games g ON w.game_id = g.id
    WHERE w.user_id = $1
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


//BADGES -------------------------------------------------------------------------------------
app.get('/badges', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM badges ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Failed to fetch badges:', err);
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
});


app.get('/users/:id/badges', async (req, res) => {
  const userId = req.params.id;

  try {
    const result = await pool.query(`
    SELECT b.id, b.name, b.description, b.icon_url, ub.awarded_at
    FROM user_badges ub
    JOIN badges b ON ub.badge_id = b.id
    WHERE ub.user_id = $1
    `, [userId]);

    res.json(result.rows);
  } catch (err) {
    console.error('❌ Failed to fetch user badges:', err);
    res.status(500).json({ error: 'Failed to fetch user badges' });
  }
});




//PARTY========================================================================================
function generateInviteCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 1, 0 for readability
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}


app.post('/party', verifyToken, async (req, res) => {
  const { name, emoji } = req.body;
  const userId = req.user.id; // from verifyToken

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Party name is required.' });
  }

  try {
    // Generate a unique invite code
    let inviteCode;
    let isUnique = false;

    while (!isUnique) {
      inviteCode = generateInviteCode();
      const result = await pool.query('SELECT 1 FROM parties WHERE invite_code = $1', [inviteCode]);
      if (result.rowCount === 0) isUnique = true;
    }

    // 👉 Add this line with your real hosted image URL
    const avatarUrl = 'https://azumd.github.io/bradspelsmeny/img/avatar-party-default.webp';

    // Create the party
    const insertParty = await pool.query(
      `INSERT INTO parties (name, emoji, invite_code, created_by, avatar)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id`,
      [name, emoji || '🎲', inviteCode, userId, avatarUrl]
    );

    const partyId = insertParty.rows[0].id;

    // Add the creator as a member and leader
    await pool.query(
      `INSERT INTO party_members (party_id, user_id, is_leader)
      VALUES ($1, $2, true)`,
                     [partyId, userId]
    );

    res.status(201).json({ success: true, partyId, inviteCode });
  } catch (err) {
    console.error('Error creating party:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/party/:id', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
    SELECT
    p.id,
    p.name,
    p.emoji,
    p.invite_code,
    p.avatar, -- 👈 Add this line
    p.created_by,
    p.created_at,
    u.first_name AS creator_first_name,
    u.last_name AS creator_last_name
    FROM parties p
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Party not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Failed to fetch party info:', err);
    res.status(500).json({ error: 'Failed to fetch party' });
  }
});

app.get('/party/:id/members', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
    SELECT
    u.id AS user_id,
    u.first_name,
    u.last_name,
    u.avatar_url,
    pm.is_leader,
    pm.nickname,
    pm.joined_at
    FROM party_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.party_id = $1
    ORDER BY pm.joined_at ASC
    `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error('❌ Failed to fetch party members:', err);
    res.status(500).json({ error: 'Failed to fetch party members' });
  }
});


app.get('/my-parties', verifyToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(`
    SELECT
    p.id,
    p.name,
    p.emoji,
    p.invite_code,
    p.avatar,
    p.created_at,
    pm.is_leader
    FROM party_members pm
    JOIN parties p ON pm.party_id = p.id
    WHERE pm.user_id = $1 AND p.is_active = TRUE
    ORDER BY p.created_at DESC
    `, [userId]);

    res.json(result.rows);
  } catch (err) {
    console.error('❌ Failed to fetch user parties:', err);
    res.status(500).json({ error: 'Failed to fetch parties' });
  }
});

app.post('/party/join', verifyToken, async (req, res) => {
  const { code } = req.body;
  const userId = req.user.id;

  if (!code || code.trim().length !== 6) {
    return res.status(400).json({ error: 'Invalid invite code.' });
  }

  try {
    // 1. Find the party by invite code
    const partyRes = await pool.query(
      'SELECT id FROM parties WHERE invite_code = $1 AND is_active = TRUE',
      [code.trim().toUpperCase()]
    );

    if (partyRes.rowCount === 0) {
      return res.status(404).json({ error: 'Party not found or inactive.' });
    }

    const partyId = partyRes.rows[0].id;

    // 2. Check if user is already a member
    const memberRes = await pool.query(
      'SELECT 1 FROM party_members WHERE party_id = $1 AND user_id = $2',
      [partyId, userId]
    );

    if (memberRes.rowCount > 0) {
      return res.status(400).json({ error: 'Already a member of this party.' });
    }

    // 3. Join the party
    await pool.query(
      'INSERT INTO party_members (party_id, user_id) VALUES ($1, $2)',
                     [partyId, userId]
    );

    res.status(200).json({ success: true, partyId });
  } catch (err) {
    console.error('❌ Failed to join party:', err);
    res.status(500).json({ error: 'Failed to join party' });
  }
});


app.post('/party/:id/leave', verifyToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Remove member from party
    const result = await pool.query(`
    DELETE FROM party_members
    WHERE party_id = $1 AND user_id = $2
    RETURNING *
    `, [id, userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Not a member of this party.' });
    }

    // Check if party is now empty
    const check = await pool.query(
      'SELECT 1 FROM party_members WHERE party_id = $1',
      [id]
    );

    if (check.rowCount === 0) {
      await pool.query(
        'UPDATE parties SET is_active = FALSE WHERE id = $1',
        [id]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Failed to leave party:', err);
    res.status(500).json({ error: 'Failed to leave party' });
  }
});


app.post('/party/:id/kick', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { target_user_id } = req.body;
  const myUserId = req.user.id;

  if (!target_user_id) {
    return res.status(400).json({ error: 'Missing target user ID.' });
  }

  try {
    // Check if current user is leader
    const leaderCheck = await pool.query(`
    SELECT is_leader FROM party_members
    WHERE party_id = $1 AND user_id = $2
    `, [id, myUserId]);

    if (leaderCheck.rows.length === 0 || !leaderCheck.rows[0].is_leader) {
      return res.status(403).json({ error: 'Only party leader can kick members.' });
    }

    // Prevent self-kick
    if (parseInt(target_user_id) === myUserId) {
      return res.status(400).json({ error: 'Leader cannot kick themselves.' });
    }

    // Kick the member
    const kick = await pool.query(`
    DELETE FROM party_members
    WHERE party_id = $1 AND user_id = $2
    RETURNING *
    `, [id, target_user_id]);

    if (kick.rowCount === 0) {
      return res.status(404).json({ error: 'User not found in this party.' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Failed to kick member:', err);
    res.status(500).json({ error: 'Failed to kick member' });
  }
});

app.post('/party-session', verifyToken, async (req, res) => {
  const { partyId, gameId, gameTitle, notes } = req.body;
  const userId = req.user.id;

  if (!partyId || !gameId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = await pool.query(`
    INSERT INTO party_sessions (party_id, game_id, game_title, created_by, notes)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `, [partyId, gameId, gameTitle || null, userId, notes || null]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Failed to create session:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.get('/party/:id/sessions', verifyToken, async (req, res) => {
  const partyId = req.params.id;

  try {
    const activeResult = await pool.query(
      `SELECT ps.*, g.title_en AS game_title, u.first_name, u.last_name
      FROM party_sessions ps
      JOIN games g ON ps.game_id = g.id
      JOIN users u ON ps.created_by = u.id
      WHERE ps.party_id = $1 AND ps.ended_at IS NULL
      ORDER BY ps.started_at DESC
      LIMIT 1`,
      [partyId]
    );

    const pastResult = await pool.query(
      `SELECT ps.*, g.title_en AS game_title, u.first_name, u.last_name
      FROM party_sessions ps
      JOIN games g ON ps.game_id = g.id
      JOIN users u ON ps.created_by = u.id
      WHERE ps.party_id = $1 AND ps.ended_at IS NOT NULL
      ORDER BY ps.ended_at DESC`,
      [partyId]
    );

    res.json({
      active: activeResult.rows[0] || null,
      past: pastResult.rows || []
    });
  } catch (err) {
    console.error('❌ Error fetching party sessions:', err);
    res.status(500).json({ error: 'Failed to fetch party sessions' });
  }
});




app.post('/party-session/:id/round', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { roundNumber, winnerId, notes } = req.body;

  if (!roundNumber || !winnerId) {
    return res.status(400).json({ error: 'Missing roundNumber or winnerId' });
  }

  try {
    const result = await pool.query(`
    INSERT INTO party_session_rounds (session_id, round_number, winner_id, notes)
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `, [id, roundNumber, winnerId, notes || null]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Failed to log round:', err);
    res.status(500).json({ error: 'Failed to log round' });
  }
});


app.get('/party/:id/sessions', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
    SELECT ps.*, u.first_name, u.last_name
    FROM party_sessions ps
    JOIN users u ON ps.created_by = u.id
    WHERE ps.party_id = $1
    ORDER BY ps.started_at DESC
    `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error('❌ Failed to fetch sessions:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});


app.get('/party-session/:id/rounds', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
    SELECT r.*, u.first_name, u.last_name
    FROM party_session_rounds r
    JOIN users u ON r.winner_id = u.id
    WHERE r.session_id = $1
    ORDER BY round_number ASC
    `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error('❌ Failed to fetch rounds:', err);
    res.status(500).json({ error: 'Failed to fetch rounds' });
  }
});



app.get('/party/:id/messages', verifyToken, async (req, res) => {
  const partyId = parseInt(req.params.id);

  try {
    const result = await pool.query(`
    SELECT pm.id, pm.content, pm.created_at,
    pm.user_id,                    -- 👈 make sure to include this
    u.username, u.avatar_url
    FROM party_messages pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.party_id = $1
    ORDER BY pm.created_at DESC
    LIMIT 100;
    `, [partyId]);



    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});



app.post('/party/:id/messages', verifyToken, async (req, res) => {
  const partyId = parseInt(req.params.id);
  const userId = req.user.id;
  const { content } = req.body;

  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Message content cannot be empty' });
  }

  try {
    await pool.query(`
    INSERT INTO party_messages (party_id, user_id, content)
    VALUES ($1, $2, $3);
    `, [partyId, userId, content.trim()]);

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Error posting message:', err);
    res.status(500).json({ error: 'Failed to post message' });
  }
});


app.delete('/party/:partyId/messages/:messageId', verifyToken, async (req, res) => {
  const { partyId, messageId } = req.params;
  const userId = req.user.id;

  try {
    // Only allow deleting own messages
    const check = await pool.query(
      'SELECT user_id FROM party_messages WHERE id = $1 AND party_id = $2',
      [messageId, partyId]
    );

    if (check.rowCount === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (check.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'You can only delete your own messages' });
    }

    await pool.query('DELETE FROM party_messages WHERE id = $1', [messageId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting message:', err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

//USERS ROUTE =============================================================================

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
  const requesterId = req.user.id;
  const isOwner = requesterId === parseInt(id);
  const isAdmin = req.user.role === 'admin';
  let isFriend = false;

  try {
    // Check friendship only if not owner/admin
    if (!isOwner && !isAdmin) {
      const friendCheck = await pool.query(
        `SELECT 1 FROM friends
        WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
        LIMIT 1`,
        [requesterId, id]
      );
      isFriend = friendCheck.rows.length > 0;
    }

    // Fetch user profile info
    const result = await pool.query(
      `SELECT
      id, username, first_name, last_name, avatar_url, bio, membership_status, created_at, updated_at, email
      FROM users WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    let user = result.rows[0];

    // Hide sensitive info if not owner/admin/friend
    if (!isOwner && !isAdmin && !isFriend) {
      delete user.email;
      delete user.bio;
    }

    res.json(user);
  } catch (err) {
    console.error('❌ Failed to fetch user profile:', err);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});





app.put('/users/:id', verifyToken, async (req, res) => {
  const { id } = req.params;

  // Only the owner or an admin can update the profile
  if (req.user.id !== parseInt(id) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const {
    username,
    first_name,
    last_name,
    phone,
    email,
    bio,
    membership_status // only applied if admin
  } = req.body;

  // Only admins are allowed to update membership_status
  const membershipStatusToSet = (req.user.role === 'admin' && membership_status) ? membership_status : undefined;

  try {
    const result = await pool.query(
      `UPDATE users SET
      username = COALESCE($1, username),
                                    first_name = COALESCE($2, first_name),
                                    last_name = COALESCE($3, last_name),
                                    phone = COALESCE($4, phone),
                                    email = COALESCE($5, email),
                                    bio = COALESCE($6, bio),
                                    membership_status = COALESCE($7, membership_status),
                                    updated_at = NOW()
                                    WHERE id = $8
                                    RETURNING id, username, first_name, last_name, phone, email, avatar_url, bio, membership_status, created_at, updated_at`,
                                    [
                                      username || null,
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
// 🔑 User Login
const refreshTokens = new Set();

// Adjust your login endpoint to issue refresh token:
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

    const role = user.is_admin ? 'admin' : 'user';
    const accessToken = jwt.sign({ id: user.id, role }, JWT_SECRET, { expiresIn: '2h' });
    const refreshToken = jwt.sign({ id: user.id, role }, JWT_SECRET, { expiresIn: '7d' });
    refreshTokens.add(refreshToken);

    res.json({
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        membership_status: user.membership_status,
        is_admin: user.is_admin
      }
    });
  } catch (err) {
    console.error('❌ User login failed:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Add the refresh token endpoint
app.post('/refresh-token', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Missing refresh token' });
  if (!refreshTokens.has(refreshToken)) return res.status(403).json({ error: 'Invalid refresh token' });

  jwt.verify(refreshToken, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid refresh token' });
    const accessToken = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token: accessToken });
  });
});
app.post('/logout', (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    refreshTokens.delete(refreshToken);
  }
  res.json({ message: 'Logged out' });
});



// GET /users/:id/borrow-log — get borrowing history for a user
app.get('/users/:id/borrow-log', verifyToken, async (req, res) => {
  const { id } = req.params;
  const requesterId = req.user.id;
  const isOwner = requesterId === parseInt(id);
  const isAdmin = req.user.role === 'admin';

  let isFriend = false;
  if (!isOwner && !isAdmin) {
    const friendCheck = await pool.query(
      `SELECT 1 FROM friends
      WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
      LIMIT 1`,
      [requesterId, id]
    );
    isFriend = friendCheck.rows.length > 0;
  }

  if (!isOwner && !isAdmin && !isFriend) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const result = await pool.query(`
    SELECT
    gh.id,
    gh.game_id,
    g.title_sv AS game_title,
    gh.action,
    gh.note,
    gh.timestamp,
    gh.returned_at
    FROM game_history gh
    JOIN games g ON gh.game_id = g.id
    WHERE gh.user_id = $1
    ORDER BY gh.timestamp DESC
    LIMIT 50
    `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error('❌ Failed to fetch borrow log:', err);
    res.status(500).json({ error: 'Failed to fetch borrow log' });
  }
});
app.get('/notifications', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
    SELECT * FROM notifications
    WHERE user_id = $1
    ORDER BY created_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (err) {
    console.error('❌ Failed to fetch notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});
app.post('/notifications/:id/read', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
    UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING *
    `, [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('❌ Failed to mark notification as read:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});


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


app.post('/users/:id/badges', verifyAdmin, async (req, res) => {
  const userId = req.params.id;
  const { badge_id } = req.body;

  try {
    const result = await pool.query(`
    INSERT INTO user_badges (user_id, badge_id)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING
    RETURNING *
    `, [userId, badge_id]);

    if (result.rowCount === 0) {
      return res.status(200).json({
        success: false,
        message: 'User already has this badge'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Badge awarded'
    });
  } catch (err) {
    console.error('❌ Failed to award badge:', err);
    res.status(500).json({ error: 'Failed to award badge' });
  }
});


app.post('/debug/award-founder', async (req, res) => {
  try {
    await pool.query(`
    INSERT INTO user_badges (user_id, badge_id)
    VALUES (1, 1)
    ON CONFLICT DO NOTHING
    `);
    res.json({ message: 'Founder badge awarded to user 1' });
  } catch (err) {
    console.error('❌', err);
    res.status(500).json({ error: 'Failed to award badge' });
  }
});






app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});

module.exports = { verifyToken };
