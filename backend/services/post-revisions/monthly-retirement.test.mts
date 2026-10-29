import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { readTestPostRevisionChild } from '@voucha/test-helpers/entities/post-revisions'
import { createPostRevision } from './index.mts'

describe('monthly post revisions', () => {
  it('routes a new revision to a bootstrap child', async () => {
    const user = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const postId = await insertTestPost({
      title: `Monthly revision ${suffix}`,
      slug: `monthly-revision-${suffix}`,
      createdById: user.id,
      markdown: 'Current post',
    })
    const revision = await createPostRevision(
      postId,
      'update',
      { title: { before: 'Before', after: 'After' } },
      user.id,
    )
    expect(await readTestPostRevisionChild(revision.id)).toBe(
      `post_revisions__p_${revision.created_at.getUTCFullYear()}_${String(
        revision.created_at.getUTCMonth() + 1,
      ).padStart(2, '0')}`,
    )
  })
})
