import { writePool, type PoolClient } from '@data-stores/psql'

/** Retryable. glide-mq backs off while the replica is behind the job's writer LSN. */
export class ReplicaBehindError extends Error {
  constructor() {
    super('Blocklist replica has not replayed the writer LSN captured at job start')
    this.name = 'ReplicaBehindError'
  }
}

export async function readWriterWalLsn(): Promise<string> {
  const { rows } = await writePool.query<{ lsn: string }>(
    `/* readWriterWalLsn */ SELECT pg_current_wal_lsn()::text AS lsn`,
  )
  const lsn = rows[0]?.lsn
  if (!lsn) throw new Error('Writer WAL LSN was not available')
  return lsn
}

/** Same connection that is about to COPY. A primary is not replaying, so it is caught up. */
export async function replicaCoversWriterLsn(
  client: PoolClient,
  writerLsn: string,
): Promise<boolean> {
  const { rows } = await client.query<{ covered: boolean }>(
    `/* syncDomainsWithDatabase:replicaFreshness */
     SELECT CASE
       WHEN NOT pg_is_in_recovery() THEN TRUE
       WHEN pg_last_wal_replay_lsn() IS NULL THEN FALSE
       ELSE pg_lsn_cmp(pg_last_wal_replay_lsn(), $1::pg_lsn) >= 0
     END::boolean AS covered`,
    [writerLsn],
  )
  return rows[0]?.covered ?? false
}
