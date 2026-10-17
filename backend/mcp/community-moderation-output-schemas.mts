import type { ToolApiEndpoint, ToolOutputSchema } from '@services/openai-agents/tool-types'
import { adminOutputSchema } from './untrusted-output.mts'
import {
  COMMUNITY_MODERATION_NO_CONTENT_SCHEMA,
  COMMUNITY_MODERATION_UNTRUSTED_FIELDS,
  communityModerationNamedOutput,
} from './community-moderation-contract.mts'
import { communityModerationRoutes } from './community-moderation-routes.mts'
import { communityModerationReadOutput } from './community-moderation-output-reads.mts'
import {
  communityModerationIsNoContent,
  communityModerationWriteOutput,
} from './community-moderation-output-writes.mts'

// These checked-in response entries are open Record<string, unknown> placeholders, so use the
// current route's concrete REST shape below. All other named responses use the canonical schema.
const openNamedResponses = new Set(['list_applications', 'list_invites', 'list_pending_posts'])

export function communityModerationOutputSchema(endpoint: ToolApiEndpoint): ToolOutputSchema {
  const route = communityModerationRoutes.find(
    entry => entry.method === endpoint.method && entry.path === endpoint.path,
  )
  if (!route)
    throw new Error(`Unapproved community moderation route ${endpoint.method}:${endpoint.path}`)
  if (communityModerationIsNoContent(route.option)) return COMMUNITY_MODERATION_NO_CONTENT_SCHEMA
  const named = openNamedResponses.has(route.option)
    ? null
    : communityModerationNamedOutput(endpoint)
  if (named) return named
  const schema =
    communityModerationReadOutput(route.option) ?? communityModerationWriteOutput(route.option)
  if (!schema) throw new Error(`No community moderation output contract for ${route.option}`)
  return adminOutputSchema(schema, [...COMMUNITY_MODERATION_UNTRUSTED_FIELDS]) as ToolOutputSchema
}
