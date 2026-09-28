import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const {chromium}=require('C:/Users/Dilean/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});const ctx=await browser.newContext();const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{document.modelContext={registerTool(t,o){window.__gameTool=t;o.signal.addEventListener('abort',()=>{window.__gameTool=null})}}});
await page.goto('http://127.0.0.1:8787/');await page.getByLabel('Your name').fill('Jordan');await page.getByRole('button',{name:'Create a room',exact:true}).click();await page.getByRole('heading',{name:'Your people'}).waitFor();
await page.getByRole('button',{name:'I’m ready'}).click();await page.getByRole('button',{name:'Not ready yet'}).waitFor();await page.reload();await page.getByRole('heading',{name:'Your people'}).waitFor();
const state=await page.evaluate(()=>window.__gameTool.execute({}));if(state.phase!=='lobby'||state.players[0].name!=='Jordan')throw Error('WebMCP read-back failed');
const invalid=await page.evaluate(()=>{try{window.__gameTool.execute({bad:1});return false}catch{return true}});if(!invalid)throw Error('WebMCP invalid input accepted');
await page.screenshot({path:'.sites-runtime/lobby.png',fullPage:true});
await page.getByRole('button',{name:'Leave room',exact:true}).click();await page.getByRole('heading',{name:'Let’s play.'}).waitFor();
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.sites-runtime/mobile.png',fullPage:true});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error('Mobile overflow');if(errors.length)throw Error(errors.join('; '));
await browser.close();console.log('PASS: browser create/ready/reload/leave, mobile overflow, no browser errors, WebMCP registration/read-back/invalid input. Screenshots saved.');

