import type { DataRequest } from '@/lib/api/client/users'

export function shouldKeepStreamReconnecting(request: DataRequest | null): boolean {
  return !request || request.status === 'pending' || request.status === 'processing'
}

/** Keep EventSource's native reconnect behavior, replacing only a permanently closed source. */
export function createDataRequestStreamTransport(options: {
  url: string
  isCurrent: () => boolean
  onStatus: (event: MessageEvent) => void
  onError: (source: EventSource) => void
}) {
  let reopenedWithoutEvent = false
  let current = open()

  function open() {
    const source = new EventSource(options.url)
    const onStatus = (event: MessageEvent) => {
      if (options.isCurrent() && current.source === source) reopenedWithoutEvent = false
      options.onStatus(event)
    }
    const onError = () => options.onError(source)
    const onOpen = () => {
      if (options.isCurrent() && current.source === source) reopenedWithoutEvent = false
    }
    source.addEventListener('status', onStatus as EventListener)
    source.addEventListener('error', onError)
    source.addEventListener('open', onOpen)
    return { source, onStatus, onError, onOpen }
  }

  function close(value: ReturnType<typeof open>) {
    value.source.removeEventListener('status', value.onStatus as EventListener)
    value.source.removeEventListener('error', value.onError)
    value.source.removeEventListener('open', value.onOpen)
    value.source.close()
  }

  return {
    isCurrentSource: (source: EventSource) => current.source === source,
    recoverClosed(source: EventSource) {
      if (
        current.source !== source ||
        source.readyState !== EventSource.CLOSED ||
        reopenedWithoutEvent
      )
        return
      reopenedWithoutEvent = true
      close(current)
      current = open()
    },
    close() {
      close(current)
    },
  }
}
