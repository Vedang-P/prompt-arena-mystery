import fs from 'node:fs/promises';
const parts={
 cargo_van:'high-roof-cargo-panel-van-c4d5145f',hand_truck:'carry-upright-hand-truck-721a2f19',chest:'keepsake-110-blanket-chest-3eecc62d',office_phone:'desk-call-office-phone-dbbf9f01',tablet:'draw-slate-graphics-tablet-904896fb',

 sedan_detailed:'graphite-four-door-sedan-eed96d12',backpack_person:'theo-3d-person-teenager-standing-with-backpack-a62b7955',floor_lamp:'reader-reading-floor-lamp-3d915761',filing_cabinet:'two-drawer-lateral-filing-cabinet-157adbfa',medical_cart:'three-shelf-medical-supply-cart-45cc326c',bedside_cabinet:'patient-bedside-cabinet-19c0b99c',mic_stand:'stage-boom-microphone-stand-295113fc',microphone:'stage-mic-dynamic-microphone-15858c66',synthesizer:'patch-voice-synthesizer-0b3e851c',drum_pad:'practice-pad-electronic-drum-pad-42fae9ea',

 monitor:'screen-one-all-in-one-computer-6bc2e4e0',keyboard:'key-grid-mechanical-keyboard-8503e99e',mouse:'palm-mouse-wireless-mouse-a9f5ed66',router:'router-twin-wi-fi-router-5bf2a400',printer:'page-one-laser-printer-242caf15',office_chair:'vector-ergonomic-office-chair-ae299d68',stairs:'straight-stair-with-rails-773dfc59',bed:'queen-bed-with-bedding-original-interior-furnishing-ea3bae95',curtains:'curtain-pair-open-original-interior-furnishing-8c8dbd3d',counter:'bar-counter-3-m-with-footrail-original-restaurant-furnishing-d94cb2c7',cup:'teacup-and-saucer-original-drink-vessel-1885975f',hospital_bed:'hospital-bed-flat-mattress-44fc9faf',nurse_station:'nurse-station-with-low-accessible-counter-ef78cf3d',privacy_curtain:'privacy-curtain-and-ceiling-track-0353bfbc',amplifier:'practice-combo-guitar-amplifier-4f32b685',stage_monitor:'stage-wedge-stage-monitor-2e117382',pencil_cup:'hex-pencil-cup-desk-accessory-ea9dcd87',
};
await fs.mkdir('.asset-cache/innerscene',{recursive:true});
const record=[];
for(const [id,slug] of Object.entries(parts)){
 const page=`https://www.innerscene.com/tools/library/3d-parts/${slug}`;
 let html;try{html=await fs.readFile(`.asset-cache/innerscene/${id}-source.html`,'utf8');}catch{}
 if(!html){await new Promise(r=>setTimeout(r,1500));const response=await fetch(page);if(!response.ok)throw Error(`Source page ${id}: ${response.status}`);html=await response.text();}
 if(!html.includes('CC0')||!html.toLowerCase().includes('original'))throw Error('License/source must be reviewed: '+id);
 await fs.writeFile(`.asset-cache/innerscene/${id}-source.html`,html);
 for(const ext of ['glb','step']){try{const bytes=await fs.readFile(`.asset-cache/innerscene/${id}.${ext}`);record.push({id,page,license:'CC0',format:ext,bytes:bytes.length});html=null;break;}catch{}}
 if(!html)continue;
 const links=[...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&'));
 const link=links.find(x=>/\/api\/library\/.+\/download/.test(x));if(!link)throw Error('Missing link '+id);
 const res=await fetch(new URL(link,page));if(!res.ok)throw Error(`${id} ${res.status}`);
 const bytes=Buffer.from(await res.arrayBuffer());const ext=bytes.subarray(0,4).toString()==='glTF'?'glb':bytes.subarray(0,13).toString().includes('ISO-10303')?'step':null;
 if(!ext)throw Error('Unsupported source format '+id);
 await fs.writeFile(`.asset-cache/innerscene/${id}.${ext}`,bytes);record.push({id,page,license:'CC0',format:ext,bytes:bytes.length});console.log('Ready',id,ext,bytes.length);
}
await fs.writeFile('client/public/assets/detail/innerscene-sources.json',JSON.stringify(record,null,2));
for(const id of ['aerial_grass_rock','brown_mud_leaves_01']){
 const meta=await(await fetch(`https://api.polyhaven.com/files/${id}`)).json();
 for(const[type,suffix]of [['Diffuse','diff'],['nor_gl','normal'],['Rough','rough']]){
  const r=await fetch(meta[type]['1k'].jpg.url);if(!r.ok)throw Error(`${id} ${r.status}`);
  await fs.writeFile(`client/public/assets/detail/${id}-${suffix}.jpg`,Buffer.from(await r.arrayBuffer()));
 }
}
