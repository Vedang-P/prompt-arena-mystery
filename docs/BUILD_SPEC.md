# Build Spec — "The Moon's Dark Side" full game

Note: the parallel build is finished. Storage now lives in `lib/vercel-env.js`
(Postgres DDL + local SQLite) and `schema.sql`/`seed.sql` no longer exist; the
cinematic renderer is `client/src/Cinema3D.jsx`. The rest of this document is a
historical record of the workstream contract.

Frozen interface contract for the parallel build. The story source of truth is
`docs/FINAL_SCRIPT.md` (Acts 0–8). The registry below is FROZEN: do not invent new
act/room/puzzle/clue ids. If something is missing, reuse the nearest id and note it.

Existing behavior that must keep working: interrogation (`/api/interrogate`), accusations
(`/api/accuse`), clue discovery (`/api/clues/:id/discover`), engine fixture tests
(`case/test.yaml` + `scripts/test-engine.mjs`), `npm run build:case`, `npm run build`.

## 1. File ownership (do not edit files you do not own)

| Workstream | Owns |
| --- | --- |
| W1 case acts 0–2 | `case/parts/acts-0-2.yaml` |
| W2 case acts 3–5 | `case/parts/acts-3-5.yaml` |
| W3 case acts 6–8 | `case/parts/acts-6-8.yaml` |
| W4 engine+compiler | `scripts/build-case.mjs`, `src/engine.js`, `scripts/test-engine.mjs` |
| W5 worker+db | `src/worker.js`, `schema.sql`, `seed.sql` |
| W6 client UI | `client/src/App.jsx`, `client/src/Panels.jsx`, `client/src/api.js`, `client/src/styles.css`, `client/src/main.jsx` |
| W7 client scene | `client/src/Scene.jsx`, `client/src/styles-scene.css` |
| W8 cinematics | `client/src/Cinema.jsx`, `client/src/ActDirector.jsx`, `client/src/styles-cinema.css`, `scripts/shot.mjs` |

Shared/read-only: `case/parts/base.yaml` (already frozen), `scripts/merge-case.mjs` (already
frozen), `package.json`, `docs/FINAL_SCRIPT.md`, `docs/BUILD_SPEC.md`.

The case is authored as fragments in `case/parts/*.yaml` and merged by
`npm run merge:case` into `case/main.yaml` (generated). Never edit `case/main.yaml`.

Merge semantics: mappings deep-merge; lists of objects merge by `id` (their nested lists
deep-merge too); scalar lists concat+dedupe; `canonical_qa` concatenates.

## 2. Case schema v2

```yaml
title: string
subtitle: string
solution: { culprit: character_id, method: string, motive: string, required_clues: [clue_id] }

acts:
  - id: act0..act8
    type: cinematic | interactive
    kicker: "Act I"            # shown on title cards
    title: string
    subtitle: string           # endcard line (cinematics)
    scenes: [room_id]          # cinematic: scenes used by its beats
    beats:                     # cinematic: unchanged from current act0 format
      - { id, room, shot, seconds, overlay?, cast?: [{character, at: [x,z], rot?, pose?}],
          lines: [{ speaker, text }] }
    entry_room: room_id        # interactive
    rooms: [room_id, ...]      # interactive: rooms available this act (tab list)
    objective: string          # interactive: objective line
    intro: [ { speaker, text } ]   # optional, played before the act's first room view
    outro: [ { speaker, text } ]   # optional, played when advancing
    complete: { clues: [clue_id], puzzles: [puzzle_id] }   # gate to "Advance act"

rooms:
  - id: string
    name: string
    scene: scene_id            # drives the 3D room kit / backdrop
    hotspots:
      - { id, type: clue, clue: clue_id, label, position: [x,y,z] }
      - { id, type: character, character: character_id, label, position: [x,y,z] }
      - { id, type: puzzle, puzzle: puzzle_id, label, position: [x,y,z] }
      - { id, type: travel, to: room_id, label, position: [x,y,z] }
        # all hotspot types accept: requires: { clues: [], puzzles: [] }

characters:                    # same as before (persona/goals/facts/deflections/snubs)
clues:
  - { id, name, description, page?, grants: [fact_id], requires: [clue_id] }
    # page: optional asset path shown in the evidence panel
puzzles:
  - id: p_...
    kind: text | choice | code | email
    prompt: string             # the question exactly as the player sees it
    hint: string?              # optional
    evidence: string?          # optional asset path (e.g. /assets/pictures/evidence_diary_morse.jpg)
    options: [string]          # choice only
    answers: [string]          # accepted answers; text/code normalized case/punct/space
                               # choice answers must equal an option string (or its letter)
    success: string            # narrative shown on the correct answer
    grants: [clue_id]          # clues granted when solved correctly
    requires: { clues: [], puzzles: [] }
    penalty: number            # default 0; penalty added on wrong answer
    fail_message: string?      # shown on wrong answer
    continue_on_fail: false    # true: wrong answer ALSO marks the puzzle solved
    fail_grants: [clue_id]     # clues granted when continue_on_fail fires
    option_endings: { "Stop": ending_cult }   # choice option -> endings id (ends the run)
endings:
  - { id, title, body }
canonical_qa: [{ character, q, a }]
```

