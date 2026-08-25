import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HTA Multifamily Invoicing Tracker",
  description: "Owner draws and subcontractor invoicing for HTA Construction & Development",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
