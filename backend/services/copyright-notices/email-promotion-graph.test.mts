import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import {
  readCopyrightEmailAncestorIds,
  lockTestCopyrightEmailIntakeForGraphChange,
} from '@voucha/test-helpers/copyright-email-ancestor-edges'
import { createUnparsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  readCopyrightEmailIntakeNoticeLinks,
  readCopyrightEmailIntakeReview,
} from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  copyrightEmailMessageId,
  copyrightEmailPromotionInput,
  promoteInitialCopyrightEmail,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it, vi } from 'vitest'
import { installSharedDbScopeObserver } from '../../../test-helpers/vitest-shared-db-scope-observer.mts'
import {
  insertCopyrightEmailThreadReferences,
  lockCopyrightEmailThreadTokens,
  recordCopyrightEmailAncestorEdges,
} from './email-thread-ancestors.mts'
import { buildCopyrightEmailThreadReferenceRows } from './email-thread-references.mts'
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

  it('rejects a new edge committed between the graph read and intake locks, then accepts retry', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const root = await createUnparsedCopyrightEmailIntake()
    const messageId = copyrightEmailMessageId()
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [messageId],
    })
    const referenceRows = buildCopyrightEmailThreadReferenceRows({
      messageId,
      inReplyTo: [],
      references: [],
    })
    await using ingestion = await beginTransaction()
    await lockCopyrightEmailThreadTokens(ingestion, [referenceRows[0]!.lookup_digest])
    await insertCopyrightEmailThreadReferences(ingestion, root.id, referenceRows)
    await recordCopyrightEmailAncestorEdges(ingestion, root.id)
    await lockTestCopyrightEmailIntakeForGraphChange(root.id, ingestion)

    let graphRead!: () => void
    const reachedGraphRead = new Promise<void>(resolve => {
      graphRead = resolve
    })
    const dispose = installSharedDbScopeObserver(event => {
      if (
        event.operation === 'promoteCopyrightEmailIntakeGraph' &&
        event.scope.kind === 'ids' &&
        event.scope.ids[0] === root.id
      )
        graphRead()
    })
    const input = await copyrightEmailPromotionInput(moderator, root.id)
    try {
      const promotion = promoteCopyrightEmailIntake(input).then(
        () => new Error('Promotion unexpectedly succeeded during a graph change'),
        err => err,
      )
      await reachedGraphRead
      await ingestion.commit()
      expect(await promotion).toMatchObject({
        status: 409,
        code: 'copyright_email_thread_changed',
      })
    } finally {
      dispose()
    }
    await expect(readCopyrightEmailIntakeReview(root.id)).resolves.toEqual([])
    await expect(readCopyrightEmailIntakeNoticeLinks(root.id)).resolves.toEqual([])
    await expect(readCopyrightEmailIntakeNoticeLinks(reply.intakeId)).resolves.toEqual([])
    await expect(readCopyrightEmailAncestorIds(reply.intakeId)).resolves.toEqual([root.id])

    const promoted = await promoteCopyrightEmailIntake(input)
    const queue = await searchCopyrightStaffEmailIntakes(moderator, {
      limit: 1,
      intakeIds: [reply.intakeId],
    })
    expect(queue.intakes[0]).toMatchObject({
      linked_notice_id: promoted.noticeId,
      review_path: 'matched_thread',
    })
  })

  it('leaves every reply unlinked when a two-reply graph exceeds the cap', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    const root = await recordThreadedCopyrightEmail({ messageId, replyReferences: [] })
    const replies = await Promise.all([
      recordThreadedCopyrightEmail({
        messageId: copyrightEmailMessageId(),
        replyReferences: [messageId],
      }),
      recordThreadedCopyrightEmail({
        messageId: copyrightEmailMessageId(),
        replyReferences: [messageId],
      }),
    ])
    const restore = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      emailThreadGraphMaxRows: 3,
    })
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const promoted = await promoteCopyrightEmailIntake(
        await copyrightEmailPromotionInput(moderator, root.intakeId),
      )
      const queue = await searchCopyrightStaffEmailIntakes(moderator, {
        limit: 2,
        intakeIds: replies.map(reply => reply.intakeId),
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

  it('counts and locks a descendant’s outside ancestor before its notice can be linked', async () => {
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
