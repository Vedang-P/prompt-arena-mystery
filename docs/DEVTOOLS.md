# Developer tools

The game ships a full developer sandbox for building and testing quickly. It is
off by default: nothing exists until the `DEV_TEAM_CODE` environment variable is
set on the deployment.

## The dev account

Set `DEV_TEAM_CODE` (any secret string) and redeploy. On the next boot the
server seeds a team called **Dev Sandbox**:

- signs in with `POST /api/dev/login` and the code (the login screen exposes a
  "Developer sign-in" link when the variable is set; it is never part of the
  player-facing choice — guests and Google are all a player gets),
- is **excluded** from the leaderboard,
- never appears on the leaderboard (its progress flags carry `dev: true`),
- carries a `dev` flag on every state response, which switches the client into
  developer mode.

Unset the variable and the account stops existing (the seeded row remains, but
no session can be opened with the code, because the team is only created from
the env value).

## The sandbox panel

While signed in as the dev team, a floating **DEV** button sits bottom-left.
It opens the sandbox panel:

- **Acts** — jump to any act, back and forth, with no completion gates. Intros
  do not auto-play for dev sessions; use *Tools → Replay act intro*. An act
  jump also reopens a finished sandbox: any recorded ending or solve is
  cleared, so the jumped-to act is live and playable again.
- **Rooms** — jump to any of the 14 rooms at any time, across acts. The jump
  always wins over the story's framing: the room opens even from the prologue
  cinematic, the solved certificate or the ending card (the panel is available
  on all three). The room is parked server-side (`flags.devRoom`), so the jump
  survives a reload. Room tabs and travel restrictions do not apply to dev
  sessions, and every hotspot in a room is visible regardless of act or
  requirements. An act jump clears the parked room, so the new act opens on
  its own entry room. Reaching the run's ending (or a correct accusation)
  releases the parked room too, so the ending card and the certificate are
  never hidden behind a room the dev was inspecting.
- **Clues** — the full clue registry with toggles per clue, plus
  *Reveal everything* / *Clear everything*. On the server the dev session is
  ungated everywhere: clues discover with unmet requirements, puzzles solve
  outside their act, any character can be interviewed in any act, and acts
  complete without their checklists (the "Continue to next act" button is
  always offered).
- **Puzzles** — the full puzzle registry with toggles per puzzle and the answer
  keys shown inline (answers never leave the server for normal sessions).
- **Tools** — replay the act intro/outro, set penalties, reset the sandbox
  (act 0, clean save, dev flags kept), and inspect the raw state.

## The dev API

All routes are hard-scoped to a dev session; a normal team (or the admin
cookie) cannot call them. They edit the dev team's own save.

| Route | Body | Effect |
| --- | --- | --- |
| `POST /api/dev/login` | `{ code }` | open the dev session (404 when `DEV_TEAM_CODE` is unset, 401 on the wrong code) |
| `GET /api/dev/catalog` | — | acts, rooms, clues, puzzles + answers |
| `POST /api/dev/act` | `{ act }` | jump to any act; clears the parked room and any ending/solve |
| `POST /api/dev/room` | `{ room }` or `{ room: null }` | park the room the client opens next, or release the park |
| `POST /api/dev/toggle` | `{ kind: 'clue'\|'puzzle', id, on }` | toggle one item (puzzle grants cascade) |
| `POST /api/dev/bulk` | `{ mode: 'all'\|'none' }` | reveal or clear everything |
| `POST /api/dev/reset` | — | act 0, clean save, dev flags kept |
| `POST /api/dev/penalties` | `{ value }` | set the penalty count |

## Local development

The dev server already sets `DEV_TEAM_CODE=DEV-ARENA`, so run `dev:game` and
open the login screen's "Developer sign-in" link with that code. For a
production-like local run, add the code to your local env file:

```
DEV_TEAM_CODE=DEV-ARENA
```

The dev team is seeded on boot from that environment value; overriding it
aligns the seeded hash on the next boot, so an old code stops opening the
account.
