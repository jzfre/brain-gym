"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { draftKey, newDraft, parseDraft, type ExerciseDraft } from "./draft-storage";

export function useExerciseDraft(problemId: string | undefined) {
  const [draft, setDraft] = useState<ExerciseDraft | null>(null);
  const current = useRef<ExerciseDraft | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);

  useEffect(() => {
    current.current = null;
    setDraft(null);
    setStorageUnavailable(false);
    if (!problemId) return;
    let restored: ExerciseDraft | null = null;
    try {
      restored = parseDraft(window.localStorage.getItem(draftKey(problemId)), problemId);
    } catch {
      setStorageUnavailable(true);
    }
    const value = restored ?? newDraft(problemId, crypto.randomUUID());
    current.current = value;
    setDraft(value);
    try {
      window.localStorage.setItem(draftKey(problemId), JSON.stringify(value));
    } catch {
      setStorageUnavailable(true);
    }
  }, [problemId]);

  const updateDraft = useCallback(
    (update: Partial<ExerciseDraft>) => {
      if (!current.current || current.current.problemId !== problemId) return;
      const value = { ...current.current, ...update };
      current.current = value;
      setDraft(value);
      // Write in the input handler, not a delayed effect: the last keystroke must
      // survive an immediate reload, sign-in redirect, or navigation.
      try {
        window.localStorage.setItem(draftKey(value.problemId), JSON.stringify(value));
      } catch {
        setStorageUnavailable(true);
      }
    },
    [problemId]
  );

  const clearDraft = useCallback(() => {
    if (!problemId) return;
    try {
      window.localStorage.removeItem(draftKey(problemId));
    } catch {
      setStorageUnavailable(true);
    }
  }, [problemId]);

  return {
    draft: draft?.problemId === problemId ? draft : null,
    updateDraft,
    clearDraft,
    storageUnavailable
  };
}
