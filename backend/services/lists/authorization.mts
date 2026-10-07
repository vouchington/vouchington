/**
 * List-write authorization contract — cross-file summary
 *
 * Every list write has two callers with the same rules: the mutation routes in backend/api/v1/lists
 * and the MCP list tools in backend/mcp. Each applies the guards below in full.
 *
 * Caller layer (route or tool):
 *   - POST/PATCH/DELETE: an authenticated caller who passes assertNotSuspended
 *   - PATCH/DELETE list, item add/remove, and import: getManageableList → 404 / 403
 *     (the only way to obtain a ManageableList, which the update helper requires)
 *
 * Service layer:
 *   - update/delete/import: currentUserCanManageList → 403
 *   - item add/remove: caller-layer ownership only; storage is list-id scoped
 *
 * Rejection-path tests: backend/api/v1/lists/lists.suspension-guard.test.mts and
 * backend/mcp/list-write-tools.contract.test.mts
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
