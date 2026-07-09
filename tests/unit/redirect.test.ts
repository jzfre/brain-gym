import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/lib/redirect";

const ORIGIN = "https://braingym.aqui.technology";

describe("safeNextPath", () => {
  it("allows a same-origin relative path", () => {
    expect(safeNextPath("/history", ORIGIN)).toBe("/history");
    expect(safeNextPath("/today?tab=x#frag", ORIGIN)).toBe("/today?tab=x#frag");
  });

  it("defaults to /today when next is missing or empty", () => {
    expect(safeNextPath(null, ORIGIN)).toBe("/today");
    expect(safeNextPath("", ORIGIN)).toBe("/today");
  });

  it("blocks protocol-relative URLs", () => {
    expect(safeNextPath("//evil.com", ORIGIN)).toBe("/today");
  });

  it("blocks the backslash open-redirect bypass", () => {
    // Browsers normalize "\" to "/", turning this into a protocol-relative URL.
    expect(safeNextPath("/\\evil.com", ORIGIN)).toBe("/today");
    expect(safeNextPath("/\\/evil.com", ORIGIN)).toBe("/today");
  });

  it("blocks absolute off-origin URLs", () => {
    expect(safeNextPath("https://evil.com", ORIGIN)).toBe("/today");
    expect(safeNextPath("http://evil.com/x", ORIGIN)).toBe("/today");
  });

  it("blocks control characters and non-http schemes", () => {
    expect(safeNextPath("/foo\nbar", ORIGIN)).toBe("/today");
    expect(safeNextPath("javascript:alert(1)", ORIGIN)).toBe("/today");
  });
});
