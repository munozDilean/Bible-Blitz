import assert from 'node:assert/strict';
import ts from 'typescript';import fs from 'node:fs';import {pathToFileURL} from 'node:url';
fs.mkdirSync('.sites-runtime/tests',{recursive:true});
for(const f of ['questions','game']){let src=fs.readFileSync('lib/'+f+'.ts','utf8');src=src.replace("'./questions'","'./questions.mjs'");fs.writeFileSync('.sites-runtime/tests/'+f+'.mjs',ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText)}
const {player,newGame,act,settle,view,points}=await import(pathToFileURL(process.cwd()+'/.sites-runtime/tests/game.mjs'));
const a=player('A'),b=player('B'),g=newGame(a);g.players.push(b);
assert.throws(()=>act(g,a,'start',{},0));a.ready=b.ready=true;act(g,a,'start',{},1000);assert.equal(g.deck.length,12);assert.equal(new Set(g.deck.map(q=>q.id)).size,12);
for(let c=0;c<6;c++)assert.equal(g.deck.filter(q=>q.category===c).length,2);
assert.equal(points(0),150);assert.equal(points(6000),130);assert.equal(points(15000),100);
assert.throws(()=>act(g,b,'next',{round:0,match:1},5000));
assert.throws(()=>act(g,a,'answer',{round:0,match:1,choice:0},4999));
for(let r=0;r<12;r++){let t=g.start+6000;const correct=g.deck[r].options.indexOf(g.deck[r].answer);assert.equal(view(g,a,'ABCDEF',t).question.answer,undefined);act(g,a,'answer',{round:r,match:1,choice:correct},t);assert.throws(()=>act(g,a,'answer',{round:r,match:1,choice:correct},t));assert.equal(view(g,b,'ABCDEF',t).players[0].score,r*130);act(g,b,'answer',{round:r,match:1,choice:(correct+1)%4},t);assert.equal(g.phase,'reveal');assert.equal(g.players[0].score,(r+1)*130);settle(g,t+16000);assert.equal(g.players[0].score,(r+1)*130);act(g,a,'next',{round:r,match:1},t+100)}
assert.equal(g.phase,'finished');assert.equal(g.players[0].score,1560);act(g,a,'rematch',{},100000);assert.equal(g.phase,'lobby');assert.equal(g.players[0].score,0);
console.log('PASS: category distribution, random deck uniqueness, speed scoring, authorization, early/duplicate answers, score secrecy, 12-round completion, no double scoring, rematch.');
const base='http://127.0.0.1:8787/api/game';
async function post(body,token){const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});const data=await r.json();return {status:r.status,...data}}
let h=await post({action:'create',name:'Host'});assert.equal(h.status,200,JSON.stringify(h));const code=h.game.code;
const joins=await Promise.all(Array.from({length:7},(_,i)=>post({action:'join',code,name:'Guest '+i})));assert(joins.every(x=>x.status===200),JSON.stringify(joins));assert.equal((await post({action:'join',code,name:'Ninth'})).status,400);
const people=[h,...joins];await Promise.all(people.map(p=>post({action:'ready',code},p.token)));
assert.equal((await post({action:'start',code},joins[0].token)).status,403);let start=await post({action:'start',code},h.token);assert.equal(start.status,200,JSON.stringify(start));
assert.equal(start.game.players.length,8);assert(!JSON.stringify(start.game).includes('"token"'));
assert.equal((await post({action:'answer',code,round:0,match:1,choice:0},h.token)).status,400);
await new Promise(r=>setTimeout(r,4100));
const answers=await Promise.all(people.map(p=>post({action:'answer',code,round:0,match:1,choice:0},p.token)));assert(answers.every(x=>x.status===200),JSON.stringify(answers));
const state=await (await fetch(base+'?code='+code,{headers:{Authorization:'Bearer '+h.token}})).json();assert.equal(state.game.phase,'reveal');assert.equal(state.game.answered,8);assert(state.game.question.answer);
assert.equal((await post({action:'answer',code,round:0,match:1,choice:1},h.token)).status,400);
assert.equal((await fetch(base+'?code='+code)).status,401);
console.log('PASS: live D1 room creation, 7 simultaneous joins, 8-player limit, ready checks, non-host rejection, early answer rejection, 8 simultaneous answers, reconnect/read-back, hidden tokens, unauthenticated rejection.');

