import onError from '@modules/on-error'
import type { AnalyticsTableName, AnalyticsTableRegistry } from '@data-stores/analytics'

// Type-only import above is erased; the analytics module is loaded lazily so `@data-stores/psql`
// keeps no static runtime edge to it (dep-cruiser permits the edge either way).
type AnalyticsModule = typeof import('@data-stores/analytics')

let analyticsModule: Promise<AnalyticsModule> | null = null

/**
 * Fire-and-forget analytics emit from the psql data store. Lazily imports the analytics package,
 * caches the promise, and routes any import/emit rejection to `onError` so it never throws into
 * the caller.
 */
export function emitAnalytics<T extends AnalyticsTableName>(
  table: T,
  record: AnalyticsTableRegistry[T],
): void {
  analyticsModule ??= import('@data-stores/analytics')
  void analyticsModule.then(analytics => analytics.emit(table, record)).catch(onError)
}
