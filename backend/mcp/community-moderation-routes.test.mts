import { describe, expect, it } from 'vitest'
import { ALL_TOOLS, getRegisteredToolByName } from './registry/index.mts'
import { communityModerationGroups } from './community-moderation-tools.mts'
import { validateToolArguments } from '../services/mcp-tools/validate-tool-arguments.mts'
import { planMcpCalls } from '../services/mcp-tools/classify-calls.mts'
import { USER_MCP_SERVER_CONFIG } from '../services/mcp-tools/config.mts'

const prefix = '/api/v1/communities/:idOrSlug'
const routes = {
  read_community_moderation: [
    ['list_applications', 'GET', '/applications'],
    ['list_automod_actions', 'GET', '/automod/recent-actions'],
    ['list_bans', 'GET', '/bans'],
    ['list_invites', 'GET', '/invites'],
    ['read_moderation_analytics', 'GET', '/moderation-analytics'],
    ['read_moderator_stats', 'GET', '/moderator-stats'],
    ['read_moderator_vacation', 'GET', '/moderator-vacation'],
    ['read_modlog', 'GET', '/modlog'],
    ['list_pending_posts', 'GET', '/posts/pending'],
    ['list_pending_reports', 'GET', '/reports/pending'],
    ['list_restrictions', 'GET', '/restrictions'],
    ['list_saved_replies', 'GET', '/saved-replies'],
  ],
  add_community_moderation: [
    ['ban_user', 'POST', '/bans'],
    ['add_domain_to_list', 'POST', '/list-items/domains'],
    ['add_post_to_list', 'POST', '/list-items/posts'],
    ['add_rss_feed_to_list', 'POST', '/list-items/rss-feeds'],
    ['add_topic_to_list', 'POST', '/list-items/topics'],
    ['add_url_to_list', 'POST', '/list-items/urls'],
    ['dismiss_automod_flag', 'POST', '/posts/:postId/automod-flag/dismissal'],
    ['escalate_post', 'POST', '/posts/:postId/escalation'],
    ['open_post_mod_internal_thread', 'POST', '/posts/:postId/mod-internal-thread'],
    ['escalate_report', 'POST', '/reports/:reportId/escalation'],
    ['open_report_mod_internal_thread', 'POST', '/reports/:reportId/mod-internal-thread'],
    ['activate_restrictions', 'POST', '/restrictions'],
    ['create_saved_reply', 'POST', '/saved-replies'],
    ['issue_warning', 'POST', '/warnings'],
  ],
  update_community_moderation: [
    ['update_community_settings', 'PATCH', ''],
    ['review_application', 'PATCH', '/applications/:id'],
    ['set_vacation_digest_preference', 'PATCH', '/moderator-vacation'],
    ['update_modmail_thread', 'PATCH', '/modmail/:conversationId'],
    ['update_post_type_settings', 'PATCH', '/post-type-settings'],
    ['moderate_post', 'PATCH', '/posts/:postId'],
    ['resolve_report', 'PATCH', '/reports/:reportId'],
    ['set_application_questions', 'PUT', '/application-questions'],
    ['set_moderator_vacation', 'PUT', '/moderator-vacation'],
    ['set_pinned_posts', 'PUT', '/pinned-posts'],
    ['claim_post', 'PUT', '/posts/:postId/claim'],
    ['claim_report', 'PUT', '/reports/:reportId/claim'],
  ],
  remove_community_moderation: [
    ['dismiss_ban_evasion', 'DELETE', '/ban-evasion/:userId'],
    ['lift_ban', 'DELETE', '/bans/:userId'],
    ['revoke_invite', 'DELETE', '/invites/:id'],
    ['remove_domain_from_list', 'DELETE', '/list-items/domains/:itemId'],
    ['remove_post_from_list', 'DELETE', '/list-items/posts/:itemId'],
    ['remove_rss_feed_from_list', 'DELETE', '/list-items/rss-feeds/:itemId'],
    ['remove_topic_from_list', 'DELETE', '/list-items/topics/:itemId'],
    ['remove_url_from_list', 'DELETE', '/list-items/urls/:itemId'],
    ['remove_member', 'DELETE', '/members/:userId'],
    ['clear_moderator_vacation', 'DELETE', '/moderator-vacation'],
    ['release_post_claim', 'DELETE', '/posts/:postId/claim'],
    ['deescalate_post', 'DELETE', '/posts/:postId/escalation'],
    ['release_report_claim', 'DELETE', '/reports/:reportId/claim'],
    ['deescalate_report', 'DELETE', '/reports/:reportId/escalation'],
    ['lift_restriction', 'DELETE', '/restrictions/:id'],
    ['delete_saved_reply', 'DELETE', '/saved-replies/:id'],
  ],
} as const

const expectedFlags = {
  read_community_moderation: { readOnlyHint: true },
  add_community_moderation: {
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: true,
  },
  update_community_moderation: {
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: true,
  },
  remove_community_moderation: {
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: true,
  },
} as const