Validation (W4 extends `scripts/build-case.mjs`): unique ids; hotspot refs valid; puzzle
refs valid; `grants`/`requires` refer to existing clues/puzzles; `option_endings` refer to
existing endings; `acts[].complete` refs valid; `acts[].rooms`/`entry_room` valid; travel
`to` valid; all clues placed in at least one hotspot OR granted by a puzzle; reachability
must treat puzzle `requires` as gating; dead-content warnings count puzzle grants/requires.

## 3. Frozen registry

### Acts
| id | type | title | entry | rooms | complete |
| --- | --- | --- | --- | --- | --- |
| act0 | cinematic | The Vanishing | — | — | — |
| act1 | interactive | The Room | parth_room | parth_room | puzzles: [p_laptop] |
| act2 | interactive | Full Moon | sameer_room | sameer_room, gazebo, abandoned_field, cyber_cafe, parth_home | puzzles: [p_ticket] |
| act3 | interactive | The Concert | concert | concert, workshop, ngo_hq, ngo_archive, sameer_room | puzzles: [p_delve] |
| act4 | interactive | Shashdhar | sameer_room | sameer_room, hospital | puzzles: [p_parth_alive] |
| act5 | interactive | The Big Bad | tanush_office | tanush_office, enakshi_house, sameer_room | puzzles: [p_exposed] |
| act6 | interactive | Poornima | sameer_room | sameer_room, hospital, police_station | puzzles: [p_police_video] |
| act7 | interactive | The Mask | sameer_room | sameer_room, hospital, enakshi_house | puzzles: [p_floor] |
| act8 | interactive | The Revelation | hospital | hospital, tanush_office | puzzles: [p_why, p_where, p_wrong] |

Commands: `kicker` "Act 0".."Act VIII". Act 0 keeps its existing scenes/beats (fix text
per the final script: "Sameer pleaded", mother line, "And then he ran off. Weird.").

### Rooms
gazebo "The Park Gazebo"; parth_home "Parth's House"; police_station "Police Station";
sameer_room "Sameer's Room"; parth_room "Parth's Room"; abandoned_field "The Abandoned
Field"; cyber_cafe "Ramu's Cyber Cafe"; concert "The Concert"; workshop "Night Sky
Workshop"; ngo_hq "Perigee Headquarters"; ngo_archive "The Archive Room"; hospital
"Shashdhar Hospital"; tanush_office "The Corner Office"; enakshi_house "Enakshi's House".
Each room's `scene` equals its id.

