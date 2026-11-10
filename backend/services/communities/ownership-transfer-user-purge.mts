import { read, type TransactionQuery } from '@data-stores/psql'
import { lockActiveUserLifecyclesForMutation } from '@services/users/active-user-lifecycle-lock'
import { enqueueBulkSendCommunityOwnershipTransferEmails } from '@queues/emails/enqueues'
import {
  createCommunityLifecycleNotifications,
  enqueueCommunityLifecycleNotificationPush,
} from '@services/notifications'
import { getSiteUrl } from '@modules/utils'
import { runSequentially } from '@modules/utils/run-sequentially'
import sql from 'sql-template-strings'
import { transferLockedCommunitiesOwnership } from './ownership-transfer-core.mts'
import { buildOwnershipTransferNotifications } from './ownership-transfer-notifications.mts'
import type { Community } from './types.mts'

type PurgeCommunity = Pick<Community, 'id' | 'name' | 'slug'>
type PurgeOwnershipCandidate = { communityId: string; successorId: string }
type PurgeOwnershipTransfer = { community: PurgeCommunity; successorId: string }

/**
 * Reads the page's active successors, then takes their lifecycle fences. The active-user guard
 * raises for an inactive subject, which would poison the caller-owned transaction, so only active
 * users get it.
 */
export async function lockUserPurgeOwnership(
  query: TransactionQuery,
  candidates: readonly PurgeOwnershipCandidate[],
): Promise<void> {
  const successorIds = [...new Set(candidates.map(candidate => candidate.successorId))]
  let activeIds: string[] = []
  await runSequentially([
    async () => {
      if (successorIds.length === 0) return
      const { rows } = await query<{ id: string }>(sql`/* lockUserPurgeOwnership:active */
        SELECT id FROM users WHERE id = ANY(${successorIds}::uuid[]) AND deleted_at IS NULL`)
      activeIds = rows.map(row => row.id)
    },
    () => lockActiveUserLifecyclesForMutation(query, activeIds),
  ])
}

/**
 * Transfers a locked page in one statement. A community whose successor stopped being an eligible
 * moderator is left untouched and omitted from `transferred`. Callers must hold
 * `lockUserPurgeOwnership` for these communities.
 */
export async function transferCommunitiesOwnershipForUserPurge(
  query: TransactionQuery,
  fromUserId: string,
  transfers: readonly PurgeOwnershipTransfer[],
): Promise<{ transferred: string[]; afterCommit: (() => Promise<void>) | null }> {
  const outcomes = await transferLockedCommunitiesOwnership(
    transfers.map(({ community, successorId }) => ({
      communityId: community.id,
      fromUserId,
      toUserId: successorId,
    })),
    { query },
  )
  const done = transfers.flatMap((transfer, index) => {
    const transition = outcomes[index]!.transition
    return transition ? [{ ...transfer, transition }] : []
  })
  if (done.length === 0) return { transferred: [], afterCommit: null }
  const notifications = await createCommunityLifecycleNotifications(
    done.flatMap(({ community, successorId, transition }) =>
      buildOwnershipTransferNotifications(community, successorId, transition),
    ),
    { query },
  )
  return {
    transferred: done.map(({ community }) => community.id),
    afterCommit: async () => {
      await enqueueCommunityLifecycleNotificationPush(notifications)
      await enqueueSuccessorEmails(done)
    },
  }
}

async function enqueueSuccessorEmails(done: readonly PurgeOwnershipTransfer[]): Promise<void> {
  const { rows } = await read<{ id: string; ui_locale: string | null }>(
    sql`/* enqueuePurgeOwnershipTransferEmails:recipients */
      SELECT id, ui_locale FROM users WHERE id = ANY(${done.map(({ successorId }) => successorId)}::uuid[]) AND deleted_at IS NULL`,
  )
  const locales = new Map(rows.map(row => [row.id, row.ui_locale]))
  const recipients = done.filter(({ successorId }) => locales.has(successorId))
  await enqueueBulkSendCommunityOwnershipTransferEmails(
    recipients.map(({ community, successorId }) => ({
      input: { userId: successorId, uiLocale: locales.get(successorId) ?? null },
      variables: {
        communityName: community.name,
        communityUrl: getSiteUrl(`/communities/${community.slug}`),
        recipientRole: 'new_owner' as const,
      },
    })),
  )
}
