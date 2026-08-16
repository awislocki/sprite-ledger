import RoomLive from "./room-live";

export const metadata = {
  title: "Sprite trade room — FMDS",
  description:
    "Drop in your collection and see the trade round for everyone in this room.",
  robots: { index: false },
};

export default async function RoomPage({ params }) {
  const { code } = await params;
  return <RoomLive code={code.toUpperCase()} />;
}
