import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'
import {
  createTestEuParticipantCase,
  createTestEuParticipantComplaint,
} from '@voucha/test-helpers/copyright-eu-participant-cases'
import { createTestHistoricalEuDecisionWindow } from '@voucha/test-helpers/copyright-territorial-historical-window'
import { createUnparsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { publishCopyrightCasePurgeCoverage } from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import {
  copyrightCaseReportPeriod,
  publishCopyrightCaseReportPeriod,
  readCopyrightCaseThreadPurgeState,
} from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-report-email'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import {
  EU_REPORT_FACT_FAMILIES,
  readEuCopyrightReportCoveragePage,
} from './eu-report-coverage.mts'
import { recordEuCopyrightSupervisedComplaint } from './eu-supervised-complaint.mts'
import { readCopyrightCaseGlobalReportCoveragePage } from './retention-case-purge-report-coverage.mts'
import { deleteCopyrightCaseEmailThreadLinkPage } from './retention-case-purge-email-links.mts'
import { verifyCopyrightCaseReportCoveragePage } from './retention-case-purge-coverage.mts'
import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'

describe('copyright case report coverage', () => {
  useCopyrightIntakeEnvironment()

  it('requires a publication after insertion even for historically dated facts', async () => {
    const period = copyrightCaseReportPeriod()
    const scene = await createTestHistoricalEuDecisionWindow({
      decidedAt: new Date(period.start.getTime() + 86_400_000),
    })
    await publishCopyrightCaseReportPeriod(period, new Date('2000-01-01T00:00:00Z'))
    const data: CopyrightCasePurgeJobData = {
      noticeId: scene.noticeId,
      phase: 'coverage',
      phaseIndex: 2,
      afterId: null,
      legalClockAt: null,
      proofVersion: null,
    }
    await using before = await beginTransaction()
    expect(await verifyCopyrightCaseReportCoveragePage(before, data, 'eu_dsa', 1)).toEqual({
      data,
      hasMore: false,
    })
    for (const family of ['receipts', 'decisions'] as const) {
      expect(
        await readEuCopyrightReportCoveragePage(before, scene.noticeId, family, null, 1),
      ).toMatchObject({ covered: false, hasMore: false, nextId: expect.any(String) })
    }
    await before.commit()
    await publishCopyrightCaseReportPeriod(
      { ...period, end: new Date(period.end.getTime() + 1) },
      new Date('2300-01-01T00:00:00Z'),
    )
    await using after = await beginTransaction()
    expect(await verifyCopyrightCaseReportCoveragePage(after, data, 'eu_dsa', 1)).toEqual({
      data: { ...data, phaseIndex: 3 },
      hasMore: true,
    })
    for (const family of ['receipts', 'decisions'] as const) {
      const page = await readEuCopyrightReportCoveragePage(after, scene.noticeId, family, null, 1)
      expect(page).toMatchObject({ covered: true, hasMore: false, nextId: expect.any(String) })
      expect(
        await readEuCopyrightReportCoveragePage(after, scene.noticeId, family, page.nextId, 1),
      ).toMatchObject({ covered: true, hasMore: false, nextId: null })
    }
  })

  it('checks every EU fact family and resumes a bounded complaint page without repeating facts', async () => {
    const scene = await createTestEuParticipantCase('no_action')
    await createTestEuParticipantComplaint({
      noticeId: scene.receipt.notice_id,
      actor: scene.notifier,
      staff: scene.staff,
      explanation: 'Please review this notice.',
      rationale: 'The decision remains appropriate.',
    })
    const complaints = []
    for (let index = 0; index < 2; index++) {
      complaints.push(
        await recordEuCopyrightSupervisedComplaint(scene.notifier, scene.receipt.notice_id, {
          idempotencyKey: randomUUID(),
          authorityReference: randomUUID(),
          explanation: 'Authority review requested.',
        }),
      )
    }
    await publishCopyrightCasePurgeCoverage(scene.receipt.notice_id)
    await using query = await beginTransaction()
    for (const family of EU_REPORT_FACT_FAMILIES) {
      const page = await readEuCopyrightReportCoveragePage(
        query,
        scene.receipt.notice_id,
        family,
        null,
        1,
      )
      expect(page.covered).toBe(true)
      expect(page.nextId).toEqual(expect.any(String))
      expect(page.lastLegalActivityAt).toBeInstanceOf(Date)
      expect(page.hasMore).toBe(family === 'supervised_complaints' || family === 'escalations')
    }
    const ids = complaints.map(complaint => complaint.id).toSorted()
    const first = await readEuCopyrightReportCoveragePage(
      query,
      scene.receipt.notice_id,
      'supervised_complaints',
      null,
      1,
    )
    expect(first.nextId).toBe(ids[0])
    const second = await readEuCopyrightReportCoveragePage(
      query,
      scene.receipt.notice_id,
      'supervised_complaints',
      first.nextId,
      1,
    )
    expect(second).toMatchObject({ covered: true, hasMore: false, nextId: ids[1] })
  })

  it('does not authorize an absent EU case and rejects unbounded page sizes', async () => {
    await using query = await beginTransaction()
    expect(
      await readEuCopyrightReportCoveragePage(query, randomUUID(), 'receipts', null, 1),
    ).toEqual({
      covered: false,
      hasMore: false,
      nextId: null,
      lastLegalActivityAt: null,
    })
    for (const limit of [0, 101, 1.5]) {
      await expect(
        readEuCopyrightReportCoveragePage(query, randomUUID(), 'receipts', null, limit),
      ).rejects.toThrow('Invalid coverage page size')
      await expect(
        readCopyrightCaseGlobalReportCoveragePage(query, randomUUID(), 'notices', null, limit),
      ).rejects.toThrow('Invalid copyright report coverage page size')
    }
  })

  it('removes one exclusive thread intake per page while retaining its delivery receipt', async () => {
    const scene = await createRetentionMinimalCase()
    const first = await createUnparsedCopyrightEmailIntake()
    const second = await createUnparsedCopyrightEmailIntake()
    for (const intake of [first, second]) {
      expect(
        await linkCopyrightEmailIntakeToNotice({
          intakeId: intake.id,
          noticeId: scene.noticeId,
          linkKind: 'thread',
        }),
      ).toBe(true)
    }
    await using query = await beginTransaction()
    expect(await deleteCopyrightCaseEmailThreadLinkPage(query, randomUUID())).toBe(false)
    expect(await deleteCopyrightCaseEmailThreadLinkPage(query, scene.noticeId)).toBe(true)
    await query.commit()
    expect(await readCopyrightCaseThreadPurgeState(first.id)).toEqual({
      intake: false,
      link: false,
      receipt: true,
    })
    expect(await readCopyrightCaseThreadPurgeState(second.id)).toEqual({
      intake: true,
      link: true,
      receipt: true,
    })
    await using next = await beginTransaction()
    expect(await deleteCopyrightCaseEmailThreadLinkPage(next, scene.noticeId)).toBe(true)
    expect(await deleteCopyrightCaseEmailThreadLinkPage(next, scene.noticeId)).toBe(false)
    await next.commit()
    expect(await readCopyrightCaseThreadPurgeState(second.id)).toEqual({
      intake: false,
      link: false,
      receipt: true,
    })
  })
})
