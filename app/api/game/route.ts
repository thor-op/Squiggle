/**
 * Server-side game API — the secret word NEVER touches Firestore or the client directly.
 * Word is stored in server memory (Map) keyed by roomId.
 * All guess validation happens here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { initAdminApp } from '@/lib/firebaseAdmin';
import { getWordMask } from '@/lib/words';
import { revealHintLetter } from '@/lib/gameLogic';

/** Fetch random words from Firestore wordBank — never exposed to clients */
async function getRandomWordsFromDB(
  db: FirebaseFirestore.Firestore,
  categories: string[],
  customWordsStr: string = '',
  count: number = 3
): Promise<string[]> {
  let pool: { word: string; difficulty: string }[] = [];

  const cats = categories.length > 0 ? categories : ['Animals', 'Food', 'Objects'];
  await Promise.all(
    cats.map(async (cat) => {
      const snap = await db.doc(`wordBank/${cat}`).get();
      if (snap.exists) {
        const data = snap.data()!;
        pool = pool.concat(data.words ?? []);
      }
    })
  );

  if (customWordsStr) {
    customWordsStr.split(',').map(w => w.trim()).filter(Boolean).forEach(w => {
      pool.push({ word: w.toLowerCase(), difficulty: 'custom' });
    });
  }

  if (pool.length === 0) return ['apple', 'banana', 'cat'];
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count).map(w => w.word);
}

// In-memory word store: roomId → { word, drawerId, startedAt, hintsRevealed, totalGuessElapsed, wrongGuesses }
// NOTE: this resets on server restart (cold start). For production use Redis/KV.
const wordStore = new Map<string, {
  word: string;
  drawerId: string;
  startedAt: number;
  hintsRevealed: number;
  currentMask: string;
  drawTime: number;          // total draw time in seconds
  totalGuessElapsed: number; // sum of elapsed seconds for each correct guess (for drawer speed bonus)
  wrongGuesses: Record<string, number>; // playerId → wrong guess count
}>();

function getDb() {
  initAdminApp();
  return getFirestore();
}

