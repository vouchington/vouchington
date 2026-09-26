import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getRouteConfig, ROUTE_REGISTRY } from './config.mts'

type DiscoveredRoute = {
  file: string
  hasRateLimitReference: boolean
  routeId: string
}

type VoteRoute = {
  file: string
  routeId: string
}

const REPO_ROOT = join(import.meta.dirname, '../../..')
const API_V1_ROUTE_DIR = 'backend/api/v1'
const API_ROUTE_DIRS = [API_V1_ROUTE_DIR, 'backend/api/oauth']
const AUTH_ROUTE_DIRS = ['backend/api/v1/auth', 'backend/api/v1/sessions-authentication']
const AUTH_RATE_LIMIT_EXEMPTIONS = new Set(['POST:/api/v1/auth/logout'])
const AUTH_OR_SESSION_ROUTE_ID = /^[A-Z]+:\/api\/v1\/(?:auth|session)(?:\/|$)/

function getSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return getSourceFiles(path)
    return entry.isFile() && path.endsWith('.mts') && !path.endsWith('.test.mts') ? [path] : []
  })
}

function getAuthRoutes(): DiscoveredRoute[] {
  return AUTH_ROUTE_DIRS.flatMap(dir =>
    getSourceFiles(join(REPO_ROOT, dir)).flatMap(file => extractApiRoutes(file)),
  )
}

function getApiRoutes(): DiscoveredRoute[] {
  return API_ROUTE_DIRS.flatMap(dir =>
    getSourceFiles(join(REPO_ROOT, dir)).flatMap(file => extractApiRoutes(file)),
  )
}

function getVoteRoutes(): VoteRoute[] {
  return getSourceFiles(join(REPO_ROOT, API_V1_ROUTE_DIR)).flatMap(file => extractVoteRoutes(file))
}

function extractApiRoutes(file: string): DiscoveredRoute[] {
  const source = readFileSync(file, 'utf8')
  const routePattern = /app\s*\.\s*route\(['`]([^'`]+)['`]\)/g
  const starts = [...source.matchAll(routePattern)]

  return starts.flatMap((match, index) => {
    const route = match[1]!
    const blockStart = match.index ?? 0
    const blockEnd = starts[index + 1]?.index ?? source.length
    const block = source.slice(blockStart, blockEnd)
    const methods = [...block.matchAll(/(?:\)\s*|\n\s*)\.(get|post|put|patch|delete)\(/g)].map(
      method => method[1]!.toUpperCase(),
    )
    const referencedRouteIds = new Set(
      [...block.matchAll(/[A-Z]+:\/(?:api\/v1\/)?[\w/:.-]+/g)].map(
        routeIdMatch => routeIdMatch[0]!,
      ),
    )

    return methods.map(method => {
      const routeId = `${method}:${route}`
      return {
        file: relative(REPO_ROOT, file),
        hasRateLimitReference: referencedRouteIds.has(routeId),
        routeId,
      }
    })
  })
}

function extractVoteRoutes(file: string): VoteRoute[] {
  const source = readFileSync(file, 'utf8')
  if (!source.includes('createVoteHandler')) return []

  return [...source.matchAll(/routeKey:\s*['`]([^'`]+)['`]/g)].map(match => ({
    file: relative(REPO_ROOT, file),
    routeId: match[1]!,
  }))
}

