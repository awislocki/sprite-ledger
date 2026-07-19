# Sprite Ledger — Claude Code handoff

Mobile-first Fortnite Sprite collection tracker with real Epic sign-in.
Live at https://sprite-ledger.vercel.app (Vercel project `sprite-ledger`,
auto-deploys from main). First live sync completed 2026-07-19; the catalog
below is built from real account data, not guesses.

## Data model (decoded from a real sync, 2026-07-19)

- **Ownership signals** (lib/collection.js, strongest first): (1) owned
  `CosmeticVariantToken:vtid_backpack_coldtrophy_<slug>[_<style>]` items —
  granted per unlocked style regardless of how (quest, vending, later
  phases); (2) the Mastery Pod backpack item's `attributes.variants[].owned`
  style tags ("Mat13"/"Stage26", mapped via FILE_LOOKUP); (3)
  `spritemastery_redeem` quests — `Claimed` = owned, `Active` = pending.
  The server filter is /sprite|coldtrophy/i — /sprite/i alone silently
  dropped the tokens (made Seven look missing). Everything else (mastery
  quests rewarding `Token:...`, the Token items, ChallengeBundle/Schedule
  items, daily vending quests) is season plumbing — skipped silently.
- **Mastery (UI):** crown = every variant of that sprite owned. It is NOT
  the in-game mastery-level track — that signal hasn't been decoded.
- **Share codes:** `FMDS1.<name>.<base64url>` = 2-byte FNV-1a checksum of
  ALL_KEYS order + 89-bit ownership bitmap (lib/share.js). Any catalog
  reorder/insert changes the checksum → old codes get a friendly
  "different version" error, never a silent mis-decode. ALL_KEYS order is
  frozen by assertions in scripts/test-collection.mjs — update that
  snapshot consciously.
- **Next 15:** `cookies()` is async — all route handlers await it.
- **Catalog & images:** `lib/catalog.js` is generated from the
  `Backpack_ColdTrophy` ("Sprite Mastery Pod") cosmetic on fortnite-api.com —
  18 sprites, 89 variants, one hosted image per combo (hotlinked; base URL in
  `IMG_BASE`). Style sets differ per sprite (Earth has Cube not Holofoil,
  Zero Point has Quack, The Burnt Peanut is base-only) — the catalog is the
  authority, don't assume 6 uniform styles.
- **Slug aliases:** Epic's internal slugs differ from display names:
  sleepy→Dream, soccer→Striker, reddemon→Demon, crispynut→TheBurntPeanut,
  drifter→Aura (verified by matching style fingerprints). Air and Seven
  haven't appeared in sync data yet — their aliases are guesses; unknown
  slugs surface in the UI's "New from Epic" section, so nothing is lost.

## Architecture (the parts that aren't obvious)

- **Auth:** Epic's official OAuth can't read Fortnite game data, so sign-in is
  the community auth-code flow: user pastes a one-time code from
  epicgames.com/id/api/redirect, server exchanges it, mints a per-account
  device auth, and seals it AES-256-GCM into an httpOnly cookie
  (`lib/session.js`). No database; server stores nothing at rest. Console
  players are covered because Epic's web login offers PS/Xbox/Nintendo.
- **OAuth client:** fortniteAndroidGameClient — Epic DISABLED the old
  fortniteIOSGameClient in 2026 (token endpoint returns
  `errors.com.epicgames.account.client_disabled`). Client id/secret are
  env-overridable (`EPIC_CLIENT_ID`/`EPIC_CLIENT_SECRET` +
  `NEXT_PUBLIC_EPIC_CLIENT_ID` for the redirect URL — they must match).
  Verified fallback clients and a warning about fortnitePCGameClient (lost
  its device_auth grant — do not use) are documented in `lib/epic.js`.
- **Sign-out** revokes the device auth at Epic (best-effort), clears cookie.
- **Client** (`app/page.js`): auth state machine; SpriteLocker-style rows —
  one per sprite, variant tiles with owned (full colour + accent ring) /
  pending (dimmed + pulsing dot) / missing (grayscale + lock) states.
  Cache-first render from per-account localStorage (`sprite-ledger:v2:<id>`);
  auto-sync only when the cache is older than 12h (CACHE_TTL_MS); the
  "Refresh from Epic" button always syncs. Tapping a tile toggles a manual
  override (stored separately in `manual`, reconciled over sync state).
- **Mock mode:** `npm run dev:mock` runs a fake Epic (scripts/mock-epic.mjs)
  with test code `deadbeefdeadbeefdeadbeefdeadbeef` — full flow offline,
  emits real-shape redeem quests incl. alias slugs and an unmapped one.
- **Tests:** `npm test` — parser regression against a fixture distilled from
  the real 2026-07-19 sync (scripts/fixtures/). Expected: 47/89 owned.
- **ESM:** package.json has `"type": "module"`; lib imports use explicit
  `.js` extensions so node can run the tests unbundled.

## Constraints — do not relax these

- Never accept, log, or commit tokens/secrets. `.gitignore` covers `.env*`.
  (Epic client ids/secrets in `lib/epic.js` are public game-binary constants,
  not secrets.)
- Never hardcode SESSION_SECRET. It's set in Vercel; the login route
  fail-fasts with instructions if missing — deliberate, never burn a user's
  single-use Epic code on a misconfigured server.
- Epic endpoints are undocumented and read-only personal-use; keep request
  volume minimal (sync is user-initiated + at most one silent sync per 12h).
- Error messages stay human: single-use code reuse, revoked device auth
  (auto sign-out + cookie clear), Epic outages, offline — all mapped in
  `lib/epic.js` friendly(). Preserve that mapping when editing.
- Windows dev box: don't `spawn("npx", ...)` (ENOENT) — see dev-mock.mjs.

## Known open items

- Next.js is pinned at 14.2.5, flagged by the Dec 2025 security advisory
  (27 Dependabot alerts). Dependabot PR #1 bumps to 15.5.18 (major) — being
  evaluated in a separate session; don't merge blind.
- Air and Seven sprite slugs unverified until they appear in a live sync.
- `vercel.json` pins framework=nextjs (project was imported with preset
  "Other"; the pin overrides it).
