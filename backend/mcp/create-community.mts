import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import {
  createCommunity,
  validateCreateCommunityInput,
  type CreateCommunityInput,
} from '@services/communities'
import { assertCanCreateCommunity } from '@services/communities/authorization'
import { assertWithinContributionActionLimit } from '@services/contribution-gating/limits'
import { admitDelegatedCreate } from '@services/contribution-gating/admit-delegated-create'
import { getUserActivePlan } from '@services/memberships'
import type { Tool } from '@services/openai-agents/tool-types'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { objectSchema, successSchema } from './output-schema-shapes.mts'
import { requireActiveToolUser } from './private-user.mts'

type Args = {
  idempotency_key: string
  name: string
  slug?: string
  markdown?: string
  visibility?: 'public' | 'private'
  default_language?: string
  should_allow_review_posts?: boolean
  should_allow_data_point_posts?: boolean
  member_roster_visibility?: 'public' | 'users' | 'members' | 'moderators'
  member_invites_allowed?: boolean
  post_approval_required?: boolean
}

type Result = {
  success: true
  community: { id: string; slug: string; visibility: 'public' | 'private'; created_at: string }
}

const tool: Tool<Args, Result> = {
  schema: {
    name: 'create_community',
    type: 'function',
    description:
      'Create a community the current user owns. name is required, has at least 3 words and at most 100 characters, and has no leading or trailing whitespace. slug is optional and generated from the name when omitted; a taken slug is CONFLICT. visibility is public (default) or private. member_roster_visibility says who can list the members: public (default), users, members or moderators. member_invites_allowed lets members invite others, and post_approval_required sends every new post to moderators for approval; both default to false. should_allow_review_posts and should_allow_data_point_posts default to false. Profile and banner images are set on the web. Creating communities counts against the same daily and short-term quota as the web, and CONTRIBUTION_QUOTA_EXCEEDED means try later. A username is required (FORBIDDEN otherwise). Reuse the same UUID idempotency_key and arguments to safely retry; the first result is replayed. Returns the community id, slug, visibility and creation time.',
    parameters: {
      type: 'object',
      properties: {
        idempotency_key: {
          type: 'string',
          format: 'uuid',
          description: 'A UUID for this community and its retries.',
        },
        name: {
          type: 'string',
          description: 'The community name: 3 or more words, up to 100 characters.',
        },
        slug: { type: 'string', description: 'Optional URL slug.' },
        markdown: { type: 'string', description: 'Optional description, in Markdown.' },
        visibility: { type: 'string', enum: ['public', 'private'] },
        default_language: { type: 'string', description: 'Optional BCP 47 content language tag.' },
        should_allow_review_posts: { type: 'boolean' },
        should_allow_data_point_posts: { type: 'boolean' },
        member_roster_visibility: {
          type: 'string',
          enum: ['public', 'users', 'members', 'moderators'],
        },
        member_invites_allowed: { type: 'boolean' },
        post_approval_required: { type: 'boolean' },
      },
      required: ['idempotency_key', 'name'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Create Community',
    plan: 'plus',
    requiredScopes: { mcp: ['communities:read', 'communities:write'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    api: [{ method: 'POST', path: '/api/v1/communities' }],
    outputSchema: successSchema({
      community: objectSchema({
        id: { type: 'string', format: 'uuid' },
        slug: { type: 'string' },
        visibility: { enum: ['public', 'private'] },
        created_at: { type: 'string', format: 'date-time' },
      }),
    }),
  },
  function: currentUser => async (args, invocationContext) => {
    const user = await requireActiveToolUser(currentUser)
    const authority = getDelegatedToolAuthority(user, invocationContext)
    assertCanCreateCommunity(user)
    const { idempotency_key: idempotencyKey, ...fields } = args
    const input: CreateCommunityInput = {
      name: fields.name,
      slug: fields.slug,
      markdown: fields.markdown,
      visibility: fields.visibility,
      default_language: fields.default_language,
      should_allow_review_posts: fields.should_allow_review_posts,
      should_allow_data_point_posts: fields.should_allow_data_point_posts,
      member_roster_visibility: fields.member_roster_visibility,
      member_invites_allowed_at: fields.member_invites_allowed ? new Date() : null,
      post_approval_required_at: fields.post_approval_required ? new Date() : null,
    }
    validateCreateCommunityInput(input)
    return admitDelegatedCreate({
      authority,
      currentUser: user,
      idempotencyKey,
      route: 'communities.create',
      scope: 'global',
      intent: {
        ...fields,
        member_invites_allowed: fields.member_invites_allowed === true,
        post_approval_required: fields.post_approval_required === true,
      },
      beforeCreate: async () =>
        assertWithinContributionActionLimit(user, await getUserActivePlan(user.id), 'community'),
      execute: async query => {
        const community = await createCommunity(user.id, getRequestContentProvenance(), input, {
          query,
        })
        return {
          success: true as const,
          community: {
            id: community.id,
            slug: community.slug,
            visibility: community.visibility,
            created_at: community.created_at.toISOString(),
          },
        }
      },
    })
  },
}

export default tool
