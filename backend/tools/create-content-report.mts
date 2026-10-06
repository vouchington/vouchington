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
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { objectSchema, successSchema } from './output-schema-shapes.mts'
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
      'Report a post, comment, user, hostname or RSS feed item to the moderators. Reports are about user content only; copyright claims use the copyright process. Reporting something you already have an open report on updates that report and returns is_duplicate true. Reuse the same UUID idempotency_key and arguments to safely retry; the first result is replayed. The note is optional and at most 1000 characters. The vote_manipulation reason is for posts only.',
    parameters: {
      type: 'object',
      properties: {
        idempotency_key: {
          type: 'string',
          format: 'uuid',
          description: 'A UUID for this report and its retries.',
        },
        entity_type: { type: 'string', enum: [...MODERATION_REPORT_ENTITY_TYPES] },
        entity_id: {
          type: 'string',
          format: 'uuid',
          description: 'The ID of the reported entity.',
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
    surfaces: ['mcp'],
    title: 'Report Content',
    plan: 'plus',
    requiredScopes: { mcp: ['reports:write'] },
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
    const input = parseCreateModerationReportInput({
      entityType: args.entity_type,
      entityId: args.entity_id,
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
