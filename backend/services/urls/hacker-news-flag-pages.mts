import type { QueryOptions } from '@data-stores/psql/types'
import { write } from '@data-stores/psql'

export async function nextHackerNewsCanonicalAlias(
  urlId: string,
  afterId: string,
  upperId: string,
  options: QueryOptions = {},
) {
  const page = await write<{ id: string }>(
    `/* pageHackerNewsCanonicalAliases */ SELECT id FROM urls WHERE canonical_url_id = $1 AND id > $2 AND id <= $3 ORDER BY id LIMIT 1`,
    [urlId, afterId, upperId],
    options,
  )
  return page.rows[0]?.id
}
