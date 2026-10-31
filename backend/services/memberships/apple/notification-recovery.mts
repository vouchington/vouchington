import { getMembershipWorkLimit } from '@services/memberships/work-limits'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AppleMembershipProviderEnvironment } from './types.mts'

export type RecoverableAppleNotification = {
  evidenceId: string
  providerLineageId: string
  environment: AppleMembershipProviderEnvironment
}

export async function findRecoverableAppleNotificationJobs(): Promise<
  RecoverableAppleNotification[]
> {
  const WORK_PAGE_SIZE = getMembershipWorkLimit('notification_recovery_batch_size')
  const { rows } = await read<{
    id: string
    provider_lineage_id: string
    environment: AppleMembershipProviderEnvironment
  }>(sql`/* findRecoverableAppleNotificationJobs */
    WITH candidate_page AS MATERIALIZED (
      SELECT evidence.id, evidence.membership_provider_context_id,
        evidence.membership_provider_lineage_id, evidence.received_at
      FROM membership_provider_evidence_records evidence
      WHERE evidence.membership_provider_context_id = ANY(ARRAY(
        SELECT id FROM membership_provider_contexts WHERE provider = 'apple_app_store'
      ))
        AND evidence.membership_provider_lineage_id IS NOT NULL
        AND evidence.provider_event_id IS NOT NULL
        AND evidence.verified_at IS NULL AND evidence.rejected_at IS NULL
      ORDER BY evidence.received_at, evidence.id LIMIT ${WORK_PAGE_SIZE}
    )
    SELECT candidate.id, lineage.provider_lineage_id, context.environment
    FROM candidate_page candidate
    INNER JOIN LATERAL (
      SELECT environment FROM membership_provider_contexts
      WHERE id = candidate.membership_provider_context_id LIMIT 1
    ) context ON TRUE
    INNER JOIN LATERAL (
      SELECT provider_lineage_id FROM membership_provider_lineages
      WHERE id = candidate.membership_provider_lineage_id LIMIT 1
    ) lineage ON TRUE
    ORDER BY candidate.received_at, candidate.id`)
  return rows.map(row => ({
    evidenceId: row.id,
    providerLineageId: row.provider_lineage_id,
    environment: row.environment,
  }))
}
