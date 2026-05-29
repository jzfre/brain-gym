"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Timer } from "./timer";
import { FeedbackPanel } from "./feedback-panel";

type Section = { order: number; title: string; description?: string };

type Problem = {
  id: string;
  userVisiblePayload: {
    title: string;
    timeboxMinutes: number;
    userVisiblePrompt: string;
    requiredAnswerSections: Section[];
    suggestedPacing: Array<{ label: string; minutes: number }>;
  };
};

export function AnswerEditor({ problem, slug }: { problem: Problem; slug: string }) {
  const startRef = useRef(Date.now());
  const sections = useMemo(
    () => [...problem.userVisiblePayload.requiredAnswerSections].sort((a, b) => a.order - b.order),
    [problem]
  );
  // LSAT walks the answer sections one at a time (Choice, then Reason); the other
  // modes keep a single freeform box.
  const wizard = slug === "LSAT_LOGICAL_REASONING" && sections.length > 0;

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(responseText: string) {
    setSubmitting(true);
    setStopped(true); // freeze the timer the moment the user commits the final answer
    setError(null);
    try {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
      const attemptRes = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemId: problem.id, responseText, timeSpentSeconds: elapsed })
      });
      if (!attemptRes.ok) throw new Error("Failed to save attempt");
      const { attemptId: aid } = await attemptRes.json();
      setAttemptId(aid);
      // Kick off evaluation; it runs in the background (may exceed Cloudflare's
      // request cap), so we don't await the result here — the feedback panel
      // polls for it.
      const evalRes = await fetch(`/api/attempts/${aid}/evaluate`, { method: "POST" });
      if (!evalRes.ok) {
        const msg = await evalRes.json().catch(() => ({}));
        throw new Error(`Couldn’t start evaluation: ${msg.message ?? evalRes.status}`);
      }
      setStarted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStopped(false); // submit failed; resume the timer while the user is still working
    } finally {
      setSubmitting(false);
    }
  }

  if (started && attemptId) {
    return <FeedbackPanel attemptId={attemptId} />;
  }

  const errorBlock = error ? (
    <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
      {error}
      {attemptId ? (
        <p className="mt-1 text-xs">
          Your attempt was saved (id {attemptId}). You can retry evaluation from history.
        </p>
      ) : null}
    </div>
  ) : null;

  function shell(body: ReactNode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-baseline justify-between gap-4">
            <span>{problem.userVisiblePayload.title}</span>
            <Timer minutes={problem.userVisiblePayload.timeboxMinutes} running={!stopped} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <article className="prose prose-sm max-w-none whitespace-pre-wrap">
            {problem.userVisiblePayload.userVisiblePrompt}
          </article>
          <Separator />
          {body}
        </CardContent>
      </Card>
    );
  }

  // Memo / Incident: one freeform answer box.
  if (!wizard) {
    return shell(
      <>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write your answer here…"
          className="min-h-[320px]"
          disabled={submitting}
        />
        <div className="flex items-center gap-3">
          <Button onClick={() => submit(text)} disabled={submitting || text.trim().length === 0}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </div>
        {errorBlock}
      </>
    );
  }

  // LSAT: step-by-step wizard, one answer section per step.
  const current = sections[step];
  const isLast = step === sections.length - 1;
  const currentFilled = (answers[current.order] ?? "").trim().length > 0;

  function handleNext() {
    setStep((s) => Math.min(s + 1, sections.length - 1));
  }

  function handleFinalSubmit() {
    const responseText = sections
      .map((s) => `${s.title}:\n${(answers[s.order] ?? "").trim()}`)
      .join("\n\n");
    void submit(responseText);
  }

  return shell(
    <section className="space-y-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Question {step + 1} of {sections.length}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={`answer-${current.order}`} className="text-sm font-semibold">
          {current.title}
          {current.description ? (
            <span className="font-normal text-muted-foreground"> — {current.description}</span>
          ) : null}
        </Label>
        <Textarea
          id={`answer-${current.order}`}
          value={answers[current.order] ?? ""}
          onChange={(e) => setAnswers((prev) => ({ ...prev, [current.order]: e.target.value }))}
          placeholder={`Your ${current.title.toLowerCase()}…`}
          disabled={submitting}
          className="min-h-[160px]"
        />
      </div>
      <div className="flex items-center gap-3">
        {step > 0 ? (
          <Button variant="outline" onClick={() => setStep((s) => Math.max(s - 1, 0))} disabled={submitting}>
            Back
          </Button>
        ) : null}
        {isLast ? (
          <Button onClick={handleFinalSubmit} disabled={submitting || !currentFilled}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        ) : (
          <Button onClick={handleNext} disabled={!currentFilled}>
            Next
          </Button>
        )}
      </div>
      {errorBlock}
    </section>
  );
}
