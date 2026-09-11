import { NextResponse, type NextRequest, after } from 'next/server'
import { isbot } from 'isbot'
import { decodeSessionJwt } from '@ts-shared/session-jwt'
import { isBackendPath, shouldBypassProxyPath } from '@/lib/utils/routes'
import { safeFeatureFlagCookiePart } from '@/lib/feature-flags/shared'
import { recordProxyReferralAttribution, refreshProxySession } from '@/lib/api/server/proxy'
import { LANDING_PAGE_HANDLE_RE } from '@/lib/utils/path'
import { hasGlobalPrivacyControlHeader } from '@/lib/privacy/global-privacy-control'

function getLandingPageUsername(pathname: string): string | null {
  const match = pathname.match(LANDING_PAGE_HANDLE_RE)
  return match?.[1] ?? null
}

function getForwardedIpHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {}
  const forwardedFor = request.headers.get('x-forwarded-for')
  const cfConnectingIp = request.headers.get('cf-connecting-ip')
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor
  if (cfConnectingIp) headers['cf-connecting-ip'] = cfConnectingIp
  return headers
}

function shouldRefreshSession(stPayload: ReturnType<typeof decodeSessionJwt>): boolean {
  if (!stPayload || typeof stPayload.sca !== 'number') return true
  return Math.floor(Date.now() / 1000) >= stPayload.sca
}

async function proxy(request: NextRequest) {
  const backendUrl =
    process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:2900'
  const isBotRequest = isbot(request.headers.get('user-agent'))
  // Skip Next internals and static assets entirely to avoid extra session validation.
  if (shouldBypassProxyPath(request.nextUrl.pathname)) {
    return NextResponse.next()
  }

  // Check for referrer param early so we can create a session for anonymous visitors
  const routeLandingUsername = getLandingPageUsername(request.nextUrl.pathname)
  const routeLandingSlug = routeLandingUsername
    ? (request.nextUrl.pathname.split('/').filter(Boolean)[1] ?? null)
    : null
  const referrer = routeLandingUsername ?? request.nextUrl.searchParams.get('referrer')

  const dt = request.cookies.get('dt')?.value
  const st = request.cookies.get('st')?.value

  const isPageRequest = !isBackendPath(request.nextUrl.pathname)

  // Decode st (without re-verification — the Cloudflare Worker already verified it)
  // to determine whether this is an authenticated or anonymous session.
  const stPayload = st ? decodeSessionJwt(st) : null
  const isAuthenticated =
    !isBotRequest && typeof stPayload?.uid === 'string' && stPayload.uid.length > 0
  const shouldRefreshAuthenticatedSession = isAuthenticated && shouldRefreshSession(stPayload)

  let sessionData: {
    uid?: string | null
    dt?: string
    st?: string
    dte: number
    ste: number
    secure: boolean
  } | null = null

  // Authenticated path: call the backend only when the session freshness window
  // requires a warm/cold refresh. Hot sessions keep using the edge-verified
  // inbound cookies, avoiding a backend hit on every page request.
  // Anonymous visitors are handled at the edge by the Cloudflare Worker — no backend call.
  if (shouldRefreshAuthenticatedSession) {
    try {
      sessionData = await refreshProxySession(
        backendUrl,
        { dt, st },
        getForwardedIpHeaders(request),
      )
    } catch (error) {
      // Session validation error - continue without session
      console.error('Session validation failed:', error)
    }
  }

  // When a refresh is due, only use backend-verified tokens. While the session
  // is still hot, use the inbound cookies that the Cloudflare Worker verified.
  // For anonymous sessions, use inbound cookies only if the session token decodes
  // to the expected payload shape; malformed cookies are dropped instead of
  // being forwarded to the app.
  const hasStructurallyValidInboundSession = Boolean(dt && st && stPayload)
  const sessionDt = shouldRefreshAuthenticatedSession
    ? sessionData?.dt
    : hasStructurallyValidInboundSession
      ? dt
      : undefined
  const sessionSt = shouldRefreshAuthenticatedSession
    ? sessionData?.st
    : hasStructurallyValidInboundSession
      ? st
      : undefined

  // Record referral attribution after the response is sent. after() extends the edge
  // runtime lifetime so the promise isn't dropped before it resolves.
  if (
    !hasGlobalPrivacyControlHeader(request.headers) &&
    !isBotRequest &&
    isPageRequest &&
    referrer &&
    sessionDt &&
    sessionSt
  ) {
    const landingUrl = request.nextUrl.toString()
    const utmSource =
      request.nextUrl.searchParams.get('utm_source') ?? request.nextUrl.searchParams.get('ref')
    const utmMedium = request.nextUrl.searchParams.get('utm_medium')
    const utmCampaign = request.nextUrl.searchParams.get('utm_campaign')
    const utmContent = request.nextUrl.searchParams.get('utm_content')
    const utm =
      utmSource || utmMedium || utmCampaign || utmContent
        ? {
            utm_source: utmSource,
            utm_medium: utmMedium,
            utm_campaign: utmCampaign,
            utm_content: utmContent,
          }
        : undefined
    after(() =>
      recordProxyReferralAttribution(
        backendUrl,
        { referrer, landing_url: landingUrl, ...(utm ? { utm } : {}) },
        { dt: sessionDt, st: sessionSt },
        getForwardedIpHeaders(request),
      ).catch(error => {
        /* c8 ignore next -- attribution error handler; injecting network failure requires mocking */
        console.error('Attribution request failed:', error)
      }),
    )
  }

  // Strip auth headers unconditionally so clients cannot inject them.
  // They are re-set below only when the session is valid.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete('x-user-id')
  requestHeaders.delete('x-device-token')
  requestHeaders.delete('x-session-token')
  requestHeaders.delete('cookie')
  requestHeaders.set('x-pathname', request.nextUrl.pathname)
  requestHeaders.set('x-search', request.nextUrl.searchParams.toString())

  // Forward ff cookie unconditionally so feature flag overrides work for anonymous visitors
  const ffPart = safeFeatureFlagCookiePart(request.cookies.get('ff')?.value)

  // Set only the sanitized session cookies on the forwarded request.
  // Bot requests are excluded: bots don't need session auth and should not carry cookies
  // through this layer (avoids bypassing the session refresh cycle via spoofed UA).
  if (!isBotRequest && sessionDt && sessionSt) {
    // Intentionally replaces the entire Cookie header. Browser session auth is cookie-based;
    // other browser cookies are irrelevant to the backend.
    const cookieParts = [`dt=${sessionDt}`, `st=${sessionSt}`]
    if (ffPart) cookieParts.push(ffPart)
    requestHeaders.set('cookie', cookieParts.join('; '))
  } else if (ffPart) {
    requestHeaders.set('cookie', ffPart)
  }

  const rewriteUrl = routeLandingUsername ? new URL(request.nextUrl.toString()) : null
  if (rewriteUrl) {
    rewriteUrl.pathname = routeLandingSlug
      ? `/landing/${routeLandingUsername}/${routeLandingSlug}`
      : `/landing/${routeLandingUsername}`
  }

  const response = rewriteUrl
    ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } })

  // Set validated session cookies for authenticated sessions refreshed by the backend.
  // Anonymous sessions are handled by the Cloudflare Worker (Set-Cookie already sent).
  if (sessionData?.dt && sessionData?.st) {
    response.cookies.set('dt', sessionData.dt, {
      httpOnly: true,
      secure: sessionData.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: sessionData.dte,
    })
    response.cookies.set('st', sessionData.st, {
      httpOnly: true,
      secure: sessionData.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: sessionData.ste,
    })
  }

  return response
}

export default proxy
