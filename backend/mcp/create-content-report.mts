import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import { admitDelegatedCreate } from '@services/contribution-gating/admit-delegated-create'
import {
  createModerationReport,
  MODERATION_REPORT_ENTITY_TYPES,
  MODERATION_REPORT_REASONS,
  parseCreateModerationReportInput,
  type ModerationReport,
} from '@services/moderation-reports'
import type { Tool } from '@services/openai-agents/tool-types'
import assert from 'http-assert'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { canonicalEntityId } from './resolve-entity-reference.mts'
import { objectSchema, successSchema } from '@vouchington/mcp-server/schema'
import { requireActiveToolUser } from './private-user.mts'

type Args = {
  idempotency_key: string
  entity_type: string
  entity_id: string
  reason: string
  note?: string | null
}

type Result = {
  success: true
  report: {
    id: string
    entity_type: ModerationReport['entity_type']
    entity_id: string
    reason: ModerationReport['reason']
    status: 'pending'
    created_at: string
  }
  is_duplicate: boolean
}

const tool: Tool<Args, Result> = {
  schema: {
    name: 'create_content_report',
    type: 'function',
    description:
      'Report a post, comment, user, hostname or RSS item to moderators. Copyright claims use the copyright process. An open report on the same entity is updated (is_duplicate true). The optional note is at most 1000 characters. vote_manipulation applies only to posts.',
    parameters: {
      type: 'object',
      properties: {
        idempotency_key: {
          type: 'string',
          format: 'uuid',
        },
        entity_type: { type: 'string', enum: [...MODERATION_REPORT_ENTITY_TYPES] },
        entity_id: {
          type: 'string',
          description:
            'Post or comment id or slug, user id or username, or the id of an RSS item or hostname',
        },
        reason: { type: 'string', enum: [...MODERATION_REPORT_REASONS] },
        note: { type: 'string', description: 'Optional context for the moderators.' },
      },
      required: ['idempotency_key', 'entity_type', 'entity_id', 'reason'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    audience: 'user',
    title: 'Report Content',
    plan: 'plus',
    requiredScopes: ['reports:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    api: [{ method: 'POST', path: '/api/v1/reports' }],
    outputSchema: successSchema({
      report: objectSchema({
        id: { type: 'string', format: 'uuid' },
        entity_type: { enum: [...MODERATION_REPORT_ENTITY_TYPES] },
        entity_id: { type: 'string', format: 'uuid' },
        reason: { enum: [...MODERATION_REPORT_REASONS] },
        status: { const: 'pending' },
        created_at: { type: 'string', format: 'date-time' },
      }),
      is_duplicate: { type: 'boolean' },
    }),
  },
  function: currentUser => async (args, invocationContext) => {
    const user = await requireActiveToolUser(currentUser)
    const authority = getDelegatedToolAuthority(user, invocationContext)
    const entityType = args.entity_type === 'comment' ? 'post' : args.entity_type
    const entityId = await canonicalEntityId(entityType, args.entity_id)
    assert(entityId, 404, 'Reportable entity not found')
    const input = parseCreateModerationReportInput({
      entityType: args.entity_type,
      entityId,
      reason: args.reason,
      note: args.note,
    })
    return admitDelegatedCreate({
      authority,
      currentUser: user,
      idempotencyKey: args.idempotency_key,
      route: 'reports.create',
      scope: 'global',
      intent: { input },
      execute: async query => {
        const { report, isDuplicate } = await createModerationReport(
          user.id,
          getRequestContentProvenance(),
          input,
          { query },
        )
        return {
          success: true as const,
          report: {
            id: report.id,
            entity_type: report.entity_type,
            entity_id: report.entity_id,
            reason: report.reason,
            status: 'pending' as const,
            created_at: report.created_at.toISOString(),
          },
          is_duplicate: isDuplicate,
        }
      },
    })
  },
}

export default tool
