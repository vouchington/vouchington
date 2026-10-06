import assert from 'http-assert'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import { createApplication, getCommunityOrThrow } from '@services/communities'
import { runDelegatedCreate } from '@services/contribution-gating/run-delegated-create'
import type { Tool } from '@services/openai-agents/tool-types'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { objectSchema, successSchema } from './output-schema-shapes.mts'
import { requireActiveToolUser } from './private-user.mts'

type Args = {
  idempotency_key: string
  community_id: string
  answers: Record<string, unknown>
  message?: string
}

type Result = {
  success: true
  application: { id: string; community_id: string; status: 'pending'; created_at: string }
}

/** The longest cover message POST /api/v1/communities/:idOrSlug/applications accepts. */
const MAX_MESSAGE_LENGTH = 5000

const tool: Tool<Args, Result> = {
  schema: {
    name: 'apply_to_community',
    type: 'function',
    description:
      'Apply to join a private community, by its UUID or slug. answers maps each application question id to its answer: a string for short_text, long_text and single_select questions, an array of strings for multi_select, a boolean for checkbox. Pass an empty object when the community asks no questions. An unknown question id, a missing answer to a required question or an answer of the wrong type is INVALID_INPUT. message is an optional note to the moderators of at most 5000 characters. The call is refused with CONFLICT if the user already has a pending application or is a member, and with FORBIDDEN if the user is banned from the community. An archived community is CONFLICT, and applying to a public community is INVALID_INPUT; join it with join_community instead. Reuse the same UUID idempotency_key and arguments to safely retry; the first result is replayed. Returns the application id and its pending status; moderators decide it.',
    parameters: {
      type: 'object',
      properties: {
        idempotency_key: {
          type: 'string',
          format: 'uuid',
          description: 'A UUID for this application and its retries.',
        },
        community_id: { type: 'string', description: 'Community UUID or slug' },
        answers: {
          type: 'object',
          description: 'Answers keyed by application question id.',
          additionalProperties: {
            anyOf: [
              { type: 'string' },
              { type: 'boolean' },
              { type: 'array', items: { type: 'string' } },
              { type: 'null' },
            ],
          },
        },
        message: { type: 'string', description: 'Optional note to the moderators.' },
      },
      required: ['idempotency_key', 'community_id', 'answers'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Apply to Community',
    plan: 'plus',
    requiredScopes: { mcp: ['communities:read', 'communities:write'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    api: [{ method: 'POST', path: '/api/v1/communities/:idOrSlug/applications' }],
    outputSchema: successSchema({
      application: objectSchema({
        id: { type: 'string', format: 'uuid' },
        community_id: { type: 'string', format: 'uuid' },
        status: { const: 'pending' },
        created_at: { type: 'string', format: 'date-time' },
      }),
    }),
  },
  function: currentUser => async (args, invocationContext) => {
    const user = await requireActiveToolUser(currentUser)
    const authority = getDelegatedToolAuthority(user, invocationContext)
    const message = args.message?.trim() || undefined
    assert(
      message === undefined || message.length <= MAX_MESSAGE_LENGTH,
      422,
      'message must be 5000 characters or fewer',
    )
    return runDelegatedCreate({
      authority,
      currentUser: user,
      idempotencyKey: args.idempotency_key,
      intent: {
        tool: 'apply_to_community',
        community_id: args.community_id,
        answers: args.answers,
        message: message ?? null,
      },
      execute: async () => {
        const community = await getCommunityOrThrow(args.community_id)
        const application = await createApplication(
          user.id,
          getRequestContentProvenance(),
          community.id,
          args.answers,
          message,
        )
        return {
          success: true as const,
          application: {
            id: application.id,
            community_id: application.community_id,
            status: 'pending' as const,
            created_at: application.created_at.toISOString(),
          },
        }
      },
    })
  },
}

export default tool
