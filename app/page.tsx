'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getPlayerProfile, setPlayerProfile, generateRoomId } from '@/lib/store';
import { motion } from 'motion/react';
import { Dices, Play, Users, Bug, Lightbulb } from 'lucide-react';
import Corners from '@/components/Corner';

const TRASH_DRAWINGS = [
  <svg key="house" width="64" height="60" viewBox="0 0 64 60" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4,28 32,6 60,28" /><rect x="12" y="28" width="40" height="28" /><rect x="26" y="38" width="12" height="18" /><rect x="16" y="32" width="10" height="10" />
  </svg>,
  <svg key="sun" width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="28" cy="28" r="10" /><line x1="28" y1="4" x2="28" y2="12" /><line x1="28" y1="44" x2="28" y2="52" /><line x1="4" y1="28" x2="12" y2="28" /><line x1="44" y1="28" x2="52" y2="28" /><line x1="11" y1="11" x2="17" y2="17" /><line x1="39" y1="39" x2="45" y2="45" /><line x1="45" y1="11" x2="39" y2="17" /><line x1="11" y1="45" x2="17" y2="39" />
  </svg>,
  <svg key="cat" width="52" height="52" viewBox="0 0 52 52" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="26" cy="30" rx="18" ry="16" /><polygon points="10,18 6,4 18,14" /><polygon points="42,18 46,4 34,14" /><circle cx="20" cy="28" r="2.5" /><circle cx="32" cy="28" r="2.5" /><path d="M22,34 Q26,38 30,34" /><line x1="10" y1="32" x2="2" y2="30" /><line x1="10" y1="35" x2="2" y2="36" /><line x1="42" y1="32" x2="50" y2="30" /><line x1="42" y1="35" x2="50" y2="36" />
  </svg>,
  <svg key="star" width="52" height="52" viewBox="0 0 52 52" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="26,4 31,19 47,19 34,29 39,45 26,35 13,45 18,29 5,19 21,19" />
  </svg>,
  <svg key="fish" width="64" height="44" viewBox="0 0 64 44" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="30" cy="22" rx="20" ry="14" /><polygon points="50,22 62,10 62,34" /><circle cx="20" cy="18" r="2.5" /><path d="M24,26 Q30,30 36,26" />
  </svg>,
  <svg key="bolt" width="36" height="56" viewBox="0 0 36 56" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22,2 8,28 18,28 14,54 28,24 18,24 22,2" />
  </svg>,
  <svg key="shroom" width="52" height="60" viewBox="0 0 52 60" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10,32 Q4,16 26,8 Q48,16 42,32 Z" /><path d="M18,32 Q18,52 26,52 Q34,52 34,32" /><circle cx="18" cy="20" r="3" /><circle cx="32" cy="16" r="2" /><circle cx="26" cy="24" r="2.5" />
  </svg>,
  <svg key="smile" width="52" height="52" viewBox="0 0 52 52" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="26" cy="26" r="22" /><circle cx="18" cy="22" r="2.5" /><circle cx="34" cy="22" r="2.5" /><path d="M16,32 Q26,42 36,32" />
  </svg>,
  <svg key="arrow" width="56" height="40" viewBox="0 0 56 40" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4,20 Q20,8 40,20" /><polyline points="32,12 42,20 32,28" />
  </svg>,
  <svg key="crown" width="56" height="44" viewBox="0 0 56 44" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4,36 4,12 16,24 28,6 40,24 52,12 52,36 Z" /><line x1="4" y1="36" x2="52" y2="36" />
  </svg>,
  // pencil
  <svg key="pencil" width="48" height="56" viewBox="0 0 48 56" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="16" y="4" width="16" height="40" rx="2" /><polygon points="16,44 32,44 24,54" /><line x1="16" y1="12" x2="32" y2="12" />
  </svg>,
  // palette
  <svg key="palette" width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
    <path d="M28,6 Q50,6 50,28 Q50,44 36,48 Q28,52 22,44 Q18,38 26,36 Q34,34 28,28 Q20,20 6,28 Q6,6 28,6 Z" />
    <circle cx="18" cy="18" r="3" /><circle cx="32" cy="12" r="3" /><circle cx="42" cy="22" r="3" /><circle cx="44" cy="36" r="3" />
  </svg>,
  // speech bubble
  <svg key="bubble" width="60" height="52" viewBox="0 0 60 52" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="52" height="36" rx="6" /><polyline points="14,40 10,52 26,40" /><line x1="14" y1="18" x2="46" y2="18" /><line x1="14" y1="26" x2="36" y2="26" />
  </svg>,
  // trophy
  <svg key="trophy" width="52" height="60" viewBox="0 0 52 60" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14,6 L14,28 Q14,44 26,44 Q38,44 38,28 L38,6 Z" /><line x1="4" y1="6" x2="14" y2="6" /><line x1="38" y1="6" x2="48" y2="6" /><path d="M4,6 Q4,22 14,24" /><path d="M48,6 Q48,22 38,24" /><line x1="26" y1="44" x2="26" y2="52" /><line x1="14" y1="52" x2="38" y2="52" />
  </svg>,
  // eye
  <svg key="eye" width="60" height="36" viewBox="0 0 60 36" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
    <path d="M4,18 Q18,4 30,4 Q42,4 56,18 Q42,32 30,32 Q18,32 4,18 Z" /><circle cx="30" cy="18" r="8" /><circle cx="30" cy="18" r="3" />
  </svg>,
  // flame
  <svg key="flame" width="40" height="60" viewBox="0 0 40 60" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20,56 Q4,48 4,34 Q4,22 14,16 Q10,28 20,28 Q16,18 22,6 Q34,18 36,30 Q40,44 20,56 Z" />
  </svg>,
  // diamond
  <svg key="diamond" width="52" height="52" viewBox="0 0 52 52" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="26,4 48,20 26,48 4,20" /><line x1="4" y1="20" x2="48" y2="20" /><line x1="16" y1="20" x2="26" y2="4" /><line x1="36" y1="20" x2="26" y2="4" />
  </svg>,
  // question mark
  <svg key="question" width="36" height="56" viewBox="0 0 36 56" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
    <path d="M6,16 Q6,4 18,4 Q30,4 30,14 Q30,22 18,26 L18,34" /><circle cx="18" cy="44" r="2.5" />
  </svg>,
];

