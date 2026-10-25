import { randomBytes, randomUUID } from 'node:crypto'
import { createTestUuidWindow } from '@voucha/test-helpers/uuid-window'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestEmbeddings,
  insertTestPost,
  makeRandomEmbedding,
  setPostEmbeddingContentOnlySha256,
} from '@voucha/test-helpers'
import { getPostEmbeddingData } from '@voucha/test-helpers/entities/posts-embeddings'
import { deletePost } from '@services/posts/delete'
import { getPostByAny } from '@services/posts/get'
import {
  anonymizeTestAuthorPostBatch,
  createTestBanEvasionEmbeddingChain,
  getTestBanEvasionJobsFor,
} from '@voucha/test-helpers/post-ban-evasion-embeddings'
import { DELETED_USER_ID } from '../../../types/entities/user-constants.mts'
import {
  decodeScopedUuidCursor,
  decodeUuidCursor,
  encodeScopedUuidCursor,
  isSimpleCursor,
} from '@modules/pagination'
import { encodeUuidCursorBefore } from '@voucha/test-helpers/modules/pagination/uuid-cursors'
import {
  enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts,
  enqueueBanEvasionDetectionForEmbeddedFirstCommunityPosts,
} from '@services/posts/ban-evasion-embedding-enqueues'
import { detectBanEvasionForMember, isFirstCommunityPost } from '@services/communities/ban-evasion'
import {
  applyPostBatchUpdates,
  copyExistingPostEmbeddings,
} from '@services/bedrock-embeddings-batch/entities/posts'
import { copyExistingEmbeddings, copyExistingLockClause } from './reconcile-existing.mts'

