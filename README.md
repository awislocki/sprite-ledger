# Sprite Ledger

Mobile-first tracker for Fortnite Chapter 7 Sprite collections — multi-user, with a guided Epic sign-in that works for console players. Each user's Epic access is stored **encrypted in their own browser cookie** (AES-256-GCM, httpOnly); the server keeps nothing at rest and needs no database.

## How sign-in works (including consoles)

Epic's official OAuth can't read Fortnite game data, so the app uses the community auth-code flow:

1. **Sign in at Epic** — the user logs in at epicgames.com with whatever their account is linked to: PlayStation, Xbox, Nintendo, PC, Google, Apple. That's the console support — platform doesn't matter, it's an Epic *account* login.
2. **Get a one-time code** — a second link shows a small JSON blob containing `authorizationCode`.
3. **Paste it** — the app accepts the bare code or the whole blob (it extracts the 32-char code either way). The server exchanges it, mints a per-account device auth, seals it into the user's cookie, and syncs.

Sign out revokes the device auth at Epic and clears the cookie.

## Deploy

```bash
npm install
```

Create `.env.local` (and set the same in Vercel → Project Settings → Environment Variables):

```
SESSION_SECRET=<output of: openssl rand -hex 32>
```

That's the only config. Then:

```bash
npm run dev        # local — open via LAN IP on your phone
```

or push to GitHub → import in Vercel → add `SESSION_SECRET` → deploy. Share the URL with friends; each signs in with their own Epic account. Add to home screen for the app feel.

> Changing `SESSION_SECRET` invalidates everyone's sessions (they just sign in again).

## Error handling map

| Situation | What the user sees |
|---|---|
| Pasted garbage / partial code | Inline: "That doesn't look like an Epic code…" (button stays disabled until a 32-char code is present) |
| Code already used / expired | "Codes are single-use — go back to step 2 and grab a fresh one." |
| Device auth revoked at Epic | Auto sign-out + "Your Epic sign-in was revoked or expired. Please sign in again." |
| Epic down / non-JSON response | "Epic returned an unexpected response — try again in a minute." |
| Offline | "You're offline — check your connection and try again." |
| Sync returns no sprite data | Non-fatal toast; cards remain manually tappable |
| `SESSION_SECRET` missing | Server 500 with the exact fix |

Collections are cached per-account in `localStorage`, so the app renders instantly from cache and syncs in the background on load.

## First-sync recon

Sprite storage inside Epic's profile JSON is undocumented. The sync scans the `athena` and `collections` profiles for anything sprite-shaped:

- Matched items land on cards (name/variant/level heuristics in `lib/catalog.js`).
- Unrecognized templateIds appear under **"New from Epic — not in catalog yet"**; add a `match` keyword in the catalog and they slot in.
- If nothing comes back, check `profileErrors` in the response and extend `PROFILE_IDS` in `app/api/sync/route.js`.

## Caveats

- Community-documented Epic endpoints, not an official API — Epic can change or break them, and automated access technically sits outside the ToS. Read-only, personal-use tooling; each user authorizes only their own account.
- Seed catalog names come from community sources (July 2026); the unmapped section exists to close the gap after real syncs.
