import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import generateStagingRssFeedsSQL, { STAGING_RSS_FEEDS } from '../0080-00-01a-staging-rss-feeds.mts'

const seedFile = '0080-00-01a-staging-rss-feeds.mts'
const relationsFile = '0080-00-02-publisher-type-relations.sql'

describe('staging RSS feed seed SQL', () => {
  it('places the Cloudflare blog feed before its publisher type relation', () => {
    const cloudflare = STAGING_RSS_FEEDS.find(feed => feed.hostname === 'blog.cloudflare.com')
    if (!cloudflare) throw new Error('Expected the Cloudflare staging feed')
    const sql = generateStagingRssFeedsSQL('staging')
    const relations = readFileSync(new URL(`../${relationsFile}`, import.meta.url), 'utf8')

    expect(sql).toContain(cloudflare.slug)
    expect(sql).toContain(cloudflare.ids.topic)
    expect(relations).toContain(`('${cloudflare.slug}', 'blog')`)
    expect(seedFile.localeCompare(relationsFile)).toBeLessThan(0)
    expect(generateStagingRssFeedsSQL('production')).toBe('')
  })
})
