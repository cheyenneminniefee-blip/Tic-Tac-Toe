require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");
const fs = require("fs");

// --- NEW SAFETY CHECK: Ensure 'data' folder exists so the server doesn't crash ---
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const statsFilePath = path.join(dataDir, "stats.json");
const USERS_FILE = path.join(dataDir, "users.json");
const GAMES_FILE = path.join(dataDir, "games.json");

const app = express();
const PORT = process.env.PORT || 8081;

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
const getUsers = () => {
    try {
        if (!fs.existsSync(USERS_FILE)) return [];
        const data = fs.readFileSync(USERS_FILE, "utf8");
        return data ? JSON.parse(data) : [];
    } catch (err) {
        return [];
    }
};

const saveUsers = (users) => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

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

// --- AUTH ROUTES ---
app.post("/api/register", (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();

    if (users.find((u) => u.username === username)) {
        return res.status(400).json({ error: "Username already exists" });
    }

    users.push({ username, password });
    saveUsers(users);
    res.json({ message: "User registered successfully" });
});

app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    const user = getUsers().find(
        (u) => u.username === username && u.password === password,
    );

    if (user) {
        req.session.username = username;
        res.json({ username });
    } else {
        res.status(401).json({ error: "Invalid username or password" });
    }
});

app.get("/api/me", (req, res) => {
    if (req.session.username) {
        res.json({ username: req.session.username });
    } else {
        res.status(401).json({ error: "Not logged in" });
    }
});

app.post("/api/logout", (req, res) => {
    req.session.destroy();
    res.json({ message: "Logged out" });
});

