import assert from 'http-assert'
import { getPaginationLimitsForContract } from '@services/pagination'
import { RuntimeRequestValidatorRegistry } from '@services/runtime-request-validation'
import {
  prepareUserReferralLinksListQuery,
  userReferralLinksParser,
} from '@services/user-referral-program-links/list-query'
import {
  getUserReferralLinks,
  type UserReferralLinkListItem,
} from '@services/user-referral-program-links'
import { userReferralLinkPrivateFieldNames } from '@services/user-referral-program-links/columns'
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
    closedObject(
      {
        ...userReferralLinkProperties,
        referral_program_name: { type: 'string' },
        referral_program_slug: { type: 'string' },
        url: { type: 'string' },
      },
      userReferralLinkPrivateFieldNames,
    ),
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

async function serializeLink(link: UserReferralLinkListItem) {
  const serialized = {
    id: link.id,
    user_id: link.user_id,
    referral_program_id: link.referral_program_id,
    url_id: link.url_id,
    created_at: iso(link.created_at),
    updated_at: iso(link.updated_at),
    deleted_at: link.deleted_at === null ? null : iso(link.deleted_at),
    parent_link_id: link.parent_link_id,
    referral_program_name: await sanitizedTitle(link.referral_program_name),
    referral_program_slug: link.referral_program_slug,
    url: link.url,
  }
  if (!('label' in link)) return serialized
  const text = async (value: string | null | undefined) =>
    value === null || value === undefined ? null : sanitizedTitle(value)
  const timestamp = (value: Date | null | undefined) =>
    value === null || value === undefined ? null : iso(value)
  return {
    ...serialized,
    label: await text(link.label),
    activated_at: timestamp(link.activated_at),
    deactivated_at: timestamp(link.deactivated_at),
    consecutive_crawl_failures: link.consecutive_crawl_failures,
    last_crawl_failure_at: timestamp(link.last_crawl_failure_at),
    last_crawl_success_at: timestamp(link.last_crawl_success_at),
    last_crawl_id: link.last_crawl_id ?? null,
    unfurl_requested_at: timestamp(link.unfurl_requested_at),
    unfurl_completed_at: timestamp(link.unfurl_completed_at),
    unfurl_failed_at: timestamp(link.unfurl_failed_at),
    unfurl_last_error: await text(link.unfurl_last_error),
  }
}
