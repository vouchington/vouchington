import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type TestMembershipEntitlementEffect = {
  id: string
  membership_change_id: string
  user_id: string
  delivered_at: Date | null
  delivery_claim_token: string | null
  delivery_claimed_at: Date | null
}

export async function getTestMembershipEntitlementEffects(
  membershipChangeId: string,
): Promise<TestMembershipEntitlementEffect[]> {
  const { rows } = await read(sql`/* getTestMembershipEntitlementEffects */
    SELECT id, membership_change_id, user_id, delivered_at, delivery_claim_token, delivery_claimed_at
    FROM membership_entitlement_effects
    WHERE membership_change_id = ${membershipChangeId}`)
  return rows as TestMembershipEntitlementEffect[]
}

export async function getTestMembershipEntitlementEffectsForGrant(
  membershipGrantId: string,
): Promise<TestMembershipEntitlementEffect[]> {
  const { rows } = await read(sql`/* getTestMembershipEntitlementEffectsForGrant */
    SELECT effect.id, effect.membership_change_id, effect.user_id, effect.delivered_at,
      effect.delivery_claim_token, effect.delivery_claimed_at
    FROM membership_entitlement_effects effect
    INNER JOIN membership_changes change ON change.id = effect.membership_change_id
    WHERE change.membership_grant_id = ${membershipGrantId}`)
  return rows as TestMembershipEntitlementEffect[]
}

export async function ageTestMembershipEntitlementEffectClaim(effectId: string): Promise<void> {
  await write(sql`/* ageTestMembershipEntitlementEffectClaim */
    UPDATE membership_entitlement_effects
    SET delivery_claimed_at = CURRENT_TIMESTAMP - INTERVAL '6 minutes'
    WHERE id = ${effectId}`)
}

export async function claimTestMembershipEntitlementEffect(effectId: string): Promise<{
  id: string
  userId: string
  deliveryClaimToken: string
}> {
  const deliveryClaimToken = crypto.randomUUID()
  const { rows } = await write(sql`/* claimTestMembershipEntitlementEffect */
    UPDATE membership_entitlement_effects
    SET delivery_claim_token = ${deliveryClaimToken},
        delivery_claimed_at = CURRENT_TIMESTAMP
    WHERE id = ${effectId}
      AND delivered_at IS NULL
    RETURNING id, user_id`)
  const effect = rows[0] as { id: string; user_id: string } | undefined
  if (!effect) throw new Error(`Expected pending membership entitlement effect ${effectId}`)
  return { id: effect.id, userId: effect.user_id, deliveryClaimToken }
}
