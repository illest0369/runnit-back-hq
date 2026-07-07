import { NextRequest, NextResponse } from 'next/server'
import { readSessionCookie, SESSION_COOKIE } from './lib/auth-shared'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const session = await readSessionCookie(req.cookies.get(SESSION_COOKIE)?.value)

  if (pathname === '/lock') {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const protectedPaths = [
    '/',
    '/queue',
    '/engage',
    '/settings',
    '/dashboard',
    '/comments',
    '/history',
    '/sources',
    '/pipeline',
    '/review',
    '/metricool',
    '/publish',
  ]

  if (protectedPaths.some((protectedPath) => pathname === protectedPath || pathname.startsWith(`${protectedPath}/`))) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    if (pathname === '/dashboard') {
      return NextResponse.redirect(new URL('/', req.url))
    }

    if (pathname === '/review') {
      return NextResponse.redirect(new URL('/queue', req.url))
    }
  }

  // Protect /admin/* - admin role only
  if (pathname.startsWith('/admin')) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    if (session.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }

  // Redirect logged-in users away from /login
  if (pathname === '/login' && session) {
    return NextResponse.redirect(new URL('/queue', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/lock',
    '/login',
    '/queue/:path*',
    '/engage/:path*',
    '/settings/:path*',
    '/dashboard/:path*',
    '/comments/:path*',
    '/history/:path*',
    '/sources/:path*',
    '/admin/:path*',
    '/pipeline/:path*',
    '/review/:path*',
    '/metricool/:path*',
    '/publish/:path*',
  ],
}
