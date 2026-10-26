import { describe, expect, it } from 'vitest'
import generateStagingRssFeedsSQL from '../0080-00-01a-staging-rss-feeds.mts'
import { STAGING_RSS_FEEDS } from '../utils/staging-rss-feeds.mts'

describe('staging RSS feed seed SQL', () => {
  it('generates staging SQL but omits it in production', () => {
    const cloudflare = STAGING_RSS_FEEDS.find(feed => feed.hostname === 'blog.cloudflare.com')
    if (!cloudflare) throw new Error('Expected the Cloudflare staging feed')
    const stagingSql = generateStagingRssFeedsSQL('staging')

    expect(stagingSql).toContain(cloudflare.slug)
    expect(stagingSql).toContain(cloudflare.ids.topic)
    expect(generateStagingRssFeedsSQL('production')).toBe('')
  })
})
