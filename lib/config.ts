import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().min(1, "OPENAI_MODEL is required"),
  OPENAI_REASONING_EFFORT: z.enum(["minimal", "low", "medium", "high"]).default("medium"),
  // High reasoning effort + web_search can exceed the SDK's 10-minute default.
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1000).default(1_200_000),
  // Evaluations are pure reasoning (no web_search) and finish in 1-2 min, so a
  // tight per-attempt timeout lets a stalled socket abort and retry quickly
  // instead of hanging for the full generation ceiling. See lib/openai/client.ts.
  OPENAI_EVAL_TIMEOUT_MS: z.coerce.number().int().min(1000).default(300_000),
  LOCAL_USER_ID: z.string().uuid("LOCAL_USER_ID must be a UUID"),
  APP_PASSWORD: z.string().min(1, "APP_PASSWORD is required"),
  EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  DEDUP_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
  DEDUP_MAX_RETRIES: z.coerce.number().int().min(1).default(3),
  DEDUP_NEIGHBOR_K: z.coerce.number().int().min(1).default(5)
});

export type AppConfig = {
  databaseUrl: string;
  localUserId: string;
  appPassword: string;
  openai: {
    apiKey: string;
    model: string;
    reasoningEffort: "minimal" | "low" | "medium" | "high";
    timeoutMs: number;
    evalTimeoutMs: number;
  };
  embedding: {
    model: string;
  };
  dedup: {
    similarityThreshold: number;
    maxRetries: number;
    neighborK: number;
  };
};

export function parseConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  const v = parsed.data;
  return {
    databaseUrl: v.DATABASE_URL,
    localUserId: v.LOCAL_USER_ID,
    appPassword: v.APP_PASSWORD,
    openai: {
      apiKey: v.OPENAI_API_KEY,
      model: v.OPENAI_MODEL,
      reasoningEffort: v.OPENAI_REASONING_EFFORT,
      timeoutMs: v.OPENAI_TIMEOUT_MS,
      evalTimeoutMs: v.OPENAI_EVAL_TIMEOUT_MS
    },
    embedding: { model: v.EMBEDDING_MODEL },
    dedup: {
      similarityThreshold: v.DEDUP_SIMILARITY_THRESHOLD,
      maxRetries: v.DEDUP_MAX_RETRIES,
      neighborK: v.DEDUP_NEIGHBOR_K
    }
  };
}

let cached: AppConfig | null = null;
export function getConfig(): AppConfig {
  if (!cached) cached = parseConfig(process.env);
  return cached;
}
