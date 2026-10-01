import { afterAll, describe, expect, it } from 'vitest'
import {
  createCopyrightEmailIntakeReplyRow,
  createCopyrightEmailIntakeRow,
} from '../../../test-helpers/data-stores/psql/copyright-email-intake-reply-schema.mts'
import {
  createCopyrightCaseDeliveryIntentRow,
  insertCaselessReplayEvent,
  rejectCaseReplayOfIntakeReply,
  rejectCaselessEventOfAnotherType,
  rejectCaselessEventWithoutSource,
} from '../../../test-helpers/data-stores/psql/copyright-email-intake-reply-events-schema.mts'
import { onGracefulShutdown } from '../index.mts'

const checkViolation = { code: '23514' }
const wrongOwner = {
  ...checkViolation,
  message: 'lifecycle delivery intent belongs to another notice',
}

describe('lifecycle events for a replayed email intake reply', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('records a replay that belongs to no case against the reply', async () => {
    const intentId = await createCopyrightEmailIntakeReplyRow(await createCopyrightEmailIntakeRow())
    await expect(insertCaselessReplayEvent(intentId)).resolves.toMatchObject({ rowCount: 1 })
  })

  it('refuses a caseless event that is not a delivery replay', async () => {
    await expect(rejectCaselessEventWithoutSource()).rejects.toMatchObject({
      ...checkViolation,
      constraint: 'copyright_lifecycle_event_notice_scope',
    })
    await expect(
      rejectCaselessEventOfAnotherType(await createCopyrightEmailIntakeRow()),
    ).rejects.toMatchObject(checkViolation)
  })

  it('keeps a replay on the side of the case or the intake that owns the delivery', async () => {
    const replyId = await createCopyrightEmailIntakeReplyRow(await createCopyrightEmailIntakeRow())
    const caseDelivery = await createCopyrightCaseDeliveryIntentRow()

    await expect(insertCaselessReplayEvent(caseDelivery.intentId)).rejects.toMatchObject(wrongOwner)
    await expect(
      rejectCaseReplayOfIntakeReply(caseDelivery.noticeId, replyId),
    ).rejects.toMatchObject(wrongOwner)
  })
})
