import {
  listPendingImageQuarantinePage,
  processPendingImageQuarantinePage,
} from './delete-flagged.mts'

/** Select one global bounded page; the same consumer owns every quarantine attempt. */
export async function reconcilePendingImageQuarantines(): Promise<{ reconciled: number }> {
  return processPendingImageQuarantinePage(await listPendingImageQuarantinePage())
}
