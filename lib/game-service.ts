import {act,newGame,player,settle,view,GameError,type Game} from './game';

type Dependencies={db:()=>D1Database;now?:()=>number};
export function createGameHandler({db,now=Date.now}:Dependencies){
 return async function handler(req:Request){
  // Capture arrival before parsing, authentication reads, database waits, or CAS retries.
  const receivedAt=now();let dbMs=0,attempts=0;const requestId=crypto.randomUUID();
  const respond=(body:Record<string,unknown>,status=200)=>{
    const sentAt=now();
    return Response.json({...body,receivedAt,serverTime:sentAt,requestId},{
      status,headers:{'Cache-Control':'no-store','Server-Timing':`db;dur=${dbMs}, total;dur=${sentAt-receivedAt}`,'X-Request-Id':requestId}
    });
  };
  async function timed<T>(work:()=>Promise<T>){const start=now();try{return await work()}finally{dbMs+=now()-start}}
  try{
    const url=new URL(req.url);
    if(req.method==='POST'&&req.headers.get('origin')&&req.headers.get('origin')!==url.origin)
      throw new GameError('Request origin is not allowed.',403);
    let input:Record<string,unknown>;
    if(req.method==='POST'){
      const text=await req.text();
      if(text.length>4096)throw new GameError('Request too large.',413);
      try{input=JSON.parse(text)}catch{throw new GameError('Invalid JSON.')}
      if(!input||typeof input!=='object'||Array.isArray(input))throw new GameError('Invalid request.');
    }else input=Object.fromEntries(url.searchParams);
    const action=req.method==='GET'?'state':String(input.action);
    if(action==='create'){
      const p=player(input.name),g=newGame(p);
      for(let i=0;i<6;i++){
        const bytes=new Uint8Array(6);crypto.getRandomValues(bytes);
        const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',code=Array.from(bytes,x=>chars[x%chars.length]).join('');
        const result=await timed(()=>db().prepare('INSERT OR IGNORE INTO rooms (code,state,revision,expires) VALUES (?,?,0,?)').bind(code,JSON.stringify(g),now()+86400000).run());
        if(result.meta.changes)return respond({token:p.token,game:view(g,p,code,now(),0)});
      }
      throw new GameError('Could not create a room. Please try again.',503);
    }
    const code=String(input.code??'').toUpperCase();
    if(!/^[A-Z2-9]{6}$/.test(code))throw new GameError('Enter the six-character room code.');
    const token=req.headers.get('authorization')?.replace(/^Bearer /,'');
    if(action!=='join'&&!token)throw new GameError('A player session is required.',401);
    for(let retry=0;retry<12;retry++){
      attempts=retry+1;
      const row=await timed(()=>db().prepare('SELECT state,revision FROM rooms WHERE code=? AND expires>?').bind(code,now()).first<{state:string;revision:number}>());
      if(!row)throw new GameError('Room not found or expired. Check the code or create a new room.',404);
      const g=JSON.parse(row.state) as Game;
      let me=g.players.find(p=>p.token===token),changed=false,joined=false;
      if(action==='join'&&!me){
        if(g.phase!=='lobby')throw new GameError('This match has already started. Join when the host opens a rematch.');
        if(g.players.length>=8)throw new GameError('This room is full (8 players).');
        const p=player(input.name);
        if(g.players.some(x=>x.name.toLowerCase()===p.name.toLowerCase()))throw new GameError('That name is taken in this room. Choose another.');
        g.players.push(p);me=p;changed=true;joined=true;
      }
      if(!me)throw new GameError('Your player session is no longer in this room. Rejoin from the home screen.',401);
      if(g.phase==='closed')throw new GameError('This room is closed.',404);
      // Answer first using ingress time; otherwise a slow SELECT can expire a valid answer.
      if(action!=='state'&&action!=='join')
        changed=act(g,me,action,input,action==='loaded'?now():receivedAt)||changed;
      changed=settle(g,now())||changed;
      let revision=row.revision;
      if(changed){
        const result=await timed(()=>db().prepare('UPDATE rooms SET state=?,revision=revision+1 WHERE code=? AND revision=?').bind(JSON.stringify(g),code,row.revision).run());
        if(!result.meta.changes)continue;
        revision++;
      }
      return respond({...(joined?{token:me.token}:{}),game:view(g,me,code,now(),revision)});
    }
    throw new GameError('The room is busy. Please try again.',409);
  }catch(e){
    if(e instanceof GameError){
      console.warn('game_request_rejected',{requestId,status:e.status,reason:e.message,totalMs:now()-receivedAt,dbMs,attempts});
      return respond({error:e.message},e.status);
    }
    console.error('game_request_failed',{requestId,totalMs:now()-receivedAt,dbMs,attempts,error:String(e)});
    return respond({error:'The game is temporarily unavailable. Please try again.'},503);
  }
 };
}

