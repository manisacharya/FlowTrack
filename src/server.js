#!/usr/bin/env node
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const db = require('./database');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'super_secret_key_change_this'; // In prod use env var

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
        const fileExt = path.extname(file.originalname);
        const fileName = path.basename(file.originalname, fileExt) + '-' + Date.now() + fileExt;
        cb(null, fileName);
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

// --- Middleware ---

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

function authorizeAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Admin access required' });
    }
}

// --- Gamification Logic (Scoped) ---
async function awardPoints(userId, points) {
    // Ensure stats exist
    let stats = await dbGet('SELECT * FROM user_stats WHERE user_id = ?', [userId]);
    if (!stats) {
        await dbRun('INSERT INTO user_stats (user_id, points, level, xp, focus_minutes) VALUES (?, 0, 1, 0, 0)', [userId]);
        stats = { level: 1, xp: 0 };
    }

    await dbRun('UPDATE user_stats SET points = points + ?, xp = xp + ? WHERE user_id = ?', [points, points, userId]);

    // Check level up (simple logic: level * 100 xp needed)
    stats = await dbGet('SELECT * FROM user_stats WHERE user_id = ?', [userId]);
    const needed = stats.level * 100;
    let leveledUp = false;
    if (stats.xp >= needed) {
        await dbRun('UPDATE user_stats SET level = level + 1, xp = xp - ? WHERE user_id = ?', [needed, userId]);
        leveledUp = true;
    }
    return { leveledUp, newLevel: leveledUp ? stats.level + 1 : stats.level };
}

async function checkBadges(userId) {
    const earned = [];
    const stats = await dbGet('SELECT * FROM user_stats WHERE user_id = ?', [userId]);
    if (!stats) return []; // Should exist by now

    // Scoped Queries
    const totalHabits = (await dbGet('SELECT COUNT(*) as c FROM habit_logs l JOIN habits h ON l.habit_id = h.id WHERE h.user_id = ?', [userId])).c;
    const maxStreak = (await dbGet('SELECT MAX(streak) as c FROM habits WHERE user_id = ?', [userId])).c || 0;

    // For routines, we now use routine_logs which has user_id
    const morningCount = (await dbGet("SELECT COUNT(*) as c FROM routine_logs l JOIN routines r ON l.routine_id = r.id WHERE r.kind = 'morning' AND l.user_id = ?", [userId])).c;
    const nightCount = (await dbGet("SELECT COUNT(*) as c FROM routine_logs l JOIN routines r ON l.routine_id = r.id WHERE r.kind = 'night' AND l.user_id = ?", [userId])).c;

    const badges = await dbAll('SELECT * FROM badges');
    const userBadges = await dbAll('SELECT badge_id FROM user_badges WHERE user_id = ?', [userId]);
    const userBadgeIds = new Set(userBadges.map(b => b.badge_id));

    for (const b of badges) {
        if (userBadgeIds.has(b.id)) continue;
        let qualified = false;
        if (b.condition_type === 'total_habits' && totalHabits >= b.condition_value) qualified = true;
        if (b.condition_type === 'streak' && maxStreak >= b.condition_value) qualified = true;
        if (b.condition_type === 'morning_routine' && morningCount >= b.condition_value) qualified = true;
        if (b.condition_type === 'night_routine' && nightCount >= b.condition_value) qualified = true;

        if (qualified) {
            await dbRun('INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)', [userId, b.id]);
            earned.push(b);
        }
    }
    return earned;
}

// --- API Routes ---

