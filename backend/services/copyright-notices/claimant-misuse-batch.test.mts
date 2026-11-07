import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@data-stores/psql'
import {
  countTestAppealReversalEvents,
  tryTestAdvisoryKeyLocks,
} from '@voucha/test-helpers/services/copyright-notices/batch-statements'
import { createTestUser } from '@voucha/test-helpers'
import { createTestCopyrightStaff } from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { lockAdvisoryKeysInOrder } from './advisory-key-locks.mts'
import { recordRestrictionAppealReversalEvents } from './claimant-misuse-ledger.mts'
import { reviewCopyrightFormIntake } from './index.mts'

describe('batched copyright statements', () => {
  it('records one appeal-reversal event per restriction once and ignores a replay or an empty batch', async () => {
    const claimant = await createTestUser()
    const { notice } = await createClearScreenedForm(2, { claimant })
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: await createTestCopyrightStaff(),
      is_accepted: true,
      rationale: 'The notice is complete.',
    })
    const noticeId = notice.intake.copyright_notice_id
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    const restrictionIds = (aggregate?.restrictions ?? []).map(restriction => restriction.id)
    expect(restrictionIds).toHaveLength(2)
    const input = { noticeId, restrictionIds, recordedAt: new Date() }

    await using transaction = await beginTransaction()
    await recordRestrictionAppealReversalEvents(transaction, { ...input, restrictionIds: [] })
    await recordRestrictionAppealReversalEvents(transaction, input)
    await recordRestrictionAppealReversalEvents(transaction, input)
    expect(await countTestAppealReversalEvents(transaction, noticeId)).toBe(2)
  })

  it('holds every advisory lock of a batch until the transaction ends', async () => {
    const keys = ['copyright-batch-test:b', 'copyright-batch-test:a', 'copyright-batch-test:b']
    await using holder = await beginTransaction()
    await lockAdvisoryKeysInOrder(holder, [])
    await lockAdvisoryKeysInOrder(holder, keys)

    await using contender = await beginTransaction()
    expect(
      await tryTestAdvisoryKeyLocks(contender, [
        'copyright-batch-test:a',
        'copyright-batch-test:b',
      ]),
    ).toEqual([false, false])
  })
})
