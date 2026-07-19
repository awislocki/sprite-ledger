import {
  exchangeAuthCode,
  createDeviceAuth,
  EpicError,
} from "../../../../lib/epic";
import { sealSession, sessionSetCookie, requireSecret } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const CODE_RE = /[0-9a-f]{32}/i;

export async function POST(request) {
  // Config check first — never spend the user's single-use code on a
  // misconfigured server.
  try {
    requireSecret();
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  // Accept either the bare code or the full JSON blob Epic shows — we extract.
  const match = String(body?.code || "").match(CODE_RE);
  if (!match) {
    return Response.json(
      {
        error:
          "That doesn't look like an Epic code. Copy the 32-character authorizationCode (or paste the whole page — we'll find it).",
      },
      { status: 400 }
    );
  }

  try {
    const token = await exchangeAuthCode(match[0].toLowerCase());
    const da = await createDeviceAuth(token.access_token, token.account_id);

    const session = {
      d: da.deviceId,
      a: da.accountId,
      s: da.secret,
      n: token.displayName || "Epic player",
    };
    const cookie = sessionSetCookie(sealSession(session));

    return Response.json(
      { displayName: session.n, accountId: session.a },
      { headers: { "Set-Cookie": cookie } }
    );
  } catch (err) {
    if (err instanceof EpicError) {
      return Response.json(
        { error: err.friendly, code: err.code },
        { status: err.status }
      );
    }
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
