import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { LogoutButton } from "@/components/layout/logout-button";
import { SESSION_COOKIE, sessionTokenFor, timingSafeEqualStr } from "@/lib/auth";
import "./globals.css";

export const metadata = { title: "Brain Gym", description: "Deliberate practice for reasoning" };

async function isAuthenticated(): Promise<boolean> {
  const password = process.env.APP_PASSWORD;
  if (!password) return false;
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  if (!cookie) return false;
  const expected = await sessionTokenFor(password);
  return timingSafeEqualStr(cookie, expected);
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const authed = await isAuthenticated();
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <header className="border-b">
          <div className="container mx-auto flex max-w-3xl items-center justify-between py-4">
            <Link href={authed ? "/today" : "/login"} className="font-semibold tracking-tight">
              Brain Gym
            </Link>
            {authed ? (
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