const BG_ITEMS = [
  // avatars — spread all around
  { type: 'avatar', seed: 'xkcd',   x: '6%',  y: '9%',  r: -12, s: 0.9 },
  { type: 'avatar', seed: 'chaos',  x: '89%', y: '7%',  r: 8,   s: 1.0 },
  { type: 'avatar', seed: 'blob',   x: '4%',  y: '72%', r: 15,  s: 0.85 },
  { type: 'avatar', seed: 'nerd',   x: '92%', y: '68%', r: -10, s: 1.0 },
  { type: 'avatar', seed: 'goof',   x: '50%', y: '93%', r: 6,   s: 0.9 },
  { type: 'avatar', seed: 'zap',    x: '19%', y: '87%', r: -8,  s: 0.8 },
  { type: 'avatar', seed: 'wham',   x: '79%', y: '84%', r: 12,  s: 0.95 },
  { type: 'avatar', seed: 'bonk',   x: '93%', y: '38%', r: -5,  s: 0.9 },
  { type: 'avatar', seed: 'yeet',   x: '3%',  y: '44%', r: 9,   s: 0.85 },
  { type: 'avatar', seed: 'bruh',   x: '60%', y: '90%', r: -14, s: 1.0 },
  { type: 'avatar', seed: 'dork',   x: '35%', y: '5%',  r: 7,   s: 0.8 },
  { type: 'avatar', seed: 'pixel',  x: '75%', y: '18%', r: -9,  s: 0.9 },
  // doodles — fill the gaps
  { type: 'draw', idx: 0,  x: '14%', y: '22%', r: -15, s: 1.1 },
  { type: 'draw', idx: 1,  x: '83%', y: '30%', r: 10,  s: 1.0 },
  { type: 'draw', idx: 2,  x: '9%',  y: '54%', r: 5,   s: 0.9 },
  { type: 'draw', idx: 3,  x: '88%', y: '50%', r: -8,  s: 1.1 },
  { type: 'draw', idx: 4,  x: '28%', y: '80%', r: 18,  s: 0.85 },
  { type: 'draw', idx: 5,  x: '66%', y: '13%', r: -6,  s: 1.0 },
  { type: 'draw', idx: 6,  x: '54%', y: '82%', r: 12,  s: 0.9 },
  { type: 'draw', idx: 7,  x: '2%',  y: '30%', r: -20, s: 0.8 },
  { type: 'draw', idx: 8,  x: '73%', y: '58%', r: 7,   s: 1.0 },
  { type: 'draw', idx: 9,  x: '42%', y: '4%',  r: -5,  s: 0.9 },
  { type: 'draw', idx: 10, x: '22%', y: '60%', r: 14,  s: 0.85 },
  { type: 'draw', idx: 11, x: '86%', y: '15%', r: -11, s: 1.0 },
  { type: 'draw', idx: 12, x: '48%', y: '70%', r: 8,   s: 0.9 },
  { type: 'draw', idx: 13, x: '6%',  y: '16%', r: -7,  s: 1.1 },
  { type: 'draw', idx: 14, x: '70%', y: '76%', r: 16,  s: 0.8 },
  { type: 'draw', idx: 15, x: '32%', y: '94%', r: -3,  s: 0.9 },
  { type: 'draw', idx: 16, x: '58%', y: '44%', r: 11,  s: 1.0 },
];

