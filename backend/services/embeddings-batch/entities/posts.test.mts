import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  makeRandomEmbedding,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createTestPost } from '@voucha/test-helpers/services/posts/test-support'
import {
  getPostEmbeddingContentSha256,
  getPostEmbeddingData,
} from '@voucha/test-helpers/entities/posts-embeddings'
import { createTestTopicRecommendation } from '@voucha/test-helpers/topic-recommendation-fixtures'
import {
  prepareTopicRecommendation,
  updateTopicRecommendation,
} from '@services/topic-recommendations'
import { applyPostBatchUpdates, streamPendingPosts } from './posts.mts'

async function pendingPost(postId: string) {
  const hex = (BigInt(`0x${postId.replaceAll('-', '')}`) + 1n).toString(16).padStart(32, '0')
  const afterId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  for await (const row of streamPendingPosts({
    cursor: { sweepStartedAt: new Date(Date.now() + 60_000).toISOString(), afterId },
    limits: { batchSize: 1, maxRows: 1 },
  })) {
    if (row.id === postId) return row
  }
  return undefined
}

async function expectAppliedCurrentContent(postId: string) {
  const contentSha = await getPostEmbeddingContentSha256(postId)
  const row = await pendingPost(postId)
  expect(row?.id).toBe(postId)
  expect(row?.content_sha256).toEqual(contentSha)
  if (!row) throw new Error('Expected pending fixture post')
  await applyPostBatchUpdates([
    {
      entity_id: postId,
      content_sha256: row.content_sha256,
      embedding: makeRandomEmbedding(),
      input_token_count: 1,
    },
  ])
  expect((await getPostEmbeddingData(postId))?.input_sha).toEqual(contentSha)
  expect(await pendingPost(postId)).toBeUndefined()
}

describe('post batch canonical content parity', () => {
  it('applies a real data-point writer hash containing structured bonus requirements', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ topic_type: 'bank_account' })
    const post = await createTestPost({
      user,
      post_type: 'data_point',
      data_point_vertical: 'bank_account',
      title: `Structured embedding ${randomUUID()}`,
      structured_data: {
        vertical: 'bank_account',
        schema_version: 1,
        currency: 'usd',
        topic_ids: [topic.id],
        result: 'approved',
        bonus_requirements: `Synthetic deposit requirement ${randomUUID()}`,
      },
    })
    if (!post) throw new Error('Expected persisted data-point post')
    expect(post).toMatchObject({ post_type: 'data_point', structured_data: { result: 'approved' } })
    await expectAppliedCurrentContent(post.id)
  })

  it('keeps raw lone-surrogate input identical to the persisted UTF-8 document identity', async () => {
    const post = await createTestPost({
      title: `Unicode ${randomUUID()}\ud800`,
      markdown: 'Body with lone surrogate \udfff and remaining text.',
    })
    if (!post) throw new Error('Expected persisted Unicode fixture post')
    expect(post.title).toContain('\ufffd')
    await expectAppliedCurrentContent(post.id)
  })

  it.each(['create', 'update'] as const)(
    'applies recommendation %s hashes with an unordered hostname set',
    async phase => {
      const user = await createTestUser()
      const suffix = randomUUID()
      const primary = `z-${suffix}.example.com`
      const secondary = `a-${suffix}.example.com`
      let post = await createTestTopicRecommendation(
        prepareTopicRecommendation,
        user,
        WEB_PROVENANCE,
        {
          title: `Recommendation embedding ${suffix}`,
          markdown: 'Synthetic recommendation rationale',
          topic_title: `Recommended topic ${suffix}`,
          topic_slug: `recommended-${suffix}`,
          topic_hostname: primary,
          topic_hostnames: [primary, secondary],
        },
        { skipCreatedEvents: true },
      )
      if (phase === 'update') {
        post = await updateTopicRecommendation(user, post, {
          markdown: `Updated rationale ${suffix}`,
          topic_hostname: `z-updated-${suffix}.example.com`,
          topic_hostnames: [`z-updated-${suffix}.example.com`, `a-updated-${suffix}.example.com`],
        })
      }
      expect(post.topic_recommendation.hostname?.hostname).toBe(
        phase === 'update' ? `z-updated-${suffix}.example.com` : primary,
      )
      await expectAppliedCurrentContent(post.id)
    },
  )
})
