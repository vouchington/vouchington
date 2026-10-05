import { write } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'

/** The jurisdiction of a just-created case, read from the primary so a delivery sees it. */
export async function getCopyrightNoticeJurisdiction(noticeId: string): Promise<string> {
  const { rows } = await write<{ jurisdiction: string }>(sql`/* getCopyrightNoticeJurisdiction */
    SELECT jurisdiction FROM copyright_notices WHERE id = ${noticeId}
  `)
  assert(rows[0], 404, 'Copyright notice not found')
  return rows[0].jurisdiction
}