export default function LandingPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [avatarSeed, setAvatarSeed] = useState('');
  const [roomCode, setRoomCode] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      const profile = getPlayerProfile();
      if (profile.name) setName(profile.name);
      setAvatarSeed(profile.avatarId || Math.random().toString(36).substring(7));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleCreateRoom = () => {
    if (!name.trim()) return;
    setPlayerProfile(name, avatarSeed);
    const newRoomId = generateRoomId();
    router.push(`/room/${newRoomId}?name=${encodeURIComponent(name)}&avatarId=${avatarSeed}`);
  };

  const handleJoinRoom = () => {
    if (!name.trim() || !roomCode.trim()) return;
    setPlayerProfile(name, avatarSeed);
    router.push(`/room/${roomCode.toUpperCase()}?name=${encodeURIComponent(name)}&avatarId=${avatarSeed}`);
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4 font-sans text-zinc-100 relative overflow-hidden">

      {/* Background chaos */}
      {BG_ITEMS.map((item, i) => (
        <div
          key={i}
          className="absolute pointer-events-none select-none"
          style={{
            left: item.x,
            top: item.y,
            transform: `translate(-50%, -50%) rotate(${item.r}deg) scale(${item.s})`,
            opacity: 0.18,
          }}
        >
          {item.type === 'avatar' ? (
            <img
              src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${(item as {seed:string}).seed}`}
              alt=""
              width={64}
              height={64}
              className="w-16 h-16"
            />
          ) : (
            TRASH_DRAWINGS[(item as {idx:number}).idx % TRASH_DRAWINGS.length]
          )}
        </div>
      ))}

      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="max-w-sm w-full border border-zinc-800 bg-zinc-950 p-8 relative z-10"
      >
        <Corners size={10} weight={1} color="text-zinc-500" />

        {/* Logo */}
        <div className="mb-8 border-b border-zinc-800 pb-6">
          <h1 className="text-4xl font-black tracking-tight font-fredoka text-white">
            Squiggle<span className="text-zinc-500">.</span>
          </h1>
          <p className="text-zinc-600 uppercase tracking-widest text-[10px] font-semibold mt-1">
            Draw & Guess Multiplayer
          </p>
        </div>

        <div className="space-y-5">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0 w-16 h-16">
              <Corners size={6} weight={1} color="text-zinc-600" />
              <div className="w-full h-full bg-zinc-900 border border-zinc-800 overflow-hidden">
                {avatarSeed && (
                  <img
                    src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${avatarSeed}`}
                    alt="Avatar"
                    className="w-full h-full object-contain scale-110"
                  />
                )}
              </div>
            </div>
            <div className="flex-1">
              <p className="text-zinc-600 text-[10px] uppercase tracking-wider font-semibold mb-1.5">Avatar</p>
              <button
                onClick={() => setAvatarSeed(Math.random().toString(36).substring(7))}
                className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 border border-zinc-700 px-3 py-1.5 hover:border-zinc-400 hover:text-white transition-all"
              >
                <Dices size={13} />
                Randomize
              </button>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">
              Your Name
            </label>
            <div className="relative">
              <Corners size={6} weight={1} color="text-zinc-700" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                placeholder="Enter a name..."
                maxLength={15}
                className="w-full bg-zinc-900 border border-zinc-800 p-3 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-zinc-500 transition-all"
              />
            </div>
          </div>

          {/* Create Room */}
          <div className="relative">
            <Corners size={6} weight={1} color="text-zinc-500" />
            <button
              onClick={handleCreateRoom}
              disabled={!name.trim()}
              className="w-full bg-white text-black p-3 font-bold text-sm flex items-center justify-center gap-2 hover:bg-zinc-200 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-wider"
            >
              <Users size={16} />
              Create Private Room
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-zinc-800" />
            <span className="text-zinc-700 text-[10px] font-semibold uppercase tracking-wider">or join</span>
            <div className="flex-1 border-t border-zinc-800" />
          </div>

          {/* Join Room */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Corners size={6} weight={1} color="text-zinc-700" />
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                placeholder="ROOM CODE"
                maxLength={6}
                className="w-full bg-zinc-900 border border-zinc-800 p-3 font-bold text-center text-sm uppercase text-white placeholder-zinc-700 focus:outline-none focus:border-zinc-500 transition-all tracking-widest"
              />
            </div>
            <div className="relative">
              <Corners size={6} weight={1} color="text-zinc-600" />
              <button
                onClick={handleJoinRoom}
                disabled={!name.trim() || roomCode.length !== 6}
                className="h-full bg-zinc-800 text-white border border-zinc-700 px-4 flex items-center justify-center hover:bg-zinc-700 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Play size={16} fill="currentColor" />
              </button>
            </div>
          </div>

          {/* Feedback links — inside card at bottom */}
          <div className="flex items-center justify-center gap-4 pt-2 border-t border-zinc-900">
            <a
              href="https://github.com/thor-op/squiggle/issues/new?template=bug_report.yml"
              target="_blank" rel="noopener noreferrer"
              className="text-[10px] uppercase tracking-widest text-zinc-700 hover:text-zinc-400 transition-colors flex items-center gap-1.5"
            >
              <Bug size={10} /> Report a bug
            </a>
            <span className="text-zinc-800">·</span>
            <a
              href="https://github.com/thor-op/squiggle/issues/new?template=feedback.yml"
              target="_blank" rel="noopener noreferrer"
              className="text-[10px] uppercase tracking-widest text-zinc-700 hover:text-zinc-400 transition-colors flex items-center gap-1.5"
            >
              <Lightbulb size={10} /> Give feedback
            </a>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
