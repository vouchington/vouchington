import { optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { randomUUID } from 'node:crypto'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import { createTestUser } from '@voucha/test-helpers'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ADMIN_MCP_SERVER_CONFIG, USER_MCP_SERVER_CONFIG } from './config.mts'
import { callMcpTool } from './call-tool.mts'
import { validateToolArguments } from './validate-tool-arguments.mts'

const id = randomUUID()
// One representative for each domain/builder family, using schema-valid arguments so
// rejection cannot be accidentally satisfied by a missing required field.
const families: [string, Record<string, unknown>][] = [
  ['read_posts', optionArgs('search', {})],
  ['discover_topics', optionArgs('search', {})],
  ['discover_communities', optionArgs('search', {})],
  ['read_hostnames', optionArgs('search', {})],
  ['read_users', optionArgs('search', { q: 'sample' })],
  ['discover_rss_feeds', optionArgs('search', {})],
  ['read_rss_feed_item', optionArgs('list', {})],
  ['read_rss_feed', optionArgs('crawls', { rss_feed_id: id })],
  ['read_feed', optionArgs('posts', { feed_type: 'any' })],
  ['read_feed', optionArgs('rss_items', { feed_type: 'any' })],
  ['read_feed', optionArgs('referral_links', { feed_type: 'follow_users' })],
  ['read_my_lists', optionArgs('get', { list_id: id })],
  ['read_my_profile', optionArgs('overview', {})],
  ['manage_my_cards', { action: 'remove', id }],
  ['manage_my_point_valuations', { action: 'remove', id }],
  ['manage_my_rewards_statuses', { action: 'remove', id }],
  ['manage_my_spending', { action: 'remove', id }],
  ['read_reference_data', optionArgs('currencies', {})],
  ['read_my_notifications', optionArgs('list', {})],
  ['get_referral_links', { topic_id: id }],
  ['create_post', { idempotency_key: id }],
  ['create_community', { name: 'Synthetic test community', idempotency_key: id }],
  ['read_my_review_disputes', optionArgs('list', {})],
  ['read_my_moderation_appeals', optionArgs('list', {})],
  ['list_my_topic_recommendations', {}],
  ['get_editorial_story', { story_id: id }],
  ['list_crawlers', {}],
  ['get_import_batch', { batch_id: id }],
  ['get_article_sync', { job_id: 'synthetic' }],
  ['list_user_landing_pages', { user_id: id }],
  ['list_moderation_reports', {}],
  ['list_post_review_queue', {}],
  ['list_pending_topic_claims', {}],
  ['list_user_warnings', { userId: id }],
  ['get_user_moderation_context', { userId: id }],
  ['list_report_integrity_flags', {}],
  ['list_report_abuse_penalties', {}],
  ['list_vote_integrity_flags', {}],
  ['list_vote_ring_penalties', {}],
  ['get_moderation_analytics', {}],
  ['get_copyright_notice', { id }],
  ['get_growth_metrics', {}],
  ['list_moderation_appeals', {}],
  ['list_review_disputes', {}],
  ['list_queues', {}],
  ['list_scheduled_jobs', {}],
  ['list_backfills', {}],
  ['get_dynamic_config_namespace', { namespace: 'synthetic' }],
]

describe('unknown MCP arguments fail before dispatch across tool families', () => {
  let user: Awaited<ReturnType<typeof createTestUser>> & { membership_plan: 'pro' }
  beforeAll(async () => {
    user = { ...(await createTestUser({ administrator: true })), membership_plan: 'pro' }
  })

  it.each(families)(
    '%s rejects an unknown field without invoking its function',
    async (name, args) => {
      const tool = ALL_TOOLS.find(candidate => candidate.schema.name === name)!
      expect(tool).toBeDefined()
      expect(validateToolArguments(tool.schema.parameters, args)).toBeNull()
      const invoke = vi.spyOn(tool, 'function')
      try {
        const config = tool.meta?.surfaces.includes('admin_mcp')
          ? ADMIN_MCP_SERVER_CONFIG
          : USER_MCP_SERVER_CONFIG
        await expect(
          callMcpTool(
            name,
            { ...args, unexpected_field: true },
            user,
            Object.keys(SCOPE_DEFINITIONS) as ApiScope[],
            config,
            true,
          ),
        ).rejects.toMatchObject({
          code: ErrorCode.InvalidParams,
          message: expect.stringContaining('additional properties'),
        })
        expect(invoke).not.toHaveBeenCalled()
      } finally {
        invoke.mockRestore()
      }
    },
  )
})
