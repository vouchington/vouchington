import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

const AI_RUN_TABLES = {
  appeal_recommendation: 'copyright_notice_appeal_recommendation_runs',
  submission_guidance: 'copyright_notice_submission_guidance_runs',
  email_intake_recommendation: 'copyright_notice_email_intake_recommendation_runs',
} as const

export type CopyrightAiRunKind = keyof typeof AI_RUN_TABLES

export const COPYRIGHT_AI_RUN_KINDS = Object.keys(AI_RUN_TABLES) as CopyrightAiRunKind[]

/**
 * Deletes at most `batchSize` runs of one kind whose id is older than `cutoffId`. Returns the
 * number of rows deleted.
 */
export async function deleteExpiredCopyrightAiRunBatch(
  kind: CopyrightAiRunKind,
  cutoffId: string,
  batchSize: number,
): Promise<number> {
  const table = AI_RUN_TABLES[kind]
  const query = sql`/* deleteOldCopyrightAiRunBatch */
    WITH candidates AS (
      SELECT id FROM `.append(table).append(sql`
      WHERE id < ${cutoffId}::uuid
      ORDER BY id LIMIT ${batchSize}
    )
    DELETE FROM `)
  query.append(table)
  query.append(sql` AS run
    WHERE run.id = ANY(ARRAY(SELECT id FROM candidates))
      AND run.id < ${cutoffId}::uuid
    RETURNING run.id`)
  const { rowCount } = await write(query)
  return rowCount ?? 0
}
