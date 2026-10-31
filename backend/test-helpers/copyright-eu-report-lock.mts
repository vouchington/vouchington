import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Hold a real restriction writer lock while the caller compiles a closed report. */
export async function withEuReportRestrictionWriterForTest(
  run: () => Promise<void>,
): Promise<void> {
  await using writer = await beginTransaction()
  await writer(sql`/* blockEuReportRestrictionSourceForTest */
    UPDATE copyright_restrictions SET imposed_at = imposed_at WHERE false`)
  await run()
  await writer.commit()
}
