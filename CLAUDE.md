# XOXO GOSSIP AI — SYSTEM ARCHITECTURE & PROJECT GUIDELINES

## 1. PRODUCT VISION & OVERVIEW
XOXO Gossip AI is an interactive, voice-enabled gossip and social engagement platform built with React, Express, and PostgreSQL. It leverages distinct AI character archetypes, a micro-credit economy, and real-time room mechanics (X-Room) to create dynamic user engagement.

---

## 2. HARD-WON LESSONS & CRITICAL TECH RULES (DO NOT VIOLATE)

* **ESM Build Environment (`__dirname` / `__filename` BAN):**
  * The server is built as ESM (`dist/index.js`). **`__dirname` and `__filename` ARE UNDEFINED.**
  * NEVER suggest or write code using `__dirname` (e.g., `path.join(__dirname, ...)`).
  * Static file serving is handled exclusively via `serveStatic` mapping `dist/public`. Do NOT add manual `express.static` mounts with `__dirname`.

* **Build Pipeline & Asset Flow:**
  * Build pipeline: `vite build` → outputs to `dist/public` | `esbuild` → outputs server to `dist/index.js`.
  * Avatar Assets: All 18 production `.webp` files reside in `client/public/avatars/`. They are copied to `dist/public/avatars/` upon build.
  * Asset Naming Standard: Strict adherence to `{character}-[avatar-1|avatar-2|character].webp` pattern (e.g., `angel-avatar-1.webp`, `snake-male-character.webp`).

* **Client Routing (Wouter, NOT React Router):**
  * The frontend uses **`wouter`** for lightweight SPA routing. **Do NOT import or use `react-router-dom`**.

* **Healthcheck Architecture (Deployment Decoupling):**
  * `/api/health` MUST remain completely decoupled from PostgreSQL/Pool queries. It must instantly return `{ status: "ok" }`.
  * DB connectivity diagnostics must reside strictly in `/api/health/db`.
  * *Reason:* Prevent Railway container deployment deadlocks caused by Neon Postgres connection pool limits.

* **Database Migrations (`npm run db:push`):**
  * ALWAYS inspect `drizzle-kit push` output before confirming (`Y`).
  * If Drizzle suggests dropping any existing table or column (`drop table` / `drop column`), **STOP IMMEDIATELY**. Only approve `create table` or safe additions.

* **PowerShell & Encoding Safety:**
  * Avoid using PowerShell `Set-Content` or piped file commands with `-Encoding UTF8` as it breaks Turkish character formatting.
  * Always prefer full-file overwrite/creation or agent-native file modifications for `.ts` / `.tsx` files.

* **Deploy Target Verification (Railway ↔ GitHub):**
  * **2026-09-08 finding.** For 24 days no push to `xoxonew-sys/xoxo` was ever built. Railway's GitHub connection pointed at **`xoxonew-sys/xoxo-BnbD`** — a repo neither operator nor agent knew existed, almost certainly created by a Railway template flow — and reported *"GitHub Repo not found"* against it. Five pushes in one day triggered nothing.
  * The visible symptom was a 21-day-old **FAILED** build. That build was real but incidental: the story was not "builds fail", it was **"builds never ran"**, and the last thing actually deployed was an empty template.
  * **Nothing in git, GitHub or the running app could have shown this.** `git log`, `git push` output, the GitHub repo page and `/api/health` were all consistent with a healthy pipeline. The evidence lives only in the Railway service's source settings.
  * **Rule:** before debugging a deploy that "won't take", open the Railway service → Settings → Source and confirm the connected repo AND branch by name. Then confirm the newest deployment's commit SHA matches `git rev-parse HEAD`. A deploy is not verified by a green healthcheck; it is verified by the SHA.

---

## 3. AI CHARACTER ARCHETYPES & PARAMETERS

### Tone & Duration Rules
* **Voice Duration:** Maximum 15 seconds per voice response to simulate natural human conversation and manage API costs.
* **Response Balancing:** AI responses must match the user's message length and context.

### Character Configuration (2 Levels)
1. **ANGEL**
   * **Level 1 (Party Girl/Boy):** Hyper-positive, highly motivating. *(Voice: Speed +20%, Pitch +10%)*
   * **Level 2 (Zen/Pure):** Calming, spiritual, wise. *(Voice: Speed -10%, Pitch: Normal)*

