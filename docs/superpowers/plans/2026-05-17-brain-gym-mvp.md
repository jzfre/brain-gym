# Brain Gym MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Phase 0–3 MVP from `docs/superpowers/specs/2026-05-17-brain-gym-mvp-design.md`: a local Next.js app where the user picks an exercise mode + difficulty, the OpenAI Responses API generates a problem, the user answers, the model evaluates with structured output, and everything persists in Postgres with history viewable.

**Architecture:** Next.js 15 App Router (TypeScript) with route handlers as the API surface. Prisma + Postgres 16 in Docker Compose. OpenAI `openai` SDK calling the Responses API with structured outputs; all calls funnel through one `runModel` wrapper that writes to a `model_runs` table. Per-mode generator/evaluator modules under `lib/exercises/{mode}/` share a registry contract. Zod mirrors every JSON schema for defense-in-depth validation. Tailwind + shadcn/ui for the UI.

**Tech Stack:** Next.js 15, React 19, TypeScript 5, Tailwind 3, shadcn/ui, Prisma 5, Postgres 16, `openai` SDK 4.x, Zod 3, Vitest, pnpm, Docker Compose.

---

## Conventions for executor

- Package manager: **pnpm** (install: `npm i -g pnpm` if missing).
- Working dir for every command: `/home/jrepan/Code/personal/brain-gym`.
- Commit after each completed task using the message provided in the task's last step. Sign-off line is the standard `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- When a task says "Run: …" capture the output and confirm it matches "Expected: …" before marking the step done. If it diverges, stop and report.
- Tests use Vitest. Integration tests that need Postgres expect `docker compose up -d db` already running.
- Never check `.env` into git. `.env.example` is the only env file committed.
- All file paths are repo-relative.

---

## Task 1: Scaffold Next.js + TypeScript + pnpm

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `next-env.d.ts`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `.npmrc`

- [ ] **Step 1: Initialize package.json**

Write `package.json`:

```json
{
  "name": "brain-gym",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:up": "docker compose up -d db",
    "db:down": "docker compose down",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio",
    "db:reset": "prisma migrate reset --force"
  },
  "dependencies": {
    "next": "15.0.3",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  },
  "devDependencies": {
    "@types/node": "22.9.0",
    "@types/react": "19.0.1",
    "@types/react-dom": "19.0.1",
    "typescript": "5.6.3"
  }
}
```

- [ ] **Step 2: Add `.npmrc` so shadcn-style copies work cleanly**

Write `.npmrc`:

```
auto-install-peers=true
strict-peer-dependencies=false
```

- [ ] **Step 3: Add `tsconfig.json` with `@/` path alias**

Write `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Add minimal Next.js config and env file**

Write `next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true }
};
export default nextConfig;
```

Write `next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 5: Add minimal root layout + landing redirect**

Write `app/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "Brain Gym", description: "Deliberate practice for reasoning" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
```

Write `app/page.tsx`:

```tsx
import { redirect } from "next/navigation";
export default function Home() {
  redirect("/today");
}
```

- [ ] **Step 6: Install and verify**

Run: `pnpm install`
Expected: lockfile created, no errors.

Run: `pnpm typecheck`
Expected: passes (note: `globals.css` does not yet exist; that file is created in Task 2 — typecheck does not import CSS so this still passes).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json next.config.mjs next-env.d.ts app/layout.tsx app/page.tsx .npmrc
git commit -m "Scaffold Next.js 15 + TypeScript + pnpm"
```

---

## Task 2: Tailwind + global styles

**Files:**
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`
- Create: `app/globals.css`

- [ ] **Step 1: Install Tailwind + dependencies**

Run: `pnpm add -D tailwindcss@3.4.14 postcss@8.4.49 autoprefixer@10.4.20 tailwindcss-animate@1.0.7 class-variance-authority@0.7.0 clsx@2.1.1 tailwind-merge@2.5.4 lucide-react@0.460.0`
Expected: installs without errors.

- [ ] **Step 2: Add Tailwind config**

Write `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1280px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" }
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;
```

- [ ] **Step 3: PostCSS config**

Write `postcss.config.mjs`:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 4: Global stylesheet with shadcn neutral palette**

Write `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
  }
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: Next.js compiles. There will be a warning about no pages with content; the redirect from `/` is enough.

- [ ] **Step 6: Commit**

```bash
git add tailwind.config.ts postcss.config.mjs app/globals.css package.json pnpm-lock.yaml
git commit -m "Add Tailwind + shadcn neutral theme tokens"
```

---

## Task 3: Docker Compose Postgres + `.env.example`

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: Docker Compose for Postgres 16**

Write `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: brain_gym_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: brain
      POSTGRES_PASSWORD: brain
      POSTGRES_DB: brain_gym
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U brain -d brain_gym"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
```

- [ ] **Step 2: `.env.example`**

Write `.env.example`:

```
# Postgres (matches docker-compose.yml)
DATABASE_URL="postgresql://brain:brain@localhost:5432/brain_gym?schema=public"

# OpenAI
OPENAI_API_KEY="sk-replace-me"
OPENAI_MODEL="gpt-5.5"
OPENAI_REASONING_EFFORT="medium"

# Local single-user MVP
LOCAL_USER_ID="00000000-0000-0000-0000-000000000001"
LOCAL_USER_EMAIL="local@brain-gym.dev"
LOCAL_USER_DISPLAY_NAME="Local User"
```

- [ ] **Step 3: Start Postgres and verify**

Run: `cp .env.example .env && docker compose up -d db`
Expected: container `brain_gym_db` starts.

Run: `docker compose ps`
Expected: shows `brain_gym_db` as `running (healthy)` (may need ~10s).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "Add Docker Compose Postgres and env template"
```

---

## Task 4: ESLint, Prettier, Vitest

**Files:**
- Create: `.eslintrc.json`
- Create: `.prettierrc.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Modify: `package.json`

- [ ] **Step 1: Install dev deps**

Run: `pnpm add -D eslint@8.57.1 eslint-config-next@15.0.3 prettier@3.3.3 prettier-plugin-tailwindcss@0.6.8 vitest@2.1.4 @vitejs/plugin-react@4.3.3 tsx@4.19.2`
Expected: installs cleanly.

- [ ] **Step 2: ESLint config**

Write `.eslintrc.json`:

```json
{
  "extends": ["next/core-web-vitals", "next/typescript"],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
  }
}
```

- [ ] **Step 3: Prettier config**

Write `.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "none",
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

- [ ] **Step 4: Vitest config**

Write `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    testTimeout: 30_000
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") }
  }
});
```

Write `tests/setup.ts`:

```ts
import { config } from "dotenv";
config({ path: ".env" });
```

- [ ] **Step 5: Install dotenv**

Run: `pnpm add -D dotenv@16.4.5`
Expected: installs.

- [ ] **Step 6: Verify lint + a trivial test**

Create `tests/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `pnpm test`
Expected: 1 passed.

Run: `pnpm lint`
Expected: passes (may print "No ESLint warnings or errors").

- [ ] **Step 7: Commit**

```bash
git add .eslintrc.json .prettierrc.json vitest.config.ts tests/setup.ts tests/smoke.test.ts package.json pnpm-lock.yaml
git commit -m "Add ESLint, Prettier, Vitest scaffolding"
```

---

## Task 5: Prisma schema + initial migration

**Files:**
- Create: `prisma/schema.prisma`
- Create: `lib/db/client.ts`
- Modify: `package.json` (Prisma generator config)

- [ ] **Step 1: Install Prisma**

Run: `pnpm add -D prisma@5.22.0 && pnpm add @prisma/client@5.22.0`
Expected: installs.

- [ ] **Step 2: Write the schema**

Write `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum ExerciseSlug {
  MEMO_EXTRACTION
  INCIDENT_RESPONSE
  LSAT_LOGICAL_REASONING
}

enum PromptRole {
  BASE
  GENERATOR
  EVALUATOR
  WEEKLY_REVIEW
}

enum Difficulty {
  EASY
  MEDIUM
  HARD
}

enum AttemptStatus {
  SUBMITTED
  EVALUATED
  EVAL_FAILED
}

enum ModelRunPurpose {
  GENERATE_PROBLEM
  EVALUATE_ATTEMPT
}

enum ModelRunStatus {
  PENDING
  COMPLETED
  ERROR
}

model User {
  id          String   @id @default(uuid())
  email       String   @unique
  displayName String
  createdAt   DateTime @default(now())
  attempts    Attempt[]
}

model ExerciseType {
  id          String       @id @default(uuid())
  slug        ExerciseSlug @unique
  name        String
  description String
  active      Boolean      @default(true)
  problems    Problem[]
  prompts     PromptVersion[]
}

model PromptVersion {
  id               String        @id @default(uuid())
  name             String
  role             PromptRole
  exerciseTypeId   String?
  exerciseType     ExerciseType? @relation(fields: [exerciseTypeId], references: [id])
  content          String
  version          Int           @default(1)
  active           Boolean       @default(true)
  createdAt        DateTime      @default(now())
  generatedProblems Problem[]    @relation("ProblemGenerationPrompt")
  evaluations      Evaluation[]

  @@unique([role, exerciseTypeId, version])
}

model Problem {
  id                          String        @id @default(uuid())
  exerciseTypeId              String
  exerciseType                ExerciseType  @relation(fields: [exerciseTypeId], references: [id])
  title                       String
  promptText                  String
  userVisiblePayload          Json
  hiddenAnswerKey             Json
  rubric                      Json
  timeboxMinutes              Int
  suggestedPacing             Json
  requiredAnswerSections      Json
  difficulty                  Difficulty
  tags                        String[]      @default([])
  sourceKind                  String        @default("generated")
  uniquenessHash              String
  generatedByModel            String
  generationPromptVersionId   String
  generationPromptVersion     PromptVersion @relation("ProblemGenerationPrompt", fields: [generationPromptVersionId], references: [id])
  createdAt                   DateTime      @default(now())
  sources                     ProblemSource[]
  attempts                    Attempt[]

  @@unique([exerciseTypeId, uniquenessHash])
  @@index([createdAt])
}

model ProblemSource {
  id              String   @id @default(uuid())
  problemId       String
  problem         Problem  @relation(fields: [problemId], references: [id], onDelete: Cascade)
  url             String
  title           String?
  publisher       String?
  retrievedAt     DateTime @default(now())
  citationPayload Json?
}

model Attempt {
  id               Int          @id @default(autoincrement())
  userId           String
  user             User         @relation(fields: [userId], references: [id])
  problemId        String
  problem          Problem      @relation(fields: [problemId], references: [id])
  responseText     String
  timeSpentSeconds Int
  submittedAt      DateTime     @default(now())
  status           AttemptStatus @default(SUBMITTED)
  evaluation       Evaluation?

  @@index([userId, submittedAt])
}

model Evaluation {
  id                        String              @id @default(uuid())
  attemptId                 Int                 @unique
  attempt                   Attempt             @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  evaluatorPromptVersionId  String
  evaluatorPromptVersion    PromptVersion       @relation(fields: [evaluatorPromptVersionId], references: [id])
  model                     String
  overallScore              Float
  shortDiagnosis            String
  summary                   String
  topFixes                  Json
  rewriteSuggestions        Json
  strongAnswerSketch        String?
  nextRep                   String
  clarificationQuestion     String?
  errorPatternTags          String[]            @default([])
  missClassifications       String[]            @default([])
  rawOutput                 Json
  createdAt                 DateTime            @default(now())
  dimensions                EvaluationDimension[]
}

model EvaluationDimension {
  id           String     @id @default(uuid())
  evaluationId String
  evaluation   Evaluation @relation(fields: [evaluationId], references: [id], onDelete: Cascade)
  dimension    String
  score        Float
  rationale    String
}

model ModelRun {
  id              String          @id @default(uuid())
  purpose         ModelRunPurpose
  model           String
  requestPayload  Json
  responsePayload Json?
  usagePayload    Json?
  status          ModelRunStatus  @default(PENDING)
  error           String?
  createdAt       DateTime        @default(now())
}
```

- [ ] **Step 3: Create + apply the initial migration**

Run: `pnpm db:migrate -- --name init`
Expected: Prisma asks no questions; migration `init` created under `prisma/migrations/`; tables created in `brain_gym`.

(If the command form fails on your pnpm version, the equivalent is: `pnpm exec prisma migrate dev --name init`.)

- [ ] **Step 4: Prisma client singleton**

Write `lib/db/client.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 5: Verify**

Run: `pnpm exec prisma generate`
Expected: generates client into `node_modules/.prisma/client`.

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add prisma/ lib/db/client.ts package.json pnpm-lock.yaml
git commit -m "Add Prisma schema, initial migration, client singleton"
```

---

## Task 6: Prompt source files

**Files:**
- Create: `prompts/base.md`
- Create: `prompts/memo_extraction.generator.md`
- Create: `prompts/memo_extraction.evaluator.md`
- Create: `prompts/incident_response.generator.md`
- Create: `prompts/incident_response.evaluator.md`
- Create: `prompts/lsat_logical_reasoning.generator.md`
- Create: `prompts/lsat_logical_reasoning.evaluator.md`

These are the source-of-truth prompts. The seed script reads them and inserts `PromptVersion` rows.

- [ ] **Step 1: `prompts/base.md`**

Write `prompts/base.md` (verbatim from spec §"Initial Base Prompt Direction"):

```
You are the evaluator and exercise generator for a deliberate-practice reasoning app.

The product goal is to improve the user's judgment, clarity, signal/noise filtering, and structured reasoning through repeated daily exercises.

