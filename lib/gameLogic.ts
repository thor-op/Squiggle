import { rtdb } from './firebase';
import { ref, set, update, get, push } from 'firebase/database';
import { Room, Player, RoomSettings } from './types';

export async function fetchWordChoices(categories: string[], customWords: string, count: number): Promise<string[]> {
  const res = await fetch('/api/game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'getWordChoices', categories, customWords, wordCount: count }),
  });
  const data = await res.json();
  return data.choices ?? ['apple', 'banana', 'cat'];
}

/** Reveal one random hidden letter in the mask */
export function revealHintLetter(word: string, currentMask: string): string {
  const hidden: number[] = [];
  for (let i = 0; i < word.length; i++) {
    if (word[i] !== ' ' && currentMask[i] === '_') hidden.push(i);
  }
  if (hidden.length === 0) return currentMask;
  const idx = hidden[Math.floor(Math.random() * hidden.length)];
  return currentMask.substring(0, idx) + word[idx] + currentMask.substring(idx + 1);
}

export async function createOrJoinRoom(roomId: string, player: Player) {
  const roomRef = ref(rtdb, `rooms/${roomId}`);
  const snap = await get(roomRef);

  if (!snap.exists()) {
    await set(roomRef, {
      hostId: player.id,
      phase: 'lobby',
      settings: {
        rounds: 3,
        drawTime: 80,
        hints: 2,
        hintInterval: 20,
        wordCount: 3,
        maxPlayers: 8,
        categories: { Animals: true, Food: true, Objects: true },
        customWords: ''
      },
      createdAt: Date.now(),
      lastActive: Date.now()
    });

    await set(ref(rtdb, `canvas/${roomId}`), {
      completedStrokes: '[]',
      activeStroke: null,
      clearedAt: 0,
      lastUpdate: Date.now()
    });
  }

  // Enforce max players
  if (snap.exists()) {
    const roomData = snap.val();
    const playersSnap = await get(ref(rtdb, `players/${roomId}`));
    const maxPlayers = roomData.settings?.maxPlayers ?? 8;
    const existing = playersSnap.exists() ? playersSnap.val() : {};
    const alreadyIn = Object.keys(existing).includes(player.id);
    if (!alreadyIn && Object.keys(existing).length >= maxPlayers) {
      throw new Error('Room is full');
    }
  }

  const roomData = snap.exists() ? snap.val() : null;
  await set(ref(rtdb, `players/${roomId}/${player.id}`), {
    name: player.name,
    avatarId: player.avatarId,
    score: player.score || 0,
    streak: player.streak || 0,
    connected: true,
    isHost: roomData ? roomData.hostId === player.id : true,
    hasGuessed: false
  });

  await sendSystemMessage(roomId, `${player.name} joined the room!`);
}

export async function sendSystemMessage(roomId: string, text: string, isCorrect = false) {
  const msgRef = push(ref(rtdb, `chat/${roomId}`));
  await set(msgRef, {
    text,
    senderId: 'system',
    senderName: 'System',
    isSystem: true,
    isCorrect,
    isGuessOnly: false,
    timestamp: Date.now()
  });
}

export async function sendChatMessage(
  roomId: string,
  player: Player,
  text: string,
  secretWord: string | null,
  roundStartedAt?: number,
  isDrawing?: boolean
) {
  if (!text.trim()) return false;

  if (isDrawing) {
    const res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'guess',
        roomId,
        playerId: player.id,
        playerName: player.name,
        guess: text.trim(),
        roundStartedAt,
      }),
    });
    const data = await res.json();
    if (data.correct) return true;
    if (data.reason === 'already guessed') {
      const msgRef = push(ref(rtdb, `chat/${roomId}`));
      await set(msgRef, {
        text: text.trim(),
        senderId: player.id,
        senderName: player.name,
        isSystem: false,
        isCorrect: false,
        isGuessOnly: true,
        roundTimestamp: roundStartedAt ? Math.floor((Date.now() - roundStartedAt) / 1000) : 0,
        timestamp: Date.now(),
      });
      return false;
    }
    const msgRef = push(ref(rtdb, `chat/${roomId}`));
    await set(msgRef, {
      text: text.trim(),
      senderId: player.id,
      senderName: player.name,
      isSystem: false,
      isCorrect: false,
      isGuessOnly: player.hasGuessed,
      roundTimestamp: roundStartedAt ? Math.floor((Date.now() - roundStartedAt) / 1000) : 0,
      timestamp: Date.now(),
    });
    return false;
  }

  const msgRef = push(ref(rtdb, `chat/${roomId}`));
  await set(msgRef, {
    text: text.trim(),
    senderId: player.id,
    senderName: player.name,
    isSystem: false,
    isCorrect: false,
    isGuessOnly: player.hasGuessed,
    roundTimestamp: roundStartedAt ? Math.floor((Date.now() - roundStartedAt) / 1000) : 0,
    timestamp: Date.now()
  });
  return false;
}

