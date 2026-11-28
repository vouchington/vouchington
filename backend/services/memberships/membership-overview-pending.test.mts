import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createTestMemberFinancialOperation } from '@voucha/test-helpers/entities/membership-overview-pending'
import { getMembershipPendingState } from './membership-overview-pending.mts'
import { membershipWorkConfig } from './work-limits.mts'

describe('getMembershipPendingState financial operations', () => {
  it('returns only the member pending and failed operations in descending id order up to the page limit', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(membershipWorkConfig, {
        pending_operations_page_size: 2,
      }),
    )
    const [member, other] = await Promise.all([createTestUser(), createTestUser()])

    // Create sequentially so UUIDv7 ordering is deterministic across the member's operations.
    const oldestPending = await createTestMemberFinancialOperation({
      userId: member.id,
      provider: 'stripe',
      kind: 'cancel_source',
      state: 'pending',
    })
    const failedOp = await createTestMemberFinancialOperation({
      userId: member.id,
      provider: 'stripe',
      kind: 'automatic_refund',
      state: 'failed',
    })
    await createTestMemberFinancialOperation({
      userId: member.id,
      provider: 'stripe',
      kind: 'cancel_source',
      state: 'completed',
    })
    const newestPending = await createTestMemberFinancialOperation({
      userId: member.id,
      provider: 'apple_app_store',
      kind: 'cancel_source',
      state: 'pending',
    })
    // Another member's newer pending operation must not leak into this member's overview.
    await createTestMemberFinancialOperation({
      userId: other.id,
      provider: 'stripe',
      kind: 'cancel_source',
      state: 'pending',
    })

    const state = await getMembershipPendingState(member.id)
    expect(state.financial_operations).toEqual([
      { id: newestPending, provider: 'apple_app_store', kind: 'cancel_source', status: 'pending' },
      { id: failedOp, provider: 'stripe', kind: 'automatic_refund', status: 'failed' },
    ])
    expect(state.financial_operations.map(operation => operation.id)).not.toContain(oldestPending)
  })
})
