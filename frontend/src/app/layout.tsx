import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider, AuthProvider, ToasterProvider } from "@/providers";
import { RollupCreationProvider } from "@/features/rollup/context/RollupCreationContext";
import { PublicEnvScript } from "next-runtime-env";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tokamak Rollup Hub Platform",
  description:
    "Explore and Deploy your On-Demand Appchains. A Fast, secure and fully customizable L2 Appchains.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <PublicEnvScript />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryProvider>
          <AuthProvider>
            <RollupCreationProvider>
              {children}
              <ToasterProvider />
            </RollupCreationProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
