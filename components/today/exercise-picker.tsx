"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GenerationStopped, pollForProblem } from "./requests";
import {
  clearPendingGeneration,
  generationRecoveryPath,
  parsePendingGeneration,
  type GenerationRequest,
  type PendingGeneration,
  readPendingGeneration,
  validGenerationId,
  writePendingGeneration
} from "./generation-storage";
import { useExerciseDraft } from "./use-exercise-draft";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnswerEditor } from "./answer-editor";
import { LsatSetRunner } from "./lsat-set-runner";
import { ReadyDialog } from "./ready-dialog";
import type { LsatPublicQuestion } from "@/lib/exercises/types";

const EXERCISES = [
  { slug: "MEMO_EXTRACTION", name: "Memo" },
  { slug: "INCIDENT_RESPONSE", name: "Incident" },
  { slug: "LSAT_LOGICAL_REASONING", name: "LSAT" }
] as const;

export type ProblemPayload = {
  id: string;
  // The exercise the problem was generated for — not the live tab, which the
  // user can switch while a generation is running.
  slug: (typeof EXERCISES)[number]["slug"];
  userVisiblePayload: {
    title: string;
    timeboxMinutes: number;
    userVisiblePrompt: string;
    requiredAnswerSections: Array<{ order: number; title: string; description?: string }>;
    suggestedPacing: Array<{ label: string; minutes: number }>;
    questions?: LsatPublicQuestion[];
  };
};

