import TradePlanner from "./trade-planner";

// Public, unauthenticated trade planner: /trade (optionally
// /trade?p=<code>,<code>). Collection codes carry the whole payload, so this
// route needs no auth, no Epic call and no stored state — anyone in the group
// chat can open it, paste everyone's codes and get the round, whether or not
// they use the tracker themselves.

export const metadata = {
  title: "Plan a Sprite trade round — FMDS",
  description:
    "Paste 2–4 collection codes and get a round where every player hands over one Sprite and gets one they're missing.",
  robots: { index: false }, // links carry people's collections, not search fodder
};

export default function TradeRoundPage() {
  return <TradePlanner />;
}
