import { describe, expect, it } from 'vitest'
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
import {
  recordEuCopyrightRedressDecision,
  recordEuCopyrightStatementOfReasons,
  submitEuCopyrightRedress,
} from './index.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'
import type { BlockerCursor } from './operational-retention-thread-blockers-state.mts'

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
    const interrupted = async (_assessmentId: string) => {
      throw new Error('temporary enforcement interruption')
    }
    await expect(
      recordEuCopyrightStatementOfReasons(
        scene.staff,
        scene.noticeId,
        {
          text: 'The hosted image reproduces the claimed work.',
          publicExplanation: 'The hosted image reproduces the claimed work.',
          outcome: 'restrict',
          targets: scene.targets,
        },
        { enforceAssessment: interrupted },
      ),
    ).rejects.toThrow('temporary enforcement interruption')
    expect((await walkEnforcement(scene.noticeId)).blocked).toBe(true)

    const complaint = await submitEuCopyrightRedress(
      scene.claimant,
      scene.noticeId,
      crypto.randomUUID(),
      'Please reverse the restriction.',
    )
    await recordEuCopyrightRedressDecision(scene.staff, scene.noticeId, complaint.id, {
      disposition: 'revoke',
      rationale: 'The claim did not support restriction.',
    })
    expect(await walkEnforcement(scene.noticeId)).toMatchObject({
      phase: 'deadlines',
      blocked: false,
    })
  })
})
