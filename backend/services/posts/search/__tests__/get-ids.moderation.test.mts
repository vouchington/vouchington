import { it, expect, describe } from 'vitest'
import { getPostIds } from '../get-ids.mts'
import { createTestPost, createTestUser, markPostFlaggedForModeration } from '@voucha/test-helpers'

describe('get-ids (moderation)', () => {
  it('getPostIds hides flagged posts from anonymous users', async () => {
    const user = await createTestUser()
    const normalPost = await createTestPost({ user })
    const flaggedPost = await createTestPost({ user })

    await markPostFlaggedForModeration(flaggedPost.id)

    const result = await getPostIds(undefined, { user_id: user!.id, limit: 100 })

    const foundNormal = result.results.find(r => r.id === normalPost.id)
    const foundFlagged = result.results.find(r => r.id === flaggedPost.id)

    expect(foundNormal).toBeDefined()
    expect(foundFlagged).toBeUndefined()
  })

  it('getPostIds shows flagged posts to post owner', async () => {
    const user = await createTestUser()
    const normalPost = await createTestPost({ user })
    const flaggedPost = await createTestPost({ user })

    await markPostFlaggedForModeration(flaggedPost.id)

    const result = await getPostIds(user || undefined, { user_id: user!.id, limit: 100 })

    const foundNormal = result.results.find(r => r.id === normalPost.id)
    const foundFlagged = result.results.find(r => r.id === flaggedPost.id)

    expect(foundNormal).toBeDefined()
    expect(foundFlagged).toBeDefined()
  })

  it('getPostIds hides flagged posts from non-owner authenticated users', async () => {
    const owner = await createTestUser()
    const viewer = await createTestUser()
    const normalPost = await createTestPost({ user: owner })
    const flaggedPost = await createTestPost({ user: owner })

    await markPostFlaggedForModeration(flaggedPost.id)

    const result = await getPostIds(viewer || undefined, { user_id: owner!.id, limit: 100 })

    const foundNormal = result.results.find(r => r.id === normalPost.id)
    const foundFlagged = result.results.find(r => r.id === flaggedPost.id)

    expect(foundNormal).toBeDefined()
    expect(foundFlagged).toBeUndefined()
  })

  it('getPostIds shows all posts to admins including flagged ones', async () => {
    const owner = await createTestUser()
    const updatedAdmin = await createTestUser({ administrator: true })

    const normalPost = await createTestPost({ user: owner })
    const flaggedPost = await createTestPost({ user: owner })

    await markPostFlaggedForModeration(flaggedPost.id)

    const result = await getPostIds(updatedAdmin || undefined, { user_id: owner!.id, limit: 100 })

    const foundNormal = result.results.find(r => r.id === normalPost.id)
    const foundFlagged = result.results.find(r => r.id === flaggedPost.id)

    expect(foundNormal).toBeDefined()
    expect(foundFlagged).toBeDefined()
  })
})
