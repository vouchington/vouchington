import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestMembership,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  insertTestPost,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { createPlatformAccountTestUser } from '@voucha/test-helpers/account-types'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
import { createRequest } from '@voucha/test-helpers/api/server'
import { getPostElectionVote } from '@services/elections-votes/post'
import { getTopicElectionVote } from '@services/elections-votes/topic'
import { getRssFeedItemElectionVote } from '@services/elections-votes/rss-feed-item'
import { getPostByAny } from '@services/posts'
import { updateRssFeedById } from '@services/rss-feeds'
import { upsertSystemUser } from '@services/users/system-users'
import {
  FEED_NOT_DISCOVERABLE,
  NEUTRAL_REQUIRES_EXISTING_BALLOT,
} from '@modules/on-error/error-codes'

const VOTE_SCOPES = ['votes:write'] as const
const DISCUSSION_SCOPES = ['posts:read', 'posts:write'] as const

async function rssFixture() {
  const topic = await createTestTopic()
  const feedId = await createTestRssFeedWithTiming(topic.id)
  const item = await createTestRssFeedItemWithUrl(feedId)
  return { feedId, item }
}

describe('vote — shared REST mutation', () => {
  it('sets, recasts, and clears post, topic, and RSS item ballots in the real store', async () => {
    const [user, author] = await Promise.all([createTestPlusMcpCaller(), createTestUser()])
    const postId = await insertTestPost({
      title: crypto.randomUUID(),
      slug: crypto.randomUUID(),
      markdown: 'Public post',
      createdById: author.id,
      clearanceStatus: 'approved',
    })
    const topic = await createTestTopic({ user: author })
    const { item } = await rssFixture()
    const targets = [
      ['post', postId, getPostElectionVote],
      ['topic', topic.id, getTopicElectionVote],
      ['rss_feed_item', item.id, getRssFeedItemElectionVote],
    ] as const
    for (const [kind, id, getVote] of targets) {
      expect(
        await callStructuredMcpTool(
          user,
          'vote',
          optionArgs(`set_${kind}`, { id, choice: 'like' }),
          VOTE_SCOPES,
        ),
      ).toEqual({ success: true })
      expect((await getVote(user.id, id))?.choice).toBe('like')
      expect(
        await callStructuredMcpTool(
          user,
          'vote',
          optionArgs(`set_${kind}`, { id, choice: 'dislike' }),
          VOTE_SCOPES,
        ),
      ).toEqual({ success: true })
      expect((await getVote(user.id, id))?.choice).toBe('dislike')
      expect(
        await callStructuredMcpTool(user, 'vote', optionArgs(`clear_${kind}`, { id }), VOTE_SCOPES),
      ).toEqual({ success: true })
      expect(await getVote(user.id, id)).toBeNull()
    }
  })

  it('refuses a first neutral vote but permits neutral to retract an existing ballot', async () => {
    const user = await createTestPlusMcpCaller()
    const topic = await createTestTopic()
    const args = (choice: string) => optionArgs('set_topic', { id: topic.id, choice })
    const error = JSON.parse(await callRejectedMcpTool(user, 'vote', args('neutral'), VOTE_SCOPES))
    expect(error).toMatchObject({
      error: {
        status: 422,
        code: NEUTRAL_REQUIRES_EXISTING_BALLOT,
        message: 'Neutral retracts an existing ballot and cannot be a first vote.',
      },
    })
    const request = createRequest()
    await request.authenticateAs(user)
    const rest = await request
      .put(`/api/v1/topics/${topic.id}/vote`)
      .send({ choice: 'neutral' })
      .expect(422)
    expect(rest.body.code).toBe(NEUTRAL_REQUIRES_EXISTING_BALLOT)
    expect(await getTopicElectionVote(user.id, topic.id)).toBeNull()
    await callStructuredMcpTool(user, 'vote', args('like'), VOTE_SCOPES)
    expect(await callStructuredMcpTool(user, 'vote', args('neutral'), VOTE_SCOPES)).toEqual({
      success: true,
    })
    expect((await getTopicElectionVote(user.id, topic.id))?.choice).toBe('neutral')
  })

  it.each([
    ['set_post', 'clear_post', 'posts', 'Post not found'],
    ['set_topic', 'clear_topic', 'topics', 'Topic not found'],
    ['set_rss_feed_item', 'clear_rss_feed_item', 'rss-feed-items', 'RSS feed item not found'],
  ] as const)(
    '%s and %s preserve REST missing-target responses',
    async (set, clear, segment, message) => {
      const user = await createTestPlusMcpCaller()
      const id = crypto.randomUUID()
      const request = createRequest()
      await request.authenticateAs(user)
      for (const [option, method] of [
        [set, 'put'],
        [clear, 'delete'],
      ] as const) {
        const error = JSON.parse(
          await callRejectedMcpTool(
            user,
            'vote',
            optionArgs(option, {
              id,
              ...(method === 'put' ? { choice: 'like' } : {}),
            }),
            VOTE_SCOPES,
          ),
        )
        expect(error).toMatchObject({ error: { status: 404, message } })
        const route = `/api/v1/${segment}/${id}/vote`
        if (method === 'put') await request.put(route).send({ choice: 'like' }).expect(404)
        else await request.delete(route).expect(404)
      }
    },
  )

  it('preserves private post visibility for an authenticated Plus caller', async () => {
    const owner = await createTestUser()
    const viewer = await createTestPlusMcpCaller()
    const hidden = await insertTestPost({
      title: crypto.randomUUID(),
      slug: crypto.randomUUID(),
      markdown: 'Private',
      createdById: owner.id,
      privacy: 'private',
      broadcast: 'followers',
      clearanceStatus: 'approved',
    })
    const visibility = JSON.parse(
      await callRejectedMcpTool(
        viewer,
        'vote',
        optionArgs('set_post', { id: hidden, choice: 'like' }),
        VOTE_SCOPES,
      ),
    )
    expect(visibility).toMatchObject({ error: { status: 404, message: 'Post not found' } })
    expect(await getPostElectionVote(viewer.id, hidden)).toBeNull()
  })

  it('forbids an official account from adding a trust signal', async () => {
    const official = await createPlatformAccountTestUser('official')
    await createTestMembership({ user_id: official.id, plan: 'plus' })
    const caller = { ...official, membership_plan: 'plus' as const }
    const topic = await createTestTopic()
    const error = JSON.parse(
      await callRejectedMcpTool(
        caller,
        'vote',
        optionArgs('set_topic', {
          id: topic.id,
          choice: 'like',
        }),
        VOTE_SCOPES,
      ),
    )
    expect(error).toMatchObject({ error: { status: 403 } })
    expect(await getTopicElectionVote(caller.id, topic.id)).toBeNull()
  })
})

