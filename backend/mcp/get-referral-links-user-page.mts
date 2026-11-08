import assert from 'http-assert'
import { getPaginationLimitsForContract } from '@services/pagination'
import { RuntimeRequestValidatorRegistry } from '@services/runtime-request-validation'
import {
  prepareUserReferralLinksListQuery,
  userReferralLinksParser,
} from '@services/user-referral-program-links/list-query'
import {
  getUserReferralLinks,
  type UserReferralLinkWithDetails,
} from '@services/user-referral-program-links'
import type { BasicUser } from '@services/users/types'
import { iso, pageProperties, sanitizedTitle } from './mcp-read-output.mts'
import { findPageOrNull, INVALID_CURSOR_RESULT } from './paged-search.mts'
import { requirePrivateToolUser } from './private-user.mts'
import { closedObject } from './read-tool-output-schema.mts'
import { componentSchema } from './route-response-schema.mts'

export type UserReferralLinksArgs = {
  user_id?: string
  referral_program_id?: string
  limit?: number
  after?: string
}

const listOperation = 'GET:/api/v1/referral-links'
const userReferralLinkProperties = componentSchema('UserReferralLink')['properties'] as Record<
  string,
  Record<string, unknown>
>

export const USER_REFERRAL_LINK_PAGE_SCHEMA = closedObject({
  success: { const: true },
  ...pageProperties(
    closedObject({
      ...userReferralLinkProperties,
      referral_program_name: { type: 'string' },
      referral_program_slug: { type: 'string' },
      url: { type: 'string' },
    }),
  ),
})

/** Personal-link mode uses the REST parser, validator, authorization and keyset service. */
export async function getUserReferralLinksPage(
  currentUser: BasicUser,
  args: UserReferralLinksArgs,
) {
  const privateUser = await requirePrivateToolUser(currentUser)
  const bounds = getPaginationLimitsForContract(userReferralLinksParser.queryContract)
  const pagination = userReferralLinksParser.parse(
    args.limit === undefined ? {} : { limit: args.limit },
    bounds,
  )
  const query: Record<string, unknown> = {}
  if (args.user_id !== undefined) query.user_id = args.user_id
  if (args.referral_program_id !== undefined) query.referral_program_id = args.referral_program_id
  if (args.limit !== undefined) query.limit = args.limit
  if (args.after !== undefined) query.after = args.after
  const error = RuntimeRequestValidatorRegistry.shared.validateAuthenticated(listOperation, {
    query: prepareUserReferralLinksListQuery(query, pagination.limit),
  })
  assert(!error, 422, error?.message ?? 'Invalid request query')
  const page = await findPageOrNull(args.after, () =>
    getUserReferralLinks(privateUser, args.user_id || privateUser.id, {
      limit: pagination.limit,
      after: args.after,
      referral_program_id: args.referral_program_id,
    }),
  )
  if (!page) return INVALID_CURSOR_RESULT
  return {
    success: true as const,
    results: await Promise.all(page.results.map(serializeLink)),
    page_info: page.page_info,
  }
}

async function serializeLink(link: UserReferralLinkWithDetails) {
  return {
    ...link,
    referral_program_name: await sanitizedTitle(link.referral_program_name),
    label: link.label === null ? null : await sanitizedTitle(link.label),
    unfurl_last_error:
      link.unfurl_last_error === null ? null : await sanitizedTitle(link.unfurl_last_error),
    activated_at: link.activated_at === null ? null : iso(link.activated_at),
    deactivated_at: link.deactivated_at === null ? null : iso(link.deactivated_at),
    created_at: iso(link.created_at),
    updated_at: iso(link.updated_at),
    deleted_at: link.deleted_at === null ? null : iso(link.deleted_at),
    last_crawl_failure_at:
      link.last_crawl_failure_at === null ? null : iso(link.last_crawl_failure_at),
    last_crawl_success_at:
      link.last_crawl_success_at === null ? null : iso(link.last_crawl_success_at),
    unfurl_requested_at: link.unfurl_requested_at === null ? null : iso(link.unfurl_requested_at),
    unfurl_completed_at: link.unfurl_completed_at === null ? null : iso(link.unfurl_completed_at),
    unfurl_failed_at: link.unfurl_failed_at === null ? null : iso(link.unfurl_failed_at),
  }
}
