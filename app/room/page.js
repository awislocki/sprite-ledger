import StartRoom from "./start-room";

export const metadata = {
  title: "Start a Sprite trade room — FMDS",
  description:
    "Pick how many players are trading, share one link, and everyone drops in their collection.",
  robots: { index: false },
};

export default function StartRoomPage() {
  return <StartRoom />;
}
