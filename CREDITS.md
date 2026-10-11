# Credits

Assets are CC0 unless a different license is listed below. Source and license records for the
prepared Poly Haven props are also shipped in `client/public/assets/detail/polyhaven-sources.json`.

## 3D characters

- **Microsoft Rocketbox Characters** — MIT License
  https://github.com/microsoft/Microsoft-Rocketbox
  Used: the nine textured campaign actors under `client/public/assets/cast/`, including Ramu
  (Male_Adult_15). The original meshes and textures are prepared and retargeted with Blender;
  no character geometry is authored for the game.

## 3D furniture and props

- **Furniture Kit** — Kenney (kenney.nl), CC0 1.0
  https://kenney.nl/assets/furniture-kit
  Used: the two rug models in `client/public/assets/furniture/`. All other furnishings
  remap to the finished Poly Haven/Innerscene detail assets below.

## Environment

- **Ballroom HDRI** — Poly Haven (polyhaven.com), CC0
  https://polyhaven.com/a/ballroom
  Used: `client/public/assets/env/ballroom_2k.hdr` (2K HDR for image-based lighting).

- **Herringbone Parquet** — Poly Haven, CC0
  https://polyhaven.com/a/herringbone_parquet
  Used: floor diffuse + roughness maps at 1K.

- **Grey Plaster 02** — Poly Haven, CC0
  https://polyhaven.com/a/grey_plaster_02
  Used: wall diffuse map at 1K.

## Tooling

- **blender-mcp** — ahujasid (github.com/ahujasid/blender-mcp), MIT
  MCP server + Blender addon used for headless asset tooling. Addon copy in
  `scripts/blender/blender_mcp_addon.py`.
