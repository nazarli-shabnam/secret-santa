const express = require("express");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { buildAssignments, validateRoster } = require("./assign");

const app = express();
const PORT = process.env.PORT || 3000;
const SETUP_CODE = process.env.SETUP_CODE || "";
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
const IS_PROD = process.env.NODE_ENV === "production";

const MAX_NAME_LENGTH = 40;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_DEADLINE_MS = 60 * 24 * 60 * 60 * 1000;
const DEADLINE_CHECK_MS = 5000;

app.set("trust proxy", 1);
app.use(express.json());
app.use(cookieParser());
app.use(express.static("public"));

// phase: "idle" -> ("waiting" ->) "started" | "cancelled"; admin Reset returns to "idle".
function freshGameState() {
  return {
    phase: "idle",
    // waiting phase: { deadline, adminName, adminParticipates, enforceFamilies, doubleSpinnerName }
    schedule: null,
    // cancelled phase: { missing: [names] } or { error: "..." }
    cancelReason: null,
    loggedIn: new Set(),
    doubleSpinner: null,
    enforceFamilies: true,
    adminParticipates: false,
    // giver name -> [receiver names], computed once when the draw happens
    plan: new Map(),
    // giver name -> number of receivers revealed so far
    spinCounts: new Map(),
  };
}

const state = {
  players: [], // { name, family, role, salt, hash }
  gameState: freshGameState(),
  sessions: new Map(), // sessionId -> { name, role, expires }
};

// ---- persistence (survives restarts when DATA_FILE is on durable storage) ----

function save() {
  const { gameState } = state;
  const data = {
    players: state.players,
    sessions: [...state.sessions],
    gameState: {
      ...gameState,
      loggedIn: [...gameState.loggedIn],
      plan: [...gameState.plan],
      spinCounts: [...gameState.spinCounts],
    },
  };
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data));
  } catch (err) {
    console.error("Failed to save state:", err.message);
  }
}

function load() {
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const gs = data.gameState || {};
    state.players = data.players || [];
    state.sessions = new Map(data.sessions || []);
    state.gameState = {
      ...freshGameState(),
      ...gs,
      loggedIn: new Set(gs.loggedIn || []),
      plan: new Map(gs.plan || []),
      spinCounts: new Map(gs.spinCounts || []),
    };
  } catch (err) {
    console.error("Failed to load saved state, starting fresh:", err.message);
  }
}

// ---- auth helpers ----

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return { salt, hash };
}

function passwordMatches(player, password) {
  const candidate = crypto.scryptSync(password, player.salt, 32);
  return crypto.timingSafeEqual(candidate, Buffer.from(player.hash, "hex"));
}

function getPlayer(name) {
  return state.players.find((p) => p.name === name);
}

function hasPlayerNamed(name) {
  const lower = name.toLowerCase();
  return state.players.some((p) => p.name.toLowerCase() === lower);
}

function cleanString(value, max = MAX_NAME_LENGTH) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const loginFailures = new Map(); // key -> { count, windowStart }

function throttleKey(req, name) {
  return `${req.ip}|${name}`;
}

function isThrottled(key) {
  const entry = loginFailures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > LOGIN_WINDOW_MS) {
    loginFailures.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_FAILURES;
}

function recordFailure(key) {
  const entry = loginFailures.get(key);
  if (!entry || Date.now() - entry.windowStart > LOGIN_WINDOW_MS) {
    loginFailures.set(key, { count: 1, windowStart: Date.now() });
  } else {
    entry.count++;
  }
}

function validateSession(req, res, next) {
  const sessionId = req.cookies.sessionId;
  const session = sessionId && state.sessions.get(sessionId);
  if (!session || session.expires < Date.now()) {
    if (session) state.sessions.delete(sessionId);
    return res.status(401).json({ error: "Not authenticated" });
  }
  req.session = session;
  next();
}

