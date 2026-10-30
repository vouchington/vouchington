import type { TransactionQuery } from '@data-stores/psql'

export type Family = 'stripe_event' | 'membership_operation'
export type CleanupPage = { family: Family; scanned: number; deleted: number; hasMore: boolean }
const TABLES: Record<Family, string> = {
  stripe_event: 'stripe_events',
  membership_operation: 'membership_operations',
}

export async function selectPaymentLedgerCandidates(
  query: TransactionQuery,
  family: Family,
  pageSize: number,
  recordIds?: readonly string[],
) {
  if (!recordIds)
    await query(
      `/* ensurePaymentLedgerRetentionCursor */
     INSERT INTO payment_ledger_retention_cursors (family) VALUES ($1)
     ON CONFLICT DO NOTHING`,
      [family],
    )
  const progress = recordIds
    ? []
    : (
        await query<{ cursor_record_id: string | null }>(
          `/* lockPaymentLedgerRetentionCursor */
     SELECT cursor_record_id FROM payment_ledger_retention_cursors WHERE family = $1 FOR UPDATE`,
          [family],
        )
      ).rows
  const { rows: candidates } = recordIds
    ? await query<{ id: string }>(
        `/* listScopedPaymentLedgerRetentionCandidates */
       SELECT id FROM ${TABLES[family]} WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [recordIds],
      )
    : await query<{ id: string }>(
        `/* listPaymentLedgerRetentionCandidates */
       SELECT id FROM ${TABLES[family]}
       WHERE ($1::uuid IS NULL OR id > $1::uuid)
       ORDER BY id LIMIT $2`,
        [progress[0]?.cursor_record_id ?? null, pageSize + 1],
      )
  return { candidates, cursorRecordId: progress[0]?.cursor_record_id ?? null }
}
