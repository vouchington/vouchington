import type { ListResponse } from '@/types/api-responses'
import type { RewardsProgramStatus } from '@/types/my'

export function mergeRewardsProgramStatusPages(
  pages: Array<ListResponse<RewardsProgramStatus>>,
  upserts: Map<string, RewardsProgramStatus>,
  deletedIds: Set<string>,
): RewardsProgramStatus[] {
  const statuses = new Map<string, RewardsProgramStatus>()
  for (const page of pages) {
    for (const status of page.results) statuses.set(status.id, status)
  }
  for (const [id, status] of upserts) statuses.set(id, status)
  for (const id of deletedIds) statuses.delete(id)
  return [...statuses.values()].toSorted((left, right) => left.id.localeCompare(right.id))
}
