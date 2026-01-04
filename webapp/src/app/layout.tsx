import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AWS CDK Daily Summary",
  description: "Daily summary of AWS CDK repository pull requests",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