Be strict, specific, and concise. Do not flatter. Do not invent facts. Use stable rubrics. Prefer actionable feedback over generic advice.

When generating exercises, avoid repeating prior topics, sources, structures, and answer patterns. Respect the exercise type and difficulty. Use web search only when fresh source material is required.

When evaluating, score only the submitted answer against the problem and rubric. Return structured output. Give brief rationales, top fixes, rewrite suggestions where relevant, and one next rep.
```

- [ ] **Step 2: `prompts/memo_extraction.generator.md`**

Write `prompts/memo_extraction.generator.md`:

```
Generate ONE memo-extraction exercise.

Source material: a short real-world article, argument, decision memo, or situation. If web_search is available and the user requested a fresh source, find a recent (last 30 days) article from a reputable publication; otherwise compose an original short scenario in the same style.

Output (must validate against the provided JSON schema):

- title: 5-8 words
- difficulty: as requested
- timeboxMinutes: 25 (easy), 35 (medium), 45 (hard)
- suggestedPacing: a few labeled steps that sum to timeboxMinutes
- userVisiblePrompt: the article/scenario text (300-700 words) followed by the answer template instructions
- requiredAnswerSections: exactly these 6 sections in order — Claim, Evidence, Assumptions, Tradeoffs, Next test, What would change my mind
- hiddenAnswerKey: ideal claim, 3 must-cite pieces of evidence, 3 key assumptions, 2 strongest tradeoffs, 1 sharpest next test, 1 mind-changer
- rubric.dimensions: Claim clarity (max 10), Evidence quality (max 10), Assumptions (max 10), Tradeoffs (max 10), Testability (max 10)
- tags: 3-6 topical tags (lowercase, kebab-case)
- sourceCitations: include URL + title + publisher for each source consulted; empty array if none
- duplicateAvoidanceKey: a short canonical phrase (title+topic) for hashing

Constraints:
- difficulty hard: more ambiguity, conflicting evidence, harder tradeoffs.
- Do not produce a memo on a topic listed in the "avoid" hint.
```

- [ ] **Step 3: `prompts/memo_extraction.evaluator.md`**

Write `prompts/memo_extraction.evaluator.md`:

```
Score the user's memo against the problem, hidden answer key, and rubric. Be strict.

Output (must validate against the provided JSON schema):

- overallScore: 0-10, one decimal
- shortDiagnosis: 1-2 sentences naming the single biggest gap
- dimensions: one entry per rubric dimension, each with score, rationale (1-2 sentences), sharperVersion if applicable, missingItems if applicable
- summary: 3-5 sentences total
- topFixes: exactly 3 concrete fixes
- rewriteSuggestions: { improvedClaim: string, missingAssumptions: string[] (2), missingTradeoffs: string[] (2), betterPhrasingForWeakEvidence: string[] }
- strongAnswerSketch: 80-150 words of what a strong answer looks like
- nextRep: one specific next rep (one sentence)
- clarificationQuestion: at most one, only if truly needed; otherwise null
- errorPatternTags: 1-4 short tags like "vague-claim", "anecdote-as-evidence", "missed-tradeoff"
- missClassifications: leave empty array for memo type
```

- [ ] **Step 4: `prompts/incident_response.generator.md`**

Write `prompts/incident_response.generator.md`:

```
Generate ONE technical-incident scenario. Match the format in this app's spec.

Output (validates against the provided JSON schema):

- title: 4-7 words, includes a system name
- difficulty: as requested
- timeboxMinutes: 45
- suggestedPacing: 4 steps — read (7 min), answer (25 min), numerical sanity check (8 min), revise (5 min)
- userVisiblePrompt: the full scenario in the spec's incident format — Context, System flow, Supporting systems, Normal behavior, Current incident, Metrics, Recent changes, More observations, Numerical sanity check, Your task, with the 11-section answer structure spelled out.
- requiredAnswerSections: 11 sections matching the answer structure (Problem framing through Follow-up prevention)
- hiddenAnswerKey: { primaryRootCause, containmentSteps[], rejectedDangerousIdeas[], expectedNumericRanges }
- rubric.dimensions: 11 dimensions matching the spec (Problem framing, Signal selection, Primary hypothesis, Alternative hypotheses, Immediate containment, Customer prioritization, Rollback/config decision, Rejected bad ideas, Numerical sanity check, Validation, Follow-up prevention), each max 10
- tags: 3-6 tags reflecting system type (e.g., queue, vendor, retry-amplification)
- sourceCitations: include any inspiration links from web_search; otherwise empty

Rules (the spec's incident-generation rules apply verbatim):
- No hints by default.
- Include enough metrics for order-of-magnitude reasoning.
- At least two plausible-but-dangerous engineer/sales/product/AI suggestions.
- At least three recent changes: one true contributor, one partial, one distraction.
- Make the obvious fix dangerous.
- Force reasoning about containment, not just root cause.
- Prefer operational vocabulary: retry amplification, client-side rate limit, workload isolation, queue age, vendor quota, backpressure, circuit breaker, in-flight requests.
- Difficulty hard: stricter timing, two interacting causes, stronger distractors.
- Do not reuse system names from the "avoid" hint.
```

- [ ] **Step 5: `prompts/incident_response.evaluator.md`**

Write `prompts/incident_response.evaluator.md`:

```
Score the user's incident response against the problem, hidden answer key, and rubric. Be strict. Focus on operational precision over elegant prose.

Output (validates against the provided JSON schema):

- overallScore: 0-10, one decimal
- shortDiagnosis: 1-2 sentences naming the single biggest gap (usually containment discipline)
- dimensions: one per rubric dimension; each with score, rationale (1-2 sentences), sharperVersion if applicable, missingItems if applicable
- summary: 4-6 sentences
- topFixes: exactly 3 concrete operational fixes
- rewriteSuggestions: { betterContainment: string[], betterCustomerPrioritization: string, betterNumericalSanityCheck: string }
- strongAnswerSketch: 120-200 words showing what a 9/10 response looks like for this exact scenario
- nextRep: one specific next rep
- clarificationQuestion: at most one; otherwise null
- errorPatternTags: 1-4 tags like "soft-containment", "vendor-dependent", "missed-amplifier"
- missClassifications: empty array for incident type
```

- [ ] **Step 6: `prompts/lsat_logical_reasoning.generator.md`**

Write `prompts/lsat_logical_reasoning.generator.md`:

```
Generate ONE original LSAT-style logical-reasoning question. Do NOT copy any real LSAT question.

Output (validates against the provided JSON schema):

- title: question type + topic, e.g., "Necessary Assumption - municipal budgets"
- difficulty: as requested
- timeboxMinutes: 5 (easy), 6 (medium), 8 (hard)
- suggestedPacing: 3 steps — read stimulus, prephrase, eliminate
- userVisiblePrompt: full stimulus + question stem + 5 answer choices labeled A-E
- requiredAnswerSections: 2 sections — Choice (A-E), Reason (1-2 sentences)
- hiddenAnswerKey: { correctChoice: "A"|"B"|"C"|"D"|"E", explanation: string, distractorAnalyses: { A: string, B: string, C: string, D: string, E: string }, questionType: string }
- rubric.dimensions: Correctness (max 10), Reasoning quality (max 5), Error pattern recognition (max 5)
- tags: include the question type tag + topic
- sourceCitations: empty unless linking to an official public sample (not the question content)

Question types to rotate through across calls: Necessary assumption, Sufficient assumption, Flaw, Weaken, Strengthen, Evaluate the argument, Inference, Principle, Parallel reasoning, Parallel flaw.

Rules:
- Original content only.
- Difficulty hard: subtle distractors, strong modal/quantifier traps.
- Do not reuse a question type listed in the "avoid" hint within the last 5.
- Never use web_search for LSAT generation.
```

- [ ] **Step 7: `prompts/lsat_logical_reasoning.evaluator.md`**

Write `prompts/lsat_logical_reasoning.evaluator.md`:

```
Score the user's LSAT answer hard.

Output (validates against the provided JSON schema):

- overallScore: 0-10, one decimal; correctness dominates
- shortDiagnosis: one sentence naming the miss type if wrong, or the strongest part of the reasoning if right
- dimensions: Correctness (0 or 10), Reasoning quality (0-5), Error pattern recognition (0-5)
- summary: 3-5 sentences explaining what the correct answer hinges on and why the chosen distractor fails
- topFixes: 1-3 LSAT-specific fixes (e.g., "Pre-phrase before eliminating", "Always check modal scope")
- rewriteSuggestions: { betterReason: string }
- strongAnswerSketch: 50-100 words showing an ideal 1-2 sentence reason
- nextRep: one specific next rep
- clarificationQuestion: null almost always
- errorPatternTags: choose from common LSAT miss tags
- missClassifications: choose any that apply from: english_comprehension, logic, question_type_confusion, too_strong, too_narrow, wrong_conclusion, quantifier_modal
```

- [ ] **Step 8: Commit**

```bash
git add prompts/
git commit -m "Add source prompts for base + 3 modes (generator + evaluator)"
```

---

## Task 7: Seed script

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (add `prisma.seed` field)

- [ ] **Step 1: Add Prisma seed config**

Edit `package.json` and append (or merge if Prisma already in deps section) a top-level `"prisma"` block before the closing brace:

```json
,
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
```

- [ ] **Step 2: Write the seed script**

Write `prisma/seed.ts`:

```ts
import { PrismaClient, ExerciseSlug, PromptRole } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

config({ path: ".env" });

const prisma = new PrismaClient();
const PROMPTS_DIR = join(process.cwd(), "prompts");

const EXERCISE_SEEDS = [
  {
    slug: ExerciseSlug.MEMO_EXTRACTION,
    name: "Memo Extraction",
    description: "Train clear thinking from ambiguous real-world material."
  },
  {
    slug: ExerciseSlug.INCIDENT_RESPONSE,
    name: "Technical Incident Response",
    description: "Train calm, structured thinking under operational pressure."
  },
  {
    slug: ExerciseSlug.LSAT_LOGICAL_REASONING,
    name: "LSAT Logical Reasoning",
    description: "Train precise argument analysis under constrained time."
  }
] as const;

const PROMPT_SEEDS = [
  { file: "base.md", role: PromptRole.BASE, name: "base", exerciseSlug: null },
  {
    file: "memo_extraction.generator.md",
    role: PromptRole.GENERATOR,
    name: "memo_extraction.generator",
    exerciseSlug: ExerciseSlug.MEMO_EXTRACTION
  },
  {
    file: "memo_extraction.evaluator.md",
    role: PromptRole.EVALUATOR,
    name: "memo_extraction.evaluator",
    exerciseSlug: ExerciseSlug.MEMO_EXTRACTION
  },
  {
    file: "incident_response.generator.md",
    role: PromptRole.GENERATOR,
    name: "incident_response.generator",
    exerciseSlug: ExerciseSlug.INCIDENT_RESPONSE
  },
  {
    file: "incident_response.evaluator.md",
    role: PromptRole.EVALUATOR,
    name: "incident_response.evaluator",
    exerciseSlug: ExerciseSlug.INCIDENT_RESPONSE
  },
  {
    file: "lsat_logical_reasoning.generator.md",
    role: PromptRole.GENERATOR,
    name: "lsat_logical_reasoning.generator",
    exerciseSlug: ExerciseSlug.LSAT_LOGICAL_REASONING
  },
  {
    file: "lsat_logical_reasoning.evaluator.md",
    role: PromptRole.EVALUATOR,
    name: "lsat_logical_reasoning.evaluator",
    exerciseSlug: ExerciseSlug.LSAT_LOGICAL_REASONING
  }
] as const;

async function main() {
  const userId = process.env.LOCAL_USER_ID ?? "00000000-0000-0000-0000-000000000001";
  const userEmail = process.env.LOCAL_USER_EMAIL ?? "local@brain-gym.dev";
  const userName = process.env.LOCAL_USER_DISPLAY_NAME ?? "Local User";

  await prisma.user.upsert({
    where: { id: userId },
    update: { email: userEmail, displayName: userName },
    create: { id: userId, email: userEmail, displayName: userName }
  });

  const slugToId = new Map<ExerciseSlug, string>();
  for (const ex of EXERCISE_SEEDS) {
    const row = await prisma.exerciseType.upsert({
      where: { slug: ex.slug },
      update: { name: ex.name, description: ex.description },
      create: { slug: ex.slug, name: ex.name, description: ex.description }
    });
    slugToId.set(ex.slug, row.id);
  }

  for (const p of PROMPT_SEEDS) {
    const content = readFileSync(join(PROMPTS_DIR, p.file), "utf8");
    const exerciseTypeId = p.exerciseSlug ? (slugToId.get(p.exerciseSlug) ?? null) : null;

    await prisma.promptVersion.upsert({
      where: {
        role_exerciseTypeId_version: { role: p.role, exerciseTypeId: exerciseTypeId, version: 1 }
      },
      update: { content, active: true, name: p.name },
      create: {
        role: p.role,
        exerciseTypeId,
        name: p.name,
        content,
        version: 1,
        active: true
      }
    });
  }

  console.log("Seed complete: 1 user, %d exercise types, %d prompts", EXERCISE_SEEDS.length, PROMPT_SEEDS.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 3: Run seed**

Run: `pnpm db:seed`
Expected: prints `Seed complete: 1 user, 3 exercise types, 7 prompts`.

- [ ] **Step 4: Inspect**

Run: `pnpm exec prisma studio &`
(Optional — opens browser. Skip if running headless.)

Run: `pnpm exec prisma db execute --stdin <<< 'select slug, name from "ExerciseType" order by slug;'`
Expected: 3 rows.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts package.json
git commit -m "Add seed script: user, exercise types, prompts"
```

---

## Task 8: shadcn/ui primitives (manual copy — no init)

We copy shadcn primitives directly rather than running `npx shadcn init`, because the network call adds friction and the components are small.

**Files:**
- Create: `lib/utils.ts`
- Create: `components/ui/button.tsx`
- Create: `components/ui/card.tsx`
- Create: `components/ui/input.tsx`
- Create: `components/ui/textarea.tsx`
- Create: `components/ui/label.tsx`
- Create: `components/ui/badge.tsx`
- Create: `components/ui/separator.tsx`
- Create: `components/ui/tabs.tsx`
- Create: `components/ui/radio-group.tsx`

- [ ] **Step 1: Install shadcn primitive deps**

Run: `pnpm add @radix-ui/react-tabs@1.1.1 @radix-ui/react-label@2.1.0 @radix-ui/react-separator@1.1.0 @radix-ui/react-radio-group@1.2.1 @radix-ui/react-slot@1.1.0`
Expected: installs.

- [ ] **Step 2: `lib/utils.ts`**

Write `lib/utils.ts`:

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Button**

Write `components/ui/button.tsx`:

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

- [ ] **Step 4: Card, Input, Textarea, Label, Badge, Separator**

Write `components/ui/card.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-xl font-semibold leading-none tracking-tight", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
```

Write `components/ui/input.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
```

Write `components/ui/textarea.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export { Textarea };
```

Write `components/ui/label.tsx`:

```tsx
"use client";
import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
```

Write `components/ui/badge.tsx`:

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground"
      }
    },
    defaultVariants: { variant: "default" }
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}
export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

Write `components/ui/separator.tsx`:

```tsx
"use client";
import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { cn } from "@/lib/utils";

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn("shrink-0 bg-border", orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]", className)}
    {...props}
  />
));
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
```

- [ ] **Step 5: Tabs and RadioGroup**

Write `components/ui/tabs.tsx`:

```tsx
"use client";
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground", className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
```

Write `components/ui/radio-group.tsx`:

```tsx
"use client";
import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Circle } from "lucide-react";
import { cn } from "@/lib/utils";

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root className={cn("grid gap-2", className)} {...props} ref={ref} />
));
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      "aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <Circle className="h-2.5 w-2.5 fill-current text-current" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add lib/utils.ts components/ui/ package.json pnpm-lock.yaml
git commit -m "Add shadcn/ui primitives (button, card, input, textarea, label, badge, separator, tabs, radio-group)"
```

---

## Task 9: Config + env validation

**Files:**
- Create: `lib/config.ts`
- Create: `tests/unit/config.test.ts`

- [ ] **Step 1: Install Zod**

Run: `pnpm add zod@3.23.8`
Expected: installs.

- [ ] **Step 2: Failing test for env validation**

Write `tests/unit/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseConfig } from "@/lib/config";

