import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
fs.mkdirSync('.sites-runtime/tests',{recursive:true});
for(const f of ['questions','game','game-service','client-timing']){
 const src=fs.readFileSync('lib/'+f+'.ts','utf8').replace(/from '(.\/[^']+)'/g,"from '$1.mjs'");
 fs.writeFileSync('.sites-runtime/tests/'+f+'.mjs',ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const load=n=>import(pathToFileURL(process.cwd()+'/.sites-runtime/tests/'+n+'.mjs'));
const {player,newGame,act,settle,view,points,ROUND_MS,COUNTDOWN_MS,SETTLE_GRACE_MS}=await load('game');
const {createGameHandler}=await load('game-service');
const {clockSample,isNewer,pollDelay}=await load('client-timing');
const a=player('A'),b=player('B'),g=newGame(a);g.players.push(b);
assert.throws(()=>act(g,a,'start',{},0));a.ready=b.ready=true;act(g,a,'start',{},1000);
assert.equal(g.phase,'preparing');assert.equal(g.start,0);
assert.equal(g.deck.length,12);assert.equal(new Set(g.deck.map(q=>q.id)).size,12);
for(let c=0;c<6;c++)assert.equal(g.deck.filter(q=>q.category===c).length,2);
assert.equal(points(0),150);assert.equal(points(6000),130);assert.equal(points(15000),100);
let t=1000;
for(let r=0;r<12;r++){
 const input={round:r,match:1};
 assert.equal(view(g,a,'ABCDEF',t).question.options.length,4);
 assert.equal(view(g,a,'ABCDEF',t).question.answer,undefined);
 assert.equal(view(g,a,'ABCDEF',t).question.reference,undefined);
 act(g,a,'loaded',input,t);assert.equal(g.phase,'preparing');
 // A slow second device must not lose any of its answering window.
 t+=10000;act(g,b,'loaded',input,t);assert.equal(g.start,t+COUNTDOWN_MS);
 assert.throws(()=>act(g,a,'answer',{...input,choice:0},g.start-1));
 const correct=g.deck[r].options.indexOf(g.deck[r].answer);
 t=g.start+6000;act(g,a,'answer',{...input,choice:correct},t);
 assert.equal(act(g,a,'answer',{...input,choice:correct},t+1000),false);
 assert.throws(()=>act(g,a,'answer',{...input,choice:(correct+1)%4},t));
 assert.equal(view(g,b,'ABCDEF',t).players[0].score,r*130);
 act(g,b,'answer',{...input,choice:(correct+1)%4},t);
 assert.equal(g.phase,'reveal');assert.equal(g.players[0].score,(r+1)*130);
 assert.equal(act(g,a,'answer',{...input,choice:correct},t+1000),false);
 settle(g,t+ROUND_MS+SETTLE_GRACE_MS);assert.equal(g.players[0].score,(r+1)*130);
 assert.throws(()=>act(g,b,'next',input,t));
 act(g,a,'next',input,t+100);
}
assert.equal(g.phase,'finished');assert.equal(g.players[0].score,1560);
act(g,a,'rematch',{},100000);assert.equal(g.phase,'lobby');assert.equal(g.players[0].score,0);
assert.deepEqual(clockSample(1000,4300,1200,4200),{networkMs:300,offset:50});
assert.equal(isNewer({revision:2,serverTime:9999},{revision:3,serverTime:1000}),false);
assert.equal(isNewer({revision:4,serverTime:900},{revision:3,serverTime:1000}),true);
assert.equal(pollDelay('lobby'),2000);assert.equal(pollDelay('finished'),5000);
console.log('PASS: full match, loading barrier, preloaded prompt/no solutions, host controls, scoring, idempotent retries, snapshot ordering, clock synchronization.');

function fixture(){
 const p=player('Host'),guest=player('Guest'),room=newGame(p);room.players.push(guest);p.ready=guest.ready=true;
 act(room,p,'start',{},0);act(room,p,'loaded',{round:0,match:1},0);act(room,guest,'loaded',{round:0,match:1},0);
 return {room,p,guest};
}
function fakeStore(room,{readDelay=0,conflicts=0}={}){
 let clock=room.start+14000,revision=0,state=JSON.stringify(room);
 const database={prepare(sql){return {bind(...args){return {
   async first(){clock+=readDelay;return {state,revision}},
   async run(){
    if(sql.startsWith('UPDATE')){
     if(conflicts-->0){revision++;return {meta:{changes:0}}}
     assert.equal(args[2],revision);state=args[0];revision++;return {meta:{changes:1}};
    }
    throw Error('Unexpected SQL');
   }
 }}}}};
 return {database,now:()=>clock,setClock:n=>clock=n,state:()=>JSON.parse(state)};
}
{
 const {room,p,guest}=fixture();const store=fakeStore(room,{readDelay:4000,conflicts:1});
 const handler=createGameHandler({db:()=>store.database,now:store.now});
 const choice=room.deck[0].options.indexOf(room.deck[0].answer);
 const response=await handler(new Request('https://test.local/api/game',{method:'POST',headers:{Authorization:'Bearer '+p.token},body:JSON.stringify({action:'answer',code:'ABCDEF',round:0,match:1,choice})}));
 assert.equal(response.status,200);assert.equal(store.state().answers[p.id].elapsed,14000);
 assert.equal(store.state().answers[p.id].points,103);assert.equal(store.state().phase,'question');
 assert(response.headers.get('server-timing').includes('db;dur=8000'));
 const state=store.state();assert.equal(settle(state,room.start+ROUND_MS+SETTLE_GRACE_MS-1),false);
 assert.equal(settle(state,room.start+ROUND_MS+SETTLE_GRACE_MS),true);
 assert.equal(state.players[0].score,103);
 // A late arrival is rejected; no client-supplied timestamp can backdate it.
 const lateStore=fakeStore(room);lateStore.setClock(room.start+ROUND_MS);
 const late=await createGameHandler({db:()=>lateStore.database,now:lateStore.now})(new Request('https://test.local/api/game',{method:'POST',headers:{Authorization:'Bearer '+guest.token},body:JSON.stringify({action:'answer',code:'ABCDEF',round:0,match:1,choice,elapsed:1})}));
 assert.equal(late.status,400);assert.equal(Object.keys(lateStore.state().answers).length,0);
}
console.log('PASS: request arriving at 14s survives 8s of DB/CAS delays; original timing preserved; bounded grace; late arrivals rejected.');

if(!process.argv.includes('--integration'))process.exit(0);
const base=process.env.GAME_BASE_URL??'http://127.0.0.1:8787';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Integration tests are local-only.');
async function post(body,token){const r=await fetch(base+'/api/game',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:r.status,...await r.json()}}
const h=await post({action:'create',name:'Host'});assert.equal(h.status,200);const code=h.game.code;
const joins=await Promise.all(Array.from({length:7},(_,i)=>post({action:'join',code,name:'Guest '+i})));assert(joins.every(x=>x.status===200));
assert.equal((await post({action:'join',code,name:'Ninth'})).status,400);
const people=[h,...joins];await Promise.all(people.map(p=>post({action:'ready',code,ready:true},p.token)));
assert.equal((await post({action:'start',code},joins[0].token)).status,403);
assert.equal((await post({action:'start',code},h.token)).game.phase,'preparing');
const loading=await Promise.all(people.map(p=>post({action:'loaded',code,round:0,match:1},p.token)));assert(loading.every(x=>x.status===200));
const active=await (await fetch(base+'/api/game?code='+code,{headers:{Authorization:'Bearer '+h.token}})).json();
assert.equal(active.game.phase,'question');assert.equal(active.game.question.options.length,4);
await new Promise(r=>setTimeout(r,Math.max(0,active.game.start-Date.now()+100)));
const answers=await Promise.all(people.map(p=>post({action:'answer',code,round:0,match:1,choice:0},p.token)));assert(answers.every(x=>x.status===200));
const result=await (await fetch(base+'/api/game?code='+code,{headers:{Authorization:'Bearer '+h.token}})).json();
assert.equal(result.game.phase,'reveal');assert.equal(result.game.answered,8);
assert.equal((await post({action:'answer',code,round:0,match:1,choice:0},h.token)).status,200);
assert.equal((await fetch(base+'/api/game?code='+code)).status,401);
console.log('PASS: live D1 concurrency with 8 joins/readiness acknowledgements/answers, player limit, retry and authentication.');

