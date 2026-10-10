import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

// Original wardrobe and faces drawn directly into the rig's UV atlas.
// Geometry and animation are CC0 Kenney; these are the story's own characters.
const palettes = {
  sameer: { skin: '#aa7354', hair: '#25232a', shirt: '#33465b', pants: '#202735', collar: '#c3c9cb' },
  parth: { skin: '#bd8963', hair: '#29242b', shirt: '#743f45', pants: '#272b34', collar: '#cbb4a0' },
  mother: { skin: '#ae7b57', hair: '#332d30', shirt: '#306862', pants: '#254b48', collar: '#d2b47b' },
  officer: { skin: '#a66e4d', hair: '#27252a', shirt: '#9c8962', pants: '#766448', collar: '#ded1a7' },
  veer: { skin: '#9b694c', hair: '#2b2325', shirt: '#385258', pants: '#222733', collar: '#bac9bd' },
  enakshi: { skin: '#c0906d', hair: '#3a2927', shirt: '#685a79', pants: '#333141', collar: '#d8c4c5' },
  tanush: { skin: '#b98760', hair: '#3d3532', shirt: '#353e50', pants: '#272d3b', collar: '#e3ded4' },
  leader: { skin: '#a87857', hair: '#343032', shirt: '#533740', pants: '#392930', collar: '#bd9d64' },
};
const textures = new Map();
export function actorTexture(character) {
  if (textures.has(character)) return textures.get(character);
  const p = palettes[character] ?? palettes.tanush;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const c = canvas.getContext('2d');
  const rect = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
  rect(0, 0, 1024, 1024, p.skin);
  rect(0, 0, 480, 155, p.hair); rect(0, 0, 92, 243, p.hair); rect(290, 0, 190, 243, p.hair);
  // A little fringe; eyes and brows are deliberately understated.
  c.fillStyle = p.hair; c.beginPath(); c.moveTo(85, 145); c.lineTo(115, 177); c.lineTo(155, 145); c.lineTo(205, 161); c.lineTo(265, 137); c.lineTo(310, 154); c.lineTo(310, 120); c.lineTo(85, 120); c.fill();
  rect(151, 176, 27, 7, p.hair); rect(211, 176, 27, 7, p.hair);
  rect(157, 193, 14, 19, '#292831'); rect(217, 193, 14, 19, '#292831');
  rect(187, 211, 18, 9, '#8a593f'); rect(178, 235, 36, 5, '#624137');
  if (character === 'mother') { rect(192, 174, 7, 7, '#9f3547'); }
  if (['officer', 'tanush', 'leader'].includes(character)) rect(176, 225, 40, 5, p.hair);
  // Torso wrap, sleeves, cuffs, trouser legs and shoes.
  rect(0, 688, 480, 336, p.shirt); rect(480, 535, 544, 200, p.shirt);
  rect(544, 535, 96, 63, p.skin); rect(831, 535, 97, 63, p.skin);
  rect(480, 706, 544, 29, p.collar);
  rect(480, 784, 544, 240, p.pants); rect(480, 978, 544, 46, '#27252a');
  c.fillStyle = p.collar; c.beginPath(); c.moveTo(126, 784); c.lineTo(194, 821); c.lineTo(246, 784); c.lineTo(228, 782); c.lineTo(194, 805); c.lineTo(145, 782); c.fill();
  rect(189, 821, 7, 135, '#252934'); rect(0, 948, 480, 10, '#3b3030');
  for (const y of [835, 866, 897, 928]) rect(192, y, 5, 5, p.collar);
  if (character === 'officer') { rect(146, 844, 22, 27, '#c6ae70'); rect(224, 839, 33, 9, '#e2d9b8'); }
  if (character === 'tanush') { rect(187, 807, 12, 82, '#916c64'); }
  if (character === 'mother') { rect(216, 784, 38, 164, '#b39b64'); }
  const texture = new CanvasTexture(canvas); texture.flipY = false; texture.wrapS = texture.wrapT = RepeatWrapping; texture.colorSpace = SRGBColorSpace;
  textures.set(character, texture); return texture;
}
