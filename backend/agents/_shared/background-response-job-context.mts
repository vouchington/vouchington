import { AsyncLocalStorage } from 'node:async_hooks'

/** Mirrors the queue-owned JSON payload without coupling agent code to the queue package. */
export interface JobBackgroundResponse {
  responseId: string
  agentSlug: string
  communityId: string | null
  postId: string | null
  createdAt: string
}

export interface BackgroundResponseJobContext {
  register(response: JobBackgroundResponse): Promise<void>
  settle(responseId: string): Promise<void>
}

const context = new AsyncLocalStorage<BackgroundResponseJobContext>()

export function getBackgroundResponseJobContext(): BackgroundResponseJobContext | undefined {
  return context.getStore()
}

export function runWithBackgroundResponseJob<T>(
  job: BackgroundResponseJobContext,
  callback: () => Promise<T>,
): Promise<T> {
  return context.run(job, callback)
}
