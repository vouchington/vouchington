import { read, write } from '@data-stores/psql'
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
  id, topic_id, claimant_user_id, verification_method,
  claimed_role, evidence, submitted_at,
  verified_at, verified_by_id, rejected_at, rejected_by_id, rejection_reason,
  revoked_at, revoked_by_id, revocation_reason,
  verification_hostname_id, verification_token_issued_at,
  domain_verified_at, created_at, updated_at
`

export async function getTopicClaimById(id: string): Promise<TopicClaim | null> {
  const { rows } = await write(
    sql`/* getTopicClaimById */
    SELECT `.append(CLAIM_SELECT).append(sql`
    FROM topic_claims WHERE id = ${id}
  `),
  )
  return (rows[0] as TopicClaim | undefined) ?? null
}

export async function getVerifiedTopicClaim(
  topicId: string,
  userId: string,
): Promise<TopicClaim | null> {
  const { rows } = await read(
    sql`/* getVerifiedTopicClaim */
    SELECT `.append(CLAIM_SELECT).append(sql`
    FROM topic_claims
    WHERE topic_id = ${topicId}
      AND claimant_user_id = ${userId}
      AND verified_at IS NOT NULL
      AND revoked_at IS NULL
    LIMIT 1
  `),
  )
  return (rows[0] as TopicClaim | undefined) ?? null
}

export type TopicClaimPage = { results: TopicClaim[]; page_info: PageInfo }
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
    SELECT `.append(CLAIM_SELECT).append(sql`
    FROM topic_claims WHERE topic_id = ${topicId}
  `)
  if (options.claimantUserId) query.append(sql` AND claimant_user_id = ${options.claimantUserId}`)
  if (options.activeOnly) query.append(sql` AND rejected_at IS NULL AND revoked_at IS NULL`)
  if (afterId) query.append(sql` AND id < ${afterId}`)
  query.append(sql` ORDER BY id DESC LIMIT ${limit + 1}`)
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
    SELECT `.append(CLAIM_SELECT).append(sql`
    FROM topic_claims WHERE claimant_user_id = ${userId}
  `)
  if (topicIds) query.append(sql` AND topic_id = ANY(${topicIds}::uuid[])`)
  if (options.verifiedOnly) query.append(sql` AND verified_at IS NOT NULL AND revoked_at IS NULL`)
  if (afterId) query.append(sql` AND id < ${afterId}`)
  query.append(sql` ORDER BY id DESC LIMIT ${limit + 1}`)
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
    SELECT `.append(CLAIM_SELECT).append(sql`
    FROM topic_claims
    WHERE submitted_at IS NOT NULL
      AND verified_at IS NULL
      AND rejected_at IS NULL
    ORDER BY submitted_at DESC
  `),
  )
  return rows as TopicClaim[]
}
