import { optionArgs, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { createTestUser } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'

const INVALID_CURSOR = { success: false, error: 'Invalid cursor' }

const CASES = [
  { name: 'read_feed', option: 'posts', args: { feed_type: 'follow_users' }, scope: 'feeds:read' },
  {
    name: 'read_feed',
    option: 'rss_items',
    args: { feed_type: 'follow_rss_feeds' },
    scope: 'feeds:read',
  },
  {
    name: 'read_feed',
    option: 'referral_links',
    args: { feed_type: 'follow_users' },
    scope: 'feeds:read',
  },
  { name: 'discover_rss_feeds', option: 'search', args: {}, scope: 'rss-feeds:read' },
  { name: 'discover_rss_feeds', option: 'trending', args: {}, scope: 'rss-feeds:read' },
  { name: 'discover_rss_feeds', option: 'recommended', args: {}, scope: 'rss-feeds:read' },
] as const

describe('merged feed cursor errors — real services', () => {
  it.each(CASES)(
    '$name.$option reports a malformed cursor from its selected handler',
    async row => {
      const caller = { ...(await createTestUser()), membership_plan: null }
      const result = await callStructuredMcpTool(
        caller,
        row.name,
        optionArgs(row.option, { ...row.args, after: 'not-a-cursor' }),
        [row.scope],
      )

      expect(result).toEqual(INVALID_CURSOR)
    },
  )
})
