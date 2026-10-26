import { beginTransaction } from '@data-stores/psql'
import { cleanupSweepWithQuery } from './cleanup-federation-run.mts'
import {
  cleanupActivityPubReplayLedger,
  type ReplayCleanupPage,
} from './cleanup-activitypub-replay.mts'
import type { FederationRetentionPage } from './cleanup-federation.types.mts'

import { cleanupActivityPubTerminalIdentities } from './cleanup-activitypub-tombstones.mts'

export type { FederationRetentionPage } from './cleanup-federation.types.mts'
export type FederationRetentionResult = {
  followerDistributions: FederationRetentionPage
  inboxReplay: ReplayCleanupPage
  outboundReplay: ReplayCleanupPage
  terminalFollowIdentities: { deleted: number; hasMore: boolean }
  terminalLikeIdentities: { deleted: number; hasMore: boolean }
}

/** Sweep terminal follower deliveries and both replay ledgers under their respective age gates. */
export async function cleanupFederationRetention(options: {
  batchSize: number
  maxBatches: number
  now?: Date
}): Promise<FederationRetentionResult> {
  assertPositiveInteger(options.batchSize, 'batchSize')
  assertPositiveInteger(options.maxBatches, 'maxBatches')
  const replayOptions = {
    batchSize: options.batchSize,
    maxBatches: options.maxBatches,
    ...(options.now ? { now: options.now } : {}),
  }
  const [page, inboxReplay, outboundReplay, terminalFollowIdentities, terminalLikeIdentities] =
    await Promise.all([
      cleanupSweep(options),
      cleanupActivityPubReplayLedger('inbox', replayOptions),
      cleanupActivityPubReplayLedger('outbound', replayOptions),
      cleanupActivityPubTerminalIdentities('follow', replayOptions),
      cleanupActivityPubTerminalIdentities('like', replayOptions),
    ])
  return {
    followerDistributions: page,
    inboxReplay,
    outboundReplay,
    terminalFollowIdentities,
    terminalLikeIdentities,
  }
}

async function cleanupSweep(options: {
  batchSize: number
  maxBatches: number
  now?: Date
}): Promise<FederationRetentionPage> {
  await using query = await beginTransaction()
  const page = await cleanupSweepWithQuery(options, query)
  await query.commit()
  return page
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`)
  }
}
