import { useCopyrightCasePurgeIsolation } from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-isolation'
import { describe, expect, it } from 'vitest'
import {
  createTestEuParticipantCase,
  createTestEuParticipantComplaint,
} from '@voucha/test-helpers/copyright-eu-participant-cases'
import {
  clearTerritorialDecisionPredecessorWithScope,
  deleteTerritorialDecisionWithScope,
  readTerritorialPurgeDecisionPartitions,
  readTerritorialDecisionPredecessors,
  runTerritorialDecisionPointerCut,
} from '@voucha/test-helpers/services/copyright-notices/territorial-decision-pointer-cut'
import {
  publishCopyrightCasePurgeCoverage,
  readCopyrightCasePurgeFixture,
  useCopyrightCasePurgePageSize,
} from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import {
  deliverCopyrightInAppNotification,
  markCopyrightDeliveryIntentSent,
  prepareCopyrightEmailDelivery,
  recordEuCopyrightStatementOfReasons,
} from './index.mts'
import { runCopyrightCasePurgePage } from './retention-case-purge-page.mts'
import { COPYRIGHT_CASE_PURGE_PHASES } from './retention-case-purge-order.mts'

const PURGE_NOW = new Date('2100-01-01T12:00:00.000Z')

async function runTerritorialCasePurge(noticeId: string) {
  let cursor: CopyrightCasePurgeJobData = {
    noticeId,
    phase: 'parties',
    phaseIndex: 0,
    afterId: null,
    legalClockAt: null,
    proofVersion: null,
  }
  for (let page = 0; page < 1_000; page += 1) {
    try {
      const result = await runCopyrightCasePurgePage(cursor, PURGE_NOW)
      if (!result.hasMore) return result.data.phase
      cursor = result.data
    } catch (err) {
      const table = COPYRIGHT_CASE_PURGE_PHASES[cursor.phaseIndex]?.[0]
      throw new Error(`Copyright purge failed at ${cursor.phase}:${cursor.phaseIndex} (${table})`, {
        cause: err,
      })
    }
  }
  throw new Error(`Copyright purge exceeded 1000 pages at ${cursor.phase}`)
}

async function settleTerritorialCaseDeliveries(noticeId: string) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  if (!aggregate) throw new Error('Missing case before purge')
  for (const intent of aggregate.deliveryIntents) {
    if (intent.channel === 'in_app') {
      if (!(await deliverCopyrightInAppNotification(intent.id)))
        throw new Error(`Could not deliver in-app fixture notice ${intent.id}`)
    } else {
      const delivery = await prepareCopyrightEmailDelivery(intent.id)
      const sent = await markCopyrightDeliveryIntentSent({
        intentId: intent.id,
        leaseToken: delivery.leaseToken,
        sesMessageId: crypto.randomUUID(),
      })
      if (!sent) throw new Error(`Could not settle fixture email delivery ${intent.id}`)
    }
  }
}

describe('territorial decision predecessor purge', () => {
  it('cuts a successor link only under the matching case and table permit', async () => {
    const scene = await createTestEuParticipantCase('no_action')
    const noticeId = scene.receipt.notice_id
    await createTestEuParticipantComplaint({
      noticeId,
      actor: scene.notifier,
      staff: scene.staff,
      explanation: 'Please review the no-action decision.',
      rationale: 'The notice deserves a new review.',
      disposition: 'revoke',
    })
    await recordEuCopyrightStatementOfReasons(scene.staff, noticeId, {
      text: 'The hosted post reproduces the notified photograph.',
      publicExplanation: 'The image matches the notified photograph.',
      outcome: 'restrict',
      targets: [
        {
          surfaceKind: 'post-image',
          postId: scene.postId,
          imageId: scene.imageId,
          hostedUseUrl: `https://example.test/work/${scene.suffix}`,
        },
      ],
    })

    const [predecessor, successor] = await readTerritorialDecisionPredecessors(noticeId)
    if (!predecessor || !successor) throw new Error('Missing territorial decision history')
    expect(predecessor.supersedes_decision_id).toBeNull()
    expect(successor.supersedes_decision_id).toBe(predecessor.id)

    await expect(
      clearTerritorialDecisionPredecessorWithScope(successor.id, noticeId, null),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      clearTerritorialDecisionPredecessorWithScope(
        successor.id,
        scene.staff.id,
        'copyright_territorial_decisions',
      ),
    ).rejects.toMatchObject({ code: '23514' })

    await expect(runTerritorialDecisionPointerCut(noticeId)).resolves.toEqual({
      nextPhaseIndex: 1,
      cut: 1,
      nextAfterId: null,
    })
    expect(await readTerritorialDecisionPredecessors(noticeId)).toEqual([
      predecessor,
      { id: successor.id, supersedes_decision_id: null },
    ])
  })
})

describe('territorial decision history purge', () => {
  useCopyrightCasePurgeIsolation('shared')
  const setPageSize = useCopyrightCasePurgePageSize()

  it('deletes monthly decision and redress history only for the permitted case and table', async () => {
    await setPageSize(20)
    const scene = await createTestEuParticipantCase('no_action')
    const noticeId = scene.receipt.notice_id
    const { decision: redress } = await createTestEuParticipantComplaint({
      noticeId,
      actor: scene.notifier,
      staff: scene.staff,
      explanation: 'Please review the no-action decision.',
      rationale: 'The decision remains in effect.',
    })
    const [decision] = await readTerritorialDecisionPredecessors(noticeId)
    if (!decision) throw new Error('Missing territorial decision history')
    const partitions = await readTerritorialPurgeDecisionPartitions(decision.id, redress.id)
    expect(partitions.decision).toMatch(/^copyright_territorial_decisions__p_\d{4}_\d{2}$/)
    expect(partitions.redress).toMatch(/^copyright_territorial_redress_decisions__p_\d{4}_\d{2}$/)

    const targets = [
      [
        'decision',
        decision.id,
        'copyright_territorial_decisions',
        'copyright_territorial_redress_decisions',
      ],
      [
        'redress',
        redress.id,
        'copyright_territorial_redress_decisions',
        'copyright_territorial_decisions',
      ],
    ] as const
    for (const [target, id, table, otherTable] of targets) {
      const scopes = [
        [noticeId, null],
        [noticeId, otherTable],
        [null, table],
        [scene.staff.id, table],
      ] as const
      for (const [permittedNoticeId, permittedTable] of scopes) {
        await expect(
          deleteTerritorialDecisionWithScope(target, id, permittedNoticeId, permittedTable),
        ).rejects.toMatchObject({ code: '23514' })
      }
    }
    expect(await readTerritorialPurgeDecisionPartitions(decision.id, redress.id)).toEqual(
      partitions,
    )

    await settleTerritorialCaseDeliveries(noticeId)
    await publishCopyrightCasePurgeCoverage(noticeId)
    expect(await runTerritorialCasePurge(noticeId)).toBe('residual_parties')
    expect(await readCopyrightCasePurgeFixture(noticeId)).toMatchObject({
      live: false,
      retained: false,
      partyCount: 0,
    })
    expect(await readTerritorialPurgeDecisionPartitions(decision.id, redress.id)).toEqual({
      decision: null,
      redress: null,
    })
  })
})
