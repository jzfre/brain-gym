import type { ReactNode } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/layout/logout-button";
import "./globals.css";

export const metadata = { title: "Brain Gym", description: "Deliberate practice for reasoning" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <header className="border-b">
          <div className="container mx-auto flex max-w-3xl items-center justify-between py-4">
            <Link href="/today" className="font-semibold tracking-tight">
              Brain Gym
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/today" className="hover:underline">
                Today
              </Link>
              <Link href="/history" className="hover:underline">
                History
              </Link>
              <Link href="/admin/prompts" className="hover:underline">
                Admin
              </Link>
              <LogoutButton />
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
