import { ExerciseSlug, PromptRole, type PromptVersion } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export type LoadPromptArgs = {
  role: PromptRole;
  exerciseSlug?: ExerciseSlug;
};

const cache = new Map<string, PromptVersion>();

function cacheKey(args: LoadPromptArgs) {
  return `${args.role}::${args.exerciseSlug ?? "_none"}`;
}

export async function loadActivePrompt(args: LoadPromptArgs): Promise<PromptVersion> {
  const key = cacheKey(args);
  const hit = cache.get(key);
  if (hit) return hit;

  const exerciseTypeId = args.exerciseSlug
    ? ((await prisma.exerciseType.findUnique({ where: { slug: args.exerciseSlug } }))?.id ?? null)
    : null;

  const row = await prisma.promptVersion.findFirst({
    where: { role: args.role, exerciseTypeId, active: true },
    orderBy: { version: "desc" }
  });

  if (!row) {
    throw new Error(
      `No active prompt for role=${args.role} exerciseSlug=${args.exerciseSlug ?? "_none"}`
    );
  }
  cache.set(key, row);
  return row;
}

export function clearPromptCache() {
  cache.clear();
}
