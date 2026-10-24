import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getMediaTypesSequenceCurrentValue(options: QueryOptions): Promise<bigint> {
  const { rows } = await write(
    sql`/* getMediaTypesSequenceCurrentValue */
    SELECT currval('media_types_id_seq')::bigint AS value
  `,
    options,
  )

  return BigInt(rows[0].value)
}
