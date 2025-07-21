const sqlite3 = require('sqlite3');
const path = require('path');
const util = require('util');

const dbPath = path.join(__dirname, '../mydb.db');
const db = new sqlite3.Database(dbPath);

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

module.exports = SQL;
