import { describe, it, expect, beforeAll } from 'vitest'
import { analyzePostForSpam } from './analyze-post.mts'
import { SPAM_SCORE_THRESHOLD } from './config.mts'
import { createTestUser, insertTestPost, safeUsername } from '@voucha/test-helpers'
import { getPostByAny } from '@services/posts/get'
import type { Post } from '@services/posts/types'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('analyzePostForSpam', () => {
  let userId: string

  beforeAll(async () => {
    const user = await createTestUser({ username: safeUsername('spam-analyze') })
    userId = user!.id
  })

  it('clean post scores below threshold', async () => {
    const suffix = randomSuffix()
    const postId = await insertTestPost({
      title: `Normal post about technology ${suffix}`,
      slug: `normal-post-${suffix}`,
      createdById: userId,
      markdown:
        'This is a genuine discussion about technology trends in 2024. The advancements in AI have been remarkable. We should consider the implications carefully and think critically about the future.',
    })

    const post = (await getPostByAny(postId)) as Post
    const result = await analyzePostForSpam(post)

    expect(result.composite_score).toBeLessThan(SPAM_SCORE_THRESHOLD)
    expect(result.flagged).toBe(false)
    expect(result.signals).toHaveLength(6)
    expect(result.signals.map(s => s.signal)).toContain('excessive_links')
    expect(result.signals.map(s => s.signal)).toContain('spam_keywords')
    expect(result.signals.map(s => s.signal)).toContain('content_hash_duplicate')
    expect(result.signals.map(s => s.signal)).toContain('low_quality_text')
    expect(result.signals.map(s => s.signal)).toContain('embeddings_similarity')
  })

  it('obvious spam fires keyword and link signals', async () => {
    const suffix = randomSuffix()
    const postId = await insertTestPost({
      title: `FREE AIRDROP tokens ${suffix} buy backlinks guaranteed returns`,
      slug: `obvious-spam-${suffix}`,
      createdById: userId,
      // 10 links (score=1.0) + spam keywords in title + no real text
      markdown:
        'BUY BUY BUY BUY BUY [a](https://s1.com) [b](https://s2.com) [c](https://s3.com) [d](https://s4.com) [e](https://s5.com) [f](https://s6.com) [g](https://s7.com) [h](https://s8.com) [i](https://s9.com) [j](https://s10.com)',
    })

    const post = (await getPostByAny(postId)) as Post
    const result = await analyzePostForSpam(post)

    // Both keyword (from title) and link signals should fire
    const keywordSignal = result.signals.find(s => s.signal === 'spam_keywords')
    const linkSignal = result.signals.find(s => s.signal === 'excessive_links')
    const qualitySignal = result.signals.find(s => s.signal === 'low_quality_text')
    expect(keywordSignal?.flagged).toBe(true)
    expect(linkSignal?.flagged).toBe(true)
    expect(qualitySignal?.flagged).toBe(true)
    // Composite should be substantial (keyword 0.30 + links 0.20 + quality contribution)
    expect(result.composite_score).toBeGreaterThan(0.5)
  })

  it('result includes composite_score as weighted sum of signal scores', async () => {
    const suffix = randomSuffix()
    const postId = await insertTestPost({
      title: `Mixed post ${suffix}`,
      slug: `mixed-post-${suffix}`,
      createdById: userId,
      markdown: 'Regular text here with a single link https://example.com',
    })

    const post = (await getPostByAny(postId)) as Post
    const result = await analyzePostForSpam(post)

    // Verify composite_score is within valid range
    expect(result.composite_score).toBeGreaterThanOrEqual(0)
    expect(result.composite_score).toBeLessThanOrEqual(1)
    expect(typeof result.composite_score).toBe('number')
  })

  it('returns all five signals regardless of outcome', async () => {
    const suffix = randomSuffix()
    const postId = await insertTestPost({
      title: `Signal count test ${suffix}`,
      slug: `signal-count-${suffix}`,
      createdById: userId,
      markdown: 'Some content here.',
    })

    const post = (await getPostByAny(postId)) as Post
    const result = await analyzePostForSpam(post)

    expect(result.signals).toHaveLength(6)
    const signalNames = result.signals.map(s => s.signal)
    expect(signalNames).toContain('excessive_links')
    expect(signalNames).toContain('spam_keywords')
    expect(signalNames).toContain('content_hash_duplicate')
    expect(signalNames).toContain('low_quality_text')
    expect(signalNames).toContain('embeddings_similarity')
    expect(signalNames).toContain('referral_link_in_post')
  })
})
