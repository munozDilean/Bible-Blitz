import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const base=process.env.GAME_BASE_URL||'http://127.0.0.1:8787';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Browser tests are local-only');
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
try{
 const contexts=await Promise.all([browser.newContext(),browser.newContext({viewport:{width:390,height:844}})]);
 const pages=await Promise.all(contexts.map(c=>c.newPage()));
 const [host,guest]=pages;const errors=[];
 for(const p of pages){p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{document.modelContext={registerTool(t,o){window.__gameTool=t;o.signal.addEventListener('abort',()=>{window.__gameTool=null})}}})}
 await host.goto(base);await host.getByLabel('Your name').fill('Browser host');
 await host.getByRole('button',{name:'Create a room',exact:true}).click();
 await host.getByRole('heading',{name:'Your people'}).waitFor();
 const code=await host.locator('.room-code strong').innerText();
 await guest.goto(base);await guest.getByLabel('Your name').fill('Browser guest');await guest.getByLabel('Room code').fill(code);
 await guest.getByRole('button',{name:'Join room',exact:true}).click();
 await guest.getByRole('heading',{name:'Your people'}).waitFor();
 await Promise.all(pages.map(p=>p.getByRole('button',{name:'I’m ready',exact:true}).click()));
 await host.getByRole('button',{name:'Start game',exact:true}).click();
 await Promise.all(pages.map(p=>p.locator('.question .answer').first().waitFor({timeout:20000})));
 assert.equal(await host.locator('.question .answer').count(),4);
 // Artificially delay acknowledgement delivery. Selection must not wait for it.
 await host.route('**/api/game',async route=>{
   const data=route.request().postDataJSON();
   if(data?.action==='answer'){const response=await route.fetch();await new Promise(r=>setTimeout(r,2500));await route.fulfill({response})}
   else await route.continue();
 });
 await host.locator('.answer').first().click();
 await host.getByText('Saving your answer…',{exact:true}).waitFor({timeout:600});
 assert.equal(await host.locator('.answer.selected').count(),1);
 assert.equal(await host.locator('.answer:disabled').count(),4);
 await guest.locator('.answer').first().click();
 await Promise.all(pages.map(p=>p.getByRole('heading',{name:'Standings',exact:true}).waitFor({timeout:15000})));
 const state=await guest.evaluate(()=>window.__gameTool.execute({}));
 assert.equal(state.phase,'reveal');assert.equal(state.players.length,2);
 assert(await guest.evaluate(()=>{try{window.__gameTool.execute({bad:1});return false}catch{return true}}));
 await guest.reload();await guest.getByRole('heading',{name:'Standings',exact:true}).waitFor();
 assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 fs.mkdirSync('.sites-runtime',{recursive:true});
 await guest.screenshot({path:'.sites-runtime/latency-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: two browser players, preparation/countdown, prompt ready at start, immediate selected/pending feedback under 2.5s delay, reveal, refresh recovery, mobile overflow, WebMCP read/invalid input.');
}finally{await browser.close()}

