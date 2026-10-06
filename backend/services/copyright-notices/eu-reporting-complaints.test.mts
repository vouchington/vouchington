import { describe, expect, it } from 'vitest'
import { createTestEuParticipantCase } from '@voucha/test-helpers/copyright-eu-participant-cases'
import { createTestReportingTrustedEuCase } from '@voucha/test-helpers/dsa-report-figure-fixtures'
import {
  createTestHistoricalEuDecisionWindow,
  insertTestHistoricalTerritorialComplaint,
} from '@voucha/test-helpers/copyright-territorial-historical-window'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { recordEuCopyrightRedressDecision, submitEuCopyrightRedress } from './index.mts'
import { readDsaCopyrightComplaintFigures } from './eu-reporting-complaints.mts'

const period = () => ({
  start: new Date(Date.now() - 86_400_000),
  end: new Date(Date.now() + 86_400_000),
})

describe('DSA copyright complaint aggregates', () => {
  useCopyrightIntakeEnvironment()

  it('reports reviewer filings from their stored role even before a staff outcome exists', async () => {
    const { start, end } = period()
    const scene = await createTestEuParticipantCase('no_action')
    const foreign = await createTestEuParticipantCase('no_action')
    await submitEuCopyrightRedress(
      scene.staff,
      scene.receipt.notice_id,
      crypto.randomUUID(),
      'A reviewer requests a second look.',
    )
    await submitEuCopyrightRedress(
      foreign.notifier,
      foreign.receipt.notice_id,
      crypto.randomUUID(),
      'A notifier filing stays outside the owned notice.',
    )
    const after = await readDsaCopyrightComplaintFigures(start, end, [scene.receipt.notice_id])
    expect(after.complaints_by_submitter.reviewer).toBe(1)
    expect(after.complaints_by_submitter.notifier).toBe(0)
    expect(after.complaints_by_decision_type.no_action.received).toBe(1)
    expect(after.complaints_by_decision_type.no_action.upheld).toBe(0)
  })
  it('uses immutable submitter roles and complained-about outcomes across decision periods', async () => {
    const { start, end } = period()
    const noAction = await createTestEuParticipantCase('no_action')
    const restricted = await createTestEuParticipantCase('restrict')
    const notifier = await submitEuCopyrightRedress(
      noAction.notifier,
      noAction.receipt.notice_id,
      crypto.randomUUID(),
      'Please review the decision not to act.',
    )
    const poster = await submitEuCopyrightRedress(
      restricted.poster,
      restricted.receipt.notice_id,
      crypto.randomUUID(),
      'Please review the restriction.',
    )
    await recordEuCopyrightRedressDecision(
      noAction.staff,
      noAction.receipt.notice_id,
      notifier.id,
      { disposition: 'maintain', rationale: 'The notice did not establish infringement.' },
    )
    await recordEuCopyrightRedressDecision(
      restricted.staff,
      restricted.receipt.notice_id,
      poster.id,
      { disposition: 'revoke', rationale: 'The restriction should be reversed.' },
    )
    const after = await readDsaCopyrightComplaintFigures(start, end, [
      noAction.receipt.notice_id,
      restricted.receipt.notice_id,
    ])
    expect(after.complaints_by_submitter.notifier).toBe(1)
    expect(after.complaints_by_submitter.poster).toBe(1)
    expect(after.complaints_by_submitter.reviewer).toBe(0)
    expect(after.complaints_by_decision_type.no_action.received).toBe(1)
    expect(after.complaints_by_decision_type.no_action.upheld).toBe(1)
    expect(after.complaints_by_decision_type.restrict.received).toBe(1)
    expect(after.complaints_by_decision_type.restrict.reversed).toBe(1)
    expect(after.complaints_by_decision_type.restrict.partially_reversed).toBe(0)
    expect(after.complaints_by_decision_type.no_action.median_hours).toEqual(expect.any(Number))
  })

  it('includes only in-area matches in the trusted no-action subset', async () => {
    const { start, end } = period()
    const inArea = await createTestReportingTrustedEuCase('intellectual_property', 'no_action')
    const outOfArea = await createTestReportingTrustedEuCase('other', 'no_action')
    for (const scene of [inArea, outOfArea]) {
      const request = await submitEuCopyrightRedress(
        scene.claimant,
        scene.noticeId,
        crypto.randomUUID(),
        'Please reassess this notice.',
      )
      await recordEuCopyrightRedressDecision(scene.staff, scene.noticeId, request.id, {
        disposition: 'maintain',
        rationale: 'The original decision remains appropriate.',
      })
    }
    const foreign = await createTestEuParticipantCase('restrict')
    const foreignRequest = await submitEuCopyrightRedress(
      foreign.poster,
      foreign.receipt.notice_id,
      crypto.randomUUID(),
      'This poster complaint is not in the owned set.',
    )
    await recordEuCopyrightRedressDecision(
      foreign.staff,
      foreign.receipt.notice_id,
      foreignRequest.id,
      {
        disposition: 'revoke',
        rationale: 'The foreign restriction is reversed.',
      },
    )
    const after = await readDsaCopyrightComplaintFigures(start, end, [
      inArea.noticeId,
      outOfArea.noticeId,
    ])
    expect(after.complaints_by_decision_type.no_action.received).toBe(2)
    expect(after.complaints_by_decision_type.no_action_trusted_flagger.received).toBe(1)
    expect(after.complaints_by_decision_type.no_action_trusted_flagger.upheld).toBe(1)
    expect(after.complaints_by_decision_type.restrict.reversed).toBe(0)
  })

  it('counts a historical complaint only in its receipt period and a later outcome in its decision period', async () => {
    const [notifier, staff] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    const scene = await createTestHistoricalEuDecisionWindow({ requesterUserId: notifier.id })
    const requestId = await insertTestHistoricalTerritorialComplaint({
      noticeId: scene.noticeId,
      requesterUserId: notifier.id,
      idempotencyKey: crypto.randomUUID(),
      receivedAt: new Date(scene.decidedAt.getTime() + 60_000),
    })
    const recent = period()
    const old = {
      start: new Date(scene.decidedAt.getTime() - 1_000),
      end: new Date(scene.decidedAt.getTime() + 86_400_000),
    }
    const ownedIds = [scene.noticeId]
    const [beforeRecent, beforeOld] = await Promise.all([
      readDsaCopyrightComplaintFigures(recent.start, recent.end, ownedIds),
      readDsaCopyrightComplaintFigures(old.start, old.end, ownedIds),
    ])
    await recordEuCopyrightRedressDecision(staff, scene.noticeId, requestId, {
      disposition: 'maintain',
      rationale: 'The historical decision remains appropriate.',
    })
    const [afterRecent, afterOld] = await Promise.all([
      readDsaCopyrightComplaintFigures(recent.start, recent.end, ownedIds),
      readDsaCopyrightComplaintFigures(old.start, old.end, ownedIds),
    ])
    expect(afterRecent.complaints_by_decision_type.no_action.received).toBe(
      beforeRecent.complaints_by_decision_type.no_action.received,
    )
    expect(
      afterRecent.complaints_by_decision_type.no_action.upheld -
        beforeRecent.complaints_by_decision_type.no_action.upheld,
    ).toBe(1)
    expect(afterOld.complaints_by_decision_type.no_action.received).toBe(
      beforeOld.complaints_by_decision_type.no_action.received,
    )
    expect(afterOld.complaints_by_decision_type.no_action.upheld).toBe(
      beforeOld.complaints_by_decision_type.no_action.upheld,
    )
    expect(afterRecent.complaints_by_decision_type.no_action.median_hours).toEqual(
      expect.any(Number),
    )
  })
})
