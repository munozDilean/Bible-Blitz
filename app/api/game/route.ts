import {db} from '../../../lib/db';
import {act,newGame,player,settle,view,GameError,type Game} from '../../../lib/game';
export const dynamic='force-dynamic';
function json(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store'}})}
async function handler(req:Request){try{
 const u=new URL(req.url);if(req.method==='POST'&&req.headers.get('origin')&&req.headers.get('origin')!==u.origin)throw new GameError('Request origin is not allowed.',403);
 const input=req.method==='POST'?await req.json() as Record<string,unknown>:Object.fromEntries(u.searchParams);
 const action=req.method==='GET'?'state':String(input.action);const now=Date.now();
 if(action==='create'){
  const p=player(input.name);const g=newGame(p);
  for(let i=0;i<6;i++){const bytes=new Uint8Array(6);crypto.getRandomValues(bytes);const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const code=Array.from(bytes,x=>chars[x%chars.length]).join('');
   const result=await db().prepare('INSERT OR IGNORE INTO rooms (code,state,revision,expires) VALUES (?,?,0,?)').bind(code,JSON.stringify(g),now+86400000).run();if(result.meta.changes){return json({token:p.token,game:view(g,p,code,now)})}}
  throw new GameError('Could not create a room. Please try again.',503);
 }
 const code=String(input.code??'').toUpperCase();if(!/^[A-Z2-9]{6}$/.test(code))throw new GameError('Enter the six-character room code.');
 const token=req.headers.get('authorization')?.replace(/^Bearer /,'');
 for(let retry=0;retry<12;retry++){
  const row=await db().prepare('SELECT state,revision FROM rooms WHERE code=? AND expires>?').bind(code,Date.now()).first<{state:string;revision:number}>();if(!row)throw new GameError('Room not found or expired. Check the code or create a new room.',404);
  const g=JSON.parse(row.state) as Game;const clock=Date.now();let changed=settle(g,clock);let me=g.players.find(p=>p.token===token);let joined=false;
  if(action==='join'){
   if(!me){if(g.phase!=='lobby')throw new GameError('This match has already started. Join when the host opens a rematch.');if(g.players.length>=8)throw new GameError('This room is full (8 players).');const p=player(input.name);if(g.players.some(x=>x.name.toLowerCase()===p.name.toLowerCase()))throw new GameError('That name is taken in this room. Choose another.');g.players.push(p);me=p;changed=true;joined=true}
  }else if(!me)throw new GameError('Your player session is no longer in this room. Rejoin from the home screen.',401);
  if(!me)throw new GameError('Unable to join room.');
  if(g.phase==='closed')throw new GameError('This room is closed.',404);
  if(action!=='state'&&action!=='join'){act(g,me,action,input,clock);changed=true}
  if(changed){const result=await db().prepare('UPDATE rooms SET state=?,revision=revision+1 WHERE code=? AND revision=?').bind(JSON.stringify(g),code,row.revision).run();if(!result.meta.changes)continue}
  return json({...(joined?{token:me.token}:{}),game:view(g,me,code,Date.now())});
 }
 throw new GameError('The room is busy. Please try again.',409);
}catch(e){if(e instanceof GameError)return json({error:e.message},e.status);console.error('Game request failed',e);return json({error:'The game is temporarily unavailable. Please try again.'},503)}}
export async function GET(req:Request){return handler(req)}
export async function POST(req:Request){if(Number(req.headers.get('content-length')??0)>4096)return json({error:'Request too large'},413);return handler(req)}
