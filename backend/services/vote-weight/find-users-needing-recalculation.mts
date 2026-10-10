import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function findUsersNeedingVoteWeightRecalculation(
  afterId: string | null,
  limit: number,
  options: { now?: Date; userIds?: readonly string[] } = {},
): Promise<{ userIds: string[]; nextCursor: string | null }> {
  const ids = options.userIds
  assert(
    ids === undefined || (Array.isArray(ids) && ids.length <= 100),
    422,
    'Select at most 100 valid user IDs',
  )
  assert(
    ids === undefined || ids.every(id => typeof id === 'string' && isUUID(id)),
    422,
    'Select at most 100 valid user IDs',
  )
  if (ids?.length === 0) return { userIds: [], nextCursor: null }
  const selectedIds = ids === undefined ? null : [...new Set(ids.map(id => id.toLowerCase()))]
  const now = options.now ?? null
  assert(
    now === null || (now instanceof Date && Number.isFinite(now.getTime())),
    422,
    'Invalid reference time',
  )
  const query = sql`/* findUsersNeedingVoteWeightRecalculation */
    SELECT id FROM users
    WHERE deleted_at IS NULL
      AND (${selectedIds}::uuid[] IS NULL OR id = ANY(${selectedIds}::uuid[]))
      AND vote_weight_admin_set_at IS NULL
      AND (
        vote_weight_recalculated_at IS NULL
        OR (
          uuid_extract_timestamp(id) < COALESCE(${now}::timestamptz, NOW()) - INTERVAL '7 days'
          AND vote_weight_recalculated_at < (uuid_extract_timestamp(id) + INTERVAL '7 days')
        )
        OR (
          uuid_extract_timestamp(id) < COALESCE(${now}::timestamptz, NOW()) - INTERVAL '30 days'
          AND vote_weight_recalculated_at < (uuid_extract_timestamp(id) + INTERVAL '30 days')
        )
        OR (
          uuid_extract_timestamp(id) < COALESCE(${now}::timestamptz, NOW()) - INTERVAL '1 year'
          AND vote_weight_recalculated_at < (uuid_extract_timestamp(id) + INTERVAL '1 year')
        )
        OR (
          uuid_extract_timestamp(id) < COALESCE(${now}::timestamptz, NOW()) - INTERVAL '2 years'
          AND vote_weight_recalculated_at < (uuid_extract_timestamp(id) + INTERVAL '2 years')
        )
        OR (
          uuid_extract_timestamp(id) < COALESCE(${now}::timestamptz, NOW()) - INTERVAL '5 years'
          AND vote_weight_recalculated_at < (uuid_extract_timestamp(id) + INTERVAL '5 years')
        )
        OR EXISTS (
          SELECT 1 FROM memberships
          INNER JOIN membership_sources source
            ON source.id = memberships.membership_source_id
          WHERE memberships.user_id = users.id
            AND memberships.projection_ended_at IS NULL
            AND memberships.cancelled_at IS NULL
            AND memberships.expired_at IS NULL
            AND memberships.past_due_at IS NULL
            AND memberships.paused_at IS NULL
            AND source.source_kind <> 'direct'
            AND memberships.expires_at IS NOT NULL
            AND memberships.expires_at <= COALESCE(${now}::timestamptz, NOW())
            AND users.vote_weight_recalculated_at < memberships.expires_at
        )
        OR EXISTS (
          SELECT 1 FROM memberships
          INNER JOIN membership_sources source
            ON source.id = memberships.membership_source_id
          INNER JOIN membership_source_states source_state
            ON source_state.membership_source_id = source.id
          LEFT JOIN membership_provider_observations observation
            ON observation.id = source_state.membership_provider_observation_id
          LEFT JOIN membership_provider_evidence_records evidence
            ON evidence.id = observation.membership_provider_evidence_record_id
          WHERE memberships.user_id = users.id
            AND memberships.projection_ended_at IS NULL
            AND source.source_kind = 'family'
            AND (
              users.vote_weight_recalculated_at < source_state.updated_at
              OR users.vote_weight_recalculated_at < evidence.rejected_at
              OR (
                source_state.effective_at <= COALESCE(${now}::timestamptz, NOW())
                AND users.vote_weight_recalculated_at < source_state.effective_at
              )
              OR (
                source_state.expires_at IS NOT NULL
                AND source_state.expires_at <= COALESCE(${now}::timestamptz, NOW())
                AND users.vote_weight_recalculated_at < source_state.expires_at
              )
            )
        )
      )
  `
  if (afterId) query.append(sql` AND id > ${afterId}::UUID`)
  query.append(sql` ORDER BY id LIMIT ${limit}`)

  const { rows } = await read<{ id: string }>(query)

  const userIds = rows.map(r => r.id)
  const nextCursor = userIds.length === limit ? (userIds[userIds.length - 1] ?? null) : null

  return { userIds, nextCursor }
}
