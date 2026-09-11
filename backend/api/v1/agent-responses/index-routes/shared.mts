import type { AgentResponseEvent, AgentResponseSubscription } from '@data-stores/valkey-pubsub'
import onError from '@modules/on-error'

export const AGENT_RESPONSE_START_FAILED_ERROR = 'The response could not start. Please try again.'

export async function persistAndReportAgentResponseStartFailure(options: {
  error: unknown
  persistFailure: (error: string) => Promise<boolean>
  write: (data: string) => void
  lifecycleSignal: AbortSignal
  subscription?: AgentResponseSubscription
  reportError?: (error: Error) => void
}): Promise<boolean> {
  const error = options.error instanceof Error ? options.error : new Error(String(options.error))
  const reportError = options.reportError ?? onError
  reportError(error)
  const routeWon = await options.persistFailure(AGENT_RESPONSE_START_FAILED_ERROR)
  if (!routeWon) {
    if (options.subscription) {
      await pipeAgentResponseEventsToSSE({
        subscription: options.subscription,
        write: options.write,
        lifecycleSignal: options.lifecycleSignal,
      })
    }
    return false
  }
  if (options.lifecycleSignal.aborted) return true

  try {
    options.write(
      formatAgentEventAsSSE({ type: 'error', error: AGENT_RESPONSE_START_FAILED_ERROR })!,
    )
  } catch {
    // client gone
  }
  return true
}

export function pipeAgentResponseEventsToSSE(options: {
  subscription: AgentResponseSubscription
  write: (data: string) => void
  lifecycleSignal: AbortSignal
}): Promise<void> {
  const { subscription, write, lifecycleSignal } = options

  return new Promise<void>(resolve => {
    if (lifecycleSignal.aborted) {
      resolve()
      return
    }

    let settled = false
    function settle(): void {
      if (settled) return
      settled = true
      lifecycleSignal.removeEventListener('abort', settle)
      subscription.setHandler(null)
      resolve()
    }

    // SSE disconnect does NOT abort the job — client paid quota and can reconnect.
    lifecycleSignal.addEventListener('abort', settle, { once: true })
    if (lifecycleSignal.aborted) {
      settle()
      return
    }

    subscription.setHandler((chunk: AgentResponseEvent) => {
      if (settled) return
      const sseData = formatAgentEventAsSSE(chunk)
      if (sseData) {
        try {
          write(sseData)
        } catch {
          // client gone
        }
      }
      if (chunk.type === 'done' || chunk.type === 'error') settle()
    })
  })
}

export function formatAgentEventAsSSE(fields: AgentResponseEvent): string | null {
  if (!hasAgentResponseEventDiscriminant(fields)) return null

  switch (fields.type) {
    case 'progress': {
      const payload: Record<string, string> = {}
      if (fields.content !== undefined) payload['content'] = fields.content
      if (fields.tool_name !== undefined) payload['tool_name'] = fields.tool_name
      return `event: progress\ndata: ${JSON.stringify(payload)}\n\n`
    }
    case 'summary':
      return `event: summary\ndata: ${JSON.stringify({ content: fields.content ?? '' })}\n\n`
    case 'done':
      return `event: done\ndata: ${JSON.stringify({ content: fields.content ?? '' })}\n\n`
    case 'error':
      return `event: error\ndata: ${JSON.stringify({ error: fields.error ?? 'Unknown error' })}\n\n`
    default:
      assertNever(fields)
  }
}

function hasAgentResponseEventDiscriminant(fields: unknown): fields is AgentResponseEvent {
  if (fields == null || typeof fields !== 'object') return false
  switch ((fields as Record<string, unknown>)['type']) {
    case 'progress':
    case 'summary':
    case 'done':
    case 'error':
      return true
    default:
      return false
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled agent response event: ${JSON.stringify(value)}`)
}
