import { write } from '@data-stores/psql'

export async function readTestSessionRevokedAt(sessionId: string): Promise<Date | undefined> {
  const { rows } = await write<{ revoked_at: Date }>(
    `/* sessionRevokedAtForTest */ SELECT revoked_at FROM user_sessions WHERE id = $1`,
    [sessionId],
  )
  return rows[0]?.revoked_at
}
