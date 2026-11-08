import type { BasicUser } from '@services/users/types'
import type { Tool } from '@services/openai-agents/tool-types'
import { resolveTopic } from './resolve-topic.mts'
import { topicReferenceSchema } from './entity-reference-schema.mts'
import {
  getAllReferralLinksPage,
  getPrioritizedReferralLinks,
} from '@services/prioritized-referral-links'
import { sanitizePromptInjection } from '@jongleberry/vurst-prompt'
import { nullable, objectSchema } from '@vouchington/mcp-server/schema'
import { componentPropertySchema } from './route-response-schema.mts'
import { pageInfoSchema } from './mcp-read-output.mts'
import { clampToolLimit } from './search-system.mts'
import { findPageOrNull, INVALID_CURSOR_RESULT, type SearchPageInfo } from './paged-search.mts'
import {
  getUserReferralLinksPage,
  USER_REFERRAL_LINK_PAGE_SCHEMA,
  type UserReferralLinksArgs,
} from './get-referral-links-user-page.mts'
import { closedObject } from './read-tool-output-schema.mts'

// The REST twin documents its body inline and carries more per link, so the tool owns this schema.
// `priority_group` comes from the documented link; `username` and `display_name` flatten its users.
const TOPIC_PAGE_SCHEMA = closedObject({
  success: { const: true },
  referral_program_id: { type: 'string' },
  links: {
    type: 'array',
    items: objectSchema({
      id: { type: 'string' },
      url: { type: 'string' },
      label: nullable({ type: 'string' }),
      priority_group: componentPropertySchema('PrioritizedReferralLink', 'priority_group'),
      is_official: componentPropertySchema('PrioritizedReferralLink', 'is_official'),
      username: { type: 'string' },
      display_name: nullable({ type: 'string' }),
    }),
  },
  // `all` pages newest first. Otherwise a next page exists only while the shared ranked list has
  // more; a signed-in network list is one page.
  page_info: pageInfoSchema(),
})

const OUTPUT_SCHEMA = {
  type: 'object' as const,
  oneOf: [
    TOPIC_PAGE_SCHEMA,
    USER_REFERRAL_LINK_PAGE_SCHEMA,
    closedObject({ success: { const: false }, error: { type: 'string' } }),
  ],
}

const PERSONAL_API = { method: 'GET' as const, path: '/api/v1/referral-links' }
const TOPIC_API = { method: 'GET' as const, path: '/api/v1/topics/:id/prioritized-referral-links' }

type ToolArgs = UserReferralLinksArgs & {
  topic_id?: string
  all?: boolean
}

type ReferralLinkEntry = {
  id: string
  url: string
  label: string | null
  priority_group: number
  is_official: boolean
  username: string
  display_name: string | null
}

type ToolResult =
  | Awaited<ReturnType<typeof getUserReferralLinksPage>>
  | {
      success: true
      referral_program_id: string
      links: ReferralLinkEntry[]
      page_info: SearchPageInfo
    }
  | {
      success: false
      error: string
    }

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_referral_links',
    type: 'function',
    description:
      'List your referral links newest first when topic_id is omitted. With topic_id, get prioritized links for that topic, ranked by social connections; all lists every visible link newest first.',
    parameters: {
      type: 'object',
      properties: {
        topic_id: topicReferenceSchema,
        user_id: {
          type: 'string',
          description: 'Personal-list mode: user id, defaulting to the caller.',
        },
        referral_program_id: {
          type: 'string',
          description: 'Personal-list mode: filter by referral program id.',
        },
        all: {
          type: 'boolean',
          description:
            'Topic mode: list every visible link newest first, paged by after and limit.',
        },
        limit: {
          type: 'integer',
          description:
            'Personal list: default 100, max 100. Topic ranking: default 5, max 25; with all, default 25, max 100. Larger values are clamped.',
        },
        after: {
          type: 'string',
          description:
            'page_info.end_cursor of the previous page. On an invalid cursor, restart. Topic own-network links ignore it.',
        },
      },
      required: [],
    },
    strict: null,
  },
  meta: {
    audience: 'user',
    title: 'Get Referral Links',
    requiredScopes: ['referral-links:read'],
    annotations: { readOnlyHint: true },
    api: [PERSONAL_API, TOPIC_API],
    selectApi: args => [args['topic_id'] === undefined ? PERSONAL_API : TOPIC_API],
    outputSchema: OUTPUT_SCHEMA,
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      if (args.topic_id === undefined) return getUserReferralLinksPage(currentUser, args)
      // Same rule as REST: below 1 or not an integer is rejected, above the maximum is clamped.
      if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1)) {
        return { success: false, error: 'Invalid limit' }
      }
      const topic = await resolveTopic(args.topic_id)

      if (!topic) {
        return { success: false, error: 'Topic not found' }
      }

      let referralProgramId: string
      if (topic.topic_type === 'referral_program') {
        referralProgramId = topic.id
      } else if (topic.referral_program_id) {
        referralProgramId = topic.referral_program_id
      } else {
        return { success: false, error: 'No referral program found for this topic' }
      }

      const page = await findPageOrNull(args.after, () =>
        args.all
          ? getAllReferralLinksPage(currentUser.id, referralProgramId, {
              limit: clampToolLimit(args.limit, 25, 100),
              after: args.after,
            })
          : getPrioritizedReferralLinks(currentUser.id, referralProgramId, {
              limit: args.limit === undefined ? undefined : clampToolLimit(args.limit, 5, 25),
              after: args.after,
            }),
      )
      if (!page) return INVALID_CURSOR_RESULT
      const { links: allLinks, users, page_info: pageInfo } = page

      const links: ReferralLinkEntry[] = await Promise.all(
        allLinks.map(async link => {
          const user = link.user_id != null ? users[link.user_id] : undefined
          return {
            id: link.id,
            url: link.url,
            label:
              link.label != null
                ? await sanitizePromptInjection(link.label, { isTitle: true })
                : null,
            priority_group: link.priority_group,
            is_official: link.is_official,
            username: user?.username ?? link.user_id ?? link.id,
            display_name: user?.display_name ?? null,
          }
        }),
      )

      return {
        success: true,
        referral_program_id: referralProgramId,
        links,
        page_info: pageInfo,
      }
    },
}

export default tool
