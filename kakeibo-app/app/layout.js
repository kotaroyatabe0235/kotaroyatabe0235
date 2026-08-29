import "./globals.css";

export const metadata = {
  title: "家計簿",
  description: "セルフホスト家計簿アプリ",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
