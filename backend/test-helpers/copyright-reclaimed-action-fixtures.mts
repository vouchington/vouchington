import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createCopyrightRestorationHoldFixture } from './copyright-restoration-hold-fixtures.mts'
import {
  seedActionDeliveryRestriction,
  claimActionDeliveryFixture,
} from './copyright-action-delivery-contract-fixtures.mts'
import type { CopyrightClaimedActionIntent } from '../services/copyright-notices/action-delivery-state.mts'

/** Genuine expired/current action-lease states precede independent old-owner business guards. */
export async function createReclaimedActionFixture(reclaim = true) {
  const { aggregate, assessment, claimant, moderator, notice } =
    await createCopyrightRestorationHoldFixture()
  const target = aggregate.targets[0]!
  const restriction = await seedActionDeliveryRestriction({
    noticeId: notice.id,
    targetId: target.id,
    assessmentId: assessment.id,
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
    imposedById: moderator.id,
  })
  await using query = await beginTransaction()
  const { rows: intents } = await query<{
    id: string
  }>(sql`/* createReclaimedActionFixture:intent */
    SELECT id FROM copyright_notice_action_work_items WHERE copyright_restriction_id = ${restriction.id}
      AND action = 'withhold'`)
  const intentId = intents[0]!.id
  const legal = await claimActionDeliveryFixture(intentId, query)
  const old: CopyrightClaimedActionIntent = {
    id: intentId,
    action: 'withhold',
    expected_placement_revision: legal.expected_placement_revision,
    lease_token: legal.lease_token,
    placement_id: legal.placement_id,
    image_id: legal.image_id,
  }
  await query(sql`/* createReclaimedActionFixture:expire */
    UPDATE copyright_notice_action_work_items SET leased_at = clock_timestamp() - INTERVAL '6 minutes',
      lease_expires_at = clock_timestamp() - INTERVAL '1 minute'
    WHERE id = ${intentId} AND lease_token = ${old.lease_token}::uuid`)
  let current = old
  if (reclaim) {
    const { rows } = await query<{
      lease_token: string
    }>(sql`/* createReclaimedActionFixture:reclaim */
      UPDATE copyright_notice_action_work_items SET lease_token = uuidv7(), attempt_count = attempt_count + 1,
        leased_at = clock_timestamp(), lease_expires_at = clock_timestamp() + INTERVAL '5 minutes', available_at = clock_timestamp()
      WHERE id = ${intentId} AND state = 'claimed' AND lease_expires_at < clock_timestamp()
      RETURNING lease_token`)
    if (!rows[0]) throw new Error('Owned old action lease did not expire')
    current = { ...old, lease_token: rows[0].lease_token }
  }
  await query.commit()
  return {
    noticeId: notice.id,
    restrictionId: restriction.id,
    placementId: target.placement_id,
    accountId: claimant.id,
    intentId,
    old,
    current,
    now: new Date(),
  }
}

export async function readReclaimedActionAuthority(intentId: string) {
  await using query = await beginTransaction()
  const { rows } = await query<{
    token: string | null
    attempts: number
    state: string
  }>(sql`/* readReclaimedActionAuthority */
    SELECT lease_token AS token, attempt_count AS attempts, state FROM copyright_notice_action_work_items
    WHERE id = ${intentId}`)
  await query.commit()
  if (!rows[0]) throw new Error('Owned action authority disappeared')
  return rows[0]
}
