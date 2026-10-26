import type { TransactionQuery } from '@data-stores/psql'

export const HISTORY_KINDS = [
  'dynamic_configuration_revisions',
  'rss_feed_setting_changes',
  'fediverse_instance_integration_changes',
  'community_agent_prompt_revisions',
  'followed_user_import_requests',
  'pending_user_import_requests',
  'referral_attribution_scrub',
  'referral_attribution_expiry',
] as const

export type HistoryKind = (typeof HISTORY_KINDS)[number]

export function hasMonotonicEligibility(kind: HistoryKind): boolean {
  return (
    kind === 'pending_user_import_requests' ||
    kind === 'referral_attribution_scrub' ||
    kind === 'referral_attribution_expiry'
  )
}

type Candidate = { id: string }

/** Read at most limit raw UUIDv7 rows; eligibility is checked only within this page. */
export async function listRawCandidates(
  query: TransactionQuery,
  kind: HistoryKind,
  cursorId: string | null,
  cutoffId: string,
  lowerBoundId: string | null,
  limit: number,
): Promise<Candidate[]> {
  const params = [cursorId, cutoffId, lowerBoundId, limit]
  switch (kind) {
    case 'dynamic_configuration_revisions': {
      const { rows } = await query<Candidate>(
        `/* listRawConfigHistoryCandidates */
         SELECT id FROM dynamic_configuration_revisions
         WHERE id >= COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id > COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id < $2::uuid
         ORDER BY id LIMIT $4 FOR UPDATE SKIP LOCKED`,
        params,
      )
      return rows
    }
    case 'rss_feed_setting_changes': {
      const { rows } = await query<Candidate>(
        `/* listRawRssSettingHistoryCandidates */
         SELECT id FROM rss_feed_setting_changes
         WHERE id >= COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id > COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id < $2::uuid
         ORDER BY id LIMIT $4 FOR UPDATE SKIP LOCKED`,
        params,
      )
      return rows
    }
    case 'fediverse_instance_integration_changes': {
      const { rows } = await query<Candidate>(
        `/* listRawFediverseHistoryCandidates */
         SELECT id FROM fediverse_instance_integration_changes
         WHERE id >= COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id > COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id < $2::uuid
         ORDER BY id LIMIT $4 FOR UPDATE SKIP LOCKED`,
        params,
      )
      return rows
    }
    case 'community_agent_prompt_revisions': {
      const { rows } = await query<Candidate>(
        `/* listRawPromptHistoryCandidates */
         SELECT id FROM community_agent_prompt_revisions
         WHERE id >= COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id > COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id < $2::uuid
         ORDER BY id LIMIT $4 FOR UPDATE SKIP LOCKED`,
        params,
      )
      return rows
    }
    case 'followed_user_import_requests': {
      const { rows } = await query<Candidate>(
        `/* listRawImportHistoryCandidates */
         SELECT id FROM user_import_requests
         WHERE id >= COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id > COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id < $2::uuid
         ORDER BY id LIMIT $4 FOR UPDATE SKIP LOCKED`,
        params,
      )
      return rows
    }
    case 'pending_user_import_requests': {
      const { rows } = await query<Candidate>(
        `/* listRawPendingImportHistoryCandidates */
         SELECT id FROM user_import_requests
         WHERE id >= COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id > COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id < $2::uuid AND followed_at IS NULL
         ORDER BY id LIMIT $4 FOR UPDATE`,
        params,
      )
      return rows
    }
    case 'referral_attribution_scrub': {
      const { rows } = await query<Candidate>(
        `/* listRawReferralScrubCandidates */
         SELECT id FROM session_referral_attributions
         WHERE id >= COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id > COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id < $2::uuid
           AND (landing_url IS NOT NULL OR utm_source IS NOT NULL OR utm_medium IS NOT NULL
             OR utm_campaign IS NOT NULL OR utm_content IS NOT NULL)
         ORDER BY id LIMIT $4 FOR UPDATE`,
        params,
      )
      return rows
    }
    case 'referral_attribution_expiry': {
      const { rows } = await query<Candidate>(
        `/* listRawReferralHistoryCandidates */
         SELECT id FROM session_referral_attributions
         WHERE id >= COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id > COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id < $2::uuid
         ORDER BY id LIMIT $4 FOR UPDATE`,
        params,
      )
      return rows
    }
  }
}

/** One unresolved row behind the checkpoint catches late commits without rereading cleared rows. */
export async function listResidualCandidate(
  query: TransactionQuery,
  kind: HistoryKind,
  cursorId: string,
  cutoffId: string,
  lowerBoundId: string | null,
): Promise<Candidate[]> {
  const params = [cursorId, cutoffId, lowerBoundId]
  switch (kind) {
    case 'pending_user_import_requests': {
      const { rows } = await query<Candidate>(
        `/* listResidualPendingImportHistoryCandidate */
         SELECT id FROM user_import_requests WHERE id < $1::uuid AND id < $2::uuid
           AND id >= COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND followed_at IS NULL ORDER BY id LIMIT 1 FOR UPDATE`,
        params,
      )
      return rows
    }
    case 'referral_attribution_scrub': {
      const { rows } = await query<Candidate>(
        `/* listResidualReferralScrubCandidate */
         SELECT id FROM session_referral_attributions WHERE id < $1::uuid AND id < $2::uuid
           AND id >= COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND (landing_url IS NOT NULL OR utm_source IS NOT NULL OR utm_medium IS NOT NULL
             OR utm_campaign IS NOT NULL OR utm_content IS NOT NULL)
         ORDER BY id LIMIT 1 FOR UPDATE`,
        params,
      )
      return rows
    }
    case 'referral_attribution_expiry': {
      const { rows } = await query<Candidate>(
        `/* listResidualReferralExpiryCandidate */
         SELECT id FROM session_referral_attributions WHERE id < $1::uuid AND id < $2::uuid
           AND id >= COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
         ORDER BY id LIMIT 1 FOR UPDATE`,
        params,
      )
      return rows
    }
    default:
      return []
  }
}
