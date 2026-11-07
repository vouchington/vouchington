import assert from 'http-assert'
import { getPaginationLimitsForContract } from '@services/pagination'
import { RuntimeRequestValidatorRegistry } from '@services/runtime-request-validation'
import {
  prepareUserReferralLinksListQuery,
  userReferralLinksParser,
} from '@services/user-referral-program-links/list-query'
import { getUserReferralLinks } from '@services/user-referral-program-links'
import type { Tool } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { iso, pageProperties, sanitizedTitle, type McpPage } from './mcp-read-output.mts'
import { findPageOrNull, INVALID_CURSOR_RESULT, type InvalidCursorResult } from './paged-search.mts'
import { requirePrivateToolUser } from './private-user.mts'
import { closedObject, foundOrNotFoundSchema, pickProperties } from './read-tool-output-schema.mts'

type ToolArgs = {
  user_id?: string
  referral_program_id?: string
  limit?: number
  after?: string
}

type MyReferralLink = {
  id: string
  referral_program_id: string
  referral_program_name: string
  referral_program_slug: string
  url: string
  label: string | null
  created_at: string
  activated_at: string | null
  deactivated_at: string | null
}

type ToolResult = McpPage<MyReferralLink> | InvalidCursorResult

const LIST_OPERATION = 'GET:/api/v1/referral-links'

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_my_referral_links',
    type: 'function',
    description:
      "List a user's referral links, newest first. user_id defaults to the caller. An administrator may list another user; anyone else is forbidden. Use get_referral_links for prioritized links under a topic.",
    parameters: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'User id whose links to list. Defaults to the caller.',
        },
        referral_program_id: {
          type: 'string',
          description: 'Only links for this referral program id.',
        },
        // No minimum or maximum: GET /api/v1/referral-links clamps an oversized limit and rejects 0.
        limit: {
          type: 'integer',
          description: 'Links per page. Same default and clamp as GET /api/v1/referral-links.',
        },
        after: {
          type: 'string',
        },
      },
      required: [],
    },
    strict: null,
  },
  meta: {
    audience: 'user',
    title: 'Get My Referral Links',
    requiredScopes: ['referral-links:read'],
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/referral-links' }],
    outputSchema: foundOrNotFoundSchema(
      pageProperties(
        closedObject({
          ...pickProperties('UserReferralLink', ['id', 'referral_program_id']),
          referral_program_name: { type: 'string' },
          referral_program_slug: { type: 'string' },
          url: { type: 'string' },
          ...pickProperties('UserReferralLink', [
            'label',
            'created_at',
            'activated_at',
            'deactivated_at',
          ]),
        }),
      ),
    ),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const privateUser = await requirePrivateToolUser(currentUser)
      const bounds = getPaginationLimitsForContract(userReferralLinksParser.queryContract)
      const pagination = userReferralLinksParser.parse(
        args.limit === undefined ? {} : { limit: args.limit },
        bounds,
      )
      const query: Record<string, unknown> = {}
      if (args.user_id !== undefined) query.user_id = args.user_id
      if (args.referral_program_id !== undefined)
        query.referral_program_id = args.referral_program_id
      if (args.limit !== undefined) query.limit = args.limit
      if (args.after !== undefined) query.after = args.after
      const error = RuntimeRequestValidatorRegistry.shared.validateAuthenticated(LIST_OPERATION, {
        query: prepareUserReferralLinksListQuery(query, pagination.limit),
      })
      assert(!error, 422, error?.message ?? 'Invalid request query')
      const userId = args.user_id ? args.user_id : privateUser.id
      const page = await findPageOrNull(args.after, () =>
        getUserReferralLinks(privateUser, userId, {
          limit: pagination.limit,
          after: args.after,
          referral_program_id: args.referral_program_id,
        }),
      )
      if (!page) return INVALID_CURSOR_RESULT
      return {
        success: true,
        results: await Promise.all(
          page.results.map(async link => ({
            id: link.id,
            referral_program_id: link.referral_program_id,
            referral_program_name: await sanitizedTitle(link.referral_program_name),
            referral_program_slug: link.referral_program_slug,
            url: link.url,
            label: link.label === null ? null : await sanitizedTitle(link.label),
            created_at: iso(link.created_at),
            activated_at: link.activated_at === null ? null : iso(link.activated_at),
            deactivated_at: link.deactivated_at === null ? null : iso(link.deactivated_at),
          })),
        ),
        page_info: page.page_info,
      }
    },
}

export default tool
