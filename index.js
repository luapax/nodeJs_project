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
const { register } = require('module');
const schemaSQL = fs.readFileSync(path.join(__dirname, 'mydb.sql'), 'utf8');

SQL.exec(schemaSQL);

// POST /api/users - Create new user
app.post('/api/users', async (req, res) => {
  const username = req.body.username.trim();
  if (!username) return res.status(400).json({ error: 'Username is required' });

  const id = uuidv4();

  try {
    await SQL.run(`INSERT INTO users (id, username) VALUES (?, ?)`, [id, username]);
    res.json({ username, _id: id });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: 'Something went wrong. Try a different username.' });
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
  const { date } = req.body;
  const duration = req.body.duration?.trim();
  const description = req.body.description?.trim();

  const durationInt = parseInt(duration);
  if (!description || isNaN(durationInt) || durationInt <= 0) {
    return res.status(400).json({ error: 'Description is required' });
  }

  if (isNaN(durationInt) || durationInt <= 0) {
    return res
      .status(400)
      .json({ error: 'Duration is required and it has to be a positive number' });
  }

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format' });
  }

  const parsedDate = date ? new Date(date) : new Date();

  if (isNaN(parsedDate)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  const formattedDate = parsedDate.toISOString().split('T')[0];
  const exerciseId = uuidv4();

  try {
    const user = await SQL.get(`SELECT username FROM users WHERE id = ?`, [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await SQL.run(
      `INSERT INTO exercises (id, userId, description, duration, date) VALUES (?, ?, ?, ?, ?)`,
      [exerciseId, userId, description, durationInt, formattedDate]
    );

    res.json({
      _id: userId,
      username: user.username,
      description,
      duration: durationInt,
      date: formattedDate,
    });
  } catch (err) {
    res.json({ error: 'Failed to add exercise, please try again' });
  }
});

// GET /api/users/:_id/logs - Get user logs
app.get('/api/users/:_id/logs', async (req, res) => {
  const userId = req.params._id;
  const { from, to, limit } = req.query;

  try {
    const user = await SQL.get(`SELECT username FROM users WHERE id = ?`, [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let query = `SELECT description, duration, date FROM exercises WHERE userId = ?`;
    const params = [userId];

    // Date filtering
    if (from) {
      const fromDate = new Date(from);
      if (isNaN(fromDate)) {
        return res.status(400).json({ error: 'Invalid "from" date format' });
      }
      query += ` AND date >= ?`;
      params.push(fromDate.toISOString().split('T')[0]);
    }

    if (to) {
      const toDate = new Date(to);
      if (isNaN(toDate)) {
        return res.status(400).json({ error: 'Invalid "to" date format' });
      }
      query += ` AND date <= ?`;
      params.push(toDate.toISOString().split('T')[0]);
    }

    query += ` ORDER BY date ASC`;

    if (limit) {
      const limitInt = parseInt(limit);
      if (isNaN(limitInt) || limitInt <= 0) {
        return res.status(400).json({ error: 'Invalid "limit" value' });
      }
      query += ` LIMIT ?`;
      params.push(limitInt);
    }

    const logs = await SQL.all(query, params);

    let countQuery = `SELECT COUNT(*) as count FROM exercises WHERE userId = ?`;
    const countParams = [userId];

    if (from)
      (countQuery += ` AND date >= ?`),
        countParams.push(new Date(from).toISOString().split('T')[0]);
    if (to)
      (countQuery += ` AND date <= ?`), countParams.push(new Date(to).toISOString().split('T')[0]);

    const countResult = await SQL.get(countQuery, countParams);
    const count = countResult.count;

    res.json({
      username: user.username,
      count,
      _id: userId,
      log: logs,
    });
  } catch (err) {
    console.error('Error fetching logs:', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// Start server
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port);
});
