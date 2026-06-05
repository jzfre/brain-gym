import OpenAI from "openai";
import { Agent } from "undici";
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
      maxRetries: 1,
      // Node's fetch (undici) kills sockets that stay silent for 300s — and a
      // long non-streaming reasoning call sends nothing until it's done. The
      // SDK then mislabels that as its own "Request timed out." Lift undici's
      // limits to our ceiling so OPENAI_TIMEOUT_MS is the one true timeout.
      // (Verified empirically: silent socket + timeout 900s threw at 301s
      // without this dispatcher.)
      fetchOptions: {
        dispatcher: new Agent({
          headersTimeout: cfg.openai.timeoutMs,
          bodyTimeout: cfg.openai.timeoutMs
        })
      }
    });
  }
  return cached;
}
