import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import { createCopyrightNoticeForManualAssociation } from '@voucha/test-helpers/copyright-email-manual-association'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  copyrightEmailMessageId,
  copyrightEmailPromotionInput,
  promoteInitialCopyrightEmail,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it } from 'vitest'
import { associateCopyrightEmailIntakeWithNotice } from './email-manual-association.mts'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'
import {
  readCopyrightEmailGraphTokens,
  readCopyrightEmailThreadGraph,
} from './email-thread-graph.mts'
import { linkCopyrightEmailIntakeToNotice } from './email-threading.mts'
import { searchCopyrightStaffEmailIntakes } from './read-models-staff-email-intakes.mts'

describe('copyright email graph review boundaries', () => {
  it('keeps a reply manual when an outside ancestor two edges away belongs to another case', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const rootMessageId = copyrightEmailMessageId()
    const middleMessageId = copyrightEmailMessageId()
    const outsideMessageId = copyrightEmailMessageId()
    const outside = await recordThreadedCopyrightEmail({
      messageId: outsideMessageId,
      replyReferences: [],
    })
    const middle = await recordThreadedCopyrightEmail({
      messageId: middleMessageId,
      replyReferences: [outsideMessageId],
    })
    const root = await promoteInitialCopyrightEmail({ moderator, messageId: rootMessageId })
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [rootMessageId, middleMessageId],
    })
    expect(reply.match).toBeNull()
    await associateCopyrightEmailIntakeWithNotice(moderator, middle.intakeId, root.noticeId)
    await promoteCopyrightEmailIntake(
      await copyrightEmailPromotionInput(moderator, outside.intakeId),
    )

    await using transaction = await beginTransaction()
    const graph = await readCopyrightEmailThreadGraph(transaction, root.intakeId, 7)
    const over = await readCopyrightEmailThreadGraph(transaction, root.intakeId, 6)
    await transaction.commit()
    expect(graph).toMatchObject({ overflow: false, observedRows: 7 })
    expect(over.overflow).toBe(true)
    expect(graph.intakeIds).toContain(outside.intakeId)

    await promoteCopyrightEmailIntake(await copyrightEmailPromotionInput(moderator, root.intakeId))
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.intakeId)).toEqual([])
    const queue = await searchCopyrightStaffEmailIntakes(moderator, {
      limit: 1,
      intakeIds: [reply.intakeId],
    })
    expect(queue.intakes[0]).toMatchObject({
      linked_notice_id: null,
      review_path: 'ancestor_notice_conflict',
    })
  })

  it('keeps a recorded ancestor edge when its reply Message-ID gains a second claimant', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const rootMessageId = copyrightEmailMessageId()
    const replyMessageId = copyrightEmailMessageId()
    const root = await recordThreadedCopyrightEmail({
      messageId: rootMessageId,
      replyReferences: [],
    })
    const reply = await recordThreadedCopyrightEmail({
      messageId: replyMessageId,
      replyReferences: [rootMessageId],
    })
    const secondClaimant = await recordThreadedCopyrightEmail({
      messageId: replyMessageId,
      replyReferences: [],
    })

    const promoted = await promoteCopyrightEmailIntake(
      await copyrightEmailPromotionInput(moderator, root.intakeId),
    )
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.intakeId)).toEqual([
      { copyright_notice_id: promoted.noticeId, link_kind: 'thread' },
    ])
    const queue = await searchCopyrightStaffEmailIntakes(moderator, {
      limit: 1,
      intakeIds: [reply.intakeId],
    })
    expect(queue.intakes[0]).toMatchObject({
      linked_notice_id: promoted.noticeId,
      review_path: 'matched_thread',
    })
    expect(await readCopyrightEmailIntakeNoticeLinks(secondClaimant.intakeId)).toEqual([])
    const secondQueue = await searchCopyrightStaffEmailIntakes(moderator, {
      limit: 1,
      intakeIds: [secondClaimant.intakeId],
    })
    expect(secondQueue.intakes[0]).toMatchObject({
      linked_notice_id: null,
      review_path: 'duplicate_message_id',
    })
  })

  it('caps the combined unique reference and matched-link token set', async () => {
    const intake = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [],
    })
    const noticeId = await createCopyrightNoticeForManualAssociation()
    await linkCopyrightEmailIntakeToNotice({
      intakeId: intake.intakeId,
      noticeId,
      linkKind: 'thread',
      matchedReference: copyrightEmailMessageId(),
    })
    await using transaction = await beginTransaction()
    const tokens = await readCopyrightEmailGraphTokens(transaction, [intake.intakeId], 1)
    const exact = await readCopyrightEmailGraphTokens(transaction, [intake.intakeId], 2)
    await transaction.commit()
    expect(tokens.overflow).toBe(true)
    expect(tokens.digests).toHaveLength(2)
    expect(exact).toEqual({ digests: tokens.digests, overflow: false })
  })
})
