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
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ success: false, message: 'Invalid token' });
    }
};

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
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (error) {
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

// Create student - Allows manual Student ID
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
        
        if (class_level) {
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
        }
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Subjects error:', error);
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
        // Round to 2 decimal places to avoid PostgreSQL errors
        const roundedTest1 = Math.round((test1 || 0) * 100) / 100;
        const roundedGroupWork = Math.round((group_work || 0) * 100) / 100;
        const roundedMidTerm = Math.round((mid_term || 0) * 100) / 100;
        const roundedProject = Math.round((project || 0) * 100) / 100;
        const roundedExam = Math.round((exam || 0) * 100) / 100;
        const roundedSubTotal = Math.round((sub_total || 0) * 100) / 100;
        const roundedClassScore = Math.round((class_score || 0) * 100) / 100;
        const roundedExamScore = Math.round((exam_score || 0) * 100) / 100;
        const roundedTotal = Math.round((total || 0) * 100) / 100;
        
        const result = await pool.query(
            `INSERT INTO sba_marks (student_id, subject_id, term, academic_year, 
             test1, group_work, mid_term, project, exam, 
             sub_total, class_score, exam_score, total, grade, remarks)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
             RETURNING *`,
            [student_id, subject_id, term, academic_year, 
             roundedTest1, roundedGroupWork, roundedMidTerm, roundedProject, roundedExam,
             roundedSubTotal, roundedClassScore, roundedExamScore, roundedTotal, grade || '', remarks || '']
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
        // Round to 2 decimal places to avoid PostgreSQL errors
        const roundedTest1 = Math.round((test1 || 0) * 100) / 100;
        const roundedGroupWork = Math.round((group_work || 0) * 100) / 100;
        const roundedMidTerm = Math.round((mid_term || 0) * 100) / 100;
        const roundedProject = Math.round((project || 0) * 100) / 100;
        const roundedExam = Math.round((exam || 0) * 100) / 100;
        const roundedSubTotal = Math.round((sub_total || 0) * 100) / 100;
        const roundedClassScore = Math.round((class_score || 0) * 100) / 100;
        const roundedExamScore = Math.round((exam_score || 0) * 100) / 100;
        const roundedTotal = Math.round((total || 0) * 100) / 100;
        
        const result = await pool.query(
            `UPDATE sba_marks SET 
             test1 = $1, group_work = $2, mid_term = $3, project = $4, exam = $5,
             sub_total = $6, class_score = $7, exam_score = $8, total = $9, grade = $10, remarks = $11
             WHERE id = $12 RETURNING *`,
            [roundedTest1, roundedGroupWork, roundedMidTerm, roundedProject, roundedExam,
             roundedSubTotal, roundedClassScore, roundedExamScore, roundedTotal, grade || '', remarks || '', req.params.id]
        );
        res.json({ success: true, mark: result.rows[0] });
    } catch (error) {
        console.error('Error updating SBA record:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== DASHBOARD STATS ====================

// ==================== DASHBOARD STATS ====================

// Get dashboard stats - FIXED (no localStorage)
app.get('/api/stats', async (req, res) => {
    try {
        const studentResult = await pool.query('SELECT COUNT(*) FROM students');
        const studentCount = parseInt(studentResult.rows[0].count);
        
        // Get current term and academic year from database or use defaults
        const termResult = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'current_term'");
        const yearResult = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'academic_year'");
        
        const currentTerm = termResult.rows.length > 0 ? parseInt(termResult.rows[0].setting_value) : 1;
        const academicYear = yearResult.rows.length > 0 ? yearResult.rows[0].setting_value : '2025/2026';
        
        res.json({
            studentCount: studentCount,
            classLevels: 12,
            currentTerm: currentTerm,
            academicYear: academicYear
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ 
            studentCount: 0,
            classLevels: 12,
            currentTerm: 1,
            academicYear: '2025/2026'
        });
    }
});

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// ==================== TEACHER API ====================

// Teacher login
// Teacher login
// Teacher login - SIMPLE VERSION (plain text password for testing)
app.post('/api/teacher/login', async (req, res) => {
    const { email, password } = req.body;
    
    console.log('========================================');
    console.log('Teacher Login Attempt:');
    console.log('Email:', email);
    console.log('Password:', password);
    
    try {
        const result = await pool.query('SELECT * FROM teachers WHERE email = $1', [email]);
        const teacher = result.rows[0];
        
        if (!teacher) {
            console.log('❌ Teacher not found:', email);
            return res.status(401).json({ success: false, message: 'Invalid credentials - User not found' });
        }
        
        console.log('✅ Teacher found:', teacher.name);
        console.log('Stored password:', teacher.password);
        console.log('Provided password:', password);
        
        // Plain text comparison for testing
        if (teacher.password !== password) {
            console.log('❌ Password mismatch');
            return res.status(401).json({ success: false, message: 'Invalid credentials - Wrong password' });
        }
        
        console.log('✅ Password matched!');
        
        const token = jwt.sign(
            { id: teacher.id, email: teacher.email, name: teacher.name, assigned_class: teacher.assigned_class },
            process.env.JWT_SECRET || 'my_secret_key',
            { expiresIn: '24h' }
        );
        
        res.json({ 
            success: true, 
            token, 
            teacher: { 
                id: teacher.id, 
                name: teacher.name, 
                email: teacher.email, 
                assigned_class: teacher.assigned_class 
            } 
        });
        console.log('✅ Login successful!');
        console.log('========================================');
    } catch (error) {
        console.error('Teacher login error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});
// Teacher auth middleware
const authTeacher = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.teacher = decoded;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// Get teacher's students
app.get('/api/teacher/students', authTeacher, async (req, res) => {
    const { class_level } = req.query;
    try {
        const result = await pool.query('SELECT * FROM students WHERE class_level = $1 ORDER BY name', [class_level]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get teacher's subjects
app.get('/api/teacher/subjects', authTeacher, async (req, res) => {
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

// Get teacher's stats
app.get('/api/teacher/stats', authTeacher, async (req, res) => {
    try {
        const studentResult = await pool.query('SELECT COUNT(*) FROM students WHERE class_level = $1', [req.teacher.assigned_class]);
        const subjectResult = await pool.query('SELECT COUNT(*) FROM subjects WHERE class_level IN ($1, $2, $3)', ['P1-3', 'P4-6', 'JHS']);
        
        res.json({
            studentCount: parseInt(studentResult.rows[0].count),
            subjectsCount: parseInt(subjectResult.rows[0].count)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Debug - List all teachers (remove in production)
app.get('/api/debug/teachers', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, teacher_id, name, email, assigned_class FROM teachers');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete student
app.delete('/api/students/:id', async (req, res) => {
    try {
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
// At the very end of server.js
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
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
╚═══════════════════════════════════════════════════════════╝
    `);
});
