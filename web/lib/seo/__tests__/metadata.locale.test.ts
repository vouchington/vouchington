import { describe, expect, it } from 'vitest'
import { createPageMetadata } from '../metadata'

describe('createPageMetadata content language metadata', () => {
  it('maps contentLanguage into Open Graph locale metadata without changing canonical URLs', () => {
    const metadata = createPageMetadata({
      title: 'Analyse',
      path: '/review/analyse',
      contentLanguage: 'fr-CA',
    })

    expect(metadata.alternates?.canonical).toBe('/review/analyse')
    expect(metadata.openGraph).toMatchObject({
      locale: 'fr_CA',
      url: 'https://voucha.ai/review/analyse',
    })
  })

  it('omits Open Graph locale metadata for unsupported content languages', () => {
    const metadata = createPageMetadata({
      title: 'Unknown',
      contentLanguage: 'zz-US',
    })

    expect(metadata.openGraph).not.toHaveProperty('locale')
  })

  it('defaults to en_US when contentLanguage is omitted', () => {
    const metadata = createPageMetadata({
      title: 'Default',
    })

    expect(metadata.openGraph?.locale).toBe('en_US')
  })

  it('defaults to en_US when contentLanguage is null', () => {
    const metadata = createPageMetadata({
      title: 'Default',
      contentLanguage: null,
    })

    expect(metadata.openGraph?.locale).toBe('en_US')
  })
})
