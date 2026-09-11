import { ApiError } from '../error'
import type { SupportMessagesResponse } from '@/types/support'

interface PollForSupportDraftOptions {
  existingMessageIds: ReadonlySet<string>
  fetchMessages: () => Promise<SupportMessagesResponse>
  signal?: AbortSignal
  attempts?: number
  wait?: () => Promise<void>
}

function abortSignalRejectReason(signal?: AbortSignal): Error | DOMException {
  const reason = signal?.reason
  if (reason instanceof DOMException) return reason
  if (reason instanceof Error) return reason
  return new DOMException('Aborted', 'AbortError')
}

function waitForNextAttempt(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onAbort = () => {
      if (timer !== null) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(abortSignalRejectReason(signal))
    }
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, 3000)
    signal?.addEventListener('abort', onAbort)
  })
}

function isRetryablePollError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return false
  if (!(error instanceof ApiError)) return true
  return error.status === 429 || error.status >= 500
}

export async function pollForSupportDraft({
  existingMessageIds,
  fetchMessages,
  signal,
  attempts = 20,
  wait = () => waitForNextAttempt(signal),
}: PollForSupportDraftOptions): Promise<SupportMessagesResponse | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted()
    let page: SupportMessagesResponse
    try {
      // oxlint-disable-next-line no-await-in-loop -- each result determines whether this same draft needs one more sequential poll.
      page = await fetchMessages()
    } catch (error) {
      signal?.throwIfAborted()
      if (!isRetryablePollError(error) || attempt + 1 >= attempts) throw error
      // oxlint-disable-next-line no-await-in-loop -- wait before retrying a transient request failure within the bounded polling window.
      await wait()
      continue
    }
    signal?.throwIfAborted()
    if (page.results.some(message => message.drafted_at && !existingMessageIds.has(message.id))) {
      return page
    }
    // oxlint-disable-next-line no-await-in-loop -- wait before the next request to preserve the configured polling interval.
    if (attempt + 1 < attempts) await wait()
  }
  return null
}
