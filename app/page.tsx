"use client";
import { useState, useEffect, useRef } from 'react';
import { Zap, Users, Clock, BookOpen, Check, Copy, Trophy, MessageCircle, HelpCircle, Layers, LogOut } from 'lucide-react';
import {isNewer,clockSample,pollDelay} from '../lib/client-timing';
const titles = ['Who Am I?', 'What Happened First?', 'Finish the Verse', 'Bible Facts', 'Bible Story, Badly Explained', 'Biblical Group Chat'];
const hints = ['Names you know. Clues that make you think.', 'Put your biblical timeline to the test.', 'Find the missing word. ESV edition.', 'People, places, and the details between.', 'Accurate stories. Questionable summaries.', 'Ancient events. Very modern messages.'];
const icons = [HelpCircle, Clock, BookOpen, Layers, Zap, MessageCircle];
type P = {id:string;name:string;score:number;correct:number;ready:boolean;answered:boolean;roundPoints?:number};
type G = {code:string;host:string;me:string;phase:string;round:number;match:number;start:number;serverTime:number;revision:number;loaded:string[];answered:number;mine:{choice:number;points?:number}|null;players:P[];question:{category:number;prompt?:string;options?:string[];answer?:string;reference?:string;explanation?:string}|null};
type Session = {code:string;token:string};
type Packet={game:G;token?:string;error?:string;receivedAt:number;serverTime:number};
type Pending={choice:number;round:number;match:number;failed:boolean};
export default function Home(){
    const [name,setName]=useState(''),[code,setCode]=useState('');
    const [session,setSession]=useState<Session|null>(null),[game,setGame]=useState<G|null>(null);
    const [busy,setBusy]=useState(false),[error,setError]=useState(''),[network,setNetwork]=useState(false);
    const [rules,setRules]=useState(false),[copied,setCopied]=useState(false),[clock,setClock]=useState(Date.now());
    const [pending,setPending]=useState<Pending|null>(null);
    const offset=useRef(0),latest=useRef<G|null>(null),actionLock=useRef(false),pendingRef=useRef<Pending|null>(null);
    const samples=useRef<{networkMs:number;offset:number}[]>([]);
    const pollAbort=useRef<AbortController|null>(null),currentSession=useRef(session);currentSession.current=session;
    function accept(data:Packet,sent:number,received:number){
        const g=data.game;if(!isNewer(g,latest.current))return;
        const sample=clockSample(sent,received,data.receivedAt,data.serverTime);
        samples.current=[...samples.current.slice(-7),sample];
        offset.current=[...samples.current].sort((a,b)=>a.networkMs-b.networkMs)[0].offset;
        latest.current=g;setGame(g);setClock(Date.now()+offset.current);
        const p=pendingRef.current;
        if(p&&(g.mine||g.match!==p.match||g.round!==p.round||g.phase!=='question')){
            pendingRef.current=null;setPending(null);
        }
    }
    async function request(body:Record<string,unknown>|null,s:Session|null,signal?:AbortSignal){
        const sent=Date.now();
        const timeout=AbortSignal.timeout(12000);
        const r=await fetch(body?'/api/game':'/api/game?code='+s!.code,{
            method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(s?{Authorization:'Bearer '+s.token}:{})},
            ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',
            signal:signal?AbortSignal.any([signal,timeout]):timeout
        });
        const data=await r.json() as Packet;
        if(!r.ok){const e=new Error(data.error??'The game is unavailable.') as Error&{status:number};e.status=r.status;throw e}
        return {data,sent,received:Date.now()};
    }
    useEffect(()=>{try{const saved=sessionStorage.getItem('bible-blitz-session');if(saved)setSession(JSON.parse(saved));const n=localStorage.getItem('bible-blitz-name');if(n)setName(n)}catch{}const q=new URLSearchParams(location.search).get('room');if(q)setCode(q.toUpperCase())},[]);
    useEffect(()=>{if(game?.phase!=='question')return;const t=setInterval(()=>setClock(Date.now()+offset.current),100);return()=>clearInterval(t)},[game?.phase]);
    useEffect(()=>{
        if(!session)return;
        let stopped=false,timer:ReturnType<typeof setTimeout>,failures=0;
        const poll=async()=>{
            if(actionLock.current){timer=setTimeout(poll,250);return}
            const abort=new AbortController();pollAbort.current=abort;
            try{
                const result=await request(null,session,abort.signal);
                if(stopped||currentSession.current!==session)return;
                accept(result.data,result.sent,result.received);setNetwork(false);failures=0;
            }catch(e){
                if(stopped||abort.signal.aborted)return;
                const status=(e as {status?:number}).status;
                if(status===401||status===404){setError((e as Error).message);setSession(null);setGame(null);latest.current=null;sessionStorage.removeItem('bible-blitz-session');return}
                failures++;setNetwork(true);
            }finally{
                if(!stopped){const g=latest.current;timer=setTimeout(poll,failures?Math.min(5000,1000*2**failures):pollDelay(g?.phase??'lobby',!!g?.mine))}
            }
        };
        void poll();
        const resume=()=>{if(document.visibilityState==='visible'){clearTimeout(timer);if(!pollAbort.current||pollAbort.current.signal.aborted)void poll()}};
        document.addEventListener('visibilitychange',resume);
        return()=>{stopped=true;clearTimeout(timer);pollAbort.current?.abort();document.removeEventListener('visibilitychange',resume)};
    },[session]);
    async function action(action:string,extra:Record<string,unknown>={}){
        if(actionLock.current)return;
        const current=latest.current;
        if(action==='answer'&&pendingRef.current&&!extra.retry)return;
        actionLock.current=true;setBusy(true);setError('');pollAbort.current?.abort();
        const body={action,code:session?.code??code,name,round:current?.round,match:current?.match,...extra};
        if(action==='ready')Object.assign(body,{ready:!current?.players.find(p=>p.id===current.me)?.ready});
        if(action==='answer'){
            const p={choice:Number(extra.choice),round:Number(body.round),match:Number(body.match),failed:false};
            pendingRef.current=p;setPending(p);
        }
        try{
            let result;
            for(let attempt=0;attempt<2;attempt++){
                try{result=await request(body,session);break}
                catch(e){const status=(e as {status?:number}).status;
                    if(attempt===0&&action==='answer'&&(!status||status===409||status>=500))continue;
                    throw e;
                }
            }
            if(!result)return;
            const {data,sent,received}=result;
            if(action==='leave'){sessionStorage.removeItem('bible-blitz-session');setSession(null);setGame(null);latest.current=null;samples.current=[];pendingRef.current=null;setPending(null);return}
            if(data.token){const s={code:data.game.code,token:data.token};sessionStorage.setItem('bible-blitz-session',JSON.stringify(s));localStorage.setItem('bible-blitz-name',name);setSession(s)}
            accept(data,sent,received);setNetwork(false);return {room:data.game.code,phase:data.game.phase};
        }catch(e){
            const status=(e as {status?:number}).status;
            if(action==='answer'&&pendingRef.current){
                const p={...pendingRef.current,failed:true};pendingRef.current=p;setPending(p);
                setError(status&&status<500&&status!==409?(e as Error).message:'Could not confirm your answer yet. Reconnecting will check it; retry sends the same choice.');
            }else setError(e instanceof Error?e.message:'Something went wrong. Please try again.');
        }finally{actionLock.current=false;setBusy(false)}
    }
    // Acknowledge only after this device has the actual current question, before starting its timer.
    useEffect(()=>{
        if(!session||game?.phase!=='preparing'||!game.question?.options||game.loaded.includes(game.me))return;
        let cancelled=false,timer:ReturnType<typeof setTimeout>;
        const load=async()=>{
            try{
                const result=await request({action:'loaded',code:session.code,round:game.round,match:game.match},session);
                if(!cancelled)accept(result.data,result.sent,result.received);
            }catch{if(!cancelled)timer=setTimeout(load,1500)}
        };
        void load();return()=>{cancelled=true;clearTimeout(timer)};
    },[session,game?.phase,game?.round,game?.match,game?.loaded.length]);

    const gameRef = useRef(game); gameRef.current = game;
    useEffect(() => { const ctx = (document as unknown as { modelContext?: { registerTool: (t: unknown, o: unknown) => Promise<void> | void } }).modelContext; if (!ctx) return; const c = new AbortController(); try { Promise.resolve(ctx.registerTool({ name: 'read_bible_blitz_room', title: 'Read Bible Blitz room', description: 'Read the current visible room, round and scores. Does not reveal hidden answers.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute(input: unknown) { if (!input || typeof input !== 'object' || Object.keys(input).length) throw Error('Expected an empty object.'); const g = gameRef.current; return g ? { code: g.code, phase: g.phase, round: g.round + 1, players: g.players.map(p => ({ name: p.name, score: p.score, ready: p.ready })) } : { phase: 'home' } } }, { signal: c.signal })).catch(() => { }) } catch { } return () => c.abort() }, []);
    async function copy() { try { await navigator.clipboard.writeText(location.origin + '/?room=' + game!.code); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { setError('Copy the room code shown above and send it to your friends.') } }
    const host = game?.me === game?.host; const me = game?.players.find(p => p.id === game.me); const revealing = game?.phase === 'reveal'; const finished = game?.phase === 'finished'; const countdown = game?.phase === 'question' && clock < game.start; const remaining = game ? Math.max(0, Math.min(15, (game.start + 15000 - clock) / 1000)) : 15;
    const selectedChoice = game?.mine?.choice ?? (pending && pending.round === game?.round && pending.match === game?.match ? pending.choice : undefined);
    const ranked = game ? [...game.players].sort((a, b) => b.score - a.score) : []; const winners = ranked.filter(p => p.score === ranked[0]?.score);
    function board() { return <div className="scoreboard">{ranked.map((p, i) => <div className={'score-row ' + (p.id === game?.me ? 'you' : '')} key={p.id}><span className="rank">{ranked.findIndex(x => x.score === p.score) + 1}</span><span className="avatar" style={{ background: ['#f5c85d', '#88d9bb', '#b8b2f4', '#eda59d'][game!.players.findIndex(x => x.id === p.id) % 4] }}>{p.name.slice(0, 1).toUpperCase()}</span><div className="player-name">{p.name}{p.id === game?.me && <small> YOU</small>}</div>{revealing && <span className="gain">+{p.roundPoints ?? 0}</span>}<strong>{p.score}<small> pts</small></strong></div>)}</div> }
    return <main><header><a className="brand" href="/" onClick={e => { if (session) e.preventDefault() }}><Zap size={25} fill="currentColor" /> BIBLE BLITZ</a><div className="header-actions">{game && <span className="room-tag">ROOM {game.code}</span>}<button className="text-button" onClick={() => setRules(!rules)}>{rules ? 'Close rules' : 'How to play'}</button></div></header>
        {rules && <section className="rules panel"><h2>The game plan</h2><p>2–8 players · 12 challenges · two of each type · 15 seconds per question.</p><p>Choose one answer. Once submitted, it is locked. A correct answer earns 100 points plus a speed bonus from 50 down to 0, rounded to the nearest point. Wrong or missed answers earn zero.</p><p>Everyone sees the answer and Bible reference after all answers arrive or time runs out. The host advances. Highest score wins; tied leaders share the win. Each challenge loads on all devices before a countdown. At the deadline, a brief collection window lets on-time requests finish saving; it does not add answering time.</p><p>Use your own knowledge—save Bible lookups until the reveal! Keep this tab open during play. If you disconnect, reopen it to resume. Rooms last 24 hours.</p><p>Verse excerpts use the ESV. Humorous summaries and group-chat messages are original writing, not quotations from Scripture.</p></section>}
        {error && <div role="alert" className="notice error">{error}<button className="text-button" onClick={() => setError('')}>Dismiss</button></div>}
        {network && <div role="status" className="notice">Reconnecting to your room… You can still tap an answer while time remains.</div>}
        {!game && !session && <><section className="home"><div className="intro"><p className="eyebrow">A LITTLE KNOWLEDGE. A LITTLE HOLY HUMOR.</p><h1>Quick thinking.<br /><em>Good fellowship.</em></h1><p>Six Bible challenges. Twelve rounds. One wonderfully competitive group of friends.</p><div className="pills"><span><Users size={15} /> 2–8 players</span><span><Clock size={15} /> 15-second rounds</span><span><BookOpen size={15} /> ESV</span></div></div><form className="panel" onSubmit={e => { e.preventDefault(); void action(code ? 'join' : 'create') }}><p className="eyebrow">GATHER YOUR PEOPLE</p><h2>Let’s play.</h2><label htmlFor="name">Your name</label><input id="name" placeholder="e.g. Jordan" value={name} onChange={e => setName(e.target.value)} maxLength={20} autoComplete="nickname" required /><button type="button" disabled={busy || !name.trim()} onClick={() => action('create')}>{busy ? 'One moment…' : 'Create a room'}</button><div className="divider">OR JOIN YOUR FRIENDS</div><label htmlFor="code">Room code</label><input id="code" className="code-input" placeholder="ABCDEF" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} maxLength={6} autoComplete="off" /><button className="secondary" type="submit" disabled={busy || !name.trim() || code.length !== 6}>Join room</button><small>The host plays too. No downloads needed.</small></form></section><section className="categories"><h2>Six ways to know your Bible.</h2><div className="tiles">{titles.map((x, i) => { const Icon = icons[i]; return <article key={x}><Icon size={22} /><h3>{x}</h3><p>{hints[i]}</p></article> })}</div></section></>}
        {!game && session && <section className="loading panel"><h2>Rejoining your room…</h2><p>Your place and score are saved.</p><button className="secondary" onClick={() => { setSession(null); latest.current=null; samples.current=[]; sessionStorage.removeItem('bible-blitz-session'); setNetwork(false) }}>Back to home</button></section>}
        {game?.phase === 'lobby' && <section className="lobby"><div><p className="eyebrow">THE GATHERING PLACE</p><h1>Good company.<br /><em>Friendly competition.</em></h1><p className="muted">Share the code, get comfortable, and mark yourself ready.</p><div className="room-code"><small>YOUR ROOM CODE</small><strong>{game.code}</strong><button className="secondary" onClick={copy}><Copy size={16} />{copied ? 'Link copied' : 'Copy invite link'}</button></div><div className="pills"><span>12 challenges</span><span>6 categories</span><span>Up to 150 pts each</span></div><p className="muted">Everyone plays on their own device, wherever they are.</p></div><div className="panel"><div className="section-title"><h2>Your people</h2><span>{game.players.length}/8</span></div><div className="roster">{game.players.map((p, i) => <div className="roster-row" key={p.id}><span className="avatar" style={{ background: ['#f5c85d', '#88d9bb', '#b8b2f4', '#eda59d'][i % 4] }}>{p.name.slice(0, 1).toUpperCase()}</span><div className="player-name"><strong>{p.name}</strong><small>{p.id === game.host ? 'Host' : p.id === game.me ? 'You' : 'Player'}</small></div><span className={p.ready ? 'ready' : 'muted'}>{p.ready ? '✓ Ready' : 'Getting ready'}</span></div>)}</div><button disabled={busy || network} className={me?.ready ? 'secondary' : ''} onClick={() => action('ready')}>{me?.ready ? 'Not ready yet' : 'I’m ready'}</button>{host ? <><button className="start-button" disabled={busy || network || game.players.length < 2 || !game.players.every(p => p.ready)} onClick={() => action('start')}>Start game</button><small>{game.players.length < 2 ? 'Invite at least one friend to begin.' : 'The game starts when everyone is ready.'}</small></> : <small>Once everyone is ready, the host will start.</small>}<button className="text-button leave" disabled={busy} onClick={() => action('leave')}><LogOut size={15} />Leave room</button></div></section>}
        {game?.phase === 'preparing' && <section className="play"><div className="countdown panel"><p className="eyebrow">CHALLENGE {game.round+1} / 12</p><h2>{titles[game.question?.category??0]}</h2><p>Getting everyone ready…</p><p>{game.loaded.length}/{game.players.length} devices have loaded the challenge.</p><small>The timer starts after everyone has the question. Keep this tab open.</small>{host&&<button className="text-button leave" disabled={busy} onClick={()=>action('cancel')}>Cancel match and return to lobby</button>}</div></section>}
        {game?.phase === 'question' && <section className="play"><div className="round-top"><span className="eyebrow">CHALLENGE {game.round + 1} / 12</span><span>{game.players.length} players · {me?.score ?? 0} pts</span></div><div className="round-dots" aria-label={'Round ' + (game.round + 1) + ' of 12'}>{Array.from({ length: 12 }, (_, i) => <i key={i} className={i <= game.round ? 'filled' : ''} />)}</div>{countdown ? <div className="countdown panel"><p className="eyebrow">COMING UP</p><h2>{titles[game.question?.category ?? 0]}</h2><strong>{Math.ceil((game.start - clock) / 1000)}</strong><p>Get ready. Your next challenge is almost here.</p></div> : <div className="question panel"><div className="question-head"><span className="badge">{titles[game.question?.category ?? 0]}</span><span className={'timer ' + (remaining < 5 ? 'urgent' : '')}><Clock size={19} />{Math.ceil(remaining)}<small>s</small></span></div><div className="timer-track"><div style={{ width: remaining / 15 * 100 + '%' }} /></div>{game.question?.category === 5 && <p className="fiction">FICTIONAL CHAT · NOT SCRIPTURE</p>}{game.question?.category === 2 && <p className="fiction">ESV EXCERPT · CHOOSE THE MISSING WORD</p>}<h2 className={game.question?.category === 5 ? 'chat-prompt' : ''}>{game.question?.prompt ?? 'Loading challenge…'}</h2><div className="answers">{game.question?.options?.map((option, i) => <button key={i} disabled={busy || selectedChoice !== undefined || remaining <= 0} className={'answer ' + (selectedChoice === i ? 'selected' : '')} onClick={() => action('answer', { choice: i })}><span>{'ABCD'[i]}</span>{option}{selectedChoice === i && <Check size={22} />}</button>)}</div><div className="answer-status" role="status"><span>{game.mine ? 'Answer saved. Let’s see how you did.' : pending ? (pending.failed ? 'Checking your selected answer…' : 'Saving your answer…') : remaining <= 0 ? 'Time’s up. Collecting on-time answers…' : 'Trust your first instinct.'}</span><span>{game.answered}/{game.players.length} answered</span></div></div>}</section>}
        {pending?.failed && game?.phase === 'question' && <button className="secondary" disabled={busy} onClick={()=>action('answer',{choice:pending.choice,round:pending.round,match:pending.match,retry:true})}>Retry saving the same answer</button>}
        {revealing && game && <section className="results"><div className="reveal panel"><p className="eyebrow">CHALLENGE {game.round + 1} / 12 · THE REVEAL</p><div className={'result-icon ' + (game.mine?.points ? 'correct' : '')}>{game.mine?.points ? <Check size={35} /> : <BookOpen size={35} />}</div><h1>{game.mine?.points ? 'Nicely done!' : game.mine ? 'One to remember.' : 'Time got away.'}</h1><p className="points-earned">+{game.mine?.points ?? 0} points</p><p className="muted">The correct answer</p><h2>{game.question?.answer}</h2><p>{game.question?.explanation}</p><a className="scripture" href={'https://www.esv.org/' + encodeURIComponent(game.question?.reference ?? '')} target="_blank" rel="noreferrer"><BookOpen size={16} />{game.question?.reference} · ESV</a>{host ? <button className="start-button" disabled={busy || network} onClick={() => action('next')}>{game.round === 11 ? 'See final results' : 'Next challenge'}</button> : <p className="waiting">Waiting for the host to continue…</p>}</div><div className="panel"><div className="section-title"><h2>Standings</h2><Trophy color="var(--gold)" size={23} /></div>{board()}</div></section>}
        {finished && game && <section className="final"><div className="winner"><Trophy size={64} strokeWidth={1.5} /><p className="eyebrow">TWELVE ROUNDS. GREAT COMPANY.</p><h1>{winners.map(p => p.name).join(' & ')}<br /><em>{winners.length > 1 ? 'share the win!' : 'takes the win!'}</em></h1><p>{ranked[0]?.score} points · Well played, everyone.</p></div><div className="panel final-board">{board()}{host ? <button className="start-button" disabled={busy || network} onClick={() => action('rematch')}>Play again with this group</button> : <p className="waiting">The host can open a rematch.</p>}<button className="text-button leave" disabled={busy} onClick={() => action('leave')}>Leave room</button></div></section>}
        <footer><span>BIBLE BLITZ · A FRIENDLY TEST OF FAITHFUL MEMORY</span><details><summary>Scripture credits</summary><p>Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. <a href="https://www.esv.org/" target="_blank" rel="noreferrer">ESV.org</a></p><p>Questions, explanations, humorous summaries, and fictional chats are original game content. This game is not affiliated with or endorsed by Crossway.</p></details></footer></main>
}
