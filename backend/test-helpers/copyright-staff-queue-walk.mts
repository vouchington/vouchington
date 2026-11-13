import { encodeScopedTierPreciseUuidCursor } from '@modules/pagination'
import { copyrightStaffQueueCursorScope } from '../services/copyright-notices/read-models-staff.mts'
import type { createRequest } from './api/server.mts'
import { copyrightQueueAnchors } from './copyright-staff-queue-keys.mts'

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

/** Check actual global HTTP pages at every owned/control key, without walking unrelated tiers. */
export async function readCopyrightStaffQueueWindow({
  request,
  ids,
  controls,
  unreadableControls,
  successorId,
  boost,
  limit,
}: {
  request: ReturnType<typeof createRequest>
  ids: readonly string[]
  controls: readonly string[]
  unreadableControls: readonly string[]
  successorId: string
  boost: boolean
  limit: 1 | 100
}): Promise<QueuePage & { observedIds: string[]; rawObservedIds: string[] }> {
  const requiredIds = [...new Set([...ids, ...controls, ...unreadableControls])]
  const keys = await copyrightQueueAnchors([...requiredIds, successorId], boost)
  if (keys.at(-1)?.id !== successorId)
    throw new Error('Committed queue successor must follow every owned anchor')
  const anchors = keys.filter(key => key.id !== successorId)
  const owned = new Map<string, QueueCase>()
  const observedIds = new Set<string>()
  let lastPage: QueuePage | undefined
  for (const anchor of anchors) {
    const after = encodeScopedTierPreciseUuidCursor(
      anchor.timestamp,
      anchor.tier,
      precedingUuid(anchor.id),
      copyrightStaffQueueCursorScope,
    )
    const response = await request
      .get(
        `/api/v1/copyright-notices/review-queue?limit=${limit}&after=${encodeURIComponent(after)}`,
      )
      .expect(200)
    const page = response.body as QueuePage
    const pageIds = page.copyright_notices.map(row => row.id)
    if (new Set(pageIds).size !== pageIds.length) throw new Error('HTTP page repeated a notice')
    const nativeIds = anchors.flatMap(row => (pageIds.includes(row.id) ? [row.id] : []))
    const observedOwned = pageIds.filter(id => requiredIds.includes(id))
    if (nativeIds.join(',') !== observedOwned.join(','))
      throw new Error('HTTP page changed native owned tuple order')
    for (const id of pageIds) observedIds.add(id)
    const anchorCase = page.copyright_notices.find(row => row.id === anchor.id)
    if (unreadableControls.includes(anchor.id)) {
      if (anchorCase) throw new Error('HTTP queue hydrated an unreadable control')
    } else {
      if (!anchorCase || pageIds[0] !== anchor.id)
        throw new Error('HTTP page skipped its native owned anchor')
      observedIds.add(anchor.id)
      if (ids.includes(anchor.id)) owned.set(anchor.id, anchorCase)
    }
    if (limit === 1) {
      const expectedCursor = encodeScopedTierPreciseUuidCursor(
        anchor.timestamp,
        anchor.tier,
        anchor.id,
        copyrightStaffQueueCursorScope,
      )
      if (!page.page_info.has_next_page || page.page_info.end_cursor !== expectedCursor)
        throw new Error('HTTP page did not preserve its exact global cursor boundary')
      if (pageIds.length !== (unreadableControls.includes(anchor.id) ? 0 : 1))
        throw new Error('HTTP single-row page did not preserve raw-slot hydration')
    }
    if (ids.includes(anchor.id)) lastPage = page
  }
  if (!lastPage || owned.size !== new Set(ids).size)
    throw new Error('HTTP page missed an owned case')
  return {
    copyright_notices: anchors.flatMap(anchor =>
      owned.has(anchor.id) ? [owned.get(anchor.id)!] : [],
    ),
    page_info: lastPage.page_info,
    observedIds: [...observedIds],
    rawObservedIds: anchors.map(anchor => anchor.id),
  }
}

/** There is no UUID between this seek key and the owned UUID, even during parallel inserts. */
function precedingUuid(id: string) {
  const hex = (BigInt(`0x${id.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
