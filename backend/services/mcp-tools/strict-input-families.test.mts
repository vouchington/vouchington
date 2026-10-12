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
  ['read_crawler', optionArgs('list', {})],
  ['read_editorial_job', optionArgs('import_batch', { batch_id: id })],
  ['read_editorial_job', optionArgs('article_sync', { job_id: 'synthetic' })],
  ['list_user_landing_pages', { user_id: id }],
  ['list_moderation_reports', {}],
  ['list_post_review_queue', {}],
  ['list_pending_topic_claims', {}],
  ['read_user_moderation', optionArgs('warnings', { userId: id })],
  ['read_user_moderation', optionArgs('context', { userId: id })],
  ['read_report_integrity', optionArgs('flags', {})],
  ['read_report_integrity', optionArgs('penalties', {})],
  ['read_vote_integrity', optionArgs('flags', {})],
  ['read_vote_integrity', optionArgs('penalties', {})],
  ['get_moderation_analytics', {}],
  ['get_copyright_notice', { id }],
  ['read_admin_metrics', optionArgs('growth', {})],
  ['read_moderation_appeal', optionArgs('list', {})],
  ['read_review_dispute', optionArgs('list', {})],
  ['read_queue_catalog', optionArgs('queues', {})],
  ['read_queue_catalog', optionArgs('scheduled_jobs', {})],
  ['read_queue_catalog', optionArgs('backfills', {})],
  ['read_dynamic_config', optionArgs('namespace', { namespace: 'synthetic' })],
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