// AUTH
app.post('/api/register', async (req, res) => {
    const { username, password, recovery_question, recovery_answer } = req.body;
    if (!username || !password || !recovery_question || !recovery_answer) {
        return res.status(400).json({ error: 'Username, password, and security question are required' });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        // Only regular users can register publicly
        const result = await dbRun('INSERT INTO users (username, password_hash, role, recovery_question, recovery_answer) VALUES (?, ?, ?, ?, ?)',
            [username, hash, 'user', recovery_question, recovery_answer]);

        // Init stats
        await dbRun('INSERT INTO user_stats (user_id, points, level, xp, focus_minutes) VALUES (?, 0, 1, 0, 0)', [result.lastID]);

        res.status(201).json({ message: 'User created' });
    } catch (err) {
        res.status(500).json({ error: err.message.includes('UNIQUE') ? 'Username taken' : err.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
        if (!user) return res.status(400).json({ error: 'User not found' });

        if (await bcrypt.compare(password, user.password_hash)) {
            const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY);
            res.json({ token, role: user.role, username: user.username });
        } else {
            res.status(403).json({ error: 'Invalid password' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Forgot Password Flow
app.get('/api/auth/forgot', async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'Username required' });

    try {
        const user = await dbGet('SELECT recovery_question FROM users WHERE username = ?', [username]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!user.recovery_question) return res.status(400).json({ error: 'No recovery question set for this user' });

        res.json({ question: user.recovery_question });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/reset', async (req, res) => {
    const { username, answer, newPassword } = req.body;
    if (!username || !answer || !newPassword) return res.status(400).json({ error: 'All fields required' });

    try {
        const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (user.recovery_answer === answer) {
            const hash = await bcrypt.hash(newPassword, 10);
            await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
            res.json({ message: 'Password reset successful' });
        } else {
            res.status(403).json({ error: 'Incorrect answer' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/me', authenticateToken, async (req, res) => {
    try {
        const user = await dbGet('SELECT id, username, role, recovery_question, recovery_answer FROM users WHERE id = ?', [req.user.id]);
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/profile/security', authenticateToken, async (req, res) => {
    const { recovery_question, recovery_answer } = req.body;
    if (!recovery_question || !recovery_answer) {
        return res.status(400).json({ error: 'Question and answer are required' });
    }
    try {
        await dbRun('UPDATE users SET recovery_question = ?, recovery_answer = ? WHERE id = ?',
            [recovery_question, recovery_answer, req.user.id]);
        res.json({ success: true, message: 'Security settings updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/me/reset', authenticateToken, async (req, res) => {
    try {
        // Clear habit logs
        await dbRun('DELETE FROM habit_logs WHERE habit_id IN (SELECT id FROM habits WHERE user_id = ?)', [req.user.id]);
        // Reset habit streaks
        await dbRun('UPDATE habits SET streak = 0 WHERE user_id = ?', [req.user.id]);
        // Clear routine logs
        await dbRun('DELETE FROM routine_logs WHERE user_id = ?', [req.user.id]);
        // Clear badges
        await dbRun('DELETE FROM user_badges WHERE user_id = ?', [req.user.id]);
        // Reset stats
        await dbRun('UPDATE user_stats SET points = 0, level = 1, xp = 0, focus_minutes = 0 WHERE user_id = ?', [req.user.id]);

        res.json({ success: true, message: 'Progress reset' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Categories (Authenticated)
app.get('/api/categories', authenticateToken, async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM categories ORDER BY name ASC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/categories', authenticateToken, authorizeAdmin, async (req, res) => {
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

// Habits (Scoped)
app.get('/api/habits', authenticateToken, async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM habits WHERE user_id = ? ORDER BY sort ASC, id ASC', [req.user.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/habits', authenticateToken, async (req, res) => {
    const { title, frequency, color, icon, notification_time, notification_enabled } = req.body;
    if (!title) return res.status(400).json({ error: 'Missing title' });
    try {
        const result = await dbRun(
            'INSERT INTO habits (user_id, title, frequency, color, icon, notification_time, notification_enabled) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.user.id, title, frequency || 'daily', color || '#000000', icon || '📝', notification_time || '', notification_enabled ? 1 : 0]
        );
        const row = await dbGet('SELECT * FROM habits WHERE id = ?', [result.lastID]);
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/habits', authenticateToken, async (req, res) => {
    const { id } = req.query;
    const { title, frequency, color, icon, notification_time, notification_enabled } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    try {
        // Verify ownership
        const habit = await dbGet('SELECT user_id FROM habits WHERE id = ?', [id]);
        if (!habit || habit.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

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

app.delete('/api/habits', authenticateToken, async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    try {
        const habit = await dbGet('SELECT user_id FROM habits WHERE id = ?', [id]);
        if (!habit || habit.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

        await dbRun('DELETE FROM habits WHERE id = ?', [id]);
        res.json({ deleted: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});




// Habit Logs (Scoped)
app.get('/api/habit_logs', authenticateToken, async (req, res) => {
    const { start, end } = req.query;
    try {
        // Query logs for habits owned by user
        let sql = `
            SELECT l.habit_id, l.log_date, l.note, l.completed FROM habit_logs l
            JOIN habits h ON l.habit_id = h.id
            WHERE h.user_id = ?
        `;
        const params = [req.user.id];
        if (start && end) {
            sql += ' AND l.log_date BETWEEN ? AND ?';
            params.push(start, end);
        }
        const rows = await dbAll(sql, params);

        const logsMap = {};
        rows.forEach(r => {
            if (!logsMap[r.habit_id]) logsMap[r.habit_id] = {};
            const hasNote = r.note !== null && r.note !== undefined && String(r.note).trim().length > 0;
            // Use 'completed' column if available (default to 1 for backward compat if migration just ran)
            const isCompleted = r.completed !== undefined ? r.completed : 1;
            logsMap[r.habit_id][r.log_date] = { logged: isCompleted, hasNote: hasNote };
        });

        res.json({ logs: logsMap });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Detailed Habit Logs (Scoped)
app.get('/api/habit_detailed_logs', authenticateToken, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT l.*, h.title, h.icon, h.color 
            FROM habit_logs l
            JOIN habits h ON l.habit_id = h.id
            WHERE h.user_id = ?
            ORDER BY l.log_date DESC, l.created_at DESC
        `, [req.user.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mark/Unmark Habit Logic
async function updateHabitStreak(id, userId) {
    const habit = await dbGet('SELECT * FROM habits WHERE id = ? AND user_id = ?', [id, userId]);
    if (!habit) return;

    const logs = await dbAll('SELECT log_date FROM habit_logs WHERE habit_id = ? AND completed = 1 ORDER BY log_date DESC', [id]);
    const dates = logs.map(l => l.log_date);

    let streak = 0;
    if (dates.length > 0) {
        // Helper to get Monday of the week (YYYY-MM-DD)
        const getMonday = (dStr) => {
            const d = new Date(dStr + 'T12:00:00');
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            return new Date(d.setDate(diff)).toISOString().slice(0, 10);
        };

        const today = new Date().toISOString().slice(0, 10);

        if (habit.frequency === 'weekly') {
            const weeks = [...new Set(dates.map(d => getMonday(d)))].sort((a, b) => new Date(b) - new Date(a));

            // Current week Monday
            const nowMonday = getMonday(today);
            const lastLogMonday = weeks[0];

            // If last log was before last week, streak is 0
            const diffTime = new Date(nowMonday) - new Date(lastLogMonday);
            const diffWeeks = Math.round(diffTime / (1000 * 60 * 60 * 24 * 7));

            if (diffWeeks <= 1) {
                streak = 1;
                let currentMonday = new Date(lastLogMonday);
                for (let i = 1; i < weeks.length; i++) {
                    const prevMonday = new Date(weeks[i]);
                    const dWeeks = Math.round(Math.abs(currentMonday - prevMonday) / (1000 * 60 * 60 * 24 * 7));
                    if (dWeeks === 1) {
                        streak++;
                        currentMonday = prevMonday;
                    } else break;
                }
            }
        } else {
            const sorted = [...new Set(dates)].sort((a, b) => new Date(b) - new Date(a));
            const lastLogDate = sorted[0];

            // If last log was before yesterday, streak is 0
            const diffTime = new Date(today) - new Date(lastLogDate);
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 1) {
                streak = 1;
                let current = new Date(lastLogDate + 'T12:00:00');
                for (let i = 1; i < sorted.length; i++) {
                    const prev = new Date(sorted[i] + 'T12:00:00');
                    const dDays = Math.round(Math.abs(current - prev) / (1000 * 60 * 60 * 24));
                    if (dDays === 1) {
                        streak++;
                        current = prev;
                    } else break;
                }
            }
        }

        await dbRun('UPDATE habits SET streak = ? WHERE id = ?', [streak, id]);
    } else {
        await dbRun('UPDATE habits SET streak = 0 WHERE id = ?', [id]);
    }

    return await dbGet('SELECT * FROM habits WHERE id = ?', [id]);
}

app.post('/api/mark_habit', authenticateToken, async (req, res) => {
    const { id, d } = req.query;
    // Verify ownership
    const habit = await dbGet('SELECT id FROM habits WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!habit) return res.status(403).json({ error: 'Not authorized' });

    try {
        // Upsert logic: Try insert, then ensure completed=1
        await dbRun('INSERT OR IGNORE INTO habit_logs (habit_id, log_date, completed) VALUES (?, ?, 1)', [id, d]);
        await dbRun('UPDATE habit_logs SET completed = 1 WHERE habit_id = ? AND log_date = ?', [id, d]);

        const updated = await updateHabitStreak(id, req.user.id);

        // Gamification - Only award if it wasn't already completed? 
        // For simplicity, allowed. But realistically should check if we just changed 0->1.
        // Doing basic for now.
        const { leveledUp, newLevel } = await awardPoints(req.user.id, 10);
        const newBadges = await checkBadges(req.user.id);

        res.json({ ...updated, leveledUp, newLevel, newBadges });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/unmark_habit', authenticateToken, async (req, res) => {
    const { id, d } = req.query;
    const habit = await dbGet('SELECT id FROM habits WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!habit) return res.status(403).json({ error: 'Not authorized' });

    try {
        // Soft delete: set completed = 0 so we keep the note
        await dbRun('UPDATE habit_logs SET completed = 0 WHERE habit_id = ? AND log_date = ?', [id, d]);
        const updated = await updateHabitStreak(id, req.user.id);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Habit Notes
app.post('/api/habit_note', authenticateToken, async (req, res) => {
    const { habit_id, date, note } = req.body;
    const habit = await dbGet('SELECT id FROM habits WHERE id = ? AND user_id = ?', [habit_id, req.user.id]);
    if (!habit) return res.status(403).json({ error: 'Not authorized' });

    try {
        const log = await dbGet('SELECT id FROM habit_logs WHERE habit_id = ? AND log_date = ?', [habit_id, date]);
        if (!log) {
            // Create if note added before check
            await dbRun('INSERT INTO habit_logs (habit_id, log_date, note, completed) VALUES (?, ?, ?, 1)', [habit_id, date, note]);
        } else {
            await dbRun('UPDATE habit_logs SET note = ?, completed = 1 WHERE id = ?', [note, log.id]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/habit_note', authenticateToken, async (req, res) => {
    const { habit_id, date } = req.query;
    const habit = await dbGet('SELECT id FROM habits WHERE id = ? AND user_id = ?', [habit_id, req.user.id]);
    if (!habit) return res.status(403).json({ error: 'Not authorized' });

    try {
        const log = await dbGet('SELECT note FROM habit_logs WHERE habit_id = ? AND log_date = ?', [habit_id, date]);
        res.json({ note: log?.note || '' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Metrics (Scoped)
app.get('/api/metrics', authenticateToken, async (req, res) => {
    try {
        const activeHabits = (await dbGet('SELECT COUNT(*) as c FROM habits WHERE user_id = ?', [req.user.id])).c;
        const longestStreak = (await dbGet('SELECT MAX(streak) as c FROM habits WHERE user_id = ?', [req.user.id])).c || 0;

        let stats = await dbGet('SELECT * FROM user_stats WHERE user_id = ? LIMIT 1', [req.user.id]);
        if (!stats) {
            await dbRun('INSERT INTO user_stats (user_id) VALUES (?)', [req.user.id]);
            stats = { points: 0, level: 1, xp: 0 };
        }

        const badges = await dbAll('SELECT b.* FROM user_badges ub JOIN badges b ON ub.badge_id = b.id WHERE ub.user_id = ?', [req.user.id]);

        res.json({ activeHabits, longestStreak, stats, badges });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Focus Mode
app.post('/api/focus/complete', authenticateToken, async (req, res) => {
    const { minutes } = req.body;
    if (!minutes || minutes < 1) return res.status(400).json({ error: 'Invalid minutes' });

    try {
        await dbRun('UPDATE user_stats SET focus_minutes = focus_minutes + ? WHERE user_id = ?', [minutes, req.user.id]);
        const xpEarned = Math.floor(minutes / 5);
        const { leveledUp, newLevel } = await awardPoints(req.user.id, xpEarned);

        const stats = await dbGet('SELECT * FROM user_stats WHERE user_id = ?', [req.user.id]);
        res.json({ stats, leveledUp, newLevel });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Analytics (Scoped)
app.get('/api/analytics', authenticateToken, async (req, res) => {
    try {
        const morningTotal = (await dbGet("SELECT COUNT(*) as c FROM routines WHERE kind = 'morning'")).c || 0;
        const nightTotal = (await dbGet("SELECT COUNT(*) as c FROM routines WHERE kind = 'night'")).c || 0;

        const rows = await dbAll(`
            SELECT 
                l.log_date as date,
                SUM(CASE WHEN r.kind = 'morning' THEN 1 ELSE 0 END) as morning_count,
                SUM(CASE WHEN r.kind = 'night' THEN 1 ELSE 0 END) as night_count
            FROM routine_logs l
            JOIN routines r ON l.routine_id = r.id
            WHERE l.user_id = ? AND l.log_date >= date('now', '-30 days')
            GROUP BY l.log_date
            ORDER BY l.log_date ASC
        `, [req.user.id]);

        res.json({
            stats: rows,
            morningTotal,
            nightTotal
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Calendar Activity (Scoped)
app.get('/api/calendar_activity', authenticateToken, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT DISTINCT log_date FROM habit_logs l JOIN habits h ON l.habit_id = h.id WHERE h.user_id = ?
            UNION
            SELECT DISTINCT log_date FROM routine_logs WHERE user_id = ?
        `, [req.user.id, req.user.id]);
        res.json(rows.map(r => r.log_date));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Coach (Scoped)
app.get('/api/coach', authenticateToken, async (req, res) => {
    try {
        const streak = (await dbGet('SELECT MAX(streak) as c FROM habits WHERE user_id = ?', [req.user.id])).c || 0;
        const totalLogs = (await dbGet('SELECT COUNT(*) as c FROM habit_logs l JOIN habits h ON l.habit_id = h.id WHERE h.user_id = ? AND log_date >= date("now", "-7 days")', [req.user.id])).c;
        const activeHabits = (await dbGet('SELECT COUNT(*) as c FROM habits WHERE user_id = ?', [req.user.id])).c;
        const bestHabit = await dbGet('SELECT title, streak FROM habits WHERE user_id = ? ORDER BY streak DESC LIMIT 1', [req.user.id]);

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
        }
        const message = `${intro} ${analysis}`;
        res.json({ message });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Routines (Global)
app.get('/api/routines', authenticateToken, async (req, res) => {
    const { kind } = req.query;
    try {
        // Open to all
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

// Modify Routines (Admin Only)
app.post('/api/routines', authenticateToken, authorizeAdmin, async (req, res) => {
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

app.put('/api/routines', authenticateToken, authorizeAdmin, async (req, res) => {
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

app.delete('/api/routines', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    try {
        await dbRun('DELETE FROM routines WHERE id = ?', [id]);
        res.json({ deleted: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});




// Routine Progress (Scoped)
app.get('/api/routines/progress', authenticateToken, async (req, res) => {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);
    try {
        const rows = await dbAll('SELECT routine_id FROM routine_logs WHERE user_id = ? AND log_date = ?', [req.user.id, targetDate]);
        res.json({ completed: rows.map(r => r.routine_id) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/routines/toggle', authenticateToken, async (req, res) => {
    const { id, date } = req.body;
    const targetDate = date || new Date().toISOString().slice(0, 10);
    if (!id) return res.status(400).json({ error: 'Missing id' });

    try {
        const existing = await dbGet('SELECT id FROM routine_logs WHERE user_id = ? AND routine_id = ? AND log_date = ?', [req.user.id, id, targetDate]);
        let completed = false;
        let leveledUp = false;
        let newLevel = 0;
        let newBadges = [];

        if (existing) {
            await dbRun('DELETE FROM routine_logs WHERE id = ?', [existing.id]);
        } else {
            await dbRun('INSERT INTO routine_logs (user_id, routine_id, log_date) VALUES (?, ?, ?)', [req.user.id, id, targetDate]);
            completed = true;
            const stats = await awardPoints(req.user.id, 5);
            if (stats.leveledUp) {
                leveledUp = true;
                newLevel = stats.newLevel;
            }
            newBadges = await checkBadges(req.user.id);
        }

        res.json({ completed, leveledUp, newLevel, newBadges });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Uploads (Scoped?)
app.post('/api/upload_cover', authenticateToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const oldPath = req.file.path;
    // User-specific cover
    const newFileName = `cover_${req.user.id}.jpg`;
    const newPath = path.join(path.dirname(oldPath), newFileName);

    fs.rename(oldPath, newPath, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

app.post('/api/upload_routine_image', authenticateToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const oldPath = req.file.path;
    const newFileName = `routine_${req.user.id}.jpg`;
    const newPath = path.join(path.dirname(oldPath), newFileName);

    fs.rename(oldPath, newPath, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// Admin: User Management
app.get('/api/users', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const users = await dbAll(`
            SELECT u.id, u.username, u.role, u.created_at, IFNULL(s.level, 1) as level 
            FROM users u
            LEFT JOIN user_stats s ON u.id = s.user_id
            ORDER BY u.id DESC
        `);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', authenticateToken, authorizeAdmin, async (req, res) => {
    const { username, password, role, recovery_question, recovery_answer } = req.body;
    if (!username || !password || !recovery_question || !recovery_answer) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await dbRun('INSERT INTO users (username, password_hash, role, recovery_question, recovery_answer) VALUES (?, ?, ?, ?, ?)',
            [username, hash, role || 'user', recovery_question, recovery_answer]);

        // Init stats
        await dbRun('INSERT INTO user_stats (user_id, points, level, xp, focus_minutes) VALUES (?, 0, 1, 0, 0)', [result.lastID]);

        res.status(201).json({ message: 'User created' });
    } catch (err) {
        res.status(500).json({ error: err.message.includes('UNIQUE') ? 'Username taken' : err.message });
    }
});

app.patch('/api/users/role', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id, role } = req.body;
    if (!id || !role) return res.status(400).json({ error: 'ID and role required' });
    if (String(id) === String(req.user.id)) return res.status(400).json({ error: 'Cannot change your own role' });

    try {
        await dbRun('UPDATE users SET role = ? WHERE id = ?', [role, id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', authenticateToken, authorizeAdmin, async (req, res) => {
    const { username, password, role, recovery_question, recovery_answer } = req.body;
    if (!username || !password || !role || !recovery_question || !recovery_answer) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await dbRun(
            'INSERT INTO users (username, password_hash, role, recovery_question, recovery_answer) VALUES (?, ?, ?, ?, ?)',
            [username, hash, role, recovery_question, recovery_answer]
        );

        // Init stats for the new user
        await dbRun('INSERT INTO user_stats (user_id, points, level, xp, focus_minutes) VALUES (?, 0, 1, 0, 0)', [result.lastID]);

        res.status(201).json({ message: 'User created' });
    } catch (err) {
        res.status(500).json({ error: err.message.includes('UNIQUE') ? 'Username taken' : err.message });
    }
});

app.delete('/api/users', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    if (String(id) === String(req.user.id)) return res.status(400).json({ error: 'Cannot self-delete' });

    try {
        await dbRun('DELETE FROM users WHERE id = ?', [id]);
        res.json({ deleted: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
