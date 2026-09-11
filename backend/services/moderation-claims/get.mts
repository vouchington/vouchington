import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { CLAIM_EXPIRY_MINUTES } from './config.mts'
import type { ModerationQueueClaim } from './types.mts'

export async function attachReportClaims<T extends { id: string }>(
  entries: T[],
): Promise<(T & { claim: ModerationQueueClaim | null })[]> {
  if (entries.length === 0) return entries.map(e => ({ ...e, claim: null }))

  const ids = entries.map(e => e.id)
  const { rows } = await read<ModerationQueueClaim>(sql`/* attachReportClaims */
    SELECT id, community_id, report_id, post_id, claimed_by_id, claimed_at, released_at
    FROM moderation_queue_claims
    WHERE report_id = ANY(${ids})
      AND released_at IS NULL
      AND claimed_at > now() - (${CLAIM_EXPIRY_MINUTES} || ' minutes')::interval
  `)

  const byReportId = new Map<string, ModerationQueueClaim>()
  for (const row of rows) {
    if (row.report_id) byReportId.set(row.report_id, row)
  }

  return entries.map(e => ({ ...e, claim: byReportId.get(e.id) ?? null }))
}

export async function attachPostClaims<T extends { id: string }>(
  entries: T[],
): Promise<(T & { claim: ModerationQueueClaim | null })[]> {
  if (entries.length === 0) return entries.map(e => ({ ...e, claim: null }))

  const ids = entries.map(e => e.id)
  const { rows } = await read<ModerationQueueClaim>(sql`/* attachPostClaims */
    SELECT id, community_id, report_id, post_id, claimed_by_id, claimed_at, released_at
    FROM moderation_queue_claims
    WHERE post_id = ANY(${ids})
      AND released_at IS NULL
      AND claimed_at > now() - (${CLAIM_EXPIRY_MINUTES} || ' minutes')::interval
  `)

  const byPostId = new Map<string, ModerationQueueClaim>()
  for (const row of rows) {
    if (row.post_id) byPostId.set(row.post_id, row)
  }

  return entries.map(e => ({ ...e, claim: byPostId.get(e.id) ?? null }))
}
