import { read } from '@data-stores/psql'

type ParserProbeRow = {
  nullable_text: string | null
  numeric_value: number
  bigint_value: string
  date_value: string
}

/** Exercise the configured pg parsers through the public read adapter. */
export async function readPostgresParserProbeForTest(): Promise<ParserProbeRow> {
  const { rows } = await read<ParserProbeRow>(`/* readPostgresParserProbeForTest */
    SELECT
      NULL::text AS nullable_text,
      1.25::numeric AS numeric_value,
      9223372036854775807::bigint AS bigint_value,
      DATE '2020-02-03' AS date_value
  `)
  const row = rows[0]
  if (!row) throw new Error('PostgreSQL parser probe returned no row')
  return row
}
