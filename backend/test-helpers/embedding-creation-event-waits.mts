export type OwnedQueueEventName = 'added' | 'delay-changed' | 'completed' | 'failed'

/** Tracks real queue stream events and gives each pending event waiter a terminal error path. */
export function createOwnedQueueEventWaits() {
  const history = new Map<string, Map<OwnedQueueEventName, number>>()
  const waits = new Set<{
    id: string
    event: OwnedQueueEventName
    occurrence: number
    resolve(): void
    reject(error: unknown): void
  }>()
  let eventError: unknown
  let hasEventError = false

  return {
    onError: (error: unknown) => {
      eventError = error
      hasEventError = true
      for (const wait of waits) wait.reject(error)
      waits.clear()
    },
    record: (id: string, event: OwnedQueueEventName) => {
      const counts = history.get(id) ?? new Map<OwnedQueueEventName, number>()
      counts.set(event, (counts.get(event) ?? 0) + 1)
      history.set(id, counts)
      for (const wait of waits)
        if (wait.id === id && wait.event === event && (counts.get(event) ?? 0) >= wait.occurrence) {
          waits.delete(wait)
          wait.resolve()
        }
    },
    history: () => [...history].map(([id, counts]) => ({ id, events: Object.fromEntries(counts) })),
    pending: () => [...waits].map(({ id, event, occurrence }) => ({ id, event, occurrence })),
    error: () => ({ present: hasEventError, value: eventError }),
    close: () => {
      for (const wait of waits) wait.reject(new Error('Owned embedding queue closed'))
      waits.clear()
    },
    waitFor: (id: string, event: OwnedQueueEventName, occurrence = 1): Promise<void> => {
      if (hasEventError)
        return Promise.reject(
          eventError instanceof Error
            ? eventError
            : new AggregateError([eventError], 'Owned queue SDK failed', { cause: eventError }),
        )
      if ((history.get(id)?.get(event) ?? 0) >= occurrence) return Promise.resolve()
      const completion = Promise.withResolvers<void>()
      void completion.promise.catch(() => {})
      waits.add({ id, event, occurrence, ...completion })
      return completion.promise
    },
  }
}
