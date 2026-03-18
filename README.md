<div align="center">

```
███████  ██████  ██    ██ ██  ██████   ██████  ██      ███████ 
██      ██    ██ ██    ██ ██ ██       ██       ██      ██      
███████ ██    ██ ██    ██ ██ ██   ███ ██   ███ ██      █████   
     ██ ██ ▄▄ ██ ██    ██ ██ ██    ██ ██    ██ ██      ██      
███████  ██████   ██████  ██  ██████   ██████  ███████ ███████ 
            ▀▀                                                  
```

**draw. guess. repeat.**

[![License: AGPL v3](https://img.shields.io/badge/license-AGPL%20v3-white?style=flat-square&labelColor=09090b)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-white?style=flat-square&labelColor=09090b&logo=next.js)](https://nextjs.org)
[![Firebase](https://img.shields.io/badge/Realtime%20Database-RTDB-white?style=flat-square&labelColor=09090b&logo=firebase)](https://firebase.google.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-white?style=flat-square&labelColor=09090b&logo=typescript)](https://typescriptlang.org)

</div>

---

A minimal, real-time multiplayer draw & guess game. Create a private room, share the code, take turns drawing while everyone else tries to guess the word.

The word bank lives entirely server-side — players can't cheat by reading the source.

---

## features

- real-time canvas synced across all players via Firebase Realtime Database
- private rooms with a 6-character shareable code
- host controls — rounds, draw time, hints, word count, max players, categories
- custom word support per room
- score system with guess-order bonuses and drawer rewards
- progressive hints that reveal letters over time
- emoji reactions, vote-to-skip, live chat
- word bank stored in Firestore, fetched server-side only — never in the client bundle

---

## stack

| | |
|---|---|
| framework | Next.js 15 (App Router) |
| realtime | Firebase Realtime Database |
| word bank | Firebase Firestore (server-side only) |
| server | Firebase Admin SDK |
| styling | Tailwind CSS v4 |
| language | TypeScript 5 |

---

## getting started

### 1. clone

```bash
git clone https://github.com/thor-op/squiggle.git
cd squiggle
npm install
```

### 2. firebase setup

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Realtime Database**
3. Enable **Firestore** in Native mode (for the word bank)
4. Go to **Project Settings → Service Accounts → Generate new private key**

### 3. environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` with your Firebase client config and Admin SDK credentials. Make sure `NEXT_PUBLIC_FIREBASE_DATABASE_URL` is set — it's the RTDB URL from your Firebase console.

### 4. deploy rules

```bash
npx firebase login
npx firebase use your-project-id

# deploy both RTDB and Firestore rules
npx firebase deploy --only database,firestore:rules
```

### 5. seed the word bank

Words live in Firestore (server-side only), not in the client bundle. Copy the example and fill in your words:

```bash
cp scripts/seed-words.example.ts scripts/seed-words.ts
# edit scripts/seed-words.ts with your word bank
npm run seed
```

> `scripts/seed-words.ts` is gitignored — your actual words stay private. Only the example is committed.

### 6. run

```bash
npm run dev
```

→ [http://localhost:3000](http://localhost:3000)

---

## project structure

```
app/
├── api/game/route.ts       server-side logic (word validation, scoring, hints)
├── room/[roomId]/page.tsx  game room
└── page.tsx                landing page

components/
├── Canvas.tsx              drawing canvas (RTDB synced)
├── Chat.tsx                chat + guess input (RTDB synced)
├── HostControls.tsx        lobby settings
├── FloatingEmojis.tsx      emoji reactions
└── RoomDoodles.tsx         decorative background

lib/
├── firebase.ts             RTDB client instance
├── firebaseAdmin.ts        admin SDK init (RTDB + Firestore)
├── gameLogic.ts            room creation, turns, chat
├── words.ts                getWordMask utility only
├── sounds.ts               web audio sound effects
├── store.ts                session storage helpers
└── types.ts                shared typescript types

scripts/
├── seed-words.example.ts   template — copy and fill in your words
└── seed-words.ts           your actual word bank (gitignored)
```

---

## data architecture

| data | where | why |
|---|---|---|
| rooms, players, chat, canvas | Firebase Realtime Database | low-latency, push-based sync |
| word bank | Firestore (admin-only) | server-side only, clients blocked by rules |
| secret word (active round) | server memory + Firestore secrets | never exposed to clients |

---

## word bank security

Words are seeded into Firestore under `wordBank/{category}` via the Admin SDK. Firestore rules block all client reads on that collection. The client bundle contains zero words — only a `getWordMask` utility that turns a word into underscores.

To update words, edit `scripts/seed-words.ts` and re-run `npm run seed`.

---

## contributing

bugs and feedback welcome via [github issues](https://github.com/thor-op/squiggle/issues).

- [report a bug](https://github.com/thor-op/squiggle/issues/new?template=bug_report.yml)
- [give feedback](https://github.com/thor-op/squiggle/issues/new?template=feedback.yml)

---

## sponsor

if squiggle brings you joy, consider supporting development.

[![Sponsor](https://img.shields.io/badge/sponsor-%E2%9D%A4-white?style=flat-square&labelColor=09090b)](https://github.com/sponsors/thor-op)

---

## license

[AGPL v3](./LICENSE) — if you modify and deploy this, you must open source your changes under the same license.

<div align="center">

made with ♥ by [thor-op](https://github.com/thor-op)

</div>
