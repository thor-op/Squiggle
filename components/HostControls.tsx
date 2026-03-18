'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Room, RoomSettings } from '@/lib/types';
import { Play, ChevronDown, ChevronUp } from 'lucide-react';
import { rtdb } from '@/lib/firebase';
import { ref, update } from 'firebase/database';
import Corners from '@/components/Corner';

function Dropdown({ value, options, onChange }: {
  value: string | number;
  options: { label: string; value: string | number }[];
  onChange: (v: string | number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleOpen = () => {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(o => !o);
  };

  const selected = options.find(o => o.value === value);
  const popupW = Math.max(44, Math.max(...options.map(o => String(o.label).length)) * 8 + 20);

  const menu = rect && open ? (
    <div ref={menuRef} className="fixed bg-zinc-900 border border-zinc-700 shadow-xl overflow-y-auto"
      style={{ top: rect.bottom + 4, left: rect.right - popupW, width: popupW, zIndex: 9999, maxHeight: 200 }}>
      {options.map(opt => (
        <button key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false); }}
          className={`w-full text-left px-2.5 py-1.5 text-xs font-bold transition-colors ${opt.value === value ? 'bg-white text-black' : 'text-zinc-300 hover:bg-zinc-800'}`}>
          {opt.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <>
      <button ref={btnRef} type="button" onClick={handleOpen}
        className="flex items-center gap-1 font-bold text-xs text-white hover:text-zinc-300 transition-colors">
        {selected?.label ?? value}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {typeof document !== 'undefined' && menu && createPortal(menu, document.body)}
    </>
  );
}

export default function HostControls({ room, onStart, playerCount }: { room: Room; onStart: () => void; playerCount: number }) {
  const [showCustomWords, setShowCustomWords] = useState(false);

  const handleSettingChange = async (key: keyof RoomSettings, value: unknown) => {
    await update(ref(rtdb, `rooms/${room.id}/settings`), { [key]: value });
  };

  const hints = room.settings.hints ?? 2;
  const hintInterval = room.settings.hintInterval ?? 20;
  const wordCount = room.settings.wordCount ?? 3;
  const maxPlayers = room.settings.maxPlayers ?? 8;

  // Row: label + dropdown in a compact single line
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex justify-between items-center py-1.5 border-b border-zinc-900">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{label}</span>
      {children}
    </div>
  );

  return (
    <div className="w-full text-left">
      <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">Host Settings</p>

      {/* Compact rows */}
      <div className="border border-zinc-800 px-3 py-1 mb-2 relative">
        <Corners size={4} weight={1} color="text-zinc-800" />
        <Row label="Rounds">
          <Dropdown value={room.settings.rounds}
            options={[1,2,3,4,5,6,7,8,9,10].map(r => ({ label: String(r), value: r }))}
            onChange={(v) => handleSettingChange('rounds', v)} />
        </Row>
        <Row label="Draw Time">
          <Dropdown value={room.settings.drawTime}
            options={[30,45,60,80,100,120].map(t => ({ label: `${t}s`, value: t }))}
            onChange={(v) => handleSettingChange('drawTime', v)} />
        </Row>
        <Row label="Word Choices">
          <Dropdown value={wordCount}
            options={[2,3,4,5].map(n => ({ label: String(n), value: n }))}
            onChange={(v) => handleSettingChange('wordCount', v)} />
        </Row>
        <Row label="Max Players">
          <Dropdown value={maxPlayers}
            options={[2,3,4,5,6,8,10,12,16,20,30,40,50,60,80].map(n => ({ label: String(n), value: n }))}
            onChange={(v) => handleSettingChange('maxPlayers', v)} />
        </Row>
        <Row label="Hints">
          <Dropdown value={hints}
            options={[0,1,2,3,4,5].map(h => ({ label: h === 0 ? 'None' : String(h), value: h }))}
            onChange={(v) => handleSettingChange('hints', v)} />
        </Row>
        {hints > 0 && (
          <Row label="Hint Every">
            <Dropdown value={hintInterval}
              options={[10,15,20,25,30].map(s => ({ label: `${s}s`, value: s }))}
              onChange={(v) => handleSettingChange('hintInterval', v)} />
          </Row>
        )}
      </div>

      {/* Categories — compact pill row */}
      <div className="mb-2">
        <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5">Categories</p>
        <div className="flex flex-wrap gap-1">
          {['Animals', 'Food', 'Movies', 'Tech', 'Countries', 'Objects'].map(cat => (
            <button key={cat} type="button"
              onClick={() => {
                const newCats = room.settings.categories.includes(cat)
                  ? room.settings.categories.filter(c => c !== cat)
                  : [...room.settings.categories, cat];
                if (newCats.length > 0) handleSettingChange('categories', newCats);
              }}
              className={`px-2 py-0.5 border text-[9px] font-bold uppercase tracking-wider transition-all ${
                room.settings.categories.includes(cat)
                  ? 'bg-white text-black border-white'
                  : 'text-zinc-600 border-zinc-800 hover:border-zinc-600 hover:text-zinc-300'
              }`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Words — collapsible */}
      <div className="mb-3">
        <button type="button" onClick={() => setShowCustomWords(o => !o)}
          className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors mb-1.5">
          Custom Words
          {showCustomWords ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
        {showCustomWords && (
          <textarea value={room.settings.customWords || ''} onChange={(e) => handleSettingChange('customWords', e.target.value)}
            placeholder="apple, banana, cherry..."
            className="w-full text-xs bg-zinc-900 text-white border border-zinc-800 p-2 outline-none resize-none h-14 placeholder-zinc-700 focus:border-zinc-600 transition-all" />
        )}
      </div>

      {/* Start */}
      <div className="relative">
        <Corners size={5} weight={1} color="text-zinc-500" />
        <button type="button" onClick={onStart} disabled={playerCount < 2}
          className="w-full bg-white text-black py-2.5 font-bold text-xs tracking-widest uppercase flex items-center justify-center gap-2 hover:bg-zinc-200 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed">
          <Play size={11} fill="currentColor" />
          Start Game
        </button>
        {playerCount < 2 && (
          <p className="text-[9px] text-zinc-600 text-center mt-1.5 uppercase tracking-widest">Need at least 2 players</p>
        )}
      </div>
    </div>
  );
}
