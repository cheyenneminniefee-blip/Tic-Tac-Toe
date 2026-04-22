require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
  })
);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
