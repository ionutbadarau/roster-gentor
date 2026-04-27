import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  // Email confirmation links may land on the wrong path if the Supabase email
  // template points somewhere other than /auth/confirm. Forward the token to
  // the verify route so the OTP exchange still runs.
  const tokenHash = req.nextUrl.searchParams.get('token_hash')
  const otpType = req.nextUrl.searchParams.get('type')
  if (
    tokenHash &&
    otpType &&
    !req.nextUrl.pathname.startsWith('/auth/confirm')
  ) {
    const url = req.nextUrl.clone()
    url.pathname = '/auth/confirm'
    return NextResponse.redirect(url)
  }

  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll().map(({ name, value }) => ({
            name,
            value,
          }))
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            res.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Validate user server-side (getUser() hits Supabase Auth, unlike getSession())
  const { error } = await supabase.auth.getUser()

  if (error) {
    // Invalid/deleted user — clear session cookies and redirect to sign-in
    const isAuthPage = req.nextUrl.pathname.startsWith('/sign-in') ||
      req.nextUrl.pathname.startsWith('/sign-up') ||
      req.nextUrl.pathname.startsWith('/forgot-password') ||
      req.nextUrl.pathname.startsWith('/auth/')

    const isPublicPage = req.nextUrl.pathname === '/' ||
      req.nextUrl.pathname.startsWith('/contact') ||
      req.nextUrl.pathname.startsWith('/schedule/view')

    if (!isAuthPage && !isPublicPage) {
      const redirectUrl = req.nextUrl.clone()
      redirectUrl.pathname = '/sign-in'
      return NextResponse.redirect(redirectUrl)
    }
  }

  return res
}

// Ensure the middleware is only called for relevant paths
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api).*)',
  ],
}
