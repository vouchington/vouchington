import type { TransactionQuery } from '@data-stores/psql/types'
import { encodeScopedTierPreciseUuidCursor } from '@modules/pagination'
import { copyrightStaffQueueCursorScope } from '../services/copyright-notices/read-models-staff.mts'
import type { createRequest } from './api/server.mts'
import { firstOwnedKey, requiredWindowCount, nativeKeyPage } from './copyright-staff-queue-keys.mts'

type QueueCase = {
  id: string
  reasons: string[]
  waiting_since: string
  next_deadline: { escalation_at: string; restoration_deadline_at: string } | null
}
export type QueuePage = {
  copyright_notices: QueueCase[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

/** Walks actual HTTP pages only through required cases and explicit interleaving controls. */
export async function readCopyrightStaffQueueWindow({
  transaction,
  request,
  ids,
  controls,
  boost,
  limit,
  now,
}: {
  transaction: TransactionQuery
  request: ReturnType<typeof createRequest>
  ids: readonly string[]
  controls: readonly string[]
  boost: boolean
  limit: 1 | 100
  now: Date
}): Promise<QueuePage & { observedIds: string[]; rawObservedIds: string[] }> {
  const requiredIds = [...new Set([...ids, ...controls])]
  const key = await firstOwnedKey(transaction, requiredIds, boost, now)
  let after = encodeScopedTierPreciseUuidCursor(
    key.before,
    key.tier,
    key.id,
    copyrightStaffQueueCursorScope,
  )
  const count = await requiredWindowCount(transaction, key, requiredIds, boost, now)
  const owned: QueueCase[] = []
  const cursors = new Set<string>([after])
  const seenOwned = new Set<string>()
  const observedIds = new Set<string>()
  const rawObservedIds = new Set<string>()
  // Walk the real snapshot only until all owned cases and interleaving controls are seen.
  for (let remaining = count; remaining > 0; remaining -= limit) {
    const nativePage = await nativeKeyPage(transaction, after, boost, limit, now)
    const expectedHasNext = nativePage.length > limit
    const last = expectedHasNext ? nativePage[limit - 1] : undefined
    const expectedCursor = last
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
    // The real list omits keys whose notice has no readable claimant-contact purpose.
    const nativeIds = nativePage.slice(0, limit).map(item => item.id)
    for (const id of nativeIds) rawObservedIds.add(id)
    let previousIndex = -1
    for (const item of page.copyright_notices) {
      const index = nativeIds.indexOf(item.id)
      if (index <= previousIndex)
        throw new Error('HTTP rows are not an ordered subsequence of the real native key page')
      previousIndex = index
    }
    const endCursor = page.page_info.end_cursor
    if (page.page_info.has_next_page !== expectedHasNext || endCursor !== expectedCursor) {
      throw new Error('HTTP page metadata differs from the real native key page')
    }
    for (const item of page.copyright_notices) {
      if (observedIds.has(item.id)) throw new Error('HTTP walk repeated a notice')
      observedIds.add(item.id)
    }
    for (const item of page.copyright_notices.filter(item => ids.includes(item.id))) {
      if (seenOwned.has(item.id)) throw new Error('HTTP walk repeated an owned notice')
      seenOwned.add(item.id)
      owned.push(item)
    }
    if (requiredIds.every(id => observedIds.has(id)))
      return {
        copyright_notices: owned,
        page_info: page.page_info,
        observedIds: [...observedIds],
        rawObservedIds: [...rawObservedIds],
      }
    if (!page.page_info.has_next_page) {
      throw new Error('HTTP queue ended before all owned cases and controls')
    }
    const next = endCursor
    if (!next || cursors.has(next)) throw new Error('HTTP queue cursor did not advance')
    cursors.add(next)
    after = next
  }
  throw new Error('HTTP queue exceeded its required native window')
}
