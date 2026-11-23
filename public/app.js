const API = "/api";
const SPIN_MS = 2500; // how long the "make sure it's you" screen shows before the result

let currentRole = null;
let gameTimer = null;
let adminTimer = null;
let countdownTimer = null;
let deadline = null;
let spinning = false;

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(API + path, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await response.json();
  } catch (e) {
    // non-JSON error body
  }
  return { ok: response.ok, status: response.status, data };
}

const EYE_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19C5 19 1 12 1 12a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.9 10.9 0 0 1 12 5c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';

// Adds a show/hide (eye) button to every password field.
function enhancePasswordFields() {
  document.querySelectorAll('input[type="password"]').forEach((input) => {
    const isAdmin = Boolean(input.closest("#adminScreen, #bootstrapForm"));
    const actionLabel = (showing) =>
      isAdmin
        ? showing ? "Show password" : "Hide password"
        : t(showing ? "showPassword" : "hidePassword");

    const wrap = document.createElement("div");
    wrap.className = "pw-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pw-toggle";
    const render = () => {
      const hidden = input.type === "password";
      btn.innerHTML = hidden ? EYE_ICON : EYE_OFF_ICON;
      btn.setAttribute("aria-label", actionLabel(hidden));
      btn.setAttribute("aria-pressed", String(!hidden));
    };
    btn.addEventListener("click", () => {
      input.type = input.type === "password" ? "text" : "password";
      render();
      input.focus();
    });
    wrap.appendChild(btn);
    render();
  });
}

// Put every revealed password field back to hidden (after login/logout).
function hidePasswords() {
  document.querySelectorAll('.pw-toggle[aria-pressed="true"]').forEach((b) => b.click());
}

document.addEventListener("DOMContentLoaded", () => {
  applyTranslations();
  enhancePasswordFields();
  setupEventListeners();
  loadPlayersForLogin();
  checkAuth();
});

function applyTranslations() {
  document.querySelectorAll("[data-t]").forEach((el) => {
    el.textContent = t(el.dataset.t);
  });
  document.querySelectorAll("[data-t-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.tPlaceholder);
  });
}

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(screenId).classList.add("active");
}

function stopTimers() {
  clearInterval(gameTimer);
  clearInterval(adminTimer);
  clearInterval(countdownTimer);
}

function setupEventListeners() {
  $("createAdminBtn").addEventListener("click", handleCreateAdmin);
  $("adminPasswordInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleCreateAdmin();
  });

  $("loginBtn").addEventListener("click", handleLogin);
  $("passwordInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleLogin();
  });

  $("spinBtn").addEventListener("click", handleSpin);
  $("goToAdminBtn").addEventListener("click", () => showAdminScreen());
  $("logoutBtn").addEventListener("click", handleLogout);

  $("addPlayerBtn").addEventListener("click", handleAddPlayer);
  $("startGameBtn").addEventListener("click", handleStartGame);
  $("resetGameBtn").addEventListener("click", handleResetGame);
  $("resetPasswordBtn").addEventListener("click", handleResetPassword);
  $("goToGameBtn").addEventListener("click", () => showGameScreen());
  $("adminLogoutBtn").addEventListener("click", handleLogout);
  $("adminParticipates").addEventListener("change", loadAdminData);
  $("deadlineInput").addEventListener("input", renderStartButton);
  $("toggleAssignmentsBtn").addEventListener("click", toggleAssignmentsView);
  $("redrawBtn").addEventListener("click", handleRedraw);
}

// ---------- auth ----------

async function checkAuth() {
  const { ok, data } = await api("/game/status").catch(() => ({ ok: false }));
  if (!ok) return showScreen("loginScreen");
  currentRole = data.role;
  if (currentRole === "admin") showAdminScreen();
  else showGameScreen();
}

async function loadPlayersForLogin() {
  try {
    const { ok, data } = await api("/players");
    if (!ok) return;

    if (data.players.length === 0) {
      $("setupCodeGroup").classList.toggle("hidden", !data.setupCodeRequired);
      $("bootstrapForm").classList.remove("hidden");
      $("regularLoginForm").classList.add("hidden");
      return;
    }

    $("bootstrapForm").classList.add("hidden");
    $("regularLoginForm").classList.remove("hidden");

    const select = $("playerSelect");
    select.innerHTML = "";
    select.appendChild(new Option(t("selectName"), ""));
    data.players.forEach((p) => select.appendChild(new Option(p.name, p.name)));
  } catch (error) {
    console.error("Failed to load players:", error);
  }
}

