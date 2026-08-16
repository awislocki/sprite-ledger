import Anthropic from "@anthropic-ai/sdk";
import {
  READING_SCHEMA,
  SYSTEM_PROMPT,
  USER_PROMPT,
  readingToKeys,
} from "../../../lib/vision-catalog";
import { readRoom } from "../../../lib/room-store";

export const dynamic = "force-dynamic";

// Reads a collection out of an image the tracker didn't make — a fortnite.gg
// grid, an in-game screenshot, a photo of someone's phone. Images the tracker
// DID make carry their collection code in the PNG metadata and never reach
// here: that path is exact and free, this one is a best guess the user has to
// confirm before it counts.
//
// The model picks from the catalog's own enums (lib/vision-catalog.js), so it
// can only name sprites and styles that exist, and every pair is re-checked
// against the catalog before it leaves this route.

// Claude's high-resolution vision tops out at 2576px on the long edge; the
// client downscales to that before uploading, so anything much larger than a
// full-resolution screenshot is either a mistake or someone probing the route.
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Thinking is on by default on this model and counts against max_tokens
// alongside the JSON — a full 117-tile reading needs room for both.
const MAX_TOKENS = 8000;

const bad = (message, status = 400) => Response.json({ error: message }, { status });

export async function POST(req) {
  if (!process.env.ANTHROPIC_API_KEY)
    return bad(
      "Reading sprites from a picture isn't set up on this deployment — paste your collection code instead.",
      503
    );

  let body = null;
  try {
    body = await req.json();
  } catch {}

  // Reading an image costs real money, so it's gated on a live room: you can
  // only spend it from inside a round somebody actually started.
  if (!(await readRoom(body?.room)))
    return bad("That room has closed — ask for a new link.", 404);

  const { mediaType, data } = body?.image || {};
  if (!ALLOWED_TYPES.includes(mediaType))
    return bad("That file isn't an image the reader understands.");
  if (typeof data !== "string" || !data)
    return bad("No image data — try picking the file again.");
  // base64 is 4 characters per 3 bytes.
  if (data.length * 0.75 > MAX_IMAGE_BYTES)
    return bad("That image is too large — take a screenshot instead of a photo.");

  const client = new Anthropic();
  let response;
  try {
    response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: READING_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
            { type: "text", text: USER_PROMPT },
          ],
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError)
      return bad("The reader is busy right now — try again in a moment.", 429);
    if (err instanceof Anthropic.AuthenticationError)
      return bad("The reader isn't configured correctly on this deployment.", 503);
    if (err instanceof Anthropic.APIConnectionError)
      return bad("Couldn't reach the reader — check your connection.", 503);
    console.error("[read-collection]", err);
    return bad("Couldn't read that image — paste your collection code instead.", 502);
  }

  // Both of these come back as an ordinary 200, so they have to be checked
  // before the content is touched.
  if (response.stop_reason === "refusal")
    return bad("The reader declined that image — paste your collection code instead.");
  if (response.stop_reason === "max_tokens")
    return bad(
      "That image has more in it than the reader could work through — try a tighter crop."
    );

  const text = response.content.find((b) => b.type === "text")?.text;
  let reading;
  try {
    reading = JSON.parse(text);
  } catch {
    return bad("The reader returned something unusable — try again.", 502);
  }

  return Response.json({ reading: readingToKeys(reading) });
}
