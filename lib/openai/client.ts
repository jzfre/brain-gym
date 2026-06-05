import OpenAI from "openai";
import { getConfig } from "@/lib/config";

let cached: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  if (!cached) {
    const cfg = getConfig();
    // The SDK's 10-minute default is too tight for high reasoning effort +
    // web_search. Calls run in background jobs, so a generous ceiling is safe.
    cached = new OpenAI({ apiKey: cfg.openai.apiKey, timeout: cfg.openai.timeoutMs });
  }
  return cached;
}
