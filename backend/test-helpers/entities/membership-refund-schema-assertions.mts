import { read } from '@data-stores/psql'

export async function hasExpectedTestMembershipOperationReconciliationDueIndex(): Promise<boolean> {
  const { rows } = await read<{ present: boolean }>(
    `/* getTestMembershipOperationReconciliationDueIndex */
      SELECT EXISTS (SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'membership_operation_execution_work_items'
        AND indexname = 'idx_membership_operation_execution_work_items__available'
        AND indexdef LIKE '%USING btree (available_at, membership_operation_id) WHERE (lease_token IS NULL)') AS present`,
  )
  return rows[0]?.present ?? false
}
export async function getTestMembershipRefundOperationLinkNullable(): Promise<boolean | undefined> {
  const { rows } = await read<{ isNullable: string }>(
    `/* getTestMembershipRefundOperationLinkNullable */
      SELECT is_nullable AS "isNullable" FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'membership_refunds'
        AND column_name = 'membership_operation_id'`,
  )
  return rows[0]?.isNullable === 'YES'
}