// --- AI ROUTE ---
app.post("/api/ai-move", async (req, res) => {
    console.log("--- AI Move Requested ---");

    try {
        const { board, difficulty, personality } = req.body;

        if (!process.env.GROQ_API_KEY) {
            return res.status(500).json({ error: "Server API Key missing" });
        }

        // Safety check: Prevent crash if frontend sends invalid board data
        if (!board || !Array.isArray(board)) {
            return res
                .status(400)
                .json({ error: "Invalid board data received." });
        }

        const gridSize = Math.sqrt(board.length);
        const emptySpots = board
            .map((val, index) => (val === "" ? index : null))
            .filter((val) => val !== null);

        const getCellStr = (i) => {
            if (board[i] !== "") return ` ${board[i]} `;
            return i < 10 ? ` ${i} ` : `${i} `;
        };

        let boardVisual = "";
        for (let r = 0; r < gridSize; r++) {
            let row = [];
            for (let c = 0; c < gridSize; c++) {
                row.push(getCellStr(r * gridSize + c));
            }
            boardVisual += row.join("|") + "\n";
            if (r < gridSize - 1) {
                boardVisual += "-".repeat(gridSize * 4 - 1) + "\n";
            }
        }

        // Inside app.post("/api/ai-move", ...)
        // REPLACE the old getWinningConditions with this:

        const getWinningConditions = (size, winLength) => {
            let conditions = [];

            // Rows
            for (let r = 0; r < size; r++) {
                for (let c = 0; c <= size - winLength; c++) {
                    let rowWin = [];
                    for (let i = 0; i < winLength; i++)
                        rowWin.push(r * size + (c + i));
                    conditions.push(rowWin);
                }
            }
            // Columns
            for (let c = 0; c < size; c++) {
                for (let r = 0; r <= size - winLength; r++) {
                    let colWin = [];
                    for (let i = 0; i < winLength; i++)
                        colWin.push((r + i) * size + c);
                    conditions.push(colWin);
                }
            }
            // Diagonals (Top-Left to Bottom-Right)
            for (let r = 0; r <= size - winLength; r++) {
                for (let c = 0; c <= size - winLength; c++) {
                    let diag1Win = [];
                    for (let i = 0; i < winLength; i++)
                        diag1Win.push((r + i) * size + (c + i));
                    conditions.push(diag1Win);
                }
            }
            // Diagonals (Top-Right to Bottom-Left)
            for (let r = 0; r <= size - winLength; r++) {
                for (let c = winLength - 1; c < size; c++) {
                    let diag2Win = [];
                    for (let i = 0; i < winLength; i++)
                        diag2Win.push((r + i) * size + (c - i));
                    conditions.push(diag2Win);
                }
            }
            return conditions;
        };

        const requiredToWin = gridSize === 5 ? 4 : 3;
        const winningConditions = getWinningConditions(gridSize, requiredToWin);

        const checkWin = (testBoard, player) => {
            return winningConditions.some((condition) => {
                return condition.every((index) => testBoard[index] === player);
            });
        };

        let winningMoveForO = "None";
        let winningMovesForX = []; // Track ALL winning moves for X to detect forks

        for (let spot of emptySpots) {
            let boardCopyO = [...board];
            boardCopyO[spot] = "O";
            if (checkWin(boardCopyO, "O")) winningMoveForO = spot;

            let boardCopyX = [...board];
            boardCopyX[spot] = "X";
            if (checkWin(boardCopyX, "X")) winningMovesForX.push(spot);
        }

        const aiCanScramble = req.body.aiCanScramble;

        let difficultyPrompt = "";
        let aiTemperature = 0.5;

        if (difficulty === "easy") {
            difficultyPrompt =
                "You are a terrible Tic Tac Toe player. Ignore the critical info. Pick a completely random number. Make bad choices.";
            aiTemperature = 1.0;
        } else if (difficulty === "medium") {
            difficultyPrompt =
                "You are an average Tic Tac Toe player. Use the critical info sometimes, but occasionally ignore it to make silly mistakes.";
            aiTemperature = 0.7;
        } else {
            difficultyPrompt =
                "You are a flawless Tic Tac Toe grandmaster. You must strictly follow the critical info provided to win or block.";
            aiTemperature = 0.3;
        }

        let tonePrompt = "";
        if (personality === "funny") {
            tonePrompt =
                "Your personality is 'Funny'. You are goofy, sarcastic, and a bit unhinged. Make a funny, random 1-sentence quip about the game state.";
        } else if (personality === "trash-talker") {
            tonePrompt =
                "Your personality is 'Trash-Talker'. You are arrogant, hyper-competitive, and insulting. Roast the player's skills with a spicy 1-sentence one-liner.";
        } else {
            tonePrompt =
                "Your personality is 'Friendly'. You are polite, encouraging, and sweet. Give a short, nice 1-sentence compliment or encouragement.";
        }

        const systemPrompt = `
        You are playing Tic Tac Toe on a ${gridSize}x${gridSize} board.
        To win, a player needs ${requiredToWin} marks in a row (horizontally, vertically, or diagonally).

        ${difficultyPrompt} 
        ${tonePrompt}

        You have a special "scramble" ability that randomly redistributes all pieces. You can only use it ONCE per game.
        Can you scramble right now? ${aiCanScramble ? "YES" : "NO"}

        You MUST follow this exact thought process based on the Critical Info:
        1. WIN: If 'O' has a winning move, YOU MUST CHOOSE THAT NUMBER.
        2. ESCAPE FORK: If 'X' has MULTIPLE winning moves (a fork), you cannot block them all. If you can scramble (YES), you MUST return "scramble" as your action to save yourself.
        3. BLOCK: If 'X' has exactly ONE winning move, YOU MUST CHOOSE THAT NUMBER to block them.
        4. STRATEGY: If none of the above apply, pick the best strategic empty spot.

        Reply ONLY with valid JSON in this exact format: 
        {
          "thinking": "Explain your logic", 
          "action": "move" or "scramble",
          "move": number (or null if action is scramble),
          "message": "Write your 1-sentence chat message to the human here based on your assigned personality."
        }
                `;

        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content: `Current Board:\n${boardVisual}\n\nCRITICAL INFO:\n- Winning move for 'O': ${winningMoveForO}\n- Winning move for 'X': ${winningMovesForX}\n\nValid empty spots: [${emptySpots.join(", ")}]\nChoose ONE valid empty spot.`,
                },
            ],
            model: "llama-3.3-70b-versatile",
            temperature: aiTemperature,
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0].message.content;
        const aiResponse = JSON.parse(content);

        // NEW: Check if AI decided to scramble
        if (aiResponse.action === "scramble" && aiCanScramble) {
            console.log(`AI used SCRAMBLE! Message: ${aiResponse.message}`);
            return res.json({
                action: "scramble",
                message: aiResponse.message || "PANIC! SCRAMBLING THE BOARD!",
            });
        }

        let finalMove = parseInt(aiResponse.move, 10);

        // ... fallback logic and final res.json() stay the same
        if (!emptySpots.includes(finalMove)) {
            const randomIndex = Math.floor(Math.random() * emptySpots.length);
            finalMove = emptySpots[randomIndex];
        }

        res.json({
            action: "move",
            move: finalMove,
            message: aiResponse.message || "Your move, human!",
        });
    } catch (error) {
        console.error("!!! AI ROUTE CRASHED !!!", error.message);
        res.status(500).json({
            error: "Internal Server Error",
            details: error.message,
        });
    }
});

