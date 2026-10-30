import { describe, expect, it } from 'vitest'
import { shiftUtcCalendarMonths } from '@modules/utils/calendar-months'
import { createRetentionEmailCase } from '@voucha/test-helpers/services/copyright-notices/retention-email-case'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  advanceCopyrightRetentionWorkPages,
  useCopyrightRetentionWorkClock,
} from '@voucha/test-helpers/copyright-retention-work'
import { appendCopyrightEmailIntakeRecommendation } from './email-recommendations.mts'
import { purgeCopyrightMinimalRecord } from '@voucha/test-helpers/copyright-minimal-purge'
import { getCopyrightEmailIntakeForAgent } from './email-intake-parses.mts'
import {
  readCopyrightRetentionCaseRows,
  readCopyrightRetentionCaseCreatedAt,
} from '@voucha/test-helpers/copyright-postroot-retention'

const RETENTION_START = new Date('2029-10-23T00:00:00.000Z')
const WORK_PAGE_CAP = 128

describe('erased copyright intake write fence', () => {
  useFakeCopyrightEvidenceBucket()
  const setClock = useCopyrightRetentionWorkClock()

  it('rejects a late recommendation write after a promoted email case is purged', async () => {
    await setClock(RETENTION_START)
    const notice = await createRetentionEmailCase()
    // UUIDv7 issuance can remain ahead of a clock reset in a reused worker. Age this real
    // promoted case from its recorded creation fact, never from the eligibility projection.
    const createdAt = await readCopyrightRetentionCaseCreatedAt(notice.noticeId)
    const lastActivity = new Date(Math.max(RETENTION_START.getTime(), createdAt.getTime()))
    const retentionEnd = shiftUtcCalendarMonths(lastActivity, 72)
    await expect(readCopyrightRetentionCaseRows(notice.noticeId)).resolves.toMatchObject({
      notice_exists: true,
      identity_exists: true,
      promoted_review_count: 1,
    })

    await setClock(retentionEnd)
    expect(await advanceCopyrightRetentionWorkPages(notice.noticeId, WORK_PAGE_CAP)).toContain(
      'erased',
    )
    await expect(getCopyrightEmailIntakeForAgent(notice.intakeId)).resolves.toBeNull()
    await expect(
      purgeCopyrightMinimalRecord(notice.noticeId, {
        now: retentionEnd,
        cutoff: lastActivity,
        maxBatches: WORK_PAGE_CAP,
      }),
    ).resolves.toBe('purged')
    await expect(readCopyrightRetentionCaseRows(notice.noticeId)).resolves.toEqual({
      notice_exists: false,
      identity_exists: false,
      work_exists: false,
      root_purged_at: null,
      party_count: 0,
      promoted_review_count: 0,
    })

    await expect(
      appendCopyrightEmailIntakeRecommendation({
        intakeId: notice.intakeId,
        inputSha256: Buffer.alloc(32, 5),
        promptVersion: 'retention-erased-intake-test-v1',
        model: 'retention-erased-intake-test',
        structuredOutput: { privateRecommendation: crypto.randomUUID() },
      }),
    ).resolves.toBe(false)
    await expect(readCopyrightRetentionCaseRows(notice.noticeId)).resolves.toMatchObject({
      notice_exists: false,
      promoted_review_count: 0,
    })
  })
})
