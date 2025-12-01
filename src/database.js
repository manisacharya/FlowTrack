const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

function initDatabase() {
  db.serialize(() => {
    // Categories
    db.run(`CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tasks
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category_id INTEGER,
      due_date TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    )`);

    // Habits
    db.run(`CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'daily',
      streak INTEGER NOT NULL DEFAULT 0,
      last_marked TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Habit Logs
    db.run(`CREATE TABLE IF NOT EXISTS habit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      log_date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(habit_id, log_date),
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    )`);

    // Routines
    db.run(`CREATE TABLE IF NOT EXISTS routines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Seed Routines
    db.get("SELECT COUNT(*) as count FROM routines", (err, row) => {
      if (err) {
        console.error(err);
        return;
      }
      if (row.count === 0) {
        const defaults = {
          'morning': ['skin care', 'make bed', 'warm lemon water', '5 min stretching', 'journaling', 'workout'],
          'night': ['nice warm bath', 'mood lights in room', 'herbal tea', 'journal', 'plan next day', 'read 10 pages']
        };

        const stmt = db.prepare("INSERT INTO routines (kind, text, sort) VALUES (?, ?, ?)");
        Object.keys(defaults).forEach(kind => {
          defaults[kind].forEach((text, index) => {
            stmt.run(kind, text, index);
          });
        });
        stmt.finalize();
        console.log("Seeded default routines.");
      }
    });
  });
}

initDatabase();

module.exports = db;
