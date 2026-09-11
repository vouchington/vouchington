import type { Context } from '@jongleberry/api-server'
import type { PrivateUser } from '@services/users/types'

const AUTH_SENSITIVE_VARY_HEADERS = ['Cookie', 'Authorization']

type HeaderValue = string | number | readonly string[]

export function setAnonymousPublicCacheHeaders(
  ctx: Context,
  currentUser: PrivateUser | null,
  maxAgeSeconds: number,
): void {
  if (currentUser) return

  ctx.set('Cache-Control', `public, max-age=${maxAgeSeconds}`)
  ctx.set('Vary', mergeAuthSensitiveVary(ctx.res.getHeader('Vary')))
}

function mergeAuthSensitiveVary(value: HeaderValue | undefined): string {
  const seen = new Set<string>()
  const values = Array.isArray(value) ? value : [value]
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