describe("parseConfig", () => {
  it("returns config when required env vars are set", () => {
    const cfg = parseConfig({
      DATABASE_URL: "postgresql://x",
      OPENAI_API_KEY: "sk-test",
      OPENAI_MODEL: "gpt-5.5",
      OPENAI_REASONING_EFFORT: "medium",
      LOCAL_USER_ID: "00000000-0000-0000-0000-000000000001"
    });
    expect(cfg.openai.model).toBe("gpt-5.5");
    expect(cfg.localUserId).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("throws when OPENAI_API_KEY is missing", () => {
    expect(() =>
      parseConfig({
        DATABASE_URL: "postgresql://x",
        OPENAI_MODEL: "gpt-5.5",
        OPENAI_REASONING_EFFORT: "medium",
        LOCAL_USER_ID: "00000000-0000-0000-0000-000000000001"
      } as Record<string, string>)
    ).toThrow(/OPENAI_API_KEY/);
  });

  it("defaults reasoning effort to medium when unset", () => {
    const cfg = parseConfig({
      DATABASE_URL: "postgresql://x",
      OPENAI_API_KEY: "sk-test",
      OPENAI_MODEL: "gpt-5.5",
      LOCAL_USER_ID: "00000000-0000-0000-0000-000000000001"
    });
    expect(cfg.openai.reasoningEffort).toBe("medium");
  });
});
```

- [ ] **Step 3: Run failing test**

Run: `pnpm test tests/unit/config.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement**

Write `lib/config.ts`:

```ts
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().min(1, "OPENAI_MODEL is required"),
  OPENAI_REASONING_EFFORT: z.enum(["minimal", "low", "medium", "high"]).default("medium"),
  LOCAL_USER_ID: z.string().uuid("LOCAL_USER_ID must be a UUID")
});

export type AppConfig = {
  databaseUrl: string;
  localUserId: string;
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
    openai: { apiKey: v.OPENAI_API_KEY, model: v.OPENAI_MODEL, reasoningEffort: v.OPENAI_REASONING_EFFORT }
  };
}

let cached: AppConfig | null = null;
export function getConfig(): AppConfig {
  if (!cached) cached = parseConfig(process.env);
  return cached;
}
```

- [ ] **Step 5: Run passing test**

Run: `pnpm test tests/unit/config.test.ts`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add lib/config.ts tests/unit/config.test.ts package.json pnpm-lock.yaml
git commit -m "Add env config parser with Zod validation"
```

---

## Task 10: Uniqueness hash

**Files:**
- Create: `lib/memory/uniqueness.ts`
- Create: `tests/unit/uniqueness.test.ts`

- [ ] **Step 1: Failing test**

Write `tests/unit/uniqueness.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeUniquenessHash } from "@/lib/memory/uniqueness";

describe("computeUniquenessHash", () => {
  it("is stable for the same inputs", () => {
    const a = computeUniquenessHash({
      title: "Queue Backpressure in Billing",
      promptText: "At 02:14 UTC, the billing-pipeline service began ...",
      tags: ["queue", "billing", "retry-amplification"]
    });
    const b = computeUniquenessHash({
      title: "Queue Backpressure in Billing",
      promptText: "At 02:14 UTC, the billing-pipeline service began ...",
      tags: ["billing", "queue", "retry-amplification"]
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs when title or tags change", () => {
    const base = computeUniquenessHash({ title: "A", promptText: "x", tags: ["t1"] });
    const diffTitle = computeUniquenessHash({ title: "B", promptText: "x", tags: ["t1"] });
    const diffTag = computeUniquenessHash({ title: "A", promptText: "x", tags: ["t2"] });
    expect(base).not.toBe(diffTitle);
    expect(base).not.toBe(diffTag);
  });

  it("is case- and whitespace-insensitive for title", () => {
    const a = computeUniquenessHash({ title: "  Hello World  ", promptText: "p", tags: [] });
    const b = computeUniquenessHash({ title: "hello world", promptText: "p", tags: [] });
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm test tests/unit/uniqueness.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Write `lib/memory/uniqueness.ts`:

```ts
import { createHash } from "node:crypto";

export type UniquenessInput = {
  title: string;
  promptText: string;
  tags: string[];
};

export function computeUniquenessHash(input: UniquenessInput): string {
  const normalizedTitle = input.title.trim().toLowerCase().replace(/\s+/g, " ");
  const normalizedPromptStart = input.promptText.trim().slice(0, 200).toLowerCase().replace(/\s+/g, " ");
  const normalizedTags = [...input.tags].map((t) => t.trim().toLowerCase()).sort();
  const canonical = JSON.stringify({ title: normalizedTitle, prompt: normalizedPromptStart, tags: normalizedTags });
  return createHash("sha256").update(canonical).digest("hex");
}
```

- [ ] **Step 4: Run passing test**

Run: `pnpm test tests/unit/uniqueness.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/memory/uniqueness.ts tests/unit/uniqueness.test.ts
git commit -m "Add uniqueness hash for problem dedup"
```

---

## Task 11: Prompt registry

**Files:**
- Create: `lib/prompts/registry.ts`
- Create: `tests/integration/prompt-registry.test.ts`

- [ ] **Step 1: Failing integration test (requires seeded DB)**

Write `tests/integration/prompt-registry.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { ExerciseSlug, PromptRole } from "@prisma/client";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { prisma } from "@/lib/db/client";

describe("loadActivePrompt", () => {
  beforeAll(async () => {
    // assumes `pnpm db:seed` has been run
  });

  it("returns the active base prompt", async () => {
    const p = await loadActivePrompt({ role: PromptRole.BASE });
    expect(p.content.length).toBeGreaterThan(50);
    expect(p.role).toBe(PromptRole.BASE);
  });

  it("returns mode-specific generator prompts", async () => {
    const p = await loadActivePrompt({
      role: PromptRole.GENERATOR,
      exerciseSlug: ExerciseSlug.MEMO_EXTRACTION
    });
    expect(p.content).toMatch(/memo-extraction/i);
  });

  it("throws when no active prompt exists", async () => {
    await expect(
      loadActivePrompt({ role: PromptRole.WEEKLY_REVIEW })
    ).rejects.toThrow(/no active prompt/i);
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm test tests/integration/prompt-registry.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Write `lib/prompts/registry.ts`:

```ts
import { ExerciseSlug, PromptRole, type PromptVersion } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export type LoadPromptArgs = {
  role: PromptRole;
  exerciseSlug?: ExerciseSlug;
};

const cache = new Map<string, PromptVersion>();

function cacheKey(args: LoadPromptArgs) {
  return `${args.role}::${args.exerciseSlug ?? "_none"}`;
}

export async function loadActivePrompt(args: LoadPromptArgs): Promise<PromptVersion> {
  const key = cacheKey(args);
  const hit = cache.get(key);
  if (hit) return hit;

  const exerciseTypeId = args.exerciseSlug
    ? (await prisma.exerciseType.findUnique({ where: { slug: args.exerciseSlug } }))?.id ?? null
    : null;

  const row = await prisma.promptVersion.findFirst({
    where: { role: args.role, exerciseTypeId, active: true },
    orderBy: { version: "desc" }
  });

  if (!row) {
    throw new Error(`No active prompt for role=${args.role} exerciseSlug=${args.exerciseSlug ?? "_none"}`);
  }
  cache.set(key, row);
  return row;
}

export function clearPromptCache() {
  cache.clear();
}
```

- [ ] **Step 4: Ensure DB is seeded and run**

Run: `pnpm db:seed`
Expected: prints seed complete (idempotent).

Run: `pnpm test tests/integration/prompt-registry.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/prompts/registry.ts tests/integration/prompt-registry.test.ts
git commit -m "Add prompt registry with active-version cache"
```

---

## Task 12: OpenAI client wrapper + runModel

**Files:**
- Create: `lib/openai/client.ts`
- Create: `lib/openai/run-model.ts`
- Create: `tests/unit/run-model.test.ts`

- [ ] **Step 1: Install SDK**

Run: `pnpm add openai@4.73.1`
Expected: installs.

- [ ] **Step 2: Failing test (use a fake SDK)**

Write `tests/unit/run-model.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ModelRunPurpose } from "@prisma/client";
import { runStructured } from "@/lib/openai/run-model";
import { z } from "zod";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    modelRun: {
      create: vi.fn(async ({ data }) => ({ id: "run-1", ...data })),
      update: vi.fn(async ({ data }) => data)
    }
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runStructured", () => {
  const Schema = z.object({ title: z.string(), score: z.number() });

  it("validates output and returns parsed value", async () => {
    const fakeClient = {
      responses: {
        parse: vi.fn(async () => ({
          output_parsed: { title: "hi", score: 7 },
          usage: { input_tokens: 10, output_tokens: 5 }
        }))
      }
    };
    const result = await runStructured({
      purpose: ModelRunPurpose.GENERATE_PROBLEM,
      model: "gpt-5.5",
      input: "hello",
      schema: Schema,
      schemaName: "demo",
      client: fakeClient as never
    });
    expect(result.parsed).toEqual({ title: "hi", score: 7 });
    expect(result.modelRunId).toBe("run-1");
  });

  it("throws and logs error when schema fails", async () => {
    const fakeClient = {
      responses: {
        parse: vi.fn(async () => ({ output_parsed: { title: 5 }, usage: {} }))
      }
    };
    await expect(
      runStructured({
        purpose: ModelRunPurpose.EVALUATE_ATTEMPT,
        model: "gpt-5.5",
        input: "x",
        schema: Schema,
        schemaName: "demo",
        client: fakeClient as never
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run failing test**

Run: `pnpm test tests/unit/run-model.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement client + wrapper**

Write `lib/openai/client.ts`:

```ts
import OpenAI from "openai";
import { getConfig } from "@/lib/config";

let cached: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  if (!cached) cached = new OpenAI({ apiKey: getConfig().openai.apiKey });
  return cached;
}
```

Write `lib/openai/run-model.ts`:

```ts
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z, type ZodTypeAny } from "zod";
import { ModelRunPurpose, ModelRunStatus } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getOpenAI } from "./client";

export type WebSearchTool = { type: "web_search" };

export type RunStructuredArgs<S extends ZodTypeAny> = {
  purpose: ModelRunPurpose;
  model: string;
  input: string | Array<{ role: "system" | "user" | "developer"; content: string }>;
  schema: S;
  schemaName: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  tools?: WebSearchTool[];
  client?: Pick<OpenAI, "responses">;
};

export type RunStructuredResult<S extends ZodTypeAny> = {
  parsed: z.infer<S>;
  modelRunId: string;
  rawResponse: unknown;
};

export async function runStructured<S extends ZodTypeAny>(
  args: RunStructuredArgs<S>
): Promise<RunStructuredResult<S>> {
  const client = args.client ?? getOpenAI();

  const requestPayload = {
    model: args.model,
    input: args.input,
    text: { format: zodResponseFormat(args.schema, args.schemaName).response_format },
    tools: args.tools,
    reasoning: args.reasoningEffort ? { effort: args.reasoningEffort } : undefined
  } as const;

  const runRow = await prisma.modelRun.create({
    data: {
      purpose: args.purpose,
      model: args.model,
      requestPayload: requestPayload as unknown as object,
      status: ModelRunStatus.PENDING
    }
  });

  try {
    // openai SDK exposes .responses.parse for structured outputs
    const resp = await (client.responses as unknown as {
      parse: (req: Record<string, unknown>) => Promise<{
        output_parsed: unknown;
        usage?: unknown;
      }>;
    }).parse({
      model: args.model,
      input: args.input,
      text: { format: zodResponseFormat(args.schema, args.schemaName).response_format },
      tools: args.tools,
      reasoning: args.reasoningEffort ? { effort: args.reasoningEffort } : undefined
    });

    const parsed = args.schema.parse(resp.output_parsed);

    await prisma.modelRun.update({
      where: { id: runRow.id },
      data: {
        responsePayload: resp as unknown as object,
        usagePayload: (resp.usage ?? {}) as object,
        status: ModelRunStatus.COMPLETED
      }
    });

    return { parsed, modelRunId: runRow.id, rawResponse: resp };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.modelRun.update({
      where: { id: runRow.id },
      data: { status: ModelRunStatus.ERROR, error: message }
    });
    throw err;
  }
}
```

- [ ] **Step 5: Run passing test**

Run: `pnpm test tests/unit/run-model.test.ts`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add lib/openai/ tests/unit/run-model.test.ts package.json pnpm-lock.yaml
git commit -m "Add OpenAI client + structured-output wrapper with model_runs logging"
```

---

## Task 13: Shared exercise registry types

**Files:**
- Create: `lib/exercises/types.ts`

- [ ] **Step 1: Implement (no test — pure types + a thin interface)**

Write `lib/exercises/types.ts`:

```ts
import type { ExerciseSlug, Difficulty } from "@prisma/client";
import type { z, ZodTypeAny } from "zod";

export type GenerateInput = {
  difficulty: Difficulty;
  avoidanceHint: {
    recentTitles: string[];
    recentTags: string[];
    recentSourceUrls: string[];
    recentHashes: string[];
  };
};

export type GeneratedProblemCommon = {
  title: string;
  difficulty: Difficulty;
  timeboxMinutes: number;
  suggestedPacing: Array<{ label: string; minutes: number }>;
  userVisiblePrompt: string;
  requiredAnswerSections: Array<{ order: number; title: string; description?: string }>;
  hiddenAnswerKey: Record<string, unknown>;
  rubric: { dimensions: Array<{ name: string; maxScore: number; description: string }> };
  tags: string[];
  sourceCitations: Array<{ title: string; url: string; publisher?: string }>;
  duplicateAvoidanceKey: string;
};

export type EvaluationCommon = {
  overallScore: number;
  shortDiagnosis: string;
  dimensions: Array<{
    name: string;
    score: number;
    rationale: string;
    sharperVersion?: string;
    missingItems?: string[];
  }>;
  summary: string;
  topFixes: string[];
  rewriteSuggestions: Record<string, string | string[]>;
  strongAnswerSketch?: string;
  nextRep: string;
  clarificationQuestion?: string | null;
  errorPatternTags: string[];
  missClassifications: Array<
    | "english_comprehension"
    | "logic"
    | "question_type_confusion"
    | "too_strong"
    | "too_narrow"
    | "wrong_conclusion"
    | "quantifier_modal"
  >;
};

export type GenerateResult = {
  problem: GeneratedProblemCommon;
  modelRunId: string;
};

export type EvaluateInput = {
  problem: GeneratedProblemCommon;
  userAnswer: string;
};

export type EvaluateResult = {
  evaluation: EvaluationCommon;
  modelRunId: string;
};

export interface ExerciseMode {
  slug: ExerciseSlug;
  generatedProblemSchema: ZodTypeAny;
  evaluationSchema: ZodTypeAny;
  generate(input: GenerateInput): Promise<GenerateResult>;
  evaluate(input: EvaluateInput): Promise<EvaluateResult>;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add lib/exercises/types.ts
git commit -m "Add shared exercise-mode types and interface"
```

---

## Task 14: Memo extraction mode

**Files:**
- Create: `lib/exercises/memo-extraction/schemas.ts`
- Create: `lib/exercises/memo-extraction/generator.ts`
- Create: `lib/exercises/memo-extraction/evaluator.ts`
- Create: `lib/exercises/memo-extraction/index.ts`
- Create: `tests/unit/memo-schemas.test.ts`

- [ ] **Step 1: Failing schema test**

Write `tests/unit/memo-schemas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { MemoGeneratedProblemSchema, MemoEvaluationSchema } from "@/lib/exercises/memo-extraction/schemas";

const validProblem = {
  title: "City budget memo",
  difficulty: "MEDIUM",
  timeboxMinutes: 35,
  suggestedPacing: [
    { label: "read", minutes: 10 },
    { label: "answer", minutes: 20 },
    { label: "review", minutes: 5 }
  ],
  userVisiblePrompt: "Read the following...",
  requiredAnswerSections: [
    { order: 1, title: "Claim" },
    { order: 2, title: "Evidence" },
    { order: 3, title: "Assumptions" },
    { order: 4, title: "Tradeoffs" },
    { order: 5, title: "Next test" },
    { order: 6, title: "What would change my mind" }
  ],
  hiddenAnswerKey: { idealClaim: "x", mustCiteEvidence: ["a", "b", "c"] },
  rubric: {
    dimensions: [
      { name: "Claim clarity", maxScore: 10, description: "" },
      { name: "Evidence quality", maxScore: 10, description: "" },
      { name: "Assumptions", maxScore: 10, description: "" },
      { name: "Tradeoffs", maxScore: 10, description: "" },
      { name: "Testability", maxScore: 10, description: "" }
    ]
  },
  tags: ["budget", "municipal"],
  sourceCitations: [],
  duplicateAvoidanceKey: "city-budget-memo"
};

describe("MemoGeneratedProblemSchema", () => {
  it("accepts a valid problem", () => {
    expect(MemoGeneratedProblemSchema.parse(validProblem)).toBeTruthy();
  });

  it("rejects fewer than 6 required answer sections", () => {
    const bad = { ...validProblem, requiredAnswerSections: validProblem.requiredAnswerSections.slice(0, 3) };
    expect(() => MemoGeneratedProblemSchema.parse(bad)).toThrow();
  });
});

describe("MemoEvaluationSchema", () => {
  it("accepts a valid evaluation", () => {
    const ev = {
      overallScore: 7.5,
      shortDiagnosis: "Evidence is anecdotal.",
      dimensions: ["Claim clarity", "Evidence quality", "Assumptions", "Tradeoffs", "Testability"].map((n) => ({
        name: n,
        score: 7,
        rationale: "ok"
      })),
      summary: "Decent.",
      topFixes: ["a", "b", "c"],
      rewriteSuggestions: {
        improvedClaim: "x",
        missingAssumptions: ["a1", "a2"],
        missingTradeoffs: ["t1", "t2"],
        betterPhrasingForWeakEvidence: ["e1"]
      },
      strongAnswerSketch: "...",
      nextRep: "Practice prephrasing",
      clarificationQuestion: null,
      errorPatternTags: ["vague-claim"],
      missClassifications: []
    };
    expect(MemoEvaluationSchema.parse(ev)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm test tests/unit/memo-schemas.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement schemas**

Write `lib/exercises/memo-extraction/schemas.ts`:

```ts
import { z } from "zod";

const DifficultyEnum = z.enum(["EASY", "MEDIUM", "HARD"]);

const PacingItem = z.object({ label: z.string(), minutes: z.number().int().positive() });

const AnswerSection = z.object({
  order: z.number().int().positive(),
  title: z.string(),
  description: z.string().optional()
});

const RubricDimension = z.object({
  name: z.string(),
  maxScore: z.number().positive(),
  description: z.string()
});

const SourceCitation = z.object({
  title: z.string(),
  url: z.string().url(),
  publisher: z.string().optional()
});

export const MemoGeneratedProblemSchema = z.object({
  title: z.string().min(3),
  difficulty: DifficultyEnum,
  timeboxMinutes: z.number().int().positive(),
  suggestedPacing: z.array(PacingItem).min(1),
  userVisiblePrompt: z.string().min(50),
  requiredAnswerSections: z.array(AnswerSection).length(6),
  hiddenAnswerKey: z.record(z.unknown()),
  rubric: z.object({ dimensions: z.array(RubricDimension).length(5) }),
  tags: z.array(z.string()).min(1).max(8),
  sourceCitations: z.array(SourceCitation),
  duplicateAvoidanceKey: z.string().min(3)
});

const EvalDimension = z.object({
  name: z.string(),
  score: z.number(),
  rationale: z.string(),
  sharperVersion: z.string().optional(),
  missingItems: z.array(z.string()).optional()
});

export const MemoEvaluationSchema = z.object({
  overallScore: z.number().min(0).max(10),
  shortDiagnosis: z.string().min(5),
  dimensions: z.array(EvalDimension).length(5),
  summary: z.string().min(10),
  topFixes: z.array(z.string()).length(3),
  rewriteSuggestions: z.object({
    improvedClaim: z.string(),
    missingAssumptions: z.array(z.string()).length(2),
    missingTradeoffs: z.array(z.string()).length(2),
    betterPhrasingForWeakEvidence: z.array(z.string())
  }),
  strongAnswerSketch: z.string().optional(),
  nextRep: z.string().min(3),
  clarificationQuestion: z.string().nullable(),
  errorPatternTags: z.array(z.string()).max(4),
  missClassifications: z.array(z.string()).length(0)
});

export type MemoGeneratedProblem = z.infer<typeof MemoGeneratedProblemSchema>;
export type MemoEvaluation = z.infer<typeof MemoEvaluationSchema>;
```

- [ ] **Step 4: Run passing test**

Run: `pnpm test tests/unit/memo-schemas.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Generator**

Write `lib/exercises/memo-extraction/generator.ts`:

```ts
import { ExerciseSlug, ModelRunPurpose, PromptRole } from "@prisma/client";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { runStructured } from "@/lib/openai/run-model";
import { getConfig } from "@/lib/config";
import type { GenerateInput, GenerateResult } from "@/lib/exercises/types";
import { MemoGeneratedProblemSchema } from "./schemas";

export async function generateMemoProblem(input: GenerateInput): Promise<GenerateResult> {
  const cfg = getConfig();
  const base = await loadActivePrompt({ role: PromptRole.BASE });
  const gen = await loadActivePrompt({ role: PromptRole.GENERATOR, exerciseSlug: ExerciseSlug.MEMO_EXTRACTION });

  const userPayload = [
    `Generate a ${input.difficulty} memo-extraction problem.`,
    "",
    "Avoid these recent items (titles, tags, source URLs):",
    JSON.stringify(input.avoidanceHint, null, 2)
  ].join("\n");

  const result = await runStructured({
    purpose: ModelRunPurpose.GENERATE_PROBLEM,
    model: cfg.openai.model,
    reasoningEffort: cfg.openai.reasoningEffort,
    schema: MemoGeneratedProblemSchema,
    schemaName: "MemoGeneratedProblem",
    tools: [{ type: "web_search" }],
    input: [
      { role: "system", content: base.content },
      { role: "system", content: gen.content },
      { role: "user", content: userPayload }
    ]
  });

  return { problem: result.parsed, modelRunId: result.modelRunId };
}
```

- [ ] **Step 6: Evaluator**

Write `lib/exercises/memo-extraction/evaluator.ts`:

```ts
import { ExerciseSlug, ModelRunPurpose, PromptRole } from "@prisma/client";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { runStructured } from "@/lib/openai/run-model";
import { getConfig } from "@/lib/config";
import type { EvaluateInput, EvaluateResult } from "@/lib/exercises/types";
import { MemoEvaluationSchema } from "./schemas";

export async function evaluateMemoAttempt(input: EvaluateInput): Promise<EvaluateResult> {
  const cfg = getConfig();
  const base = await loadActivePrompt({ role: PromptRole.BASE });
  const ev = await loadActivePrompt({ role: PromptRole.EVALUATOR, exerciseSlug: ExerciseSlug.MEMO_EXTRACTION });

  const userPayload = JSON.stringify(
    {
      problem: {
        title: input.problem.title,
        difficulty: input.problem.difficulty,
        userVisiblePrompt: input.problem.userVisiblePrompt,
        rubric: input.problem.rubric,
        requiredAnswerSections: input.problem.requiredAnswerSections
      },
      hiddenAnswerKey: input.problem.hiddenAnswerKey,
      userAnswer: input.userAnswer
    },
    null,
    2
  );

  const result = await runStructured({
    purpose: ModelRunPurpose.EVALUATE_ATTEMPT,
    model: cfg.openai.model,
    reasoningEffort: cfg.openai.reasoningEffort,
    schema: MemoEvaluationSchema,
    schemaName: "MemoEvaluation",
    input: [
      { role: "system", content: base.content },
      { role: "system", content: ev.content },
      { role: "user", content: userPayload }
    ]
  });

  return { evaluation: result.parsed, modelRunId: result.modelRunId };
}
```

- [ ] **Step 7: Index re-export**

Write `lib/exercises/memo-extraction/index.ts`:

```ts
import { ExerciseSlug } from "@prisma/client";
import type { ExerciseMode } from "@/lib/exercises/types";
import { MemoGeneratedProblemSchema, MemoEvaluationSchema } from "./schemas";
import { generateMemoProblem } from "./generator";
import { evaluateMemoAttempt } from "./evaluator";

export const memoExtractionMode: ExerciseMode = {
  slug: ExerciseSlug.MEMO_EXTRACTION,
  generatedProblemSchema: MemoGeneratedProblemSchema,
  evaluationSchema: MemoEvaluationSchema,
  generate: generateMemoProblem,
  evaluate: evaluateMemoAttempt
};
```

- [ ] **Step 8: Typecheck + test**

Run: `pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add lib/exercises/memo-extraction/ tests/unit/memo-schemas.test.ts
git commit -m "Add memo-extraction mode (schemas, generator, evaluator)"
```

---

## Task 15: Incident response mode

**Files:**
- Create: `lib/exercises/incident-response/schemas.ts`
- Create: `lib/exercises/incident-response/generator.ts`
- Create: `lib/exercises/incident-response/evaluator.ts`
- Create: `lib/exercises/incident-response/index.ts`
- Create: `tests/unit/incident-schemas.test.ts`

- [ ] **Step 1: Failing schema test**

Write `tests/unit/incident-schemas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { IncidentGeneratedProblemSchema, IncidentEvaluationSchema } from "@/lib/exercises/incident-response/schemas";

const eleven = (mk: (i: number) => unknown) => Array.from({ length: 11 }, (_, i) => mk(i));

const baseProblem = {
  title: "Queue backpressure",
  difficulty: "HARD",
  timeboxMinutes: 45,
  suggestedPacing: [
    { label: "read", minutes: 7 },
    { label: "answer", minutes: 25 },
    { label: "numerical sanity check", minutes: 8 },
    { label: "revise", minutes: 5 }
  ],
  userVisiblePrompt: "Long incident scenario text...",
  requiredAnswerSections: eleven((i) => ({ order: i + 1, title: `Section ${i + 1}` })),
  hiddenAnswerKey: {
    primaryRootCause: "x",
    containmentSteps: ["a", "b"],
    rejectedDangerousIdeas: ["c"],
    expectedNumericRanges: { qps: "100-200" }
  },
  rubric: {
    dimensions: eleven((i) => ({ name: `Dim${i}`, maxScore: 10, description: "" }))
  },
  tags: ["queue", "vendor"],
  sourceCitations: [],
  duplicateAvoidanceKey: "queue-backpressure"
};

describe("IncidentGeneratedProblemSchema", () => {
  it("accepts a valid scenario", () => {
    expect(IncidentGeneratedProblemSchema.parse(baseProblem)).toBeTruthy();
  });

  it("requires exactly 11 sections", () => {
    expect(() =>
      IncidentGeneratedProblemSchema.parse({ ...baseProblem, requiredAnswerSections: [] })
    ).toThrow();
  });
});

describe("IncidentEvaluationSchema", () => {
  it("accepts a valid evaluation", () => {
    const ev = {
      overallScore: 6.5,
      shortDiagnosis: "Containment too soft.",
      dimensions: eleven((i) => ({ name: `Dim${i}`, score: 6, rationale: "ok" })),
      summary: "Solid but soft containment.",
      topFixes: ["a", "b", "c"],
      rewriteSuggestions: { betterContainment: ["x"], betterCustomerPrioritization: "y", betterNumericalSanityCheck: "z" },
      strongAnswerSketch: "...",
      nextRep: "Practice containment ladders",
      clarificationQuestion: null,
      errorPatternTags: ["soft-containment"],
      missClassifications: []
    };
    expect(IncidentEvaluationSchema.parse(ev)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm test tests/unit/incident-schemas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement schemas**

Write `lib/exercises/incident-response/schemas.ts`:

```ts
import { z } from "zod";

const DifficultyEnum = z.enum(["EASY", "MEDIUM", "HARD"]);
const PacingItem = z.object({ label: z.string(), minutes: z.number().int().positive() });
const AnswerSection = z.object({
  order: z.number().int().positive(),
  title: z.string(),
  description: z.string().optional()
});
const RubricDimension = z.object({
  name: z.string(),
  maxScore: z.number().positive(),
  description: z.string()
});
const SourceCitation = z.object({
  title: z.string(),
  url: z.string().url(),
  publisher: z.string().optional()
});

export const IncidentGeneratedProblemSchema = z.object({
  title: z.string().min(3),
  difficulty: DifficultyEnum,
  timeboxMinutes: z.number().int().positive(),
  suggestedPacing: z.array(PacingItem).min(3),
  userVisiblePrompt: z.string().min(200),
  requiredAnswerSections: z.array(AnswerSection).length(11),
  hiddenAnswerKey: z.record(z.unknown()),
  rubric: z.object({ dimensions: z.array(RubricDimension).length(11) }),
  tags: z.array(z.string()).min(1).max(8),
  sourceCitations: z.array(SourceCitation),
  duplicateAvoidanceKey: z.string().min(3)
});

const EvalDimension = z.object({
  name: z.string(),
  score: z.number(),
  rationale: z.string(),
  sharperVersion: z.string().optional(),
  missingItems: z.array(z.string()).optional()
});

export const IncidentEvaluationSchema = z.object({
  overallScore: z.number().min(0).max(10),
  shortDiagnosis: z.string().min(5),
  dimensions: z.array(EvalDimension).length(11),
  summary: z.string().min(10),
  topFixes: z.array(z.string()).length(3),
  rewriteSuggestions: z.object({
    betterContainment: z.array(z.string()).min(1),
    betterCustomerPrioritization: z.string(),
    betterNumericalSanityCheck: z.string()
  }),
  strongAnswerSketch: z.string().optional(),
  nextRep: z.string().min(3),
  clarificationQuestion: z.string().nullable(),
  errorPatternTags: z.array(z.string()).max(4),
  missClassifications: z.array(z.string()).length(0)
});

export type IncidentGeneratedProblem = z.infer<typeof IncidentGeneratedProblemSchema>;
export type IncidentEvaluation = z.infer<typeof IncidentEvaluationSchema>;
```

- [ ] **Step 4: Generator**

Write `lib/exercises/incident-response/generator.ts`:

```ts
import { ExerciseSlug, ModelRunPurpose, PromptRole } from "@prisma/client";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { runStructured } from "@/lib/openai/run-model";
import { getConfig } from "@/lib/config";
import type { GenerateInput, GenerateResult } from "@/lib/exercises/types";
import { IncidentGeneratedProblemSchema } from "./schemas";

export async function generateIncidentProblem(input: GenerateInput): Promise<GenerateResult> {
  const cfg = getConfig();
  const base = await loadActivePrompt({ role: PromptRole.BASE });
  const gen = await loadActivePrompt({ role: PromptRole.GENERATOR, exerciseSlug: ExerciseSlug.INCIDENT_RESPONSE });

  const userPayload = [
    `Generate a ${input.difficulty} incident-response scenario.`,
    "",
    "Avoid these recent items:",
    JSON.stringify(input.avoidanceHint, null, 2)
  ].join("\n");

  const result = await runStructured({
    purpose: ModelRunPurpose.GENERATE_PROBLEM,
    model: cfg.openai.model,
    reasoningEffort: cfg.openai.reasoningEffort,
    schema: IncidentGeneratedProblemSchema,
    schemaName: "IncidentGeneratedProblem",
    tools: [{ type: "web_search" }],
    input: [
      { role: "system", content: base.content },
      { role: "system", content: gen.content },
      { role: "user", content: userPayload }
    ]
  });

  return { problem: result.parsed, modelRunId: result.modelRunId };
}
```

- [ ] **Step 5: Evaluator**

Write `lib/exercises/incident-response/evaluator.ts`:

```ts
import { ExerciseSlug, ModelRunPurpose, PromptRole } from "@prisma/client";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { runStructured } from "@/lib/openai/run-model";
import { getConfig } from "@/lib/config";
import type { EvaluateInput, EvaluateResult } from "@/lib/exercises/types";
import { IncidentEvaluationSchema } from "./schemas";

export async function evaluateIncidentAttempt(input: EvaluateInput): Promise<EvaluateResult> {
  const cfg = getConfig();
  const base = await loadActivePrompt({ role: PromptRole.BASE });
  const ev = await loadActivePrompt({ role: PromptRole.EVALUATOR, exerciseSlug: ExerciseSlug.INCIDENT_RESPONSE });

  const userPayload = JSON.stringify(
    {
      problem: {
        title: input.problem.title,
        difficulty: input.problem.difficulty,
        userVisiblePrompt: input.problem.userVisiblePrompt,
        rubric: input.problem.rubric,
        requiredAnswerSections: input.problem.requiredAnswerSections
      },
      hiddenAnswerKey: input.problem.hiddenAnswerKey,
      userAnswer: input.userAnswer
    },
    null,
    2
  );

  const result = await runStructured({
    purpose: ModelRunPurpose.EVALUATE_ATTEMPT,
    model: cfg.openai.model,
    reasoningEffort: cfg.openai.reasoningEffort,
    schema: IncidentEvaluationSchema,
    schemaName: "IncidentEvaluation",
    input: [
      { role: "system", content: base.content },
      { role: "system", content: ev.content },
      { role: "user", content: userPayload }
    ]
  });

  return { evaluation: result.parsed, modelRunId: result.modelRunId };
}
```

- [ ] **Step 6: Index re-export**

Write `lib/exercises/incident-response/index.ts`:

```ts
import { ExerciseSlug } from "@prisma/client";
import type { ExerciseMode } from "@/lib/exercises/types";
import { IncidentGeneratedProblemSchema, IncidentEvaluationSchema } from "./schemas";
import { generateIncidentProblem } from "./generator";
import { evaluateIncidentAttempt } from "./evaluator";

export const incidentResponseMode: ExerciseMode = {
  slug: ExerciseSlug.INCIDENT_RESPONSE,
  generatedProblemSchema: IncidentGeneratedProblemSchema,
  evaluationSchema: IncidentEvaluationSchema,
  generate: generateIncidentProblem,
  evaluate: evaluateIncidentAttempt
};
```

- [ ] **Step 7: Test + commit**

Run: `pnpm test tests/unit/incident-schemas.test.ts`
Expected: 3 passed.

```bash
git add lib/exercises/incident-response/ tests/unit/incident-schemas.test.ts
git commit -m "Add incident-response mode (schemas, generator, evaluator)"
```

---

## Task 16: LSAT mode

**Files:**
- Create: `lib/exercises/lsat-logical-reasoning/schemas.ts`
- Create: `lib/exercises/lsat-logical-reasoning/generator.ts`
- Create: `lib/exercises/lsat-logical-reasoning/evaluator.ts`
- Create: `lib/exercises/lsat-logical-reasoning/index.ts`
- Create: `tests/unit/lsat-schemas.test.ts`

- [ ] **Step 1: Failing schema test**

Write `tests/unit/lsat-schemas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { LsatGeneratedProblemSchema, LsatEvaluationSchema } from "@/lib/exercises/lsat-logical-reasoning/schemas";

const validProblem = {
  title: "Necessary Assumption — municipal budgets",
  difficulty: "MEDIUM",
  timeboxMinutes: 6,
  suggestedPacing: [
    { label: "read stimulus", minutes: 2 },
    { label: "prephrase", minutes: 1 },
    { label: "eliminate", minutes: 3 }
  ],
  userVisiblePrompt: "Stimulus...\nQ: Which one of the following is required...\nA. ...\nB. ...\nC. ...\nD. ...\nE. ...",
  requiredAnswerSections: [
    { order: 1, title: "Choice" },
    { order: 2, title: "Reason" }
  ],
  hiddenAnswerKey: {
    correctChoice: "C",
    explanation: "Because...",
    distractorAnalyses: { A: "...", B: "...", C: "correct", D: "...", E: "..." },
    questionType: "Necessary Assumption"
  },
  rubric: {
    dimensions: [
      { name: "Correctness", maxScore: 10, description: "" },
      { name: "Reasoning quality", maxScore: 5, description: "" },
      { name: "Error pattern recognition", maxScore: 5, description: "" }
    ]
  },
  tags: ["necessary-assumption", "municipal-budgets"],
  sourceCitations: [],
  duplicateAvoidanceKey: "na-municipal-budgets"
};

describe("LsatGeneratedProblemSchema", () => {
  it("accepts a valid LSAT question", () => {
    expect(LsatGeneratedProblemSchema.parse(validProblem)).toBeTruthy();
  });

  it("rejects hiddenAnswerKey without a valid choice", () => {
    const bad = JSON.parse(JSON.stringify(validProblem));
    bad.hiddenAnswerKey.correctChoice = "F";
    expect(() => LsatGeneratedProblemSchema.parse(bad)).toThrow();
  });
});

describe("LsatEvaluationSchema", () => {
  it("accepts a valid evaluation with miss classifications", () => {
    const ev = {
      overallScore: 4.0,
      shortDiagnosis: "Picked a too-strong distractor.",
      dimensions: [
        { name: "Correctness", score: 0, rationale: "wrong" },
        { name: "Reasoning quality", score: 2, rationale: "ok" },
        { name: "Error pattern recognition", score: 2, rationale: "ok" }
      ],
      summary: "Strong stimulus parse but missed the modal trap.",
      topFixes: ["Check modal scope"],
      rewriteSuggestions: { betterReason: "Because the conclusion needs..." },
      strongAnswerSketch: "...",
      nextRep: "5 NA reps focused on modal scope",
      clarificationQuestion: null,
      errorPatternTags: ["modal-trap"],
      missClassifications: ["too_strong", "quantifier_modal"]
    };
    expect(LsatEvaluationSchema.parse(ev)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm test tests/unit/lsat-schemas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement schemas**

Write `lib/exercises/lsat-logical-reasoning/schemas.ts`:

```ts
import { z } from "zod";

const DifficultyEnum = z.enum(["EASY", "MEDIUM", "HARD"]);
const Choice = z.enum(["A", "B", "C", "D", "E"]);
const PacingItem = z.object({ label: z.string(), minutes: z.number().int().positive() });
const AnswerSection = z.object({
  order: z.number().int().positive(),
  title: z.string(),
  description: z.string().optional()
});
const RubricDimension = z.object({
  name: z.string(),
  maxScore: z.number().positive(),
  description: z.string()
});
const SourceCitation = z.object({
  title: z.string(),
  url: z.string().url(),
  publisher: z.string().optional()
});

const HiddenAnswerKey = z.object({
  correctChoice: Choice,
  explanation: z.string().min(10),
  distractorAnalyses: z.object({
    A: z.string(),
    B: z.string(),
    C: z.string(),
    D: z.string(),
    E: z.string()
  }),
  questionType: z.string().min(3)
});

export const LsatGeneratedProblemSchema = z.object({
  title: z.string().min(3),
  difficulty: DifficultyEnum,
  timeboxMinutes: z.number().int().positive(),
  suggestedPacing: z.array(PacingItem).min(2),
  userVisiblePrompt: z.string().min(50),
  requiredAnswerSections: z.array(AnswerSection).length(2),
  hiddenAnswerKey: HiddenAnswerKey,
  rubric: z.object({ dimensions: z.array(RubricDimension).length(3) }),
  tags: z.array(z.string()).min(1).max(8),
  sourceCitations: z.array(SourceCitation),
  duplicateAvoidanceKey: z.string().min(3)
});

const MissClass = z.enum([
  "english_comprehension",
  "logic",
  "question_type_confusion",
  "too_strong",
  "too_narrow",
  "wrong_conclusion",
  "quantifier_modal"
]);

const EvalDimension = z.object({
  name: z.string(),
  score: z.number(),
  rationale: z.string(),
  sharperVersion: z.string().optional(),
  missingItems: z.array(z.string()).optional()
});

export const LsatEvaluationSchema = z.object({
  overallScore: z.number().min(0).max(10),
  shortDiagnosis: z.string().min(5),
  dimensions: z.array(EvalDimension).length(3),
  summary: z.string().min(10),
  topFixes: z.array(z.string()).min(1).max(3),
  rewriteSuggestions: z.object({ betterReason: z.string() }),
  strongAnswerSketch: z.string().optional(),
  nextRep: z.string().min(3),
  clarificationQuestion: z.string().nullable(),
  errorPatternTags: z.array(z.string()).max(4),
  missClassifications: z.array(MissClass)
});

export type LsatGeneratedProblem = z.infer<typeof LsatGeneratedProblemSchema>;
export type LsatEvaluation = z.infer<typeof LsatEvaluationSchema>;
```

- [ ] **Step 4: Generator + evaluator + index**

Write `lib/exercises/lsat-logical-reasoning/generator.ts`:

```ts
import { ExerciseSlug, ModelRunPurpose, PromptRole } from "@prisma/client";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { runStructured } from "@/lib/openai/run-model";
import { getConfig } from "@/lib/config";
import type { GenerateInput, GenerateResult } from "@/lib/exercises/types";
import { LsatGeneratedProblemSchema } from "./schemas";

export async function generateLsatProblem(input: GenerateInput): Promise<GenerateResult> {
  const cfg = getConfig();
  const base = await loadActivePrompt({ role: PromptRole.BASE });
  const gen = await loadActivePrompt({ role: PromptRole.GENERATOR, exerciseSlug: ExerciseSlug.LSAT_LOGICAL_REASONING });

  const userPayload = [
    `Generate a ${input.difficulty} original LSAT logical-reasoning question.`,
    "",
    "Avoid these recent items (titles, tags, question types):",
    JSON.stringify(input.avoidanceHint, null, 2)
  ].join("\n");

  const result = await runStructured({
    purpose: ModelRunPurpose.GENERATE_PROBLEM,
    model: cfg.openai.model,
    reasoningEffort: cfg.openai.reasoningEffort,
    schema: LsatGeneratedProblemSchema,
    schemaName: "LsatGeneratedProblem",
    input: [
      { role: "system", content: base.content },
      { role: "system", content: gen.content },
      { role: "user", content: userPayload }
    ]
  });

  return { problem: result.parsed, modelRunId: result.modelRunId };
}
```

Write `lib/exercises/lsat-logical-reasoning/evaluator.ts`:

```ts
import { ExerciseSlug, ModelRunPurpose, PromptRole } from "@prisma/client";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { runStructured } from "@/lib/openai/run-model";
import { getConfig } from "@/lib/config";
import type { EvaluateInput, EvaluateResult } from "@/lib/exercises/types";
import { LsatEvaluationSchema } from "./schemas";

export async function evaluateLsatAttempt(input: EvaluateInput): Promise<EvaluateResult> {
  const cfg = getConfig();
  const base = await loadActivePrompt({ role: PromptRole.BASE });
  const ev = await loadActivePrompt({ role: PromptRole.EVALUATOR, exerciseSlug: ExerciseSlug.LSAT_LOGICAL_REASONING });

  const userPayload = JSON.stringify(
    {
      problem: {
        title: input.problem.title,
        difficulty: input.problem.difficulty,
        userVisiblePrompt: input.problem.userVisiblePrompt,
        rubric: input.problem.rubric,
        requiredAnswerSections: input.problem.requiredAnswerSections
      },
      hiddenAnswerKey: input.problem.hiddenAnswerKey,
      userAnswer: input.userAnswer
    },
    null,
    2
  );

  const result = await runStructured({
    purpose: ModelRunPurpose.EVALUATE_ATTEMPT,
    model: cfg.openai.model,
    reasoningEffort: cfg.openai.reasoningEffort,
    schema: LsatEvaluationSchema,
    schemaName: "LsatEvaluation",
    input: [
      { role: "system", content: base.content },
      { role: "system", content: ev.content },
      { role: "user", content: userPayload }
    ]
  });

  return { evaluation: result.parsed, modelRunId: result.modelRunId };
}
```

Write `lib/exercises/lsat-logical-reasoning/index.ts`:

```ts
import { ExerciseSlug } from "@prisma/client";
import type { ExerciseMode } from "@/lib/exercises/types";
import { LsatGeneratedProblemSchema, LsatEvaluationSchema } from "./schemas";
import { generateLsatProblem } from "./generator";
import { evaluateLsatAttempt } from "./evaluator";

export const lsatMode: ExerciseMode = {
  slug: ExerciseSlug.LSAT_LOGICAL_REASONING,
  generatedProblemSchema: LsatGeneratedProblemSchema,
  evaluationSchema: LsatEvaluationSchema,
  generate: generateLsatProblem,
  evaluate: evaluateLsatAttempt
};
```

- [ ] **Step 5: Test + commit**

Run: `pnpm test tests/unit/lsat-schemas.test.ts`
Expected: 3 passed.

```bash
git add lib/exercises/lsat-logical-reasoning/ tests/unit/lsat-schemas.test.ts
git commit -m "Add LSAT mode (schemas, generator, evaluator)"
```

---

## Task 17: Exercise registry

**Files:**
- Create: `lib/exercises/registry.ts`

- [ ] **Step 1: Implement**

Write `lib/exercises/registry.ts`:

```ts
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
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: passes.

```bash
git add lib/exercises/registry.ts
git commit -m "Add exercise registry dispatcher"
```

---

## Task 18: Recent-history avoidance loader

**Files:**
- Create: `lib/memory/avoidance.ts`
- Create: `tests/integration/avoidance.test.ts`

- [ ] **Step 1: Failing integration test**

Write `tests/integration/avoidance.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ExerciseSlug, Difficulty, PromptRole } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { loadAvoidanceHint } from "@/lib/memory/avoidance";

describe("loadAvoidanceHint", () => {
  let exerciseTypeId: string;
  let promptVersionId: string;

  beforeAll(async () => {
    const ex = await prisma.exerciseType.findUniqueOrThrow({ where: { slug: ExerciseSlug.MEMO_EXTRACTION } });
    exerciseTypeId = ex.id;
    const prompt = await prisma.promptVersion.findFirstOrThrow({
      where: { role: PromptRole.GENERATOR, exerciseTypeId, active: true }
    });
    promptVersionId = prompt.id;

    await prisma.problem.create({
      data: {
        exerciseTypeId,
        title: "Test avoidance memo",
        promptText: "x",
        userVisiblePayload: {},
        hiddenAnswerKey: {},
        rubric: {},
        timeboxMinutes: 25,
        suggestedPacing: [],
        requiredAnswerSections: [],
        difficulty: Difficulty.EASY,
        tags: ["avoid-tag"],
        uniquenessHash: "deadbeef",
        generatedByModel: "test",
        generationPromptVersionId: promptVersionId
      }
    });
  });

  afterAll(async () => {
    await prisma.problem.deleteMany({ where: { uniquenessHash: "deadbeef" } });
    await prisma.$disconnect();
  });

  it("returns recent titles, tags, hashes for the exercise type", async () => {
    const hint = await loadAvoidanceHint({ exerciseSlug: ExerciseSlug.MEMO_EXTRACTION, limit: 5 });
    expect(hint.recentHashes).toContain("deadbeef");
    expect(hint.recentTags).toContain("avoid-tag");
    expect(hint.recentTitles).toContain("Test avoidance memo");
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm test tests/integration/avoidance.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write `lib/memory/avoidance.ts`:

```ts
import { ExerciseSlug } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export type AvoidanceHint = {
  recentTitles: string[];
  recentTags: string[];
  recentSourceUrls: string[];
  recentHashes: string[];
};

export async function loadAvoidanceHint(args: {
  exerciseSlug: ExerciseSlug;
  limit?: number;
}): Promise<AvoidanceHint> {
  const limit = args.limit ?? 20;
  const exerciseType = await prisma.exerciseType.findUniqueOrThrow({ where: { slug: args.exerciseSlug } });

  const problems = await prisma.problem.findMany({
    where: { exerciseTypeId: exerciseType.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { sources: { select: { url: true } } }
  });

  const recentTitles = problems.map((p) => p.title);
  const recentHashes = problems.map((p) => p.uniquenessHash);
  const tagSet = new Set<string>();
  problems.forEach((p) => p.tags.forEach((t) => tagSet.add(t)));
  const urlSet = new Set<string>();
  problems.forEach((p) => p.sources.forEach((s) => urlSet.add(s.url)));

  return {
    recentTitles,
    recentTags: [...tagSet],
    recentSourceUrls: [...urlSet],
    recentHashes
  };
}
```

- [ ] **Step 4: Run passing test + commit**

Run: `pnpm test tests/integration/avoidance.test.ts`
Expected: 1 passed.

```bash
git add lib/memory/avoidance.ts tests/integration/avoidance.test.ts
git commit -m "Add recent-history avoidance loader"
```

---

## Task 19: API route — POST /api/problems/generate

**Files:**
- Create: `app/api/problems/generate/route.ts`

- [ ] **Step 1: Implement (no unit test — exercised by smoke test in Task 26)**

Write `app/api/problems/generate/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { Difficulty, ExerciseSlug, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getMode } from "@/lib/exercises/registry";
import { loadAvoidanceHint } from "@/lib/memory/avoidance";
import { computeUniquenessHash } from "@/lib/memory/uniqueness";
import { getConfig } from "@/lib/config";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { PromptRole } from "@prisma/client";

export const runtime = "nodejs";

const Body = z.object({
  exerciseSlug: z.nativeEnum(ExerciseSlug),
  difficulty: z.nativeEnum(Difficulty)
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { exerciseSlug, difficulty } = parsed.data;

  const mode = getMode(exerciseSlug);
  const avoidanceHint = await loadAvoidanceHint({ exerciseSlug });
  const cfg = getConfig();

  let { problem, modelRunId } = await mode.generate({ difficulty, avoidanceHint });
  let hash = computeUniquenessHash({
    title: problem.title,
    promptText: problem.userVisiblePrompt,
    tags: problem.tags
  });

  if (avoidanceHint.recentHashes.includes(hash)) {
    // one shot regen
    const augmented = {
      ...avoidanceHint,
      recentHashes: [...avoidanceHint.recentHashes, hash],
      recentTitles: [...avoidanceHint.recentTitles, problem.title]
    };
    const retry = await mode.generate({ difficulty, avoidanceHint: augmented });
    problem = retry.problem;
    modelRunId = retry.modelRunId;
    hash = computeUniquenessHash({
      title: problem.title,
      promptText: problem.userVisiblePrompt,
      tags: problem.tags
    });
  }

  const exerciseType = await prisma.exerciseType.findUniqueOrThrow({ where: { slug: exerciseSlug } });
  const generationPrompt = await loadActivePrompt({ role: PromptRole.GENERATOR, exerciseSlug });

  const created = await prisma.$transaction(async (tx) => {
    const userVisiblePayload: Prisma.InputJsonValue = {
      title: problem.title,
      difficulty: problem.difficulty,
      timeboxMinutes: problem.timeboxMinutes,
      suggestedPacing: problem.suggestedPacing,
      userVisiblePrompt: problem.userVisiblePrompt,
      requiredAnswerSections: problem.requiredAnswerSections,
      rubric: problem.rubric,
      tags: problem.tags
    };

    const inserted = await tx.problem.create({
      data: {
        exerciseTypeId: exerciseType.id,
        title: problem.title,
        promptText: problem.userVisiblePrompt,
        userVisiblePayload,
        hiddenAnswerKey: problem.hiddenAnswerKey as Prisma.InputJsonValue,
        rubric: problem.rubric as unknown as Prisma.InputJsonValue,
        timeboxMinutes: problem.timeboxMinutes,
        suggestedPacing: problem.suggestedPacing as unknown as Prisma.InputJsonValue,
        requiredAnswerSections: problem.requiredAnswerSections as unknown as Prisma.InputJsonValue,
        difficulty: problem.difficulty,
        tags: problem.tags,
        uniquenessHash: hash,
        generatedByModel: cfg.openai.model,
        generationPromptVersionId: generationPrompt.id
      }
    });

    for (const c of problem.sourceCitations) {
      await tx.problemSource.create({
        data: {
          problemId: inserted.id,
          url: c.url,
          title: c.title,
          publisher: c.publisher
        }
      });
    }

    return inserted;
  });

  return NextResponse.json({ problemId: created.id, modelRunId });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: passes.

```bash
git add app/api/problems/generate/route.ts
git commit -m "Add POST /api/problems/generate route"
```

---

## Task 20: API route — GET /api/problems/[id]

**Files:**
- Create: `app/api/problems/[id]/route.ts`

- [ ] **Step 1: Implement**

Write `app/api/problems/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const problem = await prisma.problem.findUnique({
    where: { id },
    include: { sources: true, exerciseType: { select: { slug: true, name: true } } }
  });
  if (!problem) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // strip hiddenAnswerKey before returning to client
  const { hiddenAnswerKey, ...rest } = problem;
  return NextResponse.json(rest);
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: passes.

```bash
git add app/api/problems/[id]/route.ts
git commit -m "Add GET /api/problems/[id] route"
```

---

## Task 21: API route — POST /api/attempts

**Files:**
- Create: `app/api/attempts/route.ts`

- [ ] **Step 1: Implement**

Write `app/api/attempts/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getConfig } from "@/lib/config";

export const runtime = "nodejs";

const Body = z.object({
  problemId: z.string().uuid(),
  responseText: z.string().min(1),
  timeSpentSeconds: z.number().int().nonnegative()
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const cfg = getConfig();
  const attempt = await prisma.attempt.create({
    data: {
      userId: cfg.localUserId,
      problemId: parsed.data.problemId,
      responseText: parsed.data.responseText,
      timeSpentSeconds: parsed.data.timeSpentSeconds
    }
  });
  return NextResponse.json({ attemptId: attempt.id });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: passes.

```bash
git add app/api/attempts/route.ts
git commit -m "Add POST /api/attempts route (persists before evaluation)"
```

---

## Task 22: API route — POST /api/attempts/[id]/evaluate

**Files:**
- Create: `app/api/attempts/[id]/evaluate/route.ts`

- [ ] **Step 1: Implement**

Write `app/api/attempts/[id]/evaluate/route.ts`:

```ts
import { NextResponse } from "next/server";
import { AttemptStatus, PromptRole, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getMode } from "@/lib/exercises/registry";
import { getConfig } from "@/lib/config";
import { loadActivePrompt } from "@/lib/prompts/registry";
import type { GeneratedProblemCommon } from "@/lib/exercises/types";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attemptId = Number(id);
  if (!Number.isInteger(attemptId)) {
    return NextResponse.json({ error: "invalid_attempt_id" }, { status: 400 });
  }

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { problem: { include: { exerciseType: true } }, evaluation: true }
  });
  if (!attempt) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // idempotency
  if (attempt.evaluation) {
    return NextResponse.json({ evaluationId: attempt.evaluation.id, alreadyEvaluated: true });
  }

  const cfg = getConfig();
  const mode = getMode(attempt.problem.exerciseType.slug);
  const evaluatorPrompt = await loadActivePrompt({
    role: PromptRole.EVALUATOR,
    exerciseSlug: attempt.problem.exerciseType.slug
  });

  const problemAsCommon = {
    ...(attempt.problem.userVisiblePayload as object),
    hiddenAnswerKey: attempt.problem.hiddenAnswerKey
  } as unknown as GeneratedProblemCommon;

  try {
    const result = await mode.evaluate({
      problem: problemAsCommon,
      userAnswer: attempt.responseText
    });

    const e = result.evaluation;
    const evaluation = await prisma.$transaction(async (tx) => {
      const row = await tx.evaluation.create({
        data: {
          attemptId,
          evaluatorPromptVersionId: evaluatorPrompt.id,
          model: cfg.openai.model,
          overallScore: e.overallScore,
          shortDiagnosis: e.shortDiagnosis,
          summary: e.summary,
          topFixes: e.topFixes as unknown as Prisma.InputJsonValue,
          rewriteSuggestions: e.rewriteSuggestions as unknown as Prisma.InputJsonValue,
          strongAnswerSketch: e.strongAnswerSketch ?? null,
          nextRep: e.nextRep,
          clarificationQuestion: e.clarificationQuestion ?? null,
          errorPatternTags: e.errorPatternTags,
          missClassifications: e.missClassifications,
          rawOutput: e as unknown as Prisma.InputJsonValue
        }
      });
      for (const d of e.dimensions) {
        await tx.evaluationDimension.create({
          data: { evaluationId: row.id, dimension: d.name, score: d.score, rationale: d.rationale }
        });
      }
      await tx.attempt.update({ where: { id: attemptId }, data: { status: AttemptStatus.EVALUATED } });
      return row;
    });

    return NextResponse.json({ evaluationId: evaluation.id });
  } catch (err) {
    await prisma.attempt.update({ where: { id: attemptId }, data: { status: AttemptStatus.EVAL_FAILED } });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "evaluation_failed", message }, { status: 502 });
  }
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: passes.

```bash
git add app/api/attempts/[id]/evaluate/route.ts
git commit -m "Add POST /api/attempts/[id]/evaluate route (idempotent)"
```

---

## Task 23: API route — GET /api/history

**Files:**
- Create: `app/api/history/route.ts`

- [ ] **Step 1: Implement**

Write `app/api/history/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getConfig } from "@/lib/config";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const cfg = getConfig();
  const url = new URL(req.url);
  const take = Math.min(Number(url.searchParams.get("limit") ?? "30"), 100);
  const skip = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);

  const attempts = await prisma.attempt.findMany({
    where: { userId: cfg.localUserId },
    orderBy: { submittedAt: "desc" },
    take,
    skip,
    include: {
      problem: { select: { title: true, difficulty: true, exerciseType: { select: { slug: true, name: true } } } },
      evaluation: { select: { overallScore: true, shortDiagnosis: true } }
    }
  });

  return NextResponse.json({
    items: attempts.map((a) => ({
      attemptId: a.id,
      problemTitle: a.problem.title,
      difficulty: a.problem.difficulty,
      exerciseSlug: a.problem.exerciseType.slug,
      exerciseName: a.problem.exerciseType.name,
      submittedAt: a.submittedAt,
      status: a.status,
      overallScore: a.evaluation?.overallScore ?? null,
      shortDiagnosis: a.evaluation?.shortDiagnosis ?? null
    }))
  });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: passes.

```bash
git add app/api/history/route.ts
git commit -m "Add GET /api/history route"
```

---

## Task 24: Today page UI

**Files:**
- Create: `app/today/page.tsx`
- Create: `components/today/exercise-picker.tsx`
- Create: `components/today/answer-editor.tsx`
- Create: `components/today/timer.tsx`
- Create: `components/today/feedback-panel.tsx`

- [ ] **Step 1: Today page (server component shell)**

Write `app/today/page.tsx`:

```tsx
import { ExercisePicker } from "@/components/today/exercise-picker";

export default function TodayPage() {
  return (
    <main className="container mx-auto max-w-3xl py-8">
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">Today</h1>
      <ExercisePicker />
    </main>
  );
}
```

- [ ] **Step 2: ExercisePicker (client)**

Write `components/today/exercise-picker.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnswerEditor } from "./answer-editor";

const EXERCISES = [
  { slug: "MEMO_EXTRACTION", name: "Memo" },
  { slug: "INCIDENT_RESPONSE", name: "Incident" },
  { slug: "LSAT_LOGICAL_REASONING", name: "LSAT" }
] as const;

type ProblemPayload = {
  id: string;
  userVisiblePayload: {
    title: string;
    timeboxMinutes: number;
    userVisiblePrompt: string;
    requiredAnswerSections: Array<{ order: number; title: string; description?: string }>;
    suggestedPacing: Array<{ label: string; minutes: number }>;
  };
};

export function ExercisePicker() {
  const [slug, setSlug] = useState<(typeof EXERCISES)[number]["slug"]>("MEMO_EXTRACTION");
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [generating, setGenerating] = useState(false);
  const [problem, setProblem] = useState<ProblemPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setProblem(null);
    try {
      const res = await fetch("/api/problems/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseSlug: slug, difficulty })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { problemId } = await res.json();
      const probRes = await fetch(`/api/problems/${problemId}`);
      const prob = await probRes.json();
      setProblem({ id: prob.id, userVisiblePayload: prob.userVisiblePayload });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  if (problem) {
    return <AnswerEditor problem={problem} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick an exercise</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={slug} onValueChange={(v) => setSlug(v as typeof slug)}>
          <TabsList>
            {EXERCISES.map((e) => (
              <TabsTrigger key={e.slug} value={e.slug}>
                {e.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {EXERCISES.map((e) => (
            <TabsContent key={e.slug} value={e.slug} />
          ))}
        </Tabs>

        <div className="space-y-2">
          <Label>Difficulty</Label>
          <RadioGroup
            className="flex gap-6"
            value={difficulty}
            onValueChange={(v) => setDifficulty(v as typeof difficulty)}
          >
            {["EASY", "MEDIUM", "HARD"].map((d) => (
              <div key={d} className="flex items-center space-x-2">
                <RadioGroupItem id={d} value={d} />
                <Label htmlFor={d}>{d.toLowerCase()}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <Button onClick={handleGenerate} disabled={generating}>
          {generating ? "Generating…" : "Generate problem"}
        </Button>

        {error && <p className="text-sm text-destructive">Error: {error}</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Timer**

Write `components/today/timer.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

export function Timer({ minutes }: { minutes: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const totalSec = minutes * 60;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const over = elapsed >= totalSec;
  return (
    <div className={over ? "text-destructive" : "text-muted-foreground"}>
      <span className="font-mono">
        {mm}:{ss}
      </span>
      <span className="ml-2 text-xs">/ {minutes}m timebox</span>
    </div>
  );
}
```

- [ ] **Step 4: AnswerEditor (and getter for elapsed seconds)**

Write `components/today/answer-editor.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Timer } from "./timer";
import { FeedbackPanel } from "./feedback-panel";

type Problem = {
  id: string;
  userVisiblePayload: {
    title: string;
    timeboxMinutes: number;
    userVisiblePrompt: string;
    requiredAnswerSections: Array<{ order: number; title: string; description?: string }>;
    suggestedPacing: Array<{ label: string; minutes: number }>;
  };
};

export function AnswerEditor({ problem }: { problem: Problem }) {
  const startRef = useRef(Date.now());
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [evaluationId, setEvaluationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
      const attemptRes = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemId: problem.id, responseText: text, timeSpentSeconds: elapsed })
      });
      if (!attemptRes.ok) throw new Error("Failed to save attempt");
      const { attemptId: aid } = await attemptRes.json();
      setAttemptId(aid);
      const evalRes = await fetch(`/api/attempts/${aid}/evaluate`, { method: "POST" });
      if (!evalRes.ok) {
        const msg = await evalRes.json().catch(() => ({}));
        throw new Error(`Evaluation failed: ${msg.message ?? evalRes.status}`);
      }
      const { evaluationId: eid } = await evalRes.json();
      setEvaluationId(eid);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (evaluationId && attemptId) {
    return <FeedbackPanel attemptId={attemptId} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-4">
          <span>{problem.userVisiblePayload.title}</span>
          <Timer minutes={problem.userVisiblePayload.timeboxMinutes} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <article className="prose prose-sm max-w-none whitespace-pre-wrap">
          {problem.userVisiblePayload.userVisiblePrompt}
        </article>

        <Separator />

        <section>
          <h3 className="mb-2 text-sm font-semibold">Required sections</h3>
          <ol className="list-decimal pl-6 text-sm text-muted-foreground">
            {problem.userVisiblePayload.requiredAnswerSections.map((s) => (
              <li key={s.order}>
                {s.title}
                {s.description ? <span> — {s.description}</span> : null}
              </li>
            ))}
          </ol>
        </section>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write your answer here…"
          className="min-h-[320px]"
        />

        <div className="flex gap-3">
          <Button onClick={handleSubmit} disabled={submitting || text.trim().length === 0}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
          {attemptId && !evaluationId ? <span className="text-sm text-muted-foreground">Saved. Evaluating…</span> : null}
        </div>

        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
            {attemptId ? (
              <p className="mt-1 text-xs">Your attempt was saved (id {attemptId}). You can retry evaluation from history.</p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: FeedbackPanel (fetches attempt detail)**

Write `components/today/feedback-panel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

type Detail = {
  attempt: { id: number; responseText: string };
  evaluation: {
    overallScore: number;
    shortDiagnosis: string;
    summary: string;
    topFixes: string[];
    nextRep: string;
    strongAnswerSketch?: string | null;
    dimensions: Array<{ dimension: string; score: number; rationale: string }>;
    errorPatternTags: string[];
  } | null;
};

export function FeedbackPanel({ attemptId }: { attemptId: number }) {
  const [data, setData] = useState<Detail | null>(null);
  useEffect(() => {
    fetch(`/api/history/${attemptId}`)
      .then((r) => r.json())
      .then(setData);
  }, [attemptId]);

  if (!data) return <p className="text-sm text-muted-foreground">Loading feedback…</p>;
  if (!data.evaluation) return <p>No evaluation yet.</p>;

  const e = data.evaluation;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Overall {e.overallScore.toFixed(1)} / 10</span>
          <div className="flex gap-2">
            {e.errorPatternTags.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-base">{e.shortDiagnosis}</p>
        <Separator />
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Dimensions</h3>
          <ul className="space-y-2">
            {e.dimensions.map((d) => (
              <li key={d.dimension} className="rounded-md border p-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{d.dimension}</span>
                  <span className="font-mono text-sm">{d.score}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{d.rationale}</p>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Summary</h3>
          <p className="text-sm">{e.summary}</p>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Top fixes</h3>
          <ol className="list-decimal pl-6 text-sm">
            {e.topFixes.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ol>
        </section>
        {e.strongAnswerSketch ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Strong answer sketch</h3>
            <p className="whitespace-pre-wrap text-sm">{e.strongAnswerSketch}</p>
          </section>
        ) : null}
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Next rep</h3>
          <p className="text-sm">{e.nextRep}</p>
        </section>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/today">New problem</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/history">History</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add app/today/ components/today/
git commit -m "Add Today page UI: picker, editor, timer, feedback panel"
```

---

## Task 25: History API detail + pages

**Files:**
- Create: `app/api/history/[attemptId]/route.ts`
- Create: `app/history/page.tsx`
- Create: `app/history/[attemptId]/page.tsx`

- [ ] **Step 1: Detail API**

Write `app/api/history/[attemptId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const id = Number(attemptId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const attempt = await prisma.attempt.findUnique({
    where: { id },
    include: {
      problem: {
        select: {
          id: true,
          title: true,
          difficulty: true,
          userVisiblePayload: true,
          exerciseType: { select: { slug: true, name: true } }
        }
      },
      evaluation: { include: { dimensions: true } }
    }
  });
  if (!attempt) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    attempt: {
      id: attempt.id,
      responseText: attempt.responseText,
      timeSpentSeconds: attempt.timeSpentSeconds,
      submittedAt: attempt.submittedAt,
      status: attempt.status
    },
    problem: attempt.problem,
    evaluation: attempt.evaluation
  });
}
```

- [ ] **Step 2: History list page**

Write `app/history/page.tsx`:

```tsx
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { getConfig } from "@/lib/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const cfg = getConfig();
  const attempts = await prisma.attempt.findMany({
    where: { userId: cfg.localUserId },
    orderBy: { submittedAt: "desc" },
    take: 50,
    include: {
      problem: { select: { title: true, difficulty: true, exerciseType: { select: { name: true } } } },
      evaluation: { select: { overallScore: true } }
    }
  });

  return (
    <main className="container mx-auto max-w-3xl py-8">
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">History</h1>
      <div className="space-y-3">
        {attempts.length === 0 ? <p className="text-muted-foreground">No attempts yet.</p> : null}
        {attempts.map((a) => (
          <Card key={a.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-baseline justify-between text-base">
                <Link href={`/history/${a.id}`} className="hover:underline">
                  {a.problem.title}
                </Link>
                <span className="font-mono text-sm">
                  {a.evaluation?.overallScore != null ? a.evaluation.overallScore.toFixed(1) : "—"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2 pb-4 text-sm text-muted-foreground">
              <Badge variant="outline">{a.problem.exerciseType.name}</Badge>
              <Badge variant="outline">{a.problem.difficulty.toLowerCase()}</Badge>
              <Badge variant={a.status === "EVAL_FAILED" ? "destructive" : "secondary"}>{a.status.toLowerCase()}</Badge>
              <span className="ml-auto">{new Date(a.submittedAt).toLocaleString()}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: History detail page**

Write `app/history/[attemptId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AttemptDetailPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const id = Number(attemptId);
  if (!Number.isInteger(id)) notFound();

  const attempt = await prisma.attempt.findUnique({
    where: { id },
    include: {
      problem: { include: { exerciseType: true } },
      evaluation: { include: { dimensions: true } }
    }
  });
  if (!attempt) notFound();

  const payload = attempt.problem.userVisiblePayload as { userVisiblePrompt: string };

  return (
    <main className="container mx-auto max-w-3xl space-y-6 py-8">
      <Link href="/history" className="text-sm text-muted-foreground hover:underline">
        ← back to history
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>{attempt.problem.title}</CardTitle>
          <div className="flex gap-2 pt-1">
            <Badge variant="outline">{attempt.problem.exerciseType.name}</Badge>
            <Badge variant="outline">{attempt.problem.difficulty.toLowerCase()}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <article className="prose prose-sm max-w-none whitespace-pre-wrap">{payload.userVisiblePrompt}</article>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your answer</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-sm">{attempt.responseText}</pre>
        </CardContent>
      </Card>

      {attempt.evaluation ? (
        <Card>
          <CardHeader>
            <CardTitle>Evaluation — {attempt.evaluation.overallScore.toFixed(1)} / 10</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{attempt.evaluation.shortDiagnosis}</p>
            <Separator />
            <ul className="space-y-2">
              {attempt.evaluation.dimensions.map((d) => (
                <li key={d.id} className="rounded-md border p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium">{d.dimension}</span>
                    <span className="font-mono text-sm">{d.score}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{d.rationale}</p>
                </li>
              ))}
            </ul>
            <Separator />
            <section>
              <h3 className="mb-1 text-sm font-semibold uppercase text-muted-foreground">Summary</h3>
              <p className="text-sm">{attempt.evaluation.summary}</p>
            </section>
            <section>
              <h3 className="mb-1 text-sm font-semibold uppercase text-muted-foreground">Next rep</h3>
              <p className="text-sm">{attempt.evaluation.nextRep}</p>
            </section>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">No evaluation stored.</p>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/history/ app/history/
git commit -m "Add history list, detail page, and detail API"
```

---

## Task 26: Admin prompts (read-only)

**Files:**
- Create: `app/admin/prompts/page.tsx`

- [ ] **Step 1: Implement**

Write `app/admin/prompts/page.tsx`:

```tsx
import { prisma } from "@/lib/db/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminPromptsPage() {
  const rows = await prisma.promptVersion.findMany({
    where: { active: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: { exerciseType: { select: { slug: true } } }
  });

  return (
    <main className="container mx-auto max-w-3xl space-y-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Active prompts</h1>
      {rows.map((p) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>{p.name}</span>
              <div className="flex gap-2">
                <Badge variant="outline">{p.role.toLowerCase()}</Badge>
                {p.exerciseType ? <Badge variant="outline">{p.exerciseType.slug.toLowerCase()}</Badge> : null}
                <Badge>v{p.version}</Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{p.content}</pre>
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/
git commit -m "Add read-only admin prompts page"
```

---

## Task 27: Nav + landing

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Replace layout with header nav**

Edit `app/layout.tsx` so the file reads:

```tsx
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata = { title: "Brain Gym", description: "Deliberate practice for reasoning" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <header className="border-b">
          <div className="container mx-auto flex max-w-3xl items-center justify-between py-4">
            <Link href="/today" className="font-semibold tracking-tight">
              Brain Gym
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/today" className="hover:underline">
                Today
              </Link>
              <Link href="/history" className="hover:underline">
                History
              </Link>
              <Link href="/admin/prompts" className="hover:underline">
                Admin
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/layout.tsx
git commit -m "Add header nav across Today/History/Admin"
```

---

## Task 28: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Write `README.md`:

````markdown
# Brain Gym

Deliberate-practice training app for reasoning. Three modes (memo extraction, technical incident response, LSAT logical reasoning). Local single-user MVP. See `START_HERE.md` for the product spec and `docs/superpowers/specs/` for the implementation design.

## Run locally

Prereqs: Node 20+, pnpm 9+, Docker.

```bash
pnpm install
cp .env.example .env
# edit .env: set OPENAI_API_KEY
docker compose up -d db
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open http://localhost:3000.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` | Production build |
| `pnpm test` | Vitest (unit + integration, requires DB up + seeded for integration tests) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:up` / `pnpm db:down` | Postgres in Docker |
| `pnpm db:migrate` | Apply Prisma migrations |
| `pnpm db:seed` | Reseed user, exercise types, prompts |
| `pnpm db:studio` | Prisma Studio GUI |
| `pnpm db:reset` | Drop + recreate + reseed (destructive) |

## Env

See `.env.example`. Required: `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `LOCAL_USER_ID`.

## Structure

- `app/` — Next.js App Router pages + API routes
- `components/` — UI (shadcn primitives in `components/ui/`)
- `lib/` — config, db client, OpenAI wrapper, per-exercise modes, prompt registry, memory helpers
- `prisma/` — schema, migrations, seed
- `prompts/` — source-of-truth prompt files (seeded into DB)
- `tests/` — Vitest unit + integration
- `docs/superpowers/` — design + plan documents

## Adding a fourth exercise mode

1. Add an enum value to `ExerciseSlug` in `prisma/schema.prisma`, migrate.
2. Add seed rows in `prisma/seed.ts` and prompt files in `prompts/`.
3. Create `lib/exercises/<mode>/{schemas,generator,evaluator,index}.ts` following the existing modes.
4. Register in `lib/exercises/registry.ts`.
5. Add a tab in `components/today/exercise-picker.tsx`.

## Troubleshooting

- **Prisma can't connect:** confirm `docker compose ps` shows the `brain_gym_db` container healthy, and `.env` `DATABASE_URL` matches `docker-compose.yml` creds.
- **Integration tests fail with "no active prompt":** run `pnpm db:seed`.
- **OpenAI 400 on `web_search`:** your account may not have the tool enabled; remove the `tools` block in the affected generator temporarily.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add README with setup, scripts, and structure"
```

---

## Task 29: End-to-end smoke test (manual)

This task is manual. It validates the acceptance criteria in the design's §13.

**Prereq:** real OPENAI_API_KEY in `.env`, Postgres up, seed run.

- [ ] **Step 1: Boot**

Run: `pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm dev`
Expected: dev server on http://localhost:3000 with no startup errors in the terminal.

- [ ] **Step 2: Memo loop**

In the browser:
1. Open `/today`.
2. Select "Memo" tab.
3. Difficulty: `MEDIUM`.
4. Click "Generate problem". Wait 10-60s (web search may take time).
5. Verify a problem renders with title, prompt text, and 6 required sections (Claim through "What would change my mind").
6. Write a brief answer (2-3 sentences per section is fine for the smoke).
7. Click Submit.
8. Verify feedback panel appears with overall score, dimensions table, top fixes, next rep.

- [ ] **Step 3: Verify persistence**

Run: `pnpm exec prisma db execute --stdin <<< 'select count(*) from "Problem"; select count(*) from "Attempt"; select count(*) from "Evaluation"; select count(*) from "EvaluationDimension"; select count(*) from "ModelRun";'`
Expected: at least 1 row in each table; ModelRun should have at least 2 (generate + evaluate).

- [ ] **Step 4: Verify history**

Open `/history`. Confirm the just-completed attempt appears with score. Click it. Confirm detail page shows full problem, your answer, and evaluation dimensions.

- [ ] **Step 5: Verify evaluation failure handling**

Temporarily break the OpenAI key in `.env` (e.g., `OPENAI_API_KEY="sk-broken"`), restart `pnpm dev`. Generate works only if the env was cached — to force eval failure cleanly, leave the key broken and instead use Prisma Studio (`pnpm db:studio`) to insert a fresh `Attempt` row for a recent `Problem`, then call:

```bash
curl -X POST http://localhost:3000/api/attempts/<ATTEMPT_ID>/evaluate
```

Expected: 502 response; that attempt's status becomes `EVAL_FAILED` in `pnpm db:studio`; the response text is untouched.

Restore the real key when done.

- [ ] **Step 6: Repeat for incident + LSAT**

Repeat Steps 2-4 for the Incident and LSAT tabs. (Use easy difficulty to keep the smoke quick.)

- [ ] **Step 7: Mark done**

If all steps pass: commit nothing (manual test), but note in your session log that the MVP loop is green.

If any step fails: open an issue or stop here.

---

## Self-Review

Run through the spec's acceptance criteria (§13) against the task list:

1. ✅ `docker compose up` + install + migrate + seed + dev — Tasks 1–7, 28 (README documents the sequence).
2. ✅ Pick type + difficulty, generate, render, write, submit, evaluate, see feedback — Tasks 14–17 (modes), 19–22 (APIs), 24 (UI).
3. ✅ History list + detail — Tasks 23, 25.
4. ✅ All tables populated after one loop — verified manually in Task 29.
5. ✅ Eval failure leaves attempt durable + retryable — Task 22 sets `EVAL_FAILED`; UI shows error text and the attempt id (Task 24 step 4); Task 29 step 5 verifies.
6. ✅ `pnpm test` passes — Tasks 9, 10, 11, 12, 14, 15, 16, 18.

Spec sections not covered intentionally (deferred per design §2): weekly review, analytics, semantic memory, auth, backups.

No placeholders detected; every code block is complete; types and method names are consistent across tasks (`runStructured`, `loadActivePrompt`, `getMode`, `computeUniquenessHash`, `loadAvoidanceHint`, mode `index.ts` exports all match).

---

Plan complete.
