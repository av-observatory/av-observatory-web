import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteDescription =
  "Independent evidence on autonomous vehicles, including federal and state policy, safety reporting, investigations, deployment, and operations.";

export const metadata: Metadata = {
  metadataBase: new URL("https://av-observatory.com"),
  title: "AV Observatory",
  description: siteDescription,
  openGraph: {
    title: "AV Observatory",
    description: siteDescription,
    url: "https://av-observatory.com/",
    siteName: "AV Observatory",
    type: "website",
    images: [
      {
        url: "https://av-observatory.com/social-preview-v2.png",
        width: 2400,
        height: 1254,
        alt: "AV Observatory U.S. autonomous vehicle policy map",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AV Observatory",
    description: siteDescription,
    images: ["https://av-observatory.com/social-preview-v2.png"],
  },
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
          <div className="border-b border-[#cbddef] bg-[#edf5ff] px-5 sm:px-8 py-2.5 text-sm text-[#23436a] leading-snug">We publish early and update often. Spot missing information or an error? Or have a suggestion? <Link href="/contact" className="font-semibold text-[#184f95] underline underline-offset-2">Get in Touch →</Link></div>
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
