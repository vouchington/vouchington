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
  const { rows } = await read<{
    id: string
    provider_lineage_id: string
    environment: AppleMembershipProviderEnvironment
  }>(sql`/* findRecoverableAppleNotificationJobs */
    SELECT evidence.id, lineage.provider_lineage_id, evidence.environment
    FROM membership_provider_evidence_records evidence
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = evidence.membership_provider_lineage_id
    WHERE evidence.provider = 'apple_app_store'
      AND evidence.provider_event_id IS NOT NULL
      AND evidence.verified_at IS NULL AND evidence.rejected_at IS NULL
    ORDER BY evidence.received_at, evidence.id
    LIMIT 500`)
  return rows.map(row => ({
    evidenceId: row.id,
    providerLineageId: row.provider_lineage_id,
    environment: row.environment,
  }))
}
