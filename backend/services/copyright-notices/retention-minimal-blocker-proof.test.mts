import { describe, expect, it } from 'vitest'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import {
  advanceUnrelatedAccountClock,
  admitLateCopyrightAppeal,
  copyrightCaseExists,
  readMinimalBlockerCursor,
  readMinimalProofFormAuthority,
  resolveQualifiedCourtHold,
  seedQualifiedCourtHold,
  seedTerminalSubmissionPages,
} from '@voucha/test-helpers/entities/copyright-minimal-blocker-proof'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  advanceCopyrightRetentionWorkPages,
  useCopyrightRetentionWorkClock,
} from '@voucha/test-helpers/copyright-retention-work'
import { readCopyrightRetentionMarker } from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import { purgeCopyrightMinimalRecord } from './retention-minimal-purge.mts'

const RETENTION_START = new Date('2029-10-23T00:00:00.000Z')
const RETENTION_END = new Date('2035-10-23T00:00:00.000Z')
const WORK_PAGE_CAP = 128

async function advanceUntilBlockerCursor(
  noticeId: string,
  accept: (cursor: string) => boolean,
): Promise<Awaited<ReturnType<typeof readMinimalBlockerCursor>>> {
  for (let page = 0; page < WORK_PAGE_CAP; page += 1) {
    await advanceCopyrightRetentionWorkPages(noticeId, 1)
    const cursor = await readMinimalBlockerCursor(noticeId)
    if (cursor.blocker_phase_index === 0 && cursor.blocker_cursor && accept(cursor.blocker_cursor))
      return cursor
  }
  throw new Error('Copyright blocker proof never reached a submission page cursor')
}

describe('bounded copyright minimal blocker proof', () => {
  useFakeCopyrightEvidenceBucket()
  const setClock = useCopyrightRetentionWorkClock()

  it('records actual current screening and compliant form authority before retaining the case', async () => {
    await setClock(RETENTION_START)
    const { notice, screeningId } = await createClearScreenedForm(1, {}, { now: RETENTION_START })
    const noticeId = notice.intake.copyright_notice_id
    const submissionId = notice.intake.copyright_notice_submission_id
    await appendCopyrightSubmissionAssessment({
      submissionId,
      currentUser: null,
      assessedAt: RETENTION_START,
      substantiallyCompliant: true,
      copyrightFormScreeningId: screeningId,
    })

    await setClock(RETENTION_END)
    expect(await advanceCopyrightRetentionWorkPages(noticeId, WORK_PAGE_CAP)).toContain(
      'ineligible',
    )
    expect(await readMinimalProofFormAuthority(submissionId, screeningId, noticeId)).toEqual({
      current_screening: true,
      has_valid_target: true,
      has_claimant_receipt: true,
      has_compliant_form_assessment: true,
    })
    await expect(readCopyrightRetentionMarker(noticeId)).resolves.toBeNull()
  })

  it('keeps a qualified court hold until resolution, then erases and purges at the new boundary', async () => {
    await setClock(RETENTION_START)
    const fixture = await createRetentionMinimalCase()
    const assessmentId = await seedQualifiedCourtHold(
      fixture.noticeId,
      fixture.moderator,
      fixture.targetId,
    )

    await setClock(RETENTION_END)
    expect(await advanceCopyrightRetentionWorkPages(fixture.noticeId, WORK_PAGE_CAP)).toContain(
      'ineligible',
    )
    await expect(readCopyrightRetentionMarker(fixture.noticeId)).resolves.toBeNull()

    await resolveQualifiedCourtHold(assessmentId, fixture.moderator)
    const resolvedBoundary = new Date('2041-10-23T00:00:00.000Z')
    await setClock(resolvedBoundary)
    expect(await advanceCopyrightRetentionWorkPages(fixture.noticeId, WORK_PAGE_CAP)).toContain(
      'erased',
    )
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: resolvedBoundary,
        cutoff: RETENTION_END,
        maxBatches: WORK_PAGE_CAP,
      }),
    ).resolves.toBe('purged')
    expect(await copyrightCaseExists(fixture.noticeId)).toBe(false)
  })

  it('continues a real submission proof cursor across an unrelated account mutation', async () => {
    await setClock(RETENTION_START)
    const fixture = await createRetentionMinimalCase()
    await seedTerminalSubmissionPages(fixture.noticeId)
    await setClock(RETENTION_END)

    // Other tests share the global mutation sequence and report generation, so the number of
    // pages before the first submission page is not fixed. Advance one page at a time until this
    // case owns a mid-phase cursor.
    const first = await advanceUntilBlockerCursor(fixture.noticeId, () => true)
    expect(first.blocker_phase_index).toBe(0)

    await advanceUnrelatedAccountClock()
    const afterUnrelated = await advanceUntilBlockerCursor(
      fixture.noticeId,
      cursor => cursor !== first.blocker_cursor,
    )
    expect(afterUnrelated.blocker_phase_index).toBe(0)
    expect(afterUnrelated.blocker_cursor).not.toBe(first.blocker_cursor)

    expect(await advanceCopyrightRetentionWorkPages(fixture.noticeId, WORK_PAGE_CAP)).toContain(
      'erased',
    )
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: RETENTION_END,
        cutoff: RETENTION_START,
        maxBatches: WORK_PAGE_CAP,
      }),
    ).resolves.toBe('purged')
  })

  it('rejects a late appeal write after real case erasure has started', async () => {
    await setClock(RETENTION_START)
    const fixture = await createRetentionMinimalCase()
    await setClock(RETENTION_END)
    expect(await advanceCopyrightRetentionWorkPages(fixture.noticeId, WORK_PAGE_CAP)).toContain(
      'erased',
    )

    await expect(admitLateCopyrightAppeal(fixture.noticeId)).rejects.toThrow(
      'copyright case has expired',
    )
    await expect(readCopyrightRetentionMarker(fixture.noticeId)).resolves.not.toBeNull()
    expect(await copyrightCaseExists(fixture.noticeId)).toBe(true)
  })
})
