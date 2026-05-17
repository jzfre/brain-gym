"use client";

import { useEffect, useState } from "react";

export function Timer({ minutes }: { minutes: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const totalSec = minutes * 60;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const over = elapsed >= totalSec;
  return (
    <div className={over ? "text-destructive" : "text-muted-foreground"}>
      <span className="font-mono">
        {mm}:{ss}
      </span>
      <span className="ml-2 text-xs">/ {minutes}m timebox</span>
    </div>
  );
}
