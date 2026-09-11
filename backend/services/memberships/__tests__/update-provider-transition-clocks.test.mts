import { describe, expect, it } from 'vitest'
import { createTestMembership, createTestUser, getTestMembershipRaw } from '@voucha/test-helpers'
import { updateMembershipFromWebhook } from '../update.mts'

describe('updateMembershipFromWebhook provider transition clocks', () => {
  it('applies earlier provider timestamps without regressing lifecycle history', async () => {
    const timestampUser = await createTestUser()
    const membership = await createTestMembership({ user_id: timestampUser.id })
    const effectiveAt = new Date('2020-01-01T00:00:00.000Z')
    const terminalEffectiveAt = new Date('2030-02-01T00:00:00.000Z')

    await updateMembershipFromWebhook(
      {
        membershipId: membership.id,
        status: 'cancelled',
        effectiveAt,
        terminalEffectiveAt,
      },
      async () => {},
    )

    const raw = (await getTestMembershipRaw(membership.id)) as Record<string, unknown>
    expect(raw.effective_at).toEqual(effectiveAt)
    expect(raw.cancelled_at).toEqual(terminalEffectiveAt)
    expect(raw.source_cancelled_at).toEqual(terminalEffectiveAt)
  })

  it.each([
    [true, 'active'],
    [true, 'past_due'],
    [true, 'paused'],
    [false, 'cancelled'],
    [false, 'expired'],
  ] as const)(
    'derives source auto-renewal as %s for %s memberships',
    async (expectedAutoRenews, status) => {
      const lifecycleUser = await createTestUser()
      const membership = await createTestMembership({
        user_id: lifecycleUser.id,
        stripe_subscription_id: `sub_auto_renews_${lifecycleUser.id}`,
      })

      await updateMembershipFromWebhook({ membershipId: membership.id, status }, async () => {})

      await expect(getTestMembershipRaw(membership.id)).resolves.toMatchObject({
        status,
        source_auto_renews: expectedAutoRenews,
      })
    },
  )

  it('never marks an admin grant as auto-renewing', async () => {
    const grantUser = await createTestUser()
    const membership = await createTestMembership({ user_id: grantUser.id })

    await updateMembershipFromWebhook(
      { membershipId: membership.id, status: 'active' },
      async () => {},
    )

    await expect(getTestMembershipRaw(membership.id)).resolves.toMatchObject({
      status: 'active',
      source_auto_renews: false,
    })
  })
})
