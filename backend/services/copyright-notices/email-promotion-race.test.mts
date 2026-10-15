import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import {
  createUnparsedCopyrightEmailIntake,
  readCopyrightEmailPromotionEffects,
} from '@voucha/test-helpers/copyright-email-intake-fixtures'
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
import { describe, expect, it } from 'vitest'
import { installSharedDbScopeObserver } from '../../../test-helpers/vitest-shared-db-scope-observer.mts'
import {
  insertCopyrightEmailThreadReferences,
  lockCopyrightEmailThreadTokens,
  recordCopyrightEmailAncestorEdges,
} from './email-thread-ancestors.mts'
import { buildCopyrightEmailThreadReferenceRows } from './email-thread-references.mts'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'
import { linkCopyrightEmailIntakeToNotice } from './email-threading.mts'

describe('copyright email promotion and threading serialization', () => {
  it('waits for a pending ancestor token claim before locking or linking its descendant', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const rootMessageId = copyrightEmailMessageId()
    const pendingMessageId = copyrightEmailMessageId()
    const root = await recordThreadedCopyrightEmail({
      messageId: rootMessageId,
      replyReferences: [],
    })
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [rootMessageId, pendingMessageId],
    })
    const claimant = await createUnparsedCopyrightEmailIntake()
    const referenceRows = buildCopyrightEmailThreadReferenceRows({
      messageId: pendingMessageId,
      inReplyTo: [],
      references: [],
    })
    await using ingestion = await beginTransaction()
    await lockCopyrightEmailThreadTokens(ingestion, [referenceRows[0]!.lookup_digest])
    await insertCopyrightEmailThreadReferences(ingestion, claimant.id, referenceRows)

    let graphRead!: () => void
    let graphLocked!: () => void
    const reachedGraphRead = new Promise<void>(resolve => {
      graphRead = resolve
    })
    const reachedGraphLock = new Promise<void>(resolve => {
      graphLocked = resolve
    })
    const dispose = installSharedDbScopeObserver(event => {
      if (event.scope.kind !== 'ids' || event.scope.ids[0] !== root.intakeId) return
      if (event.operation === 'promoteCopyrightEmailIntakeGraph') graphRead()
      if (event.operation === 'promoteCopyrightEmailIntakeGraphLocked') graphLocked()
    })
    const input = await copyrightEmailPromotionInput(moderator, root.intakeId)
    try {
      const promotion = promoteCopyrightEmailIntake(input).then(
        () => null,
        err => err,
      )
      await reachedGraphRead
      const edge = recordCopyrightEmailAncestorEdges(ingestion, claimant.id)
      const first = await Promise.race([
        edge.then(() => 'edge' as const),
        reachedGraphLock.then(() => 'graph-locked' as const),
      ])
      if (first === 'graph-locked') {
        await promotion
        await edge
        await ingestion.commit()
      } else {
        await ingestion.commit()
      }
      expect(first).toBe('edge')
      expect(await promotion).toMatchObject({
        status: 409,
        code: 'copyright_email_thread_changed',
      })
    } finally {
      dispose()
    }
    expect(await readCopyrightEmailIntakeNoticeLinks(root.intakeId)).toEqual([])
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.intakeId)).toEqual([])
    expect(await readCopyrightEmailIntakeReview(root.intakeId)).toEqual([])
    expect(
      await readCopyrightEmailPromotionEffects(root.intakeId, input.targets[0]!.placementId),
    ).toMatchObject({ reviews: 0, evidence: 0, deliveries: 0, notice_targets: 0 })
  })

  it('rejects promotion after a token-first thread link commits, without creating a second case', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    const parent = await promoteInitialCopyrightEmail({ moderator, messageId })
    const intake = await createUnparsedCopyrightEmailIntake()
    const digest = buildCopyrightEmailThreadReferenceRows({
      messageId,
      inReplyTo: [],
      references: [],
    })[0]!.lookup_digest
    await using threading = await beginTransaction()
    await lockCopyrightEmailThreadTokens(threading, [digest])
    expect(
      await linkCopyrightEmailIntakeToNotice(
        {
          intakeId: intake.id,
          noticeId: parent.noticeId,
          linkKind: 'thread',
          matchedReference: messageId,
        },
        threading,
      ),
    ).toBe(true)

    let graphRead!: () => void
    const reachedGraphRead = new Promise<void>(resolve => {
      graphRead = resolve
    })
    const dispose = installSharedDbScopeObserver(event => {
      if (
        event.operation === 'promoteCopyrightEmailIntakeGraph' &&
        event.scope.kind === 'ids' &&
        event.scope.ids[0] === intake.id
      )
        graphRead()
    })
    const input = await copyrightEmailPromotionInput(moderator, intake.id)
    try {
      const promotion = promoteCopyrightEmailIntake(input).then(
        () => new Error('Thread-linked intake was unexpectedly promoted'),
        err => err,
      )
      await reachedGraphRead
      await threading.commit()
      expect(await promotion).toMatchObject({ status: 409 })
    } finally {
      dispose()
    }
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([
      { copyright_notice_id: parent.noticeId, link_kind: 'thread' },
    ])
    expect(await readCopyrightEmailIntakeReview(intake.id)).toEqual([])
    expect(
      await readCopyrightEmailPromotionEffects(intake.id, input.targets[0]!.placementId),
    ).toMatchObject({
      reviews: 0,
      evidence: 0,
      deliveries: 0,
      thread_reviews: 1,
      notice_targets: 0,
    })
  })

  it('keeps the promoted initial notice when threading starts after its intake lock', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    const parent = await promoteInitialCopyrightEmail({ moderator, messageId })
    const intake = await createUnparsedCopyrightEmailIntake()
    let graphLocked!: () => void
    const reachedGraphLock = new Promise<void>(resolve => {
      graphLocked = resolve
    })
    const dispose = installSharedDbScopeObserver(event => {
      if (
        event.operation === 'promoteCopyrightEmailIntakeGraphLocked' &&
        event.scope.kind === 'ids' &&
        event.scope.ids[0] === intake.id
      )
        graphLocked()
    })
    const input = await copyrightEmailPromotionInput(moderator, intake.id)
    try {
      const promotion = promoteCopyrightEmailIntake(input)
      await reachedGraphLock
      const losingThreadLink = linkCopyrightEmailIntakeToNotice({
        intakeId: intake.id,
        noticeId: parent.noticeId,
        linkKind: 'thread',
        matchedReference: messageId,
      })
      const admitted = await promotion
      expect(await losingThreadLink).toBe(false)
      expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([
        { copyright_notice_id: admitted.noticeId, link_kind: 'initial' },
      ])
      expect(await readCopyrightEmailIntakeReview(intake.id)).toEqual([
        { decision: 'approved', promoted_copyright_notice_id: admitted.noticeId },
      ])
      expect(
        await readCopyrightEmailPromotionEffects(intake.id, input.targets[0]!.placementId),
      ).toMatchObject({
        reviews: 1,
        evidence: 1,
        thread_reviews: 0,
        notice_targets: 1,
      })
    } finally {
      dispose()
    }
  })
})