describe('start_discussion — delegated contribution', () => {
  it('creates and exactly replays discussions on an RSS item and its story', async () => {
    const user = await createTestPlusMcpCaller()
    await upsertSystemUser('story-teller')
    const { feedId, item } = await rssFixture()
    const story = await insertTestStory()
    await setTestItemStoryId(item.id, story.id)
    const secondItem = await createTestRssFeedItemWithUrl(feedId)
    await setTestItemStoryId(secondItem.id, story.id)
    let storyReplay:
      | { args: ReturnType<typeof optionArgs>; first: Record<string, unknown> }
      | undefined
    for (const [option, entityKey, entityId] of [
      ['rss_feed_item', 'rss_feed_item_id', item.id],
      ['story', 'story_id', story.id],
    ] as const) {
      const args = optionArgs(option, {
        [entityKey]: entityId,
        idempotency_key: crypto.randomUUID(),
      })
      const first = await callStructuredMcpTool(user, 'start_discussion', args, DISCUSSION_SCOPES)
      const replay = await callStructuredMcpTool(user, 'start_discussion', args, DISCUSSION_SCOPES)
      expect(first).toEqual(replay)
      expect(first).toMatchObject({ success: true, post: { id: expect.any(String) } })
      const stored = await getPostByAny((first.post as { id: string }).id)
      expect(stored?.post_type).toBe(option === 'story' ? 'story' : 'link')
      expect(stored?.created_by_id === user.id).toBe(option === 'rss_feed_item')
      if (option === 'story') storyReplay = { args, first }
    }
    expect(storyReplay).toBeDefined()
    await updateRssFeedById(feedId, { discoverable: false })
    expect(
      await callStructuredMcpTool(user, 'start_discussion', storyReplay!.args, DISCUSSION_SCOPES),
    ).toEqual(storyReplay!.first)
  })

  it('allows an RSS item discussion after its source feed becomes nondiscoverable, as REST does', async () => {
    const user = await createTestPlusMcpCaller()
    const { feedId, item } = await rssFixture()
    const restItem = await createTestRssFeedItemWithUrl(feedId)
    await updateRssFeedById(feedId, { discoverable: false })
    const result = await callStructuredMcpTool(
      user,
      'start_discussion',
      optionArgs('rss_feed_item', {
        rss_feed_item_id: item.id,
        idempotency_key: crypto.randomUUID(),
      }),
      DISCUSSION_SCOPES,
    )
    expect(result).toMatchObject({
      success: true,
      post: { post_type: 'link', created_by_id: user.id },
    })
    const request = createRequest()
    await request.authenticateAs(user)
    const rest = await request
      .post(`/api/v1/rss-feed-items/${restItem.id}/discussions`)
      .set('Idempotency-Key', crypto.randomUUID())
      .expect(200)
    expect(rest.body.post).toMatchObject({ post_type: 'link', created_by_id: user.id })
  })

  it.each([
    ['rss_feed_item', 'rss_feed_item_id', 'RSS feed item not found'],
    ['story', 'story_id', 'Story not found'],
  ] as const)('%s refuses a missing source with the REST error', async (option, key, message) => {
    const user = await createTestPlusMcpCaller()
    const error = JSON.parse(
      await callRejectedMcpTool(
        user,
        'start_discussion',
        optionArgs(option, {
          [key]: crypto.randomUUID(),
          idempotency_key: crypto.randomUUID(),
        }),
        DISCUSSION_SCOPES,
      ),
    )
    expect(error).toMatchObject({ error: { status: 404, message } })
  })

  it('rejects story discussion creation from a nondiscoverable RSS source', async () => {
    const user = await createTestPlusMcpCaller()
    const { feedId, item } = await rssFixture()
    const story = await insertTestStory()
    await setTestItemStoryId(item.id, story.id)
    await updateRssFeedById(feedId, { discoverable: false })
    const error = JSON.parse(
      await callRejectedMcpTool(
        user,
        'start_discussion',
        optionArgs('story', {
          story_id: story.id,
          idempotency_key: crypto.randomUUID(),
        }),
        DISCUSSION_SCOPES,
      ),
    )
    expect(error).toMatchObject({ error: { status: 403, code: FEED_NOT_DISCOVERABLE } })
    const request = createRequest()
    await request.authenticateAs(user)
    const rest = await request
      .post(`/api/v1/stories/${story.id}/discussions`)
      .set('Idempotency-Key', crypto.randomUUID())
      .expect(403)
    expect(rest.body.code).toBe(FEED_NOT_DISCOVERABLE)
  })
})
