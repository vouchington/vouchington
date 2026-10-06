import {
  createModerationAppeal,
  parseCreateModerationAppealInput,
} from '@services/moderation-appeals'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import { admitDelegatedCreate } from '@services/contribution-gating/admit-delegated-create'
import type { Tool } from '@services/openai-agents/tool-types'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { APPEAL_SCHEMA, toMcpAppeal, type McpAppeal } from './mcp-case-output.mts'
import { successSchema } from './output-schema-shapes.mts'
import { requireActiveToolUser } from './private-user.mts'

type Args = {
  idempotency_key: string
  target_type: string
  target_id: string
  appeal_reason: string
  post_removal_kind?: string
}

type Result = { success: true; appeal: McpAppeal; is_duplicate: boolean }

const tool: Tool<Args, Result> = {
  schema: {
    name: 'create_moderation_appeal',
    type: 'function',
    description:
      "Appeal a moderation decision against the current user: a warning, a community ban or the removal of one of their posts. target_type says which and target_id is the id of the warning, the ban or the removed post. post_removal_kind is only for a removal, and tells a platform removal from a community removal when the post has both. appeal_reason is the case for the moderators, at most 4000 characters. The call is refused with NOT_FOUND when the decision does not exist or is already revoked or lifted, with FORBIDDEN when it is not the current user's, and with INVALID_INPUT when the post has not been removed. Appealing a decision that already has an open appeal from the user updates that appeal and returns is_duplicate true. Moderators decide the appeal; read the outcome with get_my_moderation_appeal. A suspended account cannot use MCP at all, so an account suspension is appealed on the web. Reuse the same UUID idempotency_key and arguments to safely retry; the first result is replayed. Returns the appeal.",
    parameters: {
      type: 'object',
      properties: {
        idempotency_key: {
          type: 'string',
          format: 'uuid',
          description: 'A UUID for this appeal and its retries.',
        },
        target_type: { type: 'string', enum: ['warning', 'ban', 'removal'] },
        target_id: {
          type: 'string',
          format: 'uuid',
          description: 'The ID of the warning, community ban or removed post.',
        },
        appeal_reason: { type: 'string', description: 'The case for the moderators.' },
        post_removal_kind: { type: 'string', enum: ['platform', 'community'] },
      },
      required: ['idempotency_key', 'target_type', 'target_id', 'appeal_reason'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Appeal Moderation Decision',
    plan: 'plus',
    requiredScopes: { mcp: ['appeals:read', 'appeals:write'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    api: [{ method: 'POST', path: '/api/v1/appeals' }],
    outputSchema: successSchema({ appeal: APPEAL_SCHEMA, is_duplicate: { type: 'boolean' } }),
  },
  function: currentUser => async (args, invocationContext) => {
    const user = await requireActiveToolUser(currentUser)
    const authority = getDelegatedToolAuthority(user, invocationContext)
    const input = parseCreateModerationAppealInput({
      target_type: args.target_type,
      target_id: args.target_id,
      appeal_reason: args.appeal_reason,
      post_removal_kind: args.post_removal_kind,
    })
    return admitDelegatedCreate({
      authority,
      currentUser: user,
      idempotencyKey: args.idempotency_key,
      route: 'appeals.create',
      scope: 'global',
      intent: { input },
      execute: async query => {
        const { appeal, isDuplicate } = await createModerationAppeal(
          user,
          getRequestContentProvenance(),
          input,
          { query },
        )
        return {
          success: true as const,
          appeal: await toMcpAppeal(appeal),
          is_duplicate: isDuplicate,
        }
      },
    })
  },
}

export default tool
