import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import {
  createCommunity,
  validateCreateCommunityInput,
  type CreateCommunityInput,
} from '@services/communities'
import { assertCanCreateCommunity } from '@services/communities/authorization'
import { assertWithinContributionActionLimit } from '@services/contribution-gating/limits'
import { admitDelegatedCreate } from '@services/contribution-gating/admit-delegated-create'
import type { Tool } from '@services/openai-agents/tool-types'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { objectSchema, successSchema } from './output-schema-shapes.mts'
import { requireActiveToolUser } from './private-user.mts'
import { getLoadedMembershipPlan } from '@services/users'

type Args = {
  idempotency_key: string
  name: string
  slug?: string
  markdown?: string
  visibility?: 'public' | 'private'
  default_language?: string | null
  list_type?: 'follow' | 'mute' | null
  profile_image_id?: string | null
  banner_image_id?: string | null
  should_allow_review_posts?: boolean
  should_allow_data_point_posts?: boolean
  member_roster_visibility?: 'public' | 'users' | 'members' | 'moderators'
  member_invites_allowed_at?: boolean
  post_approval_required_at?: boolean
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
      'Create a community owned by the current user. name cannot have leading or trailing whitespace; a username is required. slug defaults from name and must be unique. visibility and member_roster_visibility default to public. Invitations, post approval and review/data-point posting default off. Creation shares the web quota (CONTRIBUTION_QUOTA_EXCEEDED).',
    parameters: {
      type: 'object',
      properties: {
        idempotency_key: {
          type: 'string',
          format: 'uuid',
        },
        name: {
          type: 'string',
          description: 'At least 3 words and at most 100 characters.',
        },
        slug: { type: 'string', description: 'Optional URL slug.' },
        markdown: { type: 'string', description: 'Optional description, in Markdown.' },
        visibility: { type: 'string', enum: ['public', 'private'] },
        default_language: {
          type: ['string', 'null'],
          description: 'Optional BCP 47 content language tag.',
        },
        list_type: { type: ['string', 'null'], enum: ['follow', 'mute', null] },
        profile_image_id: { type: ['string', 'null'], format: 'uuid' },
        banner_image_id: { type: ['string', 'null'], format: 'uuid' },
        should_allow_review_posts: { type: 'boolean' },
        should_allow_data_point_posts: { type: 'boolean' },
        member_roster_visibility: {
          type: 'string',
          enum: ['public', 'users', 'members', 'moderators'],
        },
        member_invites_allowed_at: { type: 'boolean' },
        post_approval_required_at: { type: 'boolean' },
      },
      required: ['idempotency_key', 'name'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    audience: 'user',
    title: 'Create Community',
    plan: 'plus',
    requiredScopes: ['communities:read', 'communities:write'],
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
      list_type: fields.list_type,
      profile_image_id: fields.profile_image_id,
      banner_image_id: fields.banner_image_id,
      should_allow_review_posts: fields.should_allow_review_posts,
      should_allow_data_point_posts: fields.should_allow_data_point_posts,
      member_roster_visibility: fields.member_roster_visibility,
      member_invites_allowed_at: fields.member_invites_allowed_at ? new Date() : null,
      post_approval_required_at: fields.post_approval_required_at ? new Date() : null,
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
        member_invites_allowed_at: fields.member_invites_allowed_at === true,
        post_approval_required_at: fields.post_approval_required_at === true,
      },
      beforeCreate: async () =>
        assertWithinContributionActionLimit(user, getLoadedMembershipPlan(user), 'community'),
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
