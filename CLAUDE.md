# Sprite Ledger — Claude Code handoff

Mobile-first Fortnite Sprite collection tracker with real Epic sign-in.
Live at https://sprite-ledger.vercel.app (Vercel project `sprite-ledger`,
auto-deploys from main). First live sync completed 2026-07-19; the catalog
below is built from real account data, not guesses.

## Data model — three states (Adam's model, 2026-07-19)

`lib/collection.js` produces per-variant state:
- **MASTERED** — the pod backbling style only unlocks once a variant is
  mastered in-game, so the Mastery Pod backpack's `owned` tags ARE the
  mastered set. Authoritative. Crown.
- **FOUND** — you have the variant but haven't mastered it. Epic doesn't
  expose this cleanly, so it's the union of softer auto signals (possessed
  variant token, claimed redeem reward, caught-creature mastery token)
  PLUS the user's manual tile toggles. Manual toggles live in their OWN
  long-term localStorage key (`sprite-ledger:found:<account>`) so re-syncs
  never wipe them, and are pruned when the variant later masters (MASTERED
  overwrites FOUND).
- **MISSING** — neither. Tap a tile to mark it found.
Tiles are buttons; tapping toggles the manual FOUND layer (mastered tiles
aren't toggleable). `countMastered`/`countFound` drive the HUD.

`npm run catalog:check` diffs the live fortnite-api pod against
`lib/catalog.js` and prints new/changed sprites (run ~weekly, not per
request). Collab sprites (Batman/Vini/Pollo) award their own backbling and
are NOT pod variants, so they won't appear there — those need a live sync
report + local asset extraction. fortnite-api can also LAG in-game pod
releases (Cube Grim, released 2026-07-23, wasn't there day-of): a variant
file starting with "/" (e.g. "/sprites/grimreaper_cube") is a self-hosted
per-variant image override — swap it to the real pod tag once
catalog:check reports it. Renders for unsynced art come from the Fortnite
wiki (fortnite.fandom.com, MediaWiki API; fortnite.gg blocks scripts) and
get re-framed to pod occupancy (alpha-crop, scale to 78% content height,
center on 288px canvas — see the batman re-pad commit).

## Legacy ownership notes (superseded by the three-state model above)

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
- **Mastery is per-VARIANT (confirmed by Adam):** each owned
  Token:..._token_qNN<letter> item is one owned variant creature; chain
  number qNN → sprite (CHAIN_SEED in lib/collection.js + learned from the
  player's redeem quests), step letter → variant. Letters are GLOBAL
  across sprites (verified on all 15 mapped chains: ""=Base a=Gummy
  b=Galaxy c=Gold d=Gem e=Holofoil f=Cube; Quack unobserved) — that's how
  caught variants get named on chains with no redeem quests yet
  (Seven/Air); a redeem-learned mapping still wins. The token's `level`
  attribute is the variant's level — tile crown at 5, "L{n}" chip from 2+.
  Tile states: owned (style unlocked) > caught (creature only — dashed
  accent ring, hollow ✓) > pending > missing. Undecodable tokens fall back
  to a "+N caught" row badge. Duplicate tokens per step are deduped.
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

- **Auth (two paths, both mint an account device auth sealed AES-256-GCM
  into an httpOnly cookie; no DB, nothing at rest):**
  - *Device-code (default, seamless):* `/api/auth/device/start` calls Epic's
    deviceAuthorization with the **switch** client, seals the device_code
    into a short `sl_dc` cookie (never sent to the browser), returns the
    user_code + `epicgames.com/activate?userCode=…` link. The client polls
    `/api/auth/device/poll` every `interval`s; on confirmation the route
    mints the device auth and seals the session. UI in LoginScreen.
  - *Manual auth-code (fallback):* user pastes a one-time code from
    epicgames.com/id/api/redirect; `/api/auth/login` exchanges it with the
    **android** client. Behind a "Enter a code manually" toggle.
  - Each session records which client minted it (`session.c`: "switch" or
    "android"); `tokenFromDeviceAuth` redeems with that same client so the
    device auth is never used cross-client. Old sessions without `c` default
    to android. Console players are covered either way (Epic web login offers
    PS/Xbox/Nintendo).
- **OAuth clients** (registry in `lib/epic.js`, all env-overridable):
  *android* (fortniteAndroidGameClient) for the auth-code path — Epic
  DISABLED the old fortniteIOSGameClient in 2026
  (`errors.com.epicgames.account.client_disabled`); *switch*
  (fortniteNewSwitchGameClient, dashed secret — the only enabled client that
  supports deviceAuthorization) for the device-code path. Both carry
  device_auth + Fortnite profile access. Do NOT use fortnitePCGameClient
  (lost its device_auth grant). Live status: egs.jaren.wtf.
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
- Air and Seven sprite slugs unverified until they appear in a live sync;
  same for Pollo (added 2026-07-23, base-only Mythic).
- grimreaper Cube uses a self-hosted image override until fortnite-api adds
  the pod file, and its Epic style tag is unknown until a sync sees it.
- The 2026-07-23 catalog change (Cube Grim/Cube Batman inserted, Pollo
  appended) rolled the share-code checksum — pre-07-23 codes now get the
  friendly "different version" error.
- `vercel.json` pins framework=nextjs (project was imported with preset
  "Other"; the pin overrides it).
