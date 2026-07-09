import { NextResponse } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  issueSessionToken,
  passwordMatches
} from "@/lib/auth";

export const runtime = "nodejs";

const Body = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const cfg = getConfig();

  if (!(await passwordMatches(parsed.data.password, cfg.appPassword))) {
    return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  }

  const token = await issueSessionToken(cfg.sessionSecret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
    secure: process.env.NODE_ENV === "production"
  });
  return res;
}
