import type { DataRetentionCleanupResult } from './cleanup-run-result.mts'

export type DataRetentionCleanupFamily = keyof DataRetentionCleanupResult | 'analyticsLocalFiles'
