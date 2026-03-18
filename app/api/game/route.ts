/**
 * Server-side game API — secret word never touches client.
 * Room/player/chat/canvas data lives in Firebase Realtime Database.
 * Word bank stays in Firestore (admin-only).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getWordMask } from '@/lib/words';
import { revealHintLetter } from '@/lib/gameLogic';

/** Fetch random words from Firestore wordBank */
async function getRandomWordsFromDB(
  fsDb: FirebaseFirestore.Firestore,
  categories: string[],
  customWordsStr: string = '',
  count: number = 3
): Promise<string[]> {
  let pool: { word: string; difficulty: string }[] = [];
  const cats = categories.length > 0 ? categories : ['Animals', 'Food', 'Objects'];
  await Promise.all(
    cats.map(async (cat) => {
      const snap = await fsDb.doc(`wordBank/${cat}`).get();
      if (snap.exists) pool = pool.concat(snap.data()!.words ?? []);
    })
  );
  if (customWordsStr) {
    customWordsStr.split(',').map(w => w.trim()).filter(Boolean).forEach(w => {
      pool.push({ word: w.toLowerCase(), difficulty: 'custom' });
    });
  }
  if (pool.length === 0) return ['apple', 'banana', 'cat'];
  return [...pool].sort(() => 0.5 - Math.random()).slice(0, count).map(w => w.word);
}

// In-memory word store (resets on cold start — acceptable for game sessions)
const wordStore = new Map<string, {
  word: string;
  drawerId: string;
  startedAt: number;
  hintsRevealed: number;
  currentMask: string;
  drawTime: number;
  totalGuessElapsed: number;
  wrongGuesses: Record<string, number>;
}>();

