import {
  enqueueCommunityActivityDigestDispatch,
  enqueueCommunityActivityDigestScheduleTick,
  getCommunityActivityDigestDispatchData,
} from '@queues/notifications/enqueues'
import {
  claimCommunityActivityDigestWorkItem,
  releaseCommunityActivityDigestWorkItem,
  prepareCommunityActivityDigestWorkItems,
} from '@services/notifications/community-activity-digest-dispatch'

type Dependencies = {
  enqueueCommunityActivityDigestScheduleTick: typeof enqueueCommunityActivityDigestScheduleTick
  enqueueCommunityActivityDigestDispatch: typeof enqueueCommunityActivityDigestDispatch
  prepareCommunityActivityDigestWorkItems: typeof prepareCommunityActivityDigestWorkItems
  claimCommunityActivityDigestWorkItem: typeof claimCommunityActivityDigestWorkItem
  releaseCommunityActivityDigestWorkItem: typeof releaseCommunityActivityDigestWorkItem
}

export async function processCommunityActivityDigestScheduleTick(
  data: { targetWindowStart?: string },
  dependencies?: Partial<Dependencies>,
): Promise<void> {
  const prepare =
    dependencies?.prepareCommunityActivityDigestWorkItems ?? prepareCommunityActivityDigestWorkItems
  const target = getCommunityActivityDigestDispatchData()
  const targetWindowStart = data.targetWindowStart ?? target.windowStart
  const result = await prepare(new Date(targetWindowStart))
  await enqueueWindowsInOrder(result.windows, dependencies)
  if (result.hasMore) {
    const enqueueContinuation =
      dependencies?.enqueueCommunityActivityDigestScheduleTick ??
      enqueueCommunityActivityDigestScheduleTick
    await enqueueContinuation({ targetWindowStart })
  }
}

async function enqueueWindowsInOrder(
  windows: Array<{ windowStart: Date; windowEnd: Date }>,
  dependencies?: Partial<Dependencies>,
): Promise<void> {
  const window = windows[0]
  if (!window) return
  await enqueueAndMarkWindow(window, dependencies)
  await enqueueWindowsInOrder(windows.slice(1), dependencies)
}

async function enqueueAndMarkWindow(
  window: { windowStart: Date; windowEnd: Date },
  dependencies?: Partial<Dependencies>,
): Promise<void> {
  const enqueue =
    dependencies?.enqueueCommunityActivityDigestDispatch ?? enqueueCommunityActivityDigestDispatch
  const mark =
    dependencies?.claimCommunityActivityDigestWorkItem ?? claimCommunityActivityDigestWorkItem
  const leaseToken = await mark(window.windowStart)
  if (!leaseToken) return
  try {
    await enqueue({
      windowStart: window.windowStart.toISOString(),
      windowEnd: window.windowEnd.toISOString(),
      leaseToken,
    })
  } catch (err) {
    const release =
      dependencies?.releaseCommunityActivityDigestWorkItem ?? releaseCommunityActivityDigestWorkItem
    await release(window.windowStart, leaseToken)
    throw err
  }
}
