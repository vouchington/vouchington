import {
  enqueueCommunityActivityDigestDispatch,
  getCommunityActivityDigestDispatchData,
} from '@queues/notifications/enqueues'
import {
  markCommunityActivityDigestDispatchWindowEnqueued,
  prepareCommunityActivityDigestDispatchWindows,
} from '@services/notifications/community-activity-digest-dispatch'

type Dependencies = {
  enqueueCommunityActivityDigestDispatch: typeof enqueueCommunityActivityDigestDispatch
  prepareCommunityActivityDigestDispatchWindows: typeof prepareCommunityActivityDigestDispatchWindows
  markCommunityActivityDigestDispatchWindowEnqueued: typeof markCommunityActivityDigestDispatchWindowEnqueued
}

export async function processCommunityActivityDigestScheduleTick(
  _data: Record<string, never>,
  dependencies?: Partial<Dependencies>,
): Promise<void> {
  const prepare =
    dependencies?.prepareCommunityActivityDigestDispatchWindows ??
    prepareCommunityActivityDigestDispatchWindows
  const target = getCommunityActivityDigestDispatchData()
  const windows = await prepare(new Date(target.windowStart))
  await enqueueWindowsInOrder(windows, dependencies)
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
    dependencies?.markCommunityActivityDigestDispatchWindowEnqueued ??
    markCommunityActivityDigestDispatchWindowEnqueued
  await enqueue({
    windowStart: window.windowStart.toISOString(),
    windowEnd: window.windowEnd.toISOString(),
  })
  await mark(window.windowStart)
}
