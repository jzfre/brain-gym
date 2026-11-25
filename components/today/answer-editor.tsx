"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Timer } from "./timer";
import { FeedbackPanel } from "./feedback-panel";
import { saveAttemptAndEvaluate } from "./requests";
import type { ExerciseDraft, DraftUpdate } from "./draft-storage";
import { SubmissionError } from "./submission-error";
import { MemoSections } from "./memo-sections";
import { formatMemoAnswer, memoSectionsFor } from "@/lib/exercises/memo-extraction/template";

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

export function AnswerEditor({ problem, slug, draft, updateDraft, onSubmitted }: {
  problem: Problem; slug: string; draft: ExerciseDraft; updateDraft: DraftUpdate; onSubmitted: (id: number) => void;
}) {
  const submittingRef = useRef(false);
  const sections = useMemo(
    () => [...problem.userVisiblePayload.requiredAnswerSections].sort((a, b) => a.order - b.order),
    [problem]
  );
  // LSAT walks the answer sections one at a time (Choice, then Reason); Memo
  // shows a guided box per section; Incident keeps a single freeform box.
  const wizard = slug === "LSAT_LOGICAL_REASONING" && sections.length > 0;
  const memo = slug === "MEMO_EXTRACTION";
  const memoSections = useMemo(() => memoSectionsFor(sections), [sections]);

  const step = Math.min(draft.step, Math.max(0, sections.length - 1));
  const answers = draft.sectionAnswers;
  const memoAnswers = memoSections.map((_, i) => draft.memoAnswers[i] ?? "");
  const text = draft.text;
  const [submitting, setSubmitting] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(responseText: string) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setStopped(true); // freeze the timer the moment the user commits the final answer
    setError(null);
    try {
      const elapsed = Math.floor((Date.now() - (draft.startedAt ?? Date.now())) / 1000);
      const aid = await saveAttemptAndEvaluate({
        problemId: problem.id,
        clientSubmissionId: draft.clientSubmissionId,
        responseText,
        timeSpentSeconds: elapsed
      });
      setAttemptId(aid);
      onSubmitted(aid);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStopped(false); // submit failed; resume the timer while the user is still working
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (attemptId) {
    return <FeedbackPanel attemptId={attemptId} />;
  }

  const errorBlock = <SubmissionError error={error} problemId={problem.id} />;

  function shell(body: ReactNode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-baseline justify-between gap-4">
            <span>{problem.userVisiblePayload.title}</span>
            <Timer minutes={problem.userVisiblePayload.timeboxMinutes} running={!stopped} startedAt={draft.startedAt ?? undefined} />
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

  // Memo: one guided box per section; blank sections are allowed but flagged.
  if (memo) {
    const filled = memoAnswers.filter((a) => a.trim().length > 0).length;
    return shell(
      <>
        <MemoSections
          sections={memoSections}
          values={memoAnswers}
          onChange={(i, v) => updateDraft({ memoAnswers: memoAnswers.map((a, j) => (j === i ? v : a)) })}
          disabled={submitting}
        />
        <div className="flex items-center gap-3">
          <Button
            onClick={() => submit(formatMemoAnswer(memoSections, memoAnswers))}
            disabled={submitting || filled === 0}
          >
            {submitting ? "Submitting…" : "Submit"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {filled} of {memoSections.length} filled
          </span>
        </div>
        {errorBlock}
      </>
    );
  }

  // Incident: one freeform answer box.
  if (!wizard) {
    return shell(
      <>
        <Textarea
          value={text}
          onChange={(e) => updateDraft({ text: e.target.value })}
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
    updateDraft({ step: Math.min(step + 1, sections.length - 1) });
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
          onChange={(e) => updateDraft({ sectionAnswers: { ...answers, [current.order]: e.target.value } })}
          placeholder={`Your ${current.title.toLowerCase()}…`}
          disabled={submitting}
          className="min-h-[160px]"
        />
      </div>
      <div className="flex items-center gap-3">
        {step > 0 ? (
          <Button variant="outline" onClick={() => updateDraft({ step: Math.max(step - 1, 0) })} disabled={submitting}>
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
