import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function countUserDeletionAuditLogsForTest(userId: string): Promise<number> {
  const { rows } = await read(sql`
    SELECT COUNT(*)::int AS count
    FROM user_deletion_audit_logs
    WHERE user_id = ${userId}
  `)
  return (rows[0] as { count?: number } | undefined)?.count ?? 0
}
