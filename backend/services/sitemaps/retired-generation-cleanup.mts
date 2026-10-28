import {
  deleteRetiredSitemapGeneration,
  deleteSitemapObjects,
  getRetiredSitemapCursor,
  getRetiredSitemapGeneration,
  listRetiredSitemapGenerationKeys,
  putRetiredSitemapCursor,
  putRetiredSitemapGeneration,
} from './generation-storage.mts'
import { getSitemapsWorkLimit } from './work-limits.mts'

/** One bounded retirement pass; the nightly dispatcher starts it and continuation jobs drain it. */
export async function cleanupRetiredSitemapGenerations(
  now = new Date(),
): Promise<{ deletedPages: number; hasMore: boolean; resumeToken: string }> {
  const pageBudget = getSitemapsWorkLimit('retired_generation_delete_page_size')
  const recordLimit = getSitemapsWorkLimit('retired_generation_record_scan_limit')
  const afterKey = await getRetiredSitemapCursor()
  const listing = await listRetiredSitemapGenerationKeys(afterKey, recordLimit)
  let lastCompletedKey = afterKey
  let deletedPages = 0
  let interrupted = false
  let partialProgress = ''

  for (const key of listing.keys) {
    // oxlint-disable-next-line no-await-in-loop -- each record consumes the remaining run budget before cursor advance
    const record = await getRetiredSitemapGeneration(key)
    if (!record) {
      lastCompletedKey = key
      continue
    }
    if (record.retire_after > now.toISOString()) {
      lastCompletedKey = key
      continue
    }
    const remainingBudget = pageBudget - deletedPages
    if (remainingBudget === 0) {
      interrupted = true
      break
    }
    const lastPage = Math.min(record.page_count, record.next_page + remainingBudget - 1)
    const pageKeys = Array.from(
      { length: Math.max(0, lastPage - record.next_page + 1) },
      (_, index) => `${record.page_prefix}${record.next_page + index}.xml`,
    )
    // oxlint-disable-next-line no-await-in-loop -- deletion must settle before recording page progress
    await deleteSitemapObjects(pageKeys)
    deletedPages += pageKeys.length
    if (lastPage < record.page_count) {
      // oxlint-disable-next-line no-await-in-loop -- persist the partial page before the next scheduled run
      await putRetiredSitemapGeneration({ ...record, next_page: lastPage + 1 })
      interrupted = true
      partialProgress = `${key}@${lastPage + 1}`
      break
    }
    // oxlint-disable-next-line no-await-in-loop -- remove only the generation whose pages were deleted
    await deleteRetiredSitemapGeneration(key)
    lastCompletedKey = key
  }

  const hasMore = listing.hasMore || interrupted
  await putRetiredSitemapCursor(hasMore ? lastCompletedKey : null)
  // Names the durable state the next job resumes from, so a retried pass derives the same id.
  return { deletedPages, hasMore, resumeToken: `${lastCompletedKey ?? ''}|${partialProgress}` }
}
