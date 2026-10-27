import type { DistributeActivityData } from '@queues/background/enqueues/activitypub-domain'

/** Carry only the page's own persisted checkpoint onto its replacement job. */
export function resumeDistributionPage(
  input: DistributeActivityData,
  retainedData: unknown,
): DistributeActivityData {
  if (
    typeof retainedData !== 'object' ||
    retainedData === null ||
    !('dispatchReceipt' in retainedData)
  ) {
    return input
  }
  const resumed = { ...input, dispatchReceipt: retainedData.dispatchReceipt }
  return resumed
}
