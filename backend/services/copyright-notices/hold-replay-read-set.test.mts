import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { beginTransaction } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import {
  openHeldCounterNoticeRestore,
  recordOrdinaryCopyrightHold,
} from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { appendCopyrightLegalHoldAssessment, resolveCopyrightLegalHold } from './index.mts'

type Scene = Awaited<ReturnType<typeof openHeldCounterNoticeRestore>>

/** A second connection can lock (FOR NO KEY UPDATE, compatible with an FK key share) every row the replay read: none is held by the replaying transaction. */
async function readRowsAreUnlocked(
  scene: Scene,
  hold: { submissionId?: string; assessmentId?: string },
) {
  await using other = await beginTransaction()
  const deadlineId = scene.restore.copyright_notice_deadline_id
  const unlocked = async (statement: SQLStatement) => (await other(statement)).rows.length === 1
  return {
    intent: await unlocked(sql`/* readRowsAreUnlocked:intent */
      SELECT id FROM copyright_notice_action_work_items
      WHERE id = ${scene.restore.id} FOR NO KEY UPDATE SKIP LOCKED`),
    restriction: await unlocked(sql`/* readRowsAreUnlocked:restriction */
      SELECT id FROM copyright_restrictions
      WHERE id = ${scene.restriction.id} FOR NO KEY UPDATE SKIP LOCKED`),
    target: await unlocked(sql`/* readRowsAreUnlocked:target */
      SELECT id FROM copyright_notice_targets
      WHERE id = ${scene.target.id} FOR NO KEY UPDATE SKIP LOCKED`),
    deadline: await unlocked(sql`/* readRowsAreUnlocked:deadline */
      SELECT id FROM copyright_notice_deadlines
      WHERE id = ${deadlineId} FOR NO KEY UPDATE SKIP LOCKED`),
    submission: await unlocked(sql`/* readRowsAreUnlocked:submission */
      SELECT id FROM copyright_notice_submissions
      WHERE id = ${hold.submissionId ?? null} FOR NO KEY UPDATE SKIP LOCKED`),
    assessment: await unlocked(sql`/* readRowsAreUnlocked:assessment */
      SELECT id FROM copyright_notice_legal_hold_assessments
      WHERE id = ${hold.assessmentId ?? null} FOR NO KEY UPDATE SKIP LOCKED`),
  }
}

async function observeReplayReads(
  scene: Scene,
  hold: { submissionId?: string; assessmentId?: string },
  run: () => Promise<unknown>,
) {
  let observed: Awaited<ReturnType<typeof readRowsAreUnlocked>> | undefined
  const restore = beforePostgresTransactionQueryForTest(
    'replayEligibleCopyrightRestoreIntentsInTransaction:readiness',
    () => true,
    async () => {
      observed = await readRowsAreUnlocked(scene, hold)
    },
  )
  try {
    await run()
  } finally {
    restore()
  }
  return observed
}

describe('ordinary hold replay read set', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('leaves the original rows and the resolved assessment unlocked during resolution replay', async () => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const hold = await recordOrdinaryCopyrightHold(scene)
    const observed = await observeReplayReads(scene, { assessmentId: hold.id }, () =>
      resolveCopyrightLegalHold({
        currentUser: scene.moderator,
        assessmentId: hold.id,
        resolvedAt: scene.restorationAt,
        resolutionKind: 'dismissed',
        rationale: 'The hold no longer applies.',
      }),
    )
    expect(observed).toMatchObject({
      intent: true,
      restriction: true,
      target: true,
      deadline: true,
      assessment: true,
    })
  })

  // Assessment legitimately writes the preempted intent and key-shares its assessed target.
  it('leaves the original restriction, deadline and held submission unlocked during assessment replay', async () => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const hold = await recordOrdinaryCopyrightHold(scene)
    await resolveCopyrightLegalHold({
      currentUser: scene.moderator,
      assessmentId: hold.id,
      resolvedAt: scene.restorationAt,
      resolutionKind: 'dismissed',
      rationale: 'Resolved before the next filing.',
    })
    const filing = await appendTestCopyrightNoticeSubmission({
      noticeId: scene.notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: scene.restorationAt,
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `filing-${crypto.randomUUID()}`,
    })
    const observed = await observeReplayReads(scene, { submissionId: filing.id }, () =>
      appendCopyrightLegalHoldAssessment({
        currentUser: scene.moderator,
        submissionId: filing.id,
        assessedAt: scene.restorationAt,
        fromOriginalClaimant: false,
        proceedingKind: null,
        ccbClaimKind: null,
        commencedAt: null,
        receivedByDesignatedAgentAt: null,
        sameMaterial: false,
        targetIds: [scene.target.id],
        rationale: 'No qualifying proceeding exists.',
      }),
    )
    expect(observed).toMatchObject({ restriction: true, deadline: true, submission: true })
  })

  it('lets exactly one of two concurrent resolutions of the same hold win, the other gets 409', async () => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const hold = await recordOrdinaryCopyrightHold(scene)
    const resolve = () =>
      resolveCopyrightLegalHold({
        currentUser: scene.moderator,
        assessmentId: hold.id,
        resolvedAt: scene.restorationAt,
        resolutionKind: 'dismissed',
        rationale: 'The hold no longer applies.',
      })
    const results = await Promise.allSettled([resolve(), resolve()])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const lost = results.find(result => result.status === 'rejected')
    expect(lost).toMatchObject({ reason: { status: 409 } })
  })
})
