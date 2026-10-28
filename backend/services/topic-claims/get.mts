import { read, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createHash } from 'node:crypto'
import assert from 'http-assert'
import {
  buildPageInfo,
  decodeScopedUuidCursor,
  parseBoundedIntegerLimit,
} from '@modules/pagination'
import { getPaginationLimits } from '@services/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import { isUUID } from '@modules/utils'
import type { TopicClaim } from './config.mts'

const CLAIM_SELECT = sql`
  tc.id, tc.topic_id, tc.claimant_user_id, tc.verification_method, tc.claimed_role, tc.evidence, tc.submitted_at, tc.verified_at, tc.verified_by_id, tc.rejected_at, tc.rejected_by_id, tc.rejection_reason, tc.revoked_at, tc.revoked_by_id, tc.revocation_reason, tc.verification_hostname_id, tc.verification_token_issued_at, tc.domain_verified_at, tc.created_at, tc.updated_at,
  COALESCE(t.name, t.slug, 'topic') AS topic_name,
  claimant_profile.username AS claimant_username,
  claimant_profile.verified_display_name AS claimant_display_name
`

const CLAIM_FROM = sql`
  FROM topic_claims tc
  LEFT JOIN topics t ON t.id = tc.topic_id
  LEFT JOIN view_users_public claimant_profile ON claimant_profile.id = tc.claimant_user_id
`

export async function getTopicClaimById(
  id: string,
  query: QueryExecutor = read,
): Promise<TopicClaim | null> {
  const { rows } = await query<TopicClaim>(
    sql`/* getTopicClaimById */
    SELECT `
      .append(CLAIM_SELECT)
      .append(CLAIM_FROM).append(sql`
    WHERE tc.id = ${id}
    LIMIT 1
  `),
  )
  return rows[0] ?? null
}

export async function getVerifiedTopicClaim(
  topicId: string,
  userId: string,
): Promise<TopicClaim | null> {
  const { rows } = await read(
    sql`/* getVerifiedTopicClaim */
    SELECT `
      .append(CLAIM_SELECT)
      .append(CLAIM_FROM).append(sql`
    WHERE tc.topic_id = ${topicId}
      AND tc.claimant_user_id = ${userId}
      AND tc.verified_at IS NOT NULL
      AND tc.revoked_at IS NULL
    LIMIT 1
  `),
  )
  return (rows[0] as TopicClaim | undefined) ?? null
}

type TopicClaimPage = { results: TopicClaim[]; page_info: PageInfo }
export type TopicClaimPageOptions = { limit?: number; after?: string }

export async function listTopicClaimsForTopic(
  topicId: string,
  options: TopicClaimPageOptions & { claimantUserId?: string; activeOnly?: boolean } = {},
): Promise<TopicClaimPage> {
  const limit = parseBoundedIntegerLimit(options.limit, { min: 1, ...getPaginationLimits() })
  const scope = `topic-claims:topic:${topicId}:${options.claimantUserId ?? 'staff'}:${options.activeOnly === true}:id-desc`
  const afterId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid claim cursor').id
    : undefined
  const query = sql`/* listTopicClaimsForTopic */
    SELECT `
    .append(CLAIM_SELECT)
    .append(CLAIM_FROM).append(sql` WHERE tc.topic_id = ${topicId}
  `)
  if (options.claimantUserId)
    query.append(sql` AND tc.claimant_user_id = ${options.claimantUserId}`)
  if (options.activeOnly) query.append(sql` AND tc.rejected_at IS NULL AND tc.revoked_at IS NULL`)
  if (afterId) query.append(sql` AND tc.id < ${afterId}`)
  query.append(sql` ORDER BY tc.id DESC LIMIT ${limit + 1}`)
  const { rows } = await read(query)
  return buildClaimPage(rows as TopicClaim[], limit, scope)
}

export async function listTopicClaimsForUser(
  userId: string,
  options: TopicClaimPageOptions & { topicIds?: readonly string[]; verifiedOnly?: boolean } = {},
): Promise<TopicClaimPage> {
  const limit = parseBoundedIntegerLimit(options.limit, { min: 1, ...getPaginationLimits() })
  const topicIds = options.topicIds ? [...new Set(options.topicIds)].toSorted() : undefined
  assert(!topicIds || topicIds.length <= 100, 422, 'Too many topic ids')
  assert(!topicIds || topicIds.every(isUUID), 422, 'Invalid topic id')
  const topicScope = topicIds
    ? createHash('sha256').update(topicIds.join(',')).digest('hex')
    : 'all'
  const scope = `topic-claims:user:${userId}:${topicScope}:${options.verifiedOnly === true}:id-desc`
  const afterId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid claim cursor').id
    : undefined
  const query = sql`/* listTopicClaimsForUser */
    SELECT `
    .append(CLAIM_SELECT)
    .append(CLAIM_FROM).append(sql` WHERE tc.claimant_user_id = ${userId}
  `)
  if (topicIds) query.append(sql` AND tc.topic_id = ANY(${topicIds}::uuid[])`)
  if (options.verifiedOnly)
    query.append(sql` AND tc.verified_at IS NOT NULL AND tc.revoked_at IS NULL`)
  if (afterId) query.append(sql` AND tc.id < ${afterId}`)
  query.append(sql` ORDER BY tc.id DESC LIMIT ${limit + 1}`)
  const { rows } = await read(query)
  return buildClaimPage(rows as TopicClaim[], limit, scope)
}

function buildClaimPage(rows: TopicClaim[], limit: number, scope: string): TopicClaimPage {
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit)
  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: claim => ({ id: claim.id, scope }),
    }),
  }
}

export async function listPendingTopicClaims(): Promise<TopicClaim[]> {
  const { rows } = await read(
    sql`/* listPendingTopicClaims */
    SELECT `
      .append(CLAIM_SELECT)
      .append(CLAIM_FROM).append(sql`
    WHERE tc.submitted_at IS NOT NULL
      AND tc.verified_at IS NULL
      AND tc.rejected_at IS NULL
    ORDER BY tc.submitted_at DESC
  `),
  )
  return rows as TopicClaim[]
}
