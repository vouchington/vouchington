import { buildPageInfo, createPaginationParser, decodeScopedUuidCursor } from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'
import {
  copyrightGuestCapabilityCursorScope,
  listCopyrightGuestCapabilities,
} from './guest-capability-listing.mts'

export const copyrightGuestCapabilitiesParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

export async function listCopyrightGuestCapabilityPage(
  currentUser: PrivateUser,
  noticeId: string,
  args: { after?: string; limit: number },
) {
  const scope = copyrightGuestCapabilityCursorScope(noticeId)
  const afterId = args.after
    ? decodeScopedUuidCursor(args.after, scope, 'Invalid cursor format').id
    : undefined
  const { results, hasNextPage } = await listCopyrightGuestCapabilities({
    currentUser,
    noticeId,
    limit: args.limit,
    afterId,
  })
  return {
    copyright_guest_capabilities: results.map(capability => ({
      id: capability.id,
      issued_at: capability.issued_at.toISOString(),
      issued_by_id: capability.issued_by_id,
      issued_by_username: capability.issued_by_username,
      expires_at: capability.expires_at.toISOString(),
      revoked_at: capability.revoked_at?.toISOString() ?? null,
    })),
    page_info: buildPageInfo(results, { hasNextPage, getCursor: row => ({ id: row.id, scope }) }),
  }
}
