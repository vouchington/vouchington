import { CORE_BACKFILLS } from './backfills-core.mts'
import { ACTIVITYPUB_BACKFILLS } from './backfills-activitypub.mts'
import { EXISTING_DISPATCHER_BACKFILLS } from './backfills-existing-dispatchers.mts'
import type { Backfill, BackfillEntry } from './backfills-types.mts'

export type { Backfill }
export const BACKFILL_REGISTRY: BackfillEntry[] = [
  ...ACTIVITYPUB_BACKFILLS,
  ...CORE_BACKFILLS,
  ...EXISTING_DISPATCHER_BACKFILLS,
]
