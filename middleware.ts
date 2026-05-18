import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionTokenFor, timingSafeEqualStr } from "@/lib/auth";

const PUBLIC_PREFIXES = ["/login", "/api/auth/login", "/api/auth/logout"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value ?? "";
  const password = process.env.APP_PASSWORD ?? "";
  const expected = password ? await sessionTokenFor(password) : "";
  if (!expected || !timingSafeEqualStr(cookie, expected)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next.js internals + static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)).*)"]
};
