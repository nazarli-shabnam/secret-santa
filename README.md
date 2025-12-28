# Secret Santa Web App

A simple, family-friendly Secret Santa web application for 8-10 players.

## Features

- **Simple Authentication**: Players select their name and enter a password
- **Admin Panel**: Create players, start/reset games, manage passwords
- **Odd Number Handling**: One player can spin twice when there's an odd number of players
- **Mobile-Friendly**: Works on all devices
- **In-Memory Storage**: No database required (game resets on server restart)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

3. Open your browser to `http://localhost:3000`

## Usage

### Initial Setup (Admin)

1. The first player to use the app should be created as admin
2. Login as admin
3. Add all players (name + password for each)
4. Check "Admin participates in game" if admin will play
5. If odd number of players, select the double-spinner
6. Click "Start Game"

### Playing the Game

1. Each player logs in with their name and password
2. Click "Spin" to get your Secret Santa assignment
3. Players can only see their own assignment
4. Once all assignments are made, new players cannot spin

### Admin Features

- **Add Players**: Can add players even after game starts
- **Delete Players**: Only before game starts
- **Start Game**: Locks player deletion, initializes assignments
- **Reset Game**: Clears all assignments, allows restart
- **Reset Password**: Invalidates existing sessions for that player

## Architecture

- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Backend**: Node.js + Express
- **Storage**: In-memory only (no database)
- **Sessions**: Cookie-based

## Game Rules

1. No player can get their own name
2. Each name can only be assigned once
3. Double-spinner (for odd numbers) can spin twice but cannot get themselves
4. All validation happens on the backend
5. Players cannot see other players' assignments

## Deployment

### Render

1. Connect your GitHub repository
2. Set build command: (none needed)
3. Set start command: `npm start`
4. Deploy!

### Hostinger

1. Upload files via FTP
2. Install Node.js dependencies
3. Run `npm start` or use PM2 for process management

**Note**: Game state resets on server restart (by design - in-memory storage).

## Security Notes

- Passwords are stored in plain text (acceptable for family use)
- Sessions use HTTP-only cookies
- All game logic validated on backend
- No frontend trust

## Edge Cases Handled

- Too few players (< 2)
- Last remaining assignment
- Self-assignment prevention
- Adding players mid-game (blocked if pool empty)
- Refresh mid-game (preserves state)
- Double-click on spin (disabled button)
- Reset during active game
- Odd number validation
