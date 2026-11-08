import { describe, it, expect, beforeAll } from 'vitest'
import { checkContentHashDuplicate } from '../duplicate-signals.mts'
import {
  createTestUser,
  insertTestPost,
  setPostModerationContentSha256,
  safeUsername,
} from '@voucha/test-helpers'
import { createPostModerationContent } from '@services/posts/content'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'

const DAY_MS = 86_400_000

/** A post id minted far outside every lookback ceiling, unique per call. */
const oldPostId = () =>
  getMinUUIDv7ForDate(new Date(Date.now() - 400 * DAY_MS - Math.random() * 1e8))

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('checkContentHashDuplicate', () => {
  let userId1: string
  let userId2: string

  beforeAll(async () => {
    const u1 = await createTestUser({ username: safeUsername('spam-hash-u1') })
    const u2 = await createTestUser({ username: safeUsername('spam-hash-u2') })
    userId1 = u1!.id
    userId2 = u2!.id
  })

  it('unique content — not flagged', async () => {
    const suffix = randomSuffix()
    const postId = await insertTestPost({
      title: `Unique post ${suffix}`,
      slug: `unique-post-${suffix}`,
      createdById: userId1,
      markdown: `Unique content that nobody else has written ${suffix}`,
    })

    const { content_sha256 } = createPostModerationContent({
      title: `Unique post ${suffix}`,
      markdown: `Unique content that nobody else has written ${suffix}`,
      images: [],
    })

    await setPostModerationContentSha256(postId, content_sha256)

    const result = await checkContentHashDuplicate(content_sha256, userId1)
    expect(result.flagged).toBe(false)
    expect(result.score).toBe(0)
  })

  it('same content from different user — flagged', async () => {
    const suffix = randomSuffix()
    const sharedTitle = `Shared title ${suffix}`
    const sharedMarkdown = `Shared markdown ${suffix}`

    const { content_sha256 } = createPostModerationContent({
      title: sharedTitle,
      markdown: sharedMarkdown,
      images: [],
    })

    const post1Id = await insertTestPost({
      title: sharedTitle,
      slug: `shared-post-1-${suffix}`,
      createdById: userId1,
      markdown: sharedMarkdown,
    })
    await setPostModerationContentSha256(post1Id, content_sha256)

    const result = await checkContentHashDuplicate(content_sha256, userId2)
    expect(result.flagged).toBe(true)
    expect(result.score).toBe(1.0)
  })

  it('same content from same user — not flagged', async () => {
    const suffix = randomSuffix()
    const title = `Same user post ${suffix}`
    const markdown = `Same user content ${suffix}`

    const { content_sha256 } = createPostModerationContent({ title, markdown, images: [] })

    const postId = await insertTestPost({
      title,
      slug: `same-user-post-${suffix}`,
      createdById: userId1,
      markdown,
    })
    await setPostModerationContentSha256(postId, content_sha256)

    const result = await checkContentHashDuplicate(content_sha256, userId1)
    expect(result.flagged).toBe(false)
  })

  it('same content from different user older than the lookback window — not flagged', async () => {
    const suffix = randomSuffix()
    const title = `Old shared post ${suffix}`
    const markdown = `Old shared markdown ${suffix}`
    const { content_sha256 } = createPostModerationContent({ title, markdown, images: [] })

    const oldId = await insertTestPost({
      id: oldPostId(),
      title,
      slug: `old-shared-${suffix}`,
      createdById: userId1,
      markdown,
    })
    await setPostModerationContentSha256(oldId, content_sha256)

    const result = await checkContentHashDuplicate(content_sha256, userId2)
    expect(result.flagged).toBe(false)
  })
})
