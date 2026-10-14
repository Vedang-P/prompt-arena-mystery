import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const BASE='http://127.0.0.1:5199';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
await fs.mkdir('.pa-verify-out',{recursive:true});
const jar=new Map();
const call=async(p,b)=>{const h={};if(jar.size)h.cookie=[...jar].map(([k,v])=>k+'='+v).join('; ');if(b!==undefined)h['content-type']='application/json';const r=await fetch(BASE+p,{method:b===undefined?'GET':'POST',headers:h,body:b===undefined?undefined:JSON.stringify(b)});for(const c of r.headers.getSetCookie()){const [n,v]=c.split(';')[0].split('=');jar.set(n,v);}console.log(p,r.status);return r.json().catch(()=>null);};
await call('/api/admin/login',{username:'admin',password:'arena-admin'});
let t=await call('/api/admin/teams',{name:'A8 Verify',code:'VERIFY-A8'});
if(t?.id){await call('/api/admin/teams/'+t.id+'/exempt',{exempt:true});await call('/api/admin/teams/'+t.id+'/stage',{act:'act8'});}
await call('/api/login',{code:'VERIFY-A8'});
const exe='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser=await puppeteer.launch({executablePath:exe,headless:true,args:['--window-size=1600,900','--enable-unsafe-swiftshader','--hide-scrollbars']});
for(const pid of ['p_escape','p_burn']){
  const page=await browser.newPage();await page.setViewport({width:1600,height:900});
  page.on('pageerror',e=>console.log('[pageerror]',e.message));
  for(const [n,v] of jar)await page.setCookie({name:n,value:v,domain:'127.0.0.1',path:'/'});
  await page.goto(BASE+'/play/?puzzle='+pid,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('.story-overlay.cinematic-story',{timeout:45000}).catch(()=>console.log(pid,'no overlay'));
  await page.waitForSelector('[data-scene-ready="true"]',{timeout:45000}).catch(()=>{});
  await sleep(4500);
  await page.screenshot({path:'.pa-verify-out/'+pid+'.png'});
  const label=await page.evaluate(()=>document.querySelector('.story-scene-title h2')?.textContent);
  console.log(pid,'title:',label);
  await page.close();
}
await browser.close();
if(t?.id)await call('/api/admin/teams/'+t.id+'/delete',{});
console.log('done');

