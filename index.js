const express = require('express');
const sqlite3 = require('sqlite3');
const path = require('path');
const cors = require('cors');
const util = require('util');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const dbPath = path.join(__dirname, 'mydb.db');
const db = new sqlite3.Database(dbPath);

// Promisify DB
const SQL = {
  run(...args) {
    return new Promise((resolve, reject) => {
      db.run(...args, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  },
  get: util.promisify(db.get.bind(db)),
  all: util.promisify(db.all.bind(db)),
  exec: util.promisify(db.exec.bind(db)),
};

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html');
});

// Initialize database tables
const fs = require('fs');
const schemaSQL = fs.readFileSync(path.join(__dirname, 'mydb.sql'), 'utf8');

SQL.exec(schemaSQL);

// POST /api/users - Create new user
app.post('/api/users', async (req, res) => {
  const username = req.body.username;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  const id = uuidv4();

  try {
    await SQL.run(`INSERT INTO users (id, username) VALUES (?, ?)`, [id, username]);
    res.json({ username, _id: id });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// GET /api/users - List all users
app.get('/api/users', async (req, res) => {
  const users = await SQL.all(`SELECT id AS _id, username FROM users`);
  res.json(users);
});

// POST /api/users/:_id/exercises - Add exercise
app.post('/api/users/:_id/exercises', async (req, res) => {
  const userId = req.params._id;
  const { description, duration, date } = req.body;

  if (!description || !duration) {
    return res.status(400).json({ error: 'Description and duration are required' });
  }

  const parsedDate = date ? new Date(date) : new Date();
  if (isNaN(parsedDate)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  const formattedDate = parsedDate.toDateString();
  const exerciseId = uuidv4();

  try {
    const user = await SQL.get(`SELECT username FROM users WHERE id = ?`, [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await SQL.run(
      `INSERT INTO exercises (id, userId, description, duration, date) VALUES (?, ?, ?, ?, ?)`,
      [exerciseId, userId, description, parseInt(duration), formattedDate]
    );

    res.json({
      _id: userId,
      username: user.username,
      description,
      duration: parseInt(duration),
      date: formattedDate,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:_id/logs - Get user logs
app.get('/api/users/:_id/logs', async (req, res) => {
  const userId = req.params._id;
  const { from, to, limit } = req.query;

  const user = await SQL.get(`SELECT username FROM users WHERE id = ?`, [userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  let query = `SELECT description, duration, date FROM exercises WHERE userId = ?`;
  const params = [userId];

  if (from) {
    query += ` AND date >= ?`;
    params.push(new Date(from).toDateString());
  }

  if (to) {
    query += ` AND date <= ?`;
    params.push(new Date(to).toDateString());
  }

  query += ` ORDER BY date DESC`;

  try {
    let log = await SQL.all(query, params);
    if (limit) log = log.slice(0, parseInt(limit));

    res.json({
      username: user.username,
      count: log.length,
      _id: userId,
      log,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port);
});
