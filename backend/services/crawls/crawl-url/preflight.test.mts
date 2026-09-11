import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('crawl-url primary-read routing', () => {
  it('rechecks a missing crawl URL on the primary before completing leftover jobs', () => {
    const source = readFileSync(new URL('./preflight.mts', import.meta.url), 'utf8')
    expect(source).toContain(
      '(await getUrlById(urlId)) ?? (await getUrlById(urlId, { readOnly: false }))',
    )
    expect(source).toContain(
      'getUrlHostnameCrawlerDetailsById(url.hostname.id, { readOnly: false })',
    )
  })
})
