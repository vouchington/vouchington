import {
  enqueueCommunityActivityDigestWindows,
  getCommunityActivityDigestDispatchData,
} from '@queues/notifications/enqueues'
import { prepareCommunityActivityDigestWindows } from '@services/notifications/community-activity-digest-dispatch'

type Dependencies = {
  enqueueCommunityActivityDigestWindows: typeof enqueueCommunityActivityDigestWindows
  prepareCommunityActivityDigestWindows: typeof prepareCommunityActivityDigestWindows
}

export async function processCommunityActivityDigestScheduleTick(
  data: { targetWindowStart?: string },
  dependencies: Partial<Dependencies> = {},
): Promise<void> {
  const targetWindowStart =
    data.targetWindowStart ?? getCommunityActivityDigestDispatchData().windowStart
  const prepare =
    dependencies.prepareCommunityActivityDigestWindows ?? prepareCommunityActivityDigestWindows
  const result = await prepare(new Date(targetWindowStart))
  const enqueue =
    dependencies.enqueueCommunityActivityDigestWindows ?? enqueueCommunityActivityDigestWindows
  await enqueue(
    result.windows.map(window => ({
      windowStart: window.windowStart.toISOString(),
      windowEnd: window.windowEnd.toISOString(),
    })),
  )
}
