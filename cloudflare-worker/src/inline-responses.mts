import { buildApiCatalogLinkset } from './api-catalog.mts'
import { edgeErrorResponse } from './error-response.mts'
import { isGeoBlocked, parseBlockedCountries } from './geo-block.mts'
import { generateRobotsTxt } from './robots-txt.mts'
import {
  buildAgentCard,
  buildAgentSkills,
  buildLlmsFullTxt,
  buildLlmsTxt,
  buildSecurityTxt,
  buildTrafficAdvice,
} from './specification-documents.mts'
import {
  DEV_HMR_WEBSOCKET_PATH,
  handleWebSocket,
  isDevHmrWebSocketProxyAllowed,
} from './websocket.mts'
import type { Env } from './types.mts'

export function isStaticInlineResponsePath(pathname: string): boolean {
  return (
    pathname === '/robots.txt' ||
    pathname === '/llms.txt' ||
    pathname === '/llms-full.txt' ||
    pathname === '/.well-known/security.txt' ||
    pathname === '/.well-known/api-catalog' ||
    pathname === '/.well-known/traffic-advice' ||
    pathname === '/.well-known/agent-card.json' ||
    pathname === '/.well-known/agent-skills.json'
  )
}

export function getGeoBlockedResponse(request: Request, env: Env): Response | null {
  const blockedCountries = parseBlockedCountries(env.GEO_BLOCKED_COUNTRIES)
  if (isGeoBlocked(request.headers, blockedCountries)) {
    return edgeErrorResponse(403, 'Access denied', 'FORBIDDEN')
  }
  return null
}

export function getStaticInlineResponse(url: URL, env: Env): Response | null {
  const pathname = url.pathname
  if (pathname === '/robots.txt') {
    const siteOrigin = env.SITE_ORIGIN ?? 'https://voucha.ai'
    const noIndex = env.NOINDEX?.toLowerCase() === 'true'
    return new Response(generateRobotsTxt(siteOrigin, { noIndex }), {
      headers: { 'content-type': 'text/plain' },
    })
  }

  if (pathname === '/llms.txt') {
    return new Response(buildLlmsTxt(env), {
      headers: { 'content-type': 'text/markdown; charset=utf-8' },
    })
  }

  if (pathname === '/llms-full.txt') {
    return new Response(buildLlmsFullTxt(env), {
      headers: { 'content-type': 'text/markdown; charset=utf-8' },
    })
  }

  if (pathname === '/.well-known/security.txt') {
    return new Response(buildSecurityTxt(env), {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  if (pathname === '/.well-known/api-catalog') {
    return new Response(JSON.stringify(buildApiCatalogLinkset(env)), {
      headers: { 'content-type': 'application/linkset+json; charset=utf-8' },
    })
  }

  if (pathname === '/.well-known/traffic-advice') {
    return new Response(buildTrafficAdvice(env), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  if (pathname === '/.well-known/agent-card.json') {
    return new Response(buildAgentCard(env), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  if (pathname === '/.well-known/agent-skills.json') {
    return new Response(buildAgentSkills(env), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  return null
}

export async function handleWebSocketRequest(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return null
  }
  if (url.pathname !== DEV_HMR_WEBSOCKET_PATH || !isDevHmrWebSocketProxyAllowed(env)) {
    return edgeErrorResponse(
      400,
      'WebSocket proxy is disabled outside local development HMR',
      'INVALID_INPUT',
    )
  }
  return await handleWebSocket(request, url, env)
}
