export const QUEUE_NAME = 'entity-listeners'
export const PRIORITY_DEFAULT = 10
export const PRIORITY_DISPATCHER = 100
export const DEFAULT_RECONCILIATION_INTERVAL_SECONDS = 3600
export function getEntityListenerReconciliationIntervalSeconds(): number {
  const raw = process.env.ENTITY_LISTENER_RECONCILIATION_INTERVAL_SECONDS
  if (!raw) return DEFAULT_RECONCILIATION_INTERVAL_SECONDS
  const seconds = Number(raw)
  if (!Number.isInteger(seconds) || seconds < 300 || seconds > 86_400 || seconds % 60 !== 0) {
    throw new Error(
      'ENTITY_LISTENER_RECONCILIATION_INTERVAL_SECONDS must be a multiple of 60 from 300 to 86400',
    )
  }
  return seconds
}
