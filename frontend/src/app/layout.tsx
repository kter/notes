import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AmplifyProvider } from "@/lib/amplify";
import { AuthProvider } from "@/lib/auth-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Dynamic noindex based on environment
const isProduction = process.env.NEXT_PUBLIC_ENVIRONMENT === "prd";

export const metadata: Metadata = {
  title: "Notes - Mac Clone",
  description: "A Mac Notes app clone with AI-powered features",
  robots: isProduction ? "index, follow" : "noindex, nofollow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        {!isProduction && <meta name="robots" content="noindex, nofollow" />}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AmplifyProvider>
          <AuthProvider>{children}</AuthProvider>
        </AmplifyProvider>
      </body>
    </html>
  );
}
