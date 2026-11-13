import type { Context } from '@jongleberry/api-server'
import type { PrivateUser } from '@services/users/types'

const AUTH_SENSITIVE_VARY_HEADERS = ['Cookie', 'Authorization']

type HeaderValue = string | number | readonly string[]

/** Prevent browsers and the Cloudflare edge from retaining private responses. */
export function setPrivateNoStoreCacheHeaders(ctx: Context): void {
  ctx.set('Cache-Control', 'private, no-store')
}

/** Mark a response as public while preserving auth-sensitive Vary members. */
export function setPublicCacheHeaders(ctx: Context): void {
  ctx.set('Cache-Control', 'public')
  ctx.set('Vary', mergeAuthSensitiveVary(ctx.res.getHeader('Vary')))
}

export function setAnonymousPublicCacheHeaders(
  ctx: Context,
  currentUser: PrivateUser | null,
): void {
  if (currentUser) {
    setPrivateNoStoreCacheHeaders(ctx)
    return
  }

  ctx.set('Cache-Control', 'public')
  ctx.set('Vary', mergeAuthSensitiveVary(ctx.res.getHeader('Vary')))
}

function mergeAuthSensitiveVary(value: HeaderValue | undefined): string {
  const seen = new Set<string>()
  const values: readonly (string | number | undefined)[] = Array.isArray(value) ? value : [value]
  for (const rawValue of values) {
    if (addVaryHeaders(rawValue, seen) === '*') return '*'
  }
  for (const header of AUTH_SENSITIVE_VARY_HEADERS) {
    seen.add(header)
  }
  return [...seen].join(', ')
}

function addVaryHeaders(rawValue: string | number | undefined, seen: Set<string>): '*' | void {
  if (rawValue === undefined) return
  for (const value of String(rawValue).split(',')) {
    const header = value.trim()
    if (header === '*') return '*'
    if (header) seen.add(header)
  }
}
