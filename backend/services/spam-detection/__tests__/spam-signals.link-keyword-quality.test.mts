import { describe, it, expect } from 'vitest'
import { checkExcessiveLinks, checkSpamKeywords, checkLowQualityText } from '../spam-signals.mts'

describe('checkExcessiveLinks', () => {
  it('no links — not flagged, score 0', () => {
    const result = checkExcessiveLinks('Just some plain text without any links here.')
    expect(result.flagged).toBe(false)
    expect(result.score).toBe(0)
  })

  it('5 links — not flagged (at threshold)', () => {
    const md =
      'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13 word14 word15 word16 word17 word18 word19 word20 ' +
      '[a](https://a.com) [b](https://b.com) [c](https://c.com) [d](https://d.com) [e](https://e.com)'
    const result = checkExcessiveLinks(md)
    expect(result.flagged).toBe(false)
    expect((result.details as Record<string, unknown>)?.linkCount).toBe(5)
  })

  it('6 links — flagged (exceeds MAX_EXTERNAL_LINKS)', () => {
    const md =
      'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13 word14 word15 word16 word17 word18 word19 word20 ' +
      '[a](https://a.com) [b](https://b.com) [c](https://c.com) [d](https://d.com) [e](https://e.com) [f](https://f.com)'
    const result = checkExcessiveLinks(md)
    expect(result.flagged).toBe(true)
    expect((result.details as Record<string, unknown>)?.linkCount).toBe(6)
  })

  it('high link-to-text ratio — flagged', () => {
    // 2 links in 4 words = 0.5 ratio > 0.3 threshold
    const md = '[a](https://a.com) word [b](https://b.com) word2'
    const result = checkExcessiveLinks(md)
    expect(result.flagged).toBe(true)
  })

  it('score scales with link count, capped at 1', () => {
    const links = Array.from(
      { length: 15 },
      (_, i) => `word${i} [x](https://example${i}.com)`,
    ).join(' ')
    const result = checkExcessiveLinks(links)
    expect(result.score).toBe(1)
  })
})

describe('checkSpamKeywords', () => {
  it('clean text — not flagged', () => {
    const result = checkSpamKeywords('Great article about hiking', 'The trail was beautiful today.')
    expect(result.flagged).toBe(false)
    expect(result.score).toBe(0)
  })

  it('crypto scam keyword in title — flagged', () => {
    const result = checkSpamKeywords('FREE airdrop tokens now!', 'Come get your tokens')
    expect(result.flagged).toBe(true)
    expect(result.score).toBeGreaterThan(0)
  })

  it('SEO spam keyword in markdown — flagged', () => {
    const result = checkSpamKeywords('SEO tips', 'You should buy backlinks to improve ranking.')
    expect(result.flagged).toBe(true)
  })

  it('pharma keyword — flagged', () => {
    const result = checkSpamKeywords('Health advice', 'buy viagra online cheap')
    expect(result.flagged).toBe(true)
  })

  it('case-insensitive matching', () => {
    const result = checkSpamKeywords('', 'GUARANTEED RETURNS on your investment')
    expect(result.flagged).toBe(true)
  })

  it('multiple matches increase score', () => {
    const r1 = checkSpamKeywords('airdrop', 'free tokens')
    const r2 = checkSpamKeywords('airdrop', 'free tokens buy backlinks buy viagra')
    expect(r2.score).toBeGreaterThan(r1.score)
  })
})

describe('checkLowQualityText', () => {
  it('normal text — not flagged', () => {
    const result = checkLowQualityText(
      'This is a well-written paragraph about technology and innovation. It contains clear sentences and proper language use throughout.',
    )
    expect(result.flagged).toBe(false)
    expect(result.score).toBe(0)
  })

  it('excessive caps — flagged', () => {
    const result = checkLowQualityText(
      'THIS IS ALL CAPS TEXT THAT SHOULD BE FLAGGED BECAUSE IT IS VERY ANNOYING TO READ',
    )
    expect(result.flagged).toBe(true)
    expect((result.details as Record<string, unknown>)?.signals).toContain('excessive_caps')
  })

  it('repetitive words — flagged', () => {
    const result = checkLowQualityText('buy buy buy buy buy buy now')
    expect(result.flagged).toBe(true)
    expect((result.details as Record<string, unknown>)?.signals).toContain('repetitive_words')
  })

  it('short content with link — flagged', () => {
    const result = checkLowQualityText('Click here https://spam.com')
    expect(result.flagged).toBe(true)
    expect((result.details as Record<string, unknown>)?.signals).toContain('short_with_links')
  })

  it('multiple signals increase score', () => {
    const single = checkLowQualityText('Click here https://spam.com')
    const multi = checkLowQualityText('CLICK HERE https://spam.com buy buy buy buy buy buy')
    expect(multi.score).toBeGreaterThan(single.score)
  })
})
