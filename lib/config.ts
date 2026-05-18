import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().min(1, "OPENAI_MODEL is required"),
  OPENAI_REASONING_EFFORT: z.enum(["minimal", "low", "medium", "high"]).default("medium"),
  LOCAL_USER_ID: z.string().uuid("LOCAL_USER_ID must be a UUID"),
  APP_PASSWORD: z.string().min(1, "APP_PASSWORD is required")
});

export type AppConfig = {
  databaseUrl: string;
  localUserId: string;
  appPassword: string;
  openai: {
    apiKey: string;
    model: string;
    reasoningEffort: "minimal" | "low" | "medium" | "high";
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
    openai: { apiKey: v.OPENAI_API_KEY, model: v.OPENAI_MODEL, reasoningEffort: v.OPENAI_REASONING_EFFORT }
  };
}

let cached: AppConfig | null = null;
export function getConfig(): AppConfig {
  if (!cached) cached = parseConfig(process.env);
  return cached;
}
