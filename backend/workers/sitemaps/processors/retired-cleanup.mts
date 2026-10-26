import { cleanupRetiredSitemapGenerations } from '@services/sitemaps/retired-generation-cleanup'
import { enqueueRetiredSitemapCleanupContinuation } from '@queues/sitemaps/enqueues'

const retiredSitemapCleanupDependencies = {
  cleanupRetiredSitemapGenerations,
  enqueueRetiredSitemapCleanupContinuation,
}

/** Processes one durable retirement page; the next job resumes only if this pass has more work. */
export async function processRetiredSitemapCleanup(
  dependencies: Pick<
    typeof retiredSitemapCleanupDependencies,
    'cleanupRetiredSitemapGenerations' | 'enqueueRetiredSitemapCleanupContinuation'
  > = retiredSitemapCleanupDependencies,
  now = new Date(),
): Promise<void> {
  const result = await dependencies.cleanupRetiredSitemapGenerations(now)
  if (result.hasMore) await dependencies.enqueueRetiredSitemapCleanupContinuation()
}
