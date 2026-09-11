import { EXISTING_CORE_DISPATCHER_BACKFILLS } from './backfills-existing-dispatchers-core.mts'
import { EXISTING_RECURRING_DISPATCHER_BACKFILLS } from './backfills-existing-dispatchers-recurring.mts'
import type { BackfillEntry } from './backfills-types.mts'

export const EXISTING_DISPATCHER_BACKFILLS: BackfillEntry[] = [
  ...EXISTING_CORE_DISPATCHER_BACKFILLS,
  ...EXISTING_RECURRING_DISPATCHER_BACKFILLS,
]