### Characters
sameer, parth, mother, officer, veer, enakshi, tanush, leader (plus pseudos narrator/voice
allowed in lines). Character hotspots: mother (parth_home, act2), veer (concert act3,
sameer_room act7), officer (police_station act6). Give mother/officer/veer small fact sets
gated by clues (e.g. mother: c_videos; officer: c_reports; veer: c_apogee) so the legacy
interrogation system stays grounded. `canonical_qa` entries for the scripted dialogue.

### Clues → placement/grant
| clue | where (hotspot or grant) | requires | notes |
| --- | --- | --- | --- |
| c_diary | parth_room bookcase hotspot | — | leather diary, gold moon engraving |
| c_morse | grant of p_morse | — | the decoded line "OC1808 in laptop" |
| c_laptop_locked | parth_room laptop hotspot | — | hint on screen |
| c_laptop | grant of p_laptop | — | laptop open, folders visible |
| c_reports | parth_room laptop hotspot #2 | c_laptop | missing reports + gone poster + full-moon calendar |
| c_email | parth_room laptop hotspot #3 | c_reports | email to himself (this is what exposes him in act5) |
| c_coords | parth_room laptop hotspot #3 | c_reports | map coordinates -> the field |
| c_sedan | abandoned_field sedan hotspot | — | plate KA01OC1808 |
| c_backpack | abandoned_field backpack hotspot | c_sedan | cassettes |
| c_mixtape | grant of p_cassette | — | chanting, drums, scream |
| c_videos | parth_home albums hotspot | c_mixtape | young Parth & Vihaan, drums |
| c_cd | gazebo under-gazebo hotspot | p_voicenote2 | copper spiral CD |
| c_laptop_fried | fail_grants of p_cd_mode | — | motherboard fried |
| c_footage | grant of p_cd_mode (both paths) | — | dark ritual video, disfigured flesh |
| c_veer_profile | sameer_room Instalitre hotspot | c_footage | handle "Veer" |
| c_ticket | grant of p_ticket | — | normal ticket |
| c_perigee | concert host hotspot | — | "This concert is funded by The Perigee NGO" |
| c_backstage | concert fence hotspot | c_perigee | he jumps the fence |
| c_apogee | grant of p_band_name | — | band named after the NGO |
| c_workshop_address | grant of p_registration | — | Hutting, 3rd cross, DJ Halli |
| c_workshop | workshop snacks hotspot | — | open-field workshop, kids |
| c_hq | ngo_hq hall hotspot | — | the headquarters |
| c_records | grant of p_ascension | — | offeringRecords folder, .avi files, stopped 16-07-2020 |
| c_holy_blade | ngo_archive blade hotspot | c_records | carved box, "Holy Blade" image |
| c_veer_talk | ngo_archive wall hotspot | c_records | Veer + deep voice: Nishakara's arms |
| c_ambulance | grant of p_hide | — | man from the posters, struggling |
| c_janitor | hospital backdoor hotspot | — | uniform + mop |
| c_ritual | hospital theatre hotspot | c_janitor | incense, chanting, torture |
| c_cameras | grant of p_security_pin | — | security panel opens other rooms |
| c_parth_alive | grant of p_parth_alive | — | Parth is alive |
| c_drug_report | tanush_office desk hotspot | — | Tanush, Selenocide in the bloodstream |
| c_timetable | tanush_office calendar hotspot | — | meetings; Enakshi is online-only |
| c_assessments | tanush_office drawer hotspot | c_drug_report | aggression/empathy assessments |
| c_tablet_data | grant of p_knowledge | — | the cult tablet |
| c_handbook | grant of p_handbook | — | chants, holy blade maintenance, blood |
| c_enakshi | enakshi_house door hotspot | p_tablet | she lunges; the closet |
| c_recruits | grant of p_tablet_content | — | recruitment numbers + domains |
| c_finance | grant of p_tablet_content | — | donations: Lua Pharmaceuticals |
| c_voice3 | sameer_room voice note hotspot (act5) | p_connection | "Cats play with rats..." |
| c_pen_camera | grant of p_fullmoon | — | Parth's gift, recording |
| c_ritual2 | hospital crowd hotspot (act6) | c_pen_camera | wendigo masks, the Shiniest mask |
| c_sacrifice | hospital podium hotspot (act6) | p_box | the carving, the vial, the convulsion |
| c_parth_meet | hospital crowd hotspot #2 (act6) | c_sacrifice | he yanks Parth out |
| c_arrest | police_station lobby hotspot | c_parth_meet | "he murdered Ekanshi" |
| c_mask | grant of p_police_video | — | a wendigo mask on his bed |
| c_mask_owner | grant of p_mask_owner | — | only the Shiniest mask is decorated |
| c_lua_files | grant of p_lua | — | procurement, Nigeria shipments |
| c_article | grant of p_nigeria | — | the journalist's last article |
| c_trucks | hospital yard hotspot (act7) | p_continue | cargo into trucks |
| c_disguise | hospital lone-worker hotspot | c_trucks | knocked out, clothes taken |
| c_caught | grant of p_floor | — | the hand on his neck |
| c_veer_death | hospital stage hotspot (act8) | p_spiral | Veer's neck snaps |
| c_parth2 | hospital stage hotspot #2 (act8) | c_veer_death | Parth's hollow eyes |
| c_office | tanush_office hotspot (act8) | — | plush carpets, mahogany |

