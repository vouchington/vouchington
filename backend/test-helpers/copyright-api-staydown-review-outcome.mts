import { expect } from 'vitest'
import type { createRequest } from './api/server.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import {
  readCopyrightStaydownEntries,
  readCopyrightStaydownMatches,
} from './data-stores/psql/copyright-staydown.mts'

/** This endpoint is a single ordinary SQL write, so keep strict success and nonwriting replay. */
export async function assertCopyrightApiStaydownReview(input: {
  staff: ReturnType<typeof createRequest>
  noticeId: string
  matchId: string
  reviewerId: string
}) {
  const read = async () => ({
    aggregate: await getCopyrightNoticePrivateAggregate(input.noticeId),
    entries: await readCopyrightStaydownEntries(input.noticeId),
    matches: await readCopyrightStaydownMatches(input.noticeId),
  })
  const before = await read()
  const path = `/api/v1/copyright-notices/${input.noticeId}/staydown-matches/${input.matchId}/reviews`
  const first = await input.staff.post(path).expect(200)
  expect(first.body).toEqual({ reviewed: true })
  const after = await read()
  expect(after).toEqual({
    ...before,
    matches: before.matches.map(row =>
      row.id === input.matchId
        ? { ...row, reviewed_at: expect.any(Date), reviewed_by_id: input.reviewerId }
        : row,
    ),
  })
  const second = await input.staff.post(path).expect(200)
  expect(second.body).toEqual({ reviewed: false })
  expect(await read()).toEqual(after)
}
