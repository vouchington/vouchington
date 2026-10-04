import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readTestEuRedressAttribution(redressId: string) {
  const { rows } = await read<{
    submitted_by_user_id: string | null
    filed_by: 'notifier' | 'poster' | 'reviewer'
  }>(sql`/* readTestEuRedressAttribution */
    SELECT submitted_by_user_id, filed_by
    FROM copyright_territorial_redress_requests
    WHERE id = ${redressId}
  `)
  return rows[0] ?? null
}

export async function readTestEuRedressAttributions(noticeId: string) {
  const { rows } = await read<{
    id: string
    submitted_by_user_id: string | null
    filed_by: 'notifier' | 'poster' | 'reviewer'
  }>(sql`/* readTestEuRedressAttributions */
    SELECT id, submitted_by_user_id, filed_by
    FROM copyright_territorial_redress_requests
    WHERE copyright_notice_id = ${noticeId}
    ORDER BY id
  `)
  return rows
}
