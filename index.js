// index.js
  const cors = require('cors');
  const express = require('express');
  const sqlite3 = require('sqlite3').verbose();
  const path = require('path');
  const app = express();
  const PORT = process.env.PORT || 3000;
  app.use(cors());
  // Middleware to parse JSON
  app.use(express.json());

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

  // Health check route
  app.get('/ping', (req, res) => {
    res.send('pong');
  });

    const stmt = db.prepare(`
    INSERT INTO games (
      title_sv, title_en, description_sv, description_en,
      players, time, age, tags, img, rules
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    sampleGames.forEach(game => {
      stmt.run(
        game.title_sv,
        game.title_en,
        game.description_sv,
        game.description_en,
        game.players,
        game.time,
        game.age,
        game.tags,
        game.img,
        game.rules
      );
    });

    stmt.finalize();
    res.send('✅ Sample games seeded!');
  });

  // 🔥 GET all games
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

  // Start server
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
