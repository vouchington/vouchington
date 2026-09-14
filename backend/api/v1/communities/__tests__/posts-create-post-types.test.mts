import { describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createRandomString,
  createTestMembership,
  createTestUserWithAge,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestTopic,
} from '@voucha/test-helpers'

describe('POST /api/v1/communities/:slug/posts post type gates', () => {
  it('rejects unsupported root post types before create validation', async () => {
    const { community, request } = await setupCommunityPostTypeRequest('unsupported-type')

    await request
      .post(`/api/v1/communities/${community.slug}/posts`)
      .send({ post_type: 'story', title: 'Story', markdown: 'Story body' })
      .expect(422)
  })

  it.each([false, true])('rejects article/blog roots for administrator=%s', async administrator => {
    const { community, request } = await setupCommunityPostTypeRequest('article-blog', {
      administrator,
    })
    for (const post_type of ['article', 'blog_post'] as const) {
      await request
        .post(`/api/v1/communities/${community.slug}/posts`)
        .send({ post_type, title: 'Restricted root', markdown: 'body' })
        .expect(422)
    }
  })

  it('rejects review posts when the community has not enabled them', async () => {
    const { community, request, user } = await setupCommunityPostTypeRequest('review-disabled')
    const topicSuffix = createRandomString(8)
    const topicId = await insertTestTopic({
      name: `Review post type gate topic ${topicSuffix}`,
      slug: `review-post-type-gate-${topicSuffix}`,
      createdById: user.id,
    })

    await request
      .post(`/api/v1/communities/${community.slug}/posts`)
      .send({
        post_type: 'review',
        title: 'Review',
        markdown:
          'This review provides enough context about the community contribution to evaluate it carefully. The explanation covers the useful benefits and practical limitations for readers. The conclusion gives a clear recommendation based on those facts.',
        review_topic_ratings: [{ topic_id: topicId, rating: 4 }],
      })
      .expect(403)
  })

  it('passes enabled review posts through to review validation', async () => {
    const { community, request } = await setupCommunityPostTypeRequest('review-enabled', {
      allow_review_posts: true,
    })

    await request
      .post(`/api/v1/communities/${community.slug}/posts`)
      .send({ post_type: 'review', title: 'Review', markdown: 'Review body' })
      .expect(422)
  })

  it('rejects data point posts when the community has not enabled them', async () => {
    const { community, request, user } = await setupCommunityPostTypeRequest('data-point-disabled')
    const topicSuffix = createRandomString(8)
    const topicId = await insertTestTopic({
      name: `Data point post type gate topic ${topicSuffix}`,
      slug: `data-point-post-type-gate-${topicSuffix}`,
      createdById: user.id,
      topicType: 'card',
    })

    await request
      .post(`/api/v1/communities/${community.slug}/posts`)
      .send({
        post_type: 'data_point',
        title: 'Data point',
        markdown: 'Data point body',
        data_point_vertical: 'credit_card',
        structured_data: {
          vertical: 'credit_card',
          schema_version: 1,
          currency: 'usd',
          topic_ids: [topicId],
          result: 'approved',
          credit_score_range: '670-739',
        },
      })
      .expect(403)
  })

  it('passes enabled data point posts through to data point validation', async () => {
    const { community, request } = await setupCommunityPostTypeRequest('data-point-enabled', {
      allow_data_point_posts: true,
    })

    await request
      .post(`/api/v1/communities/${community.slug}/posts`)
      .send({ post_type: 'data_point', title: 'Data point', markdown: 'Data point body' })
      .expect(422)
  })
})

async function setupCommunityPostTypeRequest(
  slugPrefix: string,
  options: {
    allow_review_posts?: boolean
    allow_data_point_posts?: boolean
    administrator?: boolean
  } = {},
) {
  const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
    administrator: options.administrator,
  })
  const random = createRandomString(8)
  const community = await insertTestCommunity({
    createdById: user.id,
    slug: `posts-${slugPrefix}-${random}`,
    ...options,
  })
  await insertTestCommunityMember({ communityId: community.id, userId: user.id })
  await createTestMembership({ user_id: user.id, plan: 'plus' })
  const request = createRequest()
  await request.authenticateAs(user)
  return { community, request, user }
}
