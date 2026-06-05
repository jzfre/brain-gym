"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnswerEditor } from "./answer-editor";
import { LsatSetRunner } from "./lsat-set-runner";
import type { LsatPublicQuestion } from "@/lib/exercises/types";

const EXERCISES = [
  { slug: "MEMO_EXTRACTION", name: "Memo" },
  { slug: "INCIDENT_RESPONSE", name: "Incident" },
  { slug: "LSAT_LOGICAL_REASONING", name: "LSAT" }
] as const;

const POLL_INTERVAL_MS = 3000;
// Client-side give-up point, NOT the server's limit: a healthy generation can
// run up to OPENAI_TIMEOUT_MS × 2 SDK attempts (~40 min) per model call, and
// the dedup loop may issue several calls. The job keeps running server-side
// past this deadline; a finished problem lands in Admin → Problems.
const POLL_DEADLINE_MS = 45 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Generation runs server-side as a background job (it can take minutes —
// far past Cloudflare's 100s proxy limit), so we poll the job's status with
// cheap sub-second requests until it settles. Same cadence as feedback-panel.
async function pollForProblem(jobId: string): Promise<string> {
  const deadline = Date.now() + POLL_DEADLINE_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    let d: { status?: string; problemId?: string | null; error?: string | null };
    try {
      const r = await fetch(`/api/problems/generate/${jobId}`);
      if (r.status === 404) {
        throw new Error("Generation was lost (server restarted) — please retry.");
      }
      d = await r.json();
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Generation was lost")) throw e;
      continue; // transient network error — keep polling
    }
    if (d.status === "succeeded" && d.problemId) return d.problemId;
    if (d.status === "failed") throw new Error(d.error ?? "generation failed");
  }
  throw new Error(
    "Still generating after 45 minutes — the server keeps working and a finished problem " +
      "will appear under Admin → Problems. Retrying now would start a second generation."
  );
}

type ProblemPayload = {
  id: string;
  userVisiblePayload: {
    title: string;
    timeboxMinutes: number;
    userVisiblePrompt: string;
    requiredAnswerSections: Array<{ order: number; title: string; description?: string }>;
    suggestedPacing: Array<{ label: string; minutes: number }>;
    questions?: LsatPublicQuestion[];
  };
};

export function ExercisePicker() {
  const [slug, setSlug] = useState<(typeof EXERCISES)[number]["slug"]>("MEMO_EXTRACTION");
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [generating, setGenerating] = useState(false);
  const [problem, setProblem] = useState<ProblemPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setProblem(null);
    try {
      const res = await fetch("/api/problems/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseSlug: slug, difficulty })
      });
      if (res.status !== 202) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg.message ?? `HTTP ${res.status}`);
      }
      const { jobId } = await res.json();
      const problemId = await pollForProblem(jobId);
      const probRes = await fetch(`/api/problems/${problemId}`);
      const prob = await probRes.json();
      setProblem({ id: prob.id, userVisiblePayload: prob.userVisiblePayload });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  if (problem) {
    const q = problem.userVisiblePayload.questions;
    if (slug === "LSAT_LOGICAL_REASONING" && q && q.length > 0) {
      return (
        <LsatSetRunner
          problem={{
            id: problem.id,
            userVisiblePayload: {
              title: problem.userVisiblePayload.title,
              timeboxMinutes: problem.userVisiblePayload.timeboxMinutes,
              questions: q
            }
          }}
        />
      );
    }
    return <AnswerEditor problem={problem} slug={slug} />;
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
              <TabsTrigger key={e.slug} value={e.slug}>
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

        <Button onClick={handleGenerate} disabled={generating}>
          {generating ? "Generating…" : "Generate problem"}
        </Button>

        {error && <p className="text-sm text-destructive">Error: {error}</p>}
      </CardContent>
    </Card>
  );
}
