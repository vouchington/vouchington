import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  readOwnedPolicyWithdrawals,
  exercisePolicyWithdrawalReservation,
} from '@voucha/test-helpers/copyright-policy-withdrawal-contention'
import {
  recordCopyrightJurisdictionPolicyApproval,
  withdrawCopyrightJurisdictionPolicyApproval,
} from './jurisdiction-policy.mts'

async function fixture() {
  const administrator = await createTestUser({ administrator: true })
  let approvalId: string | undefined
  onTestFinished(async () => {
    if (approvalId && (await readOwnedPolicyWithdrawals(approvalId)).length === 0)
      await withdrawCopyrightJurisdictionPolicyApproval(administrator, approvalId)
  })
  const approval = await recordCopyrightJurisdictionPolicyApproval(administrator, {
    jurisdiction: 'eu_dsa',
    policyVersion: `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
  })
  approvalId = approval.id
  return { administrator, approval }
}

describe('copyright policy withdrawal concurrency', () => {
  it('commits one concurrent withdrawal and rejects its sibling with the real 409', async () => {
    const { administrator, approval } = await fixture()
    const outcomes = await Promise.allSettled([
      withdrawCopyrightJurisdictionPolicyApproval(administrator, approval.id),
      withdrawCopyrightJurisdictionPolicyApproval(administrator, approval.id),
    ])
    const accepted = outcomes.filter(outcome => outcome.status === 'fulfilled')
    const rejected = outcomes.filter(outcome => outcome.status === 'rejected')
    expect(accepted).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toMatchObject({ status: 409 })
    const rows = await readOwnedPolicyWithdrawals(approval.id)
    expect(rows).toHaveLength(1)
    expect(accepted[0]?.value).toEqual({ id: rows[0]?.id })
  })

  it('allows a real reservation FK insert while withdrawal holds its approval and rolls it back', async () => {
    const { administrator, approval } = await fixture()
    const result = await exercisePolicyWithdrawalReservation(administrator, approval.id)
    expect(result.reserved.approval_id).toBe(approval.id)
    expect(result.reserved.id).not.toBe(result.withdrawal.id)
    expect(result.rows).toEqual([{ id: result.withdrawal.id }])
  })
})
