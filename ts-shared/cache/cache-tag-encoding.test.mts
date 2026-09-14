import { describe, expect, it } from 'vitest'
import {
  MAX_CACHE_TAG_BYTES,
  cacheTag,
  decodeCacheTagPathSegment,
  encodeCacheTagValue,
  isValidCacheTag,
} from './cache-tag-encoding.mts'
import { deriveEntityCacheTags, postTag, topicTag, userTag, hostnameTag } from './cache-tags.mts'

// Cloudflare's accepted Cache-Tag alphabet, characterized against the live staging purge
// endpoint: printable ASCII excluding space, at most 1024 bytes, and one invalid tag rejects
// the whole batch. These cases are the contract the encoder exists to satisfy.
const CLOUDFLARE_REJECTS = [
  ['space', 'new york city', 'topic:new%20york%20city'],
  ['tab', 'a\tb', 'topic:a%09b'],
  ['newline', 'a\nb', 'topic:a%0ab'],
  ['latin-1 accent', 'café', 'topic:caf%c3%a9'],
  ['cjk', '日本', 'topic:%e6%97%a5%e6%9c%ac'],
  ['comma, the Cache-Tag header delimiter', 'a,b', 'topic:a%2cb'],
  ['slash', 'a/b', 'topic:a%2fb'],
  ['literal percent', '100%', 'topic:100%25'],
] as const

describe('isValidCacheTag', () => {
  it('accepts printable ascii excluding space', () => {
    expect(isValidCacheTag('topic:chase-sapphire')).toBe(true)
    expect(isValidCacheTag('hostname:example.com')).toBe(true)
    expect(isValidCacheTag('!~')).toBe(true)
  })

  it('rejects what Cloudflare rejects', () => {
    expect(isValidCacheTag('')).toBe(false)
    expect(isValidCacheTag('topic:new york')).toBe(false)
    expect(isValidCacheTag('topic:café')).toBe(false)
    expect(isValidCacheTag('topic:a\tb')).toBe(false)
    expect(isValidCacheTag('topic:a\u007fb')).toBe(false)
    expect(isValidCacheTag('topic:a\u0001b')).toBe(false)
    expect(isValidCacheTag('topic:new\u00a0york')).toBe(false)
    expect(isValidCacheTag(`topic:${'a'.repeat(MAX_CACHE_TAG_BYTES)}`)).toBe(false)
  })
})

describe('cacheTag', () => {
  it.each(CLOUDFLARE_REJECTS)('escapes %s', (_label, value, expected) => {
    expect(topicTag(value)).toBe(expected)
  })

  it.each(CLOUDFLARE_REJECTS)('mints a tag Cloudflare accepts for %s', (_label, value) => {
    expect(isValidCacheTag(topicTag(value))).toBe(true)
  })

  it('leaves existing ascii tags byte-identical, so tags minted either side of a deploy match', () => {
    expect(postTag('11111111-2222-3333-4444-555555555555')).toBe(
      'post:11111111-2222-3333-4444-555555555555',
    )
    expect(topicTag('chase-sapphire-preferred')).toBe('topic:chase-sapphire-preferred')
    expect(hostnameTag('example.com')).toBe('hostname:example.com')
    expect(userTag('alice')).toBe('user:alice')
  })

  it('keeps the family prefix unescaped so tags stay readable in purge logs', () => {
    expect(cacheTag('rss-feed-item', 'abc')).toBe('rss-feed-item:abc')
  })
})

describe('encodeCacheTagValue', () => {
  it('treats its input as raw text, never as something to decode first', () => {
    // `topic_aliases.alias` is length-validated only, so a row may literally read `sale%20day`.
    // Decoding it here would mint `topic:sale%20day` on the backend while the edge, reading the
    // doubly-escaped pathname, minted `topic:sale%2520day` — a tag no mutation ever purges.
    expect(encodeCacheTagValue('sale%20day')).toBe('sale%2520day')
    expect(encodeCacheTagValue('caf%C3%A9')).toBe('caf%25c3%25a9')
  })
})

