import { beginTransaction } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'
import { createAssessedUsDmcaCopyrightNoticeFixture } from '@voucha/test-helpers/copyright-us-dmca-notice-fixture'
import { seedUnusedCopyrightGuestCapability } from '@voucha/test-helpers/copyright-operational-guest-capabilities'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'
import { readCopyrightThreadEnforcementPage } from './operational-retention-thread-blockers-enforcement.mts'
import { checkCopyrightThreadBlockerPage } from './operational-retention-thread-blockers.mts'
import type { BlockerCursor, BlockerPage } from './operational-retention-thread-blockers-state.mts'

const initialCursor: BlockerCursor = {
  phase: null,
  childId: null,
  assessmentId: null,
  territorialDecisionId: null,
  generation: null,
  foundQualifyingAssessment: false,
  foundScreeningTarget: false,
  foundClaimantReceipt: false,
}

async function readPage(noticeId: string, now: Date, cursor: BlockerCursor): Promise<BlockerPage> {
  await using transaction = await beginTransaction()
  const page = await checkCopyrightThreadBlockerPage(transaction, noticeId, now, 1, cursor)
  await transaction.commit()
  return page
}

describe('bounded copyright thread blocker proof', () => {
  it('finds owed enforcement on a raw target page and settles after that target is restricted', async () => {
    const fixture = await createAssessedUsDmcaCopyrightNoticeFixture({
      postTitlePrefix: 'thread blocker enforcement',
      postSlugPrefix: 'thread-blocker-enforcement',
      postMarkdown: 'image',
      claimantDisplayName: 'thread blocker claimant',
      noticeBodyCiphertext: `notice-${crypto.randomUUID()}`,
      receiptIdempotencyKeyPrefix: 'thread-blocker-receipt',
      assessBeforeReceipt: false,
    })
    const assessmentId = fixture.noticeAssessment.id
    const noticeId = fixture.notice.id
    const targetId = fixture.aggregate.targets[0]!.id
    const cursor: BlockerCursor = {
      ...initialCursor,
      phase: 'enforcement_assessments',
    }
    await using transaction = await beginTransaction()
    const assessment = await readCopyrightThreadEnforcementPage(transaction, noticeId, 1, cursor)
    expect(assessment.phase).toBe('enforcement_reversal_decisions')
    const decisions = await readCopyrightThreadEnforcementPage(transaction, noticeId, 1, assessment)
    expect(decisions.phase).toBe('enforcement_targets')
    const pending = await readCopyrightThreadEnforcementPage(transaction, noticeId, 1, decisions)
    expect(pending.blocked).toBe(true)
    await transaction.commit()

    await acceptCopyrightNoticeAndImposeRestriction({
      noticeId,
      targetId,
      assessmentId,
      imposedAt: new Date(),
      imposedById: null,
    })
    await using settledTransaction = await beginTransaction()
    const restricted = await readCopyrightThreadEnforcementPage(
      settledTransaction,
      noticeId,
      1,
      decisions,
    )
    expect(restricted.blocked).toBe(false)
    const exhausted = await readCopyrightThreadEnforcementPage(
      settledTransaction,
      noticeId,
      1,
      restricted,
    )
    expect(exhausted).toMatchObject({ phase: 'enforcement_assessments', blocked: false })
    await settledTransaction.commit()
  })

  it('invalidates a completed proof when a live guest capability is inserted between pages', async () => {
    const notice = await createRetentionMinimalCase()
    const now = new Date()
    let page = await readPage(notice.noticeId, now, initialCursor)
    for (let step = 0; step < 30 && !page.done; step += 1) {
      page = await readPage(notice.noticeId, now, page)
    }
    expect(page).toMatchObject({ done: true, blocked: false })
    const settledGeneration = page.generation

    await seedUnusedCopyrightGuestCapability(notice.noticeId, new Date(now.getTime() + 60_000))
    page = await readPage(notice.noticeId, now, page)
    expect(page.done).toBe(false)
    expect(page.generation).not.toBe(settledGeneration)
    for (let step = 0; step < 30 && !page.blocked; step += 1) {
      page = await readPage(notice.noticeId, now, page)
    }
    expect(page).toMatchObject({ phase: 'guest_capabilities', blocked: true })
  })
})
