"use client";

import { useEffect, useState } from "react";

export function Timer({ minutes, running = true, startedAt }: { minutes: number; running?: boolean; startedAt?: number }) {
  const [elapsed, setElapsed] = useState(() => startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0);
  useEffect(() => {
    if (!running) return; // frozen once the answer is submitted
    const segmentStart = startedAt ?? Date.now();
    const baseline = startedAt ? 0 : elapsed;
    // Browsers throttle intervals in background tabs. Read wall time so the
    // displayed timer catches up when the user returns.
    const t = setInterval(() => setElapsed(baseline + Math.floor((Date.now() - segmentStart) / 1000)), 1000);
    return () => clearInterval(t);
    // Capture the elapsed value only when starting/resuming the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, startedAt]);
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
