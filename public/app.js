const API_BASE = "/api";

let currentUser = null;
let currentRole = null;

document.addEventListener("DOMContentLoaded", () => {
  loadPlayersForLogin();
  checkAuth();
  setupEventListeners();
});

async function checkAuth() {
  try {
    const response = await fetch(`${API_BASE}/game/status`, {
      credentials: "include",
    });

    if (response.ok) {
      const data = await response.json();
      if (data.gameStarted !== undefined) {
        await loadUserData();
      } else {
        showScreen("loginScreen");
      }
    } else {
      showScreen("loginScreen");
    }
  } catch (error) {
    console.error("Auth check failed:", error);
    showScreen("loginScreen");
  }
}

async function loadUserData() {
  try {
    const response = await fetch(`${API_BASE}/game/status`, {
      credentials: "include",
    });

    if (response.ok) {
      const data = await response.json();

      const adminCheck = await fetch(`${API_BASE}/admin/players`, {
        credentials: "include",
      });

      if (adminCheck.ok) {
        currentRole = "admin";
        showAdminScreen();
      } else {
        currentRole = "user";
        showGameScreen();
      }
    }
  } catch (error) {
    console.error("Load user data failed:", error);
    showScreen("loginScreen");
  }
}

function setupEventListeners() {
  document
    .getElementById("createAdminBtn")
    .addEventListener("click", handleCreateAdmin);
  document
    .getElementById("adminPasswordInput")
    .addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleCreateAdmin();
    });

  document.getElementById("loginBtn").addEventListener("click", handleLogin);
  document.getElementById("passwordInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleLogin();
  });

  document.getElementById("spinBtn").addEventListener("click", handleSpin);
  document
    .getElementById("goToAdminBtn")
    .addEventListener("click", () => showAdminScreen());
  document.getElementById("logoutBtn").addEventListener("click", handleLogout);

  document
    .getElementById("addPlayerBtn")
    .addEventListener("click", handleAddPlayer);
  document
    .getElementById("startGameBtn")
    .addEventListener("click", handleStartGame);
  document
    .getElementById("resetGameBtn")
    .addEventListener("click", handleResetGame);
  document
    .getElementById("resetPasswordBtn")
    .addEventListener("click", handleResetPassword);
  document
    .getElementById("goToGameBtn")
    .addEventListener("click", () => showGameScreen());
  document
    .getElementById("adminLogoutBtn")
    .addEventListener("click", handleLogout);
  document
    .getElementById("adminParticipates")
    .addEventListener("change", updateDoubleSpinnerSection);
}

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("active");
  });
  document.getElementById(screenId).classList.add("active");
}

async function loadPlayersForLogin() {
  try {
    const response = await fetch(`${API_BASE}/players`);

    if (response.ok) {
      const data = await response.json();

      if (data.players.length === 0) {
        document.getElementById("bootstrapForm").classList.remove("hidden");
        document.getElementById("regularLoginForm").classList.add("hidden");
        return;
      }

      document.getElementById("bootstrapForm").classList.add("hidden");
      document.getElementById("regularLoginForm").classList.remove("hidden");

      const select = document.getElementById("playerSelect");
      select.innerHTML = '<option value="">-- Select --</option>';
      data.players.forEach((player) => {
        const option = document.createElement("option");
        option.value = player.name;
        option.textContent = player.name;
        select.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Failed to load players:", error);
  }
}

async function handleCreateAdmin() {
  const name = document.getElementById("adminNameInput").value.trim();
  const password = document.getElementById("adminPasswordInput").value;
  const errorDiv = document.getElementById("bootstrapError");

  errorDiv.textContent = "";

  if (!name || !password) {
    errorDiv.textContent = "Please enter name and password";
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });

    let data;
    try {
      data = await response.json();
    } catch (e) {
      errorDiv.textContent = `Server error: ${response.status} ${response.statusText}`;
      console.error("Failed to parse response:", e);
      return;
    }

    if (response.ok) {
      const loginResponse = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, password }),
      });

      let loginData;
      try {
        loginData = await loginResponse.json();
      } catch (e) {
        errorDiv.textContent =
          "Admin created but login failed. Please try logging in manually.";
        console.error("Failed to parse login response:", e);
        return;
      }

      if (loginResponse.ok && loginData.success) {
        currentUser = name;
        currentRole = "admin";
        showAdminScreen();
      } else {
        errorDiv.textContent =
          loginData.error ||
          "Admin created but login failed. Please try logging in.";
      }
    } else {
      errorDiv.textContent =
        data.error || `Failed to create admin (${response.status})`;
      console.error("Bootstrap failed:", data);
    }
  } catch (error) {
    errorDiv.textContent = `Failed to create admin: ${error.message}`;
    console.error("Bootstrap error:", error);
  }
}

