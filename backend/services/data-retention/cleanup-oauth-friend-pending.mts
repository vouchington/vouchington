import { read } from '@data-stores/psql'

export const providers = ['facebook', 'github', 'x'] as const
export type FriendProvider = (typeof providers)[number]
export type OAuthFriendEdgeScope = {
  provider?: FriendProvider
  phase?: 'erase' | 'resolve' | 'repair'
  accountId?: string
}

export async function hasPendingOAuthFriendEdgeWork(
  now: Date,
  scope: OAuthFriendEdgeScope = {},
): Promise<boolean> {
  const accountFilter = scope.accountId ? ' AND id = $2::uuid' : ''
  const eraseFilter = scope.phase && scope.phase !== 'erase' ? ' AND FALSE' : ''
  const resolveFilter = scope.phase && scope.phase !== 'resolve' ? ' AND FALSE' : ''
  const selectedProviders = providers.filter(
    provider => !scope.provider || provider === scope.provider,
  )
  // Keep ordered probes visible: generic EXISTS plans can otherwise price a sequential scan
  // as a cheap early match even when every marker is already complete.
  const pendingFor = (provider: FriendProvider) => `
    EXISTS (WITH pending AS MATERIALIZED (
      SELECT id FROM ${provider}_accounts
      WHERE friend_edges_invalidated_at IS NOT NULL
        AND friend_edges_invalidated_at < $1::timestamptz${eraseFilter}${accountFilter}
        AND friend_edges_cleanup_completed_at IS DISTINCT FROM friend_edges_invalidated_at
      ORDER BY friend_edges_invalidated_at, id LIMIT 1
    ) SELECT 1 FROM pending)
    OR EXISTS (WITH pending AS MATERIALIZED (
      SELECT id FROM ${provider}_accounts
      WHERE user_id IS NOT NULL AND friend_references_resolve_pending_at IS NOT NULL
        AND friend_references_resolve_pending_at < $1::timestamptz${resolveFilter}${accountFilter}
      ORDER BY friend_references_resolve_pending_at, id LIMIT 1
    ) SELECT 1 FROM pending)`
  const { rows } = await read<{ pending: boolean }>(
    `/* hasPendingOAuthFriendEdgeWork */ SELECT ((${selectedProviders.map(pendingFor).join(' OR ')})
      OR ${
        scope.accountId || (scope.phase && scope.phase !== 'repair')
          ? 'FALSE'
          : `EXISTS (
        SELECT 1 FROM oauth_friend_reference_repair_cursors
        WHERE provider = ANY($${scope.accountId ? 3 : 2}::oauth_friend_repair_providers[])
      )`
      }) AS pending`,
    scope.accountId
      ? [now, scope.accountId]
      : scope.phase && scope.phase !== 'repair'
        ? [now]
        : [now, selectedProviders],
  )
  return rows[0]?.pending ?? false
}
