import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AV Observatory",
  description: "Independent evidence on autonomous vehicles and their impacts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex bg-neutral-50 text-neutral-900">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <main className="flex-1 min-w-0">{children}</main>
          <footer className="border-t border-neutral-200">
            <div className="px-8 py-6 text-xs text-neutral-500">
              AV Observatory. Data sourced from public agency reporting; see each
              chart for sourcing, methodology, and download links.
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
