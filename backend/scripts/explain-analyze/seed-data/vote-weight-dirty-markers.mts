import { write } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuidAtTimestamp } from './common.mts'

const anchorMs = postSeedTimestampMs(0)
const markerStartMs = anchorMs + 120_000
const statusAt = new Date(anchorMs - 60_000)
export const VOTE_WEIGHT_DIRTY_MARKER_AFTER_ID = seedUuidAtTimestamp(markerStartMs - 1, 0)

export async function seedVoteWeightDirtyMarkers(): Promise<void> {
  // A 1,000-id range contains 625 dirty users and mixed partial-index exclusions.
  // Keep it beyond the age milestone's measured window.
  for (let start = 0; start < 1_000; start += 200) {
    const rows: string[] = []
    const values: unknown[] = []
    for (let index = start; index < start + 200; index++) {
      const kind = index % 8
      values.push(
        seedUuidAtTimestamp(markerStartMs + index * 10, 200_000 + index),
        kind === 0 ? statusAt : null,
        kind === 1 ? statusAt : null,
        kind === 2 ? statusAt : null,
      )
      const offset = values.length - 3
      rows.push(
        `($${offset}::uuid, $${offset + 1}::timestamptz, $${offset + 2}::timestamptz, $${offset + 3}::timestamptz)`,
      )
    }
    // no-mistakes-disable-next-line query-reached-per-item: fixed 200-row fixture pages stay below bind limits
    await write(
      `/* seedVoteWeightDispatch */ INSERT INTO users
         (id, deleted_at, vote_weight_admin_set_at, vote_weight_recalculated_at)
       VALUES ${rows.join(', ')} ON CONFLICT (id) DO NOTHING`,
      values,
    )
  }
}
