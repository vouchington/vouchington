import { describe, expect, it } from 'vitest'
import { catalogFromLocalizationBatch } from '../catalog-from-batch'
import { WEB_LOCALIZATION_PATH, webLocalizationSearchParams } from '../localization-query'
import { webSelectorsForPath } from '../localization-selectors'

describe('localization query', () => {
  it('asks the public API for chrome plus the current route, not every shard', () => {
    expect(WEB_LOCALIZATION_PATH).toBe('/api/v1/localization')
    expect(webLocalizationSearchParams('es')).toEqual({
      consumer: 'web',
      locales: 'es',
      selectors: webSelectorsForPath('/').join(','),
    })
    expect(webLocalizationSearchParams('es').selectors).not.toContain('extracted.*')
    expect(webLocalizationSearchParams('de').locales).toBe('en')
  })
})

describe('catalogFromLocalizationBatch', () => {
  it('nests API leaves into the translator tree', () => {
    expect(
      catalogFromLocalizationBatch({
        contract: 'v1',
        revision: 'abc',
        ttlSeconds: 60,
        messages: { 'nav.home': 'Inicio' },
      }),
    ).toEqual({ nav: { home: 'Inicio' } })
  })
})
