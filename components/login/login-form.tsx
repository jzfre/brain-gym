"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNextPath } from "@/lib/redirect";

export function LoginForm() {
  const params = useSearchParams();
  // Resolve to a same-origin relative path only (blocks //host, /\host, absolute
  // URLs, and control chars — see lib/redirect.ts). Read the origin at submit time.
  const rawNext = params.get("next");

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (!res.ok) {
        setError(
          res.status === 429
            ? `Too many attempts. Try again in ${res.headers.get("Retry-After") ?? "60"} seconds.`
            : res.status === 401 ? "Wrong password." : `Login failed (${res.status})`
        );
        return;
      }
      // Hard navigation makes middleware and server rendering see the new cookie.
      window.location.assign(safeNextPath(rawNext, window.location.origin));
    } catch {
      setError("Couldn’t connect. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={pending || password.length === 0} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
