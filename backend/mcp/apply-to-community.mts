import assert from 'http-assert'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import { isUUID } from '@modules/utils'
import {
  createApplication,
  getCommunityOrThrow,
  validateCommunitySlug,
} from '@services/communities'
import { admitDelegatedCreate } from '@services/contribution-gating/admit-delegated-create'
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

/** The community UUID or slug in its canonical lowercase form, so a retry cannot differ by case. */
function parseCommunityRef(value: unknown): string {
  const ref = typeof value === 'string' ? value.trim().toLowerCase() : ''
  assert(ref !== '', 422, 'community_id must be a community UUID or slug')
  return isUUID(ref) ? ref : validateCommunitySlug(ref)
}

const tool: Tool<Args, Result> = {
  schema: {
    name: 'apply_to_community',
    type: 'function',
    description:
      'Apply to a private community. answers maps question ids to strings (short_text, long_text, single_select), string arrays (multi_select), or booleans (checkbox). Send {} for no questions. message allows 5000 characters. Unknown, missing or mistyped answers are INVALID_INPUT. Use participate_in_community(join) for public communities.',
    parameters: {
      type: 'object',
      properties: {
        idempotency_key: {
          type: 'string',
          format: 'uuid',
        },
        community_id: { type: 'string', description: 'Community UUID or slug' },
        answers: {
          type: 'object',
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
    audience: 'user',
    title: 'Apply to Community',
    plan: 'plus',
    requiredScopes: ['communities:read', 'communities:write'],
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
    const communityRef = parseCommunityRef(args.community_id)
    assert(
      typeof args.answers === 'object' && args.answers !== null && !Array.isArray(args.answers),
      422,
      'answers must be an object keyed by application question id',
    )
    const message = args.message?.trim() || undefined
    assert(
      message === undefined || message.length <= MAX_MESSAGE_LENGTH,
      422,
      'message must be 5000 characters or fewer',
    )
    return admitDelegatedCreate({
      authority,
      currentUser: user,
      idempotencyKey: args.idempotency_key,
      route: 'communities.applications.create',
      scope: `community:${communityRef}`,
      intent: { community_id: communityRef, answers: args.answers, message: message ?? null },
      execute: async query => {
        const community = await getCommunityOrThrow(communityRef, { query })
        const application = await createApplication(
          user.id,
          getRequestContentProvenance(),
          community.id,
          args.answers,
          message,
          { query },
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
