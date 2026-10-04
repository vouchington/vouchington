import { write } from '@data-stores/psql'
import { getEntityRelationUrlTables } from '../../services/entity-relations/url-tables.mts'

export async function insertTestCrawlDispatchPlanUrls(input: {
  ids: string[]
  hostname: string
  hostnameId: string
  actorId: string
}): Promise<void> {
  await write(
    `/* insertTestCrawlDispatchPlanUrls */
    INSERT INTO urls (id, url, hostname_id, pathname, search_params, created_by_id)
    SELECT id, 'https://' || $2 || '/' || id::text, $3::uuid, '/' || id::text, '{}'::jsonb, $4::uuid
    FROM unnest($1::uuid[]) id ORDER BY id`,
    [input.ids, input.hostname, input.hostnameId, input.actorId],
  )
}

export async function analyzeTestCrawlDispatchPlanTables(): Promise<void> {
  const tables = [
    'urls',
    'url_hostnames',
    'crawls',
    'user_profile_links',
    ...getEntityRelationUrlTables(),
  ]
  await write(
    `/* analyzeTestCrawlDispatchPlanTables */ ANALYZE ${tables.map(table => `"${table}"`).join(', ')}`,
  )
}
