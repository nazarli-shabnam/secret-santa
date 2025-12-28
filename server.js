const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

let state = {
  players: [],
  gameState: {
    started: false,
    doubleSpinner: null,
    assignments: new Map(),
    availablePool: [],
    playerStatus: new Map(),
  },
  sessions: new Map(),
};

function generateSessionId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function validateSession(req, res, next) {
  const sessionId = req.cookies.sessionId;
  if (!sessionId || !state.sessions.has(sessionId)) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  req.session = state.sessions.get(sessionId);
  next();
}

function requireAdmin(req, res, next) {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

app.get('/api/players', (req, res) => {
  const players = state.players.map(p => ({
    name: p.name
  }));
  res.json({ players });
});

app.post('/api/bootstrap', (req, res) => {
  console.log('Bootstrap endpoint called');
  console.log('Current players:', state.players.length);
  console.log('Request body:', req.body);
  
  if (state.players.length > 0) {
    console.log('Bootstrap failed: Players already exist');
    return res.status(400).json({ error: 'Players already exist. Use admin panel to add more.' });
  }
  
  const { name, password } = req.body;
  
  if (!name || !password) {
    console.log('Bootstrap failed: Missing name or password');
    return res.status(400).json({ error: 'Name and password required' });
  }
  
  state.players.push({ name, password, role: 'admin' });
  console.log('Admin created successfully:', name);
  
  res.json({ success: true, message: 'Admin created successfully' });
});

function getPlayer(name) {
  return state.players.find(p => p.name === name);
}

app.post('/api/login', (req, res) => {
  const { name, password } = req.body;
  
  if (!name || !password) {
    return res.status(400).json({ error: 'Name and password required' });
  }
  
  const player = getPlayer(name);
  if (!player || player.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const sessionId = generateSessionId();
  state.sessions.set(sessionId, { name, role: player.role });
  
  res.cookie('sessionId', sessionId, { httpOnly: true, sameSite: 'strict' });
  res.json({ success: true, role: player.role });
});

app.post('/api/logout', (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (sessionId) {
    state.sessions.delete(sessionId);
  }
  res.clearCookie('sessionId');
  res.json({ success: true });
});

app.get('/api/game/status', validateSession, (req, res) => {
  const { name } = req.session;
  const { gameState } = state;
  
  const playerStatus = gameState.playerStatus.get(name) || { hasSpun: false, spinCount: 0 };
  let assignment = gameState.assignments.get(name);
  const isDoubleSpinner = gameState.doubleSpinner === name;
  
  if (Array.isArray(assignment)) {
    assignment = assignment.join(' and ');
  }
  
  let canSpin = false;
  let message = '';
  
  if (!gameState.started) {
    message = 'Game has not started yet.';
  } else if (playerStatus.hasSpun) {
    if (isDoubleSpinner && playerStatus.spinCount < 2) {
      canSpin = true;
      message = 'You may spin one more time.';
    } else {
      message = 'You have already spun.';
    }
  } else if (gameState.availablePool.length === 0) {
    message = 'All assignments have already been made. You cannot spin in this round.';
  } else {
    canSpin = true;
    message = 'You can spin now.';
  }
  
  res.json({
    gameStarted: gameState.started,
    canSpin,
    message,
    assignment: assignment || null,
    hasSpun: playerStatus.hasSpun,
    isDoubleSpinner: isDoubleSpinner && !playerStatus.hasSpun ? true : (isDoubleSpinner && playerStatus.spinCount < 2)
  });
});

app.post('/api/spin', validateSession, (req, res) => {
  const { name } = req.session;
  const { gameState } = state;
  
  if (!gameState.started) {
    return res.status(400).json({ error: 'Game has not started yet' });
  }
  
  const playerStatus = gameState.playerStatus.get(name) || { hasSpun: false, spinCount: 0 };
  const isDoubleSpinner = gameState.doubleSpinner === name;
  
  if (playerStatus.hasSpun && !(isDoubleSpinner && playerStatus.spinCount < 2)) {
    return res.status(400).json({ error: 'You have already spun' });
  }
  
  if (gameState.availablePool.length === 0) {
    return res.status(400).json({ error: 'All assignments have already been made. You cannot spin in this round.' });
  }

  let availablePool = gameState.availablePool.filter(n => n !== name);
  
  if (availablePool.length === 0) {
    return res.status(400).json({ error: 'No valid assignments available' });
  }
  
  const randomIndex = Math.floor(Math.random() * availablePool.length);
  const assignedTo = availablePool[randomIndex];
  
  if (!playerStatus.hasSpun) {
    gameState.assignments.set(name, assignedTo);
    gameState.playerStatus.set(name, { hasSpun: true, spinCount: 1 });
  } else {
    const existing = gameState.assignments.get(name);
    if (Array.isArray(existing)) {
      existing.push(assignedTo);
      gameState.assignments.set(name, existing);
    } else {
      gameState.assignments.set(name, [existing, assignedTo]);
    }
    gameState.playerStatus.set(name, { hasSpun: true, spinCount: 2 });
  }
  
  const poolIndex = gameState.availablePool.indexOf(assignedTo);
  if (poolIndex !== -1) {
    gameState.availablePool.splice(poolIndex, 1);
  }
  
  res.json({ assignedTo });
});

app.get('/api/admin/players', validateSession, requireAdmin, (req, res) => {
  const players = state.players.map(p => ({
    name: p.name,
    role: p.role
  }));
  res.json({ players, gameStarted: state.gameState.started });
});

app.post('/api/admin/players', validateSession, requireAdmin, (req, res) => {
  const { name, password, role } = req.body;
  
  if (!name || !password) {
    return res.status(400).json({ error: 'Name and password required' });
  }
  
  if (getPlayer(name)) {
    return res.status(400).json({ error: 'Player already exists' });
  }
  
  state.players.push({ name, password, role: role || 'user' });
  
  res.json({ success: true });
});

app.delete('/api/admin/players/:name', validateSession, requireAdmin, (req, res) => {
  const { name } = req.params;
  
  if (state.gameState.started) {
    return res.status(400).json({ error: 'Cannot delete players after game has started' });
  }
  
  const index = state.players.findIndex(p => p.name === name);
  if (index === -1) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  state.players.splice(index, 1);
  res.json({ success: true });
});

app.post('/api/admin/start', validateSession, requireAdmin, (req, res) => {
  if (state.gameState.started) {
    return res.status(400).json({ error: 'Game has already started' });
  }
  
  if (state.players.length < 2) {
    return res.status(400).json({ error: 'Need at least 2 players to start' });
  }
  
  const { doubleSpinnerName, adminParticipates } = req.body;
  const playerCount = state.players.length + (adminParticipates ? 0 : -1);
  
  const playerNames = state.players.map(p => p.name);
  
  const adminPlayer = state.players.find(p => p.role === 'admin');
  let pool = [...playerNames];
  if (!adminParticipates && adminPlayer) {
    pool = pool.filter(n => n !== adminPlayer.name);
  }
  
  if (playerCount % 2 === 1) {
    if (!doubleSpinnerName) {
      return res.status(400).json({ error: 'Odd number of players — select a double-spinner' });
    }
    
    const doubleSpinner = getPlayer(doubleSpinnerName);
    if (!doubleSpinner) {
      return res.status(400).json({ error: 'Double-spinner player not found' });
    }
    
    if (!pool.includes(doubleSpinnerName)) {
      return res.status(400).json({ error: 'Double-spinner must be a participating player' });
    }
    
    state.gameState.doubleSpinner = doubleSpinnerName;
  }
  
  if (state.gameState.doubleSpinner) {
    pool.push(state.gameState.doubleSpinner);
  }
  
  state.gameState.started = true;
  state.gameState.availablePool = pool;
  state.gameState.assignments.clear();
  state.gameState.playerStatus.clear();
  
  pool.forEach(name => {
    state.gameState.playerStatus.set(name, { hasSpun: false, spinCount: 0 });
  });
  
  res.json({ success: true });
});

app.post('/api/admin/reset', validateSession, requireAdmin, (req, res) => {
  state.gameState = {
    started: false,
    doubleSpinner: null,
    assignments: new Map(),
    availablePool: [],
    playerStatus: new Map()
  };
  
  res.json({ success: true });
});

app.post('/api/admin/reset-password', validateSession, requireAdmin, (req, res) => {
  const { name, newPassword } = req.body;
  
  if (!name || !newPassword) {
    return res.status(400).json({ error: 'Name and new password required' });
  }
  
  const player = getPlayer(name);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  player.password = newPassword;
  
  for (const [sessionId, session] of state.sessions.entries()) {
    if (session.name === name) {
      state.sessions.delete(sessionId);
    }
  }
  
  res.json({ success: true });
});

app.get('/api/admin/assignments', validateSession, requireAdmin, (req, res) => {
  const assignments = {};
  state.gameState.assignments.forEach((assignedTo, playerName) => {
    assignments[playerName] = assignedTo;
  });
  
  res.json({
    assignments,
    gameStarted: state.gameState.started,
    doubleSpinner: state.gameState.doubleSpinner,
    poolSize: state.gameState.availablePool.length
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

