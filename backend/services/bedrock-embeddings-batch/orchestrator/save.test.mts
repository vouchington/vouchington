import { randomBytes, randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestEmbeddings,
  insertTestPost,
  makeRandomEmbedding,
  setPostEmbeddingContentOnlySha256,
  setPostDeletedForTest,
} from '@voucha/test-helpers'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { ban_evasion } from '@queues/ban-evasion/queues'
import { enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts } from '@services/communities/ban-evasion'
import {
  applyPostBatchUpdates,
  copyExistingPostEmbeddings,
} from '@services/bedrock-embeddings-batch/entities/posts'
import { copyExistingEmbeddings, copyExistingLockClause } from './reconcile-existing.mts'

describe('copyExistingLockClause', () => {
  it('uses typed lock checks for topic, post, and RSS feed item tables', () => {
    expect(copyExistingLockClause('topics')).toContain('e.topic_id = topics.id')
    expect(copyExistingLockClause('posts')).toContain('e.post_id = posts.id')
    expect(copyExistingLockClause('rss_feed_items')).toContain(
      'e.rss_feed_item_id = rss_feed_items.id',
    )
  })

  it('uses composite typed lock checks for crawl chunks', () => {
    expect(copyExistingLockClause('crawl_chunks')).toContain(
      '(e.crawl_id, e.crawl_order_index) = (crawl_chunks.crawl_id, crawl_chunks.order_index)',
    )
  })
})

