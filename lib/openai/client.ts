import OpenAI from "openai";
import { getConfig } from "@/lib/config";

let cached: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  if (!cached) cached = new OpenAI({ apiKey: getConfig().openai.apiKey });
  return cached;
}
