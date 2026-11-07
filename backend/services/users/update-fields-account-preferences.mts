import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { UpdateUserOptions } from './types.mts'
import { appendSet } from './update-fields-visibility.mts'

export function appendDefaultPostBroadcast(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  defaultPostBroadcast: UpdateUserOptions['default_post_broadcast'],
): boolean {
  if (defaultPostBroadcast === undefined) return hasSet
  const validBroadcasts = ['everyone', 'users', 'followers', 'mutual_followers']
  assert(
    validBroadcasts.includes(defaultPostBroadcast),
    422,
    'Invalid default_post_broadcast value',
  )
  return appendSet(query, hasSet, sql`default_post_broadcast = ${defaultPostBroadcast}`)
}

export function appendDefaultPostPrivacy(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  defaultPostPrivacy: UpdateUserOptions['default_post_privacy'],
): boolean {
  if (defaultPostPrivacy === undefined) return hasSet
  assert(
    defaultPostPrivacy === 'public' || defaultPostPrivacy === 'private',
    422,
    'Invalid default_post_privacy value',
  )
  return appendSet(query, hasSet, sql`default_post_privacy = ${defaultPostPrivacy}`)
}

export function appendProcessingRestriction(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  processingRestrictedAt: UpdateUserOptions['processing_restricted_at'],
): boolean {
  if (processingRestrictedAt === undefined) return hasSet
  assert(
    typeof processingRestrictedAt === 'boolean',
    422,
    'processing_restricted_at must be a boolean',
  )
  const set = processingRestrictedAt
    ? sql`processing_restricted_at = CURRENT_TIMESTAMP`
    : sql`processing_restricted_at = NULL`
  return appendSet(query, hasSet, set)
}

export function appendThirdPartyMarketing(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  thirdPartyMarketing: UpdateUserOptions['should_receive_third_party_marketing'],
): boolean {
  if (thirdPartyMarketing === undefined) return hasSet
  assert(
    typeof thirdPartyMarketing === 'boolean',
    422,
    'should_receive_third_party_marketing must be a boolean',
  )
  return appendSet(
    query,
    hasSet,
    sql`should_receive_third_party_marketing = ${thirdPartyMarketing}`,
  )
}
