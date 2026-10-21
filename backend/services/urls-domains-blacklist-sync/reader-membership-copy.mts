import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { readPool } from '@data-stores/psql'
import type { DomainBlacklistSourceId } from '@services/urls-domains-blacklist/sources'
import { to as copyTo } from 'pg-copy-streams'
import { parseSourceId } from './sync-utils.mts'

/** Stream one source's membership from the reader, already ordered for `comm`. */
export async function copySourceMembership(
  sourceId: DomainBlacklistSourceId,
  destination: string,
): Promise<void> {
  const id = parseSourceId(sourceId)
  const client = await readPool.connect()
  try {
    // no-mistakes-disable-next-line postgres-required-predicates: source id is a validated integer literal because COPY TO STDOUT cannot bind parameters
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
