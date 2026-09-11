import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseCanonicalPostUrl } from './canonical-post-url.mts'
import { formatMentionAsHtml, parseEntityMentions, replaceEntityMentions } from './index.mts'
import { normalizeBangAutolinks } from './html-normalization.mts'
import { parsePostUrlToken } from './post-url-parser.mts'
import type {
  ResolvedPostMention,
  ResolvedTopicMention,
  ResolvedUserMention,
  UnresolvedMention,
} from './types.mts'

const originalSitemapBaseUrl = process.env.SITEMAP_BASE_URL

describe('entity-links', () => {
  beforeEach(() => {
    process.env.SITEMAP_BASE_URL = 'https://voucha.ai'
  })

  afterEach(() => {
    if (originalSitemapBaseUrl === undefined) {
      delete process.env.SITEMAP_BASE_URL
    } else {
      process.env.SITEMAP_BASE_URL = originalSitemapBaseUrl
    }
  })

  describe('parseEntityMentions', () => {
    it('parses user, topic, and post identifier mentions', () => {
      const mentions = parseEntityMentions('Hello @John_Doe, check #Bitcoin and !my-review')
      expect(mentions).toHaveLength(3)
      expect(mentions[0]).toMatchObject({
        type: 'user',
        raw: '@John_Doe',
        identifier: 'john_doe',
      })
      expect(mentions[1]).toMatchObject({
        type: 'topic',
        raw: '#Bitcoin',
        identifier: 'bitcoin',
      })
      expect(mentions[2]).toMatchObject({
        type: 'post',
        raw: '!my-review',
        identifier: 'my-review',
        source: 'identifier',
      })
    })

    it('parses canonical post detail and comment permalink URLs', () => {
      const mentions = parseEntityMentions(
        'See !https://voucha.ai/discussion/test-post and !/discussion/root-post/comment/019c64e6-f720-7001-a001-000000000010',
      )

      expect(mentions).toHaveLength(2)
      expect(mentions[0]).toMatchObject({
        type: 'post',
        identifier: 'test-post',
        source: 'post_url',
      })
      expect(mentions[1]).toMatchObject({
        type: 'post',
        identifier: '019c64e6-f720-7001-a001-000000000010',
        source: 'comment_url',
      })
    })

    it('rejects invalid or embedded mention-like text', () => {
      expect(parseEntityMentions('email@test.com')).toEqual([])
      expect(parseEntityMentions('foo@bar')).toEqual([])
      expect(parseEntityMentions('midword#topic')).toEqual([])
      expect(parseEntityMentions('midword!post')).toEqual([])
      expect(parseEntityMentions('#bad_topic')).toEqual([])
      expect(parseEntityMentions('!https://example.com/discussion/post')).toEqual([])
      expect(parseEntityMentions('!//example.com/discussion/post')).toEqual([])
      expect(parseEntityMentions('!https://voucha.ai/discussion/post?x=1')).toEqual([])
    })

    it('captures indices for validated mentions only', () => {
      const text = 'Before (@user) after'
      const mentions = parseEntityMentions(text)
      expect(mentions).toHaveLength(1)
      expect(mentions[0]).toMatchObject({
        startIndex: 8,
        endIndex: 13,
        raw: '@user',
      })
    })
  })

  describe('normalizeBangAutolinks', () => {
    it('converts same-site bang autolinks back to raw bang urls', () => {
      const html =
        '<p>See !<a href="https://voucha.ai/discussion/test" rel="nofollow ugc noopener" target="_blank">https://voucha.ai/discussion/test</a></p>'

      expect(normalizeBangAutolinks(html)).toBe('<p>See !https://voucha.ai/discussion/test</p>')
    })

    it('leaves non-canonical bang autolinks unchanged', () => {
      const html =
        '<p>See !<a href="https://example.com/discussion/test" rel="nofollow ugc noopener" target="_blank">https://example.com/discussion/test</a></p>'

      expect(normalizeBangAutolinks(html)).toBe(html)
    })

    it('leaves authored bang anchors unchanged', () => {
      const html =
        '<p>See !<a href="https://voucha.ai/discussion/test" rel="nofollow ugc noopener" target="_blank">custom text</a></p>'

      expect(normalizeBangAutolinks(html)).toBe(html)
    })

    it('leaves invalid same-site bang autolinks unchanged', () => {
      const html =
        '<p>See !<a data-href="https://voucha.ai/discussion/test" href="https://voucha.ai/discussion/bad_slug_with_underscore">https://voucha.ai/discussion/bad_slug_with_underscore</a></p>'

      expect(normalizeBangAutolinks(html)).toBe(html)
    })

    it('leaves relative bang autolinks unchanged', () => {
      const html =
        '<p>See !<a href="/discussion/test" rel="nofollow ugc noopener" target="_blank">/discussion/test</a></p>'

      expect(normalizeBangAutolinks(html)).toBe(html)
    })
  })

  describe('parsePostUrlToken', () => {
    it('parses canonical route tokens without a leading slash', () => {
      expect(parsePostUrlToken('discussion/test-post', 0)).toMatchObject({
        identifier: 'test-post',
        source: 'post_url',
        endIndex: 20,
      })
    })
  })

  describe('parseCanonicalPostUrl', () => {
    it('honors runtime base URL overrides', () => {
      const originalBaseUrl = process.env.SITEMAP_BASE_URL

      try {
        process.env.SITEMAP_BASE_URL = 'https://staging.voucha.example'
        expect(parseCanonicalPostUrl('/discussion/test-post')).toMatchObject({
          identifier: 'test-post',
          source: 'post_url',
        })

        process.env.SITEMAP_BASE_URL = 'not a url'
        expect(parseCanonicalPostUrl('/discussion/test-post')).toBeNull()
      } finally {
        if (originalBaseUrl === undefined) {
          delete process.env.SITEMAP_BASE_URL
        } else {
          process.env.SITEMAP_BASE_URL = originalBaseUrl
        }
      }
    })
  })

  describe('formatMentionAsHtml', () => {
    it('formats user mentions with proper HTML', () => {
      const mention: ResolvedUserMention = {
        type: 'user',
        raw: '@john_doe',
        id: 'user-123',
        username: 'john_doe',
        displayName: 'John Doe',
        url: '/user/john_doe',
      }
      expect(formatMentionAsHtml(mention)).toBe(
        '<a href="/user/john_doe" class="md-link-user" title="John Doe">John Doe</a>',
      )
    })

    it('formats topic mentions with proper HTML', () => {
      const mention: ResolvedTopicMention = {
        type: 'topic',
        raw: '#bitcoin',
        id: 'topic-123',
        slug: 'cryptocurrency',
        name: 'Bitcoin',
        topicType: 'topic',
        url: '/topics/cryptocurrency',
      }
      expect(formatMentionAsHtml(mention)).toBe(
        '<a href="/topics/cryptocurrency" class="md-link-topic" title="Bitcoin">Bitcoin</a>',
      )
    })

    it('formats post mentions with canonical post paths', () => {
      const mention: ResolvedPostMention = {
        type: 'post',
        raw: '!my-review',
        id: 'post-123',
        slug: 'my-review',
        title: 'My Amazing Review',
        postType: 'review',
        url: '/review/my-review',
        displayText: 'My Amazing Review',
        displayTitle: 'My Amazing Review',
      }
      expect(formatMentionAsHtml(mention)).toBe(
        '<a href="/review/my-review" class="md-link-post" title="My Amazing Review">My Amazing Review</a>',
      )
    })

    it('formats comment permalink mentions using the raw mention text', () => {
      const mention: ResolvedPostMention = {
        type: 'post',
        raw: '!https://voucha.ai/discussion/root/comment/019c64e6-f720-7001-a001-000000000010',
        id: '019c64e6-f720-7001-a001-000000000010',
        slug: '019c64e6-f720-7001-a001-000000000010',
        title: 'Comment on Root Post',
        postType: 'comment',
        url: '/discussion/root/comment/019c64e6-f720-7001-a001-000000000010',
        displayText:
          '!https://voucha.ai/discussion/root/comment/019c64e6-f720-7001-a001-000000000010',
        displayTitle: 'Comment on Root Post',
      }
      expect(formatMentionAsHtml(mention)).toContain(
        '>!https://voucha.ai/discussion/root/comment/019c64e6-f720-7001-a001-000000000010</a>',
      )
    })

    it('returns raw text for unresolved mentions', () => {
      const mention: UnresolvedMention = {
        type: 'unresolved',
        raw: '@nonexistent',
        reason: 'not_found',
      }
      expect(formatMentionAsHtml(mention)).toBe('@nonexistent')
    })

    it('escapes HTML special characters in text and title', () => {
      const mention: ResolvedUserMention = {
        type: 'user',
        raw: '@user',
        id: 'user-456',
        username: 'user',
        displayName: 'User "with" <quotes> & ampersands',
        url: '/user/user',
      }
      const html = formatMentionAsHtml(mention)
      expect(html).toContain('title="User &quot;with&quot; &lt;quotes&gt; &amp; ampersands"')
      expect(html).toContain('>User &quot;with&quot; &lt;quotes&gt; &amp; ampersands</a>')
    })
  })

  describe('replaceEntityMentions', () => {
    it('does not replace mentions inside code blocks', async () => {
      const text = '<code>@user</code> and <pre>@another</pre>'
      expect(await replaceEntityMentions(text)).toBe(text)
    })

    it('does not replace mentions inside HTML tags', async () => {
      const text = '<a href="/user/@john">Link</a>'
      const result = await replaceEntityMentions(text)
      expect(result).toContain('href="/user/@john"')
    })

    it('normalizes bang autolinks before parsing', async () => {
      const text =
        '<p>See !<a href="https://voucha.ai/discussion/test-post" rel="nofollow ugc noopener" target="_blank">https://voucha.ai/discussion/test-post</a></p>'
      const result = await replaceEntityMentions(text)
      expect(result).toContain('!https://voucha.ai/discussion/test-post')
      expect(result).not.toContain('<a href="https://voucha.ai/discussion/test-post"')
    })
  })
})
