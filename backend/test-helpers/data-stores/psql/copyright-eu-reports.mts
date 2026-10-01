import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Counts the EU transparency reports one staff member compiled, so a rejected request can prove
 * it recorded nothing in the shared database. */
export async function countEuTransparencyReportsBy(reporterId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countEuTransparencyReportsBy */
    SELECT count(*)::integer AS count
    FROM copyright_eu_transparency_reports
    WHERE reported_by_id = ${reporterId}
  `)
  return rows[0]?.count ?? 0
}
