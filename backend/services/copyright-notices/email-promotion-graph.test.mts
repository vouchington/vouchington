import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import { readCopyrightEmailPromotionEffects } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { seedTestCopyrightAncestorEdge } from '@voucha/test-helpers/copyright-operational-email-retention'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import {
  copyrightEmailMessageId,
  copyrightEmailPromotionInput,
  promoteInitialCopyrightEmail,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it, vi } from 'vitest'
import { copyrightConfig } from './config.mts'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'
import { readBoundedCopyrightEmailAncestorIds } from './email-thread-ancestor-graph.mts'
import { readCopyrightEmailThreadGraph } from './email-thread-graph.mts'
import { searchCopyrightStaffEmailIntakes } from './read-models-staff-email-intakes.mts'

describe('copyright email promotion graph bound', () => {
  it.each([
    { cap: 3, linked: true },
    { cap: 2, linked: false },
  ])('at cap $cap links only when the whole graph fits', async ({ cap, linked }) => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    const root = await recordThreadedCopyrightEmail({ messageId, replyReferences: [] })
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [messageId],
    })
    const restore = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      emailThreadGraphMaxRows: cap,
    })
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const promoted = await promoteCopyrightEmailIntake(
        await copyrightEmailPromotionInput(moderator, root.intakeId),
      )
      const queue = await searchCopyrightStaffEmailIntakes(moderator, {
        limit: 1,
        intakeIds: [reply.intakeId],
      })
      expect(queue.intakes).toEqual([
        expect.objectContaining({
          id: reply.intakeId,
          linked_notice_id: linked ? promoted.noticeId : null,
          review_path: linked ? 'matched_thread' : 'unresolved_thread',
        }),
      ])
      expect(log.mock.calls).toEqual(
        linked
          ? []
          : [
              [
                'copyright_email_thread_graph_overflow',
                { noticeId: promoted.noticeId, observedRows: 3 },
              ],
            ],
      )
    } finally {
      restore()
      log.mockRestore()
    }
  })

  it('keeps the same case and unlinked reply when an over-budget promotion is replayed', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    const root = await recordThreadedCopyrightEmail({ messageId, replyReferences: [] })
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [messageId, copyrightEmailMessageId(), copyrightEmailMessageId()],
    })
    const restore = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      emailThreadGraphMaxRows: 3,
    })
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const input = await copyrightEmailPromotionInput(moderator, root.intakeId)
      const promoted = await promoteCopyrightEmailIntake(input)
      const before = await readCopyrightEmailPromotionEffects(
        root.intakeId,
        input.targets[0]!.placementId,
      )
      const replayed = await promoteCopyrightEmailIntake(input)
      const after = await readCopyrightEmailPromotionEffects(
        root.intakeId,
        input.targets[0]!.placementId,
      )
      expect(replayed).toEqual(promoted)
      expect(after).toEqual(before)
      expect(await readCopyrightEmailIntakeNoticeLinks(reply.intakeId)).toEqual([])
      expect(log.mock.calls).toEqual([
        ['copyright_email_thread_token_overflow', { noticeId: promoted.noticeId, observedRows: 4 }],
        ['copyright_email_thread_token_overflow', { noticeId: promoted.noticeId, observedRows: 4 }],
      ])
    } finally {
      restore()
      log.mockRestore()
    }
  })

  it('leaves every reply unlinked when a two-reply graph exceeds the cap', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    const root = await createRetentionParsedEmail('graph-cap-root', { messageId })
    const replies = [
      await createRetentionParsedEmail('graph-cap-reply-one', {
        messageId: copyrightEmailMessageId(),
        replyReferences: [messageId],
      }),
      await createRetentionParsedEmail('graph-cap-reply-two', {
        messageId: copyrightEmailMessageId(),
        replyReferences: [messageId],
      }),
    ]
    for (const reply of replies) await seedTestCopyrightAncestorEdge(reply.id, root.id)
    const restore = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      emailThreadGraphMaxRows: 3,
    })
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const promoted = await promoteCopyrightEmailIntake(
        await copyrightEmailPromotionInput(moderator, root.id),
      )
      const queue = await searchCopyrightStaffEmailIntakes(moderator, {
        limit: 2,
        intakeIds: replies.map(reply => reply.id),
      })
      expect(queue.intakes.map(row => [row.linked_notice_id, row.review_path])).toEqual([
        [null, 'unresolved_thread'],
        [null, 'unresolved_thread'],
      ])
      expect(log.mock.calls).toEqual([
        ['copyright_email_thread_graph_overflow', { noticeId: promoted.noticeId, observedRows: 5 }],
      ])
    } finally {
      restore()
      log.mockRestore()
    }
  })

  it('counts a cycle once per intake and edge, without revisiting the same intake', async () => {
    const firstMessageId = copyrightEmailMessageId()
    const secondMessageId = copyrightEmailMessageId()
    const first = await recordThreadedCopyrightEmail({
      messageId: firstMessageId,
      replyReferences: [secondMessageId],
    })
    const second = await recordThreadedCopyrightEmail({
      messageId: secondMessageId,
      replyReferences: [firstMessageId],
    })
    await using transaction = await beginTransaction()
    const graph = await readCopyrightEmailThreadGraph(transaction, first.intakeId, 4)
    await transaction.commit()
    expect(graph).toMatchObject({ overflow: false, observedRows: 4 })
    expect(graph.intakeIds.toSorted()).toEqual([first.intakeId, second.intakeId].toSorted())
    expect(graph.edges).toHaveLength(2)
  })

  it('counts a descendant’s outside ancestor before its notice can be linked', async () => {
    const rootMessageId = copyrightEmailMessageId()
    const outsideMessageId = copyrightEmailMessageId()
    const root = await recordThreadedCopyrightEmail({
      messageId: rootMessageId,
      replyReferences: [],
    })
    const outside = await recordThreadedCopyrightEmail({
      messageId: outsideMessageId,
      replyReferences: [],
    })
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [rootMessageId, outsideMessageId],
    })
    await using transaction = await beginTransaction()
    const exact = await readCopyrightEmailThreadGraph(transaction, root.intakeId, 5)
    const over = await readCopyrightEmailThreadGraph(transaction, root.intakeId, 4)
    await transaction.commit()

    expect(exact).toMatchObject({ overflow: false, observedRows: 5 })
    expect(exact.descendantIntakeIds).toEqual([root.intakeId, reply.intakeId].toSorted())
    expect(exact.intakeIds).toEqual([root.intakeId, outside.intakeId, reply.intakeId].toSorted())
    expect(exact.edges).toHaveLength(2)
    expect(over.overflow).toBe(true)
  })

  it('reads a chain in two graph queries and bounds the reverse ancestor walk', async () => {
    const rootMessageId = copyrightEmailMessageId()
    const childMessageId = copyrightEmailMessageId()
    const root = await recordThreadedCopyrightEmail({
      messageId: rootMessageId,
      replyReferences: [],
    })
    const child = await recordThreadedCopyrightEmail({
      messageId: childMessageId,
      replyReferences: [rootMessageId],
    })
    const grandchild = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [childMessageId],
    })
    await using transaction = await beginTransaction()
    let queryCount = 0
    const counted = new Proxy(transaction, {
      apply(target, thisArg, args) {
        queryCount += 1
        return Reflect.apply(target, thisArg, args)
      },
    })
    const graph = await readCopyrightEmailThreadGraph(counted, root.intakeId, 5)
    expect(graph).toMatchObject({ overflow: false, observedRows: 5 })
    expect(graph.descendantIntakeIds).toEqual(
      [root.intakeId, child.intakeId, grandchild.intakeId].toSorted(),
    )
    expect(queryCount).toBe(2)
    expect(await readBoundedCopyrightEmailAncestorIds(transaction, grandchild.intakeId, 5)).toEqual(
      [root.intakeId, child.intakeId].toSorted(),
    )
    expect(
      await readBoundedCopyrightEmailAncestorIds(transaction, grandchild.intakeId, 4),
    ).toBeNull()
    await transaction.commit()
  })

  it('leaves an over-budget inbound ancestor chain unlinked at receipt', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const rootMessageId = copyrightEmailMessageId()
    const childMessageId = copyrightEmailMessageId()
    const root = await promoteInitialCopyrightEmail({ moderator, messageId: rootMessageId })
    const child = await recordThreadedCopyrightEmail({
      messageId: childMessageId,
      replyReferences: [rootMessageId],
    })
    expect(child.match?.noticeId).toBe(root.noticeId)
    const restore = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      emailThreadGraphMaxRows: 4,
    })
    try {
      const grandchild = await recordThreadedCopyrightEmail({
        messageId: copyrightEmailMessageId(),
        replyReferences: [childMessageId],
      })
      expect(grandchild.match).toBeNull()
      const queue = await searchCopyrightStaffEmailIntakes(moderator, {
        limit: 1,
        intakeIds: [grandchild.intakeId],
      })
      expect(queue.intakes[0]).toMatchObject({
        linked_notice_id: null,
        review_path: 'unresolved_thread',
      })
    } finally {
      restore()
    }
  })
})
