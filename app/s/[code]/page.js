import { ALL_SPRITES, spriteVariants } from "../../../lib/catalog";
import { decodeCode } from "../../../lib/share";
import PublicLedger from "./public-ledger";

// Public, unauthenticated collection view: /s/<collection code>. The code IS
// the payload (one bit per catalog variant), so this route needs no auth, no
// Epic call, and no stored state — anyone with the link can see what the
// owner has and needs, whether or not they use the tracker.

const TOTAL = ALL_SPRITES.reduce((n, s) => n + spriteVariants(s).length, 0);

// Link previews in iMessage/Discord/WhatsApp are most of the point of sharing,
// so give them a real title and count.
export async function generateMetadata({ params }) {
  const { code } = await params;
  try {
    const { name, owned } = decodeCode(decodeURIComponent(code));
    return {
      title: `${name}'s Sprites — ${owned.size}/${TOTAL} collected`,
      description: `See which Fortnite Sprites ${name} has and still needs — open to compare with yours.`,
      robots: { index: false }, // a personal collection link, not search fodder
    };
  } catch {
    return { title: "Shared Sprite collection", robots: { index: false } };
  }
}

export default async function SharedCollectionPage({ params }) {
  const { code } = await params;
  return <PublicLedger code={decodeURIComponent(code)} />;
}
