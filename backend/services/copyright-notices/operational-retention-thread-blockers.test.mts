import { describe, expect, it } from 'vitest'
import { seedCommittedTerritorialDecision } from '@voucha/test-helpers/copyright-territorial-committed-decision'
import {
  seedCommittedTerritorialRedress,
  seedCommittedTerritorialRedressDecision,
} from '@voucha/test-helpers/copyright-territorial-committed-redress'
import { assertTerritorialInterruptedDecision } from '@voucha/test-helpers/copyright-territorial-decision-outcomes'
import { assertTerritorialReviewOutcome } from '@voucha/test-helpers/copyright-territorial-review-outcome'
import { readTerritorialReviewState } from '@voucha/test-helpers/copyright-territorial-review-state'
import { beginTransaction } from '@voucha/test-helpers'
import { interceptCopyrightImpositionForTest } from '@voucha/test-helpers/copyright-imposition-intercept'
import { createAssessedUsDmcaCopyrightNoticeFixture } from '@voucha/test-helpers/copyright-us-dmca-notice-fixture'
import { createTestTerritorialRestrictionScene } from '@voucha/test-helpers/copyright-territorial-restriction-fixtures'
import {
  createTestExpiredTerritorialDecisionHistory,
  decideTestExpiredTerritorialRedress,
} from '@voucha/test-helpers/copyright-expired-territorial-history'
import { seedCopyrightFormScreeningAttemptPair } from '@voucha/test-helpers/copyright-operational-retention'
import { seedUnusedCopyrightGuestCapability } from '@voucha/test-helpers/copyright-operational-guest-capabilities'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import {
  readTestCopyrightThreadBlockerPage,
  readTestCopyrightThreadEnforcementPage,
} from '@voucha/test-helpers/copyright-thread-blocker-retention'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'
import type { BlockerCursor } from './operational-retention-thread-blockers-state.mts'
import { readCopyrightThreadBusinessPage } from './operational-retention-thread-blockers-business.mts'
import { readCopyrightThreadScreeningPage } from './operational-retention-thread-blockers-screening.mts'
import { readCopyrightThreadStaffPage } from './operational-retention-thread-blockers-staff.mts'

const initialCursor: BlockerCursor = {
  phase: null,
  childId: null,
  assessmentId: null,
  generation: null,
}

async function walkEnforcement(noticeId: string) {
  let page: BlockerCursor & { blocked: boolean } = {
    ...initialCursor,
    phase: 'enforcement_assessments',
    blocked: false,
  }
  for (let step = 0; step < 20 && !page.blocked && page.phase !== 'deadlines'; step += 1) {
    page = await readTestCopyrightThreadEnforcementPage(noticeId, page)
  }
  if (!page.blocked && page.phase !== 'deadlines')
    throw new Error('Enforcement proof did not finish')
  return page
}