### Puzzles → answer keys (player-facing prompt is authored by W1–W3)
| id | kind | answer(s) | penalty | behavior |
| --- | --- | --- | --- | --- |
| p_morse | text | oc1808 | 0 | requires c_diary; grants c_morse; evidence diary_morse + decoder |
| p_laptop | code | oc1808 | 0 | requires c_morse; grants c_laptop |
| p_cassette | choice | Play it | 0 | options [Play it, Put it back]; requires c_backpack; grants c_mixtape |
| p_drums | text | cassette, the cassette, mixtape | 0 | requires c_videos |
| p_dosa | choice | Eat it | 0 | options [Eat it, Skip it]; fail_message "But he bought it ?" |
| p_voicenote2 | text | park, the park | 0 | riddle "Where we would go for a walk…"; grants nothing; gates c_cd |
| p_cd_mode | choice | Use the cyber cafe | 1 | options [Use my laptop, Use the cyber cafe]; continue_on_fail; fail_grants [c_laptop_fried]; grants c_footage |
| p_ticket | choice | Normal ticket | 1 | options [Normal ticket, Backstage ticket]; continue_on_fail; grants c_ticket |
| p_veer_1 | choice | No, but I have donated some money to them | 0 | options [Yes, I'm part of it, No, but I have donated some money to them] |
| p_veer_2 | choice | Foster scientific temper, empowering the youth | 0 | options [Foster scientific temper, empowering the youth, Teach astronomy to tourists] |
| p_band_name | text | apogee | 0 | grants c_apogee |
| p_registration | email | any email | 0 | grants c_workshop_address; placeholder "you@example.com" |
| p_fare | choice | 230 | 0 | options [100, 200, 230, Walk away] |
| p_ascension | code | ascension | 0 | grants c_records |
| p_hide | choice | Stay hidden | 1 | options [Run, Stay hidden]; continue_on_fail; grants c_ambulance |
| p_delve | choice | Yes | 5 | options [Yes, No]; retry on No |
| p_hospital | choice | Shashdhar Hospital | 2 | options [Vyadha Hospital, Shashdhar Hospital, BMC Hospital]; retry |
| p_security_pin | text | uvct, star | 0 | hint 'vykpmng vykpmng nkvvng ____'; success reveals twinkle twinkle little star |
| p_parth_alive | text | parth | 1 | prompt "It couldn't be, could it?"; grants c_parth_alive |
| p_tablet | code | 1607 | 0 | hint ties to 16-07-2020 |
| p_handbook | choice | Take it | 0 | options [Take it, Leave it]; grants c_handbook |
| p_knowledge | text | handbook, the handbook | 0 | grants c_tablet_data |
| p_tablet_content | choice | Chants, schedules, and holy blade maintenance | 0 | options [Chants, schedules, and holy blade maintenance, Lua Pharmaceuticals invoices, The full member list]; grants c_recruits + c_finance |
| p_connection | text | perigee, apogee, perigee and apogee | 0 | success notes the bonus for both |
| p_exposed | text | email, the email, sending the files to himself | 0 | requires p_connection; triggers c_voice3 |
| p_fullmoon | text | missing people, people going missing, disappearances | 0 | grants c_pen_camera |
| p_voice_hq | text | ngo headquarters, the headquarters, the ngo | 0 | requires c_ritual2 |
| p_tanush | text | tanush | 0 | requires p_voice_hq |
| p_box | text | holy blade, the holy blade, blade | 0 | requires p_tanush |
| p_tell | choice | Tell them everything | 1 | options [Tell them everything, Stay silent]; requires c_parth_meet |
| p_police_info | choice | Financial information, recruitment numbers, and domains | 0 | options [Financial information, recruitment numbers, and domains, The names of every member, The hospital's location] |
| p_police_where | text | ngo headquarters, the archive rooms, archive rooms in ngo headquarters | 0 | requires p_police_info |
| p_police_video | text | pen camera, the pen camera, pen camera recording | 0 | requires p_police_where; grants c_mask |
| p_mask_owner | text | the big bad, big bad, leader | 0 | requires c_mask; grants c_mask_owner |
| p_veer_mask | text | wendigo, wendigo mask, mask | 0 | requires p_mask_owner |
| p_lua | text | lua pharmaceuticals and selenocide, lua pharmaceuticals, selenocide | 0 | requires p_veer_mask; grants c_lua_files |
| p_nigeria | text | pamphlet, the pamphlet, ngo pamphlet | 0 | requires p_lua; grants c_article |
| p_continue | choice | Continue | 0 | options [Continue, Stop]; option_endings {Stop: ending_cult} |
| p_floor | text | third floor, 3rd floor, third, 3 | 0 | requires c_disguise; grants c_caught |
| p_refer | text | you, sameer, me | 0 | act8 |
| p_spiral | text | fibonacci, golden spiral, fibonacci spiral | 0 | act8 |
| p_years | text | 5, five, 5 years, five years | 0 | act8 |
| p_rooms | text | security room, the security room | 0 | act8 |
| p_why | text | to find parth, find parth | 0 | act8; required for complete |
| p_where | text | dead, parth is dead | 0 | act8; required for complete |
| p_wrong | text | lose, i would lose, game over | 0 | act8; required for complete |

Normalization: lowercase, strip punctuation, collapse whitespace. `email` kind accepts any
string matching /^[^@\s]+@[^@\s]+\.[^@\s]+$/. Choice accepts the option string or its
letter (A/B/C…).

## 4. Engine API (W4, `src/engine.js`)

Keep all existing exports. Add:

```js
publicPuzzle(puzzleId) -> { id, kind, prompt, hint, evidence, options, requires, solvedHint? }
solvePuzzle(puzzlesValue, discoveredValue, puzzleId, answer)
  -> { ok:false, error } | { ok:true, correct, alreadySolved, penalty, message,
       grants:[clueIds], discovered:[...], solvedPuzzles:[...], newlyUnlocked:[...],
       ending?: endingId, optionEndings? }
canAdvanceAct(solvedPuzzlesValue, discoveredValue, actId) -> { ok, missing: { clues, puzzles } }
publicEnding(endingId) -> { id, title, body }
```

`publicCase()` adds: `puzzles` (answers/option_endings stripped), `endings` (titles only),
per-act `kicker/rooms/intro/outro/complete`, room `hotspots` with requires + type
`puzzle`/`travel` (to), clue `page`. `answers`, `option_endings`, `grants`, fact text must
never leak to the client (`test-engine.mjs` asserts this).

## 5. Worker API (W5, `src/worker.js`)

DB (`schema.sql`): `progress` gains `solved_puzzles TEXT DEFAULT '[]'`, `penalties INTEGER
DEFAULT 0`, `ending TEXT`. Keep `db:local` + `seed.sql` working (PANDA-7K2).

- `GET /api/state` adds `solvedPuzzles`, `penalties`, `canAdvance` { ok, missing },
  `ending` (public ending or null), `score` = discovered + solvedPuzzles − penalties.
- `POST /api/puzzles/:id/solve` body `{ answer }` → engine.solvePuzzle; persists
  `solved_puzzles`/`penalties`; on `ending` sets `progress.ending` and `solved=1`; response
  mirrors engine result (never leaks accepted answers).
- `POST /api/act/complete`: for interactive acts, verify `canAdvanceAct`; 409
  `{ error:'act_locked', missing }` when unsatisfied; completing act8 sets
  `ending=ending_main`, `solved=1`. Cinematic acts unchanged.
- `/api/interrogate`, `/api/accuse`, `/api/clues/:id/discover`, `/api/leaderboard` keep
  working; leaderboard adds `penalties` and `puzzles_solved` columns.

## 6. Client contracts (W6 + W7 + W8)

`client/src/api.js` (W6) adds `solvePuzzle(id, answer)` -> POST above.

App (W6):
- Rooms tabs = `currentAct.rooms ?? state.rooms.map(r=>r.id)` mapped to rooms.
- Hotspots: `clue` -> existing notice; `puzzle` -> PuzzleModal (pass `state.solvedPuzzles`);
  `travel` -> `setRoomId(to)`; `character` -> existing dialogue.
- PuzzleModal: prompt, hint, evidence image, text/code/email input OR option buttons;
  shows success narrative / fail message; penalties toast; solved puzzles show a check in
  the Notebook.
- Act flow: when act changes and `act.intro` exists, play StoryOverlay once (per act id).
  HUD "Advance act" button visible when `state.canAdvance.ok`, plays `act.outro` then
  `completeAct(act.id)`. `?beat=` dev param and Act 0 behave as today.
- Ending: when `state.ending`, show EndingCard with title/body + score/penalties;
  `ending_main` copy ends with the "now disappear" ping.
- Login copy: keep. Demo code hint stays PANDA-7K2.

Panels (W6): `PuzzleModal`, `StoryOverlay`, `EndingCard`; extend `Notebook` with a
"Sleuthing" section (puzzles solved, penalties, current objective). `Notice` gains optional
`page` image.

Scene (W7): keep R3F; render one prop kit per room id (existing furniture GLBs + primitive
geometry; reuse the style of `Ballroom`/`Vestibule`). Add markers for hotspot types
`puzzle` (gold ring) and `travel` (doorway ring); dim solved puzzles. Accept new props
`onPuzzle`, `onTravel`, `solvedPuzzles`. Mobile-friendly camera unchanged.

Cinema/ActDirector (W8): `ActDirector` supports any cinematic act (kicker/title/endcard
from act fields, next act from props) and a `mode="story"` used for `intro`/`outro` lines
(no 3D; letterbox + optional backdrop `act.backdrop`); overlay `phone_voicenote` unchanged,
plus `overlay: "phone_voicenote"` on non-act0 beats. Add backdrop scenes for new cinematics
only if used; do not break existing act0 shots.

## 7. Verification

- W1–W3: `npm run merge:case && npm run build:case` must pass (validator errors are
  blockers). Story prose from `docs/FINAL_SCRIPT.md` must be preserved nearly verbatim in
  prompts/success/intro/outro text.
- W4: `npm run test:engine` (old + new tests) green; `test-engine.mjs` asserts no answer
  leakage.
- W5: `node --check src/worker.js`; schema/seed SQL parse; endpoints covered by engine
  unit tests where possible.
- W6–W8: `npx esbuild <file> --loader=jsx --outfile=NUL` parse check per edited file; do
  NOT run `vite build` in parallel (integration build happens once at the end).
- Everyone: read `docs/FINAL_SCRIPT.md` first; follow the existing code style; do not
  reformat unrelated code; no new dependencies.
