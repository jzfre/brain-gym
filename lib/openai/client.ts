import OpenAI from "openai";
import { getConfig } from "@/lib/config";

let cached: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  if (!cached) {
    const cfg = getConfig();
    // The SDK's 10-minute default is too tight for high reasoning effort +
    // web_search. Calls run in background jobs, so a generous ceiling is safe.
    // NOTE: `timeout` is per attempt and the SDK retries timeouts, so worst
    // case is timeout × (1 + maxRetries). Keep maxRetries low: model calls
    // here are expensive (web_search + high effort), and a call that hit the
    // 20-min ceiling will likely hit it again on retry.
    cached = new OpenAI({
      apiKey: cfg.openai.apiKey,
      timeout: cfg.openai.timeoutMs,
      maxRetries: 1
    });
  }
  return cached;
}
