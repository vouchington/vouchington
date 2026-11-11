import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  createTestMembership,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'

const scopes = ['posts:read', 'posts:write'] as const
async function emailOnlyCaller() {
  const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, { noUsername: true })
  await createTestMembership({ user_id: user.id, plan: 'plus' })
  expect(user.username).toBeNull()
  expect(user.email_address).toBeTruthy()
  expect(
    [
      user.facebook_account,
      user.apple_account,
      user.google_account,
      user.x_account,
      user.linkedin_account,
      user.microsoft_account,
      user.github_account,
    ].filter(Boolean),
  ).toEqual([])
  return { ...user, membership_plan: 'plus' as const }
}
async function sourceStory() {
  const topic = await createTestTopic()
  const feed = await createTestRssFeedWithTiming(topic.id)
  const item = await createTestRssFeedItemWithUrl(feed)
  const second = await createTestRssFeedItemWithUrl(feed)
  const story = await insertTestStory({ title: `Source story ${crypto.randomUUID()}` })
  await setTestItemStoryId(item.id, story.id)
  await setTestItemStoryId(second.id, story.id)
  return { story, item }
}

describe('story discussion creation eligibility', () => {
  it('allows an aged email-verified actor without a username or OAuth through REST and MCP', async () => {
    const user = await emailOnlyCaller()
    const request = createRequest()
    await request.authenticateAs(user)
    const restSource = await sourceStory()
    const rest = await request
      .post('/api/v1/posts')
      .send({ post_type: 'story', story_id: restSource.story.id })
      .expect(201)
    expect(rest.body.post.post_type).toBe('story')
    const mcpSource = await sourceStory()
    const mcp = await callStructuredMcpTool(
      user,
      'create_post',
      { post_type: 'story', story_id: mcpSource.story.id, idempotency_key: crypto.randomUUID() },
      scopes,
    )
    expect(mcp).toMatchObject({ success: true, post: { post_type: 'story' } })
    expect((mcp.post as { id: string }).id).not.toBe(rest.body.post.id)
  })

  it.each([null, []])(
    'rejects a non-object authenticated JSON body before workflow dispatch: %j',
    async body => {
      const user = await emailOnlyCaller()
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .post('/api/v1/posts')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(body))
        .expect(422)
      expect(response.body.message).toBe('Invalid request body')
    },
  )

  it.each(['discussion', 'rss', 'topic_recommendation', 'discussion_with_story_id'])(
    'retains the identity requirement for %s in both transports',
    async kind => {
      const user = await emailOnlyCaller()
      const payload =
        kind === 'rss'
          ? { post_type: 'link', rss_feed_item_id: (await sourceStory()).item.id }
          : kind === 'topic_recommendation'
            ? {
                post_type: kind,
                topic_title: 'A proposed topic',
                topic_slug: `proposal-${crypto.randomUUID()}`,
                markdown: 'Proposal rationale.',
              }
            : {
                post_type: 'discussion',
                title: 'Authored post',
                markdown: 'Authored content.',
                ...(kind === 'discussion_with_story_id' && { story_id: crypto.randomUUID() }),
              }
      const request = createRequest()
      await request.authenticateAs(user)
      const rest = await request.post('/api/v1/posts').send(payload).expect(403)
      expect(rest.body.code).toBe('IDENTITY_REQUIRED')
      const mcp = JSON.parse(
        await callRejectedMcpTool(
          user,
          'create_post',
          { ...payload, idempotency_key: crypto.randomUUID() },
          scopes,
        ),
      )
      expect(mcp.error).toMatchObject({ status: 403, message: rest.body.message })
    },
  )
})
