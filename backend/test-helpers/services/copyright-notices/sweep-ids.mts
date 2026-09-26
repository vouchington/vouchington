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
