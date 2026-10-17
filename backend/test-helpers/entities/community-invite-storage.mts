import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTestCommunityInviteStorage(inviteId: string): Promise<{
  code_hash: string
  accepted_at: Date | null
  revoked_at: Date | null
} | null> {
  const { rows } = await read(sql`/* getTestCommunityInviteStorage */
    SELECT code_hash, accepted_at, revoked_at FROM community_invites WHERE id = ${inviteId}
  `)
  return (
    (rows[0] as { code_hash: string; accepted_at: Date | null; revoked_at: Date | null }) ?? null
  )
}
