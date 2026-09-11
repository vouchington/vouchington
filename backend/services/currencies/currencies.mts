import { read } from '@data-stores/psql'
import {
  decodeCursor,
  encodeCursor,
  isNameCursor,
  parseBoundedIntegerLimit,
} from '@modules/pagination'
import { isCurrencyCode, type Currency } from '@ts-shared/money'
import type { PageInfo } from '@voucha/types/pagination'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'

export type CurrencyPage = {
  results: Currency[]
  page_info: PageInfo
}

export async function listCurrencies(
  options: {
    limit?: number
    after?: string
  } = {},
): Promise<CurrencyPage> {
  const limit = parseBoundedIntegerLimit(options.limit, { default: 25, min: 1, max: 25 })
  let cursorCode: string | null = null
  if (options.after) {
    const cursor = decodeCursor(options.after)
    if (!isNameCursor(cursor) || cursor.id !== cursor.name || !isCurrencyCode(cursor.name)) {
      throw createHttpError(400, 'Invalid currency cursor')
    }
    cursorCode = cursor.name
  }
  const query = sql`/* listCurrencies */
    SELECT code, minor_unit_exponent
    FROM currencies`
  if (cursorCode) query.append(sql` WHERE code > ${cursorCode}`)
  query.append(sql` ORDER BY code ASC LIMIT ${limit + 1}`)

  const { rows } = await read<Currency>(query)
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit)
  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor:
        results.length > 0 ? encodeCursor({ name: results[0]!.code, id: results[0]!.code }) : null,
      end_cursor:
        hasNextPage && results.length > 0
          ? encodeCursor({
              name: results.at(-1)!.code,
              id: results.at(-1)!.code,
            })
          : null,
    },
  }
}
