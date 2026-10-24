import { createTestPost, createTestUser, hardDeleteTestPost } from '@voucha/test-helpers'
import { insertTestPostsForUser } from '@voucha/test-helpers/entities/posts-deletion'
import { insertTestCommunity } from '@voucha/test-helpers/entities/communities'
import {
  recordTestPostPublicationChange,
  testPublicationWorkAtPost,
} from '@voucha/test-helpers/post-publication-fixtures'
import { describe, expect, it } from 'vitest'
import {
  readPublicationAncestorRootHints,
  readPublicationPostScanFloor,
} from './candidate-root-hints.mts'
import { claimPostPublicationDirtyWork } from './dirty-work.mts'
import { readRawPublicationCandidatePage } from './raw-candidate-page.mts'

describe('publication ancestor root hints', () => {
  it('starts an ordinary new-root post scope at its live target', async () => {
    await createTestPost()
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    const target = await createTestPost({ user, community_id: community.id })
    const work = await recordTestPostPublicationChange({
      scope: { type: 'post', postId: target.id },
      reason: 'post_created',
      footprint: { priorAuthorUserId: user.id, priorCommunityId: community.id },
    })
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected new-root publication lease')
    expect(await readPublicationPostScanFloor(claimed)).toBe(target.id)
    expect((await readRawPublicationCandidatePage(claimed, 1)).postIds).toEqual([target.id])
  })

  it('includes older and deleted retained post identities in the floor', async () => {
    const older = await createTestPost()
    const target = await createTestPost()
    const work = await recordTestPostPublicationChange({
      scope: { type: 'post', postId: target.id },
      reason: 'post_updated',
      impactedPostIds: [older.id],
    })
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected retained-impact publication lease')
    expect(await readPublicationPostScanFloor(claimed)).toBe(older.id)
    expect((await readRawPublicationCandidatePage(claimed, 2)).postIds).toEqual([
      older.id,
      target.id,
    ])
    await hardDeleteTestPost(older.id)
    expect(await readPublicationPostScanFloor(claimed)).toBe(older.id)
    expect((await readRawPublicationCandidatePage(claimed, 2)).postIds).toEqual([target.id])
  })

  it('keeps the global scan when a retained community can seed an older post', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    const older = await createTestPost({ user, community_id: community.id })
    const target = await createTestPost({ user })
    const work = await recordTestPostPublicationChange({
      scope: { type: 'post', postId: target.id },
      reason: 'post_updated',
      impactedCommunityIds: [community.id],
    })
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected retained-community publication lease')
    expect(await readPublicationPostScanFloor(claimed)).toBeNull()
    expect((await readRawPublicationCandidatePage(claimed, 2)).postIds).toEqual([
      older.id,
      target.id,
    ])
  })

  it('keeps the live target root when a retained nonroot post was deleted', async () => {
    const user = await createTestUser()
    const target = await createTestPost({ user })
    const impactedRoot = await createTestPost({ user })
    const impactedPost = await createTestPost({
      user,
      parent_post_id: impactedRoot.id,
      post_type: 'comment',
    })
    const work = await recordTestPostPublicationChange({
      scope: { type: 'post', postId: target.id },
      reason: 'post_updated',
      impactedPostIds: [impactedPost.id],
    })
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected publication work lease')
    expect(await readPublicationAncestorRootHints(claimed)).toEqual(
      new Set([target.id, impactedRoot.id]),
    )
    expect(
      await readPublicationAncestorRootHints({
        ...claimed,
        generation: String(BigInt(claimed.generation) + 1n),
      }),
    ).toBeNull()
    expect(
      await readPublicationPostScanFloor({
        ...claimed,
        generation: String(BigInt(claimed.generation) + 1n),
      }),
    ).toBeNull()
    await hardDeleteTestPost(impactedPost.id)
    expect(await readPublicationAncestorRootHints(claimed)).toEqual(new Set([target.id]))
  })

  it('falls back to the exact walk when retained post impacts exceed the hint budget', async () => {
    const user = await createTestUser()
    const target = await createTestPost({ user })
    const retainedRoots = await insertTestPostsForUser(user.id, 100)
    const impactedRoot = await createTestPost({ user })
    const impactedPost = await createTestPost({
      user,
      parent_post_id: impactedRoot.id,
      post_type: 'comment',
    })
    const descendant = await createTestPost({
      user,
      parent_post_id: impactedPost.id,
      post_type: 'comment',
    })
    const work = await recordTestPostPublicationChange({
      scope: { type: 'post', postId: target.id },
      reason: 'post_updated',
      impactedPostIds: [...retainedRoots, impactedPost.id],
    })
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected publication work lease')
    expect(await readPublicationAncestorRootHints(claimed)).toBeNull()
    expect(await readPublicationPostScanFloor(claimed)).toBeNull()
    const page = await readRawPublicationCandidatePage(
      testPublicationWorkAtPost(claimed, descendant.id),
      1,
    )
    expect(page.postIds).toEqual([descendant.id])
  })
})