async function handleCreateAdmin() {
  const name = $("adminNameInput").value.trim();
  const password = $("adminPasswordInput").value;
  const setupCode = $("setupCodeInput").value;
  const errorDiv = $("bootstrapError");
  errorDiv.textContent = "";

  if (!name || !password) {
    errorDiv.textContent = "Please enter name and password";
    return;
  }

  try {
    const created = await api("/bootstrap", { method: "POST", body: { name, password, setupCode } });
    if (!created.ok) {
      errorDiv.textContent = created.data.error || `Failed to create admin (${created.status})`;
      return;
    }
    const login = await api("/login", { method: "POST", body: { name, password } });
    if (login.ok && login.data.success) {
      currentRole = "admin";
      showAdminScreen();
    } else {
      errorDiv.textContent = "Admin created but login failed. Please log in below.";
      await loadPlayersForLogin();
    }
  } catch (error) {
    errorDiv.textContent = `Failed to create admin: ${error.message}`;
  }
}

async function handleLogin() {
  const name = $("playerSelect").value;
  const password = $("passwordInput").value;
  const errorDiv = $("loginError");
  errorDiv.textContent = "";

  if (!name || !password) {
    errorDiv.textContent = t("fillIn");
    return;
  }

  try {
    const { ok, status, data } = await api("/login", { method: "POST", body: { name, password } });
    if (ok && data.success) {
      $("passwordInput").value = "";
      hidePasswords();
      currentRole = data.role;
      if (currentRole === "admin") showAdminScreen();
      else showGameScreen();
    } else if (status === 401) {
      errorDiv.textContent = t("wrongCreds");
    } else if (status === 429) {
      errorDiv.textContent = t("tooMany");
    } else {
      errorDiv.textContent = t("loginFailed");
    }
  } catch (error) {
    errorDiv.textContent = t("loginFailed");
  }
}

async function handleLogout() {
  try {
    await api("/logout", { method: "POST" });
  } catch (error) {
    console.error("Logout failed:", error);
  }
  stopTimers();
  currentRole = null;
  resetRevealBox();
  $("passwordInput").value = "";
  hidePasswords();
  $("loginError").textContent = "";
  showScreen("loginScreen");
  await loadPlayersForLogin();
}

// ---------- player game screen ----------

async function showGameScreen() {
  stopTimers();
  showScreen("gameScreen");
  $("adminNavSection").classList.toggle("hidden", currentRole !== "admin");
  await refreshGame();
  gameTimer = setInterval(refreshGame, 4000);
}

async function refreshGame() {
  try {
    const { ok, status, data } = await api("/game/status");
    if (status === 401) {
      // Logged out (e.g. 30 minutes after the final reveal): clear the result and ask to log in again.
      stopTimers();
      resetRevealBox();
      showScreen("loginScreen");
      return;
    }
    if (ok) renderGame(data);
  } catch (error) {
    console.error("Game status failed:", error);
  }
}

