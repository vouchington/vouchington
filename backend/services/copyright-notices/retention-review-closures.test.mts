import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { readTestCopyrightGuestEventClocks } from '@voucha/test-helpers/copyright-guest-filing-constraints'
import { receiveEuCopyrightNotice } from './eu-notice-receipt.mts'
import { recordEuCopyrightSupervisedComplaint } from './eu-supervised-complaint.mts'
import { recordCopyrightJurisdictionPolicyApproval } from './jurisdiction-policy.mts'
import {
  closeCopyrightTerritorialEscalation,
  resolveCopyrightEuSupervisedComplaint,
} from './retention-review-closures.mts'

describe('copyright review closure replay', () => {
  it('persists both explicit closures and replays them without advancing the case clocks', async () => {
    const [claimant, staff, administrator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
    const suffix = crypto.randomUUID()
    await recordCopyrightJurisdictionPolicyApproval(administrator, {
      jurisdiction: 'eu_dsa',
      policyVersion: `eu-${suffix.slice(0, 12)}`,
    })
    const receipt = await receiveEuCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      suffix,
      {
        contact: `claimant-${suffix}@example.test`,
        contentDescription: `Work ${suffix}`,
        grounds: `Grounds ${suffix}`,
        hostedUseUrl: `https://example.test/${suffix}`,
        notifierName: `Notifier ${suffix}`,
        notifierEmail: `notifier-${suffix}@example.test`,
        goodFaithStatement: true,
      },
    )
    const complaint = await recordEuCopyrightSupervisedComplaint(claimant, receipt.notice_id, {
      idempotencyKey: crypto.randomUUID(),
      authorityReference: `DSC-${suffix}`,
      explanation: 'Complaint filed with the authority',
    })
    const closed = await closeCopyrightTerritorialEscalation(
      staff,
      receipt.notice_id,
      complaint.escalation_id,
    )
    expect(closed.closed_at).toBeInstanceOf(Date)
    const closedClock = await readTestCopyrightGuestEventClocks(receipt.notice_id)
    await expect(
      closeCopyrightTerritorialEscalation(staff, receipt.notice_id, complaint.escalation_id),
    ).resolves.toEqual(closed)
    expect(await readTestCopyrightGuestEventClocks(receipt.notice_id)).toEqual(closedClock)
    const resolved = await resolveCopyrightEuSupervisedComplaint(
      staff,
      receipt.notice_id,
      complaint.id,
    )
    expect(resolved.resolved_at).toBeInstanceOf(Date)
    const resolvedClock = await readTestCopyrightGuestEventClocks(receipt.notice_id)
    await expect(
      resolveCopyrightEuSupervisedComplaint(staff, receipt.notice_id, complaint.id),
    ).resolves.toEqual(resolved)
    expect(await readTestCopyrightGuestEventClocks(receipt.notice_id)).toEqual(resolvedClock)
  })
})
