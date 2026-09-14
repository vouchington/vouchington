import { getStripeObjectNumber } from '../event-utils.mts'

export function getStripeTimestamp(subscription: unknown, field: string): Date | undefined {
  const timestamp = getStripeObjectNumber((subscription as Record<string, unknown>)[field])
  return timestamp == null ? undefined : new Date(timestamp * 1000)
}

export function getStripeTerminalTimestamp(subscription: unknown): Date | undefined {
  return (
    getStripeTimestamp(subscription, 'ended_at') ?? getStripeTimestamp(subscription, 'canceled_at')
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
