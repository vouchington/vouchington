import { randomUUID } from 'node:crypto'
import { onTestFinished } from 'vitest'
import { deleteTerminalRetentionFixtureForTest } from './terminal-retention-cleanup.mts'
import { beginTransaction } from '@data-stores/psql'
import { getActorUri } from '../modules/activitypub-uris/index.mts'
import { dispatchInboundActivity } from '../services/ap-inbox-activities/dispatch-activity.mts'
import { getTerminalActivityIdentityRetentionDays } from '../services/ap-inbox-activities/config.mts'
import { cleanupActivityPubTerminalIdentityPages } from '../services/data-retention/cleanup-activitypub-tombstones.mts'
import { createTerminalActivityRetentionProcessor } from '../workers/psql/processors/activitypub-terminal-retention.mts'
import { createFederatedUser, createRemoteActorFixture } from './ap-inbox-activity-fixtures.mts'
import {
  scopeTerminalActivityQueryForTest,
  readTerminalActivityIdentitiesForTest,
  setTerminalActivityTimeForTest,
} from './activitypub-terminal-identities.mts'
import { withCommittedPostgresTransactionForTest } from './postgres-transaction.mts'

/** Real family dispatcher and worker factory, narrowed to committed owned terminal Follow rows. */
export async function createScopedTerminalRetentionProcessorForTest() {
  const actor = await createRemoteActorFixture()
  let userId: string | null = null
  const recordedActivityIds: string[] = []
  let closeQueue: (() => Promise<void>) | undefined
  let cleanupPromise: Promise<void> | undefined
  const cleanup = () =>
    (cleanupPromise ??= (async () => {
      // A failed close stops cleanup: never delete rows while their queue can still execute.
      await closeQueue?.()
      await deleteTerminalRetentionFixtureForTest({
        actorId: actor.id,
        actorUri: actor.actor_uri,
        userId,
        activityIds: recordedActivityIds,
      })
    })())
  onTestFinished(cleanup)
  userId = (await createFederatedUser()).id
  const target = getActorUri(userId)
  const activityIds = [1, 2].map(() => `https://remote.example/activities/${randomUUID()}`)
  recordedActivityIds.push(...activityIds)
  const oldAt = new Date(Date.now() - (getTerminalActivityIdentityRetentionDays() + 1) * 86_400_000)
  for (const id of activityIds) {
    await dispatchInboundActivity(actor, {
      id,
      type: 'Follow',
      actor: actor.actor_uri,
      object: target,
    })
    const undoId = `https://remote.example/activities/${randomUUID()}`
    recordedActivityIds.push(undoId)
    await dispatchInboundActivity(actor, {
      id: undoId,
      type: 'Undo',
      actor: actor.actor_uri,
      object: { id, type: 'Follow', object: target },
    })
  }
  const ids = await withCommittedPostgresTransactionForTest(async query => {
    for (const id of activityIds) await setTerminalActivityTimeForTest(query, 'follow', id, oldAt)
    return (await readTerminalActivityIdentitiesForTest(query, 'follow', activityIds)).map(
      row => row.id,
    )
  })
  const pages: { deleted: number; hasMore: boolean }[] = []
  const process = createTerminalActivityRetentionProcessor(async (kind, limits) => {
    const openTransaction: typeof beginTransaction = async options => {
      const transaction = await beginTransaction(options)
      const scoped = scopeTerminalActivityQueryForTest(transaction, kind, ids)
      return new Proxy(transaction, {
        apply(_target, thisArgument, args: Parameters<typeof transaction>) {
          return Reflect.apply(scoped, thisArgument, args)
        },
      })
    }
    const result = await cleanupActivityPubTerminalIdentityPages(kind, limits, openTransaction)
    pages.push(result)
    return result
  })
  return {
    process,
    pages,
    cleanup,
    registerQueueCleanup: (close: () => Promise<void>) => {
      closeQueue = close
    },
  }
}
