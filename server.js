require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const fs = require('fs'); // Missing: Needed to read/write files

const app = express();
const PORT = process.env.PORT || 8081;
const USERS_FILE = path.join(__dirname, 'data', 'users.json'); // Path to your user database

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
  })
);

app.use(express.static(path.join(__dirname, 'public')));

// --- HELPER FUNCTIONS ---
// Reads the users.json file and returns an array
const getUsers = () => {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return []; // Return empty array if file doesn't exist yet
    }
};

// Saves the array back to users.json
const saveUsers = (users) => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

// --- AUTH ROUTES ---

// 1. Register
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();

    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already exists' });
    }

    // Passwords stored in plaintext for learning purposes
    users.push({ username, password });
    saveUsers(users);
    res.json({ message: 'User registered successfully' });
});

// 2. Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = getUsers().find(u => u.username === username && u.password === password);

    if (user) {
        req.session.username = username; // Store user in session
        res.json({ username });
    } else {
        res.status(401).json({ error: 'Invalid username or password' });
    }
});

// 3. Check Session (Needed for main.js checkSession function)
app.get('/api/me', (req, res) => {
    if (req.session.username) {
        res.json({ username: req.session.username });
    } else {
        res.status(401).json({ error: 'Not logged in' });
    }
});

// 4. Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});