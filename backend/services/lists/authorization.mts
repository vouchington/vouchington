/**
 * List-route authorization contract — cross-file summary
 *
 * Mutation routes (POST/PATCH/DELETE) in backend/api/v1/lists apply guards at
 * two layers. Every list mutation route must apply both layers in full.
 *
 * Route layer:
 *   - POST/PATCH/DELETE: requireAuth + assertNotSuspended
 *   - PATCH/DELETE list, item add/remove, and import: currentUserCanManageList → 403
 *
 * Service layer:
 *   - update/delete/import: currentUserCanManageList → 403
 *   - item add/remove: route-layer ownership only; storage is list-id scoped
 *
 * Rejection-path tests: backend/api/v1/lists/lists.suspension-guard.test.mts
 */
export function currentUserCanManageList(
  currentUserId: string,
  list: { owner_user_id: string; removed_at: Date | null },
): boolean {
  return list.removed_at === null && list.owner_user_id === currentUserId
}

export function currentUserCanViewList(
  currentUserId: string | null,
  list: { owner_user_id: string; removed_at: Date | null; visibility: string },
): boolean {
  if (list.removed_at !== null) return false
  if (list.owner_user_id === currentUserId) return true
  return list.visibility !== 'private'
}
