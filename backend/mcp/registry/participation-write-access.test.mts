import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { callRejectedMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import type { ApiScope } from '@modules/scopes'
import { USER_MCP_SERVER_CONFIG } from '../../services/mcp-tools/config.mts'
import { resolveMcpToolCall } from '../../services/mcp-tools/resolve-tool-call.mts'

const id = crypto.randomUUID()
const cases = [
  ['vote', 'set_post', { id, choice: 'like' }, ['votes:write']],
  ['vote', 'clear_post', { id }, ['votes:write']],
  ['vote', 'set_topic', { id, choice: 'like' }, ['votes:write']],
  ['vote', 'clear_topic', { id }, ['votes:write']],
  ['vote', 'set_rss_feed_item', { id, choice: 'like' }, ['votes:write']],
  ['vote', 'clear_rss_feed_item', { id }, ['votes:write']],
  [
    'set_rss_feed_item_read',
    'read',
    { rss_feed_item_id: id },
    ['rss-feed-items:read', 'rss-feed-items:write'],
  ],
  [
    'set_rss_feed_item_read',
    'unread',
    { rss_feed_item_id: id },
    ['rss-feed-items:read', 'rss-feed-items:write'],
  ],
  [
    'share_rss_feed_item',
    'share',
    { rss_feed_item_id: id },
    ['rss-feed-items:read', 'rss-feed-items:write'],
  ],
  [
    'share_rss_feed_item',
    'send',
    { rss_feed_item_id: id, audience: 'all_followers' },
    ['rss-feed-items:read', 'rss-feed-items:write'],
  ],
  [
    'submit_rss_feed',
    'submit',
    { rss_feed_url: 'https://example.com/feed.xml' },
    ['rss-feeds:read', 'rss-feeds:write'],
  ],
  [
    'start_discussion',
    'rss_feed_item',
    { rss_feed_item_id: id, idempotency_key: id },
    ['posts:read', 'posts:write'],
  ],
  [
    'start_discussion',
    'story',
    { story_id: id, idempotency_key: id },
    ['posts:read', 'posts:write'],
  ],
] as const satisfies readonly (readonly [
  string,
  string,
  Record<string, unknown>,
  readonly ApiScope[],
])[]

describe('participation writes: merged option authorization', () => {
  it.each(cases)(
    '%s(%s) requires its write scope and a Plus plan',
    async (tool, option, args, scopes) => {
      const paid = await createTestPlusMcpCaller()
      expect(resolveMcpToolCall(tool, paid, [], USER_MCP_SERVER_CONFIG).status).toBe(
        'insufficient_scope',
      )
      expect(await callRejectedMcpTool(paid, tool, optionArgs(option, args), [])).toContain('scope')

      const free = { ...(await createTestUser()), membership_plan: null }
      expect(resolveMcpToolCall(tool, free, scopes, USER_MCP_SERVER_CONFIG).status).toBe(
        'plan_denied',
      )
      expect(await callRejectedMcpTool(free, tool, optionArgs(option, args), scopes)).toContain(
        'higher plan',
      )
    },
  )

  it.each([
    ['vote', 'clear_topic', { id }, { choice: 'like' }],
    ['set_rss_feed_item_read', 'read', { rss_feed_item_id: id }, { choice: 'like' }],
    ['share_rss_feed_item', 'share', { rss_feed_item_id: id }, { audience: 'all_followers' }],
    ['submit_rss_feed', 'submit', { rss_feed_url: 'https://example.com/feed.xml' }, { id }],
    ['start_discussion', 'story', { story_id: id, idempotency_key: id }, { rss_feed_item_id: id }],
  ] as const)(
    '%s rejects unknown, extra, and wrong-option arguments before dispatch',
    async (tool, option, args, wrong) => {
      const caller = await createTestPlusMcpCaller()
      const scope = cases.find(([name]) => name === tool)![3]
      for (const input of [
        optionArgs('not_an_option', args),
        { ...optionArgs(option, args), extra: true },
        optionArgs(option, { ...args, ...wrong }),
      ]) {
        expect(await callRejectedMcpTool(caller, tool, input, scope)).toContain(
          'Invalid tool arguments',
        )
      }
    },
  )
})
