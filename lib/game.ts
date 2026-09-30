import {makeDeck, type Question} from './questions';

export const ROUND_MS = 15_000;
export const COUNTDOWN_MS = 6_000;
// Not additional answering time: allow requests already received by the server to finish.
export const SETTLE_GRACE_MS = 8_000;
export type Player = {id:string; token:string; name:string; score:number; correct:number; ready:boolean};
type Answer = {choice:number; points:number; elapsed:number};
export type Game = {
  host:string; players:Player[]; phase:'lobby'|'preparing'|'question'|'reveal'|'finished'|'closed';
  deck:Question[]; round:number; start:number; answers:Record<string,Answer>; match:number;
  loaded?:string[];
};
export class GameError extends Error {
  constructor(message:string, public status=400){super(message)}
}
export function player(name:unknown):Player {
  if(typeof name!=='string'||!name.trim()||name.trim().length>20)
    throw new GameError('Enter a name between 1 and 20 characters.');
  return {id:crypto.randomUUID(),token:crypto.randomUUID(),name:name.trim(),score:0,correct:0,ready:false};
}
export function newGame(p:Player):Game {
  return {host:p.id,players:[p],phase:'lobby',deck:[],round:0,start:0,answers:{},match:1,loaded:[]};
}
export function points(elapsed:number){return 100+Math.round(50*Math.max(0,1-Math.max(0,elapsed)/ROUND_MS))}
export function settle(g:Game,now:number){
  if(g.phase!=='question')return false;
  const allAnswered=g.players.every(p=>g.answers[p.id]);
  if(now<g.start || (!allAnswered && now<g.start+ROUND_MS+SETTLE_GRACE_MS))return false;
  g.phase='reveal';
  for(const p of g.players){const a=g.answers[p.id];if(a){p.score+=a.points;if(a.points>0)p.correct++}}
  return true;
}
function prepare(g:Game){g.answers={};g.loaded=[];g.start=0;g.phase='preparing'}
export function act(g:Game,actor:Player,action:string,input:Record<string,unknown>,receivedAt:number){
  const host=actor.id===g.host;
  const sameRound=input.round===g.round&&input.match===g.match;
  if(action==='ready'){
    if(g.phase!=='lobby')throw new GameError('The match has already started.');
    const ready=typeof input.ready==='boolean'?input.ready:!actor.ready;
    if(actor.ready===ready)return false;
    actor.ready=ready;return true;
  }
  if(action==='leave'){
    if(!['lobby','finished'].includes(g.phase))throw new GameError('Stay in the room until the match ends. Refresh this tab to reconnect.');
    g.players=g.players.filter(p=>p.id!==actor.id);
    if(host){if(g.players.length)g.host=g.players[0].id;else g.phase='closed'}return true;
  }
  if(action==='start'){
    if(!host)throw new GameError('Only the host can start.',403);
    if(g.phase!=='lobby')throw new GameError('The match is already underway.');
    if(g.players.length<2||!g.players.every(p=>p.ready))throw new GameError('At least two players must join, and everyone must be ready.');
    g.deck=makeDeck();g.round=0;prepare(g);return true;
  }
  if(action==='loaded'){
    if(!sameRound)throw new GameError('This is not the current round.');
    if(g.loaded?.includes(actor.id))return false;
    if(g.phase!=='preparing')throw new GameError('The round has already started.');
    (g.loaded??=[]).push(actor.id);
    // Choose the countdown after preparation; the service supplies its current clock for this action.
    if(g.players.every(p=>g.loaded!.includes(p.id))){g.phase='question';g.start=receivedAt+COUNTDOWN_MS}
    return true;
  }
  if(action==='cancel'){
    if(!host||g.phase!=='preparing')throw new GameError('Only the host can cancel a preparing match.',403);
    g.phase='lobby';g.deck=[];g.answers={};g.loaded=[];g.round=0;g.start=0;g.match++;
    g.players.forEach(p=>{p.ready=false;p.score=0;p.correct=0});return true;
  }
  if(action==='answer'){
    if(!sameRound)throw new GameError('This is not the current round.');
    const existing=g.answers[actor.id];
    // A lost response may safely be retried, including after the reveal. Never score twice.
    if(existing){if(existing.choice===input.choice)return false;throw new GameError('Your first answer is already locked.')}
    if(g.phase!=='question'||receivedAt<g.start||receivedAt>=g.start+ROUND_MS)
      throw new GameError('This round is not accepting answers.');
    if(!Number.isInteger(input.choice)||Number(input.choice)<0||Number(input.choice)>3)
      throw new GameError('Choose one of the four answers.');
    const choice=Number(input.choice),elapsed=receivedAt-g.start;
    g.answers[actor.id]={choice,elapsed,points:g.deck[g.round].options[choice]===g.deck[g.round].answer?points(elapsed):0};
    settle(g,receivedAt);return true;
  }
  if(action==='next'){
    if(!host)throw new GameError('Only the host can advance.',403);
    if(g.phase!=='reveal'||!sameRound)throw new GameError('Wait for the round to finish.');
    if(g.round===11){g.phase='finished';return true}g.round++;prepare(g);return true;
  }
  if(action==='rematch'){
    if(!host||g.phase!=='finished')throw new GameError('The host can start a rematch after the results.');
    g.phase='lobby';g.deck=[];g.round=0;g.answers={};g.loaded=[];g.match++;
    g.players.forEach(p=>{p.score=0;p.correct=0;p.ready=false});return true;
  }
  throw new GameError('Unknown action.');
}
export function view(g:Game,me:Player,code:string,now:number,revision=0){
  const revealing=g.phase==='reveal'||g.phase==='finished',q=g.deck[g.round];
  return {
    code,host:g.host,me:me.id,phase:g.phase,round:g.round,match:g.match,start:g.start,
    serverTime:now,revision,loaded:g.loaded??[],answered:Object.keys(g.answers).length,
    mine:g.answers[me.id]?{choice:g.answers[me.id].choice,...(revealing?g.answers[me.id]:{})}:null,
    players:g.players.map(({token,...p})=>({...p,answered:!!g.answers[p.id],...(revealing?{roundPoints:g.answers[p.id]?.points??0}:{})})),
    // Send only the current prompt in advance. The UI reveals it at the synchronized start.
    question:q?{category:q.category,prompt:q.prompt,options:q.options,
      ...(revealing?{answer:q.answer,reference:q.reference,explanation:q.explanation}:{})}:null
  };
}
