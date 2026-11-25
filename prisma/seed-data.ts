import { ExerciseSlug, PromptRole, type Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const EXERCISE_SEEDS = [
  {
    slug: ExerciseSlug.MEMO_EXTRACTION,
    name: "Memo Extraction",
    description: "Train clear thinking from ambiguous real-world material."
  },
  {
    slug: ExerciseSlug.INCIDENT_RESPONSE,
    name: "Technical Incident Response",
    description: "Train calm, structured thinking under operational pressure."
  },
  {
    slug: ExerciseSlug.LSAT_LOGICAL_REASONING,
    name: "LSAT Logical Reasoning",
    description: "Train precise argument analysis under constrained time."
  }
] as const;

const PROMPT_SEEDS = [
  { file: "base.md", role: PromptRole.BASE, name: "base", exerciseSlug: null },
  {
    file: "memo_extraction.generator.md",
    role: PromptRole.GENERATOR,
    name: "memo_extraction.generator",
    exerciseSlug: ExerciseSlug.MEMO_EXTRACTION
  },
  {
    file: "memo_extraction.evaluator.md",
    role: PromptRole.EVALUATOR,
    name: "memo_extraction.evaluator",
    exerciseSlug: ExerciseSlug.MEMO_EXTRACTION
  },
  {
    file: "incident_response.generator.md",
    role: PromptRole.GENERATOR,
    name: "incident_response.generator",
    exerciseSlug: ExerciseSlug.INCIDENT_RESPONSE
  },
  {
    file: "incident_response.evaluator.md",
    role: PromptRole.EVALUATOR,
    name: "incident_response.evaluator",
    exerciseSlug: ExerciseSlug.INCIDENT_RESPONSE
  },
  {
    file: "lsat_logical_reasoning.generator.md",
    role: PromptRole.GENERATOR,
    name: "lsat_logical_reasoning.generator",
    exerciseSlug: ExerciseSlug.LSAT_LOGICAL_REASONING
  },
  {
    file: "lsat_logical_reasoning.evaluator.md",
    role: PromptRole.EVALUATOR,
    name: "lsat_logical_reasoning.evaluator",
    exerciseSlug: ExerciseSlug.LSAT_LOGICAL_REASONING
  }
] as const;

export type SeedOptions = {
  userId: string;
  userEmail: string;
  userName: string;
  promptsDir: string;
};

// Run inside a transaction. Initialization fills missing defaults; it must never
// rewrite a prompt version that past evaluations/problems refer to, reactivate
// intentionally disabled prompts, or replace customized metadata.
export async function ensureSeedData(tx: Prisma.TransactionClient, options: SeedOptions) {
  // Read every file before writing anything, including for a partial install.
  const prompts = PROMPT_SEEDS.map((p) => ({
    ...p, content: readFileSync(join(options.promptsDir, p.file), "utf8")
  }));
  // Serialize initialization, including the BASE prompt's nullable unique key.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(168521, 1)`;
  await tx.user.upsert({
    where: { id: options.userId },
    update: {},
    create: { id: options.userId, email: options.userEmail, displayName: options.userName }
  });
  const slugToId = new Map<ExerciseSlug, string>();
  for (const ex of EXERCISE_SEEDS) {
    const row = await tx.exerciseType.upsert({
      where: { slug: ex.slug }, update: {}, create: ex
    });
    slugToId.set(ex.slug, row.id);
  }
  for (const p of prompts) {
    const exerciseTypeId = p.exerciseSlug ? slugToId.get(p.exerciseSlug)! : null;
    // Any existing version means the operator owns this prompt family. Do not
    // resurrect v1 when a newer version exists or the family was disabled.
    const existing = await tx.promptVersion.findFirst({
      where: { role: p.role, exerciseTypeId }
    });
    if (!existing) {
      await tx.promptVersion.create({ data: {
        role: p.role, exerciseTypeId, name: p.name, content: p.content,
        version: 1, active: true
      } });
    }
  }
}
