import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_SEC, verifySessionToken } from "@/lib/auth";

const PUBLIC_PREFIXES = ["/login", "/api/auth/login", "/api/auth/logout"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Expose the path to server components so the layout can decide whether to
  // show app chrome from the URL itself, rather than re-deriving auth (which a
  // cached/proxied response could get wrong for a logged-in user).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  const pass = NextResponse.next({ request: { headers: requestHeaders } });

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return pass;
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value ?? "";
  const secret = process.env.SESSION_SECRET ?? "";
  const ok = secret !== "" && (await verifySessionToken(cookie, secret, SESSION_MAX_AGE_SEC));
  if (!ok) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(loginUrl);
  }

  return pass;
}

export const config = {
  // Skip Next.js internals + static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)).*)"]
};