/** Rehydrate wordStore from Firestore if the in-memory map was wiped (cold start / dev HMR) */
async function getEntry(roomId: string) {
  let entry = wordStore.get(roomId);
  if (entry) return entry;

  const db = getDb();
  const snap = await db.doc(`rooms/${roomId}/secrets/word`).get();
  if (!snap.exists) return null;
  const data = snap.data()!;

  // Also grab current mask from room doc (hints may have been revealed)
  const roomSnap = await db.doc(`rooms/${roomId}`).get();
  const currentMask = roomSnap.exists ? (roomSnap.data()!.currentRound?.wordMask ?? data.mask) : data.mask;

  entry = {
    word: data.value,
    drawerId: data.drawerId,
    startedAt: Date.now(),
    hintsRevealed: 0,
    currentMask,
    drawTime: 80,
    totalGuessElapsed: 0,
    wrongGuesses: {},
  };
  wordStore.set(roomId, entry);
  return entry;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === 'getWordChoices') {
    const { categories, customWords, wordCount } = body;
    const db = getDb();
    const choices = await getRandomWordsFromDB(db, categories ?? [], customWords ?? '', wordCount ?? 3);
    return NextResponse.json({ choices });
  }

  if (action === 'deleteRoom') {
    const { roomId } = body;
    if (!roomId) return NextResponse.json({ error: 'missing roomId' }, { status: 400 });
    const db = getDb();
    // recursiveDelete removes the doc + all subcollections (canvas, chat, players, secrets)
    await db.recursiveDelete(db.doc(`rooms/${roomId}`));
    wordStore.delete(roomId);
    return NextResponse.json({ ok: true });
  }

  if (action === 'selectWord') {
    // Called by host when drawer picks a word
    const { roomId, word, drawerId, drawTime } = body;
    if (!roomId || !word || !drawerId) return NextResponse.json({ error: 'missing fields' }, { status: 400 });

    const mask = getWordMask(word);
    wordStore.set(roomId, {
      word, drawerId,
      startedAt: Date.now(),
      hintsRevealed: 0,
      currentMask: mask,
      drawTime: drawTime ?? 80,
      totalGuessElapsed: 0,
      wrongGuesses: {},
    });

    const db = getDb();
    // Store word server-side in secrets (admin-only, client rules block reads)
    await db.doc(`rooms/${roomId}/secrets/word`).set({ value: word, drawerId, mask });
    await db.doc(`rooms/${roomId}`).update({
      phase: 'drawing',
      wordChoices: [],
      'currentRound.wordMask': mask,
      'currentRound.wordLength': word.length,
      'currentRound.startedAt': Date.now(),
      'currentRound.timeLimit': drawTime ?? 80,
      'currentRound.guessCount': 0,
      lastActive: Date.now(),
    });
    await db.doc(`rooms/${roomId}/canvas/main`).update({
      completedStrokes: '[]', activeStroke: null, clearedAt: Date.now(), lastUpdate: Date.now(),
    });

    return NextResponse.json({ ok: true, mask });
  }

  if (action === 'getWord') {
    // Drawer can always fetch. Guessers can fetch only after they've guessed correctly.
    const { roomId, playerId } = body;
    const entry = await getEntry(roomId);
    if (!entry) return NextResponse.json({ word: null });
    if (entry.drawerId !== playerId) {
      const db = getDb();
      const playerSnap = await db.doc(`rooms/${roomId}/players/${playerId}`).get();
      if (!playerSnap.exists || !playerSnap.data()!.hasGuessed) {
        return NextResponse.json({ error: 'not the drawer' }, { status: 403 });
      }
    }
    return NextResponse.json({ word: entry.word });
  }

  if (action === 'guess') {
    const { roomId, playerId, playerName, guess } = body;
    if (!roomId || !playerId || !guess) return NextResponse.json({ error: 'missing fields' }, { status: 400 });

    const entry = await getEntry(roomId);
    if (!entry) return NextResponse.json({ correct: false, reason: 'no active word' });

    const correct = guess.trim().toLowerCase() === entry.word.toLowerCase();

    if (!correct) {
      // Wrong guess penalty: -2 points, tracked server-side
      entry.wrongGuesses[playerId] = (entry.wrongGuesses[playerId] ?? 0) + 1;
      const db = getDb();
      const playerSnap = await db.doc(`rooms/${roomId}/players/${playerId}`).get();
      if (playerSnap.exists && !playerSnap.data()!.hasGuessed) {
        const currentScore = playerSnap.data()!.score || 0;
        await db.doc(`rooms/${roomId}/players/${playerId}`).update({
          score: Math.max(0, currentScore - 2),
        });
      }
      return NextResponse.json({ correct: false });
    }

    const db = getDb();
    const [playerSnap, roomSnap] = await Promise.all([
      db.doc(`rooms/${roomId}/players/${playerId}`).get(),
      db.doc(`rooms/${roomId}`).get(),
    ]);

    const freshPlayer = playerSnap.exists ? playerSnap.data()! : null;
    if (!freshPlayer || freshPlayer.hasGuessed) return NextResponse.json({ correct: false, reason: 'already guessed' });

    const roomData = roomSnap.exists ? roomSnap.data()! : null;
    const guessCount: number = roomData?.currentRound?.guessCount ?? 0;
    const guessOrder = guessCount + 1;
    const totalTime = entry.drawTime;
    const elapsed = (Date.now() - entry.startedAt) / 1000;
    const timeLeft = Math.max(0, totalTime - elapsed);

    // Points = 120 × (timeLeft / totalTime) ^ 1.5
    let points = Math.round(120 * Math.pow(timeLeft / totalTime, 1.5));
    points = Math.max(10, points); // floor so late guesses still get something

    // Order bonus
    if (guessOrder === 1) points += 20;
    else if (guessOrder === 2) points += 10;
    else if (guessOrder === 3) points += 5;

    // Hint penalty: -20% per hint revealed
    if (entry.hintsRevealed > 0) {
      points = Math.round(points * Math.pow(0.8, entry.hintsRevealed));
    }

    points = Math.max(5, points);

    // Track elapsed for drawer speed bonus
    entry.totalGuessElapsed += elapsed;

    const msgRef = db.collection(`rooms/${roomId}/chat`).doc();
    await msgRef.set({
      text: `${playerName} guessed the word!`,
      senderId: playerId, senderName: playerName,
      isSystem: false, isCorrect: true, isGuessOnly: false,
      guessOrder, pointsEarned: points, roundTimestamp: Math.floor(elapsed), timestamp: Date.now(),
    });

    await db.doc(`rooms/${roomId}/players/${playerId}`).update({
      hasGuessed: true,
      score: (freshPlayer.score || 0) + points,
      streak: (freshPlayer.streak || 0) + 1,
    });
    await db.doc(`rooms/${roomId}`).update({ 'currentRound.guessCount': guessOrder });

    // Drawer: +25 per correct guess + speed bonus
    const drawerId = roomData?.currentRound?.drawerId;
    if (drawerId && drawerId !== playerId) {
      const drawerSnap = await db.doc(`rooms/${roomId}/players/${drawerId}`).get();
      if (drawerSnap.exists) {
        // Speed bonus: up to +15 if guessed in first 25% of time
        const speedBonus = timeLeft / totalTime >= 0.75 ? 15 : timeLeft / totalTime >= 0.5 ? 8 : 0;
        await db.doc(`rooms/${roomId}/players/${drawerId}`).update({
          score: (drawerSnap.data()!.score || 0) + 25 + speedBonus,
        });
      }
    }

    // Check if all non-drawer players have now guessed → +50 all-guessed bonus for drawer
    const allPlayersSnap = await db.collection(`rooms/${roomId}/players`).get();
    const nonDrawers = allPlayersSnap.docs.filter(d => d.id !== drawerId);
    const allGuessed = nonDrawers.length > 0 && nonDrawers.every(d => d.id === playerId || d.data().hasGuessed);
    if (allGuessed && drawerId) {
      const drawerSnap = await db.doc(`rooms/${roomId}/players/${drawerId}`).get();
      if (drawerSnap.exists) {
        await db.doc(`rooms/${roomId}/players/${drawerId}`).update({
          score: (drawerSnap.data()!.score || 0) + 50,
        });
      }
    }

    return NextResponse.json({ correct: true, points, guessOrder });
  }

  if (action === 'revealHint') {
    const { roomId, hintIndex } = body;
    const entry = await getEntry(roomId);
    if (!entry) return NextResponse.json({ mask: null });
    if (hintIndex <= entry.hintsRevealed) return NextResponse.json({ mask: entry.currentMask, alreadyDone: true });

    const newMask = revealHintLetter(entry.word, entry.currentMask);
    entry.currentMask = newMask;
    entry.hintsRevealed = hintIndex;

    const db = getDb();
    await db.doc(`rooms/${roomId}`).update({ 'currentRound.wordMask': newMask });
    return NextResponse.json({ mask: newMask });
  }

  if (action === 'endRound') {
    const { roomId } = body;
    const entry = await getEntry(roomId);
    const word = entry?.word ?? 'unknown';

    // If no one guessed, give drawer minimal consolation points (0–10)
    if (entry) {
      const db = getDb();
      const roomSnap = await db.doc(`rooms/${roomId}`).get();
      const guessCount = roomSnap.exists ? (roomSnap.data()!.currentRound?.guessCount ?? 0) : 0;
      if (guessCount === 0 && entry.drawerId) {
        const drawerSnap = await db.doc(`rooms/${roomId}/players/${entry.drawerId}`).get();
        if (drawerSnap.exists) {
          await db.doc(`rooms/${roomId}/players/${entry.drawerId}`).update({
            score: (drawerSnap.data()!.score || 0) + 5,
          });
        }
      }
    }

    wordStore.delete(roomId);

    const db = getDb();
    await db.doc(`rooms/${roomId}/secrets/word`).delete().catch(() => {});
    await db.doc(`rooms/${roomId}`).update({
      phase: 'reveal', reveal: { word },
      votes: { skip: {} },
      'currentRound.startedAt': Date.now(),
      'currentRound.timeLimit': 5,
      lastActive: Date.now(),
    });
    return NextResponse.json({ ok: true, word });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
