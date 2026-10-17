import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { getRelatablePostIds } from './post-access.mts'

describe('relation post role visibility', () => {
  it('allows an author to use a pending community post as a subject without exposing it as an object', async () => {
    const author = await createTestUser()
    const community = await insertTestCommunity({ createdById: author.id })
    const pending = await createTestPost({ user: author, community_id: community.id })
    const publicPost = await createTestPost({ user: author })
    const result = await getRelatablePostIds(
      { kind: 'user', userId: author.id, staffRole: null },
      {
        subjectIds: [pending.id, publicPost.id, pending.id],
        objectIds: [pending.id, publicPost.id, publicPost.id],
      },
    )
    expect(result.subjectIds).toEqual(new Set([pending.id, publicPost.id]))
    expect(result.objectIds).toEqual(new Set([publicPost.id]))
  })

  it('keeps private posts hidden in both roles and handles either empty role', async () => {
    const author = await createTestUser()
    const privatePost = await createTestPost({
      user: author,
      privacy: 'private',
      broadcast: 'followers',
    })
    const publicPost = await createTestPost({ user: author })
    const anonymous = { kind: 'anonymous' } as const
    const ids = [privatePost.id, publicPost.id]
    const subjectOnly = await getRelatablePostIds(anonymous, { subjectIds: ids, objectIds: [] })
    const objectOnly = await getRelatablePostIds(anonymous, { subjectIds: [], objectIds: ids })
    expect(subjectOnly).toEqual({ subjectIds: new Set([publicPost.id]), objectIds: new Set() })
    expect(objectOnly).toEqual({ subjectIds: new Set(), objectIds: new Set([publicPost.id]) })
    expect(await getRelatablePostIds(anonymous, { subjectIds: [], objectIds: [] })).toEqual({
      subjectIds: new Set(),
      objectIds: new Set(),
    })
  })
})
