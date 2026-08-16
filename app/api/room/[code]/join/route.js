import { joinRoom, publicRoom } from "../../../../../lib/room-store";

export const dynamic = "force-dynamic";

// Add a player to the room from their collection code — whether that code was
// pasted or read out of an uploaded image's metadata, this is the only way in.
// Joining twice with the same display name replaces that player's entry, so a
// wrong upload is fixed by uploading again.
export async function POST(req, { params }) {
  const { code } = await params;
  let body = null;
  try {
    body = await req.json();
  } catch {}

  const collectionCode = body?.collectionCode;
  if (typeof collectionCode !== "string" || collectionCode.length > 200)
    return Response.json({ error: "Missing collection code." }, { status: 400 });

  try {
    // joinRoom decodes the code, so a code from an older catalog is rejected
    // here with its own friendly message rather than corrupting the room.
    const room = await joinRoom(code, collectionCode);
    return Response.json({ room: publicRoom(room) });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