describe('community moderator MCP routes', () => {
  it('publishes the 54 guarded REST operations in exactly four option groups', () => {
    expect(communityModerationGroups.map(group => group.name)).toEqual(Object.keys(routes))
    for (const group of communityModerationGroups) {
      const name = group.name as keyof typeof routes
      const tool = getRegisteredToolByName(name)
      expect(tool).toBeDefined()
      expect(group.options.map(({ option }) => option)).toEqual(
        routes[name].map(([option]) => option),
      )
      expect(tool!.meta).toMatchObject({
        surfaces: expect.arrayContaining(['mcp']),
        plan: name === 'read_community_moderation' ? 'free' : 'plus',
        requiredScopes: {
          mcp:
            name === 'read_community_moderation'
              ? ['community-moderation:read']
              : ['community-moderation:read', 'community-moderation:write'],
        },
        annotations: expectedFlags[name],
      })
      for (const [option, method, suffix] of routes[name]) {
        const selected = { option, arguments: { community: 'owned-community' } }
        expect(tool!.meta?.selectApi?.(selected)).toEqual([{ method, path: prefix + suffix }])
        expect(tool!.meta?.auditOption?.(selected)).toBe(option)
        const source = group.options.find(entry => entry.option === option)?.source
        expect(source?.meta?.api).toEqual([{ method, path: prefix + suffix }])
        expect(source?.schema.parameters).toMatchObject({
          type: 'object',
          additionalProperties: false,
          required: expect.arrayContaining(['community']),
        })
      }
    }
  })

  it('closes each tool envelope and rejects unknown or cross-group options before dispatch', () => {
    for (const [name, expected] of Object.entries(routes)) {
      const schema = getRegisteredToolByName(name)!.schema.parameters
      for (const input of [
        { option: expected[0]![0], arguments: {}, extra: true },
        { option: 'delete_community', arguments: { community: 'anything' } },
        { option: 'record_automod_feedback', arguments: { community: 'anything' } },
        { option: expected[0]![0], arguments: { community: 'anything', role: 'owner' } },
        { option: expected[0]![0] },
      ]) {
        expect(validateToolArguments(schema, input)).not.toBeNull()
      }
      const foreign = Object.entries(routes).find(([other]) => other !== name)![1][0]![0]
      expect(validateToolArguments(schema, { option: foreign, arguments: {} })).not.toBeNull()
    }
  })

  it('charges only the selected REST route and records the chosen option', () => {
    const caller = { id: crypto.randomUUID(), roles: [], membership_plan: 'plus' as const }
    const scopes = ['community-moderation:read', 'community-moderation:write'] as const
    const call = (name: string, input: Record<string, unknown>) =>
      planMcpCalls(
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: input } },
        caller,
        scopes,
        USER_MCP_SERVER_CONFIG,
      )
    const readPlan = call('read_community_moderation', {
      option: 'list_saved_replies',
      arguments: { community: 'owned-community' },
    })
    expect(readPlan.events[0]).toMatchObject({ option: 'list_saved_replies' })
    expect(readPlan.charges).toEqual([
      {
        eventIndex: 0,
        requestId: 1,
        routeKeys: ['GET:/api/v1/communities/:idOrSlug/saved-replies'],
      },
    ])
    const banInput = { community: 'owned-community', user_id: crypto.randomUUID() }
    const banPlan = call('add_community_moderation', {
      option: 'ban_user',
      arguments: banInput,
    })
    expect(banPlan.events[0]).toMatchObject({ option: 'ban_user' })
    expect(banPlan.charges).toEqual([
      { eventIndex: 0, requestId: 1, routeKeys: ['POST:/api/v1/communities/:idOrSlug/bans'] },
    ])
    expect(
      call('add_community_moderation', {
        option: 'ban_user',
        arguments: { ...banInput, role: 'owner' },
      }).charges,
    ).toEqual([])
  })

  it('makes every excluded operation unreachable from every MCP tool', () => {
    const excluded = (method: string, path: string) => {
      const match = path.match(/^\/api\/v1\/communities\/[^/]+(?<tail>\/.*)?$/)
      if (!match) return false
      const tail = match.groups?.tail ?? ''
      return (
        (method === 'DELETE' && tail === '') ||
        (method === 'POST' && tail === '/ownership-transfers') ||
        (method === 'PATCH' && /^\/members\/[^/]+$/.test(tail)) ||
        tail === '/agent-prompts' ||
        tail.startsWith('/agent-prompts/') ||
        tail === '/ai-agents' ||
        tail.startsWith('/ai-agents/') ||
        (method === 'PATCH' && tail === '/automod-settings') ||
        (method === 'POST' && tail === '/automod/simulate') ||
        (method === 'POST' && /^\/automod\/recent-actions\/[^/]+\/feedback$/.test(tail))
      )
    }
    const exposed = ALL_TOOLS.filter(tool =>
      tool.meta?.surfaces.some(surface => surface === 'mcp' || surface === 'admin_mcp'),
    )
    for (const tool of exposed) {
      for (const route of tool.meta?.api ?? []) {
        expect(excluded(route.method, route.path)).toBe(false)
      }
    }
  })
})
