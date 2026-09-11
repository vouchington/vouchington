import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getDomainBlacklistSourcesSequenceCurrentValue(
  options: QueryOptions,
): Promise<bigint> {
  const { rows } = await write(
    sql`/* getDomainBlacklistSourcesSequenceCurrentValue */
    SELECT currval('domain_blacklist_sources_id_seq')::bigint AS value
  `,
    options,
  )

  return BigInt(rows[0].value)
}

export async function getUrlContentTypesSequenceCurrentValue(
  options: QueryOptions,
): Promise<bigint> {
  const { rows } = await write(
    sql`/* getUrlContentTypesSequenceCurrentValue */
    SELECT currval('url_content_types_id_seq')::bigint AS value
  `,
    options,
  )

  return BigInt(rows[0].value)
}
