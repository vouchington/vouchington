import { describe, it, expect } from 'vitest'
import { validateTopicRows } from '../validate-topics.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('validateTopicRows (rss_feed)', () => {
  it('accepts rss_feed_url and rss_feed_title for rss_feed topic', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `source-${suffix}`,
        name: `Example Feed ${suffix}`,
        topic_type: 'rss_feed',
        rss_feed_url: 'https://example.com/feed.xml',
        rss_feed_title: 'Example Feed',
        parent_slugs: 'parent-org',
      },
    ])
    expect(result.valid).toBe(true)
  })

  it('rejects rss_feed_url on non-rss_feed topic', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `topic-${suffix}`,
        topic_type: 'topic',
        rss_feed_url: 'https://example.com/feed.xml',
        rss_feed_title: 'Example Feed',
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toContain('rss_feed_url is only allowed for topic_type=rss_feed')
  })

  it('rejects rss_feed_title on non-rss_feed topic', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      { slug: `topic-${suffix}`, rss_feed_url: '', rss_feed_title: 'Some Title' },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toContain(
      'rss_feed_title is only allowed for topic_type=rss_feed',
    )
  })

  it('rejects invalid rss_feed_url format for rss_feed topic', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `source-${suffix}`,
        name: `Test Feed ${suffix}`,
        topic_type: 'rss_feed',
        rss_feed_url: 'not-a-url',
        rss_feed_title: 'Some Title',
        parent_slugs: 'parent-org',
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toContain('rss_feed_url must be a valid URL')
  })

  it('rejects rss_feed_url fragments for rss_feed topic', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `source-${suffix}`,
        name: `Test Feed ${suffix}`,
        topic_type: 'rss_feed',
        rss_feed_url: 'https://example.com/feed.xml#section',
        rss_feed_title: 'Some Title',
        parent_slugs: 'parent-org',
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toEqual(['rss_feed_url must be a valid URL'])
  })

  it('rejects non-public rss_feed_url hosts for rss_feed topic', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `source-${suffix}`,
        name: `Test Feed ${suffix}`,
        topic_type: 'rss_feed',
        rss_feed_url: 'https://localhost/feed.xml',
        rss_feed_title: 'Some Title',
        parent_slugs: 'parent-org',
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toEqual(['rss_feed_url must be a valid URL'])
  })

  it('rejects rss_feed topic name that already contains a URL suffix', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `source-${suffix}`,
        name: `My Blog ${suffix} (https://example.com/feed.xml)`,
        topic_type: 'rss_feed',
        rss_feed_url: 'https://example.com/feed.xml',
        rss_feed_title: 'My Blog',
        parent_slugs: 'parent-org',
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors[0]).toMatch(/base title without a URL suffix/)
  })

  it('rejects feed_type on non-rss_feed topic', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      { slug: `topic-${suffix}`, topic_type: 'topic', feed_type: 'article' },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toContain('feed_type is only allowed for topic_type=rss_feed')
  })

  it('rejects invalid feed_type value for rss_feed topic', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `source-${suffix}`,
        name: `Test Feed ${suffix}`,
        topic_type: 'rss_feed',
        rss_feed_url: 'https://example.com/feed.xml',
        rss_feed_title: 'Test Feed',
        parent_slugs: 'parent-org',
        feed_type: 'blog',
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors[0]).toMatch(/feed_type must be one of/)
  })

  it('accepts valid feed_type values for rss_feed topic', () => {
    const suffix = randomSuffix()
    for (const feedType of ['article', 'podcast', 'video', 'mixed']) {
      const result = validateTopicRows([
        {
          slug: `source-${suffix}-${feedType}`,
          name: `Test Feed ${suffix}`,
          topic_type: 'rss_feed',
          rss_feed_url: 'https://example.com/feed.xml',
          rss_feed_title: 'Test Feed',
          parent_slugs: 'parent-org',
          feed_type: feedType,
        },
      ])
      expect(result.valid).toBe(true)
    }
  })

  it('accepts rss_feed type with all required fields', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `source-${suffix}`,
        name: `My Blog ${suffix}`,
        topic_type: 'rss_feed',
        rss_feed_url: 'https://example.com/feed.xml',
        rss_feed_title: 'My Blog Feed',
        parent_slugs: 'john-doe',
      },
    ])
    expect(result.valid).toBe(true)
  })

  it('rejects rss_feed type without rss_feed_url', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `source-${suffix}`,
        name: `My Blog ${suffix}`,
        topic_type: 'rss_feed',
        rss_feed_url: '',
        rss_feed_title: 'My Blog Feed',
        parent_slugs: 'john-doe',
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toContain('rss_feed_url is required for topic_type=rss_feed')
  })

  it('rejects rss_feed type without rss_feed_title', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `source-${suffix}`,
        name: `My Blog ${suffix}`,
        topic_type: 'rss_feed',
        rss_feed_url: 'https://example.com/feed.xml',
        rss_feed_title: '',
        parent_slugs: 'john-doe',
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toContain('rss_feed_title is required for topic_type=rss_feed')
  })

  it('rejects rss_feed type without parent_slugs', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `source-${suffix}`,
        name: `My Blog ${suffix}`,
        topic_type: 'rss_feed',
        rss_feed_url: 'https://example.com/feed.xml',
        rss_feed_title: 'My Blog Feed',
        parent_slugs: '',
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toContain('parent_slugs is required for topic_type=rss_feed')
  })

  it('rejects rss_feed type without name', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `source-${suffix}`,
        name: '',
        topic_type: 'rss_feed',
        rss_feed_url: 'https://example.com/feed.xml',
        rss_feed_title: 'My Blog Feed',
        parent_slugs: 'parent-org',
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toContain('name is required for topic_type=rss_feed')
  })

  it('accepts full seed CSV row format for an rss_feed topic', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `source-${suffix}`,
        name: `Example Feed ${suffix}`,
        topic_type: 'rss_feed',
        aliases: '',
        parent_slugs: 'parent-org',
        extensions: '',
        rss_feed_url: 'https://example.com/feed.xml',
        rss_feed_title: 'Example Feed',
        notes: '',
      },
    ])
    expect(result.valid).toBe(true)
  })
})
