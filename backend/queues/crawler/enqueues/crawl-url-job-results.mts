import { crawlUrls } from '../queues.mts'
import type { CrawlUrlJobResult } from '../enqueues.mts'

const CRAWL_URL_WAIT_POLL_MS = 250

export async function waitForCrawlUrlJobResult(
  jobId: string,
  waitTimeoutMs: number,
): Promise<CrawlUrlJobResult | null> {
  const deadline = Date.now() + waitTimeoutMs
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- each bounded poll must observe the latest state before deciding whether to stop
    const job = await crawlUrls.getJob(jobId)
    if (!job) return null
    if (job.finishedOn != null) {
      const replacementJobId = getReplacementCrawlUrlJobId(job.returnvalue)
      if (replacementJobId) {
        return waitForCrawlUrlJobResult(replacementJobId, Math.max(0, deadline - Date.now()))
      }
      if (job.failedReason) throw new Error(job.failedReason)
      return normalizeCrawlUrlJobResult(job.returnvalue)
    }
    // oxlint-disable-next-line no-await-in-loop -- the delay throttles each subsequent state read within the bounded poll
    await wait(CRAWL_URL_WAIT_POLL_MS)
  }
  return null
}

function getReplacementCrawlUrlJobId(value: unknown): string | null {
  if (value == null || typeof value !== 'object') return null
  const replacementJobId = (value as { replacement_job_id?: unknown }).replacement_job_id
  return typeof replacementJobId === 'string' && replacementJobId ? replacementJobId : null
}

function normalizeCrawlUrlJobResult(value: unknown): CrawlUrlJobResult | null {
  if (value == null || typeof value !== 'object') return null
  const result = value as Partial<CrawlUrlJobResult>
  if (
    typeof result.url_id !== 'string' ||
    typeof result.crawl_id !== 'string' ||
    typeof result.response_status_code !== 'number'
  ) {
    return null
  }
  return {
    url_id: result.url_id,
    crawl_id: result.crawl_id,
    response_status_code: result.response_status_code,
  }
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