export function ExercisePicker({
  initialProblem = null
}: {
  initialProblem?: ProblemPayload | null;
}) {
  const generationRef = useRef<AbortController | null>(null);
  const [slug, setSlug] = useState<(typeof EXERCISES)[number]["slug"]>("MEMO_EXTRACTION");
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [generating, setGenerating] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState<PendingGeneration | null>(null);
  const pendingJobId = pendingGeneration?.jobId ?? null;
  const [generationAuthRequired, setGenerationAuthRequired] = useState(false);
  const [problem, setProblem] = useState<ProblemPayload | null>(initialProblem);
  const router = useRouter();
  const { draft, updateDraft, clearDraft, storageUnavailable } = useExerciseDraft(problem?.id);
  function onSubmitted(attemptId: number) {
    clearDraft();
    router.replace(`/history/${attemptId}`);
  }
  const [error, setError] = useState<string | null>(null);

  const rememberJob = useCallback((jobId: string, request?: GenerationRequest) => {
    let pending: PendingGeneration = { version: 1, jobId };
    if (request) pending = { version: 1, ...request, jobId };
    else {
      try {
        const saved = readPendingGeneration(window.localStorage);
        if (saved?.jobId === jobId) pending = saved;
      } catch {
        /* Restricted storage. */
      }
    }
    setPendingGeneration(pending);
    if ("clientGenerationId" in pending) {
      setSlug(pending.exerciseSlug);
      setDifficulty(pending.difficulty);
    }
    try {
      writePendingGeneration(window.localStorage, pending);
    } catch {
      /* Restricted storage. */
    }
    window.history.replaceState(null, "", generationRecoveryPath(pending));
  }, []);

  const forgetJob = useCallback((jobId: string) => {
    setPendingGeneration(null);
    try {
      clearPendingGeneration(window.localStorage, jobId);
    } catch {
      /* Restricted storage. */
    }
  }, []);

  const reportGenerationError = useCallback(
    (error: unknown, jobId?: string) => {
      setError(error instanceof Error ? error.message : String(error));
      setGenerationAuthRequired(error instanceof GenerationStopped && error.kind === "auth");
      if (jobId && error instanceof GenerationStopped && error.kind !== "auth") {
        forgetJob(jobId);
        window.history.replaceState(null, "", "/today");
      }
    },
    [forgetJob]
  );

  const loadGeneratedProblem = useCallback(
    async (jobId: string, controller: AbortController) => {
      const problemId = await pollForProblem(jobId, controller.signal);
      const response = await fetch(`/api/problems/${problemId}`, { signal: controller.signal });
      if (response.status === 401 || response.status === 403) {
        throw new GenerationStopped("Your session expired. Sign in again to continue.", "auth");
      }
      if (!response.ok)
        throw new Error(
          `Couldn’t load the generated problem (${response.status}). Check again to reopen the same generation.`
        );
      const generated = await response.json();
      if (controller.signal.aborted) return;
      const exerciseSlug = generated.exerciseType?.slug;
      if (!EXERCISES.some((exercise) => exercise.slug === exerciseSlug))
        throw new Error("The generated exercise type is unavailable. Check again.");
      setProblem({
        id: generated.id,
        slug: exerciseSlug,
        userVisiblePayload: generated.userVisiblePayload
      });
      forgetJob(jobId);
      window.history.replaceState(null, "", `/today?problemId=${encodeURIComponent(generated.id)}`);
    },
    [forgetJob]
  );

  const resumeGeneration = useCallback(
    async (jobId: string) => {
      if (generationRef.current && !generationRef.current.signal.aborted) return;
      const controller = new AbortController();
      generationRef.current = controller;
      rememberJob(jobId);
      setGenerating(true);
      setError(null);
      setGenerationAuthRequired(false);
      try {
        await loadGeneratedProblem(jobId, controller);
      } catch (error) {
        if (!controller.signal.aborted) reportGenerationError(error, jobId);
      } finally {
        if (!controller.signal.aborted) setGenerating(false);
        if (generationRef.current === controller) generationRef.current = null;
      }
    },
    [loadGeneratedProblem, rememberJob, reportGenerationError]
  );

  const rememberRequest = useCallback((request: GenerationRequest) => {
    const pending = { version: 1 as const, ...request };
    setPendingGeneration(pending);
    setSlug(request.exerciseSlug);
    setDifficulty(request.difficulty);
    try {
      writePendingGeneration(window.localStorage, pending);
    } catch {
      /* Restricted storage. */
    }
    window.history.replaceState(null, "", generationRecoveryPath(pending));
  }, []);

  const submitGeneration = useCallback(
    async (request: GenerationRequest) => {
      if (generationRef.current && !generationRef.current.signal.aborted) return;
      const controller = new AbortController();
      generationRef.current = controller;
      setGenerating(true);
      setError(null);
      setGenerationAuthRequired(false);
      setProblem(null);
      let acceptedJobId: string | undefined;
      rememberRequest(request);
      try {
        const response = await fetch("/api/problems/generate", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientGenerationId: request.clientGenerationId,
            exerciseSlug: request.exerciseSlug,
            difficulty: request.difficulty
          })
        });
        if (response.status === 401 || response.status === 403) {
          throw new GenerationStopped("Your session expired. Sign in again to continue.", "auth");
        }
        if (response.status !== 202) {
          const message = await response.json().catch(() => ({}));
          throw new Error(message.message ?? `HTTP ${response.status}`);
        }
        const { jobId } = await response.json();
        if (controller.signal.aborted) return;
        if (!validGenerationId(jobId)) throw new Error("Invalid generation response.");
        acceptedJobId = jobId;
        // Persist before polling, including the URL fallback for blocked storage.
        rememberJob(jobId, request);
        await loadGeneratedProblem(jobId, controller);
      } catch (error) {
        if (!controller.signal.aborted) reportGenerationError(error, acceptedJobId);
      } finally {
        if (!controller.signal.aborted) setGenerating(false);
        if (generationRef.current === controller) generationRef.current = null;
      }
    },
    [loadGeneratedProblem, rememberJob, rememberRequest, reportGenerationError]
  );

  useEffect(() => {
    // Explicit recovery links win over another tab's latest stored request.
    if (!initialProblem) {
      const query = new URL(window.location.href).searchParams;
      const jobId = query.get("jobId");
      const requestId = query.get("generationId");
      let pending: PendingGeneration | null = null;
      if (jobId !== null) pending = validGenerationId(jobId) ? { version: 1, jobId } : null;
      else if (requestId !== null)
        pending = parsePendingGeneration({
          version: 1,
          clientGenerationId: requestId,
          exerciseSlug: query.get("exerciseSlug"),
          difficulty: query.get("difficulty")
        });
      else {
        try {
          pending = readPendingGeneration(window.localStorage);
        } catch {
          /* Restricted storage. */
        }
      }
      if (pending?.jobId) void resumeGeneration(pending.jobId);
      else if (pending && "clientGenerationId" in pending) void submitGeneration(pending);
      else if (jobId !== null || requestId !== null) setError("Invalid generation recovery link.");
    }
    setRecoveryReady(true);
    return () => generationRef.current?.abort();
  }, [initialProblem, resumeGeneration, submitGeneration]);

  function handleGenerate() {
    if (pendingJobId) void resumeGeneration(pendingJobId);
    else if (pendingGeneration && "clientGenerationId" in pendingGeneration)
      void submitGeneration(pendingGeneration);
    else
      void submitGeneration({
        clientGenerationId: crypto.randomUUID(),
        exerciseSlug: slug,
        difficulty
      });
  }

  if (problem && (!draft || draft.startedAt === null)) {
    return (
      <ReadyDialog
        title={problem.userVisiblePayload.title}
        minutes={problem.userVisiblePayload.timeboxMinutes}
        disabled={!draft}
        onStart={() => updateDraft({ startedAt: Date.now() })}
      />
    );
  }

  if (problem && draft) {
    const warning = storageUnavailable ? (
      <p role="alert" className="mb-4 rounded-md border p-3 text-sm text-destructive">
        Your browser couldn’t save this draft. Keep this page open until you submit.
      </p>
    ) : null;
    const q = problem.userVisiblePayload.questions;
    if (problem.slug === "LSAT_LOGICAL_REASONING" && q && q.length > 0) {
      return (
        <>
          {warning}
          <LsatSetRunner
            draft={draft}
            updateDraft={updateDraft}
            onSubmitted={onSubmitted}
            problem={{
              id: problem.id,
              userVisiblePayload: {
                title: problem.userVisiblePayload.title,
                timeboxMinutes: problem.userVisiblePayload.timeboxMinutes,
                questions: q
              }
            }}
          />
        </>
      );
    }
    return (
      <>
        {warning}
        <AnswerEditor
          problem={problem}
          slug={problem.slug}
          draft={draft}
          updateDraft={updateDraft}
          onSubmitted={onSubmitted}
        />
      </>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick an exercise</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={slug} onValueChange={(v) => setSlug(v as typeof slug)}>
          <TabsList>
            {EXERCISES.map((e) => (
              <TabsTrigger key={e.slug} value={e.slug} disabled={generating || !!pendingGeneration}>
                {e.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {EXERCISES.map((e) => (
            <TabsContent key={e.slug} value={e.slug} />
          ))}
        </Tabs>

        <div className="space-y-2">
          <Label>Difficulty</Label>
          <RadioGroup
            className="flex gap-6"
            disabled={generating || !!pendingGeneration}
            value={difficulty}
            onValueChange={(v) => setDifficulty(v as typeof difficulty)}
          >
            {(["EASY", "MEDIUM", "HARD"] as const).map((d) => (
              <div key={d} className="flex items-center space-x-2">
                <RadioGroupItem id={d} value={d} />
                <Label htmlFor={d}>{d.toLowerCase()}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <Button onClick={handleGenerate} disabled={generating || !recoveryReady}>
          {generating ? "Generating…" : pendingGeneration ? "Check generation" : "Generate problem"}
        </Button>
        {pendingGeneration && (
          <p role="status" className="text-sm text-muted-foreground">
            Your generation request is saved. You can reload or return to Today to resume it.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            Error: {error}
          </p>
        )}
        {generationAuthRequired && (
          <a
            className="block text-sm underline"
            href={`/login?next=${encodeURIComponent(pendingGeneration ? generationRecoveryPath(pendingGeneration) : "/today")}`}
          >
            Sign in again
          </a>
        )}
      </CardContent>
    </Card>
  );
}
