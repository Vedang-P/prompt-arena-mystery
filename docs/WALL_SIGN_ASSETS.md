# Wall Sign Assets — Generation Plan

All wall signs in the story are **procedurally drawn in code** (canvas textures), not stored as
image files. This document lists every sign, the exact text on it, the style, the required aspect
ratio, and the exact filename to save the replacement image under.

**Save all generated images into:**

```
prompt-arena-mystery/client/public/assets/signs/
```

Once the folder is populated, the `WallSign` component will be rewired to load these textures
(center-cropped to each 3D plane's aspect ratio). Do **not** edit anything in `dist/` — it is
regenerated from `public/` on build.

---

## 1. Master prompt template

Use this for every sign. Replace only the `[BRACKETS]` fields. Generate one image per prompt.

```
Design a signboard texture for a 3D video game — a worn, hand-painted Indian
signboard, photographed dead flat, front-on, filling the entire frame edge to
edge. No wall, no room, no perspective, no drop shadow, no glare, no
watermark, no people.

Board style: [STYLE]
Text on the board, spelled EXACTLY as written, all capitals, centered:
  Line 1 (large): [TITLE]
  [Line 2 (medium): SUBS]
Lettering: bold hand-painted signboard letterwork with slightly rounded brush
letterforms. Thin hand-painted pinstripe border just inside the board edge.

Composition: [LANDSCAPE 3:2 / PORTRAIT 2:3 / SQUARE] image. Lettering centered
horizontally and vertically in the middle band. Keep the top and bottom
quarters of the image as clean flat paint only (they may be cropped later).
All lettering large enough to stay legible after cropping.

Mood: aged enamel / painted-metal texture, faint scratches, slightly chipped
paint at the edges, evenly lit, no harsh reflections.
```

### Style variants

| Var | Description |
|-----|-------------|
| **V1** | Deep teal-green enamel paint (#182d30) with warm gold lettering (#e2c78e) |
| **V2** | Very deep blue-teal paint (#21343d) with soft pale-gold lettering (#d8c08c) |
| **V3** | Dark oxblood-brown paint (#3b2830) with gold lettering |
| **V4** | Warm off-white board (#e1ded2) with faded medical red lettering (#9c302c) |
| **V5** | Sun-bleached brown board (#68583e) with tan lettering (#d9c9a2) |
| **V6** | Cream metal number plate (#dddac8) with black lettering (#1b2325), embossed |

### Generation formats

| Code | Meaning |
|------|---------|
| **L** | Landscape 3:2 |
| **P** | Portrait 2:3 |
| **S** | Square 1:1 |

Generate at the largest size your model allows (≥ 1024 px on the long side), PNG preferred.

---

## 2. Fully written example (for `sign_cyber_cafe.png`)

> Design a signboard texture for a 3D video game — a worn, hand-painted Indian shop signboard,
> photographed dead flat, front-on, filling the entire frame edge to edge. No wall, no room, no
> perspective, no drop shadow, no glare, no watermark, no people.
> Board style: deep teal-green enamel paint (hex #182d30) with warm gold hand-painted lettering
> (#e2c78e), subtle aged texture, faint scratches and chipped paint at the edges.
> Text on the board, spelled EXACTLY as written, all capitals, centered —
> Line 1 (large): RAMU'S CYBER CAFÉ. Line 2 (medium): INTERNET • PRINTING • SCANNING.
> Lettering: bold hand-painted signboard letterwork with slightly rounded brush letterforms;
> a thin hand-painted gold pinstripe border just inside the board edge.
> Composition: landscape 3:2 image, lettering centered horizontally and vertically in the middle
> band; keep the top and bottom quarters clean flat teal paint only, since they may be cropped.
> All lettering large enough to stay legible after cropping.
> Mood: aged enamel texture, evenly lit, no harsh reflections.

---

## 3. RAMU'S CYBER CAFE

| File name | Style | Format | Exact text |
|-----------|-------|--------|------------|
| `sign_cyber_cafe.png` | V1 | L | **RAMU'S CYBER CAFÉ** / INTERNET • PRINTING • SCANNING |
| `sign_dosa_menu.png` | V1 | L | **DOSA CORNER** / PLAIN DOSA ₹40 · MASALA DOSA ₹60 |
| `sign_house_rules.png` | V1 | L | **HOUSE RULES** / SAVE YOUR WORK · ASK RAMU FOR HELP |
| `sign_dosa_batter.png` | V1 | L | **RAMU'S DOSA CORNER** / FRESH BATTER • FILTER COFFEE |
| `sign_cafe_seating.png` | V1 | L | **CAFÉ SEATING** / PLEASE TAKE A TABLE |
| `sign_ramu_plaque_01.png` | V2 | L | **RAMU / 01** / INTERNET • PRINT • SCAN |
| `sign_ramu_plaque_02.png` | V2 | L | **RAMU / 02** / INTERNET • PRINT • SCAN |
| `sign_ramu_plaque_03.png` | V2 | L | **RAMU / 03** / INTERNET • PRINT • SCAN |

---

## 4. Sameer's Room · Parth's Room · Parth's House

| File name | Room | Style | Format | Exact text |
|-----------|------|-------|--------|------------|
| `sign_stay_curious.png` | Sameer's room | V2 | P | **STAY CURIOUS** / LOOK CLOSER · QUESTION EVERYTHING |
| `sign_apogee_poster.png` | Sameer's room | V3 | P | **APOGEE** / LIVE IN CONCERT |
| `sign_apogee_2019.png` | Parth's room | V2 | L | **APOGEE / 2019** / FIRST SHOW • FRONT ROW |
| `sign_moons_dark_side.png` | Parth's room | V2 | L | **THE MOON'S DARK SIDE** / NOT EVERYTHING IS AS IT SEEMS |
| `sign_our_family.png` | Parth's house | V1 | L | **OUR FAMILY** / A HOME FULL OF MEMORIES |
| `sign_parth.png` | Parth's house | V1 | L | **PARTH** (no sub-line) |

---

## 5. Police Station · Abandoned Field

| File name | Room | Style | Format | Exact text |
|-----------|------|-------|--------|------------|
| `sign_duty_officer.png` | Police station | V1 | L | **DUTY OFFICER** (no sub-line) |
| `sign_public_assistance.png` | Police station | V1 | L | **PUBLIC ASSISTANCE** / WAIT HERE FOR THE DUTY OFFICER |
| `plate_ka01oc1808.png` | Abandoned field (car) | V6 | L | **KA01OC1808** (no sub-line) |
| `sign_private_land.png` | Abandoned field | V5 | L | **PRIVATE LAND** / NO ENTRY AFTER DARK |

---

## 6. Concert · Service Yard · Workshop

| File name | Room | Style | Format | Exact text |
|-----------|------|-------|--------|------------|
| `banner_apogee_stage.png` | Concert | V2 | L | **APOGEE** / LIVE / A PERIGEE EVENT |
| `sign_backstage.png` | Concert | V1 | L | **BACKSTAGE** / PASS HOLDERS ONLY |
| `sign_member_registration.png` | Concert | V1 | L | **PERIGEE** / MEMBER REGISTRATION |
| `sign_shashdhar_ems.png` | Service yard (van) | V4 | L | **SHASHDHAR EMS** / EMERGENCY RESPONSE |
| `sign_service_yard.png` | Service yard | V2 | L | **APOGEE / SERVICE YARD** / STAFF & VEHICLES ONLY |
| `sign_perigee_workshop.png` | Workshop | V1 | L | **PERIGEE / NIGHT SKY** / LOOK UP. THERE IS MORE TO SEE. |

---

## 7. Perigee NGO HQ · Archive

| File name | Room | Style | Format | Exact text |
|-----------|------|-------|--------|------------|
| `sign_perigee_foundation.png` | NGO HQ | V1 | L | **PERIGEE FOUNDATION** / REACH BEYOND THE ORDINARY |
| `sign_programmes.png` | NGO HQ | V1 | L | **PROGRAMMES** / NIGHT SKY WORKSHOPS · COMMUNITY OUTREACH |
| `sign_membership.png` | NGO HQ | V1 | L | **MEMBERSHIP** / REGISTER AT RECEPTION · STAFF ACCESS BEYOND THIS POINT |
| `door_archive_staff.png` | NGO HQ (door) | V1 | L | **ARCHIVE / STAFF ONLY** |
| `sign_records_01.png` | Archive (shelf 1) | V1 | L | **RECORDS / 01** |
| `sign_records_02.png` | Archive (shelf 2) | V1 | L | **RECORDS / 02** |
| `sign_records_03.png` | Archive (shelf 3) | V1 | L | **RECORDS / 03** |
| `sign_records_04.png` | Archive (shelf 4) | V1 | L | **RECORDS / 04** |
| `sign_records_05.png` | Archive (shelf 5) | V1 | L | **RECORDS / 05** |
| `sign_archive_policy.png` | Archive | V1 | L | **ARCHIVE POLICY** / NO RECORDS LEAVE THIS ROOM |

---

## 8. Hospital · Ending · Loading Bay · Offices

| File name | Room | Style | Format | Exact text |
|-----------|------|-------|--------|------------|
| `sign_hospital_ward.png` | Hospital | V2 | L | **SHASHDHAR HOSPITAL** / WARD 03 / RESTRICTED ACCESS |
| `sign_perigee_ascension.png` | Hospital (ritual) | V3 | L | **PERIGEE** / THE ASCENSION |
| `sign_ward03_corridor.png` | Hospital | V1 | L | **WARD 03** / KEEP THE CORRIDOR CLEAR |
| `sign_security.png` | Hospital | V1 | L | **SECURITY** / AUTHORISED STAFF ONLY |
| `door_service_access.png` | Hospital (door) | V1 | L | **SERVICE ACCESS** |
| `door_operating_theatre.png` | Hospital (door) | V1 | L | **OPERATING THEATRE** |
| `door_stair_b.png` | Hospital ending (door) | V1 | L | **STAIR B / ROOF ACCESS** |
| `door_ward03_restricted.png` | Hospital ending (door) | V1 | L | **WARD 03 / RESTRICTED ACCESS** |
| `sign_loading_bay.png` | Loading bay | V1 | L | **SHASHDHAR / LOADING BAY** |
| `sign_sealed_medical.png` | Loading bay | V2 | L | **SEALED MEDICAL SUPPLIES** |
| `sign_lua_pharma.png` | Loading bay | V1 | L | **LUA PHARMACEUTICALS** / SEALED SHIPMENTS · LOG EVERY TRANSFER |
| `door_service_lift.png` | Loading bay (door) | V1 | L | **SERVICE LIFT / STAFF** |
| `sign_director_tanush.png` | Tanush's office | V3 | L | **PERIGEE / DIRECTOR** / TANUSH |
| `sign_this_week.png` | Tanush's office | V1 | S | **THIS WEEK** / THURSDAY / HOSPITAL · SATURDAY / WORKSHOP |
| `door_private_office.png` | Tanush's office (door) | V1 | L | **PRIVATE OFFICE** |
| `sign_perigee_higher.png` | Enakshi's house | V3 | L | **PERIGEE FOUNDATION** / A HIGHER PURPOSE |
| `door_private.png` | Enakshi's house (door) | V1 | L | **PRIVATE** |

---

## 9. Optional — existing image files to upgrade in place

These already exist as image files. To upgrade them, overwrite with the same filename (or a
higher-res replacement) — no code change needed.

| Current file | Content |
|--------------|---------|
| `client/public/assets/signs/police.svg` | CENTRAL POLICE STATION / PUBLIC ASSISTANCE · DUTY OFFICER |
| `client/public/assets/signs/noticeboard.svg` | PUBLIC NOTICE BOARD |
| `client/public/assets/signs/duty.svg` | DUTY ROSTER |
| `client/public/assets/pictures/evidence_gone_poster.jpg` | "Gone" missing poster |
| `client/public/assets/signs/perigee_emblem.png` *(new, optional)* | Gold circular Perigee logo, flat front-on — replaces the geometric disc in NGO HQ |

---

## 10. Practical tips

1. **Spelling**: image models frequently misspell text. Keep regenerating until the spelling
   matches exactly, especially for longer lines (`MASALA DOSA ₹60`, `AUTHORISED STAFF ONLY`, …).
2. **Plan B (recommended for long text)**: generate the boards *blank* (same style, no text) and
   the exact text will be overlaid as crisp vector/raster text — sharper and always correct.
3. **Margins matter**: keep the top/bottom quarters of the image as flat paint. The images are
   center-cropped to each 3D plane's real aspect ratio in code, so no distortion and no lost
   lettering.
4. **Filenames**: keep them exactly as listed (snake_case). They map 1:1 to code changes.
5. **Don't touch `dist/`** — it regenerates from `public/` at build time.

---

## Appendix A — Source of truth in code

Everything is currently rendered by the `WallSign` component (canvas → `CanvasTexture` → plane):

- `client/src/EnvironmentDetails.jsx:78` — `WallSign` definition (default green #182d30 / gold #e2c78e)
- `client/src/EnvironmentDetails.jsx:105` — RAMU desk plaques (`ComputerStation`)
- `client/src/Scene.jsx:1372` — `DoorOpening` (renders door label signs at line 1378)
- Room-to-sign map: see `ROOM_KITS` at `client/src/Scene.jsx:1383`

### Placement map (Scene.jsx line → asset)

| Line | Room | Asset file |
|------|------|------------|
| 829 | `parth_home` | `sign_our_family.png` |
| 852 | `parth_home` | `sign_parth.png` |
| 880 | `police_station` | `sign_duty_officer.png` |
| 881 | `police_station` | `sign_public_assistance.png` |
| 918 | `sameer_room` | `sign_stay_curious.png` |
| 919 | `sameer_room` | `sign_apogee_poster.png` |
| 946 | `parth_room` | `sign_apogee_2019.png` |
| 948 | `parth_room` | `sign_moons_dark_side.png` |
| 971 | `abandoned_field` | `plate_ka01oc1808.png` |
| 987 | `abandoned_field` | `sign_private_land.png` |
| 996 | `cyber_cafe` | `sign_ramu_plaque_01/02/03.png` (3 stations) |
| 1008 | `cyber_cafe` | `sign_cafe_seating.png` |
| 1025 | `cyber_cafe` | `sign_cyber_cafe.png` |
| 1026 | `cyber_cafe` | `sign_dosa_menu.png` |
| 1027 | `cyber_cafe` | `sign_house_rules.png` |
| 1028 | `cyber_cafe` | `sign_dosa_batter.png` |
| 1049 | `concert` | `banner_apogee_stage.png` |
| 1067 | `concert` | `sign_backstage.png` |
| 1068 | `concert` | `sign_member_registration.png` |
| 1090 | service yard | `sign_shashdhar_ems.png` |
| 1099 | service yard | `sign_service_yard.png` |
| 1128 | `workshop` | `sign_perigee_workshop.png` |
| 1141 | `ngo_hq` | `sign_perigee_foundation.png` |
| 1152 | `ngo_hq` | `sign_programmes.png` |
| 1153 | `ngo_hq` | `sign_membership.png` |
| 1154 | `ngo_hq` (door) | `door_archive_staff.png` |
| 1164 | `ngo_archive` | `sign_records_01..05.png` (5 shelves) |
| 1175 | `ngo_archive` | `sign_archive_policy.png` |
| 1189 | `hospital` | `sign_hospital_ward.png` |
| 1190 | `hospital` (door) | `door_service_access.png` |
| 1191 | `hospital` (door) | `door_operating_theatre.png` |
| 1207 | `hospital` (ritual) | `sign_perigee_ascension.png` |
| 1210 | `hospital` | `sign_ward03_corridor.png` |
| 1211 | `hospital` | `sign_security.png` |
| 1267 | hospital ending (door) | `door_stair_b.png` |
| 1268 | hospital ending (door) | `door_ward03_restricted.png` |
| 1285 | loading bay | `sign_loading_bay.png` |
| 1286 | loading bay (door) | `door_service_lift.png` |
| 1298 | loading bay | `sign_sealed_medical.png` |
| 1308 | loading bay | `sign_lua_pharma.png` |
| 1337 | `tanush_office` | `sign_director_tanush.png` |
| 1338 | `tanush_office` | `sign_this_week.png` |
| 1339 | `tanush_office` (door) | `door_private_office.png` |
| 1364 | `enakshi_house` | `sign_perigee_higher.png` |
| 1365 | `enakshi_house` (door) | `door_private.png` |

---

## Appendix B — Checklist (51 new files)

- [ ] `sign_cyber_cafe.png`
- [ ] `sign_dosa_menu.png`
- [ ] `sign_house_rules.png`
- [ ] `sign_dosa_batter.png`
- [ ] `sign_cafe_seating.png`
- [ ] `sign_ramu_plaque_01.png`
- [ ] `sign_ramu_plaque_02.png`
- [ ] `sign_ramu_plaque_03.png`
- [ ] `sign_stay_curious.png`
- [ ] `sign_apogee_poster.png`
- [ ] `sign_apogee_2019.png`
- [ ] `sign_moons_dark_side.png`
- [ ] `sign_our_family.png`
- [ ] `sign_parth.png`
- [ ] `sign_duty_officer.png`
- [ ] `sign_public_assistance.png`
- [ ] `plate_ka01oc1808.png`
- [ ] `sign_private_land.png`
- [ ] `banner_apogee_stage.png`
- [ ] `sign_backstage.png`
- [ ] `sign_member_registration.png`
- [ ] `sign_shashdhar_ems.png`
- [ ] `sign_service_yard.png`
- [ ] `sign_perigee_workshop.png`
- [ ] `sign_perigee_foundation.png`
- [ ] `sign_programmes.png`
- [ ] `sign_membership.png`
- [ ] `door_archive_staff.png`
- [ ] `sign_records_01.png`
- [ ] `sign_records_02.png`
- [ ] `sign_records_03.png`
- [ ] `sign_records_04.png`
- [ ] `sign_records_05.png`
- [ ] `sign_archive_policy.png`
- [ ] `sign_hospital_ward.png`
- [ ] `sign_perigee_ascension.png`
- [ ] `sign_ward03_corridor.png`
- [ ] `sign_security.png`
- [ ] `door_service_access.png`
- [ ] `door_operating_theatre.png`
- [ ] `door_stair_b.png`
- [ ] `door_ward03_restricted.png`
- [ ] `sign_loading_bay.png`
- [ ] `sign_sealed_medical.png`
- [ ] `sign_lua_pharma.png`
- [ ] `door_service_lift.png`
- [ ] `sign_director_tanush.png`
- [ ] `sign_this_week.png`
- [ ] `door_private_office.png`
- [ ] `sign_perigee_higher.png`
- [ ] `door_private.png`
