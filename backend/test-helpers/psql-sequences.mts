import type { QueryOptions } from '@data-stores/psql'
import { write } from './fixture-executor.mts'
import sql from './fixture-sql.mts'

export async function getDomainBlacklistSourcesSequenceCurrentValue(
  options: QueryOptions,
): Promise<bigint> {
  const { rows } = await write(
    sql`/* getDomainBlacklistSourcesSequenceCurrentValue */
    SELECT currval('domain_blocklist_sources_id_seq')::bigint AS value
  `,
    options,
  )

  return BigInt(rows[0].value)
}

export async function getMediaTypesSequenceCurrentValue(options: QueryOptions): Promise<bigint> {
  const { rows } = await write(
    sql`/* getMediaTypesSequenceCurrentValue */
    SELECT currval('media_types_id_seq')::bigint AS value
  `,
    options,
  )

  return BigInt(rows[0].value)
}
