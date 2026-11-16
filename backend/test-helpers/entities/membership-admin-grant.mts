import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestMembership } from './memberships.mts'

type CreateTestAdminGrantMembershipOptions = {
  grantedById: string
  productId: string
  userId: string
}

/**
 * Commits an active administrator grant with its activation and projection at the default
 * isolation level. Use it when the SERIALIZABLE `grantMembership` writer is only test setup:
 * parallel tests' predicate locks can abort that writer with 40001.
 */
export async function createTestAdminGrantMembership(
  options: CreateTestAdminGrantMembershipOptions,
): Promise<{ id: string; grantId: string }> {
  const membership = await createTestMembership({
    user_id: options.userId,
    sku_id: options.productId,
    granted_by_id: options.grantedById,
  })
  const { rows } = await read<{ id: string }>(sql`/* createTestAdminGrantMembership */
    SELECT id FROM membership_grants WHERE membership_source_id = ${membership.membership_source_id}`)
  const grantId = rows[0]?.id
  if (!grantId) throw new Error('Administrator grant fixture has no grant')
  return { id: membership.id, grantId }
}
