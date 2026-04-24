// Elements
const authContainer = document.getElementById("auth-container");
const gameContainer = document.getElementById("game-container");
const authMessage = document.getElementById("auth-message");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const displayUsername = document.getElementById("display-username");

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
}

function updateMessage(text, color) {
  authMessage.innerText = text;
  authMessage.style.color = color;
}

// --- CP03 Game Board Logic ---

const cells = document.querySelectorAll('.cell');
const turnIndicator = document.getElementById('turn-indicator');
const resetBtn = document.getElementById('reset-btn');

let currentPlayer = 'X';
let boardState = ['', '', '', '', '', '', '', '', '']; // Represents the 9 cells

// Add a click listener to every cell
cells.forEach(cell => {
    cell.addEventListener('click', (e) => {
        const index = e.target.getAttribute('data-index');

        // Only allow clicking if the cell is empty
        if (boardState[index] === '') {
            // 1. Update the state array
            boardState[index] = currentPlayer;

            // 2. Update the UI
            e.target.innerText = currentPlayer;

            // 3. Switch turns
            currentPlayer = currentPlayer === 'X' ? 'O' : 'X';

            // 4. Update the turn indicator
            turnIndicator.innerText = `Player ${currentPlayer}'s Turn`;
        }
    });
});

// Reset the board to play again
resetBtn.addEventListener('click', () => {
    currentPlayer = 'X';
    boardState = ['', '', '', '', '', '', '', '', ''];
    turnIndicator.innerText = `Player X's Turn`;
    cells.forEach(cell => cell.innerText = '');
});

// Initialize
checkSession();
