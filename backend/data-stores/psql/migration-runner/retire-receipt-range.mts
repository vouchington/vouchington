import { retireExplicitRange } from './retire-explicit-range.mts'

/** Receipt-specific precheck and dependent-row cleanup before the shared transactional drop. */
export async function retireReceiptRange(partitionName: string): Promise<number> {
  return retireExplicitRange({
    table: 'ai_agent_call_receipts',
    partitionName,
    lockTables: ['moderation_report_judgements'],
    beforeDetach: async (query, partition) => {
      const { rows: references } = await query<{
        schema_name: string
        current_schema_name: string
        table_name: string
        constraint_name: string
      }>(`/* assertReviewedReceiptRangeReferences */
        SELECT child_ns.nspname AS schema_name, current_schema() AS current_schema_name,
          child.relname AS table_name, fk.conname AS constraint_name
        FROM pg_constraint fk
        JOIN pg_class parent ON parent.oid = fk.confrelid
        JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
        JOIN pg_class child ON child.oid = fk.conrelid
        JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
        WHERE parent_ns.nspname = current_schema() AND parent.relname = 'ai_agent_call_receipts'
          AND fk.contype = 'f' AND fk.conparentid = 0`)
      if (
        references.some(
          reference =>
            reference.schema_name !== reference.current_schema_name ||
            reference.table_name !== 'moderation_report_judgements' ||
            reference.constraint_name !== 'fk_moderation_report_judgements__agent_call_receipt',
        )
      ) {
        throw new Error(
          'Receipt range has a referencing table without a reviewed retirement action',
        )
      }
      const { rows: inFlight } = await query(`/* rejectInFlightReceiptRange */
        SELECT 1 FROM ${partition} WHERE status = 'in_flight' LIMIT 1`)
      if (inFlight.length > 0)
        throw new Error('Receipt range still contains an in-flight paid call')
      // ON DELETE CASCADE does not run for DETACH/DROP. Delete the reviewed child rows first.
      await query(`/* deleteReceiptRangeJudgementReferences */
        WITH selected AS (
          SELECT judgement.id FROM moderation_report_judgements judgement
          JOIN ${partition} receipt ON receipt.id = judgement.agent_call_receipt_id
          ORDER BY judgement.id LIMIT 10000 FOR UPDATE OF judgement
        )
        DELETE FROM moderation_report_judgements judgement
        USING selected WHERE judgement.id = selected.id`)
      const { rows: remaining } = await query(`/* verifyReceiptRangeUnreferenced */
        SELECT 1 FROM moderation_report_judgements judgement
        JOIN ${partition} receipt ON receipt.id = judgement.agent_call_receipt_id
        LIMIT 1`)
      if (remaining.length > 0) throw new Error('Receipt range still has a referencing judgement')
    },
  })
}
