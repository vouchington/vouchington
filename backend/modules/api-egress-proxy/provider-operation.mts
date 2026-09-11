import createHttpError from 'http-errors'

export const PROVIDER_OPERATION_TIMEOUT_MS = 10_000

const PROVIDER_TIMEOUT_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
])

// A provider operation gets a fresh local timeout even when it is also constrained by a larger
// request or worker deadline. Reusing the parent signal would make later OAuth stages inherit the
// time spent by earlier stages.
export function createProviderOperationSignal(parentSignal?: AbortSignal): AbortSignal {
  const operationSignal = AbortSignal.timeout(PROVIDER_OPERATION_TIMEOUT_MS)
  return parentSignal ? AbortSignal.any([parentSignal, operationSignal]) : operationSignal
}

export function rethrowProviderTransportError(provider: string, error: unknown): never {
  if (!isProviderTransportTimeout(error)) throw error
  throw createHttpError(502, `${provider} OAuth provider request timed out`, { cause: error })
}

export function withProviderOperationTimeout<T>(
  provider: string,
  operation: (signal: AbortSignal) => Promise<T>,
  parentSignal?: AbortSignal,
): Promise<T> {
  const signal = createProviderOperationSignal(parentSignal)
  return raceOperationWithAbort(operation(signal), signal).catch(error =>
    rethrowProviderTransportError(provider, error),
  )
}

function raceOperationWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)
  let removeAbortListener = () => {}
  const aborted = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    removeAbortListener = () => signal.removeEventListener('abort', onAbort)
  })
  return Promise.race([operation, aborted]).finally(removeAbortListener)
}

function isProviderTransportTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return true
  return PROVIDER_TIMEOUT_ERROR_CODES.has(getErrorCode(error.cause) ?? '')
}

function getErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined
  const code = (error as Error & { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}
