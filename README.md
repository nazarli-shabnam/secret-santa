# Secret Santa Web App

A simple Secret Santa web app. The admin sets the rules for each round; players log in and "spin" to reveal who they got.

## Features

- **Pre-computed, always-valid draw**: the full draw is generated when the admin clicks Start, so nobody can get stuck with only themselves left. Spin just reveals the result.
- **Family rule (optional)**: give players a family label; with "No gifting within the same family" on, nobody draws someone from their own family. Turn it off for small groups.
- **Odd numbers**: with an odd number of participants, one double-spinner spins twice, gives 2 gifts and receives 2 gifts (always two different people). Pick one, or choose "Pick randomly".
- **Optional login countdown**: require everyone to log in by a deadline; the draw then starts by itself, or the game is cancelled.
- **Admin panel**: add/delete players, set families, start/reset, reset passwords, optionally view all assignments.
- **Mobile-friendly**, no database.

## Setup

```bash
npm install
npm start          # http://localhost:3000
npm test           # draw-logic tests
```

## Usage

1. Open the site. The first account created becomes the admin. **Create it before sharing the link**, or set `SETUP_CODE` (below) so strangers can't.
2. Add every player (name, password, optional family) and send each their password.
3. Choose the rules: admin plays too?, family rule on/off, double-spinner (if odd).
4. Either press **Start game now**, or set a **login deadline** first:
   - Everyone must log in before the deadline (the admin sees who is missing).
   - When the timer ends, the draw starts automatically if everyone logged in.
   - If anyone is missing, the game is **cancelled**. Press Reset to try again.
5. Players press **Fırlat** (Spin). A short "make sure it's you" screen shows for about 2.5 seconds, then the result appears and stays on their screen. The Spin button disappears once a player has used all their spins (once, or twice for the double-spinner), and the server refuses extra spins.
6. The admin can always see the full draw at the bottom of the admin panel (hidden behind a "Show draw" button), even before anyone spins.
   If something goes wrong, **Re-draw unrevealed** (under the full draw) re-mixes everyone who has not spun yet. Results already revealed never change, and the new draw still follows every rule.

**Reset game** clears the draw and the login tracking. Tick "Also delete all players" to remove everyone except the admin.

Players can't be added, deleted or have their family changed once a game is scheduled, running or cancelled. Reset first.

Players see Azerbaijani (all text is in `public/i18n.js`). The admin panel is English.

Logins last 30 days and are saved with the game state, so phones stay logged in across restarts. The exception: **30 minutes after a player's final reveal they are logged out** (on every device) and must log in again to see their result. Logging in again gives another 30 minutes. The admin is never logged out this way. (`RESULT_SESSION_MINUTES` changes the 30, mainly for testing.)

## Hosting

Environment variables:

| Variable | Purpose |
| --- | --- |
| `PORT` | Port to listen on (default 3000) |
| `NODE_ENV=production` | Marks the session cookie `secure` (use behind HTTPS) |
| `SETUP_CODE` | If set, creating the first admin requires this code |
| `DATA_FILE` | Where state is saved. Default: `/data/data.json` if a `/data` folder exists, else `./data.json` |

State is saved to `DATA_FILE` after every change and reloaded on boot, so a restart keeps the game. On hosts with an ephemeral disk (e.g. Render free tier) the file is lost when the instance is rebuilt; attach a persistent disk or accept that a redeploy resets the game. Logins are saved too, so players stay logged in across restarts.

### Render
Start command `npm start`; set `NODE_ENV=production` and `SETUP_CODE`.

### Other hosts
Upload the files, run `npm install`, then `npm start` (or use PM2).

## Security notes

- Passwords are hashed (scrypt, per-user salt); session IDs are random 192-bit values in HTTP-only cookies.
- Login is throttled: 5 failed attempts per name and IP per 10 minutes.
- The player-name list is public (it fills the login dropdown).
- This is built for friends and family, not high-stakes use.
