import contracts from '@voucha/api-fixtures/v1/request-contracts.json' with { type: 'json' }
import type { PrivateUser } from '@services/users/types'
import type { ToolApiEndpoint, ToolOutputSchema } from '@services/openai-agents/tool-types'
import { inlineSchemaReferences, routeResponseSchema } from './route-response-schema.mts'
import {
  adminOutputSchema,
  filterPrivateOutputFields,
  wrapAdminOutput,
} from './untrusted-output.mts'
import { communityModerationRoutes } from './community-moderation-routes.mts'
import { MODERATION_REPORT_RESOLUTION_STATUSES } from '@services/moderation-reports'
import { COMMUNITY_RESTRICTION_TYPES } from '@services/communities'
import { communityModerationUuidPaths } from './community-moderation-input-paths.mts'

export const COMMUNITY_MODERATION_UNTRUSTED_FIELDS = [
  'name',
  'rules_markdown',
  'options',
  'target_label',
  'message',
  'question',
  'answers',
  'authored_title',
  'model_output',
  'internal_response',
  'metadata',
] as const

export type CommunityModerationArgs = Record<string, unknown> & { community: string }
export type CommunityModerationHandler = (
  currentUser: PrivateUser,
  args: CommunityModerationArgs,
) => Promise<unknown>

const fixture = contracts as unknown as {
  operations: Record<string, Record<string, Record<string, unknown>>>
  responses: Record<string, Record<string, unknown>>
  components: Record<string, Record<string, unknown>>
}

const bodyFieldOverrides: Record<
  string,
  { properties: Record<string, unknown>; required?: string[] }
> = {
  ban_user: {
    properties: {
      user_id: { type: 'string', format: 'uuid', minLength: 36, maxLength: 36 },
      reason: { type: ['string', 'null'] },
      expires_at: { type: ['string', 'null'] },
    },
    required: ['user_id'],
  },
  activate_restrictions: {
    properties: {
      restriction_types: { type: 'array', items: { enum: COMMUNITY_RESTRICTION_TYPES } },
      reason: { type: ['string', 'null'] },
      expires_at: { type: ['string', 'null'] },
    },
    required: ['restriction_types'],
  },
  set_vacation_digest_preference: {
    properties: {
      should_suppress_community_digests_while_on_vacation: { type: 'boolean' },
    },
    required: ['should_suppress_community_digests_while_on_vacation'],
  },
  moderate_post: {
    properties: {
      private_note: { type: 'string' },
      reason: { type: 'string' },
      reason_code: { type: 'string' },
      status: { enum: ['approved', 'rejected', 'unpublished', 'restored'] },
    },
    required: ['status'],
  },
  resolve_report: {
    properties: { status: { enum: MODERATION_REPORT_RESOLUTION_STATUSES } },
    required: ['status'],
  },
}

/** Keep the MCP input fields in lockstep with the checked-in REST operation. */
export function communityModerationInput(endpoint: ToolApiEndpoint): Record<string, unknown> {
  const key = `${endpoint.method}:${endpoint.path}`
  const operation = fixture.operations[key]
  if (!operation) throw new Error(`Missing REST operation ${key}`)
  const communityScoped = endpoint.path.startsWith('/api/v1/communities/:idOrSlug')
  const properties: Record<string, unknown> = communityScoped
    ? { community: { type: 'string', minLength: 1, description: 'Community UUID or slug.' } }
    : {}
  const required = new Set(communityScoped ? ['community'] : [])
  const definitions: Record<string, unknown> = {}
  const option = communityModerationRoutes.find(
    route => route.method === endpoint.method && route.path === endpoint.path,
  )?.option
  for (const section of ['path', 'query', 'body'] as const) {
    const raw = operation[section]
    if (!raw) continue
    const schema = inlineSchemaReferences(raw, fixture.components)
    if (schema['$defs']) Object.assign(definitions, schema['$defs'])
    const fields = schema['properties'] as Record<string, unknown> | undefined
    if (!fields) {
      if (section === 'body') {
        properties['body'] = schema
        required.add('body')
      }
      continue
    }
    for (const [name, field] of Object.entries(fields)) {
      if (name !== 'idOrSlug' || !communityScoped) properties[name] = field
    }
    for (const name of (schema['required'] as string[] | undefined) ?? []) {
      if (name !== 'idOrSlug' || !communityScoped) required.add(name)
    }
  }
  const override = option ? bodyFieldOverrides[option] : undefined
  if (override) {
    Object.assign(properties, override.properties)
    for (const field of override.required ?? []) required.add(field)
  }
  const uuidField = option ? communityModerationUuidPaths[option] : undefined
  const uuidFields = uuidField ? [uuidField] : []
  if (option === 'delete_mod_note') uuidFields.push('noteId')
  for (const uuidField of uuidFields) {
    // REST accepts the 36-character path form; AJV's UUID format also permits URNs.
    properties[uuidField] = {
      ...(properties[uuidField] as Record<string, unknown>),
      format: 'uuid',
      minLength: 36,
      maxLength: 36,
    }
  }
  if (option === 'list_saved_replies' || option === 'read_moderator_stats') {
    properties['after'] = { type: 'string' }
    properties['limit'] = { type: 'integer', minimum: 1 }
  }
  if (
    option === 'list_automod_actions' ||
    option === 'read_modlog' ||
    option === 'list_pending_reports'
  ) {
    const limit = properties['limit'] as Record<string, unknown> | undefined
    if (limit) {
      const { maximum: _maximum, ...clampedLimit } = limit
      properties['limit'] = clampedLimit
    }
  }
  return {
    type: 'object',
    properties,
    required: [...required],
    additionalProperties: false,
    ...(Object.keys(definitions).length ? { $defs: definitions } : {}),
  }
}

/** A 204 REST response is represented explicitly as a successful tool call. */
export const COMMUNITY_MODERATION_NO_CONTENT_SCHEMA: ToolOutputSchema = {
  type: 'object',
  properties: { success: { const: true } },
  required: ['success'],
  additionalProperties: false,
}
export const communityModerationNoContent = () => ({ success: true as const })

export function communityModerationNamedOutput(endpoint: ToolApiEndpoint): ToolOutputSchema | null {
  if (!fixture.responses[`${endpoint.method}:${endpoint.path}`]) return null
  return adminOutputSchema(routeResponseSchema(endpoint), [
    ...COMMUNITY_MODERATION_UNTRUSTED_FIELDS,
  ]) as ToolOutputSchema
}

export async function communityModerationOutput(value: unknown): Promise<unknown> {
  return wrapAdminOutput(filterPrivateOutputFields(value), [
    ...COMMUNITY_MODERATION_UNTRUSTED_FIELDS,
  ])
}
