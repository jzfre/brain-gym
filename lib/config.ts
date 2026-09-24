import { z } from "zod";

// Every value the Responses API accepts for reasoning.effort. Not every model
// supports all of them (e.g. gpt-6-sol documents none..max without minimal).
export const REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().min(1, "OPENAI_MODEL is required"),
  OPENAI_REASONING_EFFORT: z.enum(REASONING_EFFORTS).default("medium"),
  // High reasoning effort + web_search can exceed the SDK's 10-minute default.
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1000).default(1_200_000),
  // Evaluations are pure reasoning (no web_search): under a minute at medium
  // effort, several minutes at xhigh. Kept well under the generation ceiling so
  // a stalled socket aborts and retries instead of hanging for the full 20 min;
  // raising it trades away that stall recovery. Must stay <= OPENAI_TIMEOUT_MS,
  // which caps every call via the undici dispatcher. See lib/openai/client.ts.
  OPENAI_EVAL_TIMEOUT_MS: z.coerce.number().int().min(1000).default(600_000),
  LOCAL_USER_ID: z.string().uuid("LOCAL_USER_ID must be a UUID"),
  APP_PASSWORD: z.string().min(1, "APP_PASSWORD is required"),
  // Server-only secret that signs the session cookie. Must NOT equal the login
  // password: the cookie is an HMAC over this value, so it never reveals
  // APP_PASSWORD, and rotating it revokes all sessions. See lib/auth.ts.
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  DEDUP_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
  DEDUP_MAX_RETRIES: z.coerce.number().int().min(1).default(3),
  DEDUP_NEIGHBOR_K: z.coerce.number().int().min(1).default(5)
});

export type AppConfig = {
  databaseUrl: string;
  localUserId: string;
  appPassword: string;
  sessionSecret: string;
  openai: {
    apiKey: string;
    model: string;
    reasoningEffort: ReasoningEffort;
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
    sessionSecret: v.SESSION_SECRET,
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
