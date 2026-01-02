#!/usr/bin/env node
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const db = require('./database');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, '../public/assets');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

// Helper to wrap db calls in promises
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

// --- Gamification Logic ---
async function awardPoints(points) {
    await dbRun('UPDATE user_stats SET points = points + ?, xp = xp + ?', [points, points]);
    // Check level up (simple logic: level * 100 xp needed)
    const stats = await dbGet('SELECT * FROM user_stats LIMIT 1');
    const needed = stats.level * 100;
    let leveledUp = false;
    if (stats.xp >= needed) {
        await dbRun('UPDATE user_stats SET level = level + 1, xp = xp - ?', [needed]);
        leveledUp = true;
    }
    return { leveledUp, newLevel: leveledUp ? stats.level + 1 : stats.level };
}

async function checkBadges() {
    const earned = [];
    const stats = await dbGet('SELECT * FROM user_stats LIMIT 1');
    const totalHabits = (await dbGet('SELECT COUNT(*) as c FROM habit_logs')).c;
    const maxStreak = (await dbGet('SELECT MAX(streak) as c FROM habits')).c || 0;
    const morningCount = (await dbGet("SELECT COUNT(*) as c FROM routine_logs l JOIN routines r ON l.routine_id = r.id WHERE r.kind = 'morning'")).c;
    const nightCount = (await dbGet("SELECT COUNT(*) as c FROM routine_logs l JOIN routines r ON l.routine_id = r.id WHERE r.kind = 'night'")).c;

    const badges = await dbAll('SELECT * FROM badges');
    const userBadges = await dbAll('SELECT badge_id FROM user_badges');
    const userBadgeIds = new Set(userBadges.map(b => b.badge_id));

    for (const b of badges) {
        if (userBadgeIds.has(b.id)) continue;
        let qualified = false;
        if (b.condition_type === 'total_habits' && totalHabits >= b.condition_value) qualified = true;
        if (b.condition_type === 'streak' && maxStreak >= b.condition_value) qualified = true;
        if (b.condition_type === 'morning_routine' && morningCount >= b.condition_value) qualified = true;
        if (b.condition_type === 'night_routine' && nightCount >= b.condition_value) qualified = true;

        if (qualified) {
            await dbRun('INSERT INTO user_badges (badge_id) VALUES (?)', [b.id]);
            earned.push(b);
        }
    }
    return earned;
}

// --- API Routes ---

