import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import {
  beginTransaction,
  readPool,
  type OwnedTransaction,
  type PoolClient,
} from '@data-stores/psql'
import type { DomainBlacklistSourceId } from '@services/urls-domains-blacklist/sources'
import { to as copyTo } from 'pg-copy-streams'
import { sourceMembershipOrderSql } from './membership-copy-sql.mts'
import {
  ReplicaBehindError,
  replicaVersionIsBehind,
  type ReadReplicaSourceVersion,
} from './replica-freshness.mts'
import { parseSourceId } from './sync-utils.mts'

/** Stream one source's membership, already ordered for `comm`. */
export async function copySourceMembership(
  sourceId: DomainBlacklistSourceId,
  destination: string,
  pool: typeof readPool = readPool,
): Promise<void> {
  const id = parseSourceId(sourceId)
  const client = await pool.connect()
  try {
    await copyMembershipFromClient(client, id, destination)
  } finally {
    client.release()
  }
}

/**
 * Read the source version and COPY on one repeatable-read snapshot.
 * A check on another connection can pass after this COPY has already streamed a stale snapshot.
 */
export async function copyFreshSourceMembership(
  sourceId: DomainBlacklistSourceId,
  destination: string,
  writerVersion: string | null,
  pool: typeof readPool = readPool,
  readReplicaSourceVersion?: ReadReplicaSourceVersion,
): Promise<void> {
  await using transaction = await beginTransaction({ client: pool })
  await copyWhenReplicaHasWriterVersion(
    transaction,
    parseSourceId(sourceId),
    destination,
    writerVersion,
    readReplicaSourceVersion ?? readReplicaSourceVersionFromClient,
  )
  await transaction.commit()
}

async function copyWhenReplicaHasWriterVersion(
  transaction: OwnedTransaction,
  sourceId: string,
  destination: string,
  writerVersion: string | null,
  readReplicaSourceVersion: ReadReplicaSourceVersion,
): Promise<void> {
  // The version read and COPY must share one snapshot. READ COMMITTED could advance between them.
  await transaction(
    '/* copyFreshSourceMembership:isolation */ SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
  )
  const replicaVersion = await readReplicaSourceVersion(transaction.client, sourceId, writerVersion)
  if (replicaVersionIsBehind(replicaVersion, writerVersion)) throw new ReplicaBehindError()
  await copyMembershipFromClient(transaction.client, sourceId, destination)
}

async function readReplicaSourceVersionFromClient(
  client: PoolClient,
  sourceId: string,
): Promise<string | null> {
  const { rows } = await client.query<{ version: string }>(
    `/* copyFreshSourceMembership:replicaVersion */
     SELECT xmin::text AS version
     FROM domain_blocklist_sources
     WHERE id = $1::bigint`,
    [sourceId],
  )
  return rows[0]?.version ?? null
}

async function copyMembershipFromClient(
  client: PoolClient,
  sourceIdLiteral: string,
  destination: string,
): Promise<void> {
  const copy = client.query(
    copyTo(
      `/* copySourceMembership */
      COPY (
        ${sourceMembershipOrderSql(sourceIdLiteral)}
      ) TO STDOUT`,
    ),
  )
  await pipeline(copy, createWriteStream(destination))
}
