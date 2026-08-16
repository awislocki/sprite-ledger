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
  overwrites FOUND). Because mobile Safari evicts script-writable storage
  after ~7 days without a visit, every save also refreshes a 400-day
  SERVER-SET backup cookie (`sl_manual`, /api/manual — Set-Cookie is exempt
  from that eviction; nothing stored server-side). The cookie is httpOnly
  and scoped to `path=/api/manual`, so it never rides along on page loads,
  sprite images, or /api/sync; the client reads it back via GET. Codec +
  4KB-budget guard live in `lib/manual.js` (unit-tested; worst case — every
  catalog key toggled — is ~1.4KB). Restore fires only when localStorage
  holds NOTHING for the account (evicted / fresh device / storage blocked),
  never when it holds an empty map (the user may have cleared toggles on
  purpose), and merges UNDER any tap made while the request was in flight.
  navigator.storage.persist() is requested at boot as an extra hedge.
- **reconcileManual takes `{trusted}` — do not remove it.** Pruning decides
  an override is redundant by comparing it to the sync; against an EMPTY
  (unsynced) collection every tile reads as missing, so a "missing"
  suppression looks redundant and gets deleted — which is exactly the state
  right after an eviction restore, and it wiped the user's toggles *and*
  the backup (fixed 2026-07-25). Only a live sync or a cached collection is
  trusted; a cold cache prunes nothing but off-catalog keys.
