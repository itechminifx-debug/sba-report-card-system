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

// Test database connection
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
        
        res.json({ 
            success: true, 
            token, 
            user: { id: user.id, username: user.username, role: user.role } 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== TEACHER LOGIN ====================
// ==================== TEACHER LOGIN ====================
app.post('/api/teacher/login', async (req, res) => {
    const { email, password } = req.body;
    
    console.log('Teacher login attempt:', email);
    
    try {
        const result = await pool.query('SELECT * FROM teachers WHERE email = $1', [email]);
        const teacher = result.rows[0];
        
        if (!teacher) {
            console.log('Teacher not found:', email);
            return res.status(401).json({ success: false, message: 'Teacher not found' });
        }
        
        const isValid = await bcrypt.compare(password, teacher.password);
        if (!isValid) {
            console.log('Invalid password for:', email);
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
        console.error('Teacher login error:', error);
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
