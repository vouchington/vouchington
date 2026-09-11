import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type Country = {
  id: number
  code: string
  name: string
}

export async function getCountries(): Promise<Country[]> {
  const { rows } = await read(sql`/* getCountries */
    SELECT id, code, name
    FROM countries
    ORDER BY name ASC
  `)
  return rows as Country[]
}
