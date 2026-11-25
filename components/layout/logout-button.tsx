"use client";

import { useState } from "react";

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function handleLogout() {
    setPending(true);
    setError(false);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      window.location.assign("/login");
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <span>
      <button onClick={handleLogout} disabled={pending} className="text-sm hover:underline disabled:opacity-50">
        {pending ? "Logging out…" : "Log out"}
      </button>
      {error && <span role="alert" className="ml-2 text-xs text-destructive">Couldn’t log out. Try again.</span>}
    </span>
  );
}
