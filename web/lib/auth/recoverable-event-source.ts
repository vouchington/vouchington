/** Preserve native reconnects and replace a permanently closed authenticated stream once. */
export function createRecoverableEventSource(options: {
  url: string
  eventName: string
  isCurrent: () => boolean
  onEvent: (event: MessageEvent) => void
  onError: (source: EventSource, event: Event) => void
}) {
  let reopenedWithoutEvent = false
  let current = open()

  function open() {
    const source = new EventSource(options.url)
    const onEvent = (event: MessageEvent) => {
      if (options.isCurrent() && current.source === source) reopenedWithoutEvent = false
      options.onEvent(event)
    }
    const onError = (event: Event) => options.onError(source, event)
    const onOpen = () => {
      if (options.isCurrent() && current.source === source) reopenedWithoutEvent = false
    }
    source.addEventListener(options.eventName, onEvent as EventListener)
    source.addEventListener('error', onError)
    source.addEventListener('open', onOpen)
    return { source, onEvent, onError, onOpen }
  }

  function close(value: ReturnType<typeof open>) {
    value.source.removeEventListener(options.eventName, value.onEvent as EventListener)
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