function requireAdmin(req, res, next) {
  if (req.session.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

function dropSessionsFor(name) {
  for (const [sessionId, session] of state.sessions.entries()) {
    if (session.name === name) state.sessions.delete(sessionId);
  }
}

// ---- draw ----

function participantsFor(adminName, adminParticipates) {
  return state.players
    .filter((p) => adminParticipates || p.name !== adminName)
    .map((p) => ({ name: p.name, family: p.family }));
}

// Pure: validates the rules and builds the draw. Does not touch game state.
function computeDraw({ adminName, adminParticipates, enforceFamilies, doubleSpinnerName }) {
  const participants = participantsFor(adminName, adminParticipates);

  if (participants.length < 2) {
    return { ok: false, reason: "Need at least 2 participating players" };
  }

  if (participants.length % 2 === 0) {
    const result = buildAssignments({ participants, enforceFamilies });
    return result.ok
      ? { ok: true, assignments: result.assignments, doubleSpinner: null }
      : result;
  }

  if (!doubleSpinnerName) {
    return { ok: false, reason: "Odd number of players: select a double-spinner" };
  }

  let candidates;
  if (doubleSpinnerName === "random") {
    candidates = participants.map((p) => p.name).sort(() => Math.random() - 0.5);
  } else if (participants.some((p) => p.name === doubleSpinnerName)) {
    candidates = [doubleSpinnerName];
  } else {
    return { ok: false, reason: "Double-spinner must be a participating player" };
  }

  let reason;
  for (const candidate of candidates) {
    reason = validateRoster({ participants, doubleSpinner: candidate, enforceFamilies });
    if (reason) continue;
    const result = buildAssignments({ participants, doubleSpinner: candidate, enforceFamilies });
    if (result.ok) {
      return { ok: true, assignments: result.assignments, doubleSpinner: candidate };
    }
    reason = result.reason;
  }
  return { ok: false, reason };
}

function beginGame(draw, { adminParticipates, enforceFamilies }) {
  state.gameState = {
    ...freshGameState(),
    phase: "started",
    doubleSpinner: draw.doubleSpinner,
    enforceFamilies,
    adminParticipates,
    plan: new Map(Object.entries(draw.assignments)),
    loggedIn: state.gameState.loggedIn,
  };
}

// Runs on a timer: when the login deadline passes, either start the draw or cancel.
function checkDeadline() {
  const { gameState } = state;
  if (gameState.phase !== "waiting" || Date.now() < gameState.schedule.deadline) return;

  const schedule = gameState.schedule;
  const participants = participantsFor(schedule.adminName, schedule.adminParticipates);
  const missing = participants
    .map((p) => p.name)
    .filter((name) => !gameState.loggedIn.has(name));

  if (missing.length > 0) {
    state.gameState = {
      ...freshGameState(),
      phase: "cancelled",
      cancelReason: { missing },
      loggedIn: gameState.loggedIn,
    };
  } else {
    const draw = computeDraw(schedule);
    if (draw.ok) {
      beginGame(draw, schedule);
    } else {
      state.gameState = {
        ...freshGameState(),
        phase: "cancelled",
        cancelReason: { error: draw.reason },
        loggedIn: gameState.loggedIn,
      };
    }
  }
  save();
}

// ---- public + auth routes ----

app.get("/api/players", (req, res) => {
  res.json({
    players: state.players.map((p) => ({ name: p.name })),
    setupCodeRequired: Boolean(SETUP_CODE),
  });
});

app.post("/api/bootstrap", (req, res) => {
  if (state.players.length > 0) {
    return res
      .status(400)
      .json({ error: "Players already exist. Use admin panel to add more." });
  }

  if (SETUP_CODE && req.body.setupCode !== SETUP_CODE) {
    return res.status(403).json({ error: "Invalid setup code" });
  }

  const name = cleanString(req.body.name);
  const { password } = req.body;
  if (!name || !password || typeof password !== "string") {
    return res.status(400).json({ error: "Name and password required" });
  }

  state.players.push({
    name,
    family: "",
    role: "admin",
    ...hashPassword(password),
  });
  save();

  res.json({ success: true, message: "Admin created successfully" });
});

app.post("/api/login", (req, res) => {
  const { name, password } = req.body;

  if (!name || !password || typeof name !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Name and password required" });
  }

  const key = throttleKey(req, name);
  if (isThrottled(key)) {
    return res
      .status(429)
      .json({ error: "Too many failed attempts. Try again in a few minutes." });
  }

  const player = getPlayer(name);
  if (!player || !passwordMatches(player, password)) {
    recordFailure(key);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  loginFailures.delete(key);
  state.gameState.loggedIn.add(name);

  const sessionId = crypto.randomBytes(24).toString("hex");
  state.sessions.set(sessionId, {
    name,
    role: player.role,
    expires: Date.now() + SESSION_MS,
  });
  save();

  res.cookie("sessionId", sessionId, {
    httpOnly: true,
    sameSite: "strict",
    secure: IS_PROD,
    maxAge: SESSION_MS,
  });
  res.json({ success: true, role: player.role });
});

app.post("/api/logout", (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (sessionId) {
    state.sessions.delete(sessionId);
    save();
  }
  res.clearCookie("sessionId");
  res.json({ success: true });
});

// ---- game routes ----

function revealedFor(name) {
  const { plan, spinCounts } = state.gameState;
  return (plan.get(name) || []).slice(0, spinCounts.get(name) || 0);
}

// Players only ever get codes, never the result; the client turns them into text.
app.get("/api/game/status", validateSession, (req, res) => {
  const { name, role } = req.session;
  const { gameState } = state;

  const body = { name, role, state: "idle" };

  if (gameState.phase === "cancelled") {
    body.state = "cancelled";
  } else if (gameState.phase === "waiting") {
    const { schedule } = gameState;
    const participants = participantsFor(schedule.adminName, schedule.adminParticipates);
    const isParticipant = participants.some((p) => p.name === name);
    body.state = isParticipant ? "waiting" : "notParticipating";
    body.deadline = schedule.deadline;
    body.people = participants.map((p) => ({
      name: p.name,
      in: gameState.loggedIn.has(p.name),
    }));
  } else if (gameState.phase === "started") {
    const slots = gameState.plan.get(name);
    if (slots) {
      body.state = "ready";
      body.slots = slots.length;
      body.spun = gameState.spinCounts.get(name) || 0;
    } else {
      body.state = "notParticipating";
    }
  }

  res.json(body);
});

// Reveals the player's next result. After the last one it simply shows them again.
app.post("/api/spin", validateSession, (req, res) => {
  const { name } = req.session;
  const { gameState } = state;

  const slots = gameState.phase === "started" && gameState.plan.get(name);
  if (!slots) {
    return res.status(400).json({ error: "You are not participating in this game" });
  }

  const spinCount = gameState.spinCounts.get(name) || 0;
  if (spinCount < slots.length) {
    gameState.spinCounts.set(name, spinCount + 1);
    save();
  }

  res.json({ assignedTo: revealedFor(name) });
});

// ---- admin routes ----

function adminPlays(gameState) {
  if (gameState.phase === "waiting") return gameState.schedule.adminParticipates;
  if (gameState.phase === "started") return gameState.adminParticipates;
  return false;
}

app.get("/api/admin/players", validateSession, requireAdmin, (req, res) => {
  const { gameState } = state;
  const body = {
    players: state.players.map((p) => ({
      name: p.name,
      role: p.role,
      family: p.family,
      loggedIn: gameState.loggedIn.has(p.name),
    })),
    phase: gameState.phase,
    gameStarted: gameState.phase === "started",
    enforceFamilies: gameState.enforceFamilies,
    adminPlays: adminPlays(gameState),
    cancelReason: gameState.cancelReason,
  };

  if (gameState.phase === "waiting") {
    const { schedule } = gameState;
    body.deadline = schedule.deadline;
    body.waitingFor = participantsFor(schedule.adminName, schedule.adminParticipates)
      .map((p) => p.name)
      .filter((n) => !gameState.loggedIn.has(n));
    body.participantCount = participantsFor(schedule.adminName, schedule.adminParticipates).length;
  }

  res.json(body);
});

function requireIdle(req, res, message) {
  if (state.gameState.phase !== "idle") {
    res.status(400).json({ error: message });
    return false;
  }
  return true;
}

app.post("/api/admin/players", validateSession, requireAdmin, (req, res) => {
  if (!requireIdle(req, res, "Cannot add players while a game is scheduled, running or cancelled. Reset the game first.")) return;

  const name = cleanString(req.body.name);
  const { password } = req.body;
  const family = cleanString(req.body.family);

  if (!name || !password || typeof password !== "string") {
    return res.status(400).json({ error: "Name and password required" });
  }

  if (hasPlayerNamed(name)) {
    return res.status(400).json({ error: "Player already exists" });
  }

  state.players.push({ name, family, role: "user", ...hashPassword(password) });
  save();

  res.json({ success: true });
});

app.patch(
  "/api/admin/players/:name",
  validateSession,
  requireAdmin,
  (req, res) => {
    if (!requireIdle(req, res, "Cannot change families while a game is scheduled, running or cancelled. Reset the game first.")) return;

    const player = getPlayer(req.params.name);
    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    player.family = cleanString(req.body.family);
    save();
    res.json({ success: true });
  }
);

app.delete(
  "/api/admin/players/:name",
  validateSession,
  requireAdmin,
  (req, res) => {
    if (!requireIdle(req, res, "Cannot delete players while a game is scheduled, running or cancelled. Reset the game first.")) return;

    const { name } = req.params;
    const index = state.players.findIndex((p) => p.name === name);
    if (index === -1) {
      return res.status(404).json({ error: "Player not found" });
    }

    if (state.players[index].name === req.session.name) {
      return res.status(400).json({ error: "You cannot delete yourself" });
    }

    state.players.splice(index, 1);
    dropSessionsFor(name);
    state.gameState.loggedIn.delete(name);
    save();
    res.json({ success: true });
  }
);

// Starts the draw now, or, when `deadline` (ms timestamp) is given, opens a login
// window and starts the draw automatically when it ends if everyone has logged in.
app.post("/api/admin/start", validateSession, requireAdmin, (req, res) => {
  if (!requireIdle(req, res, "A game is already scheduled, running or cancelled. Reset it first.")) return;

  const options = {
    adminName: req.session.name,
    adminParticipates: Boolean(req.body.adminParticipates),
    enforceFamilies: req.body.enforceFamilies !== false,
    doubleSpinnerName: cleanString(req.body.doubleSpinnerName),
  };

  const draw = computeDraw(options);
  if (!draw.ok) {
    return res.status(400).json({ error: draw.reason });
  }

  const deadline = Number(req.body.deadline);
  if (req.body.deadline) {
    if (!Number.isFinite(deadline) || deadline <= Date.now()) {
      return res.status(400).json({ error: "Deadline must be in the future" });
    }
    if (deadline - Date.now() > MAX_DEADLINE_MS) {
      return res.status(400).json({ error: "Deadline must be within 60 days" });
    }
    state.gameState = {
      ...freshGameState(),
      phase: "waiting",
      schedule: { ...options, deadline },
      enforceFamilies: options.enforceFamilies,
      adminParticipates: options.adminParticipates,
      loggedIn: new Set([req.session.name]),
    };
    save();
    return res.json({ success: true, scheduled: true });
  }

  beginGame(draw, options);
  save();
  res.json({ success: true, doubleSpinner: draw.doubleSpinner });
});

app.post("/api/admin/reset", validateSession, requireAdmin, (req, res) => {
  state.gameState = freshGameState();

  if (req.body && req.body.deletePlayers) {
    const removed = state.players.filter((p) => p.role !== "admin");
    state.players = state.players.filter((p) => p.role === "admin");
    removed.forEach((p) => dropSessionsFor(p.name));
  }

  state.gameState.loggedIn.add(req.session.name);
  save();
  res.json({ success: true });
});

app.post(
  "/api/admin/reset-password",
  validateSession,
  requireAdmin,
  (req, res) => {
    const { name, newPassword } = req.body;

    if (!name || !newPassword || typeof newPassword !== "string") {
      return res.status(400).json({ error: "Name and new password required" });
    }

    const player = getPlayer(name);
    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    Object.assign(player, hashPassword(newPassword));
    dropSessionsFor(name);
    save();
    res.json({ success: true });
  }
);

app.get("/api/admin/assignments", validateSession, requireAdmin, (req, res) => {
  const { gameState } = state;
  const assignments = {};
  for (const name of gameState.plan.keys()) {
    const revealed = revealedFor(name);
    if (revealed.length) {
      assignments[name] = revealed.length === 1 ? revealed[0] : revealed;
    }
  }

  res.json({
    assignments,
    gameStarted: gameState.phase === "started",
    doubleSpinner: gameState.doubleSpinner,
    adminIsParticipating: gameState.plan.has(req.session.name),
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

load();
checkDeadline();
setInterval(checkDeadline, DEADLINE_CHECK_MS);
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
