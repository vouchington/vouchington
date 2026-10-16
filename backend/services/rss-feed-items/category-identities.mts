import type { QueryExecutor } from '@data-stores/psql'

/** Resolve externally supplied labels before inserting their UUID relationships. */
export async function registerRssCategoryIdentities(
  categories: readonly string[],
  query: QueryExecutor,
): Promise<void> {
  if (categories.length === 0) return
  await query(
    `/* registerRssCategoryIdentities */
      INSERT INTO rss_category_identities (category_text)
      SELECT DISTINCT LOWER(TRIM(input.category_text))
      FROM UNNEST($1::text[]) AS input(category_text)
      WHERE TRIM(input.category_text) <> ''
      ORDER BY 1
      ON CONFLICT (category_text) DO NOTHING`,
    [categories],
  )
}
