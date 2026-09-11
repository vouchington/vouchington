import type { ChatTokenSubscription, TokenChunk } from '@data-stores/valkey-pubsub'
import onError from '@modules/on-error'
import { CHAT_SSE_CYCLE_EXPIRED } from '@agents/chat/stream-lifecycle'

export const CHAT_ENQUEUE_FAILED_ERROR = 'The response could not start. Please try again.'

export async function abortAmbiguousChatEnqueue(
  queue: { signal(jobId: string, name: string): Promise<unknown> },
  jobId: string,
  onSignalError: (err: Error) => void = onError,
): Promise<void> {
  await queue.signal(jobId, CHAT_SSE_CYCLE_EXPIRED).catch(error => {
    onSignalError(toSignalError(error))
  })
}

export async function persistAndReportFailedChatEnqueue(options: {
  queue: { signal(jobId: string, name: string): Promise<unknown> }
  jobId: string
  persistFailure: (error: string) => Promise<boolean>
  write: (data: string) => void
  disconnectSignal: AbortSignal
  onSignalError?: (err: Error) => void
}): Promise<boolean> {
  await abortAmbiguousChatEnqueue(options.queue, options.jobId, options.onSignalError)
  const routeWon = await options.persistFailure(CHAT_ENQUEUE_FAILED_ERROR)
  if (!routeWon || options.disconnectSignal.aborted) return routeWon

  try {
    options.write(formatChunkAsSSE({ type: 'error', error: CHAT_ENQUEUE_FAILED_ERROR })!)
  } catch {
    // client gone
  }
  return true
}

export function pipeChatTokensToSSE(options: {
  subscription: ChatTokenSubscription
  jobId: string
  write: (data: string) => void
  queue: { signal(jobId: string, name: string): Promise<unknown> }
  disconnectSignal: AbortSignal
  onSignalError?: (err: Error) => void
}): Promise<void> {
  const { subscription, jobId, write, queue, disconnectSignal } = options
  const reportSignalError = options.onSignalError ?? onError

  return new Promise<void>(resolve => {
    if (disconnectSignal.aborted) {
      signalChatJob(queue, jobId, disconnectSignal.reason, reportSignalError)
      resolve()
      return
    }

    let settled = false
    function settle(): void {
      if (settled) return
      settled = true
      disconnectSignal.removeEventListener('abort', onAbort)
      subscription.setHandler(null)
      resolve()
    }

    function onAbort(): void {
      if (settled) return
      signalChatJob(queue, jobId, disconnectSignal.reason, reportSignalError)
      settle()
    }

    disconnectSignal.addEventListener('abort', onAbort, { once: true })
    if (disconnectSignal.aborted) {
      onAbort()
      return
    }

    subscription.setHandler((chunk: TokenChunk) => {
      if (settled) return
      const sseData = formatChunkAsSSE(chunk)
      if (sseData) {
        try {
          write(sseData)
        } catch {
          // client gone
        }
      }
      if (chunk['type'] === 'done' || chunk['type'] === 'error') settle()
    })
  })
}

export function formatChunkAsSSE(fields: TokenChunk): string | null {
  const type = fields['type']
  if (!type) return null

  if (type === 'text') {
    return `event: text\ndata: ${JSON.stringify({ content: fields['content'] ?? '' })}\n\n`
  }
  if (type === 'tool_call') {
    return `event: tool_call\ndata: ${JSON.stringify({
      tool_call_id: fields['tool_call_id'],
      name: fields['name'],
      arguments: fields['arguments'],
    })}\n\n`
  }
  if (type === 'tool_result') {
    let result: unknown = fields['result']
    try {
      result = JSON.parse(fields['result'] ?? '')
    } catch {
      // keep raw string
    }
    return `event: tool_result\ndata: ${JSON.stringify({
      tool_call_id: fields['tool_call_id'],
      result,
    })}\n\n`
  }
  if (type === 'subagent_step') {
    return `event: subagent_step\ndata: ${JSON.stringify({
      agent_name: fields['agent_name'],
      tool_name: fields['tool_name'],
      tool_call_id: fields['tool_call_id'],
    })}\n\n`
  }
  if (type === 'subagent_text') {
    return `event: subagent_text\ndata: ${JSON.stringify({
      agent_name: fields['agent_name'],
      tool_call_id: fields['tool_call_id'],
      content: fields['content'] ?? '',
    })}\n\n`
  }
  if (type === 'done') return `event: done\ndata: ${JSON.stringify({})}\n\n`
  if (type === 'error')
    return `event: error\ndata: ${JSON.stringify({ error: fields['error'] })}\n\n`
  return null
}

function signalChatJob(
  queue: { signal(jobId: string, name: string): Promise<unknown> },
  jobId: string,
  reason: unknown,
  onSignalError: (err: Error) => void,
): void {
  const signalName = reason === CHAT_SSE_CYCLE_EXPIRED ? CHAT_SSE_CYCLE_EXPIRED : 'abort'
  queue.signal(jobId, signalName).catch(err => {
    onSignalError(toSignalError(err))
  })
}

function toSignalError(err: unknown): Error {
  if (err instanceof Error) return err
  return new Error(getSignalErrorMessage(err), { cause: err })
}

function getSignalErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: unknown }).message
    if (typeof msg === 'string') return msg
  }
  if (err && typeof err === 'object') {
    try {
      return JSON.stringify(err) ?? String(err)
    } catch {
      return String(err)
    }
  }
  return String(err)
}
