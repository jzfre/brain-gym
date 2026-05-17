"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

type Detail = {
  attempt: { id: number; responseText: string };
  evaluation: {
    overallScore: number;
    shortDiagnosis: string;
    summary: string;
    topFixes: string[];
    nextRep: string;
    strongAnswerSketch?: string | null;
    dimensions: Array<{ dimension: string; score: number; rationale: string }>;
    errorPatternTags: string[];
  } | null;
};

export function FeedbackPanel({ attemptId }: { attemptId: number }) {
  const [data, setData] = useState<Detail | null>(null);
  useEffect(() => {
    fetch(`/api/history/${attemptId}`)
      .then((r) => r.json())
      .then(setData);
  }, [attemptId]);

  if (!data) return <p className="text-sm text-muted-foreground">Loading feedback…</p>;
  if (!data.evaluation) return <p>No evaluation yet.</p>;

  const e = data.evaluation;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Overall {e.overallScore.toFixed(1)} / 10</span>
          <div className="flex gap-2">
            {e.errorPatternTags.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-base">{e.shortDiagnosis}</p>
        <Separator />
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Dimensions</h3>
          <ul className="space-y-2">
            {e.dimensions.map((d) => (
              <li key={d.dimension} className="rounded-md border p-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{d.dimension}</span>
                  <span className="font-mono text-sm">{d.score}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{d.rationale}</p>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Summary</h3>
          <p className="text-sm">{e.summary}</p>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Top fixes</h3>
          <ol className="list-decimal pl-6 text-sm">
            {e.topFixes.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ol>
        </section>
        {e.strongAnswerSketch ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">
              Strong answer sketch
            </h3>
            <p className="whitespace-pre-wrap text-sm">{e.strongAnswerSketch}</p>
          </section>
        ) : null}
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Next rep</h3>
          <p className="text-sm">{e.nextRep}</p>
        </section>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/today">New problem</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/history">History</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
