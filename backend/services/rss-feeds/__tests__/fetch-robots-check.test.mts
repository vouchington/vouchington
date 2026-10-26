import { describe, expect, it } from 'vitest'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { checkRssFeedCrawlable } from '../fetch-robots-check.mts'

describe('checkRssFeedCrawlable', () => {
  it('returns false when isUrlCrawlable throws', async () => {
    const result = await checkRssFeedCrawlable('not-a-valid-url', {
      feed_ignore_robots_txt: null,
      hostname_ignore_robots_txt: null,
    })
    expect(result).toBe(false)
  })

  it('returns false when the robots parser cannot compare URL origins', async () => {
    const domain = `test-rss-robots-${Math.random().toString(36).slice(2)}.invalid`
    const cache = new ValkeyCache({
      prefix: 'urls-domains-robots',
      ttlSeconds: 60 * 60 * 24,
    })
    await cache.set(domain, 'User-agent: *\nAllow: /')

    try {
      // Cached robots rules are parsed against HTTPS, while this HTTP feed has a different origin.
      await expect(
        checkRssFeedCrawlable(`http://${domain}/feed.xml`, {
          feed_ignore_robots_txt: false,
          hostname_ignore_robots_txt: false,
        }),
      ).resolves.toBe(false)
    } finally {
      await cache.delete(domain)
    }
  })
})
