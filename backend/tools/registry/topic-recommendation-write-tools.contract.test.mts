import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestPost,
  createTestUser,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { getPostByAny } from '@services/posts'
import {
  createTopicRecommendation,
  rejectTopicRecommendation,
  type TopicRecommendationPost,
} from '@services/topic-recommendations'
import { addUserRole } from '@services/users/roles-permissions'
import { getPrivateUserByAny } from '@services/users/get'
import updateTopicRecommendationTool from '../update-topic-recommendation.mts'
import withdrawTopicRecommendationTool from '../withdraw-topic-recommendation.mts'

const SCOPES = ['topic-recommendations:read', 'topic-recommendations:write'] as const

const INTERNAL_POST_COLUMN = 'openai_omni_moderation_flagged'

type Caller = Awaited<ReturnType<typeof createCaller>>

async function createCaller(plan: 'plus' | null = 'plus') {
  return { ...(await createTestUser()), membership_plan: plan }
}

async function submit(author: Caller): Promise<TopicRecommendationPost> {
  const suffix = createRandomString(8).toLowerCase()
  return createTopicRecommendation(author, {
    markdown: `Why ${suffix}`,
    topic_title: `Tool topic ${suffix}`,
    topic_slug: `tool-topic-${suffix}`,
  })
}

const stored = async (id: string) => getPostByAny(id, { readOnly: false })
const storedTitle = async (id: string) => (await stored(id))?.topic_recommendation?.topic_title

