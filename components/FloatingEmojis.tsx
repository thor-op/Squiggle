import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Room } from '@/lib/types';

interface FloatingEmoji {
  id: string;
  emoji: string;
  x: number;
}

export default function FloatingEmojis({ room }: { room: Room | null }) {
  const [emojis, setEmojis] = useState<FloatingEmoji[]>([]);
  const [lastTimestamps, setLastTimestamps] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!room?.reactions) return;

    const newEmojis: FloatingEmoji[] = [];
    const newTimestamps = { ...lastTimestamps };

    Object.entries(room.reactions).forEach(([playerId, reaction]) => {
      if (reaction.timestamp > (lastTimestamps[playerId] || 0)) {
        newEmojis.push({
          id: `${playerId}-${reaction.timestamp}`,
          emoji: reaction.emoji,
          x: Math.random() * 80 + 10, // 10% to 90% width
        });
        newTimestamps[playerId] = reaction.timestamp;
      }
    });

    if (newEmojis.length > 0) {
      const timer = setTimeout(() => {
        setEmojis(prev => [...prev, ...newEmojis].slice(-20)); // Keep max 20
        setLastTimestamps(newTimestamps);
      }, 0);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.reactions]);

  useEffect(() => {
    if (emojis.length === 0) return;
    const timer = setTimeout(() => {
      setEmojis(prev => prev.filter(e => Date.now() - parseInt(e.id.split('-')[1]) < 3000));
    }, 3000);
    return () => clearTimeout(timer);
  }, [emojis]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
      <AnimatePresence>
        {emojis.map(e => (
          <motion.div
            key={e.id}
            initial={{ opacity: 0, y: 50, scale: 0.5 }}
            animate={{ opacity: 1, y: -200, scale: 1.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2, ease: "easeOut" }}
            className="absolute bottom-0 text-4xl"
            style={{ left: `${e.x}%` }}
          >
            {e.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
