import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { readPool, type PoolClient } from '@data-stores/psql'
import type { DomainBlacklistSourceId } from '@services/urls-domains-blacklist/sources'
import { to as copyTo } from 'pg-copy-streams'
import { sourceMembershipOrderSql } from './membership-copy-sql.mts'
import { ReplicaBehindError, replicaCoversWriterLsn } from './replica-freshness.mts'
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
 * Compare replay and COPY on one client. A later check on another connection can
 * pass after this COPY has already streamed a stale snapshot.
 */
export async function copyFreshSourceMembership(
  sourceId: DomainBlacklistSourceId,
  destination: string,
  writerLsn: string,
  pool: typeof readPool = readPool,
): Promise<void> {
  const id = parseSourceId(sourceId)
  const client = await pool.connect()
  try {
    if (!(await replicaCoversWriterLsn(client, writerLsn))) throw new ReplicaBehindError()
    await copyMembershipFromClient(client, id, destination)
  } finally {
    client.release()
  }
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
