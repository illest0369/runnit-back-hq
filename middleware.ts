import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, decodeSessionEdge } from "@/lib/auth-edge";

export function middleware(request: NextRequest) {
  const sessionValue = request.cookies.get(SESSION_COOKIE)?.value;
  const session = decodeSessionEdge(sessionValue);

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard.html", "/clip.html"],
};
