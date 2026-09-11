import {
  beginTransaction,
  write,
  read,
  withTransactionOptions,
  type QueryOptions,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  BLACKLISTS,
  type DomainBlacklistType,
  type DomainBlacklistSourceId,
} from './sources-constants.mts'
export { BLACKLISTS } from './sources-constants.mts'
export type { DomainBlacklistType, DomainBlacklistSourceId } from './sources-constants.mts'

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
      SELECT pg_advisory_xact_lock(hashtext('domain_blacklist_sources'), 0)
    `,
    options,
  )

  await write(
    sql`/* upsertBlacklistSources */
    WITH input AS (
      SELECT source.type, source.name, source.url
      FROM unnest(
        ${types}::domain_blacklist_types[],
        ${names}::text[],
        ${urls}::text[]
      ) AS source(type, name, url)
    )
    MERGE INTO domain_blacklist_sources AS target
    USING input
    ON target.name = input.name
    WHEN MATCHED AND (
      target.type IS DISTINCT FROM input.type
      OR target.url IS DISTINCT FROM input.url
    ) THEN UPDATE SET
      type = input.type,
      url = input.url
    WHEN NOT MATCHED THEN
      INSERT (type, name, url)
      VALUES (input.type, input.name, input.url)
  `,
    options,
  )
}

export const getAllBlacklistSources = async (): Promise<
  Array<{ id: string; name: string; url: string }>
> => {
  const result = await read(sql`/* getAllBlacklistSources */
    SELECT id, name, url FROM domain_blacklist_sources
    ORDER BY id
  `)
  return result.rows
}

export const getBlacklistSourceById = async (
  id: DomainBlacklistSourceId,
): Promise<{ id: string; type: DomainBlacklistType; name: string; url: string } | null> => {
  const result = await read(sql`/* getBlacklistSourceById */
    SELECT id, type, name, url FROM domain_blacklist_sources
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
  const result = await read(sql`/* getSourceCacheHeaders */
    SELECT etag, last_modified_at FROM domain_blacklist_sources
    WHERE id = ${sourceId}
  `)
  return result.rows[0] || null
}

export const updateSourceCacheHeaders = async (
  sourceId: DomainBlacklistSourceId,
  headers: { etag: string | null; lastModifiedAt: Date | null },
): Promise<void> => {
  await write(sql`/* updateSourceCacheHeaders */
    UPDATE domain_blacklist_sources
    SET etag = ${headers.etag},
        last_modified_at = ${headers.lastModifiedAt},
        last_fetched_at = NOW()
    WHERE id = ${sourceId}
  `)
}
