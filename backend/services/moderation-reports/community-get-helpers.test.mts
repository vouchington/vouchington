import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { fetchBanEvasionReports } from './community-get-helpers.mts'
import type { ModerationReportSort } from './sort-sql.mts'

describe('fetchBanEvasionReports', () => {
  it('rejects an unknown runtime sort with and without a cursor', async () => {
    const sort = 'unknown' as ModerationReportSort
    await expect(fetchBanEvasionReports(randomUUID(), 5, sort)).rejects.toThrow(
      'Unknown moderation report sort',
    )
    await expect(
      fetchBanEvasionReports(randomUUID(), 5, sort, { id: randomUUID() }),
    ).rejects.toThrow('Unknown moderation report sort')
  })

  const sorts: Array<ModerationReportSort | undefined> = [
    undefined,
    'severity',
    'most_reported',
    'created_at_desc',
    'created_at_asc',
  ]

  it.each(sorts)('runs the keyset page query for sort %s with and without a cursor', async sort => {
    const communityId = randomUUID()

    await expect(fetchBanEvasionReports(communityId, 5, sort)).resolves.toEqual([])
    await expect(
      fetchBanEvasionReports(communityId, 5, sort, {
        id: randomUUID(),
        reportCount: 1,
        severityRank: 1,
      }),
    ).resolves.toEqual([])
  })
})
