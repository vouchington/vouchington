import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALIZATION_BOUNDS } from '@vouchington/localization'
import { webSelectorsForPath } from '../localization-selectors'
import { ROUTE_SELECTORS, WEB_CHROME_SELECTOR } from '../route-selectors.generated.mts'

describe('webSelectorsForPath', () => {
  it('requests chrome and every route selector with route-local copy within the public bound', () => {
    for (const route of ROUTE_SELECTORS.filter(route => route.hasMembership)) {
      const pathname = route.pattern
      const selectors = webSelectorsForPath(pathname)
      expect(selectors).toContain(WEB_CHROME_SELECTOR)
      expect(selectors).toHaveLength(2)
      expect(selectors.length).toBeLessThanOrEqual(DEFAULT_LOCALIZATION_BOUNDS.maxSelectors)
      expect(selectors.every(selector => !selector.endsWith('.*'))).toBe(true)
    }
  })

  it('uses chrome alone for unknown routes', () => {
    expect(webSelectorsForPath('/missing-route')).toEqual([WEB_CHROME_SELECTOR])
  })

  it('does not request an exact selector for a known route without route-local copy', () => {
    const empty = ROUTE_SELECTORS.find(route => !route.hasMembership)
    expect(empty).toBeDefined()
    expect(webSelectorsForPath(empty!.pattern)).toEqual([WEB_CHROME_SELECTOR])
  })

  it('maps a public handle to the canonical landing route group', () => {
    const landing = ROUTE_SELECTORS.find(route => route.pattern === '/landing/[idOrUsername]')
    expect(landing).toBeDefined()
    expect(webSelectorsForPath('/@sample-handle')).toContain(landing!.selectorId)
  })

  it('uses distinct route groups for unrelated features', () => {
    const admin = webSelectorsForPath('/admin/ai-costs')
    const home = webSelectorsForPath('/')
    expect(admin[1]).not.toBe(home[1])
  })
})
