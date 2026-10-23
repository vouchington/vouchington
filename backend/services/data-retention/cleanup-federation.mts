import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { cleanupSweepWithQuery } from './cleanup-federation-run.mts'
import {
  cleanupActivityPubReplayLedger,
  type ReplayCleanupPage,
} from './cleanup-activitypub-replay.mts'
import type {
  FederationRetentionPage,
  FederationRetentionScope,
} from './cleanup-federation.types.mts'

export type { FederationRetentionPage } from './cleanup-federation.types.mts'
export type FederationRetentionResult = {
  followerDistributions: FederationRetentionPage
  inboxReplay: ReplayCleanupPage
  outboundReplay: ReplayCleanupPage
}

/** Sweep terminal follower deliveries and both replay ledgers under their respective age gates. */
export async function cleanupFederationRetention(options: {
  batchSize: number
  maxBatches: number
  now?: Date
  borrowedQuery?: TransactionQuery
  scope?: FederationRetentionScope
}): Promise<FederationRetentionResult> {
  assertPositiveInteger(options.batchSize, 'batchSize')
  assertPositiveInteger(options.maxBatches, 'maxBatches')
  if (options.scope && !options.borrowedQuery) {
    throw new TypeError('A scoped federation retention sweep requires a borrowed transaction')
  }
  if (options.borrowedQuery && !options.scope) {
    throw new TypeError('A borrowed federation retention sweep requires a source-row scope')
  }
  const page = options.borrowedQuery
    ? await cleanupSweepWithQuery(options, options.borrowedQuery)
    : await cleanupSweep(options)
  const replayOptions = {
    batchSize: options.batchSize,
    maxBatches: options.maxBatches,
    ...(options.now ? { now: options.now } : {}),
  }
  // Scoped test transactions own only follower rows; replay-ledger cleanup always uses its own
  // committed transaction and is invoked by the normal scheduled path.
  const inboxReplay = options.scope
    ? emptyReplayPage()
    : await cleanupActivityPubReplayLedger('inbox', replayOptions)
  const outboundReplay = options.scope
    ? emptyReplayPage()
    : await cleanupActivityPubReplayLedger('outbound', replayOptions)
  return { followerDistributions: page, inboxReplay, outboundReplay }
}

function emptyReplayPage(): ReplayCleanupPage {
  return { deleted: 0, hasMore: false, continuationPosition: null }
}

async function cleanupSweep(options: {
  batchSize: number
  maxBatches: number
  now?: Date
  scope?: FederationRetentionScope
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
