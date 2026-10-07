import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { getReferralLinksFeed, VALID_REFERRAL_LINKS_FEED_TYPES } from '@services/feeds'
import type { BasicUser } from '@services/users/types'
import type { Tool } from '@services/openai-agents/tool-types'
import { requirePrivateToolUser } from './private-user.mts'
import { pageInfoSchema } from './mcp-read-output.mts'
import { findPageOrNull, INVALID_CURSOR_RESULT } from './paged-search.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'
import {
  pageProperties,
  referralSchema,
  MAX_LIMIT,
  type ReferralArgs,
  type ReferralResult,
} from './personal-feed-support.mts'

const getReferralLinkFeedTool: Tool<ReferralArgs, ReferralResult> = {
  schema: {
    name: 'get_referral_link_feed',
    type: 'function',
    description:
      'Page referral links from users you follow, applying the REST feed privacy and mute policy. Returns at most 100 per page with page_info.end_cursor.',
    parameters: {
      type: 'object',
      properties: {
        ...pageProperties,
        feed_type: { type: 'string', enum: [...VALID_REFERRAL_LINKS_FEED_TYPES] },
      },
      required: ['feed_type'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get Referral Link Feed',
    plan: 'free',
    requiredScopes: { mcp: ['feeds:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/feeds/referral_links/:feed_type' }],
    outputSchema: foundOrNotFoundSchema({
      results: { type: 'array', items: referralSchema },
      page_info: pageInfoSchema(),
    }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ReferralArgs): Promise<ReferralResult> => {
      const viewer = await requirePrivateToolUser(currentUser)
      const page = await findPageOrNull(args.after, () =>
        getReferralLinksFeed(viewer, args.feed_type, {
          limit: clampToolLimit(args.limit, 25, MAX_LIMIT),
          after: args.after,
        }),
      )
      if (!page) return INVALID_CURSOR_RESULT
      return {
        success: true,
        results: await Promise.all(
          page.results.map(async row => ({
            ...row,
            referral_program_name: wrapExternalContent(
              await sanitizePromptInjection(row.referral_program_name, { isTitle: true }),
              { source: 'referral_link', contentType: 'program_name' },
            ),
            label: row.label
              ? wrapExternalContent(await sanitizePromptInjection(row.label), {
                  source: 'referral_link',
                  contentType: 'label',
                })
              : null,
          })),
        ),
        page_info: page.page_info,
      }
    },
}

export default getReferralLinkFeedTool
