import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createHostedImagePost } from '@voucha/test-helpers/services/copyright-notices/hosted-post-audience'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  createWithdrawalContinuation,
  completeWithdrawalContinuation,
} from '@voucha/test-helpers/copyright-withdrawal-owned-inputs'
import { readCopyrightTerritorialContractShape } from '@voucha/test-helpers/data-stores/psql/copyright-eu-uk-contracts'
import {
  recordCopyrightJurisdictionPolicyApproval,
  withdrawCopyrightJurisdictionPolicyApproval,
} from './index.mts'

describe('EU approval withdrawal preserves committed continuation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('preserves EU statements and restrictions through committed continuation after withdrawal', async () => {
    installTestMediaDeliveryEdge()
    const [administrator, staff, claimant, euContinuationImage] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser(),
      createHostedImagePost('public'),
    ])
    const euApproval = await recordCopyrightJurisdictionPolicyApproval(administrator, {
      jurisdiction: 'eu_dsa',
      policyVersion: `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    })
    const { euContinuation, continuationComplaint } = await createWithdrawalContinuation(
      claimant,
      staff,
    )
    await withdrawCopyrightJurisdictionPolicyApproval(administrator, euApproval.id)
    await completeWithdrawalContinuation(
      staff,
      euContinuation.notice_id,
      continuationComplaint.id,
      euContinuationImage,
    )
    await expect(
      readCopyrightTerritorialContractShape(euContinuation.notice_id),
    ).resolves.toMatchObject({
      eu_statement_count: 2,
      target_count: 1,
    })
    expect(
      (await getCopyrightNoticePrivateAggregate(euContinuation.notice_id))?.restrictions,
    ).toHaveLength(1)
  })
})
