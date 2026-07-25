"use client";

import { Button } from "@/components/ui/button";

export function ReadyDialog({
  title,
  minutes,
  onStart
}: {
  title: string;
  minutes: number;
  onStart: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <section
        aria-describedby="ready-description"
        aria-labelledby="ready-title"
        aria-modal="true"
        className="w-full max-w-md rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
        role="dialog"
      >
        <h2 id="ready-title" className="text-2xl font-semibold tracking-tight">
          Ready to start?
        </h2>
        <p id="ready-description" className="mt-3 text-sm leading-6 text-muted-foreground">
          “{title}” is ready. Your {minutes}-minute timer has not started yet. It will begin when
          you open the exercise.
        </p>
        <Button autoFocus className="mt-6 w-full" size="lg" onClick={onStart}>
          Start exercise
        </Button>
      </section>
    </div>
  );
}
