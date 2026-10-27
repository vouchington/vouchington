import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import type { PoolClient } from '@data-stores/psql'
import { from as copyFrom } from 'pg-copy-streams'
import { ADDED_DOMAINS_TABLE, REMOVED_DOMAINS_TABLE } from './sync-cache.mts'

export type MembershipDiffPaths = {
  membershipPath: string
  desiredPath: string
  addedPath: string
  removedPath: string
}

export async function stageBothDiffFiles(
  client: PoolClient,
  addedPath: string,
  removedPath: string,
): Promise<void> {
  await stageDiffFile(client, ADDED_DOMAINS_TABLE, addedPath)
  await stageDiffFile(client, REMOVED_DOMAINS_TABLE, removedPath)
}

async function stageDiffFile(client: PoolClient, table: string, path: string): Promise<void> {
  await client.query(
    `/* syncDomainsWithDatabase */ CREATE TEMP TABLE ${table} (domain TEXT NOT NULL)`,
  )
  const copyStream = client.query(
    copyFrom(`/* syncDomainsWithDatabase */ COPY ${table} (domain) FROM STDIN`),
  )
  await pipeline(createReadStream(path), copyStream)
  await client.query(`/* syncDomainsWithDatabase */ CREATE INDEX ON ${table} (domain)`)
}
