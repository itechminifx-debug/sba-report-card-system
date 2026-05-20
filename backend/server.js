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

// ==================== ADMIN LOGIN ====================
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    console.log('Admin login attempt:', username);
    
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
            { id: user.id, username: user.username, role: user.role || 'admin' },
            process.env.JWT_SECRET || 'mySecretKey123',
            { expiresIn: '24h' }
        );
        
        res.json({ 
            success: true, 
            token, 
            user: { id: user.id, username: user.username, role: user.role || 'admin' } 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== TEACHER LOGIN ====================
app.post('/api/teacher/login', async (req, res) => {
    const { email, password } = req.body;
    
    console.log('Teacher login attempt:', email);
    
    if (email === 'teacher@livingspring.edu.gh' && password === 'teacher123') {
        const token = jwt.sign(
            { id: '1', email: email, name: 'Demo Teacher', assigned_class: 'P4', role: 'teacher' },
            process.env.JWT_SECRET || 'mySecretKey123',
            { expiresIn: '24h' }
        );
        return res.json({ 
            success: true, 
            token, 
            teacher: { id: '1', name: 'Demo Teacher', email: email, assigned_class: 'P4' } 
        });
    }
    
    try {
        const result = await pool.query('SELECT * FROM teachers WHERE email = $1', [email]);
        const teacher = result.rows[0];
        
        if (!teacher) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const isValid = await bcrypt.compare(password, teacher.password);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { id: teacher.id, email: teacher.email, name: teacher.name, assigned_class: teacher.assigned_class, role: 'teacher' },
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

// ==================== PARENT LOGIN ====================
app.post('/api/parent/login', async (req, res) => {
    const { email, password } = req.body;
    
    console.log('Parent login attempt:', email);
    
    if (email === 'parent@livingspring.edu.gh' && password === 'parent123') {
        const token = jwt.sign(
            { id: '1', email: email, name: 'John Parent', role: 'parent' },
            process.env.JWT_SECRET || 'mySecretKey123',
            { expiresIn: '24h' }
        );
        return res.json({ 
            success: true, 
            token, 
            parent: { id: '1', name: 'John Parent', email: email } 
        });
    }
    
    try {
        const result = await pool.query('SELECT * FROM parents WHERE email = $1', [email]);
        const parent = result.rows[0];
        
        if (!parent) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const isValid = await bcrypt.compare(password, parent.password);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { id: parent.id, email: parent.email, name: parent.name, role: 'parent' },
            process.env.JWT_SECRET || 'mySecretKey123',
            { expiresIn: '24h' }
        );
        
        res.json({ 
            success: true, 
            token, 
            parent: { id: parent.id, name: parent.name, email: parent.email } 
        });
    } catch (error) {
        console.error('Parent login error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== STUDENT API ====================
app.get('/api/students', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM students ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ error: error.message });
    }
});

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

app.delete('/api/students/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM sba_marks WHERE student_id = $1', [req.params.id]);
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

// ==================== SETTINGS API ====================
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

// ==================== DASHBOARD STATS ====================
app.get('/api/stats', async (req, res) => {
    try {
        const studentResult = await pool.query('SELECT COUNT(*) FROM students');
        const studentCount = parseInt(studentResult.rows[0].count);
        
        res.json({
            studentCount: studentCount,
            classLevels: 12,
            currentTerm: 1,
            academicYear: '2025/2026'
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running', timestamp: new Date().toISOString() });
});

// ==================== CREATE DEFAULT DATA ENDPOINT ====================
app.post('/api/setup-defaults', async (req, res) => {
    try {
        const hashedPassword = '$2a$10$N9qo8uLOickgx2ZMRZoMy.Mr/.cJqJFxZF6QqGQvQyQyQyQyQy';
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'admin',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS teachers (
                id SERIAL PRIMARY KEY,
                teacher_id VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(200) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                assigned_class VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS parents (
                id SERIAL PRIMARY KEY,
                parent_id VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(200) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS parent_student_link (
                id SERIAL PRIMARY KEY,
                parent_id INTEGER REFERENCES parents(id),
                student_id INTEGER REFERENCES students(id),
                relation VARCHAR(50) DEFAULT 'Parent',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(parent_id, student_id)
            )
        `);
        
        await pool.query(
            `INSERT INTO users (username, password, role) 
             VALUES ('admin', $1, 'admin')
             ON CONFLICT (username) DO UPDATE SET password = $1`,
            [hashedPassword]
        );
        
        await pool.query(
            `INSERT INTO teachers (teacher_id, name, email, password, assigned_class) 
             VALUES ('TCH001', 'Demo Teacher', 'teacher@livingspring.edu.gh', $1, 'P4')
             ON CONFLICT (email) DO UPDATE SET password = $1`,
            [hashedPassword]
        );
        
        await pool.query(
            `INSERT INTO parents (parent_id, name, email, password, phone) 
             VALUES ('PRT001', 'John Parent', 'parent@livingspring.edu.gh', $1, '+233 24 123 4567')
             ON CONFLICT (email) DO UPDATE SET password = $1`,
            [hashedPassword]
        );
        
        res.json({ success: true, message: 'Default users created/updated' });
    } catch (error) {
        console.error('Setup error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== REPORT CARD DATA API ====================

// Save report card data
app.post('/api/report-card-data', authenticateToken, async (req, res) => {
    const { 
        student_id, class_level, term, academic_year,
        attendance_present, attendance_total, promoted_to,
        conduct, interest, teacher_remarks, headteacher_remarks
    } = req.body;
    
    try {
        // Build PD columns dynamically from pd_0 to pd_9
        const pdColumns = [];
        const pdValues = [];
        for (let i = 0; i <= 9; i++) {
            const pdKey = `pd_${i}`;
            if (req.body[pdKey] !== undefined) {
                pdColumns.push(pdKey);
                pdValues.push(req.body[pdKey]);
            }
        }
        
        // Build the column list and value placeholders
        const columns = [
            'student_id', 'class_level', 'term', 'academic_year',
            'attendance_present', 'attendance_total', 'promoted_to',
            'conduct', 'interest', 'teacher_remarks', 'headteacher_remarks'
        ];
        
        const values = [
            student_id, class_level, term, academic_year,
            attendance_present, attendance_total, promoted_to,
            conduct, interest, teacher_remarks, headteacher_remarks
        ];
        
        // Add PD columns
        for (const col of pdColumns) {
            columns.push(col);
        }
        for (const val of pdValues) {
            values.push(val);
        }
        
        // Build placeholders ($1, $2, etc.)
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        const columnNames = columns.join(', ');
        
        // Build UPDATE SET clause for ON CONFLICT
        const updateSet = columns.map(col => `${col} = EXCLUDED.${col}`).join(', ');
        
        const query = `
            INSERT INTO report_card_data (${columnNames})
            VALUES (${placeholders})
            ON CONFLICT (student_id, term, academic_year) 
            DO UPDATE SET ${updateSet}, updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;
        
        const result = await pool.query(query, values);
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error saving report card data:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get report card data for a student
app.get('/api/report-card-data', async (req, res) => {
    const { student_id, term, academic_year } = req.query;
    
    if (!student_id || !term || !academic_year) {
        return res.json({});
    }
    
    try {
        const result = await pool.query(
            'SELECT * FROM report_card_data WHERE student_id = $1 AND term = $2 AND academic_year = $3',
            [student_id, term, academic_year]
        );
        
        if (result.rows.length === 0) {
            return res.json({});
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching report card data:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== PARENT FULL REPORT API (FIXED - reads from database, not localStorage) ====================
app.get('/api/parent/full-report', authenticateToken, async (req, res) => {
    if (req.user.role !== 'parent') {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { student_id, student_name, term, academic_year } = req.query;
    
    console.log('Parent full report request:', { student_id, student_name, term, academic_year });
    
    try {
        // 1. FIND STUDENT
        const studentResult = await pool.query(
            'SELECT * FROM students WHERE student_id = $1 AND LOWER(name) = LOWER($2)',
            [student_id, student_name]
        );
        
        if (studentResult.rows.length === 0) {
            return res.json({ 
                success: false, 
                message: 'Student not found. Please check Student ID and Name.' 
            });
        }
        
        const student = studentResult.rows[0];
        console.log('Student found:', student.id, student.name);
        
        // 2. GET SUBJECTS for this class level
        let classLevelForSubjects = student.class_level;
        if (classLevelForSubjects === 'KG1' || classLevelForSubjects === 'KG2') {
            classLevelForSubjects = 'KG1';
        } else if (classLevelForSubjects === 'P1' || classLevelForSubjects === 'P2' || classLevelForSubjects === 'P3') {
            classLevelForSubjects = 'P1-3';
        } else if (classLevelForSubjects === 'P4' || classLevelForSubjects === 'P5' || classLevelForSubjects === 'P6') {
            classLevelForSubjects = 'P4-6';
        } else {
            classLevelForSubjects = 'JHS';
        }
        
        const subjectsRes = await pool.query(
            'SELECT DISTINCT ON (name) id, name, class_level, display_order FROM subjects WHERE class_level = $1 ORDER BY name, display_order',
            [classLevelForSubjects]
        );
        console.log('Subjects found:', subjectsRes.rows.length);
        
        // 3. GET SBA MARKS
        const sbaResult = await pool.query(
            'SELECT * FROM sba_marks WHERE student_id = $1 AND term = $2 AND academic_year = $3',
            [student.id, term, academic_year]
        );
        console.log('SBA marks found:', sbaResult.rows.length);
        
        // 4. FIXED: GET TEACHER-ENTERED REPORT DATA FROM DATABASE (not localStorage)
        const reportDataResult = await pool.query(
            'SELECT * FROM report_card_data WHERE student_id = $1 AND term = $2 AND academic_year = $3',
            [student.id, term, academic_year]
        );
        const studentReportData = reportDataResult.rows[0] || {};
        console.log('Report data found from database:', Object.keys(studentReportData).length);
        
        // 5. GET SCHOOL SETTINGS
        const settingsRes = await pool.query('SELECT setting_key, setting_value FROM school_settings');
        const settings = {};
        settingsRes.rows.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });
        
        // 6. PERSONAL DEVELOPMENT TRAITS based on class
        let personalDevTraits = [];
        if (student.class_level === 'KG1' || student.class_level === 'KG2') {
            personalDevTraits = ['Leadership Ability', 'Basic Life Skills', 'Neatness', 'Sociability', 'Creativity & Initiative', 'Dependability', 'Recreation Work'];
        } else if (student.class_level === 'P1' || student.class_level === 'P2' || student.class_level === 'P3' ||
                   student.class_level === 'P4' || student.class_level === 'P5' || student.class_level === 'P6') {
            personalDevTraits = ['Leadership Ability', 'Basic Life Skills', 'Neatness', 'Sociability', 'Creativity & Initiative', 'Dependability', 'Recreation Work', 'Work Habits'];
        } else {
            personalDevTraits = ['Basic Life Skills', 'Social Development Skills', 'Outdoor Activity', 'Work Habits'];
        }
        
        // 7. CALCULATE POSITIONS
        const classStudentsRes = await pool.query('SELECT id FROM students WHERE class_level = $1', [student.class_level]);
        const classStudentIds = classStudentsRes.rows.map(s => s.id);
        
        // Per-subject positions
        const subjectPositions = {};
        for (const subject of subjectsRes.rows) {
            const allScores = [];
            for (const sid of classStudentIds) {
                const mark = await pool.query(
                    'SELECT total FROM sba_marks WHERE student_id = $1 AND subject_id = $2 AND term = $3 AND academic_year = $4',
                    [sid, subject.id, term, academic_year]
                );
                const score = mark.rows[0] ? parseFloat(mark.rows[0].total) || 0 : 0;
                allScores.push({ studentId: sid, score });
            }
            allScores.sort((a, b) => b.score - a.score);
            const position = allScores.findIndex(p => p.studentId === student.id) + 1;
            subjectPositions[subject.id] = position;
        }
        
        // Overall position
        const allAverages = [];
        for (const sid of classStudentIds) {
            let totalScore = 0;
            let subjectCount = 0;
            for (const subject of subjectsRes.rows) {
                const mark = await pool.query(
                    'SELECT total FROM sba_marks WHERE student_id = $1 AND subject_id = $2 AND term = $3 AND academic_year = $4',
                    [sid, subject.id, term, academic_year]
                );
                if (mark.rows[0] && mark.rows[0].total) {
                    totalScore += parseFloat(mark.rows[0].total);
                    subjectCount++;
                }
            }
            const average = subjectCount > 0 ? totalScore / subjectCount : 0;
            allAverages.push({ studentId: sid, average });
        }
        allAverages.sort((a, b) => b.average - a.average);
        const overallPosition = allAverages.findIndex(p => p.studentId === student.id) + 1;
        
        res.json({
            success: true,
            student,
            subjects: subjectsRes.rows,
            sbaMarks: sbaResult.rows,
            reportData: studentReportData,
            settings: settings,
            personalDevTraits: personalDevTraits,
            subjectPositions: subjectPositions,
            overallPosition: overallPosition,
            totalStudents: classStudentIds.length
        });
        
    } catch (error) {
        console.error('Error fetching full report:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== SERVE FRONTEND ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.get('/:page.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', `${req.params.page}.html`));
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
║     🔐 Login Credentials:                                ║║     Admin: admin / admin123                              ║
║     Teacher: teacher@livingspring.edu.gh / teacher123    ║
║     Parent: parent@livingspring.edu.gh / parent123       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});