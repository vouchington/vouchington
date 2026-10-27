import type { TransactionQuery } from '@data-stores/psql/types'
import { encodeScopedTierPreciseUuidCursor } from '@modules/pagination'
import { copyrightStaffQueueCursorScope } from '../services/copyright-notices/read-models-staff.mts'
import type { createRequest } from './api/server.mts'
import { nativeKeyPage, ownedKeys } from './copyright-staff-queue-keys.mts'
import { uuidBefore } from './uuid-before.mts'

type QueueCase = {
  id: string
  reasons: string[]
  waiting_since: string
  next_deadline: { escalation_at: string; restoration_deadline_at: string } | null
}
export type QueuePage = {
  copyright_notices: QueueCase[]
  page_info: {
    has_next_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
}

/** Read one real HTTP page at each owned key, with fixed work independent of foreign suffixes. */
export async function readOwnedCopyrightQueueWindows(
  query: TransactionQuery,
  request: ReturnType<typeof createRequest>,
  ids: readonly string[],
  boost: boolean,
  limit: 1 | 100,
  now: Date,
): Promise<QueuePage> {
  const keys = await ownedKeys(query, ids, boost, now)
  const cases: QueueCase[] = []
  const seen = new Set<string>()
  let lastPageInfo: QueuePage['page_info'] | undefined
  for (const key of keys) {
    // The exact UUID predecessor at the same instant makes this case the first key,
    // even when unrelated notices share its timestamp.
    const after = encodeScopedTierPreciseUuidCursor(
      key.timestamp,
      key.tier,
      uuidBefore(key.id),
      copyrightStaffQueueCursorScope,
    )
    const nativePage = await nativeKeyPage(query, after, boost, limit, now)
    if (nativePage[0]?.id !== key.id) throw new Error('Owned key is not first in native window')
    const hasNext = nativePage.length > limit
    const last = hasNext ? nativePage[limit - 1] : undefined
    const expectedStart = encodeScopedTierPreciseUuidCursor(
      key.timestamp,
      key.tier,
      key.id,
      copyrightStaffQueueCursorScope,
    )
    const expectedEnd = last
      ? encodeScopedTierPreciseUuidCursor(
          last.timestamp,
          last.tier,
          last.id,
          copyrightStaffQueueCursorScope,
        )
      : null
    const response = await request
      .get(
        `/api/v1/copyright-notices/review-queue?limit=${limit}&after=${encodeURIComponent(after)}`,
      )
      .expect(200)
    const page = response.body as QueuePage
    if (
      page.page_info.has_next_page !== hasNext ||
      page.page_info.start_cursor !== expectedStart ||
      page.page_info.end_cursor !== expectedEnd
    ) {
      throw new Error('HTTP page metadata differs from the real native key window')
    }
    const first = page.copyright_notices[0]
    if (first?.id !== key.id) throw new Error('HTTP queue omitted the first owned key')
    if (seen.has(first.id)) throw new Error('HTTP windows repeated an owned notice')
    seen.add(first.id)
    cases.push(first)
    lastPageInfo = page.page_info
  }
  return { copyright_notices: cases, page_info: lastPageInfo! }
}
