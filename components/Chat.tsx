'use client';

import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { ChatMessage, Player } from '@/lib/types';
import { sendChatMessage } from '@/lib/gameLogic';
import { Send, MessageSquare } from 'lucide-react';
import { playSound } from '@/lib/sounds';
import { motion, AnimatePresence } from 'motion/react';
import Corners from '@/components/Corner';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function ordinalSuffix(n: number) {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

function Avatar({ seed, size = 6 }: { seed?: string; size?: number }) {
  const px = size * 4; // tailwind size unit → px
  if (!seed) return <div style={{ width: px, height: px }} className="flex-shrink-0" />;
  return (
    <img
      src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`}
      alt=""
      style={{ width: px, height: px }}
      className="flex-shrink-0 object-contain"
    />
  );
}

export default function Chat({
  roomId, player, players = [], secretWord, isDrawer, roundStartedAt, isDrawing, hideHeader
}: {
  roomId: string;
  player: Player;
  players?: Player[];
  secretWord: string | null;
  isDrawer: boolean;
  roundStartedAt?: number;
  isDrawing?: boolean;
  hideHeader?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const correctGuesses = messages.filter(m => m.isCorrect && !m.isSystem);

  // build a quick id→avatarId lookup from players list
  const avatarMap = Object.fromEntries(players.map(p => [p.id, p.avatarId]));

  useEffect(() => {
    const q = query(
      collection(db, `rooms/${roomId}/chat`),
      orderBy('timestamp', 'desc'),
      limit(60)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const msgs: ChatMessage[] = [];
      snapshot.forEach(d => msgs.push({ id: d.id, ...d.data() } as ChatMessage));
      const reversed = msgs.reverse();
      setMessages(prev => {
        if (prev.length > 0 && reversed.length > prev.length) {
          const newMsg = reversed[reversed.length - 1];
          if (newMsg.isCorrect && !newMsg.isSystem) playSound('correct');
        }
        return reversed;
      });
    });
    return () => unsub();
  }, [roomId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isDrawer) return;
    const text = input.trim();
    setInput('');
    await sendChatMessage(roomId, player, text, secretWord, roundStartedAt, isDrawing);
  };

  const visibleMessages = messages.filter(msg => {
    if (!isDrawing) return true;
    if (!msg.isGuessOnly) return true;
    return player.hasGuessed || isDrawer;
  });

  const inputDisabled = isDrawer || (isDrawing && player.hasGuessed);
  const inputPlaceholder = isDrawer
    ? 'You are drawing...'
    : isDrawing && player.hasGuessed
    ? 'Guessed! Chat with others...'
    : 'Type your guess...';

  return (
    <div className="bg-[#0a0a0a] h-full flex flex-col overflow-hidden">
      {/* Header */}
      {!hideHeader && (
      <div className="px-4 py-2.5 border-b border-zinc-800 flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare size={11} className="text-zinc-600" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Chat</span>
        </div>
        {isDrawing && correctGuesses.length > 0 && (
          <span className="text-[10px] font-bold text-emerald-600 tabular-nums">
            {correctGuesses.length} guessed
          </span>
        )}
      </div>
      )}

      {/* Guess queue */}
      {isDrawing && correctGuesses.length > 0 && (
        <div className="border-b border-zinc-800 flex-shrink-0">
          {correctGuesses.map((msg, i) => (
            <div key={msg.id} className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-900 last:border-b-0">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-zinc-600 w-5">{ordinalSuffix(i + 1)}</span>
                <Avatar seed={avatarMap[msg.senderId]} size={5} />
                <span className="text-[11px] font-bold text-emerald-400 truncate max-w-[80px]">{msg.senderName}</span>
              </div>
              <div className="flex items-center gap-2">
                {msg.roundTimestamp !== undefined && (
                  <span className="text-[9px] text-zinc-700 tabular-nums">{formatTime(msg.roundTimestamp)}</span>
                )}
                {msg.pointsEarned && (
                  <span className="text-[10px] font-black text-white">+{msg.pointsEarned}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <AnimatePresence initial={false}>
          {visibleMessages.map(msg => {
            // System message
            if (msg.isSystem && !msg.isCorrect) {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="px-4 py-2 text-[10px] text-zinc-700 italic border-b border-zinc-900"
                >
                  {msg.text}
                </motion.div>
              );
            }

            // Correct guess banner
            if (msg.isCorrect) {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mx-3 my-2 border border-emerald-800 bg-emerald-950 relative"
                >
                  <Corners size={5} weight={1} color="text-emerald-700" />
                  <div className="px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Avatar seed={avatarMap[msg.senderId]} size={6} />
                        <div>
                          <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider block">
                            {msg.guessOrder ? ordinalSuffix(msg.guessOrder) : ''}
                          </span>
                          <span className="text-[11px] font-black text-emerald-300 uppercase tracking-wide leading-none">
                            {msg.senderName}
                          </span>
                        </div>
                      </div>
                      {msg.pointsEarned && (
                        <span className="text-[13px] font-black text-white">+{msg.pointsEarned}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-emerald-600">✓</span>
                      <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Guessed it!</span>
                      {msg.roundTimestamp !== undefined && (
                        <span className="text-[9px] text-emerald-800 tabular-nums ml-auto">{formatTime(msg.roundTimestamp)}</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            }

            // Regular message
            const isMe = msg.senderId === player.id;
            const isPostGuess = msg.isGuessOnly;
            const avatarSeed = avatarMap[msg.senderId];
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`px-3 py-2 border-b border-zinc-900 flex gap-2 items-center ${isPostGuess ? 'bg-emerald-950/20' : ''}`}
              >
                <Avatar seed={avatarSeed} size={6} />
                <div className="min-w-0 flex-1">
                  <span className={`text-[10px] font-black uppercase tracking-wider mr-1.5 ${
                    isPostGuess ? 'text-emerald-600' : isMe ? 'text-zinc-300' : 'text-zinc-500'
                  }`}>
                    {msg.senderName}
                  </span>
                  <span className={`text-xs leading-snug break-words ${
                    isPostGuess ? 'text-emerald-400' : isMe ? 'text-zinc-200' : 'text-zinc-400'
                  }`}>
                    {msg.text}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex border-t border-zinc-800 flex-shrink-0 bg-[#0a0a0a]">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={inputDisabled}
          placeholder={inputPlaceholder}
          className={`flex-1 bg-transparent px-4 py-3 text-sm placeholder-zinc-700 focus:outline-none disabled:opacity-30 min-w-0 ${
            isDrawing && player.hasGuessed ? 'text-emerald-400' : 'text-white'
          }`}
        />
        <button
          type="submit"
          disabled={!input.trim() || inputDisabled}
          className="flex-shrink-0 w-12 flex items-center justify-center border-l border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-900 active:scale-95 transition-all disabled:opacity-20"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
