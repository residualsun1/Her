import "./globals.css";

export const metadata = {
  title: "Her — AI 记忆花园",
  description:
    "让图片化作流动的粒子记忆，在声音与对话中再次相遇。",
  applicationName: "Her — AI 记忆花园",
  openGraph: {
    title: "Her — AI 记忆花园",
    description: "与图像对话，保存片刻，再次回到记忆之中。",
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
