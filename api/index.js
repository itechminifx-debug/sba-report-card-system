const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from frontend folder
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Test database connection (don't block startup)
pool.connect((err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('PostgreSQL connected successfully');
    }
});

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'API is running', timestamp: new Date().toISOString() });
});

// ==================== AUTH ROUTES ====================
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET || 'mySecretKey123',
            { expiresIn: '24h' }
        );
        
        res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== STUDENT ROUTES ====================
app.get('/api/students', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM students ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/students', async (req, res) => {
    const { name, class_level, house, gender, student_id } = req.body;
    
    try {
        let finalStudentId = student_id;
        if (!finalStudentId) {
            const countResult = await pool.query('SELECT COUNT(*) FROM students');
            const count = parseInt(countResult.rows[0].count) + 1;
            finalStudentId = `LS-${String(count).padStart(4, '0')}`;
        }
        
        const result = await pool.query(
            'INSERT INTO students (student_id, name, class_level, house, gender) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [finalStudentId, name, class_level, house, gender]
        );
        res.json({ success: true, student: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/students/:id', async (req, res) => {
    const { name, class_level, house, gender } = req.body;
    try {
        const result = await pool.query(
            'UPDATE students SET name = $1, class_level = $2, house = $3, gender = $4 WHERE id = $5 RETURNING *',
            [name, class_level, house, gender, req.params.id]
        );
        res.json({ success: true, student: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/students/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM students WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== SUBJECTS ROUTES ====================
app.get('/api/subjects', async (req, res) => {
    const { class_level } = req.query;
    try {
        let query = 'SELECT * FROM subjects WHERE 1=1';
        let params = [];
        
        if (class_level === 'KG1' || class_level === 'KG2') {
            query += ' AND class_level IN ($1, $2) ORDER BY display_order';
            params = ['KG1', 'KG2'];
        } else if (class_level === 'P1' || class_level === 'P2' || class_level === 'P3') {
            query += ' AND class_level = $1 ORDER BY display_order';
            params = ['P1-3'];
        } else if (class_level === 'P4' || class_level === 'P5' || class_level === 'P6') {
            query += ' AND class_level = $1 ORDER BY display_order';
            params = ['P4-6'];
        } else {
            query += ' AND class_level = $1 ORDER BY display_order';
            params = [class_level];
        }
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== SBA ROUTES ====================
app.get('/api/sba', async (req, res) => {
    const { subject_id, term, academic_year } = req.query;
    try {
        const result = await pool.query(
            'SELECT * FROM sba_marks WHERE subject_id = $1 AND term = $2 AND academic_year = $3',
            [subject_id, term, academic_year]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sba/check', async (req, res) => {
    const { student_id, subject_id, term, academic_year } = req.query;
    try {
        const result = await pool.query(
            'SELECT id FROM sba_marks WHERE student_id = $1 AND subject_id = $2 AND term = $3 AND academic_year = $4',
            [student_id, subject_id, term, academic_year]
        );
        res.json({ exists: result.rows.length > 0, id: result.rows[0]?.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sba', async (req, res) => {
    const { student_id, subject_id, term, academic_year, test1, group_work, mid_term, project, exam, sub_total, class_score, exam_score, total, grade, remarks } = req.body;
    
    try {
        const result = await pool.query(
            `INSERT INTO sba_marks (student_id, subject_id, term, academic_year, test1, group_work, mid_term, project, exam, sub_total, class_score, exam_score, total, grade, remarks)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
            [student_id, subject_id, term, academic_year, test1 || 0, group_work || 0, mid_term || 0, project || 0, exam || 0, sub_total || 0, class_score || 0, exam_score || 0, total || 0, grade || '', remarks || '']
        );
        res.json({ success: true, mark: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/sba/:id', async (req, res) => {
    const { test1, group_work, mid_term, project, exam, sub_total, class_score, exam_score, total, grade, remarks } = req.body;
    
    try {
        const result = await pool.query(
            `UPDATE sba_marks SET test1 = $1, group_work = $2, mid_term = $3, project = $4, exam = $5, sub_total = $6, class_score = $7, exam_score = $8, total = $9, grade = $10, remarks = $11 WHERE id = $12 RETURNING *`,
            [test1 || 0, group_work || 0, mid_term || 0, project || 0, exam || 0, sub_total || 0, class_score || 0, exam_score || 0, total || 0, grade || '', remarks || '', req.params.id]
        );
        res.json({ success: true, mark: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== DASHBOARD STATS ====================
app.get('/api/stats', async (req, res) => {
    try {
        const studentResult = await pool.query('SELECT COUNT(*) FROM students');
        res.json({ studentCount: parseInt(studentResult.rows[0].count) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== SERVE FRONTEND ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.get('/:page.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', `${req.params.page}.html`));
});

// ==================== FALLBACK ====================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

module.exports = app;