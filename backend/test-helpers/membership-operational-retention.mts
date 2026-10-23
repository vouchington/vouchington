import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestMembership } from './entities/memberships.mts'
import { createTestRenewalEmail } from './renewal-email.mts'
import { acquireTestPostgresAdvisoryLock } from './postgres-advisory-lock.mts'

export function acquireMembershipOperationalRetentionTestLock() {
  return acquireTestPostgresAdvisoryLock({ namespace: 1_447_904_068, key: 3641, timeout: '25s' })
}

export async function resetMembershipOperationalRetentionCursor(
  kind: 'entitlement_effects' | 'renewal_notices' | 'google_acknowledgments',
): Promise<void> {
  await write(sql`/* resetMembershipOperationalRetentionCursor */
    UPDATE membership_operational_cleanup_cursors SET cursor_at = NULL, cursor_id = NULL
    WHERE kind = ${kind}
  `)
}

export async function createDeliveredMembershipEffectForRetention(
  userId: string,
  deliveredAt: Date,
): Promise<{ changeId: string; effectId: string }> {
  const membership = await createTestMembership({ user_id: userId, plan: 'plus' })
  const { rows } = await read<{ latest_change_id: string }>(sql`
    /* createDeliveredMembershipEffectForRetention.change */
    SELECT latest_change_id FROM memberships WHERE id = ${membership.id}
  `)
  const changeId = rows[0]?.latest_change_id
  if (!changeId) throw new Error('Test membership lacks a change')
  const { rows: effects } = await write<{ id: string }>(sql`
    /* createDeliveredMembershipEffectForRetention.effect */
    INSERT INTO membership_entitlement_effects (membership_change_id, user_id, delivered_at)
    VALUES (${changeId}, ${userId}, ${deliveredAt}) RETURNING id
  `)
  return { changeId, effectId: effects[0]!.id }
}

export async function createEndedMembershipRenewalNoticeForRetention(
  userId: string,
  endedAt: Date,
): Promise<string> {
  const { data } = await createTestRenewalEmail(userId)
  await write(sql`/* createEndedMembershipRenewalNoticeForRetention.end */
    UPDATE memberships SET projection_ended_at = ${endedAt}
    WHERE id = ${data.membershipId}
  `)
  return data.membershipId
}

export async function membershipEffectExists(effectId: string): Promise<boolean> {
  const { rows } = await read<{ exists: boolean }>(sql`/* membershipEffectExists */
    SELECT EXISTS(SELECT 1 FROM membership_entitlement_effects WHERE id = ${effectId}) AS exists
  `)
  return rows[0]?.exists ?? false
}

export async function membershipRenewalNoticeExists(membershipId: string): Promise<boolean> {
  const { rows } = await read<{ exists: boolean }>(sql`/* membershipRenewalNoticeExists */
    SELECT EXISTS(SELECT 1 FROM membership_renewal_price_increase_notification_work_items
      WHERE membership_id = ${membershipId}) AS exists
  `)
  return rows[0]?.exists ?? false
}

export async function ageTerminalGooglePlayAcknowledgment(
  id: string,
  terminalAt: Date,
): Promise<void> {
  await write(sql`/* ageTerminalGooglePlayAcknowledgment */
    UPDATE membership_google_play_acknowledgments
    SET acknowledged_at = ${terminalAt}, skipped_at = NULL, skip_reason = NULL
    WHERE id = ${id} AND acknowledged_at IS NOT NULL
  `)
}

export async function googlePlayAcknowledgmentExists(id: string): Promise<boolean> {
  const { rows } = await read<{ exists: boolean }>(sql`/* googlePlayAcknowledgmentExists */
    SELECT EXISTS(SELECT 1 FROM membership_google_play_acknowledgments WHERE id = ${id}) AS exists
  `)
  return rows[0]?.exists ?? false
}
