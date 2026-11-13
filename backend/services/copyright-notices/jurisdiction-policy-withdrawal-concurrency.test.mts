import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  readOwnedPolicyWithdrawals,
  readOwnedPolicyApprovals,
  receiveOwnedCopyrightPolicyReceipt,
  readOwnedCopyrightPolicyReceipt,
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
  it('records one owned policy version and rejects its concurrent duplicate', async () => {
    const administrator = await createTestUser({ administrator: true })
    const policyVersion = `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
    const outcomes = await Promise.allSettled([
      recordCopyrightJurisdictionPolicyApproval(administrator, {
        jurisdiction: 'eu_dsa',
        policyVersion,
      }),
      recordCopyrightJurisdictionPolicyApproval(administrator, {
        jurisdiction: 'eu_dsa',
        policyVersion,
      }),
    ])
    const rows = await readOwnedPolicyApprovals(policyVersion)
    onTestFinished(async () => {
      for (const row of rows)
        await withdrawCopyrightJurisdictionPolicyApproval(administrator, row.id)
    })
    expect(rows).toHaveLength(1)
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toEqual([
      {
        status: 'fulfilled',
        value: { id: rows[0]?.id, jurisdiction: 'eu_dsa', policy_version: policyVersion },
      },
    ])
    const failures = outcomes.filter(outcome => outcome.status === 'rejected')
    expect(failures).toHaveLength(1)
    expect(failures[0]?.reason).toMatchObject({
      status: 409,
      message: 'That policy version is already recorded',
    })
  })

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

  it('admits its receipt when approval was active at the read even if withdrawal commits before receipt', async () => {
    const { administrator, approval } = await fixture()
    const claimant = await createTestUser()
    let withdrawalId: string | undefined
    const receipt = await receiveOwnedCopyrightPolicyReceipt(claimant, approval.id, async () => {
      const withdrawal = await withdrawCopyrightJurisdictionPolicyApproval(
        administrator,
        approval.id,
      )
      withdrawalId = withdrawal.id
    })
    expect(receipt).toMatchObject({ is_duplicate: false, route_destination: 'staff_queue' })
    expect(withdrawalId).toEqual(expect.any(String))
    expect(await readOwnedCopyrightPolicyReceipt(receipt.notice_id)).toEqual([
      { approval_id: approval.id },
    ])
    expect(await readOwnedPolicyWithdrawals(approval.id)).toEqual([{ id: withdrawalId }])
    await expect(receiveOwnedCopyrightPolicyReceipt(claimant, approval.id)).rejects.toMatchObject({
      status: 403,
      message: 'EU copyright notices are not available',
    })
  })

  it('preserves a committed receipt and rejects new intake after its owned approval is withdrawn', async () => {
    const { administrator, approval } = await fixture()
    const claimant = await createTestUser()
    const receipt = await receiveOwnedCopyrightPolicyReceipt(claimant, approval.id)
    const withdrawal = await withdrawCopyrightJurisdictionPolicyApproval(administrator, approval.id)
    await expect(receiveOwnedCopyrightPolicyReceipt(claimant, approval.id)).rejects.toMatchObject({
      status: 403,
      message: 'EU copyright notices are not available',
    })
    expect(await readOwnedCopyrightPolicyReceipt(receipt.notice_id)).toEqual([
      { approval_id: approval.id },
    ])
    expect(await readOwnedPolicyWithdrawals(approval.id)).toEqual([{ id: withdrawal.id }])
  })
})
