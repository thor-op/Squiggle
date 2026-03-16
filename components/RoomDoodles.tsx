'use client';

// Lightweight scattered doodle decorations for room pages
// Positioned absolutely, pointer-events-none, low opacity

const DOODLES = [
  // pencil
  <svg key="pencil" width="40" height="48" viewBox="0 0 48 56" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="16" y="4" width="16" height="40" rx="2" /><polygon points="16,44 32,44 24,54" /><line x1="16" y1="12" x2="32" y2="12" />
  </svg>,
  // palette
  <svg key="palette" width="44" height="44" viewBox="0 0 56 56" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
    <path d="M28,6 Q50,6 50,28 Q50,44 36,48 Q28,52 22,44 Q18,38 26,36 Q34,34 28,28 Q20,20 6,28 Q6,6 28,6 Z" />
    <circle cx="18" cy="18" r="3" /><circle cx="32" cy="12" r="3" /><circle cx="42" cy="22" r="3" /><circle cx="44" cy="36" r="3" />
  </svg>,
  // star
  <svg key="star" width="40" height="40" viewBox="0 0 52 52" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="26,4 31,19 47,19 34,29 39,45 26,35 13,45 18,29 5,19 21,19" />
  </svg>,
  // speech bubble
  <svg key="bubble" width="48" height="40" viewBox="0 0 60 52" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="52" height="36" rx="6" /><polyline points="14,40 10,52 26,40" /><line x1="14" y1="18" x2="46" y2="18" /><line x1="14" y1="26" x2="36" y2="26" />
  </svg>,
  // crown
  <svg key="crown" width="44" height="36" viewBox="0 0 56 44" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4,36 4,12 16,24 28,6 40,24 52,12 52,36 Z" /><line x1="4" y1="36" x2="52" y2="36" />
  </svg>,
  // bolt
  <svg key="bolt" width="28" height="44" viewBox="0 0 36 56" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22,2 8,28 18,28 14,54 28,24 18,24 22,2" />
  </svg>,
  // flame
  <svg key="flame" width="32" height="48" viewBox="0 0 40 60" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20,56 Q4,48 4,34 Q4,22 14,16 Q10,28 20,28 Q16,18 22,6 Q34,18 36,30 Q40,44 20,56 Z" />
  </svg>,
  // trophy
  <svg key="trophy" width="40" height="48" viewBox="0 0 52 60" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14,6 L14,28 Q14,44 26,44 Q38,44 38,28 L38,6 Z" /><line x1="4" y1="6" x2="14" y2="6" /><line x1="38" y1="6" x2="48" y2="6" /><path d="M4,6 Q4,22 14,24" /><path d="M48,6 Q48,22 38,24" /><line x1="26" y1="44" x2="26" y2="52" /><line x1="14" y1="52" x2="38" y2="52" />
  </svg>,
  // eye
  <svg key="eye" width="48" height="28" viewBox="0 0 60 36" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
    <path d="M4,18 Q18,4 30,4 Q42,4 56,18 Q42,32 30,32 Q18,32 4,18 Z" /><circle cx="30" cy="18" r="8" /><circle cx="30" cy="18" r="3" />
  </svg>,
  // diamond
  <svg key="diamond" width="40" height="40" viewBox="0 0 52 52" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="26,4 48,20 26,48 4,20" /><line x1="4" y1="20" x2="48" y2="20" />
  </svg>,
  // smile
  <svg key="smile" width="40" height="40" viewBox="0 0 52 52" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="26" cy="26" r="22" /><circle cx="18" cy="22" r="2.5" /><circle cx="34" cy="22" r="2.5" /><path d="M16,32 Q26,42 36,32" />
  </svg>,
  // question
  <svg key="question" width="28" height="44" viewBox="0 0 36 56" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
    <path d="M6,16 Q6,4 18,4 Q30,4 30,14 Q30,22 18,26 L18,34" /><circle cx="18" cy="44" r="2.5" />
  </svg>,
];

// Preset layouts per variant so they don't overlap UI
const LAYOUTS: Record<string, { i: number; x: string; y: string; r: number; o: number }[]> = {
  lobby: [
    { i: 0, x: '2%',  y: '8%',  r: -15, o: 0.12 },
    { i: 1, x: '92%', y: '5%',  r: 12,  o: 0.10 },
    { i: 2, x: '88%', y: '55%', r: -8,  o: 0.10 },
    { i: 3, x: '3%',  y: '60%', r: 10,  o: 0.12 },
    { i: 5, x: '50%', y: '3%',  r: 5,   o: 0.08 },
    { i: 6, x: '75%', y: '88%', r: -12, o: 0.10 },
    { i: 9, x: '18%', y: '90%', r: 8,   o: 0.09 },
  ],
  drawing: [
    { i: 0, x: '1%',  y: '4%',  r: -10, o: 0.10 },
    { i:
 4, x: '94%', y: '3%',  r: 8,   o: 0.10 },
    { i: 5, x: '2%',  y: '80%', r: 15,  o: 0.09 },
    { i: 10, x: '92%', y: '78%', r: -6,  o: 0.09 },
  ],
  gameover: [
    { i: 7, x: '2%',  y: '5%',  r: -10, o: 0.13 },
    { i: 4, x: '88%', y: '4%',  r: 8,   o: 0.12 },
    { i: 2, x: '5%',  y: '70%', r: 12,  o: 0.11 },
    { i: 9, x: '90%', y: '65%', r: -8,  o: 0.11 },
    { i: 5, x: '45%', y: '2%',  r: 5,   o: 0.09 },
    { i: 11, x: '20%', y: '92%', r: -6,  o: 0.10 },
    { i: 6, x: '75%', y: '90%', r: 10,  o: 0.10 },
  ],
};

export default function RoomDoodles({ variant }: { variant: 'lobby' | 'drawing' | 'gameover' }) {
  const items = LAYOUTS[variant] ?? [];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {items.map((item, idx) => (
        <div
          key={idx}
          className="absolute"
          style={{
            left: item.x,
            top: item.y,
            opacity: item.o,
            transform: `rotate(${item.r}deg)`,
          }}
        >
          {DOODLES[item.i]}
        </div>
      ))}
    </div>
  );
}
