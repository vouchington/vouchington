import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getPagedDispatchLimit } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'

export async function findMembershipVerificationRecoveryUpperBound(): Promise<string | null> {
  const { rows } = await read<{ id: string }>(sql`/* findMembershipVerificationRecoveryUpperBound */
    SELECT id FROM membership_verifications
    WHERE verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL
    ORDER BY id DESC LIMIT 1`)
  return rows[0]?.id ?? null
}

/** The pending partial index supplies both the predicate and the bounded UUIDv7 keyset. */
export async function findRecoverableMembershipVerificationIds(options: {
  after?: string
  through: string
  limit?: number
}): Promise<string[]> {
  const limit = Math.min(
    options.limit ?? getPagedDispatchLimit('memberships_page_size'),
    getPagedDispatchLimit('memberships_page_size'),
  )
  const { rows } = await read<{ id: string }>(sql`/* findRecoverableMembershipVerificationIds */
    SELECT id FROM membership_verifications
    WHERE id > ${options.after ?? '00000000-0000-0000-0000-000000000000'}::UUID
      AND id <= ${options.through}::UUID
      AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL
    ORDER BY id LIMIT ${limit}`)
  return rows.map(row => row.id)
}