async function handleLogin() {
  const name = document.getElementById("playerSelect").value;
  const password = document.getElementById("passwordInput").value;
  const errorDiv = document.getElementById("loginError");

  errorDiv.textContent = "";

  if (!name || !password) {
    errorDiv.textContent = "Please select a name and enter password";
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, password }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      currentUser = name;
      currentRole = data.role;

      if (data.role === "admin") {
        showAdminScreen();
      } else {
        showGameScreen();
      }
    } else {
      errorDiv.textContent = data.error || "Login failed";
    }
  } catch (error) {
    errorDiv.textContent = "Login failed. Please try again.";
  }
}

async function showGameScreen() {
  showScreen("gameScreen");

  const adminNavSection = document.getElementById("adminNavSection");
  if (currentRole === "admin") {
    adminNavSection.classList.remove("hidden");
  } else {
    adminNavSection.classList.add("hidden");
  }

  await updateGameStatus();

  if (window.gameStatusInterval) {
    clearInterval(window.gameStatusInterval);
  }
  window.gameStatusInterval = setInterval(updateGameStatus, 2000);
}

async function updateGameStatus() {
  try {
    const response = await fetch(`${API_BASE}/game/status`, {
      credentials: "include",
    });

    if (!response.ok) {
      if (response.status === 401) {
        showScreen("loginScreen");
        return;
      }
      throw new Error("Failed to get status");
    }

    const data = await response.json();

    const statusMessage = document.getElementById("statusMessage");
    const spinBtn = document.getElementById("spinBtn");
    const resultSection = document.getElementById("resultSection");
    const assignmentName = document.getElementById("assignmentName");

    statusMessage.textContent = data.message || "";
    spinBtn.disabled = !data.canSpin;

    if (data.assignment) {
      resultSection.classList.remove("hidden");
      assignmentName.textContent = data.assignment;
    } else {
      resultSection.classList.add("hidden");
    }
  } catch (error) {
    console.error("Update game status failed:", error);
  }
}

async function handleSpin() {
  const spinBtn = document.getElementById("spinBtn");
  spinBtn.disabled = true;
  spinBtn.textContent = "Spinning...";

  try {
    const response = await fetch(`${API_BASE}/spin`, {
      method: "POST",
      credentials: "include",
    });

    const data = await response.json();

    if (response.ok) {
      const resultSection = document.getElementById("resultSection");
      const assignmentName = document.getElementById("assignmentName");
      resultSection.classList.remove("hidden");
      assignmentName.textContent = data.assignedTo;

      await updateGameStatus();
    } else {
      alert(data.error || "Spin failed");
      await updateGameStatus();
    }
  } catch (error) {
    alert("Spin failed. Please try again.");
    await updateGameStatus();
  } finally {
    spinBtn.textContent = "Spin";
  }
}

async function showAdminScreen() {
  showScreen("adminScreen");
  await loadAdminData();

  if (window.adminUpdateInterval) {
    clearInterval(window.adminUpdateInterval);
  }
  window.adminUpdateInterval = setInterval(loadAdminData, 3000);
}