2. **BESTIE**
   * **Level 1 (Bro/Girlie):** Deep gossip, intimate, closest friend. *(Voice: Natural speaking speed)*
   * **Level 2 (Mentor):** Guiding, structured, empathetic advisor. *(Voice: Stable tone)*

3. **SNAKE**
   * **Level 1 (Dominant/Dark):**
     * Female: Dominant, grounded, authoritative. *(Voice: Edge-TTS tr-TR-EmelNeural, Speed -15%, Pitch -25%)*
     * Male: Cold, distant, intelligence-focused. *(Voice: Edge-TTS tr-TR-AhmetNeural, Pitch -15%)*
     * *Forbidden Words:* Completely ban 'honey', 'darling', 'baby' in male mode.
   * **Level 2 (Sarcastic/Funny):** Playful snake, sarcastic, light dark humor.

---

## 4. CORE FEATURES & MODULES

* **Interactive Chat (1-on-1):** Text and voice sync with Ghost Mode (hidden text during playback) and Voice Persistence (replay feature).
* **`/judgment` (Courtroom / Yargılama):** Dramatic judgment module where users submit confessions/situations for AI character evaluation.
* **X-Room (Live Audio/Text Group Rooms):** Real-time multi-user and multi-AI chatrooms powered by WebSocket/Socket.io (`/x-rooms` & `/x-rooms/:roomId`).

---

## 5. ECONOMIC & OPERATIONAL RULES

* **Credit Deduction Rule:** Deduct credits when the user sends a message. Receiving AI responses costs 0 credits.
* **Psychological Thresholds:** Access to premium character modes (e.g., Snake Level 1) or exclusive X-Rooms requires checking credit thresholds (e.g., >= 10 credits).

---

## 6. TECH STACK & DIRECTORY STRUCTURE

* **Frontend:** React (Vite), Wouter, TypeScript, Tailwind CSS (`client/src/`)
* **Backend:** Node.js (ESM), Express.js, TypeScript (`server/`)
* **Database & Auth:** PostgreSQL (Neon Postgres), Drizzle ORM, `connect-pg-simple` session store
* **Static Assets:** 18 Optimized `.webp` avatars located in `client/public/avatars/`
* **Real-time:** Socket.io / Native WebSocket integration
* **Deployment:** Railway (Port 8080 default in production)

---

## 7. DEVELOPMENT & DEPLOYMENT COMMANDS

```powershell
# Install dependencies
npm install

# Push database schema changes (Check carefully for drop prompts!)
npm run db:push

# Run local development server
npm run dev

# Build application (vite + esbuild)
npm run build

# Start production server
npm start
```

---

## 8. RELEASE BLOCKERS — STORE SUBMISSION

> These are **blocking**, not debt. Each one stands between XOXO and a store
> submission the same way the purchase path did. Do not reclassify without a
> reason recorded here.

### 8.1 BLOCKING — There is no privacy / KVKK disclosure page at all
* **State (8 Sep 2026): absent, not incomplete.** `App.tsx` registers no
  `/privacy`, `/kvkk` or `/terms` route; `client/public/` holds no static legal
  file; "KVKK" occurs twice in the repo, both as code comments. The only footer
  link (`Home.tsx:113`) goes to `/pricing`.
* **Why blocking, twice over:**
  * Apple requires a reachable privacy policy URL **in the submission form**.
    Missing = rejected before review.
  * XOXO is **already live on Play** with Turkish users, and personal data is
    already going to processors in the US and (as of today) Japan. KVKK
    Art. 10 aydınlatma is an obligation that is currently unmet in production,
    not a launch task.
* **The page the template serves is not ours.** Production still runs the
  `xoxo-BnbD` template. Pushing this repo REMOVES whatever legal page is
  currently reachable. The push makes the gap visible; it does not create it.
* **Blocked on:** the company is not registered, so there is no `veri
  sorumlusu` (data controller) to name — KVKK Art. 10 requires the controller's
  identity. Pages may be DRAFTED with the identity block marked; they may NOT
  be published until an entity exists to name. Same shape as cartoonify.

### 8.2 BLOCKING — Account deletion does not delete the account's data
* `DELETE /api/profile/account` → `storage.deleteUserAccount` (`storage.ts:303`)
  removes only `chatSessions`, `chatMessages` and `users`. It **leaves**
  `usageAnalytics` (holds `user_email`), `emailLogs` (holds email),
  `roomMessages` / `roomMembers` (`member_id` = email), `payments`,
  `confessions`, `apiCostTracking` and `userBans` (email + IP).
