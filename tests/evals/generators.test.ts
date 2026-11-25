import { beforeEach, expect, it, vi } from "vitest";
import { generateLsatProblem } from "@/lib/exercises/lsat-logical-reasoning/generator";
import { generateMemoProblem } from "@/lib/exercises/memo-extraction/generator";
import { generateIncidentProblem } from "@/lib/exercises/incident-response/generator";
import { runStructured } from "@/lib/openai/run-model";
import { lsatProblem, rubricProblem } from "./fixtures";

vi.mock("@/lib/config", () => ({ getConfig: () => ({ openai: { model: "test-model" } }) }));
vi.mock("@/lib/prompts/registry", () => ({ loadActivePrompt: async () => ({ content: "Generator instructions" }) }));
vi.mock("@/lib/openai/run-model", () => ({ runStructured: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

const input = {
  difficulty: "HARD" as const,
  avoidanceHint: { recentTitles: [], recentTags: [], recentSourceUrls: [], recentHashes: [] }
};

it("repairs question numbering and keeps shuffled answers aligned without exposing the key", async () => {
  const generated = {
    ...lsatProblem,
    questions: lsatProblem.questions!.map((q) => ({
      ...q,
      number: 1, // A model can repeat IDs even with valid structured JSON.
      correctChoice: "B",
      explanation: "Causal evidence does not establish causation.",
      distractorAnalyses: { A: "A analysis", B: "B analysis", C: "C analysis", D: "D analysis", E: "E analysis" }
    }))
  };
  vi.mocked(runStructured).mockResolvedValue({ parsed: generated, modelRunId: "run", rawResponse: {} });
  const { problem } = await generateLsatProblem(input);
  expect(problem.difficulty).toBe("HARD");
  expect(problem.questions?.map((q) => q.number)).toEqual([1, 2, 3]);
  expect(problem.timeboxMinutes).toBe(15);
  const answers = problem.hiddenAnswerKey.answers as Array<{ number: number; correctChoice: keyof typeof generated.questions[0]["choices"] }>;
  for (const [i, question] of problem.questions!.entries()) {
    expect(question).not.toHaveProperty("correctChoice");
    expect(question).not.toHaveProperty("explanation");
    expect(question).not.toHaveProperty("distractorAnalyses");
    expect(answers[i].number).toBe(question.number);
    expect(question.choices[answers[i].correctChoice]).toBe("Causality");
  }
});

it.each([
  { name: "memo", generate: generateMemoProblem, count: 6 },
  { name: "incident", generate: generateIncidentProblem, count: 11 }
])("keeps the requested $name difficulty when model metadata disagrees", async ({ generate, count }) => {
  vi.mocked(runStructured).mockResolvedValue({ parsed: rubricProblem(count), modelRunId: "run", rawResponse: {} });
  expect((await generate(input)).problem.difficulty).toBe("HARD");
});
