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
        // For cover and routine images, we might want fixed names or keep original
        // The PHP code seemed to overwrite 'cover.jpg' or 'routine.jpg' based on endpoint
        // But here I'll just use the fieldname or a fixed name if requested.
        // Actually, the PHP `upload_cover.php` likely saved as `cover.jpg`.
        // Let's check the endpoints logic below.
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

// Tasks
app.get('/api/tasks', async (req, res) => {
    const { q, category_id, start_due, end_due } = req.query;
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];

    if (q) {
        sql += ' AND title LIKE ?';
        params.push(`%${q}%`);
    }
    if (category_id) {
        sql += ' AND category_id = ?';
        params.push(category_id);
    }
    if (start_due) {
        sql += ' AND due_date >= ?';
        params.push(start_due);
    }
    if (end_due) {
        sql += ' AND due_date <= ?';
        params.push(end_due);
    }

    sql += ' ORDER BY completed ASC, due_date ASC, id DESC';

    try {
        const rows = await dbAll(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tasks', async (req, res) => {
    const { title, category_id, due_date } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    try {
        const result = await dbRun(
            'INSERT INTO tasks (title, category_id, due_date) VALUES (?, ?, ?)',
            [title, category_id || null, due_date || null]
        );
        const row = await dbGet('SELECT * FROM tasks WHERE id = ?', [result.lastID]);
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tasks', async (req, res) => {
    const { id } = req.query; // PHP used ?id=...
    const { completed } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    try {
        await dbRun('UPDATE tasks SET completed = ? WHERE id = ?', [completed, id]);
        const row = await dbGet('SELECT * FROM tasks WHERE id = ?', [id]);
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tasks', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    try {
        await dbRun('DELETE FROM tasks WHERE id = ?', [id]);
        res.json({ deleted: id });
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
    const { title, frequency } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    try {
        const result = await dbRun(
            'INSERT INTO habits (title, frequency) VALUES (?, ?)',
            [title, frequency || 'daily']
        );
        const row = await dbGet('SELECT * FROM habits WHERE id = ?', [result.lastID]);
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

        // Group by habit_id for easier frontend consumption if needed, 
        // but the PHP returned { logs: { habitId: { date: 1, ... } } }
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

    const lastLog = await dbGet('SELECT MAX(log_date) as lastMarked FROM habit_logs WHERE habit_id = ?', [id]);
    const lastMarked = lastLog ? lastLog.lastMarked : null;

    let streak = 0;
    if (lastMarked) {
        let current = new Date(lastMarked);
        const frequency = habit.frequency;

        while (true) {
            const check = current.toISOString().slice(0, 10);
            const exists = await dbGet('SELECT 1 FROM habit_logs WHERE habit_id = ? AND log_date = ?', [id, check]);
            if (!exists) break;
            streak++;

            if (frequency === 'daily') {
                current.setDate(current.getDate() - 1);
            } else {
                current.setDate(current.getDate() - 7);
            }
        }
    }

    await dbRun('UPDATE habits SET last_marked = ?, streak = ? WHERE id = ?', [lastMarked, streak, id]);
    return await dbGet('SELECT * FROM habits WHERE id = ?', [id]);
}

app.post('/api/mark_habit', async (req, res) => {
    const { id, d } = req.query;
    const target = d || new Date().toISOString().slice(0, 10);

    try {
        // Insert ignore equivalent in SQLite is INSERT OR IGNORE
        await dbRun('INSERT OR IGNORE INTO habit_logs (habit_id, log_date) VALUES (?, ?)', [id, target]);
        const updated = await updateHabitStreak(id);
        res.json(updated);
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

// Metrics
app.get('/api/metrics', async (req, res) => {
    try {
        const tasksCompleted = (await dbGet('SELECT COUNT(*) as c FROM tasks WHERE completed = 1')).c;
        const activeHabits = (await dbGet('SELECT COUNT(*) as c FROM habits')).c;
        const longestStreak = (await dbGet('SELECT MAX(streak) as c FROM habits')).c || 0;
        res.json({ tasksCompleted, activeHabits, longestStreak });
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

// Uploads
// Cover upload
app.post('/api/upload_cover.php', upload.single('file'), (req, res) => {
    // The PHP script likely renamed it to 'cover.jpg'. 
    // We can rename it here.
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const oldPath = req.file.path;
    const newPath = path.join(path.dirname(oldPath), 'cover.jpg');
    fs.rename(oldPath, newPath, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});
// Also support the clean URL if I update frontend
app.post('/api/upload_cover', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const oldPath = req.file.path;
    const newPath = path.join(path.dirname(oldPath), 'cover.jpg');
    fs.rename(oldPath, newPath, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// Routine image upload
app.post('/api/upload_routine_image.php', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const oldPath = req.file.path;
    const newPath = path.join(path.dirname(oldPath), 'routine.jpg');
    fs.rename(oldPath, newPath, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});
// Clean URL support
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