* The endpoint nonetheless answers *"Hesabınız ve tüm verileriniz kalıcı olarak
  silindi."* That statement is false as written.
* **The admin path is broken the opposite way.** `force-delete`
  (`routes.ts:2576-2579`) clears six other tables but matches
  `chatSessions.userId` against `user.email`, while that column is written as
  `String(session.userId)` (`routes.ts:2913`) — a numeric id. The admin delete
  of chat history is a silent no-op.
* **Why blocking:** Apple 5.1.1(v) requires in-app account deletion to actually
  delete the data, and KVKK Art. 7/11 gives a right to erasure. The rights
  section of 8.1 cannot be written honestly until this is true.

### 8.3 No retention policy exists
* No scheduled deletion or expiry anywhere (`setInterval` appears once, for
  in-memory rate-limit buckets). Every table above grows indefinitely.
* A KVKK page must state a retention period. There is currently no period to
  state, so a period must be DECIDED before 8.1 can be written.

### 8.2b The orphan audit — NO table has a foreign key to `users`
* The gap is not a missing `ON DELETE CASCADE`. **There is no referential
  relationship to `users` anywhere.** The schema declares exactly three foreign
  keys, all cascading, none of them to `users`:
  `chat_messages → chat_sessions`, `room_members → rooms`, `room_messages → rooms`.
* Every user reference is a loose `text` column, and they do not agree on a key:
  `chat_sessions.user_id` and `payments.user_id` hold `String(users.id)`;
  `room_members.member_id` and `room_messages.member_id` hold the **email**.
  So cascades cannot simply be added — the key format has to be normalised
  first. That is the real shape of the work.

| table | user key | cleared on account deletion? |
|---|---|---|
| `chat_sessions` | `String(users.id)` | yes — correct key |
| `chat_messages` | via FK, cascades from session | yes |
| `room_members` / `room_messages` | email | no, but room expiry removes them within 60 min |
| `payments` | `String(users.id)` | **no — orphaned** |
| `email_logs` | email | **no — orphaned** (now 90-day swept, see 8.4) |
| `user_bans` | email + IP | **no — deliberate, see below** |
| `confessions` | **no user column at all** | **cannot be — unlinkable** |
| `usage_analytics` / `api_cost_tracking` | `user_id` | **never written by anything — dead tables** |
| `user_sessions` | session | destroyed on delete; 30-day expiry |

* `usage_analytics` and `api_cost_tracking` have **no insert site in the entire
  server**. The admin dashboard reads them and gets zeros. They hold no personal
  data and must NOT appear in the KVKK disclosure as if they did.
* `user_bans` surviving deletion is arguably correct: a ban that vanishes when
  the banned user deletes their account is a ban-evasion route. Legitimate
  interest against Art. 7 — a decision to record, not a bug to fix.
* `confessions` is the hard one: no user column, so an erasure request cannot be
  honoured against it at all. Adding the link would make the table MORE
  identifying. That is a trade, not a fix.
* TypeScript was already reporting this: `routes.ts(2589,39)` and `(2592,45)`
  are `eq(<text column>, <number>)` in the admin force-delete. The type checker
  has been naming the broken delete the whole time.

### 8.4 Retention — decisions taken 8 Sep 2026 (operator)
Implemented in `server/retention.ts`, daily sweep, wired in `index.ts`.
* **`email_logs` — 90 days.** Diagnostic value is real (it proved the Resend key
  on 8 Sep), but holding a recipient address forever for someone who never
  registered was the worst item on the list.
* **OTP codes — cleared on use, expired ones swept.** The reset path cleared
  them since 014abc3; the **verification path never did**, so a used code sat
  hashed on the row until overwritten. Now cleared at `routes.ts:959`. There is
  no `password_reset_tokens` table — reset and verification share
  `users.otp_code` / `users.otp_expiry`, which is why one path clearing and the
  other not was invisible.
* **`chat_messages` / `chat_sessions` — NOT DECIDED.** A product question about
  what the app is for, and it waits on 8.2 regardless. Do not invent a default.
* Still undecided: `confessions`, `user_bans`, `payments` (tax law sets a floor
  — VUK/TTK — so this one has an external answer).

