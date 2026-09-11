import { it, expect, beforeAll, describe } from 'vitest'
import '@services/referral-program-link-validations'
import '../register-post-related-urls-guard.mts'
import { createPost } from '../create.mts'
import { createLinkPost } from '../create-link-post.mts'
import { getPostByAny } from '../get.mts'
import { updatePost } from '../update.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserWithAge,
  insertTestCard,
  insertTestTopic,
} from '@voucha/test-helpers'
import { addUrl } from '@services/urls'
import type { PrivateUser } from '@services/users/types'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { ValkeyBloomFilter } from '@data-stores/valkey'
import { OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN } from '@modules/on-error/error-codes'

describe('create.generated', () => {
  let user: PrivateUser
  let admin: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    admin = await createTestUser({ administrator: true })
  })
  it('createPost creates a discussion post', async () => {
    const post = await createPost(user, {
      title: 'Test Discussion',
      markdown: 'Test content',
      post_type: 'discussion',
    })
    expect(post).toBeDefined()
    expect(post.title).toBe('Test Discussion')
    expect(post.post_type).toBe('discussion')
    expect(post.clearance_status).toBe('pending')
    expect(post.created_at).toBeInstanceOf(Date)
  })

  it('createPost immediately approves admin-created posts', async () => {
    const post = await createPost(admin, {
      title: 'Admin Discussion',
      markdown: 'Trusted admin content',
      post_type: 'discussion',
    })

    expect(post.clearance_status).toBe('approved')
  })

  it('createPost creates link post with url_id', async () => {
    const url = await addUrl(null, 'https://example.com/test-post')
    const post = await createPost(user, {
      title: 'Post with URL',
      url_id: url!.id,
      post_type: 'link',
    })
    expect(post).toBeDefined()
    expect(post.post_type).toBe('link')
    expect(post.url_id).toBe(url!.id)
    const retrieved = await getPostByAny(post.id)
    expect(retrieved).toBeDefined()
  })

  it('createLinkPost resolves title from URL when no title provided', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const href = `https://example-${random}.com/article`
    const url = await addUrl(null, href)
    const post = await createLinkPost(user, { url_id: url!.id })
    expect(post.post_type).toBe('link')
    expect(post.title).toBe(href)
  })

  it('createPost creates link post with url string resolves via addUrl', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const href = `https://example-${random}.com/page`
    const post = await createPost(user, {
      post_type: 'link',
      url: href,
      title: 'Link via url string',
    })
    expect(post.post_type).toBe('link')
    expect(post.url_id).toBeDefined()
  })

  it('createPost falls back to url as title for link posts with no title', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const href = `https://example-${random}.com/notitle`
    const post = await createPost(user, {
      post_type: 'link',
      url: href,
      title: '',
    })
    expect(post.post_type).toBe('link')
    expect(post.url_id).toBeDefined()
    expect(post.title).toBe(href)
  })

  it('createPost creates review post with topic and rating', async () => {
    // Create a topic first
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user.id,
    })
    const post = await createPost(user, {
      title: 'Review Post',
      post_type: 'review',
      markdown:
        'This credit card offers outstanding travel rewards that I have been enjoying for over a year. The annual fee is completely justified by the generous sign-up bonus and ongoing perks. Customer service has been excellent whenever I needed assistance with my account.',
      review_topic_ratings: [{ topic_id: topicId, rating: 5 }],
    })
    expect(post).toBeDefined()
    expect(post.post_type).toBe('review')
  })

  it('createPost creates post with custom slug', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const slug = `custom-slug-${random}`
    const post = await createPost(user, {
      title: 'Custom Slug Post',
      slug,
    })
    const retrieved = await getPostByAny(slug)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(post.id)
  })

  it('createPost throws error for invalid rating', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user.id,
    })
    await expect(
      createPost(user, {
        title: 'Invalid Review',
        post_type: 'review',
        markdown:
          'This credit card offers outstanding travel rewards that I have been enjoying for over a year. The annual fee is completely justified by the generous sign-up bonus and ongoing perks. Customer service has been excellent whenever I needed assistance with my account.',
        review_topic_ratings: [{ topic_id: topicId, rating: 10 }], // Invalid rating
      }),
    ).rejects.toThrow('Rating must be an integer between 1 and 5')
  })

  it('createPost schedules slug addition to posts bloom filter', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const originalPostsBloomFilter = entityCacheBloomFilters.posts
    const originalConfig = originalPostsBloomFilter.getConfig()
    const testPostsBloomFilter = new ValkeyBloomFilter({
      name: `posts-create-test-${random}`,
      capacity: 1_000,
      errorRate: originalConfig.errorRate,
      batchSize: originalConfig.batchSize,
    })
    const slug = `bloom-test-slug-${random}`

    entityCacheBloomFilters.posts = testPostsBloomFilter
    try {
      await testPostsBloomFilter.delete()
      await testPostsBloomFilter.ensureExists()

      await createPost(user, {
        title: 'Bloom Filter Slug Test',
        slug,
      })

      await expect.poll(() => testPostsBloomFilter.exists(slug.toLowerCase())).toBe(true)
    } finally {
      entityCacheBloomFilters.posts = originalPostsBloomFilter
      await testPostsBloomFilter.delete().catch(() => {})
    }
  })

  it('updatePost schedules slug addition to posts bloom filter', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const post = await createPost(user, {
      title: 'Bloom Filter Slug Update Test',
    })
    const originalPostsBloomFilter = entityCacheBloomFilters.posts
    const originalConfig = originalPostsBloomFilter.getConfig()
    const testPostsBloomFilter = new ValkeyBloomFilter({
      name: `posts-update-test-${random}`,
      capacity: 1_000,
      errorRate: originalConfig.errorRate,
      batchSize: originalConfig.batchSize,
    })
    const slug = `bloom-update-slug-${random}`

    entityCacheBloomFilters.posts = testPostsBloomFilter
    try {
      await testPostsBloomFilter.delete()
      await testPostsBloomFilter.ensureExists()

      await updatePost(user, post, { slug })

      await expect.poll(() => testPostsBloomFilter.exists(slug.toLowerCase())).toBe(true)
    } finally {
      entityCacheBloomFilters.posts = originalPostsBloomFilter
      await testPostsBloomFilter.delete().catch(() => {})
    }
  })

  it('createPost defaults to discussion type', async () => {
    const post = await createPost(user, {
      title: 'Default Type Post',
    })
    expect(post.post_type).toBe('discussion')
  })

  it('createPost accepts multiple data point topics resolved in one batch', async () => {
    const dataPointUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const topicA = await insertTestCard({ createdById: dataPointUser.id })
    const topicB = await insertTestCard({ createdById: dataPointUser.id })

    const post = await createPost(dataPointUser, {
      post_type: 'data_point',
      title: 'Batched data point topic validation',
      data_point_vertical: 'credit_card',
      structured_data: {
        vertical: 'credit_card',
        schema_version: 1,
        currency: 'usd',
        topic_ids: [topicA, topicB],
        result: 'approved',
        credit_score_range: '740-799',
      },
    })

    expect((post!.structured_data as { topic_ids: string[] }).topic_ids).toEqual([topicA, topicB])
  })

  it('createPost rejects official accounts creating data points', async () => {
    const topicId = await insertTestCard({ createdById: admin.id })

    await expect(
      createPost(admin, {
        post_type: 'data_point',
        title: 'Official account data point',
        data_point_vertical: 'credit_card',
        structured_data: {
          vertical: 'credit_card',
          schema_version: 1,
          currency: 'usd',
          topic_ids: [topicId],
          result: 'approved',
          credit_score_range: '740-799',
        },
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
      message: 'Official accounts cannot create community reviews or data points.',
    })
  })

  it('createPost rejects recommendation workflows in the generic post service', async () => {
    await expect(
      createPost(user, {
        title: 'Should Fail',
        markdown: 'Use the dedicated workflow',
        post_type: 'topic_recommendation',
      }),
    ).rejects.toThrow('Use the dedicated recommendation workflow')
  })
})
