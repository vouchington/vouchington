import type { CopyrightSweepIdPage } from '../../../services/copyright-notices/sweep-id-pages.mts'
import { encodeUuidCursorBefore } from '../../modules/pagination/uuid-cursors.mts'

/**
 * Whether one owned ID is in a copyright reconcile sweep, read through the production keyset page
 * that starts at that ID instead of the shared database's global head. The owned ID, when listed,
 * is always the page's only row, so an empty result proves the sweep would skip it.
 */
export async function readTestOwnedCopyrightSweepIds(
  searchPage: (options: { after: string; limit: number }) => Promise<CopyrightSweepIdPage>,
  id: string,
): Promise<string[]> {
  const { results } = await searchPage({ after: encodeUuidCursorBefore(id), limit: 1 })
  return results.filter(result => result === id)
}

/**
 * Walks keyset pages across the owned ID range and returns the owned IDs in query order so tests
 * on a shared database can assert both inclusion and ordering without interference from other rows.
 */
export async function readTestOwnedCopyrightSweepOrder(
  searchPage: (options: { after: string; limit: number }) => Promise<CopyrightSweepIdPage>,
  ownedIds: readonly string[],
): Promise<string[]> {
  if (ownedIds.length === 0) return []
  const sorted = ownedIds.toSorted()
  const owned = new Set(sorted)
  const maxId = sorted.at(-1)!
  const found: string[] = []
  let after = encodeUuidCursorBefore(sorted[0]!)
  for (let pageNumber = 0; pageNumber < 20; pageNumber++) {
    const page = await searchPage({ after, limit: 100 })
    for (const id of page.results) {
      if (owned.has(id)) found.push(id)
    }
    const lastId = page.results.at(-1)
    if (!page.page_info.has_next_page || !page.page_info.end_cursor || !lastId || lastId >= maxId)
      break
    after = page.page_info.end_cursor
  }
  return found
}
