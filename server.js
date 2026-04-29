require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");
const fs = require("fs"); // Missing: Needed to read/write files

const app = express();
const PORT = process.env.PORT || 8081;
const USERS_FILE = path.join(__dirname, "data", "users.json"); // Path to your user database

// Make sure this is at the top of server.js
const Groq = require("groq-sdk");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(express.json());
app.use(
    session({
        secret: process.env.SESSION_SECRET || "dev-secret-change-me",
        resave: false,
        saveUninitialized: false,
    }),
);

app.use(express.static(path.join(__dirname, "public")));

// --- HELPER FUNCTIONS ---
// Reads the users.json file and returns an array
const getUsers = () => {
    try {
        const data = fs.readFileSync(USERS_FILE, "utf8");
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
app.post("/api/register", (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();

    if (users.find((u) => u.username === username)) {
        return res.status(400).json({ error: "Username already exists" });
    }

    // Passwords stored in plaintext for learning purposes
    users.push({ username, password });
    saveUsers(users);
    res.json({ message: "User registered successfully" });
});

// 2. Login
app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    const user = getUsers().find(
        (u) => u.username === username && u.password === password,
    );

    if (user) {
        req.session.username = username; // Store user in session
        res.json({ username });
    } else {
        res.status(401).json({ error: "Invalid username or password" });
    }
});

// 3. Check Session (Needed for main.js checkSession function)
app.get("/api/me", (req, res) => {
    if (req.session.username) {
        res.json({ username: req.session.username });
    } else {
        res.status(401).json({ error: "Not logged in" });
    }
});

// 4. Logout
app.post("/api/logout", (req, res) => {
    req.session.destroy();
    res.json({ message: "Logged out" });
});

app.post("/api/ai-move", async (req, res) => {
    // 1. Log that the request was received
    console.log("--- AI Move Requested ---");

    try {
        const { board } = req.body;

        // 2. Double-check that we have an API key before calling Groq
        if (!process.env.GROQ_API_KEY) {
            console.error("ERROR: GROQ_API_KEY is missing from environment!");
            return res.status(500).json({ error: "Server API Key missing" });
        }

        const emptySpots = board
            .map((val, index) => (val === "" ? index : null))
            .filter((val) => val !== null);

        // 3. Request completion from Groq
        // 3. Request completion from Groq with STRICTER instructions
        const completion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: `You are a Tic Tac Toe bot playing as 'O'. The board is 0-indexed (0-8). You MUST choose a number from the provided empty spots. Reply ONLY with valid JSON: {"move": number}` 
                },
                { 
                    role: "user", 
                    content: `Board array: ${JSON.stringify(board)}. Valid empty spots: ${emptySpots.join(', ')}. Pick ONE empty spot.` 
                }
            ],
            model: "llama-3.1-8b-instant",
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0].message.content;
        console.log("AI Response received:", content);

        const aiResponse = JSON.parse(content);
        let finalMove = aiResponse.move;

        // 4. THE SAFETY NET: If the AI picks a taken spot or a number > 8, override it
        if (!emptySpots.includes(finalMove)) {
            console.log(`AI chose invalid spot (${finalMove}). Forcing it to pick ${emptySpots[0]} instead.`);
            finalMove = emptySpots[0]; // Fallback to the first available empty space
        }

        res.json({ move: finalMove });
    } catch (error) {
        // This will now print the EXACT reason for the 500 error
        console.error("!!! AI ROUTE CRASHED !!!");
        console.error("Error Name:", error.name);
        console.error("Error Message:", error.message);

        res.status(500).json({
            error: "Internal Server Error",
            details: error.message,
        });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});

// --- GAME HISTORY HELPERS ---
const GAMES_FILE = path.join(__dirname, "data", "games.json");

const getGames = () => {
    try {
        if (!fs.existsSync(GAMES_FILE)) return [];
        const data = fs.readFileSync(GAMES_FILE, "utf8");
        return data ? JSON.parse(data) : [];
    } catch (err) {
        return [];
    }
};

const saveGames = (games) => {
    fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2));
};

// --- GAME HISTORY ROUTES ---

// Save a finished game
app.post("/api/games", (req, res) => {
    // Only logged-in users can save games
    if (!req.session.username)
        return res.status(401).json({ error: "Not logged in" });

    const { result, board } = req.body;
    const games = getGames();

    // Add the new game to the array
    games.push({
        username: req.session.username,
        result: result,
        board: board,
        date: new Date().toISOString(),
    });

    saveGames(games); // Write it to games.json
    res.json({ message: "Game saved successfully" });
});

// Get game history for the current user
app.get("/api/games", (req, res) => {
    if (!req.session.username)
        return res.status(401).json({ error: "Not logged in" });

    const allGames = getGames();
    // Filter so users only see their own games
    const userGames = allGames.filter(
        (g) => g.username === req.session.username,
    );

    res.json(userGames);
});
