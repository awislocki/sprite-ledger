import { joinRoom, publicRoom } from "../../../../../lib/room-store";

export const dynamic = "force-dynamic";

// Add a player to the room from their collection code — whether that code was
// pasted, read out of an uploaded image's metadata, or read off a screenshot.
// Anyone holding the link may add anyone, so an optional `name` overrides the
// display name inside the code. Re-sending the same code refreshes that player
// instead of seating them twice.
export async function POST(req, { params }) {
  const { code } = await params;
  let body = null;
  try {
    body = await req.json();
  } catch {}

  const collectionCode = body?.collectionCode;
  if (typeof collectionCode !== "string" || collectionCode.length > 200)
    return Response.json({ error: "Missing collection code." }, { status: 400 });
  if (body?.name != null && typeof body.name !== "string")
    return Response.json({ error: "That name isn't usable." }, { status: 400 });

  try {
    // joinRoom decodes the code, so a code from an older catalog is rejected
    // here with its own friendly message rather than corrupting the room.
    const room = await joinRoom(code, collectionCode, body?.name);
    return Response.json({ room: publicRoom(room) });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
