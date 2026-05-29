import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { LsatPublicQuestion, LsatQuestionResult } from "@/lib/exercises/types";

const CHOICES = ["A", "B", "C", "D", "E"] as const;

export type LsatSetFeedbackData = {
  overallScore: number;
  shortDiagnosis: string;
  summary: string;
  topFixes: string[];
  nextRep: string;
  errorPatternTags: string[];
  results: LsatQuestionResult[];
  questions: LsatPublicQuestion[];
};

// Presentational (no client hooks) so it renders in both the client feedback
// panel and the server-rendered history detail page.
export function LsatSetFeedback({
  overallScore,
  shortDiagnosis,
  summary,
  topFixes,
  nextRep,
  errorPatternTags,
  results,
  questions
}: LsatSetFeedbackData) {
  const total = results.length;
  const correct = results.filter((r) => r.isCorrect).length;
  const qByNum = new Map(questions.map((q) => [q.number, q]));
  const ordered = [...results].sort((a, b) => a.number - b.number);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Overall {overallScore.toFixed(1)} / 10 · {correct}/{total} correct
            </span>
            <div className="flex flex-wrap gap-2">
              {errorPatternTags.map((t) => (
                <Badge key={t} variant="secondary">
                  {t}
                </Badge>
              ))}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-base">{shortDiagnosis}</p>
          <Separator />
          <section>
            <h3 className="mb-1 text-sm font-semibold uppercase text-muted-foreground">Summary</h3>
            <p className="text-sm">{summary}</p>
          </section>
          {topFixes.length ? (
            <section>
              <h3 className="mb-1 text-sm font-semibold uppercase text-muted-foreground">Top fixes</h3>
              <ol className="list-decimal pl-6 text-sm">
                {topFixes.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ol>
            </section>
          ) : null}
          <section>
            <h3 className="mb-1 text-sm font-semibold uppercase text-muted-foreground">Next rep</h3>
            <p className="text-sm">{nextRep}</p>
          </section>
        </CardContent>
      </Card>

      {ordered.map((r) => {
        const q = qByNum.get(r.number);
        return (
          <Card key={r.number} className={r.isCorrect ? "border-l-4 border-l-green-600" : "border-l-4 border-l-destructive"}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 text-base">
                <span>
                  Question {r.number}
                  {r.questionType ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{r.questionType}</span>
                  ) : null}
                </span>
                <Badge variant={r.isCorrect ? "secondary" : "destructive"}>
                  {r.isCorrect ? "Correct" : "Incorrect"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {q ? (
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {q.stimulus}
                  {q.questionStem ? `\n\n${q.questionStem}` : ""}
                </p>
              ) : null}
              {q ? (
                <ul className="space-y-1">
                  {CHOICES.map((c) => {
                    const isCorrect = c === r.correctChoice;
                    const isYours = c === r.yourChoice;
                    return (
                      <li
                        key={c}
                        className={
                          "rounded px-2 py-1 " +
                          (isCorrect
                            ? "bg-green-600/10 font-medium"
                            : isYours
                              ? "bg-destructive/10"
                              : "")
                        }
                      >
                        <span className="font-mono">{c}.</span> {q.choices[c]}
                        {isCorrect ? <span className="ml-2 text-xs text-green-700">✓ correct</span> : null}
                        {isYours && !isCorrect ? (
                          <span className="ml-2 text-xs text-destructive">your pick</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                <span>
                  Your answer: <span className="font-mono">{r.yourChoice || "—"}</span>
                </span>
                <span>
                  Correct: <span className="font-mono">{r.correctChoice}</span>
                </span>
              </div>
              {r.yourReasoning ? (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Your reasoning</p>
                  <p className="whitespace-pre-wrap">{r.yourReasoning}</p>
                </div>
              ) : null}
              {r.reasoningCritique ? (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Critique</p>
                  <p>{r.reasoningCritique}</p>
                </div>
              ) : null}
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Explanation</p>
                <p>{r.explanation}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