describe('bounded copyright thread blocker proof', () => {
  it('rejects a completed phase when passed to a specialized blocker reader', async () => {
    await using transaction = await beginTransaction()
    const noticeId = crypto.randomUUID()
    const cursor: BlockerCursor = { ...initialCursor, phase: 'done' }

    await expect(
      readCopyrightThreadBusinessPage(transaction, noticeId, new Date(), 1, cursor),
    ).rejects.toThrow('Unexpected copyright business blocker phase: done')
    await expect(readCopyrightThreadStaffPage(transaction, noticeId, 1, cursor)).rejects.toThrow(
      'Unexpected copyright staff blocker phase: done',
    )
    await expect(
      readCopyrightThreadScreeningPage(transaction, noticeId, 1, cursor),
    ).rejects.toThrow('Unexpected copyright screening blocker phase: done')
  })

  it('uses retained redress result after the challenged decision history expires', async () => {
    const scene = await createTestExpiredTerritorialDecisionHistory('restrict')
    const cursor: BlockerCursor = {
      ...initialCursor,
      phase: 'enforcement_reversal_requests',
      assessmentId: scene.assessmentId,
    }
    const requestPage = await readTestCopyrightThreadEnforcementPage(scene.noticeId, cursor)
    expect(requestPage).toMatchObject({
      phase: 'enforcement_reversal_requests',
      childId: scene.requestId,
      blocked: false,
    })
    expect(await readTestCopyrightThreadEnforcementPage(scene.noticeId, requestPage)).toMatchObject(
      {
        phase: 'enforcement_targets',
        blocked: false,
      },
    )
    await decideTestExpiredTerritorialRedress(scene.requestId, 'revoke')
    expect(await readTestCopyrightThreadEnforcementPage(scene.noticeId, cursor)).toMatchObject({
      phase: 'enforcement_assessments',
      childId: scene.assessmentId,
      blocked: false,
    })
  })

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
    const assessment = await readTestCopyrightThreadEnforcementPage(noticeId, cursor)
    expect(assessment.phase).toBe('enforcement_reversal_requests')
    const decisions = await readTestCopyrightThreadEnforcementPage(noticeId, assessment)
    expect(decisions.phase).toBe('enforcement_targets')
    const pending = await readTestCopyrightThreadEnforcementPage(noticeId, decisions)
    expect(pending.blocked).toBe(true)

    await acceptCopyrightNoticeAndImposeRestriction({
      noticeId,
      targetId,
      assessmentId,
      imposedAt: new Date(),
      imposedById: null,
    })
    const restricted = await readTestCopyrightThreadEnforcementPage(noticeId, decisions)
    expect(restricted.blocked).toBe(false)
    const exhausted = await readTestCopyrightThreadEnforcementPage(noticeId, restricted)
    expect(exhausted).toMatchObject({ phase: 'enforcement_assessments', blocked: false })
  })

  it('invalidates a completed proof when a live guest capability is inserted between pages', async () => {
    const notice = await createRetentionMinimalCase()
    const now = new Date()
    let page = await readTestCopyrightThreadBlockerPage(notice.noticeId, now, initialCursor)
    for (let step = 0; step < 30 && !page.done; step += 1) {
      page = await readTestCopyrightThreadBlockerPage(notice.noticeId, now, page)
    }
    expect(page).toMatchObject({ done: true, blocked: false })
    const settledGeneration = page.generation

    await seedUnusedCopyrightGuestCapability(notice.noticeId, new Date(now.getTime() + 60_000))
    page = await readTestCopyrightThreadBlockerPage(notice.noticeId, now, page)
    expect(page.done).toBe(false)
    expect(page.generation).not.toBe(settledGeneration)
    for (let step = 0; step < 30 && !page.blocked; step += 1) {
      page = await readTestCopyrightThreadBlockerPage(notice.noticeId, now, page)
    }
    expect(page).toMatchObject({ phase: 'guest_capabilities', blocked: true })
  })

  it('holds an automated compliant signed-in form until its image target is restricted', async () => {
    const { notice, screeningId } = await createClearScreenedForm()
    await appendCopyrightSubmissionAssessment({
      submissionId: notice.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: null,
      substantiallyCompliant: true,
      copyrightFormScreeningId: screeningId,
    })
    const noticeId = notice.intake.copyright_notice_id
    const now = new Date()
    let page = await readTestCopyrightThreadBlockerPage(noticeId, now, initialCursor)
    for (let step = 0; step < 40 && !page.blocked && !page.done; step += 1) {
      page = await readTestCopyrightThreadBlockerPage(noticeId, now, page)
    }
    expect(page).toMatchObject({ phase: 'enforcement_targets', blocked: true, done: false })

    await seedCopyrightFormScreeningAttemptPair(notice.intake.id)
    expect(await walkEnforcement(noticeId)).toMatchObject({
      phase: 'deadlines',
      blocked: false,
    })
  })

  it('clears pending territorial enforcement when staff revokes the restrict decision', async () => {
    const scene = await createTestTerritorialRestrictionScene('eu_dsa')
    interceptCopyrightImpositionForTest(scene.noticeId, async () => {
      throw new Error('temporary enforcement interruption')
    })
    const input = {
      text: 'The hosted image reproduces the claimed work.',
      publicExplanation: 'The hosted image reproduces the claimed work.',
      outcome: 'restrict' as const,
      targets: scene.targets,
    }
    await assertTerritorialInterruptedDecision(
      'eu_dsa',
      scene,
      input,
      'temporary enforcement interruption',
      0,
    )

    // The blocker subject starts committed even if the interrupted actor aborted admission.
    const pending = await createTestTerritorialRestrictionScene('eu_dsa')
    await seedCommittedTerritorialDecision(
      'eu_dsa',
      pending.staff,
      pending.noticeId,
      { ...input, targets: pending.targets },
      0,
    )
    expect((await walkEnforcement(pending.noticeId)).blocked).toBe(true)
    const complaint = await seedCommittedTerritorialRedress(
      'eu_dsa',
      pending.noticeId,
      pending.claimant,
      'Please reverse the restriction.',
    )
    const rationale = 'The claim did not support restriction.'
    await assertTerritorialReviewOutcome({
      jurisdiction: 'eu_dsa',
      noticeId: pending.noticeId,
      redressId: complaint.id,
      staff: pending.staff,
      claimantId: pending.claimant.id,
      posterId: pending.posts[0]!.poster.id,
      disposition: 'revoke',
      rationale,
    })
    const reviewed = await readTerritorialReviewState('eu_dsa', pending.noticeId, [
      pending.posts[0]!.poster.id,
    ])
    const revoked =
      reviewed.history.find(decision => decision.request === complaint.id)?.disposition === 'revoke'
    expect(await walkEnforcement(pending.noticeId)).toMatchObject(
      revoked
        ? { phase: 'deadlines', blocked: false }
        : { phase: 'enforcement_targets', blocked: true },
    )

    // A committed revocation must clear the proof even when the actual review above aborts.
    const committed = await createTestTerritorialRestrictionScene('eu_dsa')
    await seedCommittedTerritorialDecision(
      'eu_dsa',
      committed.staff,
      committed.noticeId,
      { ...input, targets: committed.targets },
      0,
    )
    expect((await walkEnforcement(committed.noticeId)).blocked).toBe(true)
    const committedComplaint = await seedCommittedTerritorialRedress(
      'eu_dsa',
      committed.noticeId,
      committed.claimant,
      'Please reverse the restriction.',
    )
    await seedCommittedTerritorialRedressDecision(
      'eu_dsa',
      committed.noticeId,
      committedComplaint.id,
      committed.staff,
      { disposition: 'revoke', rationale },
    )
    expect(await walkEnforcement(committed.noticeId)).toMatchObject({
      phase: 'deadlines',
      blocked: false,
    })
  })
})