async function loadAdminData() {
  await Promise.all([loadPlayers(), loadGameControl(), loadAssignments()]);
}

async function loadPlayers() {
  try {
    const response = await fetch(`${API_BASE}/admin/players`, {
      credentials: "include",
    });

    if (!response.ok) throw new Error("Failed to load players");

    const data = await response.json();
    const playerList = document.getElementById("playerList");
    playerList.innerHTML = "";

    data.players.forEach((player) => {
      const item = document.createElement("div");
      item.className = "player-item";
      item.innerHTML = `
                <div>
                    <span class="player-name">${player.name}</span>
                    ${
                      player.role === "admin"
                        ? '<span class="player-role"> (Admin)</span>'
                        : ""
                    }
                </div>
                <button class="delete-btn" data-name="${player.name}" 
                    ${data.gameStarted ? "disabled" : ""}>
                    Delete
                </button>
            `;
      playerList.appendChild(item);
    });

    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const name = e.target.dataset.name;
        if (confirm(`Delete player ${name}?`)) {
          await handleDeletePlayer(name);
        }
      });
    });

    updateDoubleSpinnerSelect(data.players);
    updateResetPasswordSelect(data.players);
  } catch (error) {
    console.error("Load players failed:", error);
  }
}

function updateDoubleSpinnerSelect(players) {
  const select = document.getElementById("doubleSpinnerSelect");
  select.innerHTML = '<option value="">-- Select --</option>';
  players.forEach((player) => {
    const option = document.createElement("option");
    option.value = player.name;
    option.textContent = player.name;
    select.appendChild(option);
  });
}

function updateResetPasswordSelect(players) {
  const select = document.getElementById("resetPlayerSelect");
  select.innerHTML = '<option value="">-- Select player --</option>';
  players.forEach((player) => {
    const option = document.createElement("option");
    option.value = player.name;
    option.textContent = player.name;
    select.appendChild(option);
  });
}

function updateDoubleSpinnerSection() {
  loadGameControl();
}

async function loadGameControl() {
  try {
    const response = await fetch(`${API_BASE}/admin/players`, {
      credentials: "include",
    });

    if (!response.ok) throw new Error("Failed to load game control");

    const data = await response.json();
    const playerCount = data.players.length;
    const adminParticipates =
      document.getElementById("adminParticipates").checked;

    const effectiveCount = adminParticipates ? playerCount : playerCount - 1;
    const isOdd = effectiveCount % 2 === 1;

    const doubleSpinnerSection = document.getElementById(
      "doubleSpinnerSection"
    );
    const startGameBtn = document.getElementById("startGameBtn");
    const playGameSection = document.getElementById("playGameSection");

    if (data.gameStarted) {
      startGameBtn.disabled = true;
      startGameBtn.textContent = "Game Started";
      doubleSpinnerSection.classList.add("hidden");
      if (playGameSection) {
        playGameSection.style.display = "block";
      }
    } else {
      startGameBtn.disabled = false;
      startGameBtn.textContent = "Start Game";
      if (playGameSection) {
        playGameSection.style.display = "none";
      }

      if (isOdd) {
        doubleSpinnerSection.classList.remove("hidden");
      } else {
        doubleSpinnerSection.classList.add("hidden");
      }
    }
  } catch (error) {
    console.error("Load game control failed:", error);
  }
}

async function handleAddPlayer() {
  const name = document.getElementById("newPlayerName").value.trim();
  const password = document.getElementById("newPlayerPassword").value;

  if (!name || !password) {
    alert("Please enter name and password");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/admin/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, password }),
    });

    const data = await response.json();

    if (response.ok) {
      document.getElementById("newPlayerName").value = "";
      document.getElementById("newPlayerPassword").value = "";
      await loadPlayers();
      await loadGameControl();
    } else {
      alert(data.error || "Failed to add player");
    }
  } catch (error) {
    alert("Failed to add player. Please try again.");
  }
}

