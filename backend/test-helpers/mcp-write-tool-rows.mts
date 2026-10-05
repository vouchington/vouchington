import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type TestMcpCreateAttempt = {
  id: string
  response: Record<string, unknown> | null
  completed_at: Date | null
}

/** The delegated-create idempotency ledger rows the credential owner holds. */
export async function listTestMcpCreateAttempts(userId: string): Promise<TestMcpCreateAttempt[]> {
  const { rows } = await read<TestMcpCreateAttempt>(sql`/* listTestMcpCreateAttempts */
    SELECT id, response, completed_at
    FROM user_mcp_create_attempts
    WHERE user_id = ${userId}
    ORDER BY id`)
  return rows
}

/** Ages the owner's unfinished claims past the lease so a retry may take them over. */
export async function expireTestMcpCreateAttemptLeases(userId: string): Promise<void> {
  await write(sql`/* expireTestMcpCreateAttemptLeases */
    UPDATE user_mcp_create_attempts
    SET claimed_at = clock_timestamp() - INTERVAL '1 day'
    WHERE user_id = ${userId} AND response IS NULL`)
}

/** How many moderation reports the user filed, for asserting a refused call wrote nothing. */
export async function countTestModerationReportsByReporter(userId: string): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`/* countTestModerationReportsByReporter */
    SELECT count(*)::TEXT AS count FROM moderation_reports WHERE reporter_user_id = ${userId}`)
  return Number(rows[0]?.count)
}
