import { createRoom, publicRoom, hasStore } from "../../../lib/room-store";

export const dynamic = "force-dynamic";

// Start a trade room. The response carries a host token that identifies the
// creator's browser for "mark complete" — it's returned exactly once, here,
// and is never included in the room's public state.
export async function POST(req) {
  let body = null;
  try {
    body = await req.json();
  } catch {}

  if (!hasStore && process.env.NODE_ENV === "production")
    return Response.json(
      {
        error:
          "Trade rooms aren't configured on this deployment yet — add a Vercel KV / Upstash integration.",
      },
      { status: 503 }
    );

  try {
    const { room, host } = await createRoom(body?.size);
    return Response.json({ room: publicRoom(room), host });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
