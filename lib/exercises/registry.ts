import { ExerciseSlug } from "@prisma/client";
import type { ExerciseMode } from "@/lib/exercises/types";
import { memoExtractionMode } from "./memo-extraction";
import { incidentResponseMode } from "./incident-response";
import { lsatMode } from "./lsat-logical-reasoning";

const registry: Record<ExerciseSlug, ExerciseMode> = {
  [ExerciseSlug.MEMO_EXTRACTION]: memoExtractionMode,
  [ExerciseSlug.INCIDENT_RESPONSE]: incidentResponseMode,
  [ExerciseSlug.LSAT_LOGICAL_REASONING]: lsatMode
};

export function getMode(slug: ExerciseSlug): ExerciseMode {
  const mode = registry[slug];
  if (!mode) throw new Error(`Unknown exercise slug: ${slug}`);
  return mode;
}

export const allModes: readonly ExerciseMode[] = Object.values(registry);
