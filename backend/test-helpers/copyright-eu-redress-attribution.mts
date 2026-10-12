import { read } from './fixture-executor.mts'
import sql from './fixture-sql.mts'

export async function readTestEuRedressAttribution(redressId: string) {
  const { rows } = await read<{
    submitted_by_id: string | null
    filed_by: 'notifier' | 'poster' | 'reviewer'
  }>(sql`/* readTestEuRedressAttribution */
    SELECT submitted_by_id, filed_by
    FROM copyright_territorial_redress_requests
    WHERE id = ${redressId}
  `)
  return rows[0] ?? null
}

export async function readTestEuRedressAttributions(noticeId: string) {
  const { rows } = await read<{
    id: string
    submitted_by_id: string | null
    filed_by: 'notifier' | 'poster' | 'reviewer'
  }>(sql`/* readTestEuRedressAttributions */
    SELECT id, submitted_by_id, filed_by
    FROM copyright_territorial_redress_requests
    WHERE copyright_notice_id = ${noticeId}
    ORDER BY id
  `)
  return rows
}
