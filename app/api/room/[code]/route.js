import {
  readRoom,
  publicRoom,
  isHost,
  completeRoom,
  leaveRoom,
} from "../../../../lib/room-store";

export const dynamic = "force-dynamic";

const GONE = { error: "That room has closed — ask for a new link." };

// The room's live state. Players poll this, so it must stay cheap and must
// never leak the host token.
export async function GET(_req, { params }) {
  const { code } = await params;
  const room = await readRoom(code);
  if (!room) return Response.json(GONE, { status: 404 });
  return Response.json({ room: publicRoom(room) });
}

// Close the room early. Only the creator's browser holds the host token, so
// only they can end it before the 20-minute clock does.
export async function DELETE(req, { params }) {
  const { code } = await params;
  const room = await readRoom(code);
  if (!room) return Response.json(GONE, { status: 404 });

  const token = req.headers.get("x-room-host");
  if (!isHost(room, token))
    return Response.json(
      { error: "Only whoever started the room can close it." },
      { status: 403 }
    );
  await completeRoom(code);
  return Response.json({ ok: true });
}

// Remove one player — how someone undoes a wrong upload. Scoped to the
// player's own name, which their collection code already establishes.
export async function PATCH(req, { params }) {
  const { code } = await params;
  let body = null;
  try {
    body = await req.json();
  } catch {}
  if (!body?.name) return Response.json({ error: "Missing player." }, { status: 400 });

  const room = await leaveRoom(code, body.name);
  if (!room) return Response.json(GONE, { status: 404 });
  return Response.json({ room: publicRoom(room) });
}
