import { read } from '@data-stores/psql'

export async function readMinimumUuidv7(at: Date): Promise<string> {
  const { rows } = await read<{ id: string }>(
    `/* readMinimumUuidv7 */ SELECT fn_min_uuidv7($1::timestamptz) AS id`,
    [at],
  )
  const id = rows[0]?.id
  if (!id) throw new Error('Minimum UUIDv7 query returned no row')
  return id
}
