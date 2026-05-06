// Elements
const authContainer = document.getElementById("auth-container");
const gameContainer = document.getElementById("game-container");
const authMessage = document.getElementById("auth-message");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const displayUsername = document.getElementById("display-username");
const gameModeSelect = document.getElementById("game-mode");
const aiDifficultySelect = document.getElementById("ai-difficulty");
// 1. Add the new elements at the top of your file
const aiPersonalitySelect = document.getElementById("ai-personality");
const aiMessageBox = document.getElementById("ai-message-box");
let isAiThinking = false;

const scrambleBtn = document.getElementById("scramble-btn");
let p1ScrambleUsed = false;
let p2ScrambleUsed = false;

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

  localStorage.setItem("username", username); // <-- ADD THIS LINE

  loadGameHistory();
}

function updateMessage(text, color) {
  authMessage.innerText = text;
  authMessage.style.color = color;
}

// --- CP04 & CP09 Dynamic Game Logic ---

const boardContainer = document.getElementById("tic-tac-toe-board");
const turnIndicator = document.getElementById("turn-indicator");
const resetBtn = document.getElementById("reset-btn");

let currentPlayer = "X";
let gridSize = 3; // Defaults to 3x3
let boardState = [];
let gameActive = true;
let winningConditions = [];

// NEW: Function to calculate all rows, columns, and diagonals dynamically
// NEW: Advanced winning conditions generator
function generateWinningConditions(size, winLength) {
  let conditions = [];

  // Rows: Slide horizontally
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - winLength; c++) {
      let rowWin = [];
      for (let i = 0; i < winLength; i++) {
        rowWin.push(r * size + (c + i));
      }
      conditions.push(rowWin);
    }
  }

  // Columns: Slide vertically
  for (let c = 0; c < size; c++) {
    for (let r = 0; r <= size - winLength; r++) {
      let colWin = [];
      for (let i = 0; i < winLength; i++) {
        colWin.push((r + i) * size + c);
      }
      conditions.push(colWin);
    }
  }

  // Diagonals (Top-Left to Bottom-Right)
  for (let r = 0; r <= size - winLength; r++) {
    for (let c = 0; c <= size - winLength; c++) {
      let diag1Win = [];
      for (let i = 0; i < winLength; i++) {
        diag1Win.push((r + i) * size + (c + i));
      }
      conditions.push(diag1Win);
    }
  }

  // Diagonals (Top-Right to Bottom-Left)
  for (let r = 0; r <= size - winLength; r++) {
    for (let c = winLength - 1; c < size; c++) {
      let diag2Win = [];
      for (let i = 0; i < winLength; i++) {
        diag2Win.push((r + i) * size + (c - i));
      }
      conditions.push(diag2Win);
    }
  }

  return conditions;
}

function initBoard() {
  p1ScrambleUsed = false;
  p2ScrambleUsed = false;
  isAiThinking = false; // <-- Add this line for safety
  scrambleBtn.disabled = false;
  scrambleBtn.innerText = "Scramble Board (1 Use)";

  // Check if ultra-hard is selected
  gridSize = aiDifficultySelect.value === "ultra" ? 5 : 3;

  // NEW: If 5x5, require 4 to win. If 3x3, require 3.
  const requiredToWin = gridSize === 5 ? 4 : 3;

  // Reset state variables based on grid size
  boardState = Array(gridSize * gridSize).fill("");
  winningConditions = generateWinningConditions(gridSize, requiredToWin); // <-- UPDATE THIS LINE
  currentPlayer = "X";
  gameActive = true;
  turnIndicator.innerText = `Player X's Turn`;
  turnIndicator.style.color = "black";

  // Clear and redraw the HTML board
  // Clear and redraw the HTML board
  boardContainer.innerHTML = "";

  // UPDATED INLINE CSS: Keep the board tight and centered
  boardContainer.style.display = "inline-grid";
  boardContainer.style.gridTemplateColumns = `repeat(${gridSize}, auto)`;
  boardContainer.style.gap = "10px"; // Adjust this number if your grid lines look too thick/thin

  for (let i = 0; i < gridSize * gridSize; i++) {
    const cell = document.createElement("div");
    cell.classList.add("cell");
    cell.setAttribute("data-index", i);

    // Add click listener to the newly created cell
    cell.addEventListener("click", handleCellClick);
    boardContainer.appendChild(cell);
  }
}

function handleCellClick(e) {
  const index = e.target.getAttribute("data-index");

  if (!gameActive || isAiThinking) {
    console.log("Click ignored: AI is thinking or game is over");
    return;
  }

  if (boardState[index] !== "") return;
  if (gameModeSelect.value === "ai" && currentPlayer === "O") return;

  // Human makes a move
  boardState[index] = currentPlayer;
  e.target.classList.add(currentPlayer.toLowerCase());
  e.target.innerText = currentPlayer;

  checkResult();
}

