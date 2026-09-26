const excludedListIds = new Set<string>()

export function resetListMembership(): void {
  excludedListIds.clear()
}

export function applyListMembership(endpoint: string, present: boolean): void {
  const listId = endpoint.match(/^\/api\/v1\/lists\/([^/]+)\/items\/posts(?:\/|$)/)?.[1]
  if (!listId) return
  if (present) excludedListIds.delete(listId)
  else excludedListIds.add(listId)
}

export function containedListIds(listIds: string[]): string[] {
  return listIds.filter(listId => !excludedListIds.has(listId))
}
