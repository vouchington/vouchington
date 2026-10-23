import { getSessionRenewalNext, SESSION_RENEWAL_PATH } from '@/lib/auth/session-renewal-url'
import { NextResponse, type NextRequest, after } from 'next/server'
import { isbot } from 'isbot'
import { decodeSessionJwt, decodeDeviceJwt } from '@ts-shared/session-jwt'
import { isBackendPath, shouldBypassProxyPath } from '@/lib/utils/routes'
import { safeFeatureFlagCookiePart } from '@/lib/feature-flags/shared'
import { recordProxyReferralAttribution, getProxyClientHeaders } from '@/lib/api/server/proxy'
import { tagPostDetailCacheFill } from '@/lib/api/server/post-detail-cache-tags'
import { LANDING_PAGE_HANDLE_RE } from '@/lib/utils/path'
import { hasGlobalPrivacyControlHeader } from '@/lib/privacy/global-privacy-control'
import { VOUCHA_BOT_SCORE_HEADER } from '@ts-shared/utils/bot-challenge'

async function proxy(request: NextRequest) {
  const backendUrl =
    process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:2900'
  const isBotRequest = isbot(request.headers.get('user-agent'))
  // Skip Next internals and static assets entirely to avoid extra session validation.
  if (shouldBypassProxyPath(request.nextUrl.pathname)) {
    return NextResponse.next()
  }

  // Check for referrer param early so we can create a session for anonymous visitors
  const routeLandingUsername = request.nextUrl.pathname.match(LANDING_PAGE_HANDLE_RE)?.[1] ?? null
  const routeLandingSlug = routeLandingUsername
    ? (request.nextUrl.pathname.split('/').filter(Boolean)[1] ?? null)
    : null
  const referrer = routeLandingUsername ?? request.nextUrl.searchParams.get('referrer')

  const dt = request.cookies.get('dt')?.value
  const st = request.cookies.get('st')?.value

  const isPageRequest = !isBackendPath(request.nextUrl.pathname)

  // Decode only to decide whether to request backend refresh; this does not authorize a user.
  const stPayload = st ? decodeSessionJwt(st) : null
  const refreshIdentity = dt ? decodeDeviceJwt(dt) : null
  const isAuthenticated =
    !isBotRequest &&
    ((typeof stPayload?.uid === 'string' && stPayload.uid.length > 0) ||
      (refreshIdentity?.client === 'web' && typeof refreshIdentity.refresh_uid === 'string'))
  const accessExpired =
    !stPayload ||
    typeof stPayload.exp !== 'number' ||
    Math.floor(Date.now() / 1000) >= stPayload.exp
  const isRenewalOrLogin = [SESSION_RENEWAL_PATH, '/login'].includes(
    request.nextUrl.pathname.replace(/\/+$/u, ''),
  )
  if (
    isAuthenticated &&
    accessExpired &&
    isPageRequest &&
    !isRenewalOrLogin &&
    ['GET', 'HEAD'].includes(request.method)
  ) {
    // Prefetch must not rotate cookies or cache a login/renewal redirect for a later navigation.
    if (
      request.headers.get('next-router-prefetch') === '1' ||
      request.headers.get('purpose') === 'prefetch'
    )
      return new NextResponse(null, { status: 204 })
    const destination = new URL(SESSION_RENEWAL_PATH, request.nextUrl.toString())
    const currentUrl = new URL(request.nextUrl.toString())
    destination.searchParams.set(
      'next',
      getSessionRenewalNext(`${currentUrl.pathname}${currentUrl.search}`),
    )
    return NextResponse.redirect(destination)
  }

  // SSR forwards only still-valid access credentials; renewal is serialized in the browser.
  const hasStructurallyValidInboundSession = Boolean(dt && st && stPayload && !accessExpired)
  const sessionDt = hasStructurallyValidInboundSession ? dt : undefined
  const sessionSt = hasStructurallyValidInboundSession ? st : undefined

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
        getProxyClientHeaders(request),
      ).catch(err => {
        /* c8 ignore next -- attribution error handler; injecting network failure requires mocking */
        console.error('Attribution request failed:', err)
      }),
    )
  }

  // Strip auth headers unconditionally so clients cannot inject them.
  // They are re-set below only when the session is valid.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete('x-voucha-client-ja4')
  requestHeaders.delete('x-user-id')
  requestHeaders.delete('x-device-token')
  requestHeaders.delete('x-session-token')
  requestHeaders.delete(VOUCHA_BOT_SCORE_HEADER)
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

  await tagPostDetailCacheFill(response, request, backendUrl, getProxyClientHeaders(request))

  return response
}

export default proxy
