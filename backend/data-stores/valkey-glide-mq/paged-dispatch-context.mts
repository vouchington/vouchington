import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import type { JobOptions } from 'glide-mq'

type PageContext = {
  id: string
  target: string
  dedupIds: Set<string>
  checkpoint: (ids: string[]) => Promise<void>
}
const pageContext = new AsyncLocalStorage<PageContext>()

export async function withPagedDispatchPage<T>(
  id: string,
  target: string,
  run: () => Promise<T>,
  checkpoint: PageContext['checkpoint'],
) {
  const context: PageContext = { id, target, dedupIds: new Set(), checkpoint }
  const value = await pageContext.run(context, run)
  return { value, dedupIds: [...context.dedupIds] }
}

export function checkpointPagedDispatchFences(): Promise<void> | undefined {
  const page = pageContext.getStore()
  return page?.checkpoint([...page.dedupIds])
}

/** Stable row identity for terminal-record recovery, only inside the matching paged dispatch. */
export function getPagedDispatchRowJobId(
  queueName: string,
  jobName: string,
  identity: string,
): string | undefined {
  if (pageContext.getStore()?.target !== queueName) return undefined
  return `dispatch_row__${rowIdentity(jobName, identity)}`
}

function rowIdentity(jobName: string, identity: string): string {
  return createHash('sha256').update(`${jobName}:${identity}`).digest('hex')
}

/** Native atomic throttle admission survives removal of completed row records. */
export function pagedDispatchRowOptions(
  queueName: string,
  jobName: string,
  data: unknown,
  options: JobOptions,
): JobOptions {
  const page = pageContext.getStore()
  if (!page || page.target !== queueName) return options
  const identity = options.jobId ?? options.deduplication?.id ?? JSON.stringify(data)
  const rowId = rowIdentity(jobName, identity)
  const dedupId = `dispatch_page__${createHash('sha256').update(`${page.id}:${rowId}`).digest('hex')}`
  page.dedupIds.add(dedupId)
  return {
    ...options,
    jobId: options.jobId ?? `dispatch_row__${rowId}`,
    // This fence covers even the complete high-attempt retry lifetime. The successful page
    // checkpoints before deleting its fields; failed pages keep their atomic admission fences.
    deduplication: { id: dedupId, mode: 'throttle', ttl: Number.MAX_SAFE_INTEGER },
    // A different sweep can reuse the global in-flight identity after this row settles. Page
    // replay remains fenced independently of the row's retention policy.
    removeOnComplete: true,
  }
}
