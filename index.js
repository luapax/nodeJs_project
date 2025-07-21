const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const SQL = require('./models/db');
const userRoutes = require('./routes/userRoutes');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

// Initialize DB
const schemaSQL = fs.readFileSync(path.join(__dirname, 'mydb.sql'), 'utf8');
SQL.exec(schemaSQL);

// Routes
app.use('/', userRoutes);
app.get('/', (req, res) => res.sendFile(__dirname + '/views/index.html'));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
