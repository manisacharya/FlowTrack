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

    // Tasks (Deprecated but kept for schema consistency if needed, or we can drop)
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category_id INTEGER,
      due_date TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    )`);

    // Task History
    db.run(`CREATE TABLE IF NOT EXISTS task_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`);

    // Habits - Updated with color, icon, notification
    db.run(`CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'daily',
      streak INTEGER NOT NULL DEFAULT 0,
      last_marked TEXT,
      color TEXT DEFAULT '#000000',
      icon TEXT DEFAULT '📝',
      notification_time TEXT,
      notification_enabled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (!err) {
        // Migration: Check for new columns and add them if missing
        const columnsToAdd = [
          { name: 'color', type: "TEXT DEFAULT '#000000'" },
          { name: 'icon', type: "TEXT DEFAULT '📝'" },
          { name: 'notification_time', type: "TEXT" },
          { name: 'notification_enabled', type: "INTEGER DEFAULT 0" }
        ];

        columnsToAdd.forEach(col => {
          db.run(`ALTER TABLE habits ADD COLUMN ${col.name} ${col.type}`, (err) => {
            // Ignore error if column already exists (SQLite doesn't have IF NOT EXISTS for ADD COLUMN)
          });
        });
      }
    });

    // Habit Logs
    db.run(`CREATE TABLE IF NOT EXISTS habit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      log_date TEXT NOT NULL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(habit_id, log_date),
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    )`, (err) => {
      if (!err) {
        // Migration: Add note column if missing
        db.run(`ALTER TABLE habit_logs ADD COLUMN note TEXT`, (err) => { });
      }
    });

    // Routines
    db.run(`CREATE TABLE IF NOT EXISTS routines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Routine Logs
    db.run(`CREATE TABLE IF NOT EXISTS routine_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      routine_id INTEGER NOT NULL,
      log_date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(routine_id, log_date),
      FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE
    )`);

    // User Stats (Gamification)
    db.run(`CREATE TABLE IF NOT EXISTS user_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      points INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      xp INTEGER DEFAULT 0,
      focus_minutes INTEGER DEFAULT 0
    )`);

    // Initialize user stats if empty
    db.get("SELECT COUNT(*) as count FROM user_stats", (err, row) => {
      if (!err && row.count === 0) {
        db.run("INSERT INTO user_stats (points, level, xp, focus_minutes) VALUES (0, 1, 0, 0)");
      } else {
        // Migration for focus_minutes
        db.run("ALTER TABLE user_stats ADD COLUMN focus_minutes INTEGER DEFAULT 0", (err) => { });
      }
    });

    // Badges
    db.run(`CREATE TABLE IF NOT EXISTS badges(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              icon TEXT NOT NULL,
              description TEXT NOT NULL,
              condition_type TEXT NOT NULL,
              condition_value INTEGER NOT NULL
            )`);

    // User Badges
    db.run(`CREATE TABLE IF NOT EXISTS user_badges(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              badge_id INTEGER NOT NULL,
              earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(badge_id) REFERENCES badges(id) ON DELETE CASCADE
            )`);

    // Seed Badges
    db.get("SELECT COUNT(*) as count FROM badges", (err, row) => {
      if (!err && row.count === 0) {
        const badges = [
          ['First Step', '🌱', 'Complete your first habit', 'total_habits', 1],
          ['On Fire', '🔥', 'Reach a 7-day streak', 'streak', 7],
          ['Habit Master', '👑', 'Complete 100 habits total', 'total_habits', 100],
          ['Early Bird', '☀️', 'Complete morning routine 5 times', 'morning_routine', 5],
          ['Night Owl', '🌙', 'Complete night routine 5 times', 'night_routine', 5]
        ];
        const stmt = db.prepare("INSERT INTO badges (name, icon, description, condition_type, condition_value) VALUES (?, ?, ?, ?, ?)");
        badges.forEach(b => stmt.run(b));
        stmt.finalize();
      }
    });

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
