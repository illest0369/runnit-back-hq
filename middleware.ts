import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, decodeSessionEdgeDetailed } from "@/lib/auth-edge";

export async function middleware(request: NextRequest) {
  const sessionValue = request.cookies.get(SESSION_COOKIE)?.value;
  const result = await decodeSessionEdgeDetailed(sessionValue);

  if (!result.ok) {
    if (result.reason === "expired") {
      console.info("RBHQ_AUTH_AUDIT", JSON.stringify({
        event: "expired_session",
        at: new Date().toISOString(),
        route: request.nextUrl.pathname,
      }));
    } else if (result.reason !== "missing") {
      console.info("RBHQ_AUTH_AUDIT", JSON.stringify({
        event: "invalid_cookie",
        at: new Date().toISOString(),
        route: request.nextUrl.pathname,
        reason: result.reason,
      }));
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/clip/:path*",
    "/intake/:path*",
    "/queue/:path*",
    "/publish/:path*",
    "/performance/:path*",
    // Keep legacy HTML routes protected too
    "/dashboard.html",
    "/clip.html",
  ],
};