function checkResult() {
  let winningPlayer = null; // Track WHO actually won

  for (let condition of winningConditions) {
    const firstCell = boardState[condition[0]];
    if (firstCell === "") continue;

    if (condition.every((index) => boardState[index] === firstCell)) {
      winningPlayer = firstCell;
      break;
    }
  }

  if (winningPlayer) {
    turnIndicator.innerText = `Player ${winningPlayer} Wins!`;
    turnIndicator.style.color = "green";
    gameActive = false;
    saveGameResult(`Player ${winningPlayer} Wins`);
    // If human is X and won, it's a win. If human is X and O won, it's a loss.
    saveGameRecord(winningPlayer === "X" ? "win" : "loss");
    return;
  }

  let roundDraw = !boardState.includes("");
  if (roundDraw) {
    turnIndicator.innerText = "Game ended in a draw!";
    turnIndicator.style.color = "orange";
    gameActive = false;
    saveGameResult("Draw");
    saveGameRecord("draw");
    return;
  }

  // Switch turns
  currentPlayer = currentPlayer === "X" ? "O" : "X";
  turnIndicator.innerText = `Player ${currentPlayer}'s Turn`;

  // Update Scramble button UI for the next player
  if (currentPlayer === "X") {
    scrambleBtn.disabled = p1ScrambleUsed;
    scrambleBtn.innerText = p1ScrambleUsed
      ? "Scramble Used"
      : "Scramble Board (1 Use)";
  } else if (gameModeSelect.value === "human") {
    scrambleBtn.disabled = p2ScrambleUsed;
    scrambleBtn.innerText = p2ScrambleUsed
      ? "Scramble Used"
      : "Scramble Board (1 Use)";
  } else {
    scrambleBtn.disabled = true; // Disable human clicking it during AI turn
  }

  if (gameActive && gameModeSelect.value === "ai" && currentPlayer === "O") {
    makeAiMove();
  }
}

resetBtn.addEventListener("click", initBoard);
aiDifficultySelect.addEventListener("change", initBoard);

// Call initBoard right away to draw the initial 3x3 board
initBoard();

// --- NEW: Board Scrambler Logic ---
scrambleBtn.addEventListener("click", () => {
  if (!gameActive || isAiThinking) return;

  // Check if current player already used it
  if (currentPlayer === "X" && p1ScrambleUsed) return;
  if (currentPlayer === "O" && p2ScrambleUsed) return;

  // Mark as used for the current player
  if (currentPlayer === "X") p1ScrambleUsed = true;
  if (currentPlayer === "O") p2ScrambleUsed = true;

  executeScramble();
});

function executeScramble() {
  // 1. Shuffle the boardState array (Fisher-Yates Shuffle)
  for (let i = boardState.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [boardState[i], boardState[j]] = [boardState[j], boardState[i]];
  }

  // 2. Re-render the HTML board to match the new state
  const cells = document.querySelectorAll(".cell");
  cells.forEach((cell, i) => {
    cell.innerText = boardState[i];
    cell.className = "cell"; // Clear old classes
    if (boardState[i] !== "") {
      cell.classList.add(boardState[i].toLowerCase());
    }
  });

  // 3. Update button UI
  scrambleBtn.disabled = true;
  scrambleBtn.innerText = "Scramble Used";

  // 4. Check for accidental wins and pass the turn
  checkResult();
}

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

async function saveGameRecord(gameResult) {
  try {
    // Grab the current settings from the UI
    const difficulty =
      document.getElementById("ai-difficulty")?.value || "medium";
    const personality =
      document.getElementById("ai-personality")?.value || "friendly";

    // Grab the username (you might need to adjust this depending on how you store the logged-in user)
    // For example, if it's stored in a variable or local storage:
    const playerName = localStorage.getItem("username") || "Player1";

    await fetch("/api/save-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player: playerName,
        result: gameResult,
        difficulty: difficulty,
        personality: personality,
      }),
    });

    console.log("Game saved successfully!");
  } catch (err) {
    console.error("Failed to save game record:", err);
  }
}

async function makeAiMove() {
  isAiThinking = true;
  turnIndicator.innerText = "AI is thinking...";
  aiMessageBox.innerText = "AI is typing..."; // Show typing indicator

  try {
    // Inside makeAiMove()...
    const res = await fetch("/api/ai-move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        board: boardState,
        difficulty: aiDifficultySelect.value,
        personality: aiPersonalitySelect.value,
        aiCanScramble: !p2ScrambleUsed, // <-- TELL THE SERVER IF AI CAN SCRAMBLE
      }),
    });

    if (!res.ok) throw new Error(`Server responded with ${res.status}`);
    const data = await res.json();

    if (data.message) {
      aiMessageBox.innerText = `AI says: "${data.message}"`;
    }

    // <-- NEW: Handle if the AI decides to scramble
    if (data.action === "scramble") {
      p2ScrambleUsed = true;
      executeScramble();
      isAiThinking = false;
      return; // executeScramble handles the turn passing
    }

    // Update the board normally if not scrambling
    if (data.move === undefined) throw new Error("AI returned invalid data");
    // ... rest of makeAiMove stays the same

    // Update the board
    const cell = document.querySelector(`.cell[data-index="${data.move}"]`);
    boardState[data.move] = "O";
    cell.classList.add("o"); // Add 'o' class
    cell.innerText = "O"; // <-- ADD THIS LINE to make the move visible

    // <-- WE ADDED THIS: Display the AI's custom message
    if (data.message) {
      aiMessageBox.innerText = `AI says: "${data.message}"`;
    }

    isAiThinking = false;
    checkResult();
  } catch (err) {
    console.error("AI Move failed:", err);
    turnIndicator.innerText = "AI failed to move. Your turn!";
    turnIndicator.style.color = "red";
    isAiThinking = false;
    currentPlayer = "X";
  }
}
// Reset the game if the user changes the mode
gameModeSelect.addEventListener("change", () => {
  resetBtn.click();
});
// Initialize
checkSession();
