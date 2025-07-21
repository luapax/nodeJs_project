const { v4: uuidv4 } = require('uuid');
const SQL = require('../models/db');

// Helper do walidacji daty
function isValidDateFormat(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

exports.createUser = async (req, res) => {
  const username = req.body.username?.trim();
  if (!username) return res.status(400).json({ error: 'Username is required' });

  const id = uuidv4();
  try {
    await SQL.run(`INSERT INTO users (id, username) VALUES (?, ?)`, [id, username]);
    res.json({ username, _id: id });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
};

exports.getUsers = async (req, res) => {
  const users = await SQL.all(`SELECT id AS _id, username FROM users`);
  res.json(users);
};

exports.addExercise = async (req, res) => {
  const userId = req.params._id;
  const { date, description: descRaw, duration: durRaw } = req.body;

  const description = descRaw?.trim();
  const durationInt = parseInt(durRaw);

  if (!description || isNaN(durationInt) || durationInt <= 0) {
    return res.status(400).json({ error: 'Description and positive duration are required' });
  }

  if (date && !isValidDateFormat(date)) {
    return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format' });
  }

  const parsedDate = date ? new Date(date) : new Date();
  if (isNaN(parsedDate)) {
    return res.status(400).json({ error: 'Invalid date' });
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
    res.status(500).json({ error: 'Failed to add exercise' });
  }
};

exports.getLogs = async (req, res) => {
  const userId = req.params._id;
  const { from, to, limit } = req.query;

  try {
    const user = await SQL.get(`SELECT username FROM users WHERE id = ?`, [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Wspólne warunki
    const filterClauses = [];
    const filterParams = [userId];

    if (from) {
      if (!isValidDateFormat(from)) {
        return res.status(400).json({ error: '"from" must be YYYY-MM-DD' });
      }
      filterClauses.push(`date >= ?`);
      filterParams.push(from);
    }

    if (to) {
      if (!isValidDateFormat(to)) {
        return res.status(400).json({ error: '"to" must be YYYY-MM-DD' });
      }
      filterClauses.push(`date <= ?`);
      filterParams.push(to);
    }

    const whereClause = filterClauses.length ? `AND ${filterClauses.join(' AND ')}` : '';

    // Zapytanie count — bez LIMIT
    const countQuery = `SELECT COUNT(*) as count FROM exercises WHERE userId = ? ${whereClause}`;
    const countResult = await SQL.get(countQuery, filterParams);
    const count = countResult.count;

    // Zapytanie logs — z LIMIT
    let logQuery = `SELECT description, duration, date FROM exercises WHERE userId = ? ${whereClause} ORDER BY date ASC`;
    const logParams = [...filterParams];

    if (limit) {
      const limitInt = parseInt(limit);
      if (isNaN(limitInt) || limitInt <= 0) {
        return res.status(400).json({ error: 'Invalid "limit"' });
      }
      logQuery += ` LIMIT ?`;
      logParams.push(limitInt);
    }

    const logs = await SQL.all(logQuery, logParams);

    res.json({
      _id: userId,
      username: user.username,
      count,
      log: logs,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
};
