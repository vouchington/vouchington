import { encodeScopedTierPreciseUuidCursor } from '@modules/pagination'
import { copyrightStaffQueueCursorScope } from '../services/copyright-notices/read-models-staff.mts'
import type { createRequest } from './api/server.mts'
import { firstOwnedKey, nativeWindowIds } from './copyright-staff-queue-keys.mts'

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

/** Walks actual HTTP pages until the owned cases and explicit interleaving controls appear. */
export async function readCopyrightStaffQueueWindow({
  request,
  ids,
  controls,
  boost,
  limit,
}: {
  request: ReturnType<typeof createRequest>
  ids: readonly string[]
  controls: readonly string[]
  boost: boolean
  limit: 1 | 100
}): Promise<QueuePage & { observedIds: string[]; rawObservedIds: string[] }> {
  const requiredIds = [...new Set([...ids, ...controls])]
  const key = await firstOwnedKey(requiredIds, boost)
  let after = encodeScopedTierPreciseUuidCursor(
    key.before,
    key.tier,
    key.id,
    copyrightStaffQueueCursorScope,
  )
  const rawObservedIds = await nativeWindowIds(key, requiredIds, boost)
  const owned: QueueCase[] = []
  const cursors = new Set<string>([after])
  const seenOwned = new Set<string>()
  const observedIds = new Set<string>()
  for (;;) {
    const response = await request
      .get(
        `/api/v1/copyright-notices/review-queue?limit=${limit}&after=${encodeURIComponent(after)}`,
      )
      .expect(200)
    const page = response.body as QueuePage
    for (const item of page.copyright_notices) {
      if (observedIds.has(item.id)) throw new Error('HTTP walk repeated a notice')
      observedIds.add(item.id)
      if (!ids.includes(item.id)) continue
      if (seenOwned.has(item.id)) throw new Error('HTTP walk repeated an owned notice')
      seenOwned.add(item.id)
      owned.push(item)
    }
    if (requiredIds.every(id => observedIds.has(id))) {
      return {
        copyright_notices: owned,
        page_info: page.page_info,
        observedIds: [...observedIds],
        rawObservedIds,
      }
    }
    if (!page.page_info.has_next_page) {
      throw new Error('HTTP queue ended before all owned cases and controls')
    }
    const next = page.page_info.end_cursor
    if (!next || cursors.has(next)) throw new Error('HTTP queue cursor did not advance')
    cursors.add(next)
    after = next
  }
}
