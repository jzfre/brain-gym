"use client";

import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Timer } from "./timer";
import { FeedbackPanel } from "./feedback-panel";
import { saveAttemptAndEvaluate } from "./requests";
import type { ExerciseDraft, DraftUpdate } from "./draft-storage";
import { SubmissionError } from "./submission-error";
import type { LsatPublicQuestion } from "@/lib/exercises/types";

const CHOICES = ["A", "B", "C", "D", "E"] as const;

type Problem = {
  id: string;
  userVisiblePayload: {
    title: string;
    timeboxMinutes: number;
    questions: LsatPublicQuestion[];
  };
};

type Answer = { choice: string; reasoning: string };

export function LsatSetRunner({ problem, draft, updateDraft, onSubmitted }: {
  problem: Problem; draft: ExerciseDraft; updateDraft: DraftUpdate; onSubmitted: (id: number) => void;
}) {
  const submittingRef = useRef(false);
  const questions = useMemo(
    () => [...problem.userVisiblePayload.questions].sort((a, b) => a.number - b.number),
    [problem]
  );

  const step = Math.min(draft.step, Math.max(0, questions.length - 1));
  const answers = draft.lsatAnswers;
  const [submitting, setSubmitting] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = questions[step];
  const answer = answers[q.number] ?? { choice: "", reasoning: "" };
  const isLast = step === questions.length - 1;
  const currentFilled = answer.choice !== "" && answer.reasoning.trim().length > 0;

  function update(patch: Partial<Answer>) {
    updateDraft({ lsatAnswers: {
      ...answers,
      [q.number]: { ...(answers[q.number] ?? { choice: "", reasoning: "" }), ...patch }
    } });
  }

  async function submit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setStopped(true);
    setError(null);
    try {
      const elapsed = Math.floor((Date.now() - (draft.startedAt ?? Date.now())) / 1000);
      const responseText = JSON.stringify({
        answers: questions.map((question) => ({
          number: question.number,
          choice: answers[question.number]?.choice ?? "",
          reasoning: (answers[question.number]?.reasoning ?? "").trim()
        }))
      });
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

  const answeredCount = questions.filter(
    (question) =>
      (answers[question.number]?.choice ?? "") !== "" &&
      (answers[question.number]?.reasoning ?? "").trim().length > 0
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-4">
          <span>{problem.userVisiblePayload.title}</span>
          <Timer minutes={problem.userVisiblePayload.timeboxMinutes} running={!stopped} startedAt={draft.startedAt ?? undefined} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Question {step + 1} of {questions.length}
          {q.questionType ? <span className="ml-2 normal-case">· {q.questionType}</span> : null}
        </p>

        <article className="prose prose-sm max-w-none whitespace-pre-wrap">
          {q.stimulus}
          {q.questionStem ? `\n\n${q.questionStem}` : ""}
        </article>

        <Separator />

        <div className="space-y-2">
          <Label className="text-sm font-semibold">Your answer</Label>
          <RadioGroup
            value={answer.choice}
            onValueChange={(v) => update({ choice: v })}
            disabled={submitting}
            className="space-y-1"
          >
            {CHOICES.map((c) => (
              <div key={c} className="flex items-start gap-2">
                <RadioGroupItem id={`q${q.number}-${c}`} value={c} className="mt-1" />
                <Label htmlFor={`q${q.number}-${c}`} className="font-normal leading-snug">
                  <span className="font-mono font-medium">{c}.</span> {q.choices[c]}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`reason-${q.number}`} className="text-sm font-semibold">
            Reason <span className="font-normal text-muted-foreground">— one or two sentences</span>
          </Label>
          <Textarea
            id={`reason-${q.number}`}
            value={answer.reasoning}
            onChange={(e) => update({ reasoning: e.target.value })}
            placeholder="Why is that the answer?"
            disabled={submitting}
            className="min-h-[100px]"
          />
        </div>

        <div className="flex items-center gap-3">
          {step > 0 ? (
            <Button variant="outline" onClick={() => updateDraft({ step: Math.max(step - 1, 0) })} disabled={submitting}>
              Back
            </Button>
          ) : null}
          {isLast ? (
            <Button onClick={submit} disabled={submitting || answeredCount < questions.length}>
              {submitting ? "Submitting…" : `Submit all ${questions.length}`}
            </Button>
          ) : (
            <Button onClick={() => updateDraft({ step: Math.min(step + 1, questions.length - 1) })} disabled={!currentFilled}>
              Next
            </Button>
          )}
          {isLast && answeredCount < questions.length ? (
            <span className="text-sm text-muted-foreground">Answer this question to submit.</span>
          ) : null}
        </div>

        <SubmissionError error={error} problemId={problem.id} />
      </CardContent>
    </Card>
  );
}
