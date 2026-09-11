import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Lets a `background: true` createOpenAIResponse() call notify its caller's agent-layer wrapper
 * (callRecordingAgentResponseUsage / callRecordingToolLoopUsage in backend/agents/_shared) as soon
 * as the response id is known, without create-response.mts importing anything from backend/agents
 * or backend/services — createOpenAIResponse only ever invokes whatever hook is currently in
 * scope, and never has to know what it does. Same AsyncLocalStorage idiom as
 * backend/services/bluesky-accounts/session-lifecycle-context.mts.
 */
export interface BackgroundResponseLease {
  stopAndSettle(): Promise<void>
}

export interface BackgroundResponseHooks {
  /** Establishes the durable lease before the drain can advance past `response.created`. */
  onResponseCreated: (responseId: string) => Promise<BackgroundResponseLease | undefined>
}

const backgroundResponseHooksContext = new AsyncLocalStorage<BackgroundResponseHooks>()

export function getBackgroundResponseHooks(): BackgroundResponseHooks | undefined {
  return backgroundResponseHooksContext.getStore()
}

export async function runWithBackgroundResponseHooks<T>(
  hooks: BackgroundResponseHooks,
  callback: () => Promise<T>,
): Promise<T> {
  return await backgroundResponseHooksContext.run(hooks, callback)
}
