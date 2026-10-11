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
    const previous = source.onabort
    const listener = (event?: Event) => {
      abort()
      previous?.call(source, event)
    }
    source.onabort = listener
    detach = () => {
      if (source.onabort === listener) source.onabort = previous
    }
  } else throw new TypeError('AWS request abort signal has no notification API')

  // Cancellation can race with installing the observer.
  if (source.aborted) abort()
  return { signal: controller.signal, detach }
}
