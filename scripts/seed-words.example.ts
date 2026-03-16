/**
 * Example seed script — copy this to scripts/seed-words.ts and fill in your own words.
 * Pushes the word bank to Firestore under wordBank/{category}.
 * Words are stored server-side only; clients never have access to this collection.
 *
 * Usage:
 *   npm run seed
 *
 * Requires FIREBASE_ADMIN_* env vars (same as .env.local).
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

// Add as many categories and words as you like.
// difficulty: "easy" | "medium" | "hard"
const WORD_BANK: Record<string, { word: string; difficulty: string }[]> = {
  Animals: [
    { word: "dog", difficulty: "easy" },
    { word: "cat", difficulty: "easy" },
    { word: "elephant", difficulty: "medium" },
    { word: "giraffe", difficulty: "medium" },
    { word: "kangaroo", difficulty: "hard" },
  ],
  Food: [
    { word: "apple", difficulty: "easy" },
    { word: "pizza", difficulty: "easy" },
    { word: "sushi", difficulty: "medium" },
    { word: "croissant", difficulty: "hard" },
  ],
  // Add more categories here...
};

async function seed() {
  const db = getFirestore();
  const categories = Object.keys(WORD_BANK);

  for (const category of categories) {
    const words = WORD_BANK[category];
    await db.doc(`wordBank/${category}`).set({ words });
    console.log(`✓ Seeded ${category} (${words.length} words)`);
  }

  console.log('\nDone! Word bank is now stored in Firestore under wordBank/{category}.');
  console.log('Make sure your Firestore rules deny client reads on /wordBank/**');
}

seed().catch(err => { console.error(err); process.exit(1); });
