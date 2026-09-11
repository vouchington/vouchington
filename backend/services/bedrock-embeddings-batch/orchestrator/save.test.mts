import { randomBytes, randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  createTestUserDirect,
  getTopicEmbeddingReference,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestEmbeddings,
  insertTestPost,
  insertTestTopic,
  makeRandomEmbedding,
  setPostEmbeddingContentOnlySha256,
  setTopicEmbeddingContentSha256,
} from '@voucha/test-helpers'
import { ban_evasion } from '@queues/ban-evasion/queues'
import {
  applyPostBatchUpdates,
  copyExistingPostEmbeddings,
} from '@services/bedrock-embeddings-batch/entities/posts'
import { copyExistingEmbeddings, copyExistingLockClause } from './save.mts'

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

  it('does not add a batch-lock predicate for support messages', () => {
    expect(copyExistingLockClause('support_messages')).toBe('')
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

    await expect(copyExistingEmbeddings('posts', { excludeDeleted: true })).resolves.toContain(
      postId,
    )
    await copyExistingPostEmbeddings()

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

describe('copyExistingEmbeddings', () => {
  it('skips locked rows while copying other cached embeddings', async () => {
    const user = await createTestUserDirect()
    const suffix = randomUUID().slice(0, 8)
    const lockedTopicId = await insertTestTopic({
      name: `Copy Existing Locked ${suffix}`,
      slug: `copy-existing-locked-${suffix}`,
      createdById: user.id,
    })
    const copiedTopicId = await insertTestTopic({
      name: `Copy Existing Unlocked ${suffix}`,
      slug: `copy-existing-unlocked-${suffix}`,
      createdById: user.id,
    })
    const lockedContentSha256 = randomBytes(32)
    const copiedContentSha256 = randomBytes(32)
    await setTopicEmbeddingContentSha256(lockedTopicId, lockedContentSha256)
    await setTopicEmbeddingContentSha256(copiedTopicId, copiedContentSha256)
    await insertTestEmbeddings([
      {
        content_sha256: lockedContentSha256,
        embedding: makeRandomEmbedding(),
      },
      {
        content_sha256: copiedContentSha256,
        embedding: makeRandomEmbedding(),
      },
    ])

    await using query = await beginTransaction()

    await query(`SELECT id FROM topics WHERE id = $1 FOR UPDATE`, [lockedTopicId])

    await expect(copyExistingEmbeddings('topics', { excludeDeleted: true })).resolves.toContain(
      copiedTopicId,
    )

    await query.commit()

    await expect(getTopicEmbeddingReference(lockedTopicId)).resolves.toMatchObject({
      bedrock_nova_multimodal_v1_embedding_created_at: null,
    })
    await expect(getTopicEmbeddingReference(copiedTopicId)).resolves.toMatchObject({
      bedrock_nova_multimodal_v1_content_sha256: copiedContentSha256,
      bedrock_nova_multimodal_v1_embedding_created_at: expect.any(Date),
    })
  })

  it('selects the table-specific lock clause before copying cached embeddings', async () => {
    const user = await createTestUserDirect()
    const suffix = randomUUID().slice(0, 8)
    const topicId = await insertTestTopic({
      name: `Copy Existing Lock ${suffix}`,
      slug: `copy-existing-lock-${suffix}`,
      createdById: user.id,
    })
    const contentSha256 = randomBytes(32)
    await setTopicEmbeddingContentSha256(topicId, contentSha256)
    await insertTestEmbeddings([
      {
        content_sha256: contentSha256,
        embedding: makeRandomEmbedding(),
      },
    ])

    await expect(copyExistingEmbeddings('topics', { excludeDeleted: true })).resolves.toContain(
      topicId,
    )
    await expect(getTopicEmbeddingReference(topicId)).resolves.toMatchObject({
      bedrock_nova_multimodal_v1_content_sha256: contentSha256,
    })
  })
})
