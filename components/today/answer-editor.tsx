"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Timer } from "./timer";
import { FeedbackPanel } from "./feedback-panel";

type Problem = {
  id: string;
  userVisiblePayload: {
    title: string;
    timeboxMinutes: number;
    userVisiblePrompt: string;
    requiredAnswerSections: Array<{ order: number; title: string; description?: string }>;
    suggestedPacing: Array<{ label: string; minutes: number }>;
  };
};

export function AnswerEditor({ problem }: { problem: Problem }) {
  const startRef = useRef(Date.now());
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [evaluationId, setEvaluationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
      const attemptRes = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemId: problem.id, responseText: text, timeSpentSeconds: elapsed })
      });
      if (!attemptRes.ok) throw new Error("Failed to save attempt");
      const { attemptId: aid } = await attemptRes.json();
      setAttemptId(aid);
      const evalRes = await fetch(`/api/attempts/${aid}/evaluate`, { method: "POST" });
      if (!evalRes.ok) {
        const msg = await evalRes.json().catch(() => ({}));
        throw new Error(`Evaluation failed: ${msg.message ?? evalRes.status}`);
      }
      const { evaluationId: eid } = await evalRes.json();
      setEvaluationId(eid);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (evaluationId && attemptId) {
    return <FeedbackPanel attemptId={attemptId} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-4">
          <span>{problem.userVisiblePayload.title}</span>
          <Timer minutes={problem.userVisiblePayload.timeboxMinutes} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <article className="prose prose-sm max-w-none whitespace-pre-wrap">
          {problem.userVisiblePayload.userVisiblePrompt}
        </article>

        <Separator />

        <section>
          <h3 className="mb-2 text-sm font-semibold">Required sections</h3>
          <ol className="list-decimal pl-6 text-sm text-muted-foreground">
            {problem.userVisiblePayload.requiredAnswerSections.map((s) => (
              <li key={s.order}>
                {s.title}
                {s.description ? <span> — {s.description}</span> : null}
              </li>
            ))}
          </ol>
        </section>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write your answer here…"
          className="min-h-[320px]"
        />

        <div className="flex gap-3">
          <Button onClick={handleSubmit} disabled={submitting || text.trim().length === 0}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
          {attemptId && !evaluationId ? (
            <span className="text-sm text-muted-foreground">Saved. Evaluating…</span>
          ) : null}
        </div>

        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
            {attemptId ? (
              <p className="mt-1 text-xs">
                Your attempt was saved (id {attemptId}). You can retry evaluation from history.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
