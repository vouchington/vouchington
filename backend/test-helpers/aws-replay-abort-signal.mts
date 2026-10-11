type AwsAbortSignal = {
  readonly aborted: boolean
  readonly reason?: unknown
  onabort?: ((event?: Event) => void) | null
  addEventListener?: AbortSignal['addEventListener']
  removeEventListener?: AbortSignal['removeEventListener']
}

/** Smithy accepts native, cross-realm EventTarget, and legacy onabort signals. */
export function observeAwsReplayAbort(value: unknown): {
  signal: AbortSignal | undefined
  detach: () => void
} {
  if (value == null) return { signal: undefined, detach: () => {} }
  if (value instanceof AbortSignal) return { signal: value, detach: () => {} }
  if (typeof value !== 'object' || !('aborted' in value) || typeof value.aborted !== 'boolean')
    throw new TypeError('Invalid AWS request abort signal')

  const source = value as AwsAbortSignal
  const controller = new AbortController()
  const abort = () => controller.abort(source.reason)
  if (source.aborted) {
    abort()
    return { signal: controller.signal, detach: () => {} }
  }

  let detach: () => void
  if (
    typeof source.addEventListener === 'function' &&
    typeof source.removeEventListener === 'function'
  ) {
    source.addEventListener('abort', abort, { once: true })
    detach = () => source.removeEventListener!('abort', abort)
  } else if ('onabort' in source) {
    detach = observeLegacyAbort(source, abort)
  } else throw new TypeError('AWS request abort signal has no notification API')

  // Cancellation can race with installing the observer.
  if (source.aborted) abort()
  return { signal: controller.signal, detach }
}

type LegacyAbortObservers = {
  callbacks: Set<() => void>
  previous: AwsAbortSignal['onabort']
  listener: (event?: Event) => void
}
const legacyObservers = new WeakMap<AwsAbortSignal, LegacyAbortObservers>()

function observeLegacyAbort(source: AwsAbortSignal, abort: () => void): () => void {
  let state = legacyObservers.get(source)
  if (!state || source.onabort !== state.listener) {
    const previous = source.onabort
    const callbacks = new Set<() => void>()
    const listener = (event?: Event) => {
      for (const callback of callbacks) callback()
      previous?.call(source, event)
    }
    state = { callbacks, previous, listener }
    legacyObservers.set(source, state)
    source.onabort = listener
  }
  const observed = state
  observed.callbacks.add(abort)
  return () => {
    observed.callbacks.delete(abort)
    if (observed.callbacks.size > 0) return
    if (source.onabort === observed.listener) source.onabort = observed.previous
    if (legacyObservers.get(source) === observed) legacyObservers.delete(source)
  }
}
