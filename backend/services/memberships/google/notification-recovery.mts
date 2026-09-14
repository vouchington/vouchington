import { write } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { parseGooglePlayRtdn } from './rtdn.mts'
import {
  advanceGooglePlayRecoverySweep,
  beginGooglePlayRecoverySweep,
  pageGooglePlayRecoveryItems,
} from './recovery-cursor.mts'
import type { GooglePlayMembershipProviderEnvironment } from './types.mts'

export type RecoverableGooglePlayNotification = {
  evidenceId: string
  purchaseToken: string
  environment: GooglePlayMembershipProviderEnvironment
}

export type GooglePlayNotificationRecoveryBatch = {
  notifications: RecoverableGooglePlayNotification[]
  previousCursor: string | null
  previousUpperBound: string | null
  sweepUpperBound: string | null
  nextCursor: string | null
  completesSweep: boolean
}

export async function findRecoverableGooglePlayNotificationJobs(): Promise<GooglePlayNotificationRecoveryBatch> {
  const cursor = await beginGooglePlayRecoverySweep({
    cursorId: 'notifications',
    findUpperBound: findNotificationSweepUpperBound,
  })
  const page = pageGooglePlayRecoveryItems(
    cursor,
    await findPendingNotificationRows(cursor.previousCursor, cursor.sweepUpperBound),
    500,
  )
  const rows = page.items
  const parsed = rows.map(row => {
    let raw: Buffer
    try {
      raw = Buffer.from(
        decryptSecret(
          row.encrypted_evidence.toString(),
          `membership-provider-evidence:google_play:${row.evidence_lookup_sha256}`,
        ),
      )
    } catch {
      return { notification: null, retryable: true }
    }
    const event = parseGooglePlayRtdn(raw, row.application_id)
    if (event && (!('kind' in event) || event.kind === 'voided'))
      return {
        notification: {
          evidenceId: row.id,
          purchaseToken: event.purchaseToken,
          environment: row.environment,
        },
        retryable: false,
      }
    return { notification: null, retryable: false }
  })
  await Promise.all(
    rows.flatMap((row, index) =>
      parsed[index]?.notification || parsed[index]?.retryable
        ? []
        : [rejectMalformedRecoveryEvidence(row.id)],
    ),
  )
  return {
    notifications: parsed.flatMap(item =>
      item.notification ? [item.notification satisfies RecoverableGooglePlayNotification] : [],
    ),
    ...page,
  }
}

async function findPendingNotificationRows(
  cursor: string | null,
  upperBound: string | null,
): Promise<
  Array<{
    id: string
    environment: GooglePlayMembershipProviderEnvironment
    application_id: string
    encrypted_evidence: Buffer
    evidence_lookup_sha256: string
  }>
> {
  const { rows } = await write<{
    id: string
    environment: GooglePlayMembershipProviderEnvironment
    application_id: string
    encrypted_evidence: Buffer
    evidence_lookup_sha256: string
  }>(sql`/* findRecoverableGooglePlayNotificationJobs */
    SELECT id, environment, application_id, encrypted_evidence, evidence_lookup_sha256
    FROM membership_provider_evidence_records WHERE provider = 'google_play' AND provider_event_id IS NOT NULL
      AND verified_at IS NULL AND rejected_at IS NULL
      AND (${cursor}::UUID IS NULL OR id > ${cursor}::UUID)
      AND (${upperBound}::UUID IS NULL OR id <= ${upperBound}::UUID)
    ORDER BY id LIMIT 501`)
  return rows
}

async function findNotificationSweepUpperBound(): Promise<string | null> {
  const { rows } = await write<{
    id: string | null
  }>(sql`/* findGooglePlayNotificationSweepUpperBound */
    SELECT id FROM membership_provider_evidence_records
    WHERE provider = 'google_play' AND provider_event_id IS NOT NULL
      AND verified_at IS NULL AND rejected_at IS NULL
    ORDER BY id DESC LIMIT 1`)
  return rows[0]?.id ?? null
}

export async function advanceGooglePlayNotificationRecoveryCursor(
  batch: GooglePlayNotificationRecoveryBatch,
): Promise<void> {
  await advanceGooglePlayRecoverySweep({ cursorId: 'notifications', ...batch })
}
async function rejectMalformedRecoveryEvidence(evidenceId: string): Promise<void> {
  await write(
    sql`/* rejectMalformedGooglePlayRecoveryEvidence */ UPDATE membership_provider_evidence_records SET rejected_at = CURRENT_TIMESTAMP, rejection_reason = 'invalid_google_rtdn' WHERE id = ${evidenceId} AND verified_at IS NULL AND rejected_at IS NULL`,
  )
}
