const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.resolve(__dirname, 'data');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'timers.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        chat_id TEXT PRIMARY KEY,
        first_name TEXT,
        last_name TEXT,
        username TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS timers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        type TEXT,
        label TEXT,
        total_seconds INTEGER,
        start_time INTEGER,
        finished INTEGER DEFAULT 0
    )`);
});

module.exports = db;