import { describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  approveTestPost,
  createTestMembership,
  createTestPost,
  createTestTopic,
  createTestUserWithAge,
  followUser,
  suspendTestUser,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { readStateExists } from '@voucha/test-helpers/entities/read-states'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createPost } from '@services/posts/create'

const SCOPES = ['posts:read', 'posts:write'] as const
const act = (user: Parameters<typeof callStructuredMcpTool>[0], option: string, args = {}) =>
  callStructuredMcpTool(user, 'act_on_post', optionArgs(option, args), SCOPES)
const reject = async (user: Parameters<typeof callRejectedMcpTool>[0], option: string, args = {}) =>
  JSON.parse(await callRejectedMcpTool(user, 'act_on_post', optionArgs(option, args), SCOPES))
const REVIEW =
  'This review has enough detail to pass the minimum review content validation. It rates several concrete aspects and provides useful context for the rating workflow test. The author explains strengths, weaknesses, tradeoffs, and repeatable observations clearly.'

async function reviewFixture() {
  const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  await createTestMembership({ user_id: user.id, plan: 'plus' })
  const caller = { ...user, membership_plan: 'plus' as const }
  const [first, second] = await Promise.all([createTestTopic({ user }), createTestTopic({ user })])
  const review = await createPost(user, WEB_PROVENANCE, {
    title: `Review ${crypto.randomUUID()}`,
    markdown: REVIEW,
    post_type: 'review',
    review_topic_ratings: [{ topic_id: first.id, rating: 3 }],
  })
  await approveTestPost(review.id)
  return { caller, review, topic: second }
}

describe('act_on_post ratings against their REST twins', () => {
  it('adds, edits, deletes and re-adds a topic rating, refusing a duplicate', async () => {
    const { caller, review, topic } = await reviewFixture()
    const target = { id: review.id, topic_id: topic.id }
    expect(await act(caller, 'add_rating', { ...target, rating: 4, order_index: 1 })).toEqual({
      success: true,
    })
    expect(
      (await reject(caller, 'add_rating', { ...target, rating: 4, order_index: 1 })).error.status,
    ).toBeGreaterThanOrEqual(400)
    expect(await act(caller, 'edit_rating', { ...target, rating: 5 })).toEqual({ success: true })
    expect(await act(caller, 'delete_rating', target)).toEqual({ success: true })
    expect(await act(caller, 'add_rating', { ...target, rating: 4, order_index: 1 })).toEqual({
      success: true,
    })
  })

  it('returns the REST error for a non-owner, a non-review and an empty edit', async () => {
    const { caller, review, topic } = await reviewFixture()
    const stranger = await createTestPlusMcpCaller()
    const discussion = await createTestPost({ user: caller })
    const request = createRequest()
    await request.authenticateAs(stranger)
    const body = { topic_id: topic.id, rating: 4, order_index: 1 }
    await request.post(`/api/v1/posts/${review.id}/ratings`).send(body).expect(403)
    expect((await reject(stranger, 'add_rating', { id: review.id, ...body })).error.status).toBe(
      403,
    )
    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(caller)
    await ownerRequest.post(`/api/v1/posts/${discussion.id}/ratings`).send(body).expect(422)
    expect((await reject(caller, 'add_rating', { id: discussion.id, ...body })).error.status).toBe(
      422,
    )
    await ownerRequest.patch(`/api/v1/posts/${review.id}/ratings/${topic.id}`).send({}).expect(422)
    expect(
      (await reject(caller, 'edit_rating', { id: review.id, topic_id: topic.id })).error.status,
    ).toBe(422)
  })

  it('refuses a suspended owner as REST does', async () => {
    const { caller, review, topic } = await reviewFixture()
    await suspendTestUser(caller.id)
    const request = createRequest()
    await request.authenticateAs(caller)
    const route = `/api/v1/posts/${review.id}/ratings/${topic.id}`
    await request.delete(route).expect(403)
    expect(
      (await reject(caller, 'delete_rating', { id: review.id, topic_id: topic.id })).error.status,
    ).toBe(403)
  })
})

describe('act_on_post share, send and read state against their REST twins', () => {
  it('shares and sends a post to followers like REST', async () => {
    const [sender, follower, creator] = await Promise.all([
      createTestPlusMcpCaller(),
      createTestPlusMcpCaller(),
      createTestPlusMcpCaller(),
    ])
    await followUser(follower, sender)
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const shared = await act(sender, 'share', { id: post.id })
    const sent = await act(sender, 'send', {
      id: post.id,
      audience: 'selected_followers',
      recipient_user_ids: [follower.id],
    })
    expect(shared).toMatchObject({ status: 'accepted', distribution_id: expect.any(String) })
    expect(sent).toMatchObject({ status: 'accepted', distribution_id: expect.any(String) })
    expect(sent.distribution_id).not.toBe(shared.distribution_id)
    const [stranger, other] = await Promise.all([
      createTestPlusMcpCaller(),
      createTestPlusMcpCaller(),
    ])
    const request = createRequest()
    await request.authenticateAs(other)
    await request
      .post(`/api/v1/posts/${post.id}/sends`)
      .send({ audience: 'selected_followers', recipient_user_ids: [stranger.id] })
      .expect(400)
    expect(
      (
        await reject(other, 'send', {
          id: post.id,
          audience: 'selected_followers',
          recipient_user_ids: [stranger.id],
        })
      ).error.status,
    ).toBe(400)
  })

  it.each(['share', 'send'] as const)('%s rejects a missing post as REST does', async option => {
    const user = await createTestPlusMcpCaller()
    const id = crypto.randomUUID()
    const body = { audience: 'all_followers' }
    const request = createRequest()
    await request.authenticateAs(user)
    if (option === 'share') await request.post(`/api/v1/posts/${id}/shares`).expect(404)
    else await request.post(`/api/v1/posts/${id}/sends`).send(body).expect(404)
    const args = option === 'send' ? { id, ...body } : { id }
    expect((await reject(user, option, args)).error.status).toBe(404)
  })

  it('marks a post read and unread, repeatably, and rejects a missing post like REST', async () => {
    const user = await createTestPlusMcpCaller()
    const author = await createTestPlusMcpCaller()
    const post = await createTestPost({ user: author, privacy: 'public' })
    for (const option of ['read', 'read'] as const)
      expect(await act(user, option, { id: post.id })).toEqual({ success: true })
    expect(await readStateExists(user.id, 'post', post.id)).toBe(true)
    for (const option of ['unread', 'unread'] as const)
      expect(await act(user, option, { id: post.id })).toEqual({ success: true })
    expect(await readStateExists(user.id, 'post', post.id)).toBe(false)
    const hidden = crypto.randomUUID()
    const request = createRequest()
    await request.authenticateAs(user)
    await request.put(`/api/v1/posts/${hidden}/read`).expect(404)
    expect((await reject(user, 'read', { id: hidden })).error.status).toBe(404)
    expect(await readStateExists(user.id, 'post', hidden)).toBe(false)
  })

  it.each(['read', 'unread'] as const)(
    'refuses a suspended user to %s as REST does',
    async option => {
      const user = await createTestPlusMcpCaller()
      const post = await createTestPost({ user, privacy: 'public' })
      await suspendTestUser(user.id)
      const request = createRequest()
      await request.authenticateAs(user)
      const route = `/api/v1/posts/${post.id}/read`
      await request[option === 'read' ? 'put' : 'delete'](route).expect(403)
      expect((await reject(user, option, { id: post.id })).error.status).toBe(403)
      expect(await readStateExists(user.id, 'post', post.id)).toBe(false)
    },
  )
})
