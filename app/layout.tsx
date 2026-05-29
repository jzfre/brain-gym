import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { LogoutButton } from "@/components/layout/logout-button";
import "./globals.css";

export const metadata = { title: "Brain Gym", description: "Deliberate practice for reasoning" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Middleware redirects unauthenticated users to /login before any protected
  // page renders, so anything other than /login is already authenticated. Key
  // the chrome off the path (set by middleware) instead of re-checking auth here
  // — that avoids sending a logged-in user to the login prompt if a cached or
  // proxied response makes a re-derived auth check wrongly false.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const showChrome = pathname !== "/login";

  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <header className="border-b">
          <div className="container mx-auto flex max-w-3xl items-center justify-between py-4">
            <Link href="/today" className="font-semibold tracking-tight">
              Brain Gym
            </Link>
            {showChrome ? (
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
            ) : null}
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