// The edge mints tags from `URL.pathname`, which is always percent-encoded ASCII; the backend
// mints them from the raw Postgres value. Before this encoder the two never matched for any
// identifier needing percent-encoding, leaving those entities permanently unpurgeable.
describe('edge and backend convergence', () => {
  it('collapses the percent-encoded pathname form onto the raw database form', () => {
    expect(deriveEntityCacheTags('/topic/caf%C3%A9')).toEqual([topicTag('café')])
    expect(deriveEntityCacheTags('/user/%E6%97%A5%E6%9C%AC')).toEqual([userTag('日本')])
    expect(deriveEntityCacheTags('/discussion/new%20york')).toEqual([postTag('new york')])
  })

  it('matches regardless of the escape hex casing the client sent', () => {
    expect(deriveEntityCacheTags('/topic/caf%c3%a9')).toEqual(
      deriveEntityCacheTags('/topic/caf%C3%A9'),
    )
  })

  // The identifier the two sides share may itself contain a valid escape sequence, because
  // `topic_aliases.alias` is validated for length and nothing else. The edge sees it doubly
  // escaped and must decode exactly once to land back on the backend's raw row value.
  it('converges for a raw identifier that already looks percent-encoded', () => {
    expect(deriveEntityCacheTags('/topic/sale%2520day')).toEqual([topicTag('sale%20day')])
    expect(topicTag('sale%20day')).toBe('topic:sale%2520day')
  })

  // A literal `/` in an identifier reaches the edge as `%2F`, which `URL.pathname` leaves
  // encoded. Decoding per segment rather than over the whole pathname keeps it one segment.
  it('converges for an identifier containing a literal slash', () => {
    expect(deriveEntityCacheTags('/topic/a%2Fb')).toEqual([topicTag('a/b')])
  })

  // An escaped static subroute must still classify as the subroute, not as an entity whose tag
  // no mutation would ever purge.
  it('classifies a percent-escaped static subroute as a non-entity path', () => {
    expect(deriveEntityCacheTags('/api/v1/topics/%63ompare')).toEqual([])
  })
})

describe('over-long tags', () => {
  it('truncates on an escape boundary rather than dropping the tag', () => {
    const tag = topicTag('é'.repeat(1000))
    expect(tag.length).toBeLessThanOrEqual(MAX_CACHE_TAG_BYTES)
    expect(isValidCacheTag(tag)).toBe(true)
    // A trailing `%` or `%X` would be a split escape the other side would never mint.
    expect(/%[0-9a-f]?$/.test(tag)).toBe(false)
    expect(tag.startsWith('topic:')).toBe(true)
  })

  // The cut can land either one or two characters into a `%XX` triple. `user:` plus a repeating
  // `%2c` puts the `%` at index 1022, so this case retreats by two where the accented case above
  // retreats by one — both must leave a whole escape behind.
  it('retreats two characters when the cut lands one past an escape', () => {
    const tag = userTag(','.repeat(500))
    expect(tag.length).toBe(MAX_CACHE_TAG_BYTES - 2)
    expect(isValidCacheTag(tag)).toBe(true)
    expect(/%[0-9a-f]?$/.test(tag)).toBe(false)
    expect(tag.endsWith('%2c')).toBe(true)
  })

  it('cuts at the cap exactly when no escape straddles the boundary', () => {
    const tag = userTag('a'.repeat(2000))
    expect(tag.length).toBe(MAX_CACHE_TAG_BYTES)
    expect(isValidCacheTag(tag)).toBe(true)
  })

  it('truncates both sides identically, so an over-long identifier still purges', () => {
    const alias = 'é'.repeat(1000)
    expect(deriveEntityCacheTags(`/topic/${encodeURIComponent(alias)}`)).toEqual([topicTag(alias)])
  })
})

describe('decodeCacheTagPathSegment', () => {
  it('returns a segment with no escape untouched', () => {
    expect(decodeCacheTagPathSegment('new-york-city')).toBe('new-york-city')
  })

  it('recovers the raw identifier from a well-formed escape', () => {
    expect(decodeCacheTagPathSegment('new%20york%20city')).toBe('new york city')
    expect(decodeCacheTagPathSegment('caf%C3%A9')).toBe('café')
  })

  // A malformed escape is undecodable, and throwing here would 500 a purge on input the backend
  // can legitimately mint. Keeping the segment verbatim lets `encodeCacheTagValue` re-escape the
  // `%` to `%25`, which is exactly the tag a raw value spelled that way produces.
  it.each([
    ['invalid hex digits', '%zz'],
    ['truncated at the end', 'abc%a'],
    ['bare percent', '100%'],
    ['lone continuation byte', '%80'],
  ])('keeps a segment verbatim when the escape is %s', (_label, segment) => {
    expect(decodeCacheTagPathSegment(segment)).toBe(segment)
  })

  it('round-trips an undecodable segment to the tag the backend mints for it', () => {
    expect(encodeCacheTagValue(decodeCacheTagPathSegment('100%'))).toBe('100%25')
  })
})
