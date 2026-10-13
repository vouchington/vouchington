import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getCurrencyCodeEnumLabels(): Promise<string[]> {
  const { rows } = await read<{ code: string }>(sql`/* getCurrencyCodeEnumLabels */
    SELECT value.enumlabel AS code
    FROM pg_type type
    JOIN pg_enum value ON value.enumtypid = type.oid
    WHERE type.typname = 'currency_codes'
    ORDER BY value.enumsortorder`)
  return rows.map(row => row.code)
}
