import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { seedPendingTerritorialNotice } from '@voucha/test-helpers/services/copyright-notices/territorial-routes'
import { seedCommittedEuAcknowledgment } from '@voucha/test-helpers/copyright-eu-committed-decision'
import { assertEuStaffStatementOutcome } from '@voucha/test-helpers/copyright-eu-statement-outcome'
import { recordEuCopyrightStatementOfReasons } from './eu-reasons.mts'

describe('atomic EU staff statements', () => {
  it('commits all human statement authority and deliveries or rolls every stage back on native conflict', async () => {
    const [claimant, staff, stranger] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser(),
    ])
    const noticeId = await seedPendingTerritorialNotice('eu_dsa', claimant)
    await seedCommittedEuAcknowledgment(noticeId)
    await expect(
      recordEuCopyrightStatementOfReasons(stranger, noticeId, {
        text: 'Not authorized',
        publicExplanation: 'No action taken.',
        outcome: 'no_action',
        targets: [],
      }),
    ).rejects.toMatchObject({ status: 403 })
    await assertEuStaffStatementOutcome(staff, claimant.id, noticeId)
  })
})