- **MISSING** — neither. Tap a tile to mark it found.
Tiles are buttons; tapping cycles missing → found → mastered → missing.
The manual layer stores whatever differs from the sync, INCLUDING an
explicit "missing" that suppresses a wrong Epic auto-found signal (the
soft heuristics — chain-seed guesses like Air/Seven — can misfire; a user
reported Galaxy Air found that they don't have, 2026-07-24). Suppressed
keys are subtracted from the share owned-set. Only Epic-MASTERED is
locked (authoritative). `countMastered`/`countFound` drive the HUD.

`npm run catalog:check` diffs the live fortnite-api pod against
`lib/catalog.js` and prints new/changed sprites (run ~weekly, not per
request). Collab sprites (Batman/Vini/Pollo) award their own backbling
in-game, but Epic also lists their styles in the pod's Mesh channel, so
they DO appear there — 2026-07-30 the catalog switched them (plus Cube
Grim) from self-hosted renders to real pod tags (particle3–12) and dropped
their `manualOnly`/`imgBase`. The same evening the v41.30 wave repopulated
public/sprites/ with 19 wiki renders (see the v41.30 block in
lib/catalog.js) — until fortnite-api catches up, catalog:check will noisily
report those as removed variants / gone sprites; that's expected. The
machinery: a variant file starting with "/" is a self-hosted per-variant
image override — swap it to the real pod tag once catalog:check reports it
(fortnite-api can LAG in-game releases: Cube Grim, released 2026-07-23,
took ~a week). Renders for unsynced art come from the Fortnite wiki
(fortnite.fandom.com, MediaWiki API; fortnite.gg blocks scripts) and get
re-framed to pod occupancy (alpha-crop, scale to 78% content height,
center on 288px canvas — scripts/ has no tool for this; the c2e1a06 spec
was rebuilt with sharp in a scratchpad on 2026-07-30).

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
- **Public share page** (`app/s/[code]/`): unauthenticated read-only ledger
  rendered entirely from a collection code in the URL — no auth, no Epic
  call, no API request at all (verified), nothing stored. Codes carry ONE
  BIT per variant, so it speaks has-it/needs-it and shows no crowns. Rows
  come from `app/ledger-rows.js` (SpriteRow/VariantRow/Crown, shared with
  the signed-in ledger) via `readOnly` — keep both callers in mind when
  editing those. `generateMetadata` gives chat apps a real title/count and
  sets robots:noindex (personal links). SharePanel's "Share my collection
  page" builds `/s/<code>`; the compare link (`/?compare=`) is the variant
  for people who already use the tracker.
- **Trade rounds** (`lib/trade-round.js` + `lib/trade-image.js`, UI on the
  PUBLIC page `app/trade/` — no auth, no Epic call, nothing stored, same
  posture as `/s/<code>`; the signed-in share panel just links to it with
  your code prefilled, `/trade?p=<code>,<code>`, and the page keeps that
  query in step with the roster so the address bar is always the shareable
  round). Paste 2–4 collection codes and the planner works out a round where
  EVERY player hands over one sprite and receives one they don't have. That's
  a permutation of the players with no fixed point, so it decomposes into
  circles: 2-circles are straight swaps (the common case), 3+-circles are
  pass-it-round chains — which is the only way an odd group, or a group where
  no two people can help each other directly, all trades in one round. Search
  = best-scoring derangement over the largest workable subset (MAX_ROUND_PLAYERS
  is 4 — a squad, and as many trades as stay legible on a phone); anyone who
  can't be fitted in is listed as sitting out rather than silently dropped.
  Gift choice scores catalog rarity
  (VARIANT_ORDER position — no hand-tuned table) plus how close it takes the
  receiver to finishing that sprite's row; seed 0 is fully deterministic and
  "Re-roll" bumps a seed that adds bounded jitter. No conflicts are possible
  by construction: a key you're being given is one you don't have, so you
  can never be asked to give it away in the same round.
  `scripts/test-trade-round.mjs` asserts the give-one/get-one invariant on
  every case — keep it green, it's the whole contract.
- **Trade rooms** (`lib/room-store.js` + `app/api/room/…`, UI in `app/room/`):
  the ONE piece of shared server state in the app — a room outlives a single
  visit because players arrive at different times. Held: display names +
  collection codes (the same strings people paste into chats), NEVER Epic
  tokens, account ids or anything from a session cookie. Redis TTL does the
  expiry, so nothing sweeps: 12h while a room is filling (outer safety net),
  then exactly 20 min from the moment the last player joins; "mark complete"
  DELs immediately. A late re-upload must NOT restart that clock — the test
  pins it. Talks the Upstash REST protocol over plain `fetch` (Vercel KV and
  Upstash both speak it) so there's still no client library; with no
  credentials it falls back to an in-memory Map hung off `globalThis` —
  module scope does NOT work, Next compiles each route into its own module
  instance and /api/room and /api/room/[code] would get separate stores
  (cost an hour on 2026-08-16). That fallback is dev-only and says so.
  Rooms plan at **seed 0 always**: the planner is deterministic and every
  player gets the same roster in the same order, so everyone sees the same
  proposal — that's why there's no re-roll in a room (one player re-rolling
  would show them a round nobody else could see). The host token is returned
  exactly once by POST /api/room, lives in the creator's localStorage, and is
  never in `publicRoom()` output — asserted in the test.
- **Anyone with the link can add, rename, or remove ANY player** — one person
  usually sets the whole room up from one phone, so a device is not tied to a
  seat (there's no "which player am I" in localStorage, only the host token,
  and only "mark complete" is gated). That makes **the collection code the
  identity, not the display name**: re-sending the same code refreshes that
  player, while a different code with the same name is a different person and
  gets suffixed "(2)". Keying on the name instead would silently merge two
  friends whose codes both fall back to "Guardian" into one seat — the test
  pins both halves. Names are per-roster and editable; the round renders from
  `players[].name`, not from the name inside the code.
- **Image upload — two paths, in order of trust.** (1) *Exact*
  (`lib/png-text.js`): every share image is stamped with the collection code
  that produced it, in a PNG tEXt chunk (~67 bytes, nothing visible), so
  uploading that file decodes back to precisely that collection with nothing
  guessed. (2) *Read* (`lib/vision-catalog.js` + `app/api/read-collection/`):
  any other picture — a fortnite.gg grid, an in-game screenshot, a chat-app
  re-encode that stripped the chunk — goes to Claude vision. A pasted code is
  still the third way in and the recovery path for both.
- **The reader can only name real sprites.** The structured-output schema's
  enums ARE the catalog (`SPRITE_LABELS` × `VARIANT_LABELS`), and every pair
  is re-checked through `toKey` afterwards, so an impossible combination
  (Holofoil Earth) is dropped rather than believed — style sets differ per
  sprite and a plausible-looking pair would put a sprite in someone's
  collection that Epic never shipped. Sources write the base style as "Base"
  or omit it; the catalog calls it Normal (`BASE_LABEL` bridges that).
- **`listKind` is the field that can invert a whole collection.** The same
  grid means opposite things depending on its heading — fortnite.gg's "I'M
  LOOKING FOR THESE" is a MISSING list, ours says "MISSING SPRITES" or "OWNED
  SPRITES". A missing list is inverted against ALL_KEYS, which is only sound
  if the screenshot was complete; a partial one would hand the player sprites
  they don't own and the round would ask them to trade one away. Hence
  `app/room/[code]/image-review.js`: nothing reaches a room until a human
  confirms the polarity (never pre-picked when the model says "unclear"),
  drops wrong tiles, and types a name — the reading carries no name of its
  own. Low-confidence picks are dotted so they get checked first.
- Reading costs money, so `/api/read-collection` is gated on a live room, caps
  the image at 6MB, and the client downscales to 2576px (Claude's high-res
  ceiling) before upload. Model is `claude-opus-5`; thinking is on by default
  and shares `max_tokens` with the JSON, hence the 8000. `stop_reason` is
  checked for `refusal`/`max_tokens` before the content is touched — both
  arrive as an ordinary 200.
- **Canvas primitives** live in `lib/share-canvas.js`, shared by both image
  renderers. `loadImage` and `loadDisplayFont` are both time-capped: a
  stalled sprite request or a webfont stylesheet that never arrives fires no
  error event, and that used to leave the share button on "Rendering…"
  forever (found + fixed 2026-08-16 — it hit the missing/owned image too).
  Don't remove those races.
- **Share codes:** `FMDS1.<name>.<base64url>` = 2-byte FNV-1a checksum of
  ALL_KEYS order + 89-bit ownership bitmap (lib/share.js). Any catalog
  reorder/insert changes the checksum → old codes get a friendly
  "different version" error, never a silent mis-decode. ALL_KEYS order is
  frozen by assertions in scripts/test-collection.mjs — update that
  snapshot consciously. The name segment must never contain a dot or
  whitespace: `sanitizeName` collapses both to "_" because decodeCode's
  pattern rejects them (until 2026-07-26 it wrote a space, so every user
  whose Epic display name had one — "Dark Knight 99" — produced codes and
  share links that nothing could decode).
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
- **"Nothing at rest" now has exactly ONE exception: trade rooms** (added
  2026-08-16, deliberately — a shared room can't be computed from a URL the
  way `/s/<code>` and `/trade` are). The exception is bounded and must stay
  that way: display names + collection codes only, auto-deleted within
  20 minutes of the room filling, no auth data, no account ids, no sync
  payloads. Everything else in the app still keeps nothing server-side.
  Don't widen this to "well, we have a database now."
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

- Air and Seven sprite slugs unverified until they appear in a live sync;
  same for the collabs (Batman/Vini/Pollo) — their vtid slugs are guesses
  and their pod style tags (Particle3–12, catalog 2026-07-30) haven't been
  seen in a real sync's owned tags yet. Wrong guesses surface in
  "unmapped"/"New from Epic", nothing is lost.
- v41.30 wave (2026-07-30, researched + adversarially verified from the
  wiki same-day): re-run catalog:check in 2–7 days — fortnite-api's pod
  (still 99 Mesh options) should pick up the 19 additions; then swap "/"
  overrides → pod tags, fold Lootin' Llama/Peeky Peely (and possibly
  Ironmouse/John Wick) in as pod sprites, drop their manualOnly/imgBase.
  Epic slugs for all four new sprites are unknown until a live sync.
- v41.30 oddities, decided deliberately: Gem Lootin' Llama is in the
  catalog though the wiki "New" list omits it (its file shipped in the
  same upload batch and the Loot Pool says Legendary-to-Special — if it
  turns out unobtainable, users just never toggle it). Gem Grim and the
  Ironmouse collab went live AND were vaulted the same day at 2 PM EDT
  (~5h window, likely accidental early enable) — kept for anyone who
  caught one; watch for a proper re-release. John Wick drops in Reload
  only and keeps its found level.
- The 2026-07-30 catalog change rolled the share-code checksum again
  (v41.30 inserts + appends; ALL_KEYS 98 → 117) — pre-07-30 codes now get
  the friendly "different version" error.
- `vercel.json` pins framework=nextjs (project was imported with preset
  "Other"; the pin overrides it).