function scopedCursorBefore(id: string, scope: string): string {
  const before = decodeUuidCursor(encodeUuidCursorBefore(id), isSimpleCursor, 'Invalid cursor')
  return encodeScopedUuidCursor(before.id, scope)
}

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

    await expect(
      copyExistingPostEmbeddings({
        after: scopedCursorBefore(postId, 'embedding-reconciliation:posts:id-asc'),
        limit: 1,
      }),
    ).resolves.toMatchObject({ updatedIds: [postId] })

    await expect(getTestBanEvasionJobsFor(community.id, member.id)).resolves.toHaveLength(1)
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

    await expect(
      copyExistingEmbeddings('posts', {
        after: scopedCursorBefore(postId, 'embedding-reconciliation:posts:id-asc'),
        limit: 1,
      }),
    ).resolves.toMatchObject({
      updatedIds: expect.arrayContaining([postId]),
    })
    await enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts({
      after: scopedCursorBefore(postId, 'ban-evasion:post-embedding:pending:id-asc'),
      limit: 1,
    })

    await expect(getTestBanEvasionJobsFor(community.id, member.id)).resolves.toHaveLength(1)
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

    await expect(getTestBanEvasionJobsFor(community.id, member.id)).resolves.toHaveLength(1)
  })

  it('advances an empty recovery page and retries a skipped post after the earlier post is deleted', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const otherMember = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    const suffix = randomUUID().slice(0, 8)
    const window = createTestUuidWindow()
    const makePost = (id: string, userId: string, label: string, communityId: string | null) =>
      insertTestPost({
        id,
        title: `${label} ${suffix}`,
        slug: `${label.toLowerCase()}-${suffix}`,
        markdown: `${label} body`,
        createdById: userId,
        communityId,
        postType: 'article',
      })
    const first = await makePost(window.firstId, member.id, 'First', community.id)
    const nonFirst = await makePost(window.secondId, member.id, 'Second', community.id)
    const nextFirst = await makePost(window.thirdId, otherMember.id, 'Third', community.id)
    const postIds = [first, nonFirst, nextFirst]
    const hashes = postIds.map(() => randomBytes(32))
    await Promise.all(postIds.map((id, i) => setPostEmbeddingContentOnlySha256(id, hashes[i]!)))
    await insertTestEmbeddings(hashes.map(content_sha256 => ({ content_sha256 })))
    const scope = 'embedding-reconciliation:posts:id-asc'
    for (const id of postIds) {
      const copied = await copyExistingEmbeddings('posts', {
        after: scopedCursorBefore(id, scope),
        limit: 1,
      })
      expect(copied.updatedIds).toContain(id)
    }

    const recoveryScope = 'ban-evasion:post-embedding:pending:id-asc'
    const firstRecovery = await enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts({
      after: scopedCursorBefore(first, recoveryScope),
      limit: 1,
    })
    expect(firstRecovery.scannedCount).toBe(1)
    expect(
      decodeScopedUuidCursor(firstRecovery.nextCursor!, recoveryScope, 'Invalid cursor').id,
    ).toBe(first)
    expect(firstRecovery.enqueuedCount).toBe(1)
    const skipped = await enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts({
      after: scopedCursorBefore(nonFirst, recoveryScope),
      limit: 1,
    })
    expect(skipped.scannedCount).toBe(1)
    expect(skipped.enqueuedCount).toBe(0)
    expect(decodeScopedUuidCursor(skipped.nextCursor!, recoveryScope, 'Invalid cursor').id).toBe(
      nonFirst,
    )
    await expect(getPostEmbeddingData(nonFirst)).resolves.toMatchObject({
      ban_evasion_post_embedding_input_sha: hashes[1],
    })
    const continued = await enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts({
      after: scopedCursorBefore(nonFirst, recoveryScope),
      limit: 1,
    })
    expect(continued.scannedCount).toBe(1)
    expect(continued.enqueuedCount).toBe(1)
    expect(decodeScopedUuidCursor(continued.nextCursor!, recoveryScope, 'Invalid cursor').id).toBe(
      nextFirst,
    )
    await expect(getTestBanEvasionJobsFor(community.id, member.id)).resolves.toHaveLength(1)
    await expect(getTestBanEvasionJobsFor(community.id, otherMember.id)).resolves.toHaveLength(1)

    const firstPost = await getPostByAny(first)
    if (!firstPost) throw new Error('Expected the earlier community post')
    await deletePost(member, firstPost)
    await expect(getPostEmbeddingData(nonFirst)).resolves.toMatchObject({
      ban_evasion_post_embedding_input_sha: null,
    })
    const retry = await enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts({
      after: scopedCursorBefore(nonFirst, recoveryScope),
      limit: 1,
    })
    expect(retry.enqueuedCount).toBe(1)
    await expect(getTestBanEvasionJobsFor(community.id, member.id)).resolves.toHaveLength(2)
  })

  it('does not reconsider posts moved to the deleted-author tombstone by bounded author deletion', async () => {
    const fixture = await createTestBanEvasionEmbeddingChain()
    const communityId = fixture.skipped[0]!.community_id
    for (let batch = 0; batch < fixture.skipped.length + 1; batch++) {
      await expect(
        anonymizeTestAuthorPostBatch(fixture.author.id, fixture.author.username!),
      ).resolves.toMatchObject({ processed: 1 })
    }
    const tombstonePostIds = [fixture.firstId, ...fixture.skipped.map(row => row.id)]
    await enqueueBanEvasionDetectionForEmbeddedFirstCommunityPosts(tombstonePostIds)
    const recovery = await enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts({
      after: scopedCursorBefore(fixture.firstId, 'ban-evasion:post-embedding:pending:id-asc'),
      limit: 1,
    })
    const nextId = recovery.nextCursor
      ? decodeScopedUuidCursor(
          recovery.nextCursor,
          'ban-evasion:post-embedding:pending:id-asc',
          'Invalid cursor',
        ).id
      : null
    expect(tombstonePostIds).not.toContain(nextId)
    await expect(isFirstCommunityPost(communityId, DELETED_USER_ID, fixture.firstId)).resolves.toBe(
      false,
    )
    await expect(
      detectBanEvasionForMember(communityId, DELETED_USER_ID, fixture.firstId),
    ).resolves.toMatchObject({ flagged: false, combinedScore: 0 })
    await expect(getTestBanEvasionJobsFor(communityId, DELETED_USER_ID)).resolves.toHaveLength(0)
  })
})
