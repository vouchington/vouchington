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
    case 'followed_user_import_requests':
    case 'pending_user_import_requests': {
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
    case 'referral_attribution_scrub':
    case 'referral_attribution_expiry': {
      const { rows } = await query<Candidate>(
        `/* listRawReferralHistoryCandidates */
         SELECT id FROM session_referral_attributions
         WHERE id >= COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id > COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND id < $2::uuid
         ORDER BY id LIMIT $4 FOR UPDATE SKIP LOCKED`,
        params,
      )
      return rows
    }
  }
}
