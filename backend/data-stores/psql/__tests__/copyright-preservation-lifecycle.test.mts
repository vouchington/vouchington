import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getMinUUIDv7ForDate, getMaxUUIDv7ForDate, mintUUIDv7 } from '@modules/utils/ids'
import { createCopyrightNoticeForManualAssociation } from '@voucha/test-helpers/copyright-email-manual-association'
import { readTestCopyrightLifecycleCoverage } from '@voucha/test-helpers/copyright-preservation-coverage-interleave'

describe('case hold lifecycle history coverage', () => {
  it('inventories early and same-millisecond lifecycle rows across the complete held case cohort', async () => {
    const now = new Date()
    const early = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 123))
    const later = new Date(Math.max(early.getTime() + 2, now.getTime()))
    const earlyId = getMaxUUIDv7ForDate(early).slice(0, 16) + randomUUID().slice(16)
    const laterId = getMaxUUIDv7ForDate(later).slice(0, 16) + randomUUID().slice(16)
    const first = await createCopyrightNoticeForManualAssociation(
      true,
      'us_dmca',
      'early coverage',
      earlyId,
    )
    const second = await createCopyrightNoticeForManualAssociation(
      true,
      'us_dmca',
      'later coverage',
      laterId,
    )
    expect(
      await readTestCopyrightLifecycleCoverage(
        [second, first],
        [
          { noticeId: first, id: getMinUUIDv7ForDate(early) },
          { noticeId: first, id: getMinUUIDv7ForDate(new Date(early.getTime() + 1)) },
          { noticeId: second, id: getMinUUIDv7ForDate(later) },
        ],
      ),
    ).toBe(3)
    expect(await readTestCopyrightLifecycleCoverage([], [])).toBe(0)
    expect(await readTestCopyrightLifecycleCoverage([mintUUIDv7()], [])).toBe(0)
  })
})