async function getEntry(roomId: string) {
  let entry = wordStore.get(roomId);
  if (entry) return entry;
  // Rehydrate from RTDB secrets on cold start
  const db = getAdminDb();
  const snap = await db.ref(`secrets/${roomId}/word`).get();
  if (!snap.exists()) return null;
  const data = snap.val();
  const roomSnap = await db.ref(`rooms/${roomId}/currentRound/wordMask`).get();
  entry = {
    word: data.value,
    drawerId: data.drawerId,
    startedAt: Date.now(),
    hintsRevealed: 0,
    currentMask: roomSnap.exists() ? roomSnap.val() : data.mask,
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
    const db = getAdminDb(); // ensures initAdminApp runs with databaseURL
    const { getFirestore } = await import('firebase-admin/firestore');
    const fsDb = getFirestore();
    const choices = await getRandomWordsFromDB(fsDb, categories ?? [], customWords ?? '', wordCount ?? 3);
    void db; // db init side-effect only
    return NextResponse.json({ choices });
  }

  if (action === 'deleteRoom') {
    const { roomId } = body;
    if (!roomId) return NextResponse.json({ error: 'missing roomId' }, { status: 400 });
    const db = getAdminDb();
    await Promise.all([
      db.ref(`rooms/${roomId}`).remove(),
      db.ref(`players/${roomId}`).remove(),
      db.ref(`chat/${roomId}`).remove(),
      db.ref(`canvas/${roomId}`).remove(),
      db.ref(`secrets/${roomId}`).remove(),
    ]);
    wordStore.delete(roomId);
    return NextResponse.json({ ok: true });
  }

  if (action === 'selectWord') {
    const { roomId, word, drawerId, drawTime } = body;
    if (!roomId || !word || !drawerId) return NextResponse.json({ error: 'missing fields' }, { status: 400 });

    const mask = getWordMask(word);
    const now = Date.now();
    wordStore.set(roomId, {
      word, drawerId,
      startedAt: now,
      hintsRevealed: 0,
      currentMask: mask,
      drawTime: drawTime ?? 80,
      totalGuessElapsed: 0,
      wrongGuesses: {},
    });

    const db = getAdminDb();
    await Promise.all([
      db.ref(`secrets/${roomId}/word`).set({ value: word, drawerId, mask }),
      db.ref(`rooms/${roomId}`).update({
        phase: 'drawing',
        wordChoices: null,
        'currentRound/wordMask': mask,
        'currentRound/wordLength': word.length,
        'currentRound/startedAt': now,
        'currentRound/timeLimit': drawTime ?? 80,
        'currentRound/guessCount': 0,
        lastActive: now,
      }),
      db.ref(`canvas/${roomId}`).set({
        completedStrokes: '[]', activeStroke: null, clearedAt: now, lastUpdate: now,
      }),
    ]);

    return NextResponse.json({ ok: true, mask, startedAt: now });
  }

  if (action === 'getWord') {
    const { roomId, playerId } = body;
    const entry = await getEntry(roomId);
    if (!entry) return NextResponse.json({ word: null });
    if (entry.drawerId !== playerId) {
      const db = getAdminDb();
      const snap = await db.ref(`players/${roomId}/${playerId}/hasGuessed`).get();
      if (!snap.exists() || !snap.val()) return NextResponse.json({ error: 'not the drawer' }, { status: 403 });
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
      entry.wrongGuesses[playerId] = (entry.wrongGuesses[playerId] ?? 0) + 1;
      const db = getAdminDb();
      const scoreSnap = await db.ref(`players/${roomId}/${playerId}`).get();
      if (scoreSnap.exists() && !scoreSnap.val().hasGuessed) {
        const cur = scoreSnap.val().score || 0;
        await db.ref(`players/${roomId}/${playerId}/score`).set(Math.max(0, cur - 2));
      }
      return NextResponse.json({ correct: false });
    }

    const db = getAdminDb();
    const [playerSnap, guessCountSnap, drawerIdSnap] = await Promise.all([
      db.ref(`players/${roomId}/${playerId}`).get(),
      db.ref(`rooms/${roomId}/currentRound/guessCount`).get(),
      db.ref(`rooms/${roomId}/currentRound/drawerId`).get(),
    ]);

    const freshPlayer = playerSnap.exists() ? playerSnap.val() : null;
    if (!freshPlayer || freshPlayer.hasGuessed) return NextResponse.json({ correct: false, reason: 'already guessed' });

    const guessOrder = (guessCountSnap.exists() ? guessCountSnap.val() : 0) + 1;
    const drawerIdVal = drawerIdSnap.val();
    const totalTime = entry.drawTime;
    const elapsed = (Date.now() - entry.startedAt) / 1000;
    const timeLeft = Math.max(0, totalTime - elapsed);

    let points = Math.round(120 * Math.pow(timeLeft / totalTime, 1.5));
    points = Math.max(10, points);
    if (guessOrder === 1) points += 20;
    else if (guessOrder === 2) points += 10;
    else if (guessOrder === 3) points += 5;
    if (entry.hintsRevealed > 0) points = Math.round(points * Math.pow(0.8, entry.hintsRevealed));
    points = Math.max(5, points);

    entry.totalGuessElapsed += elapsed;

    const msgKey = db.ref(`chat/${roomId}`).push().key!;

    // Fetch drawer score in parallel if needed
    const drawerSnap = (drawerIdVal && drawerIdVal !== playerId)
      ? await db.ref(`players/${roomId}/${drawerIdVal}`).get()
      : null;

    const updates: Record<string, unknown> = {
      [`chat/${roomId}/${msgKey}`]: {
        text: `${playerName} guessed the word!`,
        senderId: playerId, senderName: playerName,
        isSystem: false, isCorrect: true, isGuessOnly: false,
        guessOrder, pointsEarned: points,
        roundTimestamp: Math.floor(elapsed), timestamp: Date.now(),
      },
      [`players/${roomId}/${playerId}/hasGuessed`]: true,
      [`players/${roomId}/${playerId}/score`]: (freshPlayer.score || 0) + points,
      [`players/${roomId}/${playerId}/streak`]: (freshPlayer.streak || 0) + 1,
      [`rooms/${roomId}/currentRound/guessCount`]: guessOrder,
    };

    if (drawerSnap?.exists()) {
      const speedBonus = timeLeft / totalTime >= 0.75 ? 15 : timeLeft / totalTime >= 0.5 ? 8 : 0;
      updates[`players/${roomId}/${drawerIdVal}/score`] = (drawerSnap.val().score || 0) + 25 + speedBonus;
    }

    await db.ref().update(updates);

    // All-guessed bonus — check after main update
    const allPlayersSnap = await db.ref(`players/${roomId}`).get();
    if (allPlayersSnap.exists() && drawerIdVal) {
      const allPlayers = allPlayersSnap.val() as Record<string, { hasGuessed: boolean; score: number }>;
      const nonDrawers = Object.entries(allPlayers).filter(([id]) => id !== drawerIdVal);
      const allGuessed = nonDrawers.length > 0 && nonDrawers.every(([id, p]) => id === playerId || p.hasGuessed);
      if (allGuessed) {
        const dSnap = await db.ref(`players/${roomId}/${drawerIdVal}`).get();
        if (dSnap.exists()) {
          await db.ref(`players/${roomId}/${drawerIdVal}/score`).set((dSnap.val().score || 0) + 50);
        }
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

    const db = getAdminDb();
    await db.ref(`rooms/${roomId}/currentRound/wordMask`).set(newMask);
    return NextResponse.json({ mask: newMask });
  }

  if (action === 'endRound') {
    const { roomId } = body;
    const entry = await getEntry(roomId);
    const word = entry?.word ?? 'unknown';
    const now = Date.now();
    const db = getAdminDb();

    // Consolation points for drawer if no one guessed — read + write in parallel with reveal update
    const consolationPromise = (async () => {
      if (!entry?.drawerId) return;
      const guessCountSnap = await db.ref(`rooms/${roomId}/currentRound/guessCount`).get();
      if ((guessCountSnap.exists() ? guessCountSnap.val() : 0) === 0) {
        const drawerSnap = await db.ref(`players/${roomId}/${entry.drawerId}`).get();
        if (drawerSnap.exists()) {
          await db.ref(`players/${roomId}/${entry.drawerId}/score`).set((drawerSnap.val().score || 0) + 5);
        }
      }
    })();

    wordStore.delete(roomId);

    await Promise.all([
      consolationPromise,
      db.ref(`secrets/${roomId}/word`).remove(),
      db.ref(`rooms/${roomId}`).update({
        phase: 'reveal',
        'reveal/word': word,
        'votes/skip': {},
        'currentRound/startedAt': now,
        'currentRound/timeLimit': 5,
        lastActive: now,
      }),
    ]);
    return NextResponse.json({ ok: true, word });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
