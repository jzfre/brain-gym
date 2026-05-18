import { NextResponse } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { SESSION_COOKIE, sessionTokenFor, timingSafeEqualStr } from "@/lib/auth";

export const runtime = "nodejs";

const Body = z.object({ password: z.string().min(1) });

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const cfg = getConfig();

  const submitted = await sessionTokenFor(parsed.data.password);
  const expected = await sessionTokenFor(cfg.appPassword);
  if (!timingSafeEqualStr(submitted, expected)) {
    return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: expected,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
    secure: process.env.NODE_ENV === "production"
  });
  return res;
}
