import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Her — AI Memory Garden",
  description:
    "An atmospheric bilingual AI voice companion where images become living particle memories.",
  applicationName: "Her — AI Memory Garden",
  openGraph: {
    title: "Her — AI Memory Garden",
    description: "Speak with an image, save the conversation, return to the memory.",
    type: "website",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
