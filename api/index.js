const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Test database connection
pool.connect((err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('PostgreSQL connected successfully');
    }
});

// ==================== TEST ENDPOINTS ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'API is running', timestamp: new Date().toISOString() });
});

app.get('/api/env-test', (req, res) => {
    res.json({
        has_db_url: !!process.env.DATABASE_URL,
        db_url_prefix: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) : 'not set',
        node_env: process.env.NODE_ENV || 'not set'
    });
});

app.get('/api/check-db', async (req, res) => {
    try {
        if (!process.env.DATABASE_URL) {
            return res.json({ success: false, error: 'DATABASE_URL not set' });
        }
        const result = await pool.query('SELECT NOW()');
        res.json({ success: true, time: result.rows[0].now });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ==================== TEACHER LOGIN ====================
app.post('/api/teacher/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const result = await pool.query('SELECT * FROM teachers WHERE email = $1', [email]);
        const teacher = result.rows[0];
        
        if (!teacher) {
            return res.status(401).json({ success: false, message: 'Teacher not found' });
        }
        
        let isValid = false;
        if (teacher.password === password) {
            isValid = true;
        } else {
            try {
                isValid = await bcrypt.compare(password, teacher.password);
            } catch (err) {}
        }
        
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid password' });
        }
        
        const token = jwt.sign(
            { id: teacher.id, email: teacher.email, name: teacher.name, assigned_class: teacher.assigned_class },
            process.env.JWT_SECRET || 'mySecretKey123',
            { expiresIn: '24h' }
        );
        
        res.json({ 
            success: true, 
            token, 
            teacher: { id: teacher.id, name: teacher.name, email: teacher.email, assigned_class: teacher.assigned_class } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== ADMIN LOGIN ====================
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
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get teacher's subjects
app.get('/api/teacher/subjects', async (req, res) => {
    const { class_level } = req.query;
    console.log('Fetching subjects for class:', class_level);
    
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
        console.error('Subjects error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get teacher's students
app.get('/api/teacher/students', async (req, res) => {
    const { class_level } = req.query;
    console.log('Fetching students for class:', class_level);
    
    try {
        const result = await pool.query('SELECT * FROM students WHERE class_level = $1 ORDER BY name', [class_level]);
        res.json(result.rows);
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

module.exports = app;
