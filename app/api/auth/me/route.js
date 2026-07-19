import { cookies } from "next/headers";
import { openSession, SESSION_COOKIE } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = openSession(cookies().get(SESSION_COOKIE)?.value);
  if (!session) return Response.json({ error: "signed_out" }, { status: 401 });
  return Response.json({ displayName: session.n, accountId: session.a });
}
