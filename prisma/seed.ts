import { PrismaClient, ExerciseSlug, PromptRole } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// dotenv is a dev convenience for `pnpm db:seed` on a host; the production
// container has no dotenv (env comes from compose) — keep the import optional
// so the same script seeds in both places.
try {
  const { config } = await import("dotenv");
  config({ path: ".env" });
} catch {}

const prisma = new PrismaClient();
const PROMPTS_DIR = join(process.cwd(), "prompts");

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

async function main() {
  const userId = process.env.LOCAL_USER_ID ?? "00000000-0000-0000-0000-000000000001";
  const userEmail = process.env.LOCAL_USER_EMAIL ?? "local@brain-gym.dev";
  const userName = process.env.LOCAL_USER_DISPLAY_NAME ?? "Local User";

  await prisma.user.upsert({
    where: { id: userId },
    update: { email: userEmail, displayName: userName },
    create: { id: userId, email: userEmail, displayName: userName }
  });

  const slugToId = new Map<ExerciseSlug, string>();
  for (const ex of EXERCISE_SEEDS) {
    const row = await prisma.exerciseType.upsert({
      where: { slug: ex.slug },
      update: { name: ex.name, description: ex.description },
      create: { slug: ex.slug, name: ex.name, description: ex.description }
    });
    slugToId.set(ex.slug, row.id);
  }

  for (const p of PROMPT_SEEDS) {
    const content = readFileSync(join(PROMPTS_DIR, p.file), "utf8");
    const exerciseTypeId = p.exerciseSlug ? (slugToId.get(p.exerciseSlug) ?? null) : null;

    // composite unique key includes nullable exerciseTypeId; for null we filter by null first
    if (exerciseTypeId === null) {
      const existing = await prisma.promptVersion.findFirst({
        where: { role: p.role, exerciseTypeId: null, version: 1 }
      });
      if (existing) {
        await prisma.promptVersion.update({
          where: { id: existing.id },
          data: { content, active: true, name: p.name }
        });
      } else {
        await prisma.promptVersion.create({
          data: { role: p.role, exerciseTypeId: null, name: p.name, content, version: 1, active: true }
        });
      }
    } else {
      await prisma.promptVersion.upsert({
        where: {
          role_exerciseTypeId_version: { role: p.role, exerciseTypeId, version: 1 }
        },
        update: { content, active: true, name: p.name },
        create: { role: p.role, exerciseTypeId, name: p.name, content, version: 1, active: true }
      });
    }
  }

  console.log(
    "Seed complete: 1 user, %d exercise types, %d prompts",
    EXERCISE_SEEDS.length,
    PROMPT_SEEDS.length
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