describe('route rate-limit registry', () => {
  it('classifies authorization-server routes as sensitive', () => {
    const routes = [
      'GET:/authorize',
      'POST:/register',
      'POST:/token',
      'POST:/revoke',
      'GET:/api/v1/oauth/authorization-requests/:id',
      'POST:/api/v1/oauth/authorization-requests/:id/decisions',
    ]

    for (const route of routes) {
      expect(getRouteConfig(route).category).toBe('sensitive')
    }
  })

  it('classifies OAuth completion polling as read traffic', () => {
    expect(getRouteConfig('POST:/api/v1/auth/oauth/authorizations/:flowId/complete')).toEqual({
      category: 'read',
    })
  })

  it('allows mailbox-provider bursts on signed one-click unsubscribe requests', () => {
    expect(getRouteConfig('POST:/api/v1/email-unsubscribe')).toEqual({
      category: 'write',
      multiplier: 1000,
    })
  })

  const apiRoutes = getApiRoutes()
  const authRoutes = getAuthRoutes()
  const voteRoutes = getVoteRoutes()

  it('classifies MFA and re-auth verification routes as sensitive', () => {
    const routes = [
      'POST:/api/v1/auth/mfa/totp/verification',
      'POST:/api/v1/auth/mfa/passkeys/authentication/options',
      'POST:/api/v1/auth/mfa/passkeys/authentication/verification',
      'POST:/api/v1/auth/mfa/re-auth/email/tokens',
      'POST:/api/v1/auth/mfa/re-auth/email/verification',
      'POST:/api/v1/auth/mfa/re-auth/totp/verification',
      'POST:/api/v1/auth/mfa/re-auth/tokens/verification',
    ]

    for (const route of routes) {
      expect(getRouteConfig(route).category).toBe('sensitive')
    }
  })

  it('classifies discoverable passkey sign-in routes as sensitive', () => {
    const routes = [
      'POST:/api/v1/auth/passkeys/authentication/options',
      'POST:/api/v1/auth/passkeys/authentication/verify',
    ]

    for (const route of routes) {
      expect(getRouteConfig(route).category).toBe('sensitive')
    }
  })

  it('keeps email OTP login route rate limit aligned with its verifier threshold', () => {
    expect(getRouteConfig('POST:/api/v1/auth/email-address/login')).toEqual({
      category: 'sensitive',
      multiplier: 2,
    })
  })

  it('classifies credential management routes as sensitive', () => {
    const routes = [
      'POST:/api/v1/auth/totp',
      'POST:/api/v1/auth/totp/setup/verification',
      'PATCH:/api/v1/auth/totp/:id',
      'DELETE:/api/v1/auth/totp/:id',
      'PATCH:/api/v1/auth/passkeys/:id',
      'DELETE:/api/v1/auth/passkeys/:id',
      'DELETE:/api/v1/auth/sessions/:id',
      'POST:/api/v1/auth/sessions/revocations',
      'POST:/api/v1/my/api-keys',
      'DELETE:/api/v1/my/api-keys/:id',
      'POST:/api/v1/my/oauth-apps',
      'PATCH:/api/v1/my/oauth-apps/:id',
      'DELETE:/api/v1/my/oauth-apps/:id',
      'POST:/api/v1/my/oauth-apps/:id/client-secrets',
      'DELETE:/api/v1/my/oauth-grants/:id',
    ]

    for (const route of routes) {
      expect(getRouteConfig(route).category).toBe('sensitive')
    }
  })

  it('classifies membership purchase and verification mutations as sensitive', () => {
    const routes = [
      'POST:/api/v1/membership-purchase-intents',
      'POST:/api/v1/membership-verifications',
      'POST:/api/v1/memberships/microsoft-store/service-tickets',
      'POST:/api/v1/memberships/billing-portal-sessions',
    ]

    for (const route of routes) {
      expect(getRouteConfig(route).category).toBe('sensitive')
    }
  })

  it('classifies read-only own-state status endpoints as read', () => {
    const routes = [
      'GET:/api/v1/auth/me',
      'GET:/api/v1/auth/mfa/status',
      'GET:/api/v1/auth/passkeys',
      'GET:/api/v1/auth/sessions',
      'GET:/api/v1/auth/totp',
      'GET:/api/v1/my/identity-verification',
    ]

    for (const route of routes) {
      expect(getRouteConfig(route).category).toBe('read')
    }
  })

  it('keeps auth and session routes covered by rate limiting or an explicit exemption', () => {
    const missingRateLimits: string[] = []
    for (const route of authRoutes) {
      if (AUTH_RATE_LIMIT_EXEMPTIONS.has(route.routeId)) continue
      if (route.hasRateLimitReference) continue
      missingRateLimits.push(`${route.file}: ${route.routeId}`)
    }

    expect(missingRateLimits).toEqual([])
  })

  it('keeps every route registry entry exact and non-stale', () => {
    const routeIds = new Set(apiRoutes.map(route => route.routeId))
    const missingApiRoutes: string[] = []
    const missingRateLimitReferences: string[] = []

    for (const routeId of Object.keys(ROUTE_REGISTRY)) {
      if (!routeIds.has(routeId)) {
        missingApiRoutes.push(routeId)
        continue
      }

      const route = apiRoutes.find(apiRoute => apiRoute.routeId === routeId)
      if (!route?.hasRateLimitReference) {
        missingRateLimitReferences.push(`${route?.file ?? 'unknown'}: ${routeId}`)
      }
    }

    expect(missingApiRoutes).toEqual([])
    expect(missingRateLimitReferences).toEqual([])
  })

  it('keeps auth and session route registry entries exact and non-stale', () => {
    const routeIds = new Set(authRoutes.map(route => route.routeId))
    const missingRegistryEntries: string[] = []
    for (const routeId of routeIds) {
      if (AUTH_RATE_LIMIT_EXEMPTIONS.has(routeId)) continue
      if (routeId in ROUTE_REGISTRY) continue
      missingRegistryEntries.push(routeId)
    }

    const staleRegistryEntries: string[] = []
    for (const routeId of Object.keys(ROUTE_REGISTRY)) {
      if (!AUTH_OR_SESSION_ROUTE_ID.test(routeId)) continue
      if (routeIds.has(routeId)) continue
      staleRegistryEntries.push(routeId)
    }

    expect(missingRegistryEntries).toEqual([])
    expect(staleRegistryEntries).toEqual([])
  })

  it('keeps vote handler route keys registered with the vote multiplier', () => {
    const missingRegistryEntries: string[] = []
    const nonVoteEntries: string[] = []

    for (const route of voteRoutes) {
      const entry = ROUTE_REGISTRY[route.routeId]
      if (!entry) {
        missingRegistryEntries.push(`${route.file}: ${route.routeId}`)
        continue
      }

      if (entry.category !== 'write' || entry.multiplier !== 0.5) {
        nonVoteEntries.push(`${route.file}: ${route.routeId}`)
      }
    }

    expect(missingRegistryEntries).toEqual([])
    expect(nonVoteEntries).toEqual([])
  })
})
