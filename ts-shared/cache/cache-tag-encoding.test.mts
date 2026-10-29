import { describe, expect, it } from 'vitest'
import { deriveCacheTags, postTag, topicTag, userTag } from './cache-tags.mts'

const noContext = { isSitemap: false, isRss: false, isStatic: false }

// The edge mints tags from `URL.pathname`, which is always percent-encoded ASCII; the backend
// mints them from the raw Postgres value. Before this encoder the two never matched for any
// identifier needing percent-encoding, leaving those entities permanently unpurgeable.
describe('edge and backend convergence', () => {
  it('collapses the percent-encoded pathname form onto the raw database form', () => {
    expect(deriveCacheTags('/topic/caf%C3%A9', noContext)).toEqual([topicTag('café')])
    expect(deriveCacheTags('/user/%E6%97%A5%E6%9C%AC', noContext)).toEqual([userTag('日本')])
    expect(deriveCacheTags('/discussion/new%20york', noContext)).toEqual([postTag('new york')])
  })

  it('matches regardless of the escape hex casing the client sent', () => {
    expect(deriveCacheTags('/topic/caf%c3%a9', noContext)).toEqual(
      deriveCacheTags('/topic/caf%C3%A9', noContext),
    )
  })

  // The identifier the two sides share may itself contain a valid escape sequence, because
  // `topic_aliases.alias` is validated for length and nothing else. The edge sees it doubly
  // escaped and must decode exactly once to land back on the backend's raw row value.
  it('converges for a raw identifier that already looks percent-encoded', () => {
    expect(deriveCacheTags('/topic/sale%2520day', noContext)).toEqual([topicTag('sale%20day')])
    expect(topicTag('sale%20day')).toBe('topic:sale%2520day')
  })

  // A literal `/` in an identifier reaches the edge as `%2F`, which `URL.pathname` leaves
  // encoded. Decoding per segment rather than over the whole pathname keeps it one segment.
  it('converges for an identifier containing a literal slash', () => {
    expect(deriveCacheTags('/topic/a%2Fb', noContext)).toEqual([topicTag('a/b')])
  })

  // An escaped static subroute must still classify as the subroute, not as an entity whose tag
  // no mutation would ever purge.
  it('classifies a percent-escaped static subroute as a non-entity path', () => {
    expect(deriveCacheTags('/api/v1/topics/%63ompare', noContext)).toEqual(['html'])
  })
})

describe('over-long tags', () => {
  it('truncates both sides identically, so an over-long identifier still purges', () => {
    const alias = 'é'.repeat(1000)
    expect(deriveCacheTags(`/topic/${encodeURIComponent(alias)}`, noContext)).toEqual([
      topicTag(alias),
    ])
  })
})