// Categories
app.get('/api/categories', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM categories ORDER BY name ASC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/categories', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
        const result = await dbRun('INSERT INTO categories (name) VALUES (?)', [name]);
        const row = await dbGet('SELECT * FROM categories WHERE id = ?', [result.lastID]);
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Habits
app.get('/api/habits', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM habits ORDER BY id DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/habits', async (req, res) => {
    const { title, frequency, color, icon, notification_time, notification_enabled } = req.body;
    if (!title) return res.status(400).json({ error: 'Missing title' });
    try {
        const result = await dbRun(
            'INSERT INTO habits (title, frequency, color, icon, notification_time, notification_enabled) VALUES (?, ?, ?, ?, ?, ?)',
            [title, frequency || 'daily', color || '#000000', icon || '📝', notification_time || '', notification_enabled ? 1 : 0]
        );
        const row = await dbGet('SELECT * FROM habits WHERE id = ?', [result.lastID]);
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/habits', async (req, res) => {
    const { id } = req.query;
    const { title, frequency, color, icon, notification_time, notification_enabled } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    try {
        const fields = [];
        const params = [];
        if (title !== undefined) { fields.push('title = ?'); params.push(title); }
        if (frequency !== undefined) { fields.push('frequency = ?'); params.push(frequency); }
        if (color !== undefined) { fields.push('color = ?'); params.push(color); }
        if (icon !== undefined) { fields.push('icon = ?'); params.push(icon); }
        if (notification_time !== undefined) { fields.push('notification_time = ?'); params.push(notification_time); }
        if (notification_enabled !== undefined) { fields.push('notification_enabled = ?'); params.push(notification_enabled ? 1 : 0); }

        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

        params.push(id);
        await dbRun(`UPDATE habits SET ${fields.join(', ')} WHERE id = ?`, params);
        const row = await dbGet('SELECT * FROM habits WHERE id = ?', [id]);
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/habits', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    try {
        await dbRun('DELETE FROM habits WHERE id = ?', [id]);
        res.json({ deleted: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Habit Logs
app.get('/api/habit_logs', async (req, res) => {
    const { start, end } = req.query;
    try {
        let sql = 'SELECT * FROM habit_logs';
        const params = [];
        if (start && end) {
            sql += ' WHERE log_date BETWEEN ? AND ?';
            params.push(start, end);
        }
        const rows = await dbAll(sql, params);

        const logsMap = {};
        rows.forEach(r => {
            if (!logsMap[r.habit_id]) logsMap[r.habit_id] = {};
            logsMap[r.habit_id][r.log_date] = 1;
        });

        res.json({ logs: logsMap });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mark/Unmark Habit Logic
async function updateHabitStreak(id) {
    const habit = await dbGet('SELECT * FROM habits WHERE id = ?', [id]);
    if (!habit) return;

    const logs = await dbAll('SELECT log_date FROM habit_logs WHERE habit_id = ? ORDER BY log_date DESC', [id]);
    const dates = logs.map(l => l.log_date);

    let streak = 0;
    if (dates.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Sort dates descending just in case
        dates.sort((a, b) => new Date(b) - new Date(a));

        const lastMarkedDate = new Date(dates[0]);
        lastMarkedDate.setHours(0, 0, 0, 0);

        if (habit.frequency === 'daily') {
            // Check if the chain is broken relative to today
            // If last marked was yesterday or today, streak is valid.
            // If last marked was before yesterday, streak is broken (0), UNLESS we are just calculating the historical streak length?
            // Usually "current streak" implies it must be active.

            const diffTime = Math.abs(today - lastMarkedDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 1) {
                streak = 1;
                let current = lastMarkedDate;
                for (let i = 1; i < dates.length; i++) {
                    const prev = new Date(dates[i]);
                    prev.setHours(0, 0, 0, 0);

                    const dTime = Math.abs(current - prev);
                    const dDays = Math.round(dTime / (1000 * 60 * 60 * 24));

                    if (dDays === 1) {
                        streak++;
                        current = prev;
                    } else if (dDays === 0) {
                        continue; // Same day duplicate
                    } else {
                        break;
                    }
                }
            } else {
                streak = 0;
            }

        } else {
            // Weekly
            // If last marked was within last 7 days, streak is active.
            const diffTime = Math.abs(today - lastMarkedDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 7) {
                streak = 1;
                let current = lastMarkedDate;
                for (let i = 1; i < dates.length; i++) {
                    const prev = new Date(dates[i]);
                    prev.setHours(0, 0, 0, 0);

                    const dTime = Math.abs(current - prev);
                    const dDays = Math.round(dTime / (1000 * 60 * 60 * 24));

                    // For weekly, we just need them to be within 7 days of each other? 
                    // Or strictly one per calendar week? 
                    // Let's stick to "within 7 days" for simplicity.
                    if (dDays <= 7 && dDays > 0) {
                        streak++;
                        current = prev;
                    } else if (dDays === 0) {
                        continue;
                    } else {
                        break;
                    }
                }
            } else {
                streak = 0;
            }
        }

        await dbRun('UPDATE habits SET last_marked = ?, streak = ? WHERE id = ?', [dates[0], streak, id]);
    } else {
        await dbRun('UPDATE habits SET streak = 0 WHERE id = ?', [id]);
    }

    return await dbGet('SELECT * FROM habits WHERE id = ?', [id]);
}

app.post('/api/mark_habit', async (req, res) => {
    const { id, d } = req.query;
    const target = d || new Date().toISOString().slice(0, 10);

    try {
        await dbRun('INSERT OR IGNORE INTO habit_logs (habit_id, log_date) VALUES (?, ?)', [id, target]);
        const updated = await updateHabitStreak(id);

        // Gamification
        const { leveledUp, newLevel } = await awardPoints(10);
        const newBadges = await checkBadges();

        res.json({ ...updated, leveledUp, newLevel, newBadges });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/unmark_habit', async (req, res) => {
    const { id, d } = req.query;
    const target = d || new Date().toISOString().slice(0, 10);

    try {
        await dbRun('DELETE FROM habit_logs WHERE habit_id = ? AND log_date = ?', [id, target]);
        const updated = await updateHabitStreak(id);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Habit Notes
app.post('/api/habit_note', async (req, res) => {
    const { habit_id, date, note } = req.body;
    if (!habit_id || !date) return res.status(400).json({ error: 'Missing habit_id or date' });

    try {
        // Check if log exists
        const log = await dbGet('SELECT id FROM habit_logs WHERE habit_id = ? AND log_date = ?', [habit_id, date]);
        if (!log) return res.status(404).json({ error: 'Habit not logged for this date' });

        // Update note (assuming we add a note column to habit_logs)
        await dbRun('UPDATE habit_logs SET note = ? WHERE id = ?', [note, log.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/habit_note', async (req, res) => {
    const { habit_id, date } = req.query;
    if (!habit_id || !date) return res.status(400).json({ error: 'Missing habit_id or date' });

    try {
        const log = await dbGet('SELECT note FROM habit_logs WHERE habit_id = ? AND log_date = ?', [habit_id, date]);
        res.json({ note: log?.note || '' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Metrics
app.get('/api/metrics', async (req, res) => {
    try {
        // const tasksCompleted = (await dbGet('SELECT COUNT(*) as c FROM tasks WHERE completed = 1')).c; // Deprecated
        const activeHabits = (await dbGet('SELECT COUNT(*) as c FROM habits')).c;
        const longestStreak = (await dbGet('SELECT MAX(streak) as c FROM habits')).c || 0;
        const stats = await dbGet('SELECT * FROM user_stats LIMIT 1');
        const badges = await dbAll('SELECT b.* FROM user_badges ub JOIN badges b ON ub.badge_id = b.id');

        res.json({ activeHabits, longestStreak, stats, badges });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Focus Mode
app.post('/api/focus/complete', async (req, res) => {
    const { minutes } = req.body;
    if (!minutes || minutes < 1) return res.status(400).json({ error: 'Invalid minutes' });

    try {
        // Add focus minutes to stats
        await dbRun('UPDATE user_stats SET focus_minutes = focus_minutes + ?', [minutes]);

        // Award XP based on focus time (1 XP per 5 minutes)
        const xpEarned = Math.floor(minutes / 5);
        const { leveledUp, newLevel } = await awardPoints(xpEarned);

        const stats = await dbGet('SELECT * FROM user_stats LIMIT 1');
        res.json({ stats, leveledUp, newLevel });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Analytics
app.get('/api/analytics', async (req, res) => {
    try {
        // Last 30 days completion count per day (habits + routines)
        // We'll combine habit_logs and routine_logs
        const rows = await dbAll(`
            SELECT date, SUM(cnt) as count FROM (
                SELECT log_date as date, COUNT(*) as cnt FROM habit_logs WHERE log_date >= date('now', '-30 days') GROUP BY log_date
                UNION ALL
                SELECT log_date as date, COUNT(*) as cnt FROM routine_logs WHERE log_date >= date('now', '-30 days') GROUP BY log_date
            ) GROUP BY date ORDER BY date ASC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Calendar Activity
app.get('/api/calendar_activity', async (req, res) => {
    try {
        // Get all dates where at least one habit was completed
        const rows = await dbAll(`
            SELECT DISTINCT log_date FROM habit_logs
            UNION
            SELECT DISTINCT log_date FROM routine_logs
        `);
        res.json(rows.map(r => r.log_date));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Coach
app.get('/api/coach', async (req, res) => {
    try {
        const streak = (await dbGet('SELECT MAX(streak) as c FROM habits')).c || 0;
        const totalLogs = (await dbGet('SELECT COUNT(*) as c FROM habit_logs WHERE log_date >= date("now", "-7 days")')).c;
        const activeHabits = (await dbGet('SELECT COUNT(*) as c FROM habits')).c;
        const bestHabit = await dbGet('SELECT title, streak FROM habits ORDER BY streak DESC LIMIT 1');

        // Simulate LLM-like response construction
        const intros = ["Hey there!", "Hello!", "Greetings, productivity master!", "Hi!"];
        const intro = intros[Math.floor(Math.random() * intros.length)];

        let analysis = "";
        if (activeHabits === 0) {
            analysis = "It looks like you haven't set up any habits yet. Start small! Add a simple daily habit like 'Drink Water' to get the ball rolling.";
        } else if (totalLogs === 0) {
            analysis = "I see you have some habits set up, but it's been a quiet week. Don't worry, today is a perfect day to restart. Pick just one habit to complete today!";
        } else {
            if (streak > 3) {
                analysis += `You're crushing it! Your consistency is impressive, especially with that ${streak}-day streak${bestHabit ? ' on "' + bestHabit.title + '"' : ''}. Keep that momentum going! `;
            } else {
                analysis += "You're making progress. Consistency is key, so try to stick to your schedule for a few days in a row to build a solid streak. ";
            }

            if (totalLogs > activeHabits * 5) {
                analysis += "You've been super active this week. Excellent work!";
            } else {
                analysis += "Remember, it's not about perfection, it's about showing up.";
            }
        }

        const message = `${intro} ${analysis}`;
        res.json({ message });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Routines
app.get('/api/routines', async (req, res) => {
    const { kind } = req.query;
    try {
        let sql = 'SELECT * FROM routines';
        const params = [];
        if (kind) {
            sql += ' WHERE kind = ? ORDER BY sort ASC, id ASC';
            params.push(kind);
        } else {
            sql += ' ORDER BY kind, sort ASC, id ASC';
        }
        const rows = await dbAll(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/routines', async (req, res) => {
    const { kind, text, sort } = req.body;
    if (!kind || !text) return res.status(400).json({ error: 'kind and text are required' });

    try {
        const duplicate = await dbGet('SELECT id FROM routines WHERE kind = ? AND text = ?', [kind, text]);
        if (duplicate) {
            return res.status(409).json({ error: 'Routine already exists' });
        }

        const result = await dbRun('INSERT INTO routines (kind, text, sort) VALUES (?, ?, ?)', [kind, text, sort || 0]);
        const row = await dbGet('SELECT * FROM routines WHERE id = ?', [result.lastID]);
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/routines', async (req, res) => {
    const { id } = req.query;
    const { text, sort, kind } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    try {
        const fields = [];
        const params = [];
        if (text !== undefined) { fields.push('text = ?'); params.push(text); }
        if (sort !== undefined) { fields.push('sort = ?'); params.push(sort); }
        if (kind !== undefined) { fields.push('kind = ?'); params.push(kind); }

        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

        params.push(id);
        await dbRun(`UPDATE routines SET ${fields.join(', ')} WHERE id = ?`, params);
        const row = await dbGet('SELECT * FROM routines WHERE id = ?', [id]);
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/routines', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    try {
        await dbRun('DELETE FROM routines WHERE id = ?', [id]);
        res.json({ deleted: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Routine Progress
app.get('/api/routines/progress', async (req, res) => {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);
    try {
        const rows = await dbAll('SELECT routine_id FROM routine_logs WHERE log_date = ?', [targetDate]);
        res.json({ completed: rows.map(r => r.routine_id) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/routines/toggle', async (req, res) => {
    const { id, date } = req.body;
    const targetDate = date || new Date().toISOString().slice(0, 10);
    if (!id) return res.status(400).json({ error: 'Missing id' });

    try {
        const existing = await dbGet('SELECT id FROM routine_logs WHERE routine_id = ? AND log_date = ?', [id, targetDate]);
        let completed = false;
        let leveledUp = false;
        let newLevel = 0;
        let newBadges = [];

        if (existing) {
            await dbRun('DELETE FROM routine_logs WHERE id = ?', [existing.id]);
        } else {
            await dbRun('INSERT INTO routine_logs (routine_id, log_date) VALUES (?, ?)', [id, targetDate]);
            completed = true;

            // Award XP (5 XP for routine item)
            const stats = await awardPoints(5); // Changed from addXP to awardPoints
            if (stats.leveledUp) {
                leveledUp = true;
                newLevel = stats.newLevel; // Changed from stats.level to stats.newLevel
            }

            // Check Badges
            newBadges = await checkBadges();
        }

        res.json({ completed, leveledUp, newLevel, newBadges });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Uploads
app.post('/api/upload_cover', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const oldPath = req.file.path;
    const newPath = path.join(path.dirname(oldPath), 'cover.jpg');
    fs.rename(oldPath, newPath, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

app.post('/api/upload_routine_image', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const oldPath = req.file.path;
    const newPath = path.join(path.dirname(oldPath), 'routine.jpg');
    fs.rename(oldPath, newPath, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