describe('post embedding batch ban-evasion follow-up', () => {
  beforeEach(async () => {
    await ban_evasion.obliterate({ force: true })
  })

  it('enqueues detection when copying an existing embedding onto a first community post', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id }),
    ])
    const suffix = randomUUID().slice(0, 8)
    const postId = await insertTestPost({
      title: `Copy existing post ${suffix}`,
      slug: `copy-existing-post-${suffix}`,
      markdown: 'Copy cached post embedding.',
      createdById: member.id,
      communityId: community.id,
      postType: 'article',
    })
    const contentSha256 = randomBytes(32)
    await setPostEmbeddingContentOnlySha256(postId, contentSha256)
    await insertTestEmbeddings([
      {
        content_sha256: contentSha256,
        embedding: makeRandomEmbedding(),
      },
    ])

    await copyExistingPostEmbeddings()

    await expect(getBanEvasionJobsFor(community.id, member.id)).resolves.toHaveLength(1)
  })

  it('enqueues detection when retrying after a cached post embedding was copied without enqueueing', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id }),
    ])
    const suffix = randomUUID().slice(0, 8)
    const postId = await insertTestPost({
      title: `Retry copied post ${suffix}`,
      slug: `retry-copied-post-${suffix}`,
      markdown: 'Retry copied cached post embedding.',
      createdById: member.id,
      communityId: community.id,
      postType: 'article',
    })
    const contentSha256 = randomBytes(32)
    await setPostEmbeddingContentOnlySha256(postId, contentSha256)
    await insertTestEmbeddings([
      {
        content_sha256: contentSha256,
        embedding: makeRandomEmbedding(),
      },
    ])

    await expect(copyExistingEmbeddings('posts')).resolves.toMatchObject({
      updatedIds: expect.arrayContaining([postId]),
    })
    await enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts()

    await expect(getBanEvasionJobsFor(community.id, member.id)).resolves.toHaveLength(1)
  })

  it('enqueues detection when applying batch results to a first community post', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id }),
    ])
    const suffix = randomUUID().slice(0, 8)
    const postId = await insertTestPost({
      title: `Apply batch post ${suffix}`,
      slug: `apply-batch-post-${suffix}`,
      markdown: 'Apply batch post embedding.',
      createdById: member.id,
      communityId: community.id,
      postType: 'article',
    })
    const contentSha256 = randomBytes(32)
    await setPostEmbeddingContentOnlySha256(postId, contentSha256)

    await applyPostBatchUpdates([
      {
        entity_id: postId,
        content_sha256: contentSha256,
        embedding: makeRandomEmbedding(),
        input_token_count: 7,
      },
    ])

    await expect(getBanEvasionJobsFor(community.id, member.id)).resolves.toHaveLength(1)
  })

  it('advances past a non-first embedded post and retries it after the earlier post is deleted', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const otherMember = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    const suffix = randomUUID().slice(0, 8)
    const makePost = (userId: string, label: string, communityId: string | null) =>
      insertTestPost({
        title: `${label} ${suffix}`,
        slug: `${label.toLowerCase()}-${suffix}`,
        markdown: `${label} body`,
        createdById: userId,
        communityId,
        postType: 'article',
      })
    const boundary = await makePost(member.id, 'Boundary', null)
    const first = await makePost(member.id, 'First', community.id)
    const nonFirst = await makePost(member.id, 'Second', community.id)
    const nextFirst = await makePost(otherMember.id, 'Third', community.id)
    const postIds = [first, nonFirst, nextFirst]
    const hashes = postIds.map(() => randomBytes(32))
    await Promise.all(postIds.map((id, i) => setPostEmbeddingContentOnlySha256(id, hashes[i]!)))
    await insertTestEmbeddings(hashes.map(content_sha256 => ({ content_sha256 })))
    const scope = 'embedding-reconciliation:posts:id-asc'
    const copied = await copyExistingEmbeddings('posts', {
      after: encodeScopedUuidCursor(boundary, scope),
      limit: 100,
    })
    expect(copied.updatedIds).toEqual(expect.arrayContaining(postIds))

    const recoveryScope = 'ban-evasion:post-embedding:pending:id-asc'
    let after = encodeScopedUuidCursor(boundary, recoveryScope)
    let sawNonFirst = false
    let sawNextFirst = false
    let nonFirstEnqueuedCount: number | undefined
    let nextFirstEnqueuedCount: number | undefined
    for (let page = 0; page < 30 && !sawNextFirst; page += 1) {
      const result = await enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts({
        after,
        limit: 1,
      })
      expect(result.scannedCount).toBe(1)
      after = result.nextCursor!
      const candidate = decodeScopedUuidCursor(after, recoveryScope, 'Invalid cursor').id
      if (candidate === nonFirst) {
        sawNonFirst = true
        nonFirstEnqueuedCount = result.enqueuedCount
      }
      if (candidate === nextFirst) {
        sawNextFirst = true
        nextFirstEnqueuedCount = result.enqueuedCount
      }
    }
    expect(sawNonFirst).toBe(true)
    expect(sawNextFirst).toBe(true)
    expect(nonFirstEnqueuedCount).toBe(0)
    expect(nextFirstEnqueuedCount).toBe(1)
    await expect(getBanEvasionJobsFor(community.id, member.id)).resolves.toHaveLength(1)
    await expect(getBanEvasionJobsFor(community.id, otherMember.id)).resolves.toHaveLength(1)

    await setPostDeletedForTest(first)
    const retry = await enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts({
      after: encodeScopedUuidCursor(boundary, recoveryScope),
      limit: 100,
    })
    expect(retry.enqueuedCount).toBeGreaterThanOrEqual(1)
    await expect(getBanEvasionJobsFor(community.id, member.id)).resolves.toHaveLength(2)
  })
})

async function getBanEvasionJobsFor(communityId: string, userId: string) {
  const jobs = (
    await Promise.all([
      ban_evasion.getJobs('waiting'),
      ban_evasion.getJobs('active'),
      ban_evasion.getJobs('completed'),
      ban_evasion.getJobs('failed'),
      ban_evasion.getJobs('delayed'),
    ])
  ).flat()
  return jobs.filter(job => {
    const data = job.data as { communityId?: string; userId?: string }
    return data.communityId === communityId && data.userId === userId
  })
}
