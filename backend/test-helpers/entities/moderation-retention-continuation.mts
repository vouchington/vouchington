import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function testRetentionReportExists(id: string): Promise<boolean> {
  const { rows } = await read<{ present: boolean }>(sql`/* testRetentionReportExists */
    SELECT EXISTS (SELECT 1 FROM moderation_reports WHERE id = ${id}) AS present
  `)
  return rows[0]!.present
}

export async function deleteTestRetentionReports(ids: readonly string[]): Promise<void> {
  await write(sql`/* deleteTestRetentionReports */
    DELETE FROM moderation_reports WHERE id = ANY(${ids}::uuid[])
  `)
}
