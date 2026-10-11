# Prompt Arena asset credits

## Human cast and body animation

Microsoft Rocketbox, Copyright (c) 2020 Microsoft, MIT.
https://github.com/microsoft/Microsoft-Rocketbox

Sameer: Male_Adult_04. Parth: Male_Adult_12. Mother: Female_Adult_07.
Officer: Police_Male_01. Body motion: m_idle_breathe_01,
f_idle_breathe_01, m_sit_chair_breathe_01.
Veer: Male_Adult_17. Tanush: Male_Adult_08. Leader: Male_Adult_13.
Enakshi: Female_Adult_09. Ramu: Male_Adult_15. All nine named campaign
characters use Rocketbox rigs.
Original geometry/textures were downloaded, retargeted and exported using
Blender's Python API. No new character geometry was generated. Textures capped
at 1024px; unused facial shapes removed; WebP compression applied.
The required copyright/permission notice is in licenses/Microsoft-Rocketbox-MIT.txt.

## Park

Poly Haven, CC0: painted_wooden_bench, tree_small_02, street_lamp_02,
park_bench HDRI, grass_path_2 diffuse texture.
https://polyhaven.com/license
https://polyhaven.com/a/painted_wooden_bench
https://polyhaven.com/a/tree_small_02
https://polyhaven.com/a/street_lamp_02
https://polyhaven.com/a/park_bench
https://polyhaven.com/a/grass_path_2
Textures capped at 1024px. Tree mesh optimized in Blender; GLBs packed and
compressed for browser delivery. Bench scale adjusted to match the seated rig.
Tree LODs preserve separate foliage/trunk materials; distant trees use a lower
detail export of the same source. Lantern brackets mounted on gazebo columns.

Bryanston Park Sunrise HDRI: Dario Barresi, Poly Haven, CC0, 1k HDR.
https://polyhaven.com/a/bryanston_park_sunrise

Police station floor: Interior Tiles, Charlotte Baglioni, Poly Haven, CC0.
Diffuse, roughness and OpenGL normal textures at 1k.
https://polyhaven.com/a/interior_tiles
Station signs are original SVG graphics. Furniture origins, desk surfaces and
seat heights measured in Blender and used by shared scene placements.

Octagonal gazebo: Innerscene, CC0 original exterior model.
https://www.innerscene.com/tools/library/3d-parts/octagonal-gazebo-original-exterior-model-07eaba19

Retained secondary furnishings (rugs and small structural decorations): Kenney, CC0.
https://kenney.nl/assets/furniture-kit
https://kenney.nl/assets/blocky-characters

## Detailed environments

Finished Poly Haven CC0 models: sofas, armchairs, coffee/side tables, desks,
bookshelves and books, lamps, laptop, cassette player, clock, plants, stationery,
boxes, fence, vegetation, stones, litter, tyre, kettle, bowl, wheelchair,
clipboard, cash register, street light and dining table. Exact source URLs are
listed in detail/polyhaven-sources.json. Field terrain uses aerial_grass_rock
and brown_mud_leaves_01, Poly Haven CC0, with 1k PBR maps.
https://polyhaven.com/a/aerial_grass_rock
https://polyhaven.com/a/brown_mud_leaves_01

Finished Innerscene CC0 originals: sedan, imported backpack, staircase,
computer peripherals and furniture, bed, curtains, counter, tea cup, hospital
bed, nurse station, privacy curtain, medical cart, bedside cabinet, cargo van,
hand truck, chest, office phone, graphics tablet and concert equipment.
Individual original-model pages and license records are in
detail/innerscene-sources.json. The backpack retains only the backpack mesh
from the published teenager-with-backpack model; no new mesh was generated.
The staircase's published STEP geometry was converted to STL using CadQuery,
then prepared in Blender with its original rail geometry retained.

Telescope: retained pier, equatorial mount and refractor assembly from the
published Planetarium and Optical Observatory starter scene. Eyepiece case
and chart drawer are published models from the same pack, CC0.
https://3dassets.dev/packs/planetarium-and-optical-observatory
Exact source pages, download URLs and license records are in
detail/astronomy-sources.json. These published assets are identified by their
source as AI-generated; they were downloaded as finished models, not generated
for this project. Their original geometry was retained and normalized.

Preparation: scripts/download-scene-assets.mjs, download-interior-assets.mjs,
download-astronomy-assets.mjs, blender/prepare_scene_assets.py and
blender/extract_telescope.py. Blender normalizes metre scale, ground origins,
materials and texture sizes. Decimation reduces dense assets while preserving
recognizable forms. scripts/optimize-scene-assets.mjs applies WebP and Meshopt
compression without flattening rigs, animation, morphs or named modular parts.
detail/measurements.json records prepared bounds; contact tests decode the
actual shipped geometry. Room architecture, placement, signage and surface
material masks are authored scene code.

Ceiling Fan: Ulan Cabanilla, Poly Haven, CC0.
https://polyhaven.com/a/ceiling_fan
Official 1k glTF and textures packed into a GLB with Blender's Python API.
Original geometry retained. Sized to 1.5 metres across; ceiling mount and rotor
pivot normalized in Blender. Only the blade assembly rotates at runtime.

## Music

"Long Road Ahead B", "Darkest Child", and "Long Note Two"
Kevin MacLeod (incompetech.com).
Licensed under Creative Commons: By Attribution 3.0 License.
https://creativecommons.org/licenses/by/3.0/
https://incompetech.com/music/royalty-free/

Files transcoded to browser MP3s. Cue names: dusk, search, unknown.
Playback crossfades and ducks beneath speech; no music was generated.

## Environmental audio

Crickets: Ted Kerr / Wolfgang_, CC0, loopable 11.45-second night recording.
https://opengameart.org/content/crickets-ambient-noise-loopable
Wind: edited into a loop by AntumDeluge from the original field recording by
Jonathan Shaw (InspectorJ), CC BY 3.0.
https://opengameart.org/content/wind-loop
https://freesound.org/people/InspectorJ/sounds/376415/
Only the abandoned field uses these outdoor layers; they fade with the room,
duck under dialogue, respect the shared sound toggle and pause with cinematics.

## Campaign speech

227 unique authored lines recorded locally with Kokoro-82M v1.0, Apache 2.0.
https://huggingface.co/hexgrad/Kokoro-82M
https://github.com/hexgrad/kokoro
ONNX CPU inference via kokoro-onnx 0.6.1, MIT.
https://github.com/thewh1teagle/kokoro-onnx
Licenses: licenses/Kokoro-Apache-2.0.txt and licenses/Kokoro-ONNX-MIT.txt.
Narrator bm_george; Sameer am_puck; Parth am_fenrir; mother bf_emma;
officer am_onyx; unknown am_echo; Veer am_liam; Tanush bm_lewis;
leader am_michael; Enakshi af_bella. Stock voices, no voice cloning.
All Act 0 cues, every Act 1–8 opening/closing and finite authored dialogue
are covered. Recordings normalized to -18 LUFS / -2 dBTP and encoded as
24 kHz mono 80 kbps MP3. Mouth envelopes sampled at 20 Hz after encoding.
Content hashes in filenames prevent old cached speech from being replayed.
Em/en dashes and ellipses are normalized into spoken pauses while the original
subtitles are retained. Speech hashes invalidate obsolete takes after changes.
The ONNX model and voice tensors are build tools, never shipped to clients.
Rebuild with scripts/prepare-speech.mjs and scripts/record-campaign.py.

## Font

Inter, Rasmus Andersson, SIL Open Font License 1.1, bundled through Fontsource.
https://github.com/rsms/inter