describe('topic recommendation write tools contract — real DB', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it('update_topic_recommendation returns the post the REST route returns and keeps unsent fields', async () => {
    const caller = await createCaller()
    const recommendation = await submit(caller)
    const request = createRequest()
    await request.authenticateAs(caller)
    const rest = await request
      .patch(`/api/v1/topic-recommendations/${recommendation.id}`)
      .set('Content-Type', 'application/json')
      .send({ topic_markdown: 'From REST' })
      .expect(200)

    const result = await callStructuredMcpTool(
      caller,
      'update_topic_recommendation',
      { id: recommendation.id, topic_title: 'Renamed topic', topic_aliases: ['Alias One'] },
      SCOPES,
    )

    const post = result.post as TopicRecommendationPost
    // The route sends the service post as it is, internal moderation column included. The tool
    // sends the documented properties only.
    const restKeys = Object.keys(rest.body.post).filter(key => key !== INTERNAL_POST_COLUMN)
    expect(Object.keys(rest.body.post)).toContain(INTERNAL_POST_COLUMN)
    expect(Object.keys(post).toSorted()).toEqual(restKeys.toSorted())
    expect(post.topic_recommendation).toMatchObject({
      topic_title: 'Renamed topic',
      topic_slug: recommendation.topic_recommendation.topic_slug,
      topic_markdown: 'From REST',
      aliases: ['alias one'],
      status: 'pending',
    })
    expect(await storedTitle(recommendation.id)).toBe('Renamed topic')
  })

  it('withdraw_topic_recommendation removes a pending recommendation, once', async () => {
    const caller = await createCaller()
    const recommendation = await submit(caller)

    expect(
      await callStructuredMcpTool(
        caller,
        'withdraw_topic_recommendation',
        { id: recommendation.id },
        SCOPES,
      ),
    ).toEqual({ success: true })

    expect(await stored(recommendation.id)).toBeNull()
    await expect(
      withdrawTopicRecommendationTool.function(caller)({ id: recommendation.id }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('keeps the REST policy: an administrator may edit and withdraw another user’s pending recommendation', async () => {
    const author = await createCaller()
    const admin = await createCaller()
    await addUserRole(admin.id, 'administrator')
    const recommendation = await submit(author)
    const other = await submit(author)

    await callStructuredMcpTool(
      admin,
      'update_topic_recommendation',
      { id: recommendation.id, topic_title: 'Edited by staff' },
      SCOPES,
    )
    await callStructuredMcpTool(admin, 'withdraw_topic_recommendation', { id: other.id }, SCOPES)

    expect(await storedTitle(recommendation.id)).toBe('Edited by staff')
    expect(await stored(other.id)).toBeNull()
  })

  it('never lets one user change another user’s recommendation, and a non-recommendation is not found', async () => {
    const caller = await createCaller()
    const author = await createCaller()
    const recommendation = await submit(author)
    const post = await createTestPost({ user: author })

    await expect(
      updateTopicRecommendationTool.function(caller)({ id: recommendation.id, topic_title: 'Hi' }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      withdrawTopicRecommendationTool.function(caller)({ id: recommendation.id }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      updateTopicRecommendationTool.function(author)({ id: post.id, topic_title: 'Hi' }),
    ).rejects.toMatchObject({ status: 404, message: 'Recommendation not found' })
    await expect(
      withdrawTopicRecommendationTool.function(author)({ id: crypto.randomUUID() }),
    ).rejects.toMatchObject({ status: 404 })

    expect(await storedTitle(recommendation.id)).toBe(
      recommendation.topic_recommendation.topic_title,
    )
    expect((await stored(recommendation.id))?.deleted_at).toBeNull()
  })

  it('refuses to change a recommendation a moderator already reviewed', async () => {
    const author = await createCaller()
    const admin = await createTestUser()
    await addUserRole(admin.id, 'administrator')
    const reviewer = await getPrivateUserByAny(admin.id, { readOnly: false })
    const recommendation = await submit(author)
    await rejectTopicRecommendation(reviewer!, recommendation, 'Not needed')

    await expect(
      updateTopicRecommendationTool.function(author)({
        id: recommendation.id,
        topic_title: 'Too late',
      }),
    ).rejects.toMatchObject({ status: 422, message: 'Recommendation is no longer editable' })
    await expect(
      withdrawTopicRecommendationTool.function(author)({ id: recommendation.id }),
    ).rejects.toMatchObject({ status: 403 })

    expect(await storedTitle(recommendation.id)).toBe(
      recommendation.topic_recommendation.topic_title,
    )
  })

  it('refuses a read-only scope grant and a free plan on every recommendation tool', async () => {
    const caller = await createCaller()
    const free = await createCaller(null)
    const recommendation = await submit(caller)
    const calls = [
      ['update_topic_recommendation', { id: recommendation.id, topic_title: 'Nope' }],
      ['withdraw_topic_recommendation', { id: recommendation.id }],
    ] as const

    for (const [name, args] of calls) {
      expect(
        await callRejectedMcpTool(caller, name, args, ['topic-recommendations:read']),
      ).toContain('Tool requires scopes topic-recommendations:read, topic-recommendations:write')
      expect(await callRejectedMcpTool(free, name, args, SCOPES)).toContain(
        'requires a higher plan',
      )
    }

    expect(await storedTitle(recommendation.id)).toBe(
      recommendation.topic_recommendation.topic_title,
    )
  })

  it('refuses a suspended user before any change', async () => {
    const caller = await createCaller()
    const recommendation = await submit(caller)
    await suspendTestUser(caller.id)
    suspendedUserIds.push(caller.id)

    await callRejectedMcpTool(
      caller,
      'update_topic_recommendation',
      { id: recommendation.id, topic_title: 'Thawed' },
      SCOPES,
    )
    await callRejectedMcpTool(
      caller,
      'withdraw_topic_recommendation',
      { id: recommendation.id },
      SCOPES,
    )
    await expect(
      withdrawTopicRecommendationTool.function(caller)({ id: recommendation.id }),
    ).rejects.toMatchObject({ status: 403, message: 'Your account has been suspended' })

    expect(await storedTitle(recommendation.id)).toBe(
      recommendation.topic_recommendation.topic_title,
    )
    expect((await stored(recommendation.id))?.deleted_at).toBeNull()
  })

  it.each([
    ['update_topic_recommendation', {}],
    ['update_topic_recommendation', { id: 7 }],
    ['update_topic_recommendation', { id: 'x', topic_type: 'bank' }],
    ['update_topic_recommendation', { id: 'x', topic_aliases: 'one' }],
    ['update_topic_recommendation', { id: 'x', status: 'approved' }],
    ['withdraw_topic_recommendation', {}],
    ['withdraw_topic_recommendation', { id: 'x', force: true }],
  ])('refuses invalid %s arguments before any change', async (name, args) => {
    const caller = await createCaller()

    expect(await callRejectedMcpTool(caller, name, args, SCOPES)).toContain(
      'Invalid tool arguments',
    )
  })

  it('rejects a change the domain validation refuses, leaving the recommendation as it was', async () => {
    const caller = await createCaller()
    const recommendation = await submit(caller)

    await callRejectedMcpTool(
      caller,
      'update_topic_recommendation',
      { id: recommendation.id, topic_slug: 'Not A Slug!' },
      SCOPES,
    )

    expect((await stored(recommendation.id))?.topic_recommendation?.topic_slug).toBe(
      recommendation.topic_recommendation.topic_slug,
    )
  })
})
