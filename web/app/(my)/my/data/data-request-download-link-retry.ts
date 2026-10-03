import type { DataRequest } from '@/lib/api/client/users'

const DELAY_MS = 5000
const RETRY_LIMIT = 3

interface DownloadLinkRetryOptions {
  isCurrent: () => boolean
  load: () => Promise<DataRequest | null>
  apply: (request: DataRequest | null) => void
  setError: (error: string) => void
}

export function needsDownloadLinkRetry(request: DataRequest | null): boolean {
  return request?.status === 'ready' && !request.download_url
}

export function createDownloadLinkRetry({
  isCurrent,
  load,
  apply,
  setError,
}: DownloadLinkRetryOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let count = 0

  function clear() {
    if (timer !== null) clearTimeout(timer)
    timer = null
    count = 0
  }

  function schedule() {
    if (!isCurrent() || timer !== null) return
    if (count >= RETRY_LIMIT) {
      setError('Your export is ready but the download link could not be fetched. Please refresh.')
      return
    }
    count += 1
    timer = setTimeout(() => {
      timer = null
      if (!isCurrent()) return
      load()
        .then(updated => {
          if (!isCurrent()) return
          if (needsDownloadLinkRetry(updated)) {
            schedule()
            return
          }
          clear()
          apply(updated)
        })
        .catch(() => {
          if (isCurrent()) schedule()
        })
    }, DELAY_MS)
  }

  return { schedule, clear }
}
