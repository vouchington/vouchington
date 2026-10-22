import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestSku } from '@voucha/test-helpers'
import {
  createTestIndependentFamilyClockFixture,
  readTestIndependentFamilyMembershipClocks,
  type FamilyMembershipClockOffsets,
} from '@voucha/test-helpers/current-paid-membership-clocks'

const validOffsets: FamilyMembershipClockOffsets = {
  membershipExpiry: 86_400_000,
  sourceExpiry: 86_400_000,
  sourceEffective: -86_400_000,
}
const cases = (['membershipExpiry', 'sourceExpiry', 'sourceEffective'] as const).flatMap(gate =>
  ([-1, 0, 1] as const).map(offset => ({ gate, offset })),
)

describe('independent native family membership clocks', () => {
  let sku: Awaited<ReturnType<typeof createTestSku>>

  beforeAll(async () => {
    sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-clocks-${randomUUID()}`,
    })
  })

  it.each(cases)('isolates $gate at PostgreSQL time plus $offset ms', async ({ gate, offset }) => {
    const [target, control] = await Promise.all([
      createTestIndependentFamilyClockFixture(sku),
      createTestIndependentFamilyClockFixture(sku),
    ])
    const offsets = { ...validOffsets, [gate]: offset }
    const observed = await readTestIndependentFamilyMembershipClocks(target, control, offsets)
    const eligible = gate === 'sourceEffective' ? offset <= 0 : offset > 0
    const expectedUserIds = eligible ? [target.userId, control.userId] : [control.userId]

    expect(observed.paidBefore.map(row => row.user_id)).toEqual(
      [target.userId, control.userId].toSorted(),
    )
    expect(observed.storedOffsets).toEqual(offsets)
    expect(observed.paid.map(row => row.user_id)).toEqual(expectedUserIds.toSorted())
    expect(
      Object.fromEntries(observed.privateUsers.map(row => [row.id, row.membership_plan])),
    ).toEqual({
      [target.userId]: eligible ? 'plus' : null,
      [control.userId]: 'plus',
    })
    expect(observed.clockAfter).toEqual(observed.clockBefore)
    expect(observed.controlDuring).toEqual(observed.controlBefore)
    expect(observed.targetAfterRollback).toEqual(observed.targetBefore)
    expect(observed.controlAfterRollback).toEqual(observed.controlBefore)
  })
})
