import { createCopyrightPromotionRootReplyScene } from '@voucha/test-helpers/copyright-promotion-graph-fixtures'
import {
  seedCopyrightPromotionThreadEmail,
  seedCopyrightPromotionThreadSource,
} from '@voucha/test-helpers/copyright-promotion-thread-fixtures'
import {
  ownedCopyrightEmailPromotionInput,
  seedCommittedCopyrightPromotion,
} from '@voucha/test-helpers/copyright-promotion-committed-fixtures'
import {
  assertCopyrightPromotionOutcome,
  assertCopyrightPromotionReplay,
} from '@voucha/test-helpers/copyright-email-promotion-outcomes'
import { assertOverBudgetCopyrightReceipt } from '@voucha/test-helpers/copyright-promotion-receipt-outcome'
import { createCommittedCopyrightEmailCase } from '@voucha/test-helpers/copyright-committed-email-case'
import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import { readCopyrightEmailPromotionEffects } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { seedTestCopyrightAncestorEdge } from '@voucha/test-helpers/copyright-operational-email-retention'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { copyrightEmailMessageId } from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it, vi } from 'vitest'
import { copyrightConfig } from './config.mts'
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
    const root = await seedCopyrightPromotionThreadEmail({ messageId, replyReferences: [] })
    const reply = await seedCopyrightPromotionThreadEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [messageId],
    })
    const restore = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      emailThreadGraphMaxRows: cap,
    })
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      await assertCopyrightPromotionOutcome(
        {
          input: await ownedCopyrightEmailPromotionInput(moderator, root.intakeId),
          intakeIds: [root.intakeId, reply.intakeId],
        },
        {
          linkedDescendantIds: linked ? [reply.intakeId] : [],
          logs: () => log.mock.calls,
          ...(linked
            ? {}
            : { overflow: { event: 'copyright_email_thread_graph_overflow', observedRows: 3 } }),
        },
      )
      // An independent committed graph always exercises the queue classification after a decision.
      const committed = await createCopyrightPromotionRootReplyScene(moderator)
      const promoted = await seedCommittedCopyrightPromotion(committed.input)
      const queue = await searchCopyrightStaffEmailIntakes(moderator, {
        limit: 1,
        intakeIds: [committed.reply.intakeId],
      })
      expect(queue.intakes).toEqual([
        expect.objectContaining({
          id: committed.reply.intakeId,
          linked_notice_id: linked ? promoted.noticeId : null,
          review_path: linked ? 'matched_thread' : 'unresolved_thread',
        }),
      ])
    } finally {
      restore()
      log.mockRestore()
    }
  })

  it('keeps the same case and unlinked reply when an over-budget promotion is replayed', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    const root = await seedCopyrightPromotionThreadEmail({ messageId, replyReferences: [] })
    const reply = await seedCopyrightPromotionThreadEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [messageId, copyrightEmailMessageId(), copyrightEmailMessageId()],
    })
    const restore = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      emailThreadGraphMaxRows: 3,
    })
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const input = await ownedCopyrightEmailPromotionInput(moderator, root.intakeId)
      await assertCopyrightPromotionOutcome(
        { input, intakeIds: [root.intakeId, reply.intakeId] },
        {
          logs: () => log.mock.calls,
          overflow: { event: 'copyright_email_thread_token_overflow', observedRows: 4 },
        },
      )
      const replayLogStart = log.mock.calls.length
      const committed = await createCopyrightPromotionRootReplyScene(moderator, true)
      const promoted = await seedCommittedCopyrightPromotion(committed.input)
      const before = await readCopyrightEmailPromotionEffects(
        committed.root.intakeId,
        committed.input.targets[0]!.placementId,
      )
      await assertCopyrightPromotionReplay(
        { input: committed.input, intakeIds: [committed.root.intakeId, committed.reply.intakeId] },
        promoted,
        () => log.mock.calls.slice(replayLogStart),
        { event: 'copyright_email_thread_token_overflow', observedRows: 4 },
      )
      expect(
        await readCopyrightEmailPromotionEffects(
          committed.root.intakeId,
          committed.input.targets[0]!.placementId,
        ),
      ).toEqual(before)
      expect(await readCopyrightEmailIntakeNoticeLinks(committed.reply.intakeId)).toEqual([])
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
      await assertCopyrightPromotionOutcome(
        {
          input: await ownedCopyrightEmailPromotionInput(moderator, root.id),
          intakeIds: [root.id, ...replies.map(reply => reply.id)],
        },
        {
          logs: () => log.mock.calls,
          overflow: { event: 'copyright_email_thread_graph_overflow', observedRows: 5 },
        },
      )
      const queue = await searchCopyrightStaffEmailIntakes(moderator, {
        limit: 2,
        intakeIds: replies.map(reply => reply.id),
      })
      expect(queue.intakes.map(row => [row.linked_notice_id, row.review_path])).toEqual([
        [null, 'unresolved_thread'],
        [null, 'unresolved_thread'],
      ])
    } finally {
      restore()
      log.mockRestore()
    }
  })

  it('counts a cycle once per intake and edge, without revisiting the same intake', async () => {
    const firstMessageId = copyrightEmailMessageId()
    const secondMessageId = copyrightEmailMessageId()
    const first = await seedCopyrightPromotionThreadEmail({
      messageId: firstMessageId,
      replyReferences: [secondMessageId],
    })
    const second = await seedCopyrightPromotionThreadEmail({
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
    const root = await seedCopyrightPromotionThreadEmail({
      messageId: rootMessageId,
      replyReferences: [],
    })
    const outside = await seedCopyrightPromotionThreadEmail({
      messageId: outsideMessageId,
      replyReferences: [],
    })
    const reply = await seedCopyrightPromotionThreadEmail({
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
    const root = await seedCopyrightPromotionThreadEmail({
      messageId: rootMessageId,
      replyReferences: [],
    })
    const child = await seedCopyrightPromotionThreadEmail({
      messageId: childMessageId,
      replyReferences: [rootMessageId],
    })
    const grandchild = await seedCopyrightPromotionThreadEmail({
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
    const root = await createCommittedCopyrightEmailCase({ moderator, messageId: rootMessageId })
    const child = await seedCopyrightPromotionThreadEmail({
      messageId: childMessageId,
      replyReferences: [rootMessageId],
    })
    expect(child.match?.noticeId).toBe(root.noticeId)
    const restore = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      emailThreadGraphMaxRows: 4,
    })
    try {
      const grandchild = await seedCopyrightPromotionThreadSource({
        messageId: copyrightEmailMessageId(),
        replyReferences: [childMessageId],
      })
      await assertOverBudgetCopyrightReceipt(
        {
          input: await ownedCopyrightEmailPromotionInput(moderator, grandchild.intakeId),
          intakeIds: [root.intakeId, child.intakeId, grandchild.intakeId],
          parentNoticeIds: [root.noticeId],
        },
        grandchild,
        child.intakeId,
      )
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
