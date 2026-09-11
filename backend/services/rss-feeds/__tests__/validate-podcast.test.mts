import { it, expect, describe } from 'vitest'
import { extractPodcastShowMetadata, extractFeedCategories } from '../validate.mts'

describe('extractPodcastShowMetadata', () => {
  it('returns null when no itunes data is present', () => {
    const result = extractPodcastShowMetadata({})
    expect(result).toBeNull()
  })

  it('extracts all itunes show fields from a feed-level object', () => {
    const parsedFeed: Record<string, unknown> = {
      title: 'Planet Money',
      itunes: {
        author: 'NPR',
        owner: { name: 'NPR Podcasts', email: 'podcasts@npr.org' },
        image: { href: 'https://example.com/cover.jpg' },
        explicit: 'no',
        type: 'episodic',
      },
    }

    const result = extractPodcastShowMetadata(parsedFeed)
    expect(result).not.toBeNull()
    expect(result?.itunes_author).toBe('NPR')
    expect(result?.itunes_owner_name).toBe('NPR Podcasts')
    expect(result?.itunes_owner_email).toBe('podcasts@npr.org')
    expect(result?.cover_art_url).toBe('https://example.com/cover.jpg')
    expect(result?.is_explicit).toBe(false)
    expect(result?.itunes_type).toBe('episodic')
  })

  it('handles explicit=yes', () => {
    const parsedFeed = { itunes: { explicit: 'yes' } }
    const result = extractPodcastShowMetadata(parsedFeed)
    expect(result?.is_explicit).toBe(true)
  })

  it('handles explicit=true (boolean)', () => {
    const parsedFeed = { itunes: { explicit: true } }
    const result = extractPodcastShowMetadata(parsedFeed)
    expect(result?.is_explicit).toBe(true)
  })

  it('handles itunes:image as a bare string (item-level format)', () => {
    const parsedFeed = {
      itunes: { image: 'https://example.com/bare-cover.jpg' },
    }
    const result = extractPodcastShowMetadata(parsedFeed)
    expect(result?.cover_art_url).toBe('https://example.com/bare-cover.jpg')
  })

  it('handles serial itunes:type', () => {
    const parsedFeed = { itunes: { type: 'serial' } }
    const result = extractPodcastShowMetadata(parsedFeed)
    expect(result?.itunes_type).toBe('serial')
  })

  it('returns null for unknown itunes:type', () => {
    const parsedFeed = { itunes: { type: 'unknown-value' } }
    const result = extractPodcastShowMetadata(parsedFeed)
    expect(result?.itunes_type).toBeNull()
  })

  it('truncates author to 255 chars', () => {
    const longAuthor = 'A'.repeat(300)
    const parsedFeed = { itunes: { author: longAuthor } }
    const result = extractPodcastShowMetadata(parsedFeed)
    expect(result?.itunes_author?.length).toBeLessThanOrEqual(255)
  })

  it('returns non-null with null fields when itunes object is present but empty', () => {
    const parsedFeed = { itunes: {} }
    const result = extractPodcastShowMetadata(parsedFeed)
    expect(result).not.toBeNull()
    expect(result?.itunes_author).toBeNull()
    expect(result?.cover_art_url).toBeNull()
    expect(result?.is_explicit).toBe(false)
    expect(result?.itunes_type).toBeNull()
  })

  it('extracts plain-text description from the top-level feed description field', () => {
    const parsedFeed = {
      itunes: {},
      description: 'A podcast about money and economics.',
    }
    const result = extractPodcastShowMetadata(parsedFeed)
    expect(result?.description).toBe('A podcast about money and economics.')
  })

  it('strips HTML tags and decodes entities (including &nbsp;) from description', () => {
    const parsedFeed = {
      itunes: {},
      description: '<p>A&nbsp;show about <b>money</b> &amp; life.</p>',
    }
    const result = extractPodcastShowMetadata(parsedFeed)
    expect(result?.description).toBe('A show about money & life.')
  })

  it('decodes numeric character references (decimal and hex) in description', () => {
    const parsedFeed = {
      itunes: {},
      description: 'It&#8217;s a &#x2014; podcast&#46;',
    }
    const result = extractPodcastShowMetadata(parsedFeed)
    expect(result?.description).toBe('It’s a — podcast.')
  })

  it('leaves invalid or out-of-range numeric entities undecoded rather than throwing', () => {
    const parsedFeed = {
      itunes: {},
      description: '&#9999999999; and &#x1FFFFF; and &#0;',
    }
    const result = extractPodcastShowMetadata(parsedFeed)
    expect(result?.description).toBe('&#9999999999; and &#x1FFFFF; and &#0;')
  })

  it('strips entity-escaped HTML tags (decodes entities before stripping tags)', () => {
    const parsedFeed = {
      itunes: {},
      description: '&lt;p&gt;About&lt;/p&gt;',
    }
    const result = extractPodcastShowMetadata(parsedFeed)
    expect(result?.description).toBe('About')
  })

  it('returns null description when the field is absent or non-string', () => {
    const noDescResult = extractPodcastShowMetadata({ itunes: {} })
    expect(noDescResult?.description).toBeNull()

    const numericDescResult = extractPodcastShowMetadata({ itunes: {}, description: 42 })
    expect(numericDescResult?.description).toBeNull()
  })
})

describe('extractFeedCategories', () => {
  it('returns empty array when no itunes data present', () => {
    expect(extractFeedCategories({})).toEqual([])
  })

  it('returns empty array when itunes present but no categories', () => {
    expect(extractFeedCategories({ itunes: {} })).toEqual([])
    expect(extractFeedCategories({ itunes: { categories: [] } })).toEqual([])
  })

  it('extracts and normalizes top-level categories', () => {
    const parsedFeed: Record<string, unknown> = {
      itunes: {
        categories: [{ text: 'Business' }, { text: 'News' }],
      },
    }
    const result = extractFeedCategories(parsedFeed)
    expect(result).toContain('business')
    expect(result).toContain('news')
    expect(result.length).toBe(2)
  })

  it('flattens nested subcategories', () => {
    const parsedFeed: Record<string, unknown> = {
      itunes: {
        categories: [
          {
            text: 'News',
            categories: [{ text: 'Tech News' }, { text: 'Business News' }],
          },
        ],
      },
    }
    const result = extractFeedCategories(parsedFeed)
    expect(result).toContain('news')
    expect(result).toContain('tech news')
    expect(result).toContain('business news')
  })

  it('deduplicates categories case-insensitively', () => {
    const parsedFeed: Record<string, unknown> = {
      itunes: {
        categories: [{ text: 'Business' }, { text: 'business' }],
      },
    }
    const result = extractFeedCategories(parsedFeed)
    expect(result.filter(c => c === 'business')).toHaveLength(1)
  })

  it('matches the NPR Planet Money feed structure (Business + News)', () => {
    const parsedFeed: Record<string, unknown> = {
      itunes: {
        categories: [{ text: 'Business' }, { text: 'News' }],
      },
    }
    const result = extractFeedCategories(parsedFeed)
    expect(result).toEqual(['business', 'news'])
  })
})
