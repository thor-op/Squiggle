import { db } from './firebase';
import { doc, setDoc, updateDoc, getDoc, collection, writeBatch } from 'firebase/firestore';
import { Room, Player, RoomSettings } from './types';

async function fetchWordChoices(categories: string[], customWords: string, count: number): Promise<string[]> {
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
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnap = await getDoc(roomRef);

  if (!roomSnap.exists()) {
    await setDoc(roomRef, {
      hostId: player.id,
      phase: 'lobby',
      settings: {
        rounds: 3,
        drawTime: 80,
        hints: 2,
        hintInterval: 20,
        wordCount: 3,
        maxPlayers: 8,
        categories: ['Animals', 'Food', 'Objects'],
        customWords: ''
      },
      createdAt: Date.now(),
      lastActive: Date.now()
    });

    await setDoc(doc(db, `rooms/${roomId}/canvas/main`), {
      completedStrokes: '[]',
      activeStroke: null,
      clearedAt: 0,
      lastUpdate: Date.now()
    });
  }

  const playerRef = doc(db, `rooms/${roomId}/players`, player.id);

  // Enforce max players — count existing players (excluding self re-join)
  if (roomSnap.exists()) {
    const { getDocs, collection: col } = await import('firebase/firestore');
    const playersSnap = await getDocs(col(db, `rooms/${roomId}/players`));
    const maxPlayers = roomSnap.data().settings?.maxPlayers ?? 8;
    const alreadyIn = playersSnap.docs.some(d => d.id === player.id);
    if (!alreadyIn && playersSnap.size >= maxPlayers) {
      throw new Error('Room is full');
    }
  }

  await setDoc(playerRef, {
    name: player.name,
    avatarId: player.avatarId,
    score: player.score || 0,
    streak: player.streak || 0,
    connected: true,
    isHost: roomSnap.exists() ? roomSnap.data().hostId === player.id : true,
    hasGuessed: false
  }, { merge: true });

  await sendSystemMessage(roomId, `${player.name} joined the room!`);
}

export async function sendSystemMessage(roomId: string, text: string, isCorrect = false) {
  const msgRef = doc(collection(db, `rooms/${roomId}/chat`));
  await setDoc(msgRef, {
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

  // During drawing phase, always send to server for guess validation
  // (non-drawers don't have secretWord client-side — server checks it)
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
      // post as guessOnly so non-guessers can't see it
      const msgRef = doc(collection(db, `rooms/${roomId}/chat`));
      await setDoc(msgRef, {
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
    // Wrong guess — post as normal visible message
    const msgRef = doc(collection(db, `rooms/${roomId}/chat`));
    await setDoc(msgRef, {
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

  // Normal message — if player has already guessed, mark as guessOnly so non-guessers can't see it
  const msgRef = doc(collection(db, `rooms/${roomId}/chat`));
  await setDoc(msgRef, {
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

export async function startGame(roomId: string, players: Player[], settings: RoomSettings) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const turnOrder = shuffled.map(p => p.id);
  const firstDrawer = shuffled[0];
  if (!firstDrawer) return;

  const wordCount = settings.wordCount ?? 3;

  // Fetch word choices and reset scores in parallel
  const [choices] = await Promise.all([
    fetchWordChoices(settings.categories, settings.customWords, wordCount),
    (async () => {
      const batch = writeBatch(db);
      players.forEach(p => { batch.update(doc(db, `rooms/${roomId}/players`, p.id), { score: 0, streak: 0, hasGuessed: false }); });
      await batch.commit();
    })(),
  ]);

  await updateDoc(doc(db, 'rooms', roomId), {
    phase: 'choosing',
    wordChoices: choices,
    votes: { skip: {} },
    reactions: {},
    turnOrder,
    currentRound: {
      drawerId: firstDrawer.id,
      wordMask: '',
      wordLength: 0,
      startedAt: Date.now(),
      timeLimit: 15,
      roundNumber: 1,
      guessCount: 0
    },
    lastActive: Date.now()
  });

  await sendSystemMessage(roomId, `Game started! ${firstDrawer.name} is choosing a word.`);
}

export async function selectWord(roomId: string, word: string, drawerId: string, drawTime: number) {
  await fetch('/api/game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'selectWord', roomId, word, drawerId, drawTime }),
  });
}

export async function endRound(roomId: string) {
  await fetch('/api/game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'endRound', roomId }),
  });
}

export async function nextTurn(roomId: string, room: Room, players: Player[]) {
  if (!room.currentRound) return;

  const turnOrder = room.turnOrder ?? [...players].sort((a, b) => a.id.localeCompare(b.id)).map(p => p.id);

  const currentIndex = turnOrder.indexOf(room.currentRound.drawerId);
  let nextIndex = currentIndex + 1;
  let nextRoundNumber = room.currentRound.roundNumber;

  if (nextIndex >= turnOrder.length) {
    nextIndex = 0;
    nextRoundNumber++;
  }

  if (nextRoundNumber > room.settings.rounds) {
    await updateDoc(doc(db, 'rooms', roomId), { phase: 'ended', lastActive: Date.now() });
    return;
  }

  const wordCount = room.settings.wordCount ?? 3;
  const nextDrawerId = turnOrder[nextIndex];
  const nextDrawer = players.find(p => p.id === nextDrawerId);

  // Fetch word choices and reset player hasGuessed in parallel
  const [choices] = await Promise.all([
    fetchWordChoices(room.settings.categories, room.settings.customWords, wordCount),
    (async () => {
      const batch = writeBatch(db);
      players.forEach(p => { batch.update(doc(db, `rooms/${roomId}/players`, p.id), { hasGuessed: false }); });
      await batch.commit();
    })(),
  ]);

  const drawerId = nextDrawer?.id ?? (() => {
    const remaining = turnOrder.filter(id => players.some(p => p.id === id));
    return remaining[nextIndex % remaining.length];
  })();
  const drawer = players.find(p => p.id === drawerId);
  if (!drawer) { await updateDoc(doc(db, 'rooms', roomId), { phase: 'ended', lastActive: Date.now() }); return; }

  await updateDoc(doc(db, 'rooms', roomId), {
    phase: 'choosing',
    wordChoices: choices,
    votes: { skip: {} },
    reactions: {},
    currentRound: {
      drawerId: drawer.id,
      wordMask: '',
      wordLength: 0,
      startedAt: Date.now(),
      timeLimit: 15,
      roundNumber: nextRoundNumber,
      guessCount: 0
    },
    lastActive: Date.now()
  });

  await sendSystemMessage(roomId, `Round ${nextRoundNumber}! ${drawer.name} is choosing a word.`);
}
