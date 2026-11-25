import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("writes an inspectable planned report in dry-run without credentials or application .env", async () => {
  const directory = await mkdtemp(join(tmpdir(), "brain-gym-eval-dry-run-"));
  const outputPath = join(directory, "report.json");
  const cli = resolve("tests/evals/live.ts");
  const tsx = resolve("node_modules/tsx/dist/cli.mjs");
  try {
    // Empty temporary cwd prevents dotenv from reading the application's .env.
    const output = execFileSync(
      process.execPath,
      [tsx, cli, "--dry-run", "--repeats", "2", "--lsat-generation", "--output", outputPath],
      {
        cwd: directory,
        env: {
          ...process.env,
          OPENAI_API_KEY: "",
          OPENAI_MODEL: "dry-run-fixture",
          DOTENV_CONFIG_PATH: join(directory, ".env")
        },
        encoding: "utf8"
      }
    );
    expect(JSON.parse(output)).toMatchObject({
      status: "planned",
      maxLiveCalls: 18,
      reportPath: outputPath
    });
    const report = JSON.parse(await readFile(outputPath, "utf8"));
    expect(report.status).toBe("planned");
    expect(report.calls).toEqual([]);
    expect(report.results).toEqual([]);
    expect(report.prompts.lsat_generator.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.schemas.generatedLsat.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
    expect(() =>
      execFileSync(process.execPath, [tsx, cli, "--dry-run", "--output", outputPath], {
        cwd: directory,
        env: {
          ...process.env,
          OPENAI_API_KEY: "",
          OPENAI_MODEL: "dry-run-fixture",
          DOTENV_CONFIG_PATH: join(directory, ".env")
        },
        stdio: "pipe"
      })
    ).toThrow(); // Existing evidence must not be silently overwritten.
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
