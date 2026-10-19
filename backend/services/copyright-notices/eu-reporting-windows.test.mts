import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { createTestTimedDsaReportAction } from '@voucha/test-helpers/dsa-report-timed-action'
import {
  createTestHistoricalEuDecisionWindow,
  insertTestHistoricalTerritorialComplaint,
} from '@voucha/test-helpers/copyright-territorial-historical-window'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { readDsaCopyrightNoticeFigures } from './eu-reporting-notices.mts'
import { readDsaCopyrightComplaintFigures } from './eu-reporting-complaints.mts'
import { recordEuCopyrightRedressDecision } from './eu-redress.mts'

const utcEdges = [
  '2024-01-31T23:59:59.999Z',
  '2024-02-01T00:00:00.000Z',
  '2024-02-29T23:59:59.999Z',
  '2024-03-01T00:00:00.000Z',
  '2024-12-31T23:59:59.999Z',
  '2025-01-01T00:00:00.000Z',
] as const

describe('DSA copyright half-open event windows', () => {
  useCopyrightIntakeEnvironment()

  it.each(utcEdges)('counts notice receipt and imposition independently at %s', async instant => {
    const receivedAt = new Date(instant)
    const imposedAt = new Date(receivedAt.getTime() + 2_000)
    const noticeId = await createTestTimedDsaReportAction({
      receivedAt,
      imposedAt,
      completedAt: new Date(imposedAt.getTime() + 1_000),
    })
    const receiptBefore = await readDsaCopyrightNoticeFigures(
      new Date(receivedAt.getTime() - 1),
      receivedAt,
      [noticeId],
    )
    const receiptAt = await readDsaCopyrightNoticeFigures(
      receivedAt,
      new Date(receivedAt.getTime() + 1),
      [noticeId],
    )
    const impositionBefore = await readDsaCopyrightNoticeFigures(
      new Date(imposedAt.getTime() - 1),
      imposedAt,
      [noticeId],
    )
    const impositionAt = await readDsaCopyrightNoticeFigures(
      imposedAt,
      new Date(imposedAt.getTime() + 1),
      [noticeId],
    )

    expect(receiptBefore.notices_received_count).toBe(0)
    expect(receiptAt.notices_received_count).toBe(1)
    expect(receiptAt.actions_on_law_count).toBe(0)
    expect(impositionBefore.actions_on_law_count).toBe(0)
    expect(impositionAt.actions_on_law_count).toBe(1)
    expect(impositionAt.notices_received_count).toBe(0)
  })

  it.each(utcEdges)(
    'counts complaint receipt at %s and excludes the previous window',
    async instant => {
      const receivedAt = new Date(instant)
      const requester = await createTestUser()
      const scene = await createTestHistoricalEuDecisionWindow({
        requesterUserId: requester.id,
        decidedAt: new Date(receivedAt.getTime() - 86_400_000),
      })
      await insertTestHistoricalTerritorialComplaint({
        noticeId: scene.noticeId,
        requesterUserId: requester.id,
        idempotencyKey: crypto.randomUUID(),
        receivedAt,
      })
      const before = await readDsaCopyrightComplaintFigures(
        new Date(receivedAt.getTime() - 1),
        receivedAt,
        [scene.noticeId],
      )
      const at = await readDsaCopyrightComplaintFigures(
        receivedAt,
        new Date(receivedAt.getTime() + 1),
        [scene.noticeId],
      )
      const after = await readDsaCopyrightComplaintFigures(
        new Date(receivedAt.getTime() + 1),
        new Date(receivedAt.getTime() + 2),
        [scene.noticeId],
      )

      expect(before.complaints_by_submitter.notifier).toBe(0)
      expect(at.complaints_by_submitter.notifier).toBe(1)
      expect(at.complaints_by_decision_type.no_action.received).toBe(1)
      expect(after.complaints_by_submitter.notifier).toBe(0)
    },
  )

  it('counts a native redress decision at its persisted instant, independently of receipt', async () => {
    const [requester, staff] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    const receivedAt = new Date('2024-02-29T23:59:59.999Z')
    const scene = await createTestHistoricalEuDecisionWindow({
      requesterUserId: requester.id,
      decidedAt: new Date(receivedAt.getTime() - 86_400_000),
    })
    const requestId = await insertTestHistoricalTerritorialComplaint({
      noticeId: scene.noticeId,
      requesterUserId: requester.id,
      idempotencyKey: crypto.randomUUID(),
      receivedAt,
    })
    const decision = await recordEuCopyrightRedressDecision(staff, scene.noticeId, requestId, {
      disposition: 'maintain',
      rationale: 'The original no-action decision remains appropriate.',
    })
    const decisionAt = decision.decided_at
    const before = await readDsaCopyrightComplaintFigures(
      new Date(decisionAt.getTime() - 1),
      decisionAt,
      [scene.noticeId],
    )
    const at = await readDsaCopyrightComplaintFigures(
      decisionAt,
      new Date(decisionAt.getTime() + 1),
      [scene.noticeId],
    )
    const after = await readDsaCopyrightComplaintFigures(
      new Date(decisionAt.getTime() + 1),
      new Date(decisionAt.getTime() + 2),
      [scene.noticeId],
    )

    expect(before.complaints_by_decision_type.no_action.upheld).toBe(0)
    expect(at.complaints_by_decision_type.no_action.upheld).toBe(1)
    expect(at.complaints_by_decision_type.no_action.received).toBe(0)
    expect(after.complaints_by_decision_type.no_action.upheld).toBe(0)
  })
})
