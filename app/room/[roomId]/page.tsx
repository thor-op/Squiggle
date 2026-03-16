'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPlayerId, getPlayerProfile, setPlayerProfile } from '@/lib/store';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, collection, updateDoc, deleteDoc } from 'firebase/firestore';
import { Room, Player } from '@/lib/types';
import { createOrJoinRoom, startGame, selectWord, endRound, nextTurn, sendSystemMessage } from '@/lib/gameLogic';
import { Copy, Check, Crown, Brush, LogOut, Bug, Lightbulb, MessageSquare, X } from 'lucide-react';
import Canvas from '@/components/Canvas';
import Chat from '@/components/Chat';
import HostControls from '@/components/HostControls';
import FloatingEmojis from '@/components/FloatingEmojis';
import { playSound } from '@/lib/sounds';
import Corners from '@/components/Corner';
import RoomDoodles from '@/components/RoomDoodles';

const EMOJIS = ['👍', '😂', '🔥', '💩', '🤔', '🎉'];
const REPO = 'https://github.com/thor-op/squiggle';

function FeedbackMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="text-[9px] uppercase tracking-widest text-zinc-600 hover:text-zinc-300 transition-colors border border-zinc-800 px-2 py-1 hidden sm:block">
        feedback / bugs
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 border border-zinc-800 bg-[#0a0a0a] w-44 z-50">
          <a href={`${REPO}/issues/new?template=bug_report.yml`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors border-b border-zinc-800">
            <Bug size={11} /> Report a bug
          </a>
          <a href={`${REPO}/issues/new?template=feedback.yml`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors">
            <Lightbulb size={11} /> Give feedback
          </a>
        </div>
      )}
    </div>
  );
}

