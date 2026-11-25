import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { ensureSeedData } from "@/prisma/seed-data";

const rollback = new Error("rollback test fixture");
async function isolated(check: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(async (tx) => {
      await check(tx);
      throw rollback;
    }, { timeout: 15_000 });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
const options = () => {
  const id = randomUUID();
  return { userId: id, userEmail: `${id}@example.test`, userName: "Seed test", promptsDir: join(process.cwd(), "prompts") };
};

afterAll(() => prisma.$disconnect());

describe("transactional startup initialization", () => {
  it("repairs missing base prompts even when exercise types already exist", async () => isolated(async (tx) => {
    expect(await tx.exerciseType.count()).toBeGreaterThan(0);
    await tx.promptVersion.deleteMany({ where: { role: "BASE" } });
    const opts = options();
    await ensureSeedData(tx, opts);
    expect(await tx.promptVersion.count({ where: { role: "BASE", active: true } })).toBe(1);
    expect(await tx.user.findUnique({ where: { id: opts.userId } })).not.toBeNull();
  }));

  it("preserves customized, inactive and newer prompt versions and user metadata", async () => isolated(async (tx) => {
    const opts = options();
    await tx.user.create({ data: { id: opts.userId, email: opts.userEmail, displayName: "Custom name" } });
    const base = await tx.promptVersion.findFirstOrThrow({ where: { role: "BASE" } });
    await tx.promptVersion.update({ where: { id: base.id }, data: {
      content: "Custom prompt used by historical runs", version: 7, active: false
    } });
    const exercise = await tx.exerciseType.findUniqueOrThrow({ where: { slug: "MEMO_EXTRACTION" } });
    await tx.exerciseType.update({ where: { id: exercise.id }, data: { name: "Custom exercise", active: false } });
    await ensureSeedData(tx, opts);
    await ensureSeedData(tx, opts);
    const saved = await tx.promptVersion.findUniqueOrThrow({ where: { id: base.id } });
    expect(saved).toMatchObject({ content: "Custom prompt used by historical runs", version: 7, active: false });
    expect(await tx.promptVersion.count({ where: { role: "BASE" } })).toBe(1);
    expect(await tx.user.findUnique({ where: { id: opts.userId } })).toMatchObject({ displayName: "Custom name" });
    expect(await tx.exerciseType.findUnique({ where: { id: exercise.id } })).toMatchObject({ name: "Custom exercise", active: false });
  }));

  it("rolls back initialization if any later operation fails", async () => {
    const opts = options();
    await expect(prisma.$transaction(async (tx) => {
      await ensureSeedData(tx, opts);
      throw new Error("simulated startup failure");
    })).rejects.toThrow("simulated startup failure");
    expect(await prisma.user.findUnique({ where: { id: opts.userId } })).toBeNull();
  });
});
