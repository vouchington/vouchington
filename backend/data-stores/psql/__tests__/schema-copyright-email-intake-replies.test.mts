import { afterAll, describe, expect, it } from 'vitest'
import {
  createCopyrightEmailIntakeReplyRow,
  createCopyrightEmailIntakeReceiptRow,
  createCopyrightEmailIntakeRow,
  rejectReplyBodyMutation,
  rejectReplyDeletion,
  rejectReplyInApp,
  rejectReplyIntakeReassignment,
  rejectReplyOwnedByNobody,
  rejectReplyOwnedByNoticeAndIntake,
  rejectReplyToClaimant,
  rejectReplyWithCaseDeliveryKind,
  rejectReplyWithoutBody,
  rejectSameReplyKindForIntake,
} from '../../../test-helpers/data-stores/psql/copyright-email-intake-reply-schema.mts'
import { onGracefulShutdown } from '../index.mts'

const checkViolation = { code: '23514' }

describe('copyright email intake reply delivery intents', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it.each([
    ['belongs to neither a case nor an intake', rejectReplyOwnedByNobody],
    ['belongs to both a case and an intake', rejectReplyOwnedByNoticeAndIntake],
    ['uses a case delivery kind', rejectReplyWithCaseDeliveryKind],
    ['has no stored body', rejectReplyWithoutBody],
    ['is addressed to a claimant', rejectReplyToClaimant],
    ['is delivered in-app', rejectReplyInApp],
  ] as const)('refuses a reply that %s', async (_name, insert) => {
    const intakeId = await createCopyrightEmailIntakeRow()
    await expect(insert(intakeId)).rejects.toMatchObject(checkViolation)
  })

  it('allows one receipt and reply but rejects the same kind twice', async () => {
    const intakeId = await createCopyrightEmailIntakeRow()
    await createCopyrightEmailIntakeReplyRow(intakeId)
    await createCopyrightEmailIntakeReceiptRow(intakeId)
    await expect(rejectSameReplyKindForIntake(intakeId)).rejects.toMatchObject({ code: '23505' })
  })

  it('keeps the intake and the stored body of a reply immutable, and the reply retained', async () => {
    const intakeId = await createCopyrightEmailIntakeRow()
    const otherIntakeId = await createCopyrightEmailIntakeRow()
    const intentId = await createCopyrightEmailIntakeReplyRow(intakeId)

    await expect(rejectReplyIntakeReassignment(intentId, otherIntakeId)).rejects.toMatchObject({
      ...checkViolation,
      message: 'copyright delivery intent facts are immutable',
    })
    await expect(rejectReplyBodyMutation(intentId)).rejects.toMatchObject({
      ...checkViolation,
      message: 'copyright delivery intent facts are immutable',
    })
    await expect(rejectReplyDeletion(intentId)).rejects.toMatchObject({
      ...checkViolation,
      message: 'copyright delivery intents are retained',
    })
  })
})