function renderGame(d) {
  $("hello").textContent = t("hello", { name: d.name });

  const waiting = d.state === "waiting";
  const ready = d.state === "ready";
  $("waitPanel").classList.toggle("hidden", !waiting);
  $("spinPanel").classList.toggle("hidden", !ready);

  let message = "";
  if (d.state === "idle") message = t("idle");
  else if (d.state === "cancelled") message = t("cancelled");
  else if (d.state === "notParticipating") message = t("notParticipating");
  else if (ready && d.slots === 2) {
    if (d.spun === 0) message = t("spinTwice");
    else if (d.spun === 1) message = t("spinOnceMore");
  }
  $("gameMsg").textContent = message;

  // The Spin button goes away once every spin is used; the result then stays on screen.
  if (ready && !spinning) {
    $("spinBtn").classList.toggle("hidden", d.spun >= d.slots);
    if (d.revealed.length) showResult(d.revealed);
  }

  if (waiting) renderWaiting(d);
  else {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function renderWaiting(d) {
  const inCount = d.people.filter((p) => p.in).length;
  $("loggedInCount").textContent = t("loggedInCount", { in: inCount, total: d.people.length });
  $("meterFill").style.width = `${(inCount / d.people.length) * 100}%`;

  const chips = $("people");
  chips.innerHTML = "";
  d.people.forEach((p) => {
    const chip = document.createElement("span");
    chip.className = p.in ? "chip in" : "chip";
    chip.textContent = p.name;
    chips.appendChild(chip);
  });

  deadline = d.deadline;
  tickCountdown();
  if (!countdownTimer) countdownTimer = setInterval(tickCountdown, 1000);
}

function tickCountdown() {
  const pad = (n) => String(n).padStart(2, "0");
  const s = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
  $("cd").textContent = Math.floor(s / 86400);
  $("ch").textContent = pad(Math.floor((s % 86400) / 3600));
  $("cm").textContent = pad(Math.floor((s % 3600) / 60));
  $("cs").textContent = pad(s % 60);
}

function showResult(names) {
  const box = $("revealBox");
  box.classList.remove("hidden", "busy");
  $("boxLabel").textContent = t("resultLabel");
  $("boxName").textContent = names.join(` ${t("and")} `);
  $("boxNote").textContent = "";
}

function resetRevealBox() {
  $("revealBox").classList.add("hidden");
  $("revealBox").classList.remove("busy");
  $("boxLabel").textContent = "";
  $("boxName").textContent = "";
  $("boxNote").textContent = "";
}

async function handleSpin() {
  if (spinning) return;
  spinning = true;

  const btn = $("spinBtn");
  btn.disabled = true;

  const box = $("revealBox");
  box.classList.remove("hidden");
  box.classList.add("busy");
  $("boxLabel").textContent = t("spinning");
  $("boxName").textContent = "";
  $("boxNote").textContent = t("checkPhone");

  try {
    const [result] = await Promise.all([api("/spin", { method: "POST" }), sleep(SPIN_MS)]);
    box.classList.remove("busy");
    if (result.ok) {
      showResult(result.data.assignedTo);
    } else {
      $("boxLabel").textContent = t("error");
      $("boxName").textContent = "";
      $("boxNote").textContent = "";
    }
  } catch (error) {
    box.classList.remove("busy");
    $("boxLabel").textContent = t("error");
    $("boxNote").textContent = "";
  } finally {
    spinning = false;
    btn.disabled = false;
    refreshGame();
  }
}

// ---------- admin panel (English) ----------

async function showAdminScreen() {
  stopTimers();
  showScreen("adminScreen");
  await loadAdminData();
  adminTimer = setInterval(loadAdminData, 3000);
}

let lastAdminData = null;

async function loadAdminData() {
  try {
    const { ok, status, data } = await api("/admin/players");
    if (status === 401 || status === 403) {
      stopTimers();
      showScreen("loginScreen");
      return;
    }
    if (!ok) return;
    lastAdminData = data;
    renderBanner(data);
    renderPlayers(data);
    renderGameControl(data);
    await loadAssignments();
  } catch (error) {
    console.error("Load admin data failed:", error);
  }
}

function formatDeadline(ms) {
  return new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function renderBanner(d) {
  const banner = $("adminBanner");
  banner.className = "banner";
  const total = d.players.length;

  if (d.phase === "waiting") {
    banner.classList.add("waiting");
    const missing = d.waitingFor.length ? ` Still to log in: ${d.waitingFor.join(", ")}.` : " Everyone has logged in.";
    banner.textContent = `Waiting for logins until ${formatDeadline(d.deadline)}. ${d.participantCount - d.waitingFor.length} of ${d.participantCount} logged in.${missing} The draw is already made (see Full draw below; you can re-draw it until the deadline, and players can't see it). Players get their Spin button at the deadline if everyone has logged in.`;
  } else if (d.phase === "cancelled") {
    banner.classList.add("cancelled");
    const reason = d.cancelReason || {};
    const why = reason.missing
      ? `These players did not log in: ${reason.missing.join(", ")}.`
      : reason.error || "";
    banner.textContent = `Game cancelled. ${why} Reset the game to try again.`;
  } else if (d.phase === "started") {
    banner.classList.add("started");
    banner.textContent = "Game is running.";
  } else {
    banner.textContent = total ? "No game running." : "Add players to begin.";
  }

  $("playGameSection").classList.toggle("hidden", !d.adminPlays);
}

function fillSelect(select, firstLabel, extra, players) {
  const previous = select.value;
  select.innerHTML = "";
  select.appendChild(new Option(firstLabel, ""));
  extra.forEach(([label, value]) => select.appendChild(new Option(label, value)));
  players.forEach((p) => select.appendChild(new Option(p.name, p.name)));
  if ([...select.options].some((o) => o.value === previous)) select.value = previous;
}

function renderPlayers(d) {
  const list = $("playerList");
  list.innerHTML = "";
  const locked = d.phase !== "idle";

  d.players.forEach((player) => {
    const item = document.createElement("div");
    item.className = "player-item";

    const label = document.createElement("div");
    const nameEl = document.createElement("span");
    nameEl.className = "player-name";
    nameEl.textContent = player.name;
    label.appendChild(nameEl);

    const meta = [];
    if (player.role === "admin") meta.push("Admin");
    if (player.family) meta.push(`Family: ${player.family}`);
    if (d.phase === "waiting") meta.push(player.loggedIn ? "logged in" : "not logged in yet");
    if (meta.length) {
      const metaEl = document.createElement("span");
      metaEl.className = "player-role";
      metaEl.textContent = ` (${meta.join(", ")})`;
      label.appendChild(metaEl);
    }

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-secondary";
    editBtn.textContent = "Family";
    editBtn.disabled = locked;
    editBtn.addEventListener("click", async () => {
      const family = prompt(`Family for ${player.name} (leave blank for none):`, player.family || "");
      if (family !== null) await handleSetFamily(player.name, family);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.disabled = locked || player.role === "admin";
    deleteBtn.addEventListener("click", async () => {
      if (confirm(`Delete player ${player.name}?`)) await handleDeletePlayer(player.name);
    });

    const actions = document.createElement("div");
    actions.className = "player-actions";
    actions.append(editBtn, deleteBtn);

    item.append(label, actions);
    list.appendChild(item);
  });

  $("addPlayerBtn").disabled = locked;
  fillSelect($("resetPlayerSelect"), "-- Select player --", [], d.players);
}

function participantCount(d) {
  return d.players.length - ($("adminParticipates").checked ? 0 : 1);
}

function renderGameControl(d) {
  const idle = d.phase === "idle";
  const count = participantCount(d);
  const isOdd = count % 2 === 1;

  $("doubleSpinnerSection").classList.toggle("hidden", !(idle && isOdd));
  fillSelect($("doubleSpinnerSelect"), "-- Select --", [["Pick randomly", "random"]], d.players);

  $("adminParticipates").disabled = !idle;
  $("enforceFamilies").disabled = !idle;
  $("deadlineInput").disabled = !idle;
  $("drawSummary").textContent = idle
    ? count < 2
      ? "Add more players to start."
      : `${count} participants${isOdd ? " (odd: pick a double-spinner)" : ""}.`
    : "";
  renderStartButton();
}

function renderStartButton() {
  const d = lastAdminData;
  if (!d) return;
  const btn = $("startGameBtn");
  const scheduled = Boolean($("deadlineInput").value);
  btn.textContent = d.phase === "idle" ? (scheduled ? "Start login countdown" : "Start game now") : "Game in progress";
  btn.disabled = d.phase !== "idle" || participantCount(d) < 2;
}

async function handleAddPlayer() {
  const name = $("newPlayerName").value.trim();
  const password = $("newPlayerPassword").value;
  const family = $("newPlayerFamily").value.trim();

  if (!name || !password) {
    alert("Please enter name and password");
    return;
  }

  const { ok, data } = await api("/admin/players", { method: "POST", body: { name, password, family } });
  if (!ok) {
    alert(data.error || "Failed to add player");
    return;
  }
  $("newPlayerName").value = "";
  $("newPlayerFamily").value = "";
  $("newPlayerPassword").value = "";
  await loadAdminData();
}

async function handleSetFamily(name, family) {
  const { ok, data } = await api(`/admin/players/${encodeURIComponent(name)}`, {
    method: "PATCH",
    body: { family },
  });
  if (!ok) alert(data.error || "Failed to update family");
  await loadAdminData();
}

async function handleDeletePlayer(name) {
  const { ok, data } = await api(`/admin/players/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!ok) alert(data.error || "Failed to delete player");
  await loadAdminData();
}

async function handleStartGame() {
  const deadlineValue = $("deadlineInput").value;
  const body = {
    adminParticipates: $("adminParticipates").checked,
    enforceFamilies: $("enforceFamilies").checked,
    doubleSpinnerName: $("doubleSpinnerSelect").value || null,
    deadline: deadlineValue ? new Date(deadlineValue).getTime() : null,
  };

  const { ok, data } = await api("/admin/start", { method: "POST", body });
  if (!ok) {
    alert(data.error || "Failed to start game");
    return;
  }
  $("deadlineInput").value = "";
  await loadAdminData();
}

async function handleResetGame() {
  const deletePlayers = $("deletePlayersOnReset").checked;
  const warning = deletePlayers
    ? "Reset the game AND delete all players (except you)?"
    : "Reset the game? This clears all assignments.";
  if (!confirm(warning)) return;

  const { ok, data } = await api("/admin/reset", { method: "POST", body: { deletePlayers } });
  if (!ok) {
    alert(data.error || "Failed to reset game");
    return;
  }
  $("deletePlayersOnReset").checked = false;
  await loadAdminData();
}

async function handleResetPassword() {
  const name = $("resetPlayerSelect").value;
  const newPassword = $("newPassword").value;

  if (!name || !newPassword) {
    alert("Please select a player and enter new password");
    return;
  }

  const { ok, data } = await api("/admin/reset-password", {
    method: "POST",
    body: { name, newPassword },
  });
  if (!ok) {
    alert(data.error || "Failed to reset password");
    return;
  }
  $("resetPlayerSelect").value = "";
  $("newPassword").value = "";
  alert("Password reset. The player will need to log in again.");
}

// ---------- admin: assignments ----------

let assignmentsVisible = false;

function toggleAssignmentsView() {
  assignmentsVisible = !assignmentsVisible;
  $("toggleAssignmentsBtn").textContent = assignmentsVisible ? "Hide draw" : "Show draw";
  loadAssignments();
}

async function handleRedraw() {
  const ok = confirm(
    "Re-draw everyone who has not spun yet? Results that were already revealed stay the same."
  );
  if (!ok) return;

  const result = await api("/admin/redraw", { method: "POST" });
  if (!result.ok) {
    alert(result.data.error || "Failed to re-draw");
    return;
  }
  await loadAdminData();
}

async function loadAssignments() {
  const { ok, data } = await api("/admin/assignments");
  if (!ok) return;

  const section = $("assignmentsSection");
  const toggleBtn = $("toggleAssignmentsBtn");
  const list = $("allAssignments");

  // The full draw is always available to the admin, but hidden until asked for.
  section.classList.remove("hidden");
  toggleBtn.classList.toggle("hidden", !data.hasDraw);
  $("redrawSection").classList.toggle("hidden", !data.hasDraw);
  if (!data.hasDraw) {
    list.textContent = "The draw appears here as soon as you start the game or schedule the countdown.";
    return;
  }
  if (!assignmentsVisible) {
    list.textContent = "";
    return;
  }

  list.textContent = "";
  Object.entries(data.assignments).forEach(([player, info]) => {
    const item = document.createElement("div");
    item.className = "assignment-item";
    const who = document.createElement("strong");
    who.textContent = player;
    const total = info.receivers.length;
    const spunNote =
      info.spun >= total ? " (spun)" : info.spun > 0 ? ` (${info.spun} of ${total} spun)` : "";
    item.append(who, ` → ${info.receivers.join(" and ")}${spunNote}`);
    list.appendChild(item);
  });

  if (data.doubleSpinner) {
    const info = document.createElement("p");
    info.className = "muted";
    info.textContent = `Double-spinner: ${data.doubleSpinner}`;
    list.appendChild(info);
  }
}
