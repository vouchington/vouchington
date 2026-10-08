import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type TestClassifierRunUsageRow = {
  classifier_run_id: string
  agent_slug: string
  input_tokens: number
  output_tokens: number
  pricing_status: string
  cost_microunits: string | null
  latency_milliseconds: number | null
}

/** Every ledger row the classifier clients attributed to one run, oldest first. */
export async function listAiUsageRecordsForClassifierRun(
  runId: string,
): Promise<TestClassifierRunUsageRow[]> {
  const { rows } =
    await read<TestClassifierRunUsageRow>(sql`/* listAiUsageRecordsForClassifierRun */
    SELECT classifier_run_id, agent_slug, input_tokens, output_tokens, pricing_status,
      cost_microunits, latency_milliseconds
    FROM ai_usage_records
    WHERE classifier_run_id = ${runId}
    ORDER BY id
  `)
  return rows
}

/** One ledger row by its id (a partition-pruned read), or null when it does not exist. */
export async function findAiUsageRecordById(
  id: string,
): Promise<Pick<TestClassifierRunUsageRow, 'classifier_run_id' | 'latency_milliseconds'> | null> {
  const { rows } = await read<
    Pick<TestClassifierRunUsageRow, 'classifier_run_id' | 'latency_milliseconds'>
  >(
    sql`/* findAiUsageRecordById */
      SELECT classifier_run_id, latency_milliseconds FROM ai_usage_records WHERE id = ${id}
    `,
  )
  return rows[0] ?? null
}
