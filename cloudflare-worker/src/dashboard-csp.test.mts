import { describe, expect, it } from 'vitest'
import { buildDashboardCsp } from './csp.mts'

function parseDirectives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split('; ').map(directive => {
      const [name, ...values] = directive.split(' ')
      return [name!, values]
    }),
  )
}

describe('buildDashboardCsp', () => {
  it('permits the dashboard inline UI, same-origin fetch/SSE, and Google Fonts only where needed', () => {
    const directives = parseDirectives(buildDashboardCsp())

    expect(directives.get('script-src')).toEqual(["'self'", "'unsafe-inline'"])
    expect(directives.get('style-src')).toEqual([
      "'self'",
      "'unsafe-inline'",
      'https://fonts.googleapis.com',
    ])
    expect(directives.get('font-src')).toEqual(["'self'", 'https://fonts.gstatic.com'])
    expect(directives.get('connect-src')).toEqual(["'self'"])
    expect(directives.get('object-src')).toEqual(["'none'"])
    expect(directives.get('frame-ancestors')).toEqual(["'self'"])
  })
})