// --- GAME HISTORY & STATS ROUTES ---
app.post("/api/games", (req, res) => {
    if (!req.session.username)
        return res.status(401).json({ error: "Not logged in" });

    const { result, board } = req.body;
    const games = getGames();

    games.push({
        username: req.session.username,
        result: result,
        board: board,
        date: new Date().toISOString(),
    });

    saveGames(games);
    res.json({ message: "Game saved successfully" });
});

app.get("/api/games", (req, res) => {
    if (!req.session.username)
        return res.status(401).json({ error: "Not logged in" });

    const allGames = getGames();
    const userGames = allGames.filter(
        (g) => g.username === req.session.username,
    );

    res.json(userGames);
});

app.get("/api/stats", (req, res) => {
    try {
        if (!fs.existsSync(statsFilePath)) {
            return res.json({
                leaderboard: [],
                aiStats: { byDifficulty: {}, byPersonality: {} },
            });
        }

        const statsData = fs.readFileSync(statsFilePath, "utf8");
        const games = statsData ? JSON.parse(statsData) : [];

        const playerStats = {};

        games.forEach((game) => {
            const player = game.player || "Unknown";
            if (!playerStats[player]) {
                playerStats[player] = { wins: 0, totalGames: 0 };
            }

            playerStats[player].totalGames++;
            if (game.result === "win") {
                playerStats[player].wins++;
            }
        });

        const leaderboard = Object.keys(playerStats)
            .map((player) => ({
                name: player,
                wins: playerStats[player].wins,
                totalGames: playerStats[player].totalGames,
            }))
            .sort((a, b) => b.wins - a.wins);
        // Inside app.get("/api/stats", ...)
        const aiStats = {
            byDifficulty: {
                easy: { wins: 0, total: 0 },
                medium: { wins: 0, total: 0 },
                hard: { wins: 0, total: 0 },
                ultra: { wins: 0, total: 0 }, // <-- ADD THIS LINE
            },
            byPersonality: {
                friendly: { wins: 0, total: 0 },
                funny: { wins: 0, total: 0 },
                "trash-talker": { wins: 0, total: 0 },
            },
        };

        games.forEach((game) => {
            const diff = game.difficulty;
            const pers = game.personality;
            const aiWon = game.result === "loss";

            if (diff && aiStats.byDifficulty[diff]) {
                aiStats.byDifficulty[diff].total++;
                if (aiWon) aiStats.byDifficulty[diff].wins++;
            }

            if (pers && aiStats.byPersonality[pers]) {
                aiStats.byPersonality[pers].total++;
                if (aiWon) aiStats.byPersonality[pers].wins++;
            }
        });

        const calcWinRate = (statsObj) => {
            for (const key in statsObj) {
                const data = statsObj[key];
                data.winRate =
                    data.total > 0
                        ? ((data.wins / data.total) * 100).toFixed(1) + "%"
                        : "0%";
            }
        };

        calcWinRate(aiStats.byDifficulty);
        calcWinRate(aiStats.byPersonality);

        res.json({
            leaderboard: leaderboard.slice(0, 10),
            aiStats: aiStats,
        });
    } catch (error) {
        console.error("Failed to fetch stats:", error);
        res.status(500).json({ error: "Could not load stats" });
    }
});

app.post("/api/save-game", (req, res) => {
    try {
        const { player, result, difficulty, personality } = req.body;

        if (!fs.existsSync(statsFilePath)) {
            fs.writeFileSync(statsFilePath, "[]");
        }

        const statsData = fs.readFileSync(statsFilePath, "utf8");
        const games = statsData ? JSON.parse(statsData) : [];

        games.push({
            player: player || "Guest",
            result: result,
            difficulty: difficulty || "medium",
            personality: personality || "friendly",
            timestamp: new Date().toISOString(),
        });

        fs.writeFileSync(statsFilePath, JSON.stringify(games, null, 2));

        res.json({ success: true });
    } catch (error) {
        console.error("Error saving global stats:", error);
        res.status(500).json({ error: "Failed to save game stats" });
    }
});
// --- NEW: Global Game History Route ---
app.get("/api/all-games", (req, res) => {
    // We don't check for req.session.username here because 
    // we want this list to be public for the global stats page.
    const allGames = getGames(); 
    res.json(allGames);
});

// --- SERVER LISTENER (Always goes at the very end!) ---
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
