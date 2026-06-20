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

// Database connection - with better error handling
let pool = null;

try {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    console.log('Database pool created');
} catch (err) {
    console.error('Pool creation error:', err.message);
}

// Simple test endpoint that doesn't need database
app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'API is working!' });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'API is running', timestamp: new Date().toISOString() });
});

// Get all students - with error handling
app.get('/api/students', async (req, res) => {
    try {
        if (!pool) {
            return res.json([]);
        }
        const result = await pool.query('SELECT * FROM students ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        console.error('Students error:', error.message);
        res.json([]);
    }
});

// Get single student
app.get('/api/students/:id', async (req, res) => {
    try {
        if (!pool) {
            return res.status(404).json({ error: 'Database not connected' });
        }
        const result = await pool.query('SELECT * FROM students WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Student error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get subjects
app.get('/api/subjects', async (req, res) => {
    try {
        if (!pool) {
            return res.json([]);
        }
        const result = await pool.query('SELECT * FROM subjects ORDER BY display_order');
        res.json(result.rows);
    } catch (error) {
        console.error('Subjects error:', error.message);
        res.json([]);
    }
});

// Teacher subjects
app.get('/api/teacher/subjects', async (req, res) => {
    const { class_level } = req.query;
    try {
        if (!pool) {
            return res.json([]);
        }
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
        console.error('Teacher subjects error:', error.message);
        res.json([]);
    }
});

// Teacher students
app.get('/api/teacher/students', async (req, res) => {
    const { class_level } = req.query;
    try {
        if (!pool) {
            return res.json([]);
        }
        const result = await pool.query('SELECT * FROM students WHERE class_level = $1 ORDER BY name', [class_level]);
        res.json(result.rows);
    } catch (error) {
        console.error('Teacher students error:', error.message);
        res.json([]);
    }
});

// Admin login
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    // Hardcoded admin for testing
    if (username === 'admin' && password === 'admin123') {
        const token = jwt.sign({ username: 'admin', role: 'admin' }, 'secret', { expiresIn: '24h' });
        return res.json({ success: true, token, user: { username: 'admin', role: 'admin' } });
    }
    
    res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// Teacher login
app.post('/api/teacher/login', async (req, res) => {
    const { email, password } = req.body;
    
    // Hardcoded teacher for testing
    if (email === 'teacher@livingspring.edu.gh' && password === 'teacher123') {
        const token = jwt.sign({ email: email, name: 'Demo Teacher', assigned_class: 'P4' }, 'secret', { expiresIn: '24h' });
        return res.json({ success: true, token, teacher: { name: 'Demo Teacher', email: email, assigned_class: 'P4' } });
    }
    
    res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// Dashboard stats
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        if (!pool) {
            return res.json({ totalClients: 0, totalProjects: 0, totalRevenue: 0, pendingTasks: 0 });
        }
        const clients = await pool.query('SELECT COUNT(*) FROM students');
        res.json({ 
            totalClients: parseInt(clients.rows[0].count),
            totalProjects: 0,
            totalRevenue: 0,
            pendingTasks: 0
        });
    } catch (error) {
        res.json({ totalClients: 0, totalProjects: 0, totalRevenue: 0, pendingTasks: 0 });
    }
});

// Teacher stats
app.get('/api/teacher/stats', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ success: false });
    }
    
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, 'secret');
        
        if (!pool) {
            return res.json({ studentCount: 0, subjectsCount: 0 });
        }
        
        const students = await pool.query('SELECT COUNT(*) FROM students WHERE class_level = $1', [decoded.assigned_class]);
        res.json({ 
            studentCount: parseInt(students.rows[0].count),
            subjectsCount: 8
        });
    } catch (error) {
        res.json({ studentCount: 0, subjectsCount: 0 });
    }
});

// SBA endpoints
app.get('/api/sba', async (req, res) => {
    res.json([]);
});

app.get('/api/sba/check', async (req, res) => {
    res.json({ exists: false });
});

app.post('/api/sba', async (req, res) => {
    res.json({ success: true });
});

app.put('/api/sba/:id', async (req, res) => {
    res.json({ success: true });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.get('/:page.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', `${req.params.page}.html`));
});

module.exports = app;
