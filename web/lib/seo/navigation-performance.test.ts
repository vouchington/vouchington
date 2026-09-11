import { describe, expect, it } from 'vitest'
import {
  getPreconnectOrigin,
  NO_VARY_SEARCH_HEADER,
  serializeSpeculationRules,
} from './navigation-performance'

describe('navigation performance helpers', () => {
  it('serializes conservative prefetch-only speculation rules', () => {
    const rules = JSON.parse(serializeSpeculationRules()) as {
      prefetch: Array<{
        eagerness: string
        expects_no_vary_search: string
        where: { and: Array<Record<string, unknown>> }
      }>
    }

    expect(rules.prefetch).toHaveLength(1)
    expect(rules.prefetch[0]?.eagerness).toBe('conservative')
    expect(rules.prefetch[0]?.expects_no_vary_search).toBe(NO_VARY_SEARCH_HEADER)
    expect(rules.prefetch[0]?.where.and).toContainEqual({ href_matches: '/*' })
    expect(rules.prefetch[0]?.where.and).toContainEqual({ not: { href_matches: '/api/*' } })
    expect(rules.prefetch[0]?.where.and).toContainEqual({ not: { href_matches: '/my/*' } })
    expect(rules.prefetch[0]?.where.and).toContainEqual({
      not: { selector_matches: 'a[data-no-speculation]' },
    })
    expect(rules).not.toHaveProperty('prerender')
  })

  it('normalizes absolute preconnect origins', () => {
    expect(getPreconnectOrigin('https://cdn.example.com/assets/app.js')).toBe(
      'https://cdn.example.com',
    )
    expect(getPreconnectOrigin(' http://localhost:3000/_next/static ')).toBe(
      'http://localhost:3000',
    )
  })

  it('rejects empty, relative, and non-http origins', () => {
    expect(getPreconnectOrigin(undefined)).toBeNull()
    expect(getPreconnectOrigin('/_next/static')).toBeNull()
    expect(getPreconnectOrigin('data:text/plain,hello')).toBeNull()
  })
})
