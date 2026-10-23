import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import type { PoolClient } from '@data-stores/psql'
import { from as copyFrom } from 'pg-copy-streams'
import type { DomainBlacklistSourceId } from '@services/urls-domains-blacklist/sources'
import { ADDED_DOMAINS_TABLE, REMOVED_DOMAINS_TABLE } from './sync-cache.mts'
import { writeCommDiff } from './diff-files.mts'
import { copySourceMembership } from './reader-membership-copy.mts'

export type MembershipDiffPaths = {
  membershipPath: string
  desiredPath: string
  addedPath: string
  removedPath: string
}

/** Copy reader membership and compute both diff files before taking the source lock. */
export async function prepareMembershipDiff(
  sourceId: DomainBlacklistSourceId,
  paths: MembershipDiffPaths,
): Promise<void> {
  await copySourceMembership(sourceId, paths.membershipPath)
  await writeCommDiff(paths)
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
  // no-mistakes-disable-next-line postgres-required-predicates: COPY FROM STDIN loads one diff file into a temporary staging table
  const copyStream = client.query(
    copyFrom(`/* syncDomainsWithDatabase */ COPY ${table} (domain) FROM STDIN`),
  )
  await pipeline(createReadStream(path), copyStream)
  await client.query(`/* syncDomainsWithDatabase */ CREATE INDEX ON ${table} (domain)`)
}
