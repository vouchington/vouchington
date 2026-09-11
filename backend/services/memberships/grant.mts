import type { MembershipPlanSlug } from './types.mts'
import { createMembership } from './create.mts'

export async function grantMembership(
  currentUserId: string,
  targetUserId: string,
  plan: MembershipPlanSlug,
  skuId: string,
  durationDays = 365,
  options?: { note?: string },
): Promise<{ id: string; grantId: string; queued: boolean }> {
  const created = await createMembership({
    userId: targetUserId,
    plan,
    skuId,
    grantedById: currentUserId,
    durationDays,
    note: options?.note,
  })
  if (!created.grantId) throw new Error('Administrator membership has no grant')
  return { id: created.id, grantId: created.grantId, queued: !created.projected }
}
