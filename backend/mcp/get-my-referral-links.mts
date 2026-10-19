import { getUserReferralLinks } from '@services/user-referral-program-links'
import type { Tool } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { topicReferenceSchema } from './entity-reference-schema.mts'
import { canonicalEntityId } from './resolve-entity-reference.mts'
import {
  iso,
  pageInputProperties,
  pageProperties,
  sanitizedTitle,
  type McpPage,
  type McpPageLimit,
} from './mcp-read-output.mts'
import { findPageOrNull, INVALID_CURSOR_RESULT, type InvalidCursorResult } from './paged-search.mts'
import { requirePrivateToolUser } from './private-user.mts'
import { closedObject, foundOrNotFoundSchema, pickProperties } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

type ToolArgs = {
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

/** Signed-in REST allows 100 links per page; the tool pages like the other MCP read tools. */
const REFERRAL_LINK_PAGE_LIMIT: McpPageLimit = { min: 1, max: 25, default: 20 }
const { default: defaultLimit, max } = REFERRAL_LINK_PAGE_LIMIT

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_my_referral_links',
    type: 'function',
    description:
      "List the current user's referral links, newest first, optionally filtered by referral_program_id. Other users' links never appear; use get_referral_links for links under a program.",
    parameters: {
      type: 'object',
      properties: {
        referral_program_id: {
          ...topicReferenceSchema,
          description: 'Only links under this referral program topic',
        },
        ...pageInputProperties('Links', REFERRAL_LINK_PAGE_LIMIT),
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
      const programId = args.referral_program_id
        ? await canonicalEntityId('topic', args.referral_program_id)
        : undefined
      if (args.referral_program_id && !programId) {
        return {
          success: true,
          results: [],
          page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
        }
      }
      const privateUser = await requirePrivateToolUser(currentUser)
      const page = await findPageOrNull(args.after, () =>
        getUserReferralLinks(privateUser, privateUser.id, {
          limit: clampToolLimit(args.limit, defaultLimit, max),
          after: args.after,
          referral_program_id: programId,
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
