import { cleanupRetiredSitemapGenerations } from '@services/sitemaps/retired-generation-cleanup'
import { enqueueRetiredSitemapCleanupContinuation } from '@queues/sitemaps/enqueues'

/** Processes one durable retirement page; the next job resumes only if this pass has more work. */
export async function processRetiredSitemapCleanup(now = new Date()): Promise<void> {
  const result = await cleanupRetiredSitemapGenerations(now)
  if (result.hasMore) await enqueueRetiredSitemapCleanupContinuation(result.resumeToken)
}
