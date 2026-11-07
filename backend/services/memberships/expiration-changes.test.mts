import { describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { read } from '@data-stores/psql'
import {
  beginTransaction,
  createTestSku,
  createTestUser,
  getTestGrantQueue,
  setTestMembershipGrantRemainingMilliseconds,
} from '@voucha/test-helpers'
import { createMembership, grantMembership } from './create.mts'
import { resumeGrantAfterDirectAccessSuspensionInTransaction as resumeDirect } from './grants/resume-after-direct-termination.mts'

describe('exhausted paused grants on direct termination', () => {
  it('records one expiration change with its entitlement effect and latest pointer per grant', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    await grantMembership(admin.id, member.id, 'plus', grantSku.id, 1)
    const [pausedGrantId] = (await getTestGrantQueue(member.id)).grant_ids
    const directSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const stripeSubscriptionId = `sub_exhausted_changes_${member.id}`
    await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId,
    })
    await setTestMembershipGrantRemainingMilliseconds(pausedGrantId!, 0.5)
    const terminal = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId,
      status: 'cancelled',
      effectiveAt: new Date('2026-09-04T11:00:00.000Z'),
      terminalEffectiveAt: new Date('2026-09-04T12:00:00.000Z'),
    })

    await using transaction = await beginTransaction()
    await resumeDirect(member.id, terminal.id, transaction)
    await transaction.commit()

    const { rows } = await read<{ latest: boolean; effects: number; expired: boolean }>(
      sql`/* expirationChange */
      SELECT membership.latest_change_id = change.id AS latest, change.expired_at IS NOT NULL AS expired,
        (SELECT count(*)::int FROM membership_entitlement_effects effect
          WHERE effect.membership_change_id = change.id) AS effects
      FROM membership_changes change
      JOIN memberships membership ON membership.id = change.membership_id
      WHERE change.membership_grant_id = ${pausedGrantId}
        AND change.change_type = 'expiration'`,
    )
    expect(rows).toEqual([{ latest: true, expired: true, effects: 1 }])
  })
})
