import { describe, it, expect } from "vitest";
import {
  issueSessionToken,
  verifySessionToken,
  passwordMatches,
  timingSafeEqualStr
} from "@/lib/auth";

const SECRET = "test-secret-at-least-32-chars-long-abcdef";
const OTHER_SECRET = "another-secret-also-32-chars-long-xyz123";
const NOW = 1_700_000_000_000; // fixed epoch ms

describe("timingSafeEqualStr", () => {
  it("is true only for identical strings", () => {
    expect(timingSafeEqualStr("abc", "abc")).toBe(true);
    expect(timingSafeEqualStr("abc", "abd")).toBe(false);
    expect(timingSafeEqualStr("abc", "abcd")).toBe(false);
  });
});

describe("passwordMatches", () => {
  it("accepts the correct password and rejects a wrong one", async () => {
    expect(await passwordMatches("hunter2", "hunter2")).toBe(true);
    expect(await passwordMatches("wrong", "hunter2")).toBe(false);
  });
});

describe("session token", () => {
  it("issues a token that verifies with the same secret", async () => {
    const token = await issueSessionToken(SECRET, NOW);
    expect(await verifySessionToken(token, SECRET, 3600, NOW)).toBe(true);
  });

  it("does not embed the password (payload is only a timestamp)", async () => {
    const token = await issueSessionToken(SECRET, NOW);
    const [issuedAt] = token.split(".");
    expect(issuedAt).toBe(String(Math.floor(NOW / 1000)));
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await issueSessionToken(SECRET, NOW);
    expect(await verifySessionToken(token, OTHER_SECRET, 3600, NOW)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const token = await issueSessionToken(SECRET, NOW);
    const issuedAt = token.split(".")[0];
    expect(await verifySessionToken(`${issuedAt}.deadbeef`, SECRET, 3600, NOW)).toBe(false);
  });

  it("rejects a forged issuedAt with a stale signature", async () => {
    const token = await issueSessionToken(SECRET, NOW);
    const sig = token.split(".")[1];
    expect(await verifySessionToken(`9999999999.${sig}`, SECRET, 3600, NOW)).toBe(false);
  });

  it("rejects an expired token", async () => {
    const token = await issueSessionToken(SECRET, NOW);
    const later = NOW + 3601 * 1000;
    expect(await verifySessionToken(token, SECRET, 3600, later)).toBe(false);
  });

  it("accepts a token within its max age", async () => {
    const token = await issueSessionToken(SECRET, NOW);
    const later = NOW + 3599 * 1000;
    expect(await verifySessionToken(token, SECRET, 3600, later)).toBe(true);
  });

  it("rejects malformed tokens", async () => {
    expect(await verifySessionToken("", SECRET, 3600, NOW)).toBe(false);
    expect(await verifySessionToken("nodot", SECRET, 3600, NOW)).toBe(false);
    expect(await verifySessionToken(".sig", SECRET, 3600, NOW)).toBe(false);
    expect(await verifySessionToken("abc.sig", SECRET, 3600, NOW)).toBe(false);
  });
});
