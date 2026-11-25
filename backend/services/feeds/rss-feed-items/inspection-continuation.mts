type FeedKey = { cursor_sort_at: string; cursor_id: string }

type PageStatementRow = Record<string, unknown>

function compareKeys(a: FeedKey, b: FeedKey): number {
  if (a.cursor_sort_at !== b.cursor_sort_at) return a.cursor_sort_at < b.cursor_sort_at ? -1 : 1
  if (a.cursor_id !== b.cursor_id) return a.cursor_id < b.cursor_id ? -1 : 1
  return 0
}

const toKey = (row: PageStatementRow): FeedKey => ({
  cursor_sort_at: row.cursor_sort_at as string,
  cursor_id: row.result_id as string,
})

/**
 * Splits the page statement's rows into delivery rows and the stop positions of arms that hit
 * the inspection cap, then resolves the page.
 *
 * Both arms walk newest first, so the combined feed is fully inspected only down to the highest
 * stop among the capped arms (`floor`). A delivery row below it could sit beside uninspected rows
 * of the capped arm, so it is dropped and the continuation is the floor: the next page resumes
 * strictly below it. Without a capped arm the page ends exactly as an uncapped walk would.
 * `has_next_page` stays true for a capped walk even when no row is eligible.
 */
export function resolveInspectedPage(
  rows: PageStatementRow[],
  safeLimit: number,
): { pageRows: PageStatementRow[]; hasNextPage: boolean; inspectedStop: FeedKey | null } {
  let floor: FeedKey | null = null
  for (const row of rows) {
    if (row.row_kind === 'row') continue
    const key = toKey(row)
    if (!floor || compareKeys(key, floor) > 0) floor = key
  }
  const visible = rows
    .filter(row => row.row_kind === 'row' && (!floor || compareKeys(toKey(row), floor) >= 0))
    .toSorted((a, b) => compareKeys(toKey(b), toKey(a)))
  const full = visible.length > safeLimit
  return {
    pageRows: visible.slice(0, safeLimit),
    hasNextPage: full || floor !== null,
    inspectedStop: full ? null : floor,
  }
}
