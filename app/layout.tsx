import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#4f46e5",
};

export const metadata: Metadata = {
  title: "Proscan - Smart Shopping with Barcode Scanning",
  description: "E-commerce app with AI-powered product scanning using YOLOv8",
  keywords: ["shopping", "barcode", "QR code", "scanning", "e-commerce"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} overflow-x-hidden antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
