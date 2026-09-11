type OneOffSignal = 'SIGINT' | 'SIGTERM'
type SignalListener = (signal: string) => unknown

type SignalListenerTarget = {
  on(signal: OneOffSignal, listener: SignalListener): unknown
  off(signal: OneOffSignal, listener: SignalListener): unknown
}

const ONE_OFF_SIGNALS = ['SIGINT', 'SIGTERM'] as const satisfies readonly OneOffSignal[]

export type OneOffSignalCancellation = {
  signal: AbortSignal
  removeStandardListener(listener: (signal: string) => Promise<void>): void
  dispose(): void
}

export function installOneOffSignalCancellation(
  target: SignalListenerTarget = process,
): OneOffSignalCancellation {
  const controller = new AbortController()
  const listeners = new Map<OneOffSignal, SignalListener>()

  for (const signal of ONE_OFF_SIGNALS) {
    const listener = () =>
      controller.abort(new Error(`Valkey admin command cancelled by ${signal}`))
    listeners.set(signal, listener)
    target.on(signal, listener)
  }

  return {
    signal: controller.signal,
    removeStandardListener(listener) {
      for (const signal of ONE_OFF_SIGNALS) target.off(signal, listener)
    },
    dispose() {
      for (const [signal, listener] of listeners) target.off(signal, listener)
    },
  }
}
