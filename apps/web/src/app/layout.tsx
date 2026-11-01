import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "Find open-source issues that match your skills, with an honest, explained fit score. Every contribution has a beginning.";

export const metadata: Metadata = {
  title: {
    default: "Incipit · Find your first open-source contribution",
    template: "%s · Incipit",
  },
  description,
  applicationName: "Incipit",
  openGraph: {
    type: "website",
    siteName: "Incipit",
    title: "Incipit · Find your first open-source contribution",
    description,
  },
};

export const viewport: Viewport = {
  themeColor: "#f8f6f0",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
