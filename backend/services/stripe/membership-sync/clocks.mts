import { getStripeObjectTimestamp } from '@vouchington/stripe'

export function getStripeTerminalTimestamp(subscription: unknown): Date | undefined {
  const record = subscription as Record<string, unknown>
  return (
    getStripeObjectTimestamp(record.ended_at) ??
    getStripeObjectTimestamp(record.canceled_at) ??
    undefined
  )
}

export function normalizeProviderEffectiveAt(
  effectiveAt: Date | undefined,
  expiresAt: Date | null | undefined,
  terminalEffectiveAt: Date | undefined,
  currentEffectiveAt: Date,
): Date {
  const baseline = effectiveAt ?? currentEffectiveAt
  return [expiresAt, terminalEffectiveAt].reduce<Date>((earliest, candidate) => {
    return candidate && candidate < earliest ? candidate : earliest
  }, baseline)
}