### 8.2c Production audit, 8 Sep 2026 — the deletion path deletes nothing
Read-only counts against the production Neon instance (eu-central-1):

| table | rows | reference shape | resolves to a user |
|---|---|---|---|
| `users` | 3 | — | — |
| `chat_sessions` | 18 | **10 `'anonymous'`, 8 email, 0 numeric** | **0 of 8** |
| `chat_messages` | 92 | all attached to a session | — |
| `email_logs` | 18 | email | 18 of 18 |
| `payments` | 0 | — | — |
| `room_members` / `room_messages` / `rooms` | 0 | — | — |
| `confessions` | 0 | no user column | n/a |
| `user_bans` / `usage_analytics` / `api_cost_tracking` | 0 | — | — |
| `user_sessions` | 4 | — | — |

* **`deleteUserAccount` matches `chat_sessions.user_id` against
  `String(users.id)`. Not one row in production is numeric.** The user-facing
  account deletion therefore removes zero sessions and, through the cascade,
  zero messages. Earlier notes in this file called this path "correct key" —
  that was read from `routes.ts:2913`, which is what the code writes *today*.
  The stored data is older than that line. **Correct: neither deletion path
  reaches any existing chat row.**
* The 8 email-keyed sessions carry addresses matching **no current user** —
  data belonging to people who no longer have accounts, unreachable by either
  deletion path. That is a live Art. 7 exposure, not a latent one, and it is
  the migration's actual subject.
* Lesson: the key format was inferred from a write site and contradicted by the
  data. Query the rows before designing a migration around what the code says
  it stores.

### 8.5 The OTP asymmetry — shared storage hid it
* Email verification and password reset write to the **same two columns**,
  `users.otp_code` and `users.otp_expiry`. The reset path cleared them
  (`clearUserOTP`, since 014abc3); the verification path never did.
* **Shared storage is what made the asymmetry invisible.** With a
  `password_reset_tokens` table and a `verification_tokens` table, one of them
  visibly fills with used rows and someone asks why. One shared pair of columns
  on the user row has no size, no row count, and nothing to notice — the stale
  value simply sat there until the next OTP overwrote it.
* Generalisation worth keeping: when two flows share one storage location,
  a cleanup that only one flow performs cannot be detected by looking at the
  storage. It can only be found by reading both flows against each other.
* Fixed at `routes.ts:959`; expired rows also swept by `server/retention.ts`.

### 8.6 Two deletion paths, both silently deleting nothing
* `deleteUserAccount` searched `chat_sessions.user_id` for `String(id)`. Not one
  row in production was numeric. **It deleted nothing.**
* The admin `force-delete` matched the same column on `user.email`. That column
  is written as `String(id)` by today's code. **It also deleted nothing.**
* Two independent paths, written at different times by different hands, both
  reporting success, both no-ops. `DELETE ... WHERE <no match>` is a completely
  ordinary statement: **it affects zero rows and raises nothing.** No error, no
  warning, no failed request. The endpoints returned
  *"tüm verileriniz kalıcı olarak silindi"* and 200.
* **The only reason we know is that someone read them.** No amount of monitoring
  the endpoints would have surfaced this — they were succeeding. A test asserting
  a 200 would have passed. The defect is only visible by comparing the value a
  query searches for against the values the column actually holds.
* Rule: for any `DELETE` or `UPDATE` whose predicate crosses a system boundary
  (session → column, email → id), assert the **affected row count**, not the
  status code. A deletion that deletes nothing must be able to fail loudly.

### 8.7 A red typecheck describing a live defect — second instance today
* `routes.ts(2589,39)` and `(2592,45)` were `eq(<text column>, <number>)` in the
  admin force-delete. They disappeared when the broken deletes were removed,
  because **they were the broken deletes.** The compiler had been naming the
  defect in plain language the whole time.
* **This is the second occurrence today**, not a detail of this change. Earlier:
  three of fifteen errors carried as "pre-existing" were describing the 24-day
  login outage. Both times the error count was treated as a number to compare
  before and after, and both times the text of the errors was the finding.
* The failure mode is specific and repeatable: a non-zero baseline turns a
  typecheck into a *metric*. Once "8 errors" is the unit, nobody reads error #6.
* Rule: **read every error line at least once, and re-read them whenever the set
  changes.** "Same count as before" is not the same as "same errors as before" —
  and an error that vanishes deserves as much attention as one that appears,
  because it means either the defect or the code that named it is gone.
