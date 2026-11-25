"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

export function ReadyDialog({
  title,
  minutes,
  onStart,
  disabled = false
}: {
  title: string;
  minutes: number;
  onStart: () => void;
  disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    if (!disabled) startButton.current?.focus();
  }, [disabled]);

  return (
    <dialog
      ref={dialog}
      aria-describedby="ready-description"
      aria-labelledby="ready-title"
      onCancel={(event) => event.preventDefault()}
      className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-lg border bg-card p-6 text-card-foreground shadow-lg backdrop:bg-background/80 backdrop:backdrop-blur-sm"
    >
      <h2 id="ready-title" className="text-2xl font-semibold tracking-tight">
        Ready to start?
      </h2>
      <p id="ready-description" className="mt-3 text-sm leading-6 text-muted-foreground">
        “{title}” is ready. Your {minutes}-minute timer has not started yet. It will begin when you
        open the exercise.
      </p>
      <Button
        ref={startButton}
        disabled={disabled}
        className="mt-6 w-full"
        size="lg"
        onClick={onStart}
      >
        Start exercise
      </Button>
    </dialog>
  );
}
