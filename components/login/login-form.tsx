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

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    if (!res.ok) {
      setPending(false);
      setError(res.status === 401 ? "Wrong password." : `Login failed (${res.status})`);
      return;
    }
    // Hard navigation: forces a fresh server render so the cookie is honored
    // and the layout/middleware see the authenticated state from scratch.
    window.location.assign(safeNextPath(rawNext, window.location.origin));
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
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
