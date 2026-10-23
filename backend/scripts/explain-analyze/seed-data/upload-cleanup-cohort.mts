import { seedUuid } from './common.mts'

export const UPLOAD_CLEANUP_NOISE_ROWS = 180000
export const UPLOAD_CLEANUP_ELIGIBLE_ROWS = 1024
export const UPLOAD_CLEANUP_TOTAL_ROWS =
  UPLOAD_CLEANUP_NOISE_ROWS + 2 * UPLOAD_CLEANUP_ELIGIBLE_ROWS + 3
export const UPLOAD_CLEANUP_PAGE_SIZE = 100
export const UPLOAD_CLEANUP_CUTOFF = '2026-07-02T00:00:00.000000Z'
export const UPLOAD_CLEANUP_MARKER_TIME = '2026-06-30T23:00:00.000000Z'
export const UPLOAD_CLEANUP_ELIGIBLE_TIME = '2026-07-01T02:00:00.000000Z'
export const UPLOAD_CLEANUP_ACTOR_ID = seedUuid(0, 'e6')

export function uploadCleanupSeedId(index: number) {
  return seedUuid(index, 'e5')
}

export function uploadCleanupMarkerId(phase: 'staged' | 'recovery' | 'abandonment') {
  const offset = phase === 'abandonment' ? 2 : 1
  return uploadCleanupSeedId(UPLOAD_CLEANUP_TOTAL_ROWS - 3 + offset)
}
