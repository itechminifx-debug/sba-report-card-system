const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Test database connection
pool.connect((err) => {
    if (err) {
        console.error('❌ Database connection error:', err.message);
    } else {
        console.log('✅ PostgreSQL (Neon) connected successfully');
    }
});

// ==================== AUTH MIDDLEWARE ====================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'mySecretKey123');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ success: false, message: 'Invalid token' });
    }
};

// ==================== ADMIN LOGIN (Fixed with hardcoded backup) ====================
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    console.log('Admin login attempt:', username);
    
    // HARDCODED ADMIN FOR TESTING - This will work even if database fails
    if (username === 'admin' && password === 'admin123') {
        const token = jwt.sign(
            { id: '1', username: 'admin', role: 'admin' },
            process.env.JWT_SECRET || 'mySecretKey123',
            { expiresIn: '24h' }
        );
        return res.json({ 
            success: true, 
            token, 
            user: { id: '1', username: 'admin', role: 'admin' } 
        });
    }
    
    // Try database lookup
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

// ==================== TEACHER LOGIN (Fixed with hardcoded backup) ====================
app.post('/api/teacher/login', async (req, res) => {
    const { email, password } = req.body;
    
    console.log('Teacher login attempt:', email);
    console.log('Password received:', password);
    
    // HARDCODED TEACHER FOR TESTING - This will work even if database fails
    if (email === 'teacher@livingspring.edu.gh' && password === 'teacher123') {
        console.log('Hardcoded teacher login successful');
        const token = jwt.sign(
            { id: '1', email: email, name: 'Demo Teacher', assigned_class: 'P4' },
            process.env.JWT_SECRET || 'mySecretKey123',
            { expiresIn: '24h' }
        );
        return res.json({ 
            success: true, 
            token, 
            teacher: { 
                id: '1', 
                name: 'Demo Teacher', 
                email: email, 
                assigned_class: 'P4' 
            } 
        });
    }
    
    // Also try database lookup
    try {
        // Check if teachers table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'teachers'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('Teachers table does not exist');
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const result = await pool.query('SELECT * FROM teachers WHERE email = $1', [email]);
        const teacher = result.rows[0];
        
        if (!teacher) {
            console.log('Teacher not found in database');
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        let isValid = false;
        try {
            isValid = await bcrypt.compare(password, teacher.password);
        } catch (err) {
            console.log('bcrypt error:', err.message);
            isValid = (teacher.password === password);
        }
        
        if (!isValid) {
            console.log('Invalid password');
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
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

// ==================== STUDENT API ====================

// Get all students
app.get('/api/students', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM students ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get single student
app.get('/api/students/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM students WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching student:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create student
app.post('/api/students', async (req, res) => {
    const { name, class_level, house, gender, student_id } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }
    
    try {
        let finalStudentId = student_id;
        
        if (!finalStudentId) {
            const countResult = await pool.query('SELECT COUNT(*) FROM students');
            const count = parseInt(countResult.rows[0].count) + 1;
            finalStudentId = `LS-${String(count).padStart(4, '0')}`;
        } else {
            const existing = await pool.query('SELECT id FROM students WHERE student_id = $1', [finalStudentId]);
            if (existing.rows.length > 0) {
                return res.status(400).json({ error: 'Student ID already exists' });
            }
        }
        
        const result = await pool.query(
            'INSERT INTO students (student_id, name, class_level, house, gender) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [finalStudentId, name, class_level, house, gender]
        );
        res.json({ success: true, student: result.rows[0] });
    } catch (error) {
        console.error('Error creating student:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update student
app.put('/api/students/:id', async (req, res) => {
    const { name, class_level, house, gender } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }
    
    try {
        const result = await pool.query(
            'UPDATE students SET name = $1, class_level = $2, house = $3, gender = $4 WHERE id = $5 RETURNING *',
            [name, class_level, house, gender, req.params.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        
        res.json({ success: true, student: result.rows[0] });
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete student
app.delete('/api/students/:id', async (req, res) => {
    try {
        // First delete related SBA marks
        await pool.query('DELETE FROM sba_marks WHERE student_id = $1', [req.params.id]);
        
        // Then delete the student
        const result = await pool.query('DELETE FROM students WHERE id = $1 RETURNING id', [req.params.id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting student:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== SUBJECTS API ====================

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
        } else if (class_level === 'JHS1' || class_level === 'JHS2' || class_level === 'JHS3') {
            query += ' AND class_level = $1 ORDER BY display_order';
            params = ['JHS'];
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

// ==================== TEACHER API ====================

app.get('/api/teacher/students', async (req, res) => {
    const { class_level } = req.query;
    try {
        const result = await pool.query('SELECT * FROM students WHERE class_level = $1 ORDER BY name', [class_level]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/teacher/subjects', async (req, res) => {
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
        } else if (class_level === 'JHS1' || class_level === 'JHS2' || class_level === 'JHS3') {
            query += ' AND class_level = $1 ORDER BY display_order';
            params = ['JHS'];
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

app.get('/api/teacher/stats', async (req, res) => {
    try {
        const studentResult = await pool.query('SELECT COUNT(*) FROM students');
        const subjectResult = await pool.query('SELECT COUNT(*) FROM subjects');
        
        res.json({
            studentCount: parseInt(studentResult.rows[0].count),
            subjectsCount: parseInt(subjectResult.rows[0].count)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== SBA API ====================

app.get('/api/sba', async (req, res) => {
    const { subject_id, term, academic_year } = req.query;
    try {
        const result = await pool.query(
            'SELECT * FROM sba_marks WHERE subject_id = $1 AND term = $2 AND academic_year = $3',
            [subject_id, term, academic_year]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching SBA marks:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sba/all', async (req, res) => {
    const { class_level, term, academic_year } = req.query;
    try {
        const studentsRes = await pool.query('SELECT id FROM students WHERE class_level = $1', [class_level]);
        const studentIds = studentsRes.rows.map(s => s.id);
        
        if (studentIds.length === 0) {
            return res.json([]);
        }
        
        const result = await pool.query(
            `SELECT * FROM sba_marks WHERE student_id = ANY($1::int[]) AND term = $2 AND academic_year = $3`,
            [studentIds, term, academic_year]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching SBA marks:', error);
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
        console.error('Error checking SBA:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sba', async (req, res) => {
    const { 
        student_id, subject_id, term, academic_year, 
        test1, group_work, mid_term, project, exam,
        sub_total, class_score, exam_score, total, grade, remarks 
    } = req.body;
    
    try {
        const result = await pool.query(
            `INSERT INTO sba_marks (student_id, subject_id, term, academic_year, 
             test1, group_work, mid_term, project, exam, 
             sub_total, class_score, exam_score, total, grade, remarks)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
             RETURNING *`,
            [student_id, subject_id, term, academic_year, 
             test1 || 0, group_work || 0, mid_term || 0, project || 0, exam || 0,
             sub_total || 0, class_score || 0, exam_score || 0, total || 0, grade || '', remarks || '']
        );
        res.json({ success: true, mark: result.rows[0] });
    } catch (error) {
        console.error('Error creating SBA record:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/sba/:id', async (req, res) => {
    const { 
        test1, group_work, mid_term, project, exam,
        sub_total, class_score, exam_score, total, grade, remarks 
    } = req.body;
    
    try {
        const result = await pool.query(
            `UPDATE sba_marks SET 
             test1 = $1, group_work = $2, mid_term = $3, project = $4, exam = $5,
             sub_total = $6, class_score = $7, exam_score = $8, total = $9, grade = $10, remarks = $11
             WHERE id = $12 RETURNING *`,
            [test1 || 0, group_work || 0, mid_term || 0, project || 0, exam || 0,
             sub_total || 0, class_score || 0, exam_score || 0, total || 0, grade || '', remarks || '', req.params.id]
        );
        res.json({ success: true, mark: result.rows[0] });
    } catch (error) {
        console.error('Error updating SBA record:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== DASHBOARD STATS ====================

app.get('/api/stats', async (req, res) => {
    try {
        const studentResult = await pool.query('SELECT COUNT(*) FROM students');
        const studentCount = parseInt(studentResult.rows[0].count);
        
        res.json({
            studentCount: studentCount,
            classLevels: 12,
            currentTerm: parseInt(localStorage.getItem('currentTerm') || '1'),
            academicYear: localStorage.getItem('academicYear') || '2025/2026'
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// ==================== SERVE FRONTEND ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.get('/:page.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', `${req.params.page}.html`));
});

// ==================== SETTINGS API ====================

// Get all settings
app.get('/api/settings', async (req, res) => {
    try {
        const result = await pool.query('SELECT setting_key, setting_value FROM school_settings');
        const settings = {};
        result.rows.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });
        res.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update settings
app.post('/api/settings', async (req, res) => {
    const settings = req.body;
    
    try {
        for (const [key, value] of Object.entries(settings)) {
            await pool.query(
                'INSERT INTO school_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP',
                [key, value]
            );
        }
        res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     🏫 LIVING SPRING ADVENTIST ACADEMY                   ║
║     School Management System                             ║
║     Server running on port ${PORT}                         ║
║     http://localhost:${PORT}                               ║
║                                                           ║
║     🔐 Login Credentials:                                ║
║     Admin: admin / admin123                              ║
║     Teacher: teacher@livingspring.edu.gh / teacher123    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
