import { afterAll, describe, expect, it } from 'vitest'
import {
  readTerritorialClockColumnNames,
  readTerritorialContractTableNames,
} from '../../../test-helpers/data-stores/psql/copyright-eu-uk-contracts.mts'
import {
  rejectEuReceiptForUsNotice,
  rejectUsJurisdictionPolicyApproval,
} from '../../../test-helpers/data-stores/psql/copyright-jurisdiction-policy-writes.mts'
import { onGracefulShutdown } from '../index.mts'

describe('copyright EU and UK contract schema', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('stores the territorial contract tables without US clock columns', async () => {
    await expect(readTerritorialContractTableNames()).resolves.toEqual([
      'copyright_eu_dispute_settlement_outcomes',
      'copyright_eu_dispute_settlement_referrals',
      'copyright_eu_supervised_complaints',
      'copyright_eu_transparency_reports',
      'copyright_jurisdiction_policy_approvals',
      'copyright_jurisdiction_policy_withdrawals',
      'copyright_territorial_decisions',
      'copyright_territorial_escalations',
      'copyright_territorial_notice_acknowledgments',
      'copyright_territorial_notice_receipts',
      'copyright_territorial_notice_routings',
      'copyright_territorial_redress_decisions',
      'copyright_territorial_redress_requests',
    ])
    await expect(readTerritorialClockColumnNames()).resolves.toEqual([])
  })

  it('rejects a US DMCA jurisdiction policy approval', async () => {
    await expect(rejectUsJurisdictionPolicyApproval()).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects an EU receipt for a US DMCA notice', async () => {
    await expect(rejectEuReceiptForUsNotice()).rejects.toMatchObject({
      code: '23503',
      constraint: 'fk_copyright_territorial_notice_receipts__notice',
    })
  })
})
