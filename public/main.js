// Elements
const authContainer = document.getElementById("auth-container");
const gameContainer = document.getElementById("game-container");
const authMessage = document.getElementById("auth-message");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const displayUsername = document.getElementById("display-username");
const gameModeSelect = document.getElementById("game-mode");
let isAiThinking = false;

// Buttons
document
  .getElementById("register-btn")
  .addEventListener("click", () => handleAuth("/api/register"));
document
  .getElementById("login-btn")
  .addEventListener("click", () => handleAuth("/api/login"));
document.getElementById("logout-btn").addEventListener("click", logout);

// Check if user is already logged in on page load
async function checkSession() {
  const res = await fetch("/api/me");
  if (res.ok) {
    const data = await res.json();
    showLoggedIn(data.username);
  }
}

async function handleAuth(url) {
  const username = usernameInput.value;
  const password = passwordInput.value;

  if (!username || !password) {
    return updateMessage("Please enter both username and password", "red");
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (res.ok) {
      if (url === "/api/login") {
        showLoggedIn(username);
      } else {
        updateMessage("Registration successful! Please log in.", "green");
      }
    } else {
      updateMessage(data.error || "Something went wrong", "red");
    }
  } catch (err) {
    updateMessage("Server connection failed", "red");
  }
}

async function logout() {
  await fetch("/api/logout", { method: "POST" });
  authContainer.style.display = "block";
  gameContainer.style.display = "none";
  usernameInput.value = "";
  passwordInput.value = "";
  updateMessage("Logged out successfully", "green");
}

function showLoggedIn(username) {
  authContainer.style.display = "none";
  gameContainer.style.display = "block";
  displayUsername.innerText = username;
  loadGameHistory(); // NEW: Fetch games when logged in
}

function updateMessage(text, color) {
  authMessage.innerText = text;
  authMessage.style.color = color;
}

// --- CP04 Human vs Human Game Logic ---

const cells = document.querySelectorAll(".cell");
const turnIndicator = document.getElementById("turn-indicator");
const resetBtn = document.getElementById("reset-btn");

let currentPlayer = "X";
let boardState = ["", "", "", "", "", "", "", "", ""];
let gameActive = true; // Prevents clicking after the game ends

// The 8 possible ways to win Tic Tac Toe
const winningConditions = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8], // Rows
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8], // Columns
  [0, 4, 8],
  [2, 4, 6], // Diagonals
];

function checkResult() {
  let roundWon = false;

  // Check each winning condition
  for (let i = 0; i < 8; i++) {
    const winCondition = winningConditions[i];
    let a = boardState[winCondition[0]];
    let b = boardState[winCondition[1]];
    let c = boardState[winCondition[2]];

    if (a === "" || b === "" || c === "") {
      continue; // Skip if any of the three cells are empty
    }
    if (a === b && b === c) {
      roundWon = true; // We have a match!
      break;
    }
  }

  if (roundWon) {
    turnIndicator.innerText = `Player ${currentPlayer} Wins!`;
    turnIndicator.style.color = "green";
    gameActive = false;
    saveGameResult(`Player ${currentPlayer} Wins`); // NEW
    return;
  }

  let roundDraw = !boardState.includes("");
  if (roundDraw) {
    turnIndicator.innerText = "Game ended in a draw!";
    turnIndicator.style.color = "orange";
    gameActive = false;
    saveGameResult("Draw"); // NEW
    return;
  }

  // If no win or draw, switch turns
  currentPlayer = currentPlayer === "X" ? "O" : "X";
  turnIndicator.innerText = `Player ${currentPlayer}'s Turn`;
  if (gameActive && gameModeSelect.value === "ai" && currentPlayer === "O") {
    makeAiMove();
  }
}

    cells.forEach((cell) => {
      cell.addEventListener("click", (e) => {
        const index = e.target.getAttribute("data-index");

        // ADD THIS: Explicitly log if a click was blocked
        if (!gameActive || isAiThinking) {
            console.log("Click ignored: AI is thinking or game is over");
            return;
        }

        if (boardState[index] !== "") return; 
        if (gameModeSelect.value === "ai" && currentPlayer === "O") return; 

        // ... rest of your code

    // 3. Human makes a move
    boardState[index] = currentPlayer;
    e.target.innerText = currentPlayer;

    // 4. Check if that move won the game
    checkResult();
  });
});

// Reset the board to play again
resetBtn.addEventListener("click", () => {
  currentPlayer = "X";
  gameActive = true;
  boardState = ["", "", "", "", "", "", "", "", ""];

  turnIndicator.innerText = `Player X's Turn`;
  turnIndicator.style.color = "black";

  cells.forEach((cell) => (cell.innerText = ""));
});

async function saveGameResult(resultMessage) {
  await fetch("/api/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      result: resultMessage,
      board: boardState,
    }),
  });
  loadGameHistory(); // Automatically refresh the UI after saving
}

async function loadGameHistory() {
  const res = await fetch("/api/games");
  if (res.ok) {
    const history = await res.json();
    const historyList = document.getElementById("history-list");
    historyList.innerHTML = ""; // Clear old list

    history.forEach((game) => {
      const li = document.createElement("li");
      li.style.padding = "5px 0";
      li.innerText = `${new Date(game.date).toLocaleString()} - ${game.result}`;
      historyList.appendChild(li);
    });
  }
}

async function makeAiMove() {
  isAiThinking = true;
  turnIndicator.innerText = "AI is thinking...";

  try {
    const res = await fetch('/api/ai-move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board: boardState })
    });

    if (!res.ok) {
      throw new Error(`Server responded with ${res.status}`);
    }

    const data = await res.json();

    // Safety check: make sure the AI actually gave us a number
    if (data.move === undefined) {
      throw new Error("AI returned invalid data");
    }

    const cell = document.querySelector(`.cell[data-index="${data.move}"]`);
    boardState[data.move] = 'O';
    cell.innerText = 'O';

    isAiThinking = false;
    checkResult();

  } catch (err) {
    console.error("AI Move failed:", err);
    turnIndicator.innerText = "AI failed to move. Your turn!";
    turnIndicator.style.color = "red";

    // Reset these so the human can keep playing PvP if the AI dies
    isAiThinking = false;
    currentPlayer = 'X'; 
  }
}
// Reset the game if the user changes the mode
gameModeSelect.addEventListener("change", () => {
  resetBtn.click();
});
// Initialize
checkSession();