function PlayerStrip({ players, drawerId, currentPlayer }: { players: Player[]; drawerId?: string; currentPlayer: Player }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to drawer whenever drawerId changes
  useEffect(() => {
    if (!drawerRef.current || !scrollRef.current) return;
    const container = scrollRef.current;
    const card = drawerRef.current;
    const cardLeft = card.offsetLeft;
    const cardWidth = card.offsetWidth;
    const containerWidth = container.offsetWidth;
    const target = cardLeft - containerWidth / 2 + cardWidth / 2;
    container.scrollTo({ left: target, behavior: 'smooth' });
  }, [drawerId]);

  return (
    <div
      ref={scrollRef}
      className="h-12 border-t border-zinc-800 bg-[#0a0a0a] flex items-center px-2 gap-1.5 flex-shrink-0 overflow-x-auto scroll-smooth"
      style={{ scrollbarWidth: 'none' }}
    >
      {players.map((p) => {
        const isMe = p.id === currentPlayer.id;
        const isCurrentDrawer = p.id === drawerId;
        return (
          <div
            key={p.id}
            ref={isCurrentDrawer ? drawerRef : undefined}
            className={`relative flex items-center gap-1.5 px-2 h-8 border flex-shrink-0 min-w-[100px] sm:min-w-[120px] transition-all ${
              isCurrentDrawer ? 'border-white bg-white text-black' : p.hasGuessed ? 'border-emerald-700 bg-emerald-950 text-emerald-300' : isMe ? 'border-zinc-500 bg-zinc-900 text-white' : 'border-zinc-800 text-zinc-500'
            }`}
          >
            <Corners size={3} weight={1} color={isCurrentDrawer ? 'text-zinc-400' : p.hasGuessed ? 'text-emerald-600' : isMe ? 'text-zinc-500' : 'text-zinc-700'} />
            <div className="w-5 h-5 flex-shrink-0 overflow-hidden bg-zinc-800">
              <img src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${p.avatarId}`} alt={p.name} className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold truncate">{p.name}</span>
                {p.isHost && <Crown size={7} className={isCurrentDrawer ? 'text-zinc-500' : 'text-zinc-600'} />}
                {isCurrentDrawer && <Brush size={7} className="text-zinc-500" />}
              </div>
              <div className="text-[8px] font-semibold opacity-50">{p.score}pts</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = (params.roomId as string).toUpperCase();
  const [player, setPlayer] = useState<Player | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [secretWord, setSecretWord] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [roomNotFound, setRoomNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestAvatarSeed] = useState(() => Math.random().toString(36).substring(7));
  // Mobile chat drawer
  const [chatOpen, setChatOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartHeight = useRef<number>(70); // vh
  const isDraggingRef = useRef(false);

  const joinAsPlayer = async (name: string, avatarId: string) => {
    try {
      const id = getPlayerId();
      setPlayerProfile(name, avatarId);
      const newPlayer: Player = { id, name, avatarId, score: 0, streak: 0, connected: true, isHost: false, hasGuessed: false };
      setPlayer(newPlayer);
      await createOrJoinRoom(roomId, newPlayer);
    } catch (e) { console.error('join error', e); }
    finally { setIsInitializing(false); }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const profile = getPlayerProfile();
        if (profile.name) await joinAsPlayer(profile.name, profile.avatarId || guestAvatarSeed);
        else { setIsInitializing(false); setShowNameDialog(true); }
      } catch (e) { console.error('init error', e); setIsInitializing(false); }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    if (!player) return;
    const cleanup = () => deleteDoc(doc(db, `rooms/${roomId}/players`, player.id)).catch(() => {});
    window.addEventListener('beforeunload', cleanup);
    return () => window.removeEventListener('beforeunload', cleanup);
  }, [player, roomId]);

  useEffect(() => {
    if (!roomId || isInitializing) return;
    return onSnapshot(doc(db, 'rooms', roomId), (d) => {
      if (d.exists()) {
        setRoomNotFound(false);
        const nr = { id: d.id, ...d.data() } as Room;
        setRoom(prev => {
          if (prev && prev.phase !== nr.phase) {
            if (nr.phase === 'reveal') playSound('endRound');
            if (nr.phase === 'ended') playSound('endGame');
          }
          return nr;
        });
      } else { setRoomNotFound(true); }
    });
  }, [roomId, isInitializing]);

  const hasSeenPlayers = useRef(false);
  useEffect(() => {
    if (!roomId) return;
    return onSnapshot(collection(db, `rooms/${roomId}/players`), (snap) => {
      const p: Player[] = [];
      snap.forEach(d => p.push({ id: d.id, ...d.data() } as Player));
      p.sort((a, b) => b.score - a.score);
      if (snap.size === 0) {
        if (hasSeenPlayers.current) {
          fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deleteRoom', roomId }) }).catch(() => {});
        }
        return;
      }
      hasSeenPlayers.current = true;
      setPlayers(prev => {
        if (prev.length > 0) {
          if (p.length > prev.length) playSound('join');
          else if (p.length < prev.length) {
            const left = prev.find(old => !p.some(n => n.id === old.id));
            if (left) sendSystemMessage(roomId, `${left.name} left the room.`);
          }
        }
        return p;
      });
      if (player) {
        const me = p.find(x => x.id === player.id);
        if (me && me.isHost !== player.isHost) setPlayer(me);
      }
    });
  }, [roomId, player]);

  useEffect(() => {
    if (!player || !room?.currentRound || room.phase !== 'drawing') { setSecretWord(null); return; }
    // Fetch word if you're the drawer OR if you've already guessed correctly
    if (room.currentRound.drawerId !== player.id && !player.hasGuessed) { setSecretWord(null); return; }
    fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'getWord', roomId, playerId: player.id }) })
      .then(r => r.json()).then(d => setSecretWord(d.word ?? null)).catch(() => setSecretWord(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.phase, room?.currentRound?.drawerId, player?.id, player?.hasGuessed]);

  const revealedHints = useRef<Set<number>>(new Set());
  const lastRoundId = useRef<string>('');
  const transitionFired = useRef<string>('');

  useEffect(() => {
    if (!room) return;
    const iv = setInterval(async () => {
      if (!room.currentRound) return;
      const elapsed = (Date.now() - room.currentRound.startedAt) / 1000;
      const rem = Math.max(0, Math.ceil(room.currentRound.timeLimit - elapsed));
      setTimeLeft(prev => { if (room.phase === 'drawing' && rem <= 10 && rem > 0 && rem !== prev) playSound('tick'); return rem; });

      const roundKey = `${room.currentRound.drawerId}-${room.currentRound.roundNumber}-${room.phase}`;
      if (roundKey !== lastRoundId.current) { lastRoundId.current = roundKey; revealedHints.current = new Set(); transitionFired.current = ''; }

      if (!player?.isHost) return;

      if (room.phase === 'drawing' && room.settings.hints > 0) {
        const hintInterval = room.settings.hintInterval ?? 20;
        for (let i = 1; i <= room.settings.hints; i++) {
          if (elapsed >= hintInterval * i && !revealedHints.current.has(i)) {
            revealedHints.current.add(i);
            fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revealHint', roomId, hintIndex: i }) }).catch(() => {});
          }
        }
      }

      const guessers = players.filter(p => p.id !== room.currentRound!.drawerId);
      const allGuessed = guessers.length > 0 && guessers.every(p => p.hasGuessed);
      const skipVotes = room.votes?.skip ? Object.keys(room.votes.skip).length : 0;
      const shouldTransition = rem <= 0 || (room.phase === 'drawing' && (allGuessed || skipVotes > guessers.length / 2));
      if (shouldTransition && transitionFired.current !== room.phase) {
        transitionFired.current = room.phase;
        if (room.phase === 'choosing') selectWord(roomId, room.wordChoices?.[0] || 'apple', room.currentRound!.drawerId);
        else if (room.phase === 'drawing') endRound(roomId);
        else if (room.phase === 'reveal') nextTurn(roomId, room, players);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [room, player, roomId, secretWord, players]);

  // ── NAME DIALOG ────────────────────────────────────────────────────────────
  if (showNameDialog) {
    return (
      <div className="h-screen bg-[#0a0a0a] flex items-center justify-center font-sans text-white p-4">
        <div className="w-full max-w-xs border border-zinc-800 bg-zinc-950 p-8 relative">
          <Corners size={8} weight={1} color="text-zinc-600" />
          <div className="mb-6">
            <h1 className="text-2xl font-black font-fredoka mb-1">Squiggle<span className="text-zinc-600">.</span></h1>
            <p className="text-[10px] uppercase tracking-widest text-zinc-600">Joining room <span className="text-white font-bold">{roomId}</span></p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (!guestName.trim()) return; setShowNameDialog(false); setIsInitializing(true); joinAsPlayer(guestName.trim(), guestAvatarSeed); }} className="space-y-4">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">Your Name</label>
              <div className="relative">
                <Corners size={5} weight={1} color="text-zinc-700" />
                <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Enter a name..." maxLength={15} autoFocus
                  className="w-full bg-zinc-900 border border-zinc-800 p-3 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-zinc-500 transition-all" />
              </div>
            </div>
            <div className="relative">
              <Corners size={5} weight={1} color="text-zinc-500" />
              <button type="submit" disabled={!guestName.trim()} className="w-full bg-white text-black py-3 font-bold text-xs uppercase tracking-widest hover:bg-zinc-200 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                Join Room
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (roomNotFound) return (
    <div className="h-screen bg-[#0a0a0a] flex flex-col items-center justify-center font-sans text-white">
      <p className="text-5xl font-black font-fredoka mb-3">404</p>
      <p className="text-zinc-600 text-xs mb-8 uppercase tracking-widest">Room not found</p>
      <button onClick={() => router.push('/')} className="bg-white text-black px-8 py-3 text-xs font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all">Back to Home</button>
    </div>
  );

  if (!room || !player) return (
    <div className="h-screen bg-[#0a0a0a] flex items-center justify-center text-[10px] text-zinc-700 uppercase tracking-widest animate-pulse">Loading...</div>
  );

  const isDrawer = room.currentRound?.drawerId === player.id;

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/room/${roomId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleVoteSkip = async () => { if (isDrawer) return; await updateDoc(doc(db, 'rooms', roomId), { [`votes.skip.${player.id}`]: true }); };
  const handleReaction = async (emoji: string) => { await updateDoc(doc(db, 'rooms', roomId), { [`reactions.${player.id}`]: { emoji, timestamp: Date.now() } }); };
  const handleLeave = async () => { await deleteDoc(doc(db, `rooms/${roomId}/players`, player.id)); router.push('/'); };

  // Draggable bottom sheet — DOM-direct, zero re-renders during drag
  const onDragStart = (e: React.PointerEvent) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    dragStartY.current = e.clientY;
    dragStartHeight.current = sheet.offsetHeight / window.innerHeight * 100;
    isDraggingRef.current = true;
    // Disable transition while dragging
    sheet.style.transition = 'none';
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || dragStartY.current === null) return;
    const dy = dragStartY.current - e.clientY;
    const newH = Math.min(95, Math.max(20, dragStartHeight.current + (dy / window.innerHeight) * 100));
    if (sheetRef.current) sheetRef.current.style.height = `${newH}vh`;
  };
  const onDragEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const currentH = sheet.offsetHeight / window.innerHeight * 100;
    // Re-enable transition for snap
    sheet.style.transition = 'transform 300ms ease-out';
    if (currentH < 25) {
      setChatOpen(false);
      sheet.style.height = '70vh'; // reset for next open
    }
    dragStartY.current = null;
  };

  const ChatOverlay = () => (
    <>
      {/* FAB — mobile only (hidden on md+) */}
      <button
        onClick={() => { if (sheetRef.current) sheetRef.current.style.height = '70vh'; setChatOpen(o => !o); }}
        className="md:hidden fixed bottom-16 right-3 z-40 w-11 h-11 bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors shadow-lg"
      >
        {chatOpen ? <X size={16} /> : <MessageSquare size={16} />}
      </button>

      {/* Backdrop — mobile only */}
      {chatOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/60" onClick={() => setChatOpen(false)} />
      )}

      {/* Bottom sheet — mobile only */}
      <div
        ref={sheetRef}
        className={`md:hidden fixed inset-x-0 bottom-0 z-40 flex flex-col bg-[#0a0a0a] border-t border-zinc-800 transition-transform duration-300 ease-out ${
          chatOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ height: '70vh' }}
      >
        {/* Drag handle */}
        <div
          className="flex-shrink-0 cursor-ns-resize touch-none select-none border-b border-zinc-800"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 bg-zinc-700 rounded-full" />
          </div>
          <div className="flex items-center justify-between px-4 pb-2">
            <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold">Chat</span>
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={() => setChatOpen(false)}
              className="text-zinc-600 hover:text-white transition-colors p-1"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <Chat roomId={roomId} player={player!} players={players} secretWord={secretWord} isDrawer={isDrawer ?? false} isDrawing={room?.phase === 'drawing'} roundStartedAt={room?.currentRound?.startedAt} hideHeader />
        </div>
      </div>
    </>
  );

  // Shared top bar
  const TopBar = () => {
    const hints = room.settings.hints ?? 0;
    const hintInterval = room.settings.hintInterval ?? 20;
    const elapsed = room.currentRound ? (Date.now() - room.currentRound.startedAt) / 1000 : 0;
    const revealedCount = hints > 0 ? Math.min(hints, Math.floor(elapsed / hintInterval)) : 0;
    return (
      <header className="h-11 border-b border-zinc-800 bg-[#0a0a0a] flex items-center justify-between px-3 sm:px-4 flex-shrink-0 relative">
        <Corners size={6} weight={1} color="text-zinc-700" />
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="font-black font-fredoka text-base sm:text-lg text-white leading-none flex-shrink-0">Squiggle<span className="text-zinc-600">.</span></span>
          <div className="relative flex items-center gap-1 sm:gap-1.5 border border-zinc-800 px-2 py-1 text-[10px] font-bold flex-shrink-0">
            <Corners size={4} weight={1} color="text-zinc-700" />
            <span className="text-zinc-600 hidden sm:inline">ROOM:</span>
            <span className="text-white tracking-widest">{roomId}</span>
            <button onClick={copyLink} className="text-zinc-600 hover:text-white transition-colors ml-0.5">
              {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
            </button>
          </div>
          <button onClick={handleLeave} title="Leave room" className="text-zinc-700 hover:text-red-400 transition-colors flex-shrink-0"><LogOut size={12} /></button>
        </div>

        {room.currentRound && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {Array.from({ length: room.settings.rounds }).map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 ${i < room.currentRound!.roundNumber ? 'bg-white' : 'bg-zinc-700'}`} />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          {room.phase === 'drawing' && room.currentRound && (
            <>
              {isDrawer ? (
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest hidden sm:inline">
                  Drawing: <span className="text-white font-bold">{secretWord}</span>
                </span>
              ) : player.hasGuessed && secretWord ? (
                <span className="font-black text-base sm:text-lg tracking-[0.2em] sm:tracking-[0.25em] font-fredoka text-emerald-400">
                  {secretWord.split('').join(' ')}
                </span>
              ) : (
                <span className="font-black text-base sm:text-lg tracking-[0.2em] sm:tracking-[0.25em] font-fredoka">
                  {room.currentRound.wordMask.split('').join(' ')}
                </span>
              )}
              {hints > 0 && (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {Array.from({ length: hints }).map((_, i) => (
                    <div key={i} className={`w-1.5 h-1.5 ${i < revealedCount ? 'bg-yellow-400' : 'bg-zinc-700'}`} />
                  ))}
                </div>
              )}
              <span className={`font-black text-lg sm:text-xl w-7 sm:w-8 text-right tabular-nums flex-shrink-0 ${timeLeft <= 10 ? 'text-red-400' : 'text-white'}`}>
                {String(timeLeft).padStart(2, '0')}
              </span>
            </>
          )}
          {room.phase === 'drawing' && !isDrawer && !player.hasGuessed && (
            <button onClick={handleVoteSkip} disabled={!!room.votes?.skip?.[player.id]}
              className="text-[9px] uppercase tracking-widest text-zinc-600 hover:text-zinc-300 disabled:opacity-30 transition-colors hidden sm:block">
              {room.votes?.skip?.[player.id] ? 'voted' : 'skip'}
            </button>
          )}
          <FeedbackMenu />
        </div>
      </header>
    );
  };

  // ── LOBBY ──────────────────────────────────────────────────────────────────
  if (room.phase === 'lobby') {
    return (
      <div className="h-screen bg-[#0a0a0a] flex flex-col font-sans text-white overflow-hidden">
        <TopBar />
        {/* 
          Mobile: single column stack
          iPad (md–lg): 2 rows — top: waiting, bottom: settings + chat side by side
          Desktop (lg+): 3 columns — players | settings | chat
        */}

        {/* ── Desktop (lg+): 3-col row ── */}
        <div className="hidden lg:flex flex-1 overflow-hidden relative">
          <RoomDoodles variant="lobby" />
          <div className="flex-1 flex flex-col items-center justify-center p-8 border-r border-zinc-800 overflow-y-auto">
            <svg className="w-10 h-10 text-zinc-700 mb-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <h2 className="text-2xl font-black font-fredoka mb-2">Waiting for players...</h2>
            <p className="text-zinc-600 text-xs mb-6 text-center">Room code: <span className="text-white font-bold border border-zinc-700 px-2 py-0.5 ml-1 tracking-widest">{roomId}</span></p>
            {!player.isHost && <p className="text-[10px] text-zinc-600 animate-pulse uppercase tracking-widest">Waiting for host to start...</p>}
            <div className="mt-4 flex flex-wrap gap-3 justify-center max-w-sm">
              {players.map(p => (
                <div key={p.id} className="flex flex-col items-center gap-1.5">
                  <div className="w-10 h-10 border border-zinc-700 bg-zinc-900 overflow-hidden"><img src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${p.avatarId}`} alt={p.name} className="w-full h-full object-contain" /></div>
                  <span className="text-[10px] text-zinc-500 font-bold truncate max-w-[56px]">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="w-64 border-r border-zinc-800 flex-shrink-0 overflow-y-auto">
            {player.isHost ? <div className="p-4"><HostControls room={room} playerCount={players.length} onStart={() => startGame(roomId, players, room.settings)} /></div>
              : <div className="h-full flex items-center justify-center p-4"><p className="text-[10px] text-zinc-700 uppercase tracking-widest">Host is configuring...</p></div>}
          </div>
          <div className="w-64 flex-shrink-0">
            <Chat roomId={roomId} player={player} players={players} secretWord={null} isDrawer={false} isDrawing={false} />
          </div>
        </div>

        {/* ── iPad (md–lg): 2-row layout ── */}
        <div className="hidden md:flex lg:hidden flex-1 flex-col overflow-hidden relative">
          <RoomDoodles variant="lobby" />
          {/* Top row: waiting for players */}
          <div className="flex-1 flex flex-col items-center justify-center p-6 border-b border-zinc-800 overflow-y-auto">
            <svg className="w-8 h-8 text-zinc-700 mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <h2 className="text-xl font-black font-fredoka mb-2">Waiting for players...</h2>
            <p className="text-zinc-600 text-xs mb-4 text-center">Room code: <span className="text-white font-bold border border-zinc-700 px-2 py-0.5 ml-1 tracking-widest">{roomId}</span></p>
            {!player.isHost && <p className="text-[10px] text-zinc-600 animate-pulse uppercase tracking-widest">Waiting for host to start...</p>}
            <div className="mt-3 flex flex-wrap gap-3 justify-center max-w-md">
              {players.map(p => (
                <div key={p.id} className="flex flex-col items-center gap-1.5">
                  <div className="w-10 h-10 border border-zinc-700 bg-zinc-900 overflow-hidden"><img src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${p.avatarId}`} alt={p.name} className="w-full h-full object-contain" /></div>
                  <span className="text-[10px] text-zinc-500 font-bold truncate max-w-[56px]">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Bottom row: host settings (left) + chat (right) */}
          <div className="h-80 flex flex-shrink-0 border-t border-zinc-800">
            <div className="flex-1 border-r border-zinc-800 overflow-y-auto">
              {player.isHost ? <div className="p-3"><HostControls room={room} playerCount={players.length} onStart={() => startGame(roomId, players, room.settings)} /></div>
                : <div className="h-full flex items-center justify-center p-4"><p className="text-[10px] text-zinc-700 uppercase tracking-widest">Host is configuring...</p></div>}
            </div>
            <div className="flex-1 overflow-hidden">
              <Chat roomId={roomId} player={player} players={players} secretWord={null} isDrawer={false} isDrawing={false} />
            </div>
          </div>
        </div>

        {/* ── Mobile (<md): stacked ── */}
        <div className="flex md:hidden flex-1 flex-col overflow-hidden">
          <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto">
            <svg className="w-8 h-8 text-zinc-700 mb-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <h2 className="text-xl font-black font-fredoka mb-2">Waiting for players...</h2>
            <p className="text-zinc-600 text-xs mb-6 text-center">Room code: <span className="text-white font-bold border border-zinc-700 px-2 py-0.5 ml-1 tracking-widest">{roomId}</span></p>
            {!player.isHost && <p className="text-[10px] text-zinc-600 animate-pulse uppercase tracking-widest">Waiting for host to start...</p>}
            <div className="mt-4 flex flex-wrap gap-3 justify-center max-w-xs">
              {players.map(p => (
                <div key={p.id} className="flex flex-col items-center gap-1.5">
                  <div className="w-10 h-10 border border-zinc-700 bg-zinc-900 overflow-hidden"><img src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${p.avatarId}`} alt={p.name} className="w-full h-full object-contain" /></div>
                  <span className="text-[10px] text-zinc-500 font-bold truncate max-w-[56px]">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-zinc-800 overflow-y-auto max-h-64">
            {player.isHost ? <div className="p-4"><HostControls room={room} playerCount={players.length} onStart={() => startGame(roomId, players, room.settings)} /></div>
              : <div className="h-32 flex items-center justify-center"><p className="text-[10px] text-zinc-700 uppercase tracking-widest">Waiting for host...</p></div>}
          </div>
        </div>
        <PlayerStrip players={players} currentPlayer={player} />
        <ChatOverlay />
      </div>
    );
  }

  // ── CHOOSING ───────────────────────────────────────────────────────────────
  if (room.phase === 'choosing') {
    return (
      <div className="h-screen bg-[#0a0a0a] flex flex-col font-sans text-white overflow-hidden">
        <TopBar />
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col items-center justify-center bg-white">
            {isDrawer ? (
              <>
                <p className="text-black text-[10px] uppercase tracking-widest font-bold mb-6">Choose a word</p>
                <div className="flex flex-col sm:flex-row gap-3 px-4">
                  {room.wordChoices?.map(word => (
                    <button key={word} onClick={() => selectWord(roomId, word, room.currentRound!.drawerId)}
                      className="relative border border-black px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-bold text-black hover:bg-black hover:text-white transition-all">
                      <Corners size={6} weight={1} color="text-zinc-400" />
                      {word}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-zinc-400 text-sm animate-pulse uppercase tracking-widest px-4 text-center">
                {players.find(p => p.id === room.currentRound?.drawerId)?.name} is choosing...
              </p>
            )}
          </div>
          <div className="hidden lg:flex w-64 border-l border-zinc-800 flex-shrink-0">
            <Chat roomId={roomId} player={player} players={players} secretWord={secretWord} isDrawer={isDrawer} isDrawing={false} />
          </div>
        </div>
        <PlayerStrip players={players} drawerId={room.currentRound?.drawerId} currentPlayer={player} />
        <ChatOverlay />
      </div>
    );
  }

  // ── DRAWING ────────────────────────────────────────────────────────────────
  if (room.phase === 'drawing') {
    return (
      <div className="h-screen bg-[#0a0a0a] flex flex-col font-sans text-white overflow-hidden">
        <TopBar />
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 relative overflow-hidden">
            <RoomDoodles variant="drawing" />
            <FloatingEmojis room={room} />
            <Canvas roomId={roomId} isDrawer={isDrawer} />
            {!isDrawer && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-0.5 bg-[#0a0a0a] border border-zinc-800 px-2 py-1 z-10">
                {EMOJIS.map(emoji => (
                  <button key={emoji} onClick={() => handleReaction(emoji)} className="text-base hover:scale-125 transition-transform px-1 sm:px-1.5 py-0.5 active:scale-95">{emoji}</button>
                ))}
              </div>
            )}
            {/* Drawer word reminder — show on tablet and below */}
            {isDrawer && secretWord && (
              <div className="lg:hidden absolute top-2 left-1/2 -translate-x-1/2 bg-[#0a0a0a] border border-zinc-700 px-3 py-1 text-xs font-bold uppercase tracking-widest z-10">
                {secretWord}
              </div>
            )}
          </div>
          <div className="hidden lg:flex w-64 border-l border-zinc-800 flex-shrink-0">
            <Chat roomId={roomId} player={player} players={players} secretWord={secretWord} isDrawer={isDrawer} isDrawing={true} roundStartedAt={room.currentRound?.startedAt} />
          </div>
        </div>
        <PlayerStrip players={players} drawerId={room.currentRound?.drawerId} currentPlayer={player} />
        <ChatOverlay />
      </div>
    );
  }

  // ── REVEAL ─────────────────────────────────────────────────────────────────
  if (room.phase === 'reveal') {
    const isLastRound = room.currentRound
      ? room.currentRound.roundNumber >= room.settings.rounds &&
        players.findIndex(p => p.id === room.currentRound!.drawerId) >= players.length - 1
      : false;
    return (
      <div className="h-screen bg-[#0a0a0a] flex flex-col font-sans text-white overflow-hidden">
        <TopBar />
        <div className="flex-1 flex items-center justify-center flex-col px-4">
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-4">The word was</p>
          <div className="text-4xl sm:text-6xl font-black font-fredoka border border-zinc-700 px-8 sm:px-12 py-4 sm:py-6 mb-6 text-center">{room.reveal?.word}</div>
          <p className="text-[10px] text-zinc-600 animate-pulse uppercase tracking-widest">{isLastRound ? 'Game over soon...' : 'Next round starting...'}</p>
        </div>
        <PlayerStrip players={players} drawerId={room.currentRound?.drawerId} currentPlayer={player} />
      </div>
    );
  }

  // ── ENDED ──────────────────────────────────────────────────────────────────
  const winner = players[0];

  return (
    <div className="h-screen bg-[#0a0a0a] flex flex-col font-sans text-white overflow-hidden">
      <header className="h-11 border-b border-zinc-800 flex items-center justify-between px-4 flex-shrink-0 relative">
        <Corners size={6} weight={1} color="text-zinc-700" />
        <span className="font-black font-fredoka text-lg">Squiggle<span className="text-zinc-600">.</span></span>
        <FeedbackMenu />
      </header>
      <div className="flex-1 flex overflow-hidden flex-col md:flex-row relative">
        <RoomDoodles variant="gameover" />
        {/* Scores */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 gap-6 sm:gap-8 overflow-y-auto py-6">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Winner</p>
            <div className="flex items-center gap-3 border border-zinc-700 px-4 sm:px-6 py-3 relative">
              <Corners size={6} weight={1} color="text-zinc-600" />
              <div className="w-10 h-10 overflow-hidden border border-zinc-700 flex-shrink-0">
                <img src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${winner?.avatarId}`} alt={winner?.name} className="w-full h-full object-contain" />
              </div>
              <div>
                <div className="font-black text-xl font-fredoka">{winner?.name}</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">{winner?.score} pts</div>
              </div>
            </div>
          </div>
          <div className="w-full max-w-sm border border-zinc-800 relative">
            <Corners size={6} weight={1} color="text-zinc-700" />
            <div className="border-b border-zinc-800 px-4 py-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold">Final Scores</span>
            </div>
            {players.map((p, i) => {
              const isMe = p.id === player.id;
              const medals = ['🥇', '🥈', '🥉'];
              return (
                <div key={p.id} className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-900 last:border-0 ${isMe ? 'bg-zinc-900' : ''}`}>
                  <span className="text-base w-6 text-center flex-shrink-0">{i < 3 ? medals[i] : <span className="text-zinc-700 text-xs font-bold">{i + 1}</span>}</span>
                  <div className="w-8 h-8 overflow-hidden border border-zinc-800 flex-shrink-0">
                    <img src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${p.avatarId}`} alt={p.name} className="w-full h-full object-contain" />
                  </div>
                  <span className={`flex-1 text-sm font-bold truncate ${isMe ? 'text-white' : 'text-zinc-300'}`}>
                    {p.name}{isMe && <span className="text-zinc-600 font-normal text-[10px] ml-1.5">you</span>}
                  </span>
                  <span className="text-sm font-black tabular-nums text-zinc-400">{p.score}</span>
                  <span className="text-[10px] text-zinc-700 uppercase">pts</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Corners size={5} weight={1} color="text-zinc-500" />
              <button onClick={() => player.isHost && updateDoc(doc(db, 'rooms', roomId), { phase: 'lobby' })} disabled={!player.isHost}
                className="bg-white text-black px-6 sm:px-8 py-3 font-bold text-xs uppercase tracking-widest hover:bg-zinc-200 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                title={player.isHost ? undefined : 'Waiting for host...'}>
                {player.isHost ? 'Play Again' : 'Waiting for host...'}
              </button>
            </div>
            <button onClick={handleLeave} className="border border-zinc-800 text-zinc-500 px-6 sm:px-8 py-3 font-bold text-xs uppercase tracking-widest hover:border-zinc-600 hover:text-zinc-300 transition-all">
              Leave
            </button>
          </div>
        </div>
        {/* Chat */}
        <div className="hidden md:flex w-64 border-l border-zinc-800 flex-shrink-0">
          <Chat roomId={roomId} player={player} players={players} secretWord={null} isDrawer={false} isDrawing={false} />
        </div>
      </div>
      <ChatOverlay />
    </div>
  );
}
