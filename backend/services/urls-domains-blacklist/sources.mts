import {
  beginTransaction,
  write,
  read,
  registerPostCommitAction,
  withTransactionOptions,
  type QueryOptions,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import { invalidateSourceHostnameCaches } from './source-cache.mts'
import { enqueueUrlBlocklistRebuild, invalidateUrlBlocklistReadyMarker } from './bloom-filter.mts'
import {
  enqueueEmailBlocklistRebuild,
  invalidateEmailBlocklistReadyMarker,
} from './email-bloom-filter.mts'
import {
  BLACKLISTS,
  type DomainBlacklistType,
  type DomainBlacklistSourceId,
} from './sources-constants.mts'

export type { DomainBlacklistType, DomainBlacklistSourceId } from './sources-constants.mts'

/**
 * @public Documented contract; production use is unconfirmed and this export may be
 * removed after intended-use review. Evidence: `docs/overview/architecture/services/urls-domains-blacklist/README.md`.
 */
export const upsertBlacklistSources = async (options: QueryOptions = {}): Promise<void> => {
  if (BLACKLISTS.length === 0) return

  const run = (query: QueryOptions['query']) => mergeBlacklistSources({ ...options, query })
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  await run(transaction)
  await transaction.commit()
}

async function mergeBlacklistSources(options: QueryOptions): Promise<void> {
  const types = BLACKLISTS.map(s => s.type)
  const names = BLACKLISTS.map(s => s.name)
  const urls = BLACKLISTS.map(s => s.url)

  await write(
    sql`/* lockBlacklistSources */
      SELECT pg_advisory_xact_lock(hashtext('domain_blocklist_sources'), 0)
    `,
    options,
  )

  const changedTypes = await read<{ id: string }>(
    sql`/* upsertBlacklistSources:changedTypes */
      SELECT target.id
      FROM unnest(${types}::domain_blocklist_types[], ${names}::text[]) AS input(type, name)
      JOIN domain_blocklist_sources target ON target.name = input.name
      WHERE target.type IS DISTINCT FROM input.type
    `,
    options,
  )

  await write(
    sql`/* upsertBlacklistSources */
    WITH input AS (
      SELECT source.type, source.name, source.url
      FROM unnest(
        ${types}::domain_blocklist_types[],
        ${names}::text[],
        ${urls}::text[]
      ) AS source(type, name, url)
    )
    MERGE INTO domain_blocklist_sources AS target
    USING input
    ON target.name = input.name
    WHEN MATCHED AND (
      target.type IS DISTINCT FROM input.type
      OR target.url IS DISTINCT FROM input.url
    ) THEN UPDATE SET
      type = input.type,
      url = input.url,
      etag = NULL,
      last_modified_at = NULL
    WHEN NOT MATCHED THEN
      INSERT (type, name, url)
      VALUES (input.type, input.name, input.url)
  `,
    options,
  )
  if (changedTypes.rows.length > 0) {
    registerPostCommitAction(options.query!, async () => {
      await Promise.all([
        invalidateUrlBlocklistReadyMarker(),
        invalidateEmailBlocklistReadyMarker(),
      ])
      await Promise.all([enqueueUrlBlocklistRebuild(), enqueueEmailBlocklistRebuild()])
      await invalidateSourceHostnameCaches(changedTypes.rows.map(row => row.id))
    })
  }
}

export const getAllBlacklistSources = async (): Promise<
  Array<{ id: string; name: string; url: string }>
> => {
  const result = await read<{
    id: string
    name: string
    url: string
  }>(sql`/* getAllBlacklistSources */
    SELECT id, name, url FROM domain_blocklist_sources
    ORDER BY id
  `)
  return result.rows
}

export const getBlacklistSourceById = async (
  id: DomainBlacklistSourceId,
): Promise<{ id: string; type: DomainBlacklistType; name: string; url: string } | null> => {
  const result = await read<{
    id: string
    type: DomainBlacklistType
    name: string
    url: string
  }>(sql`/* getBlacklistSourceById */
    SELECT id, type, name, url FROM domain_blocklist_sources
    WHERE id = ${id}
  `)
  return result.rows[0] || null
}

type SourceCacheHeaders = {
  etag: string | null
  last_modified_at: Date | null
}

export const getSourceCacheHeaders = async (
  sourceId: DomainBlacklistSourceId,
): Promise<SourceCacheHeaders | null> => {
  const result = await read<SourceCacheHeaders>(sql`/* getSourceCacheHeaders */
    SELECT etag, last_modified_at FROM domain_blocklist_sources
    WHERE id = ${sourceId}
  `)
  return result.rows[0] || null
}

export const updateSourceCacheHeaders = async (
  sourceId: DomainBlacklistSourceId,
  headers: { etag: string | null; lastModifiedAt: Date | null },
): Promise<void> => {
  await write(sql`/* updateSourceCacheHeaders */
    UPDATE domain_blocklist_sources
    SET etag = ${headers.etag},
        last_modified_at = ${headers.lastModifiedAt},
        last_fetched_at = NOW()
    WHERE id = ${sourceId}
  `)
}
