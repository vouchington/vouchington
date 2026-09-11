type ChatSseEventHandler = (eventType: string, rawData: string) => void

export const MAX_CHAT_SSE_FRAME_CHARS = 1024 * 1024

export class ChatSseFrameTooLargeError extends Error {
  constructor() {
    super('Chat stream frame is too large')
    this.name = 'ChatSseFrameTooLargeError'
  }
}

export function createChatSseParser(onEvent: ChatSseEventHandler): {
  flush: () => void
  processChunk: (chunk: string) => void
} {
  let buffer = ''
  let currentEventType = 'message'
  let currentDataLines: string[] = []
  let currentFrameChars = 0

  function dispatchPendingEvent(): void {
    onEvent(currentEventType, currentDataLines.join('\n'))
    currentEventType = 'message'
    currentDataLines = []
    currentFrameChars = 0
  }

  function processLine(line: string): void {
    const normalizedLine = line.endsWith('\r') ? line.slice(0, -1) : line

    if (normalizedLine === '') {
      dispatchPendingEvent()
      return
    }

    if (normalizedLine.startsWith(':')) return

    const colonIndex = normalizedLine.indexOf(':')
    const field = colonIndex === -1 ? normalizedLine : normalizedLine.slice(0, colonIndex)
    const rawValue = colonIndex === -1 ? '' : normalizedLine.slice(colonIndex + 1)
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue

    if (field === 'event') {
      if (value.length > MAX_CHAT_SSE_FRAME_CHARS) throw new ChatSseFrameTooLargeError()
      currentEventType = value || 'message'
    } else if (field === 'data') {
      currentFrameChars += value.length + 1
      if (currentFrameChars > MAX_CHAT_SSE_FRAME_CHARS) throw new ChatSseFrameTooLargeError()
      currentDataLines.push(value)
    }
  }

  return {
    flush() {
      if (buffer) {
        processLine(buffer)
        buffer = ''
      }
      if (currentDataLines.length > 0 || currentEventType !== 'message') {
        dispatchPendingEvent()
      }
    },
    processChunk(chunk: string) {
      let start = 0
      while (true) {
        const newlineIndex = chunk.indexOf('\n', start)
        if (newlineIndex === -1) break
        processLine(buffer + chunk.slice(start, newlineIndex))
        buffer = ''
        start = newlineIndex + 1
      }
      buffer += chunk.slice(start)
      if (buffer.length > MAX_CHAT_SSE_FRAME_CHARS) throw new ChatSseFrameTooLargeError()
    },
  }
}
