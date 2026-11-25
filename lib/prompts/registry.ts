import { ExerciseSlug, PromptRole, type PromptVersion } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { jobContext } from "@/lib/jobs/context";
import { withJobLease } from "@/lib/jobs/store";

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
  const context = jobContext.getStore();
  if (context)
    return withJobLease(context, async (tx) => {
      const job = await tx.backgroundJob.findUniqueOrThrow({ where: { id: context.id } });
      const payload = job.payload as Record<string, unknown>;
      const snapshots = (payload.promptSnapshots ?? {}) as Record<string, PromptVersion>;
      const saved = snapshots[key];
      if (saved) return { ...saved, createdAt: new Date(saved.createdAt) };
      const exerciseTypeId = args.exerciseSlug
        ? (await tx.exerciseType.findUniqueOrThrow({ where: { slug: args.exerciseSlug } })).id
        : null;
      const prompt = await tx.promptVersion.findFirst({
        where: { role: args.role, exerciseTypeId, active: true },
        orderBy: { version: "desc" }
      });
      if (!prompt)
        throw new Error(
          `No active prompt for role=${args.role} exerciseSlug=${args.exerciseSlug ?? "_none"}`
        );
      await tx.backgroundJob.update({
        where: { id: job.id },
        data: {
          payload: JSON.parse(
            JSON.stringify({ ...payload, promptSnapshots: { ...snapshots, [key]: prompt } })
          )
        }
      });
      return prompt;
    });
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