export async function startGame(roomId: string, players: Player[], settings: RoomSettings, prefetchedChoices?: string[]) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const turnOrder = shuffled.map(p => p.id);
  const firstDrawer = shuffled[0];
  if (!firstDrawer) return;

  const wordCount = settings.wordCount ?? 3;

  const [choices] = await Promise.all([
    prefetchedChoices
      ? Promise.resolve(prefetchedChoices)
      : fetchWordChoices(
          Array.isArray(settings.categories)
            ? settings.categories
            : Object.keys(settings.categories as Record<string, boolean>),
          settings.customWords,
          wordCount
        ),
    (async () => {
      const updates: Record<string, unknown> = {};
      players.forEach(p => {
        updates[`players/${roomId}/${p.id}/score`] = 0;
        updates[`players/${roomId}/${p.id}/streak`] = 0;
        updates[`players/${roomId}/${p.id}/hasGuessed`] = false;
      });
      await update(ref(rtdb), updates);
    })(),
  ]);

  const msgRef = push(ref(rtdb, `chat/${roomId}`));
  const updates: Record<string, unknown> = {
    [`rooms/${roomId}/phase`]: 'choosing',
    [`rooms/${roomId}/wordChoices`]: choices,
    [`rooms/${roomId}/votes`]: { skip: {} },
    [`rooms/${roomId}/reactions`]: {},
    [`rooms/${roomId}/turnOrder`]: turnOrder,
    [`rooms/${roomId}/currentRound`]: {
      drawerId: firstDrawer.id,
      wordMask: '',
      wordLength: 0,
      startedAt: Date.now(),
      timeLimit: 15,
      roundNumber: 1,
      guessCount: 0
    },
    [`rooms/${roomId}/lastActive`]: Date.now(),
    [`chat/${roomId}/${msgRef.key}`]: {
      text: `Game started! ${firstDrawer.name} is choosing a word.`,
      senderId: 'system', senderName: 'System',
      isSystem: true, isCorrect: false, isGuessOnly: false,
      timestamp: Date.now()
    }
  };
  await update(ref(rtdb), updates);
}

export async function selectWord(roomId: string, word: string, drawerId: string, drawTime: number): Promise<number> {
  const res = await fetch('/api/game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'selectWord', roomId, word, drawerId, drawTime }),
  });
  const data = await res.json();
  // Return the authoritative startedAt from the server so the client timer is exact
  return data.startedAt ?? Date.now();
}

export async function endRound(roomId: string) {
  await fetch('/api/game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'endRound', roomId }),
  });
}

export async function nextTurn(roomId: string, room: Room, players: Player[], prefetchedChoices?: string[]) {
  if (!room.currentRound) return;

  const turnOrder = room.turnOrder ?? [...players].sort((a, b) => a.id.localeCompare(b.id)).map(p => p.id);
  const currentIndex = turnOrder.indexOf(room.currentRound.drawerId);
  let nextIndex = currentIndex + 1;
  let nextRoundNumber = room.currentRound.roundNumber;

  if (nextIndex >= turnOrder.length) { nextIndex = 0; nextRoundNumber++; }

  if (nextRoundNumber > room.settings.rounds) {
    await update(ref(rtdb, `rooms/${roomId}`), { phase: 'ended', lastActive: Date.now() });
    return;
  }

  const wordCount = room.settings.wordCount ?? 3;
  const nextDrawerId = turnOrder[nextIndex];
  const drawer = players.find(p => p.id === nextDrawerId);
  if (!drawer) { await update(ref(rtdb, `rooms/${roomId}`), { phase: 'ended', lastActive: Date.now() }); return; }

  const categories = Array.isArray(room.settings.categories)
    ? room.settings.categories
    : Object.keys(room.settings.categories as Record<string, boolean>);

  // Use pre-fetched choices if available, otherwise fetch now (fallback)
  const [choices] = await Promise.all([
    prefetchedChoices ?? fetchWordChoices(categories, room.settings.customWords, wordCount),
    (async () => {
      const updates: Record<string, unknown> = {};
      players.forEach(p => { updates[`players/${roomId}/${p.id}/hasGuessed`] = false; });
      await update(ref(rtdb), updates);
    })(),
  ]);

  const msgRef = push(ref(rtdb, `chat/${roomId}`));
  const updates: Record<string, unknown> = {
    [`rooms/${roomId}/phase`]: 'choosing',
    [`rooms/${roomId}/wordChoices`]: choices,
    [`rooms/${roomId}/votes`]: { skip: {} },
    [`rooms/${roomId}/reactions`]: {},
    [`rooms/${roomId}/currentRound`]: {
      drawerId: drawer.id,
      wordMask: '',
      wordLength: 0,
      startedAt: Date.now(),
      timeLimit: 15,
      roundNumber: nextRoundNumber,
      guessCount: 0
    },
    [`rooms/${roomId}/lastActive`]: Date.now(),
    [`chat/${roomId}/${msgRef.key}`]: {
      text: `Round ${nextRoundNumber}! ${drawer.name} is choosing a word.`,
      senderId: 'system', senderName: 'System',
      isSystem: true, isCorrect: false, isGuessOnly: false,
      timestamp: Date.now()
    }
  };
  await update(ref(rtdb), updates);
}
