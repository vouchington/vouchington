import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { DomainBlacklistType, DomainBlacklistSourceId } from './sources-constants.mts'

export type { DomainBlacklistType, DomainBlacklistSourceId } from './sources-constants.mts'

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
