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

app.post('/api/ai-move', async (req, res) => {
    console.log("--- AI Move Requested ---");

    try {
        // 1. Grab the personality from req.body
        const { board, difficulty, personality } = req.body;

        if (!process.env.GROQ_API_KEY) {
            return res.status(500).json({ error: "Server API Key missing" });
        }

        const emptySpots = board
            .map((val, index) => val === '' ? index : null)
            .filter(val => val !== null);

        const c = (i) => board[i] === '' ? i.toString() : board[i];
        const boardVisual = `
          ${c(0)} | ${c(1)} | ${c(2)}
         ---+---+---
          ${c(3)} | ${c(4)} | ${c(5)}
         ---+---+---
          ${c(6)} | ${c(7)} | ${c(8)}
        `;

        const winningConditions = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], 
            [0, 3, 6], [1, 4, 7], [2, 5, 8], 
            [0, 4, 8], [2, 4, 6]             
        ];

        const checkWin = (testBoard, player) => {
            return winningConditions.some(condition => {
                return condition.every(index => testBoard[index] === player);
            });
        };

        let winningMoveForO = "None";
        let winningMoveForX = "None";

        for (let spot of emptySpots) {
            let boardCopyO = [...board];
            boardCopyO[spot] = 'O';
            if (checkWin(boardCopyO, 'O')) winningMoveForO = spot;

            let boardCopyX = [...board];
            boardCopyX[spot] = 'X';
            if (checkWin(boardCopyX, 'X')) winningMoveForX = spot;
        }

        // 2. DIFFICULTY LOGIC (How it plays)
        let difficultyPrompt = "";
        let aiTemperature = 0.5;

        if (difficulty === "easy") {
            difficultyPrompt = "You are a terrible Tic Tac Toe player. Ignore the critical info. Pick a completely random number. Make bad choices.";
            aiTemperature = 1.0; 
        } else if (difficulty === "medium") {
            difficultyPrompt = "You are an average Tic Tac Toe player. Use the critical info sometimes, but occasionally ignore it to make silly mistakes.";
            aiTemperature = 0.7;
        } else {
            difficultyPrompt = "You are a flawless Tic Tac Toe grandmaster. You must strictly follow the critical info provided to win or block.";
            aiTemperature = 0.3; // Give it a tiny bit of temp so the chat messages vary, but logic stays sound
        }

        // 3. PERSONALITY LOGIC (How it talks)
        let tonePrompt = "";
        if (personality === "funny") {
            tonePrompt = "Your personality is 'Funny'. You are goofy, sarcastic, and a bit unhinged. Make a funny, random 1-sentence quip about the game state.";
        } else if (personality === "trash-talker") {
            tonePrompt = "Your personality is 'Trash-Talker'. You are arrogant, hyper-competitive, and insulting. Roast the player's skills with a spicy 1-sentence one-liner.";
        } else {
            tonePrompt = "Your personality is 'Friendly'. You are polite, encouraging, and sweet. Give a short, nice 1-sentence compliment or encouragement.";
        }

        // 4. Update the JSON format to include "message"
        const systemPrompt = `
${difficultyPrompt} 
${tonePrompt}

You MUST follow this exact 3-step thought process based on the Critical Info:
1. WIN: If the Critical Info says 'O' has a winning move, YOU MUST CHOOSE THAT NUMBER.
2. BLOCK: If the Critical Info says 'X' has a winning move, YOU MUST CHOOSE THAT NUMBER to block them.
3. STRATEGY: If there are no immediate wins or blocks, pick the best strategic empty spot.

Reply ONLY with valid JSON in this exact format: 
{
  "thinking": "Explain your step 1, 2, and 3 logic", 
  "move": number,
  "message": "Write your 1-sentence chat message to the human here based on your assigned personality."
}
        `;

        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Current Board:\n${boardVisual}\n\nCRITICAL INFO:\n- Winning move for 'O': ${winningMoveForO}\n- Winning move for 'X': ${winningMoveForX}\n\nValid empty spots: [${emptySpots.join(', ')}]\nChoose ONE valid empty spot.` }
            ],
            model: "llama-3.3-70b-versatile", 
            temperature: aiTemperature,
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0].message.content;
        const aiResponse = JSON.parse(content);

        console.log(`\n[Diff: ${difficulty} | Tone: ${personality}]`);
        console.log(`Critical Info -> O Win: ${winningMoveForO}, X Win: ${winningMoveForX}`);
        console.log(`AI Move: ${aiResponse.move}`);
        console.log(`AI Message: ${aiResponse.message}`);

        let finalMove = parseInt(aiResponse.move, 10);

        if (!emptySpots.includes(finalMove)) {
            const randomIndex = Math.floor(Math.random() * emptySpots.length);
            finalMove = emptySpots[randomIndex]; 
        }

        // 5. Send both the move AND the message back to main.js
        res.json({ move: finalMove, message: aiResponse.message || "Your move, human!" });

    } catch (error) {
        console.error("!!! AI ROUTE CRASHED !!!", error.message);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
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
