type ProviderObservationLifecycle = {
  cancelled_at: Date | null
  expired_at: Date | null
  past_due_at: Date | null
  paused_at: Date | null
}

export function getTestProviderObservationLifecycle(
  status: 'active' | undefined,
  current: ProviderObservationLifecycle,
): {
  cancelledAt: Date | null
  expiredAt: Date | null
  pastDueAt: Date | null
  pausedAt: Date | null
} {
  if (status === 'active')
    return { cancelledAt: null, expiredAt: null, pastDueAt: null, pausedAt: null }
  return {
    cancelledAt: current.cancelled_at,
    expiredAt: current.expired_at,
    pastDueAt: current.past_due_at,
    pausedAt: current.paused_at,
  }
}
