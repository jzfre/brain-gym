import { PrismaClient } from "@prisma/client";
import { join } from "node:path";
import { ensureSeedData } from "./seed-data";

// Host convenience; containers receive their environment from Compose.
try {
  const { config } = await import("dotenv");
  config({ path: ".env" });
} catch {}

const prisma = new PrismaClient();
try {
  await prisma.$transaction((tx) => ensureSeedData(tx, {
    userId: process.env.LOCAL_USER_ID ?? "00000000-0000-0000-0000-000000000001",
    userEmail: process.env.LOCAL_USER_EMAIL ?? "local@brain-gym.dev",
    userName: process.env.LOCAL_USER_DISPLAY_NAME ?? "Local User",
    promptsDir: join(process.cwd(), "prompts")
  }), { timeout: 30_000 });
  console.log("Seed complete: missing defaults initialized; existing users, exercises, and prompt versions preserved.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
