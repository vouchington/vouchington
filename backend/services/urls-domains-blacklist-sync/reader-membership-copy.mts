import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { readPool } from '@data-stores/psql'
import type { DomainBlacklistSourceId } from '@services/urls-domains-blacklist/sources'
import { to as copyTo } from 'pg-copy-streams'
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
    const copy = client.query(
      copyTo(
        `/* copySourceMembership */
        COPY (
          SELECT domain FROM blocklisted_domains
          WHERE source_id = ${id}::bigint
          ORDER BY domain COLLATE "C"
        ) TO STDOUT`,
      ),
    )
    await pipeline(copy, createWriteStream(destination))
  } finally {
    client.release()
  }
}
