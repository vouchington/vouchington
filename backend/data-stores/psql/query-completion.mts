import { AsyncLocalStorage } from 'node:async_hooks'
import onError from '@modules/on-error'
import type { QueryExecutor } from './types.mts'
const completionAudiences = new AsyncLocalStorage<CompletionAudience>()

/** Normal scoped capture owns diagnostics; callers explicitly drain unfinished work. */
export async function runWithQueryCompletionDiagnostics<Result>(
  handler: (
    context: Pick<
      ReturnType<typeof createQueryCompletionAudience>,
      'subscribe' | 'report' | 'deactivate'
    >,
  ) => Promise<Result>,
) {
  const audience = createQueryCompletionAudience()
  try {
    const result = await completionAudiences.run(audience.scope, () => handler(audience))
    audience.deactivate()
    return {
      result,
      completedTransactions: Object.freeze([...audience.completed]),
      completionDrain: audience.close(),
    }
  } catch (err) {
    void audience.close()
    throw err
  }
}

export function reportQueryCaptureFailure(reason: unknown): boolean {
  const audience = completionAudiences.getStore()
  if (!audience?.active) return false
  audience.report(reason)
  return true
}
export type QueryCompletion = {
  text: string
  values: readonly unknown[]
  executor: QueryExecutor
  promise: ReturnType<QueryExecutor>
} & ({ status: 'fulfilled' } | { status: 'rejected'; reason: unknown })
type ErrorSummary = Readonly<{ name: string; message: string }>
type TransactionSnapshot = Readonly<{
  text: string
  values: readonly unknown[]
  status: 'fulfilled' | 'rejected'
  error?: ErrorSummary
}>
type CompletionAudience = {
  active: boolean
  pending: Set<Promise<unknown>>
  listeners: Set<(event: QueryCompletion) => undefined>
  completed: TransactionSnapshot[]
  report: (reason: unknown) => undefined
}

function errorSummary(reason: unknown): ErrorSummary {
  try {
    const summary: { name: unknown; message: unknown } =
      reason instanceof Error
        ? { name: reason.name, message: reason.message }
        : { name: 'Error', message: String(reason) }
    return Object.freeze({
      name: typeof summary.name === 'string' ? summary.name : 'Error',
      message:
        typeof summary.message === 'string' ? summary.message : 'Unreadable diagnostic error',
    })
  } catch {
    return Object.freeze({ name: 'Error', message: 'Unreadable diagnostic error' })
  }
}

function createQueryCompletionAudience() {
  const errors: ErrorSummary[] = []
  const pending = new Set<Promise<unknown>>()
  const report = (reason: unknown): undefined => {
    errors.push(errorSummary(reason))
    try {
      onError(new Error('Query completion diagnostic failed', { cause: reason }))
    } catch (err) {
      errors.push(errorSummary(err))
    }
    return undefined
  }
  const audience: CompletionAudience = {
    active: true,
    pending,
    listeners: new Set(),
    completed: [],
    report,
  }
  let closing: Promise<readonly ErrorSummary[]> | undefined
  return {
    scope: audience,
    completed: audience.completed,
    report,
    subscribe(listener: (event: QueryCompletion) => undefined) {
      if (audience.active) audience.listeners.add(listener)
      return () => {
        audience.listeners.delete(listener)
      }
    },
    deactivate: () => {
      audience.active = false
      audience.listeners.clear()
    },
    close: (): Promise<readonly ErrorSummary[]> => {
      audience.active = false
      audience.listeners.clear()
      closing ??= (async () => {
        // oxlint-disable-next-line no-await-in-loop -- settlement may add reporting work; drain that owned batch next.
        while (pending.size) await Promise.allSettled([...pending])
        return Object.freeze([...errors])
      })()
      return closing
    },
  }
}

function freezeDiagnosticValues(value: unknown): void {
  if (!value || typeof value !== 'object') return
  for (const child of Object.values(value)) freezeDiagnosticValues(child)
  Object.freeze(value)
}
export function observeQueryCompletion(
  executor: QueryExecutor,
  args: Parameters<QueryExecutor>,
  promise: ReturnType<QueryExecutor>,
): void {
  const audience = completionAudiences.getStore()
  if (!audience?.active) return
  audience.pending.add(promise)
  let metadata: Omit<QueryCompletion, 'status' | 'reason'> | undefined
  try {
    const [input, values] = args
    metadata = {
      text: typeof input === 'string' ? input : input.text,
      values: Object.freeze([
        ...(typeof input === 'string' ? (values ?? []) : (input.values ?? [])),
      ]),
      executor,
      promise,
    }
  } catch (err) {
    audience.report(err)
  }
  let snapshotValues: readonly unknown[] | undefined
  try {
    if (metadata) {
      snapshotValues = JSON.parse(JSON.stringify(metadata.values)) as unknown[]
      freezeDiagnosticValues(snapshotValues)
    }
  } catch (err) {
    audience.report(err)
  }
  const settled = (status: 'fulfilled' | 'rejected', reason?: unknown): undefined => {
    audience.pending.delete(promise)
    if (!audience.active || !metadata) return undefined
    try {
      const event: QueryCompletion =
        status === 'fulfilled' ? { ...metadata, status } : { ...metadata, status, reason }
      if (snapshotValues)
        audience.completed.push(
          Object.freeze({
            text: event.text,
            values: snapshotValues,
            status,
            ...(status === 'rejected' ? { error: errorSummary(reason) } : {}),
          }),
        )
      for (const listener of [...audience.listeners]) {
        if (!audience.active || !audience.listeners.has(listener)) continue
        try {
          const returned: unknown = listener(Object.freeze(event))
          if (returned !== undefined) {
            const diagnostic = Promise.resolve(returned).then(undefined, audience.report)
            audience.pending.add(diagnostic)
            void diagnostic.then(() => audience.pending.delete(diagnostic))
          }
        } catch (err) {
          audience.report(err)
        }
      }
    } catch (err) {
      audience.report(err)
    }
    return undefined
  }
  try {
    void promise.then(
      () => settled('fulfilled'),
      err => settled('rejected', err),
    )
  } catch (err) {
    audience.pending.delete(promise)
    audience.report(err)
  }
}
