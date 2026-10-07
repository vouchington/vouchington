import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  getContributionAdmissionReservationStateForTest,
  insertTestTopic,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  getPostCategoryMutationCounts,
  rejectPostCategoryVotesQuery,
} from '@voucha/test-helpers/post-category-vote-failures'
import {
  admitRouteContribution,
  contributionPolicySourceForPostType,
} from '@services/contribution-gating'
import { getPostByAny } from '@services/posts/get'
import { updatePost } from '@services/posts/update'
import { getAuthorizedPostContributionMembershipPlan } from '@services/posts/authorization'
import { executeCreatePostContribution } from '../posts-create-post.mts'

describe('POST /api/v1/posts category atomicity', () => {
  it('retries the same HTTP key after an admitted category vote rolls back', async () => {
    const user = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(user)
    const suffix = randomUUID().replaceAll('-', '')
    const topicId = await insertTestTopic({
      name: `Atomic category ${suffix}`,
      slug: `atomic-category-${suffix}`,
      createdById: user.id,
    })
    const key = randomUUID()
    const body = {
      title: `Atomic post ${suffix}`,
      markdown: `Atomic category #atomic${suffix}`,
      categories: [{ type: 'topic' as const, topic_id: topicId }],
    }
    const failedAttemptBody = structuredClone(body)
    const membershipPlan = await getAuthorizedPostContributionMembershipPlan(user)
    const before = await getPostCategoryMutationCounts(user.id)

    await expect(
      admitRouteContribution({
        currentUser: user,
        membershipPlan,
        source: contributionPolicySourceForPostType('discussion', true),
        scope: 'global',
        postType: 'discussion',
        idempotencyKeyHeader: key,
        intent: { route: 'posts.create', body: failedAttemptBody },
        execute: query =>
          executeCreatePostContribution(
            rejectPostCategoryVotesQuery(query),
            user,
            WEB_PROVENANCE,
            failedAttemptBody,
            membershipPlan,
          ),
      }),
    ).rejects.toThrow('category vote rejected for test')
    expect(
      await getContributionAdmissionReservationStateForTest({
        actorId: user.id,
        idempotencyKey: key,
      }),
    ).toBe('in_progress')
    expect(await getPostCategoryMutationCounts(user.id)).toEqual(before)

    const created = await request
      .post('/api/v1/posts')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201)
    expect(
      await getContributionAdmissionReservationStateForTest({
        actorId: user.id,
        idempotencyKey: key,
      }),
    ).toBe('committed')
    expect(created.body.post.post_related_topics).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: topicId })]),
    )
    const replay = await request
      .post('/api/v1/posts')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201)
    expect(replay.body).toEqual(created.body)
    expect((await getPostCategoryMutationCounts(user.id)).posts).toBe(before.posts + 1)
  })

  it('replays the first committed categories and title after a later category edit', async () => {
    const user = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(user)
    const suffix = randomUUID().replaceAll('-', '')
    const [originalTopic, laterTopic] = await Promise.all(
      ['original', 'later'].map(label =>
        insertTestTopic({
          name: `${label} category ${suffix}`,
          slug: `${label}-category-${suffix}`,
          createdById: user.id,
        }),
      ),
    )
    const key = randomUUID()
    const body = {
      title: `Original category response ${suffix}`,
      categories: [{ type: 'topic', topic_id: originalTopic! }],
    }
    const created = await request
      .post('/api/v1/posts')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201)
    expect(created.body.post.post_related_topics).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: originalTopic })]),
    )
    const post = await getPostByAny(created.body.post.id, { readOnly: false })
    if (!post) throw new Error('Expected committed category post')
    const edited = await updatePost(user, post, {
      title: `Later category response ${suffix}`,
      categories: [{ type: 'topic', topic_id: laterTopic! }],
    })
    expect(edited!.post_related_topics).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: laterTopic })]),
    )

    const replay = await request
      .post('/api/v1/posts')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201)
    expect(replay.body).toEqual(created.body)
  })
})
