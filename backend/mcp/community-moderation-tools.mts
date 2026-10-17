import type { ToolApiEndpoint } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { createMergedTool } from './create-merged-tool.mts'
import { requireActiveToolUser, requirePrivateToolUser } from './private-user.mts'
import { findSchemaViolation } from './schema-validator.mts'
import {
  communityModerationInput,
  communityModerationOutput,
  type CommunityModerationHandler,
} from './community-moderation-contract.mts'
import { communityModerationOutputSchema } from './community-moderation-output-schemas.mts'
import { communityModerationRoutes } from './community-moderation-routes.mts'
import { communityModerationReadLists } from './community-moderation-read-lists.mts'
import { communityModerationReadAnalytics } from './community-moderation-read-analytics.mts'
import { communityModerationReadQueues } from './community-moderation-read-queues.mts'
import { communityModerationListWrites } from './community-moderation-list-writes.mts'
import { communityModerationQueueWrites } from './community-moderation-queue-writes.mts'
import { communityModerationOtherWrites } from './community-moderation-other-writes.mts'
import { communityModerationUpdates } from './community-moderation-updates.mts'

const handlers: Record<string, CommunityModerationHandler> = {
  ...communityModerationReadLists,
  ...communityModerationReadAnalytics,
  ...communityModerationReadQueues,
  ...communityModerationListWrites,
  ...communityModerationQueueWrites,
  ...communityModerationOtherWrites,
  ...communityModerationUpdates,
}

const definitions = [
  { name: 'read_community_moderation', methods: ['GET'], plus: false, destructive: false },
  { name: 'add_community_moderation', methods: ['POST'], plus: true, destructive: true },
  { name: 'update_community_moderation', methods: ['PUT', 'PATCH'], plus: true, destructive: true },
  { name: 'remove_community_moderation', methods: ['DELETE'], plus: true, destructive: true },
] as const

export const communityModerationGroups = definitions.map(definition => ({
  name: definition.name,
  options: communityModerationRoutes
    .filter(route => (definition.methods as readonly string[]).includes(route.method))
    .map(route => {
      const endpoint: ToolApiEndpoint = { method: route.method, path: route.path }
      const parameters = communityModerationInput(endpoint)
      const handler = handlers[route.option]
      if (!handler) throw new Error(`Missing community moderation handler: ${route.option}`)
      return {
        option: route.option,
        source: {
          schema: { description: `${route.method} ${route.path}`, parameters },
          meta: {
            surfaces: ['mcp'] as const,
            title: route.option.replaceAll('_', ' '),
            plan: definition.plus ? ('plus' as const) : ('free' as const),
            requiredScopes: {
              mcp: definition.plus
                ? (['community-moderation:read', 'community-moderation:write'] as const)
                : (['community-moderation:read'] as const),
            },
            annotations: definition.plus
              ? {
                  readOnlyHint: false as const,
                  destructiveHint: definition.destructive,
                  idempotentHint: false,
                }
              : { readOnlyHint: true as const },
            api: [endpoint],
            outputSchema: communityModerationOutputSchema(endpoint),
          },
          function: (currentUser: BasicUser) => async (args: unknown) => {
            const user = definition.plus
              ? await requireActiveToolUser(currentUser)
              : await requirePrivateToolUser(currentUser)
            const violation = findSchemaViolation(parameters, args)
            if (violation) throw new Error(`Invalid community moderation arguments: ${violation}`)
            return communityModerationOutput(
              await handler(user, args as Parameters<CommunityModerationHandler>[1]),
            )
          },
        },
      }
    }),
}))

export const communityModerationTools = communityModerationGroups.map(group =>
  createMergedTool(group.name, group.name.replaceAll('_', ' '), group.options),
)
