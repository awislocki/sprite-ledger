import "./globals.css";

export const metadata = {
  title: "FMDS — Fortnite Sprite Tracker",
  description: "Your Fortnite Sprite collection — synced, tracked, extracted.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B0E15",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
