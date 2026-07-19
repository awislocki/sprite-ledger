# Sprite Ledger — Claude Code handoff

Mobile-first Fortnite Sprite collection tracker with real Epic sign-in.
Built and tested in a Claude.ai session (July 2026); this file carries the
context forward.

## Immediate tasks (in order)

1. **Push:** `git push -u origin main` — remote `origin` is already wired to
   https://github.com/awislocki/sprite-ledger.git and this commit is staged.
2. **Deploy:** Import the repo in Vercel. REQUIRED env var:
   `SESSION_SECRET` = output of `openssl rand -hex 32`. The login route
   fail-fasts with instructions if it's missing (deliberate — never burn a
   user's single-use Epic code on a misconfigured server).
3. **First live sync (Adam does this on his phone):** sign in at the deployed
   URL, sync, and inspect what comes back.
4. **Catalog recon:** Sprite storage in Epic's profile JSON is undocumented.
   The sync scans `athena` + `collections` profiles for templateIds matching
   /sprite/i. Whatever real templateIds appear under "New from Epic — not in
   catalog yet", add `match` keywords for them in `lib/catalog.js`. If the
   sync returns nothing, check `profileErrors` in the /api/sync response and
   extend `PROFILE_IDS` in `app/api/sync/route.js` with other candidate
   profile ids.

## Architecture (the parts that aren't obvious)

- **Auth:** Epic's official OAuth can't read Fortnite game data, so sign-in is
  the community auth-code flow: user pastes a one-time code from
  epicgames.com/id/api/redirect (fortniteIOSGameClient), server exchanges it,
  mints a per-account device auth, and seals it AES-256-GCM into an httpOnly
  cookie (`lib/session.js`). No database; server stores nothing at rest.
  Console players are covered because Epic's web login offers
  PlayStation/Xbox/Nintendo sign-in.
- **Sign-out** revokes the device auth at Epic (best-effort) and clears the
  cookie.
- **Client** (`app/page.js`): auth state machine, cache-first render from
  per-account localStorage, background sync on load, toasts for every error
  path. Cards are tap-to-edit as a manual fallback.
- **Mock mode:** `npm run dev:mock` runs a fake Epic (scripts/mock-epic.mjs)
  with test code `deadbeefdeadbeefdeadbeefdeadbeef` — full flow offline from
  Epic. Adam wants live testing only; the mock exists for regression checks.

## Constraints — do not relax these

- Never accept, log, or commit tokens/secrets. `.gitignore` covers `.env*`.
- Never hardcode SESSION_SECRET (a bootstrap fallback existed briefly for a
  direct Vercel test and was removed before git).
- Epic endpoints are undocumented and read-only personal-use; keep request
  volume minimal (sync is user-initiated + one silent sync on load).
- Error messages stay human: single-use code reuse, revoked device auth
  (auto sign-out + cookie clear), Epic outages, offline — all mapped in
  `lib/epic.js` friendly(). Preserve that mapping when editing.

## Testing already done

Full lifecycle verified against the mock: login (incl. whole-JSON paste
extraction), single-use code enforcement, cookie session round-trip/tamper,
sync item extraction + catalog mapping (Fire[Gold]L3, Fishy L5 Mastered,
Grim Reaper[Galaxy], unmapped item routing), logout revocation. Production
`next build` passes.