async function handleDeletePlayer(name) {
  try {
    const response = await fetch(
      `${API_BASE}/admin/players/${encodeURIComponent(name)}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );

    const data = await response.json();

    if (response.ok) {
      await loadPlayers();
      await loadGameControl();
    } else {
      alert(data.error || "Failed to delete player");
    }
  } catch (error) {
    alert("Failed to delete player. Please try again.");
  }
}

async function handleStartGame() {
  const adminParticipates =
    document.getElementById("adminParticipates").checked;
  const doubleSpinnerName = document.getElementById(
    "doubleSpinnerSelect"
  ).value;

  try {
    const response = await fetch(`${API_BASE}/admin/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        adminParticipates,
        doubleSpinnerName: doubleSpinnerName || null,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      await loadGameControl();
      await loadAssignments();
    } else {
      alert(data.error || "Failed to start game");
    }
  } catch (error) {
    alert("Failed to start game. Please try again.");
  }
}

async function handleResetGame() {
  if (
    !confirm(
      "Are you sure you want to reset the game? This will clear all assignments."
    )
  ) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/admin/reset`, {
      method: "POST",
      credentials: "include",
    });

    const data = await response.json();

    if (response.ok) {
      await loadGameControl();
      await loadAssignments();
    } else {
      alert(data.error || "Failed to reset game");
    }
  } catch (error) {
    alert("Failed to reset game. Please try again.");
  }
}

async function handleResetPassword() {
  const name = document.getElementById("resetPlayerSelect").value;
  const newPassword = document.getElementById("newPassword").value;

  if (!name || !newPassword) {
    alert("Please select a player and enter new password");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/admin/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, newPassword }),
    });

    const data = await response.json();

    if (response.ok) {
      document.getElementById("resetPlayerSelect").value = "";
      document.getElementById("newPassword").value = "";
      alert("Password reset successfully. User will need to log in again.");
    } else {
      alert(data.error || "Failed to reset password");
    }
  } catch (error) {
    alert("Failed to reset password. Please try again.");
  }
}

async function loadAssignments() {
  try {
    const response = await fetch(`${API_BASE}/admin/assignments`, {
      credentials: "include",
    });

    if (!response.ok) throw new Error("Failed to load assignments");

    const data = await response.json();
    const assignmentsDiv = document.getElementById("allAssignments");

    if (!data.gameStarted) {
      assignmentsDiv.innerHTML = "<p>Game has not started yet.</p>";
      return;
    }

    if (Object.keys(data.assignments).length === 0) {
      assignmentsDiv.innerHTML = "<p>No assignments yet.</p>";
      return;
    }

    assignmentsDiv.innerHTML = "";
    Object.entries(data.assignments).forEach(([player, assignedTo]) => {
      const item = document.createElement("div");
      item.className = "assignment-item";
      item.innerHTML = `<strong>${player}</strong> → ${assignedTo}`;
      assignmentsDiv.appendChild(item);
    });

    if (data.doubleSpinner) {
      const info = document.createElement("p");
      info.style.marginTop = "10px";
      info.style.color = "#667eea";
      info.textContent = `Double-spinner: ${data.doubleSpinner}`;
      assignmentsDiv.appendChild(info);
    }
  } catch (error) {
    console.error("Load assignments failed:", error);
  }
}

async function handleLogout() {
  try {
    await fetch(`${API_BASE}/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch (error) {
    console.error("Logout failed:", error);
  }

  if (window.gameStatusInterval) {
    clearInterval(window.gameStatusInterval);
  }
  if (window.adminUpdateInterval) {
    clearInterval(window.adminUpdateInterval);
  }

  currentUser = null;
  currentRole = null;
  showScreen("loginScreen");

  document.getElementById("playerSelect").value = "";
  document.getElementById("passwordInput").value = "";
  document.getElementById("loginError").textContent = "";

  await loadPlayersForLogin();
}
