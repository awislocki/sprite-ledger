import { cookies } from "next/headers";
import {
  openSession,
  SESSION_COOKIE,
  sessionClearCookie,
} from "../../../../lib/session";
import { tokenFromDeviceAuth, deleteDeviceAuth } from "../../../../lib/epic";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = openSession((await cookies()).get(SESSION_COOKIE)?.value);

  // Best-effort: revoke the device auth at Epic so nothing lingers server-side.
  if (session) {
    try {
      const token = await tokenFromDeviceAuth(session);
      await deleteDeviceAuth(token.access_token, session.a, session.d);
    } catch {
      // Even if Epic is unreachable, clearing the cookie signs the user out here.
    }
  }

  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": sessionClearCookie() } }
  );
}
