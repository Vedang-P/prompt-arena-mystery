# Developer tools

The game ships a full developer sandbox for building and testing quickly. It is
off by default: nothing exists until the `DEV_TEAM_CODE` environment variable is
set on the deployment.

## The dev account

Set `DEV_TEAM_CODE` (any secret string) and redeploy. On the next boot the
server seeds a team called **Dev Sandbox**:

- signs in through the normal team-code form with that code,
- is **exempt** from fullscreen enforcement and exit strikes,
- never appears on the leaderboard (its progress flags carry `dev: true`),
- carries a `dev` flag on every state response, which switches the client into
  developer mode.

Unset the variable and the account stops existing (the seeded row remains, but
no session can be opened with the code, because the team is only created from
the env value).

## The sandbox panel

While signed in as the dev team, a floating **DEV** button sits bottom-left.
It opens the sandbox panel:

- **Acts** — jump to any act, no completion gates. Intros do not auto-play for
  dev sessions; use *Tools → Replay act intro*.
- **Rooms** — jump to any of the 14 rooms at any time, across acts. The room is
  parked server-side (`flags.devRoom`), so the jump survives a reload. Room
  tabs and travel restrictions do not apply to dev sessions, and every hotspot
  in a room is visible regardless of act or requirements.
- **Clues** — the full clue registry with toggles per clue, plus
  *Reveal everything* / *Clear everything*.
- **Puzzles** — the full puzzle registry with toggles per puzzle and the answer
  keys shown inline (answers never leave the server for normal sessions).
- **Tools** — replay the act intro/outro, set penalties, reset the sandbox
  (act 0, clean save, dev flags kept), and inspect the raw state.

## The dev API

All routes are hard-scoped to a dev session; a normal team (or the admin
cookie) cannot call them. They edit the dev team's own save.

| Route | Body | Effect |
| --- | --- | --- |
| `GET /api/dev/catalog` | — | acts, rooms, clues, puzzles + answers |
| `POST /api/dev/act` | `{ act }` | jump to any act |
| `POST /api/dev/room` | `{ room }` | park the room the client opens next |
| `POST /api/dev/toggle` | `{ kind: 'clue'\|'puzzle', id, on }` | toggle one item (puzzle grants cascade) |
| `POST /api/dev/bulk` | `{ mode: 'all'\|'none' }` | reveal or clear everything |
| `POST /api/dev/reset` | — | act 0, clean save, dev flags kept |
| `POST /api/dev/penalties` | `{ value }` | set the penalty count |

## Local development

Add the code to your local env file and run the dev server as usual:

```
DEV_TEAM_CODE=DEV-ARENA-9F4K-2Q7Z
```

The dev team is seeded on boot alongside the other team codes.
