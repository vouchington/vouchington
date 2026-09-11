import { AsyncLocalStorage } from 'node:async_hooks'

export type OpenAIResponseAttempt = { attempt: number; requestStartedAt: Date }

export interface OpenAIResponseAttemptHooks {
  beforeAttempt: (attempt: OpenAIResponseAttempt) => Promise<void>
  onUnknownBilledAttempt: (
    attempt: Omit<OpenAIResponseAttempt, 'attempt'> & { error: unknown },
  ) => Promise<void>
}

const responseAttemptHooksContext = new AsyncLocalStorage<OpenAIResponseAttemptHooks>()

export function getOpenAIResponseAttemptHooks(): OpenAIResponseAttemptHooks | undefined {
  return responseAttemptHooksContext.getStore()
}

export async function runWithOpenAIResponseAttemptHooks<T>(
  hooks: OpenAIResponseAttemptHooks,
  callback: () => Promise<T>,
): Promise<T> {
  return await responseAttemptHooksContext.run(hooks, callback)
}
