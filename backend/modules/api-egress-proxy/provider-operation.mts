import createHttpError from 'http-errors'
import {
  createOperationTimeoutSignal,
  isTransportTimeoutError,
  withOperationTimeout,
} from '@vouchington/http-transport/fetch'

export const PROVIDER_OPERATION_TIMEOUT_MS = 10_000

// A provider operation gets a fresh local timeout even when it is also constrained by a larger
// request or worker deadline. Reusing the parent signal would make later OAuth stages inherit the
// time spent by earlier stages.
export function createProviderOperationSignal(parentSignal?: AbortSignal): AbortSignal {
  return createOperationTimeoutSignal(PROVIDER_OPERATION_TIMEOUT_MS, parentSignal)
}

export function rethrowProviderTransportError(provider: string, error: unknown): never {
  if (!isTransportTimeoutError(error)) throw error
  throw createHttpError(502, `${provider} OAuth provider request timed out`, { cause: error })
}

export function withProviderOperationTimeout<T>(
  provider: string,
  operation: (signal: AbortSignal) => Promise<T>,
  parentSignal?: AbortSignal,
): Promise<T> {
  return withOperationTimeout(
    {
      timeoutMs: PROVIDER_OPERATION_TIMEOUT_MS,
      signal: parentSignal,
      mapTimeoutError: error =>
        createHttpError(502, `${provider} OAuth provider request timed out`, { cause: error }),
    },
    operation,
  )
}
