import { describe, expect, it, vi } from 'vitest'
import {
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  followUser,
} from '@voucha/test-helpers'
import { readStateExists } from '@voucha/test-helpers/entities/read-states'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
import { createRequest } from '@voucha/test-helpers/api/server'
import { callMcpTool } from '../../services/mcp-tools/call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from '../../services/mcp-tools/config.mts'

const ITEM_SCOPES = ['rss-feed-items:read', 'rss-feed-items:write'] as const
const FEED_SCOPES = ['rss-feeds:read', 'rss-feeds:write'] as const

async function itemFixture() {
  const topic = await createTestTopic()
  const feedId = await createTestRssFeedWithTiming(topic.id)
  return createTestRssFeedItemWithUrl(feedId)
}

describe('RSS participation tools — real store and REST parity', () => {
  it('marks an item read and unread, including repeated calls', async () => {
    const user = await createTestPlusMcpCaller()
    const item = await itemFixture()
    const args = { rss_feed_item_id: item.id }
    expect(await readStateExists(user.id, 'rss_feed_item', item.id)).toBe(false)
    for (const option of ['read', 'read'] as const) {
      expect(
        await callStructuredMcpTool(
          user,
          'set_rss_feed_item_read',
          optionArgs(option, args),
          ITEM_SCOPES,
        ),
      ).toEqual({ success: true })
    }
    expect(await readStateExists(user.id, 'rss_feed_item', item.id)).toBe(true)
    for (const option of ['unread', 'unread'] as const) {
      expect(
        await callStructuredMcpTool(
          user,
          'set_rss_feed_item_read',
          optionArgs(option, args),
          ITEM_SCOPES,
        ),
      ).toEqual({ success: true })
    }
    expect(await readStateExists(user.id, 'rss_feed_item', item.id)).toBe(false)
  })

  it.each(['read', 'unread'] as const)('%s returns the REST missing-item error', async option => {
    const user = await createTestPlusMcpCaller()
    const id = crypto.randomUUID()
    const error = JSON.parse(
      await callRejectedMcpTool(
        user,
        'set_rss_feed_item_read',
        optionArgs(option, { rss_feed_item_id: id }),
        ITEM_SCOPES,
      ),
    )
    expect(error).toMatchObject({
      error: { status: 404, code: 'NOT_FOUND', message: 'RSS feed item not found' },
    })
    const request = createRequest()
    await request.authenticateAs(user)
    await request[option === 'read' ? 'put' : 'delete'](`/api/v1/rss-feed-items/${id}/read`).expect(
      404,
    )
    expect(await readStateExists(user.id, 'rss_feed_item', id)).toBe(false)
  })

  it('shares and sends an item to the caller’s followers, preserving one-day duplicate guards', async () => {
    const [user, recipient] = await Promise.all([
      createTestPlusMcpCaller(),
      createTestPlusMcpCaller(),
    ])
    const item = await itemFixture()
    await followUser(recipient, user)
    const shareArgs = optionArgs('share', { rss_feed_item_id: item.id })
    const sendArgs = optionArgs('send', {
      rss_feed_item_id: item.id,
      audience: 'selected_followers',
      recipient_user_ids: [recipient.id],
    })
    const share = await callStructuredMcpTool(user, 'share_rss_feed_item', shareArgs, ITEM_SCOPES)
    const send = await callStructuredMcpTool(user, 'share_rss_feed_item', sendArgs, ITEM_SCOPES)
    expect(share).toMatchObject({ status: 'accepted', distribution_id: expect.any(String) })
    expect(send).toMatchObject({ status: 'accepted', distribution_id: expect.any(String) })
    expect(send.distribution_id).not.toBe(share.distribution_id)
    for (const args of [shareArgs, sendArgs]) {
      const onRateLimited = vi.fn<() => Promise<void>>(async () => {})
      const result = await callMcpTool(
        'share_rss_feed_item',
        args,
        user,
        ITEM_SCOPES,
        USER_MCP_SERVER_CONFIG,
        false,
        { ip: undefined, onRateLimited },
      )
      expect(result.isError).toBe(true)
      const error = JSON.parse((result.content[0] as { text: string }).text)
      expect(error).toMatchObject({
        error: { status: 429, code: 'RATE_LIMIT', retryable: true },
      })
      expect(onRateLimited).toHaveBeenCalledOnce()
    }
  })

  it('rejects a selected recipient who does not follow the sender', async () => {
    const [user, stranger] = await Promise.all([
      createTestPlusMcpCaller(),
      createTestPlusMcpCaller(),
    ])
    const item = await itemFixture()
    const error = JSON.parse(
      await callRejectedMcpTool(
        user,
        'share_rss_feed_item',
        optionArgs('send', {
          rss_feed_item_id: item.id,
          audience: 'selected_followers',
          recipient_user_ids: [stranger.id],
        }),
        ITEM_SCOPES,
      ),
    )
    expect(error).toMatchObject({
      error: { status: 400, message: 'Selected users must be current followers' },
    })
  })

  it.each(['share', 'send'] as const)('%s rejects a missing item as REST does', async option => {
    const user = await createTestPlusMcpCaller()
    const id = crypto.randomUUID()
    const error = JSON.parse(
      await callRejectedMcpTool(
        user,
        'share_rss_feed_item',
        optionArgs(option, {
          rss_feed_item_id: id,
          ...(option === 'send' ? { audience: 'all_followers' } : {}),
        }),
        ITEM_SCOPES,
      ),
    )
    expect(error).toMatchObject({ error: { status: 404, code: 'NOT_FOUND' } })
    const request = createRequest()
    await request.authenticateAs(user)
    const route = `/api/v1/rss-feed-items/${id}/${option === 'share' ? 'shares' : 'sends'}`
    if (option === 'share') await request.post(route).expect(404)
    else await request.post(route).send({ audience: 'all_followers' }).expect(404)
  })

  it('submits a new feed with the REST pending result shape', async () => {
    vi.stubEnv('PLAYWRIGHT_TEST', 'true')
    try {
      const user = await createTestPlusMcpCaller()
      const result = await callStructuredMcpTool(
        user,
        'submit_rss_feed',
        optionArgs('submit', {
          rss_feed_url: `https://submit-${crypto.randomUUID()}.example.com/feed.xml`,
          follow: false,
        }),
        FEED_SCOPES,
      )
      expect(result).toMatchObject({
        import: { id: expect.any(String), total_rows: 1, pending_rows: 1 },
        status_url: expect.any(String),
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('submits an existing feed as pending and rejects the same invalid URL as REST', async () => {
    const user = await createTestPlusMcpCaller()
    const feedUrl = `http://feed-${crypto.randomUUID()}.example.com/feed.xml`
    await createTestRssFeed({
      rssFeedUrl: feedUrl,
      topicHostname: new URL(feedUrl).hostname,
    })
    const args = optionArgs('submit', { rss_feed_url: feedUrl, follow: false })
    const first = await callStructuredMcpTool(user, 'submit_rss_feed', args, FEED_SCOPES)
    const second = await callStructuredMcpTool(user, 'submit_rss_feed', args, FEED_SCOPES)
    expect(first).toMatchObject({ import: { pending_rows: 1 }, status_url: expect.any(String) })
    expect(second).toMatchObject({ import: { pending_rows: 1 }, status_url: expect.any(String) })
    expect((second.import as { id: string }).id).not.toBe((first.import as { id: string }).id)
    const invalid = optionArgs('submit', { rss_feed_url: 'not-a-url' })
    const error = JSON.parse(
      await callRejectedMcpTool(user, 'submit_rss_feed', invalid, FEED_SCOPES),
    )
    expect(error).toMatchObject({
      error: { status: 422, message: 'rss_feed_url must be a valid URL' },
    })
    const request = createRequest()
    await request.authenticateAs(user)
    await request.post('/api/v1/rss-feeds').send({ rss_feed_url: 'not-a-url' }).expect(422)
  })
})
