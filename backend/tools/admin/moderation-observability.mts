import { searchModeratorActions, MODERATOR_ACTION_TYPES } from '@services/moderator-actions'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import { getModerationAnalytics } from '@services/moderation-analytics'
import type { ModerationAnalyticsRange } from '@services/moderation-analytics/types'
import { createAdminTool, adminInput, UUID_INPUT, PAGE_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

async function getActors(actorIds: string[]) {
  return Object.fromEntries(
    (await getUserPublicByAnyCachedBatch(actorIds)).flatMap(user =>
      user ? [[user.id, user]] : [],
    ),
  )
}
export const adminModerationObservabilityTools = [
  createAdminTool<{
    community_id?: string
    actor_id?: string
    action_type?: (typeof MODERATOR_ACTION_TYPES)[number]
    after?: string
    limit?: number
  }>({
    name: 'search_moderator_actions',
    description: 'Search audited moderator actions with staff actor projections.',
    scope: 'moderation:read',
    api: { method: 'GET', path: '/api/v1/admin/modlog' },
    parameters: adminInput({
      ...PAGE_INPUT,
      community_id: UUID_INPUT,
      actor_id: UUID_INPUT,
      action_type: { type: 'string', enum: MODERATOR_ACTION_TYPES },
    }),
    outputSchema: adminRouteOutputSchema({ method: 'GET', path: '/api/v1/admin/modlog' }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (_user, args) => {
      const result = await searchModeratorActions({
        communityId: args.community_id,
        actorId: args.actor_id,
        actionType: args.action_type,
        after: args.after,
        limit: args.limit ?? 25,
      })
      return {
        results: result.results.map(row => ({ __entity_type: 'moderator_action', id: row.id })),
        page_info: result.page_info,
        moderator_actions: Object.fromEntries(result.results.map(row => [row.id, row])),
        users: await getActors(result.results.flatMap(row => (row.actor_id ? [row.actor_id] : []))),
      }
    },
  }),
  createAdminTool<{ range?: ModerationAnalyticsRange }>({
    name: 'get_moderation_analytics',
    description: 'Read global staff moderation analytics and workload.',
    scope: 'moderation:read',
    api: { method: 'GET', path: '/api/v1/admin/moderation-analytics' },
    parameters: adminInput({
      range: { type: 'string', enum: ['today', '7d', '30d', '90d', 'all'] },
    }),
    outputSchema: adminRouteOutputSchema({
      method: 'GET',
      path: '/api/v1/admin/moderation-analytics',
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (_user, args) => {
      const metrics = await getModerationAnalytics(args.range ?? '30d', { type: 'global' })
      metrics.moderator_workload.users = await getActors(
        metrics.moderator_workload.moderators.map(row => row.actor_id),
      )
      return metrics
    },
  }),
]
